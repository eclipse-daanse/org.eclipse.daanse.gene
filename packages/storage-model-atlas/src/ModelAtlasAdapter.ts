/**
 * ModelAtlasAdapter - Storage adapter for Model Atlas server
 *
 * Maps Model Atlas concepts to Gene's file/folder tree:
 *
 *  Atlas Scope (repository root)
 *  ├── schema/                     (registry folder)
 *  │   ├── draft/                  (stage folder)
 *  │   │   ├── MyModel.ecore       (schema as file)
 *  │   │   └── OtherModel.ecore
 *  │   ├── review/
 *  │   └── release/
 *  └── <registryName>/             (custom registry folders)
 *      ├── draft/
 *      │   ├── obj1.xmi
 *      │   └── obj2.xmi
 *      └── release/
 *
 * Uses EMFTs-generated classes for XMI parsing of API responses.
 */

import {
  BaseStorageAdapter,
  type ConnectionOptions,
  type SyncResult,
  type Repository,
  type File,
  type Folder,
  StorageFactory,
  RepositoryState,
  getFileState
} from 'storage-core'

import { ModelAtlasClient } from './ModelAtlasClient'
import type { AtlasConfig } from './types'
import type { ObjectMetadata } from './generated/management'
import type { Scope, Registry, Stage } from './generated/workflowapi'
import {
  parseScopeXmi,
  parseMetadataListXmi,
  parseMetadataXmi
} from './AtlasResourceSet'

export interface AtlasConnectionOptions extends ConnectionOptions {
  baseUrl: string
  scopeName: string
  token?: string
}

interface AtlasFileInfo {
  registry: string
  stage: string
  objectId: string
  metadata?: ObjectMetadata
  readOnly: boolean
  isSchema: boolean
}

export class ModelAtlasAdapter extends BaseStorageAdapter {
  readonly type = 'model-atlas'
  readonly displayName = 'Model Atlas'

  private clients: Map<string, ModelAtlasClient> = new Map()
  private configs: Map<string, AtlasConfig> = new Map()
  private fileInfoMap: Map<string, Map<string, AtlasFileInfo>> = new Map()

  canHandle(repository: Repository): boolean {
    return 'scopeName' in repository && 'atlasBaseUrl' in repository
  }

  async connect(repository: Repository, options?: AtlasConnectionOptions): Promise<void> {
    try {
      repository.state = RepositoryState.CONNECTING

      const config: AtlasConfig = {
        baseUrl: (repository as any).atlasBaseUrl || options?.baseUrl || '',
        scopeName: (repository as any).scopeName || options?.scopeName || '',
        token: (repository as any).atlasToken || options?.token
      }

      if (!config.baseUrl || !config.scopeName) {
        throw new Error('Model Atlas requires baseUrl and scopeName')
      }

      const client = new ModelAtlasClient({
        baseUrl: config.baseUrl,
        token: config.token
      })

      // Get scope as XMI, parse with EMFTs
      const scopeXmi = await client.getScope(config.scopeName)
      if (!scopeXmi) {
        throw new Error(`Scope '${config.scopeName}' not found on server`)
      }

      const scope = parseScopeXmi(scopeXmi)
      if (!scope) {
        throw new Error(`Failed to parse scope '${config.scopeName}' from server response`)
      }

      this.clients.set(repository.uri, client)
      this.configs.set(repository.uri, config)
      this.fileInfoMap.set(repository.uri, new Map())

      await this.buildTree(repository, client, config, scope)

      repository.state = RepositoryState.CONNECTED
      repository.errorMessage = ''
    } catch (error) {
      repository.state = RepositoryState.ERROR
      repository.errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw error
    }
  }

  /**
   * Build the file tree from the parsed Scope EObject.
   * Uses registries and stages from the scope metadata.
   */
  private async buildTree(
    repository: Repository,
    client: ModelAtlasClient,
    config: AtlasConfig,
    scope: Scope
  ): Promise<void> {
    const factory = StorageFactory.eINSTANCE
    const infoMap = this.fileInfoMap.get(repository.uri)!

    const root = factory.createFolder()
    root.name = config.scopeName
    root.path = '/'
    repository.root = root

    // Get registries from scope (real data from server)
    const registries: Registry[] = scope.registries || []

    // Always include 'schema' registry
    const registryNames = registries.map(r => r.name)
    if (!registryNames.includes('schema')) {
      registryNames.unshift('schema')
    }

    for (const registryName of registryNames) {
      const registryFolder = factory.createFolder()
      registryFolder.name = registryName
      registryFolder.path = `/${registryName}`
      registryFolder.parent = root
      root.children.push(registryFolder)

      // Get stages from registry definition, or use defaults
      const registry = registries.find(r => r.name === registryName)
      const stages: string[] = registry?.stages?.map((s: Stage) => s.name) || ['draft', 'review', 'approved', 'release']

      for (const stageName of stages) {
        const stageFolder = factory.createFolder()
        stageFolder.name = stageName
        stageFolder.path = `/${registryName}/${stageName}`
        stageFolder.parent = registryFolder
        registryFolder.children.push(stageFolder)

        try {
          if (registryName === 'schema') {
            await this.loadSchemaFiles(client, config, stageName, stageFolder, factory, infoMap)
          } else {
            await this.loadObjectFiles(client, config, registryName, stageName, stageFolder, factory, infoMap)
          }
        } catch {
          // Stage might not exist - skip silently
        }
      }
    }
  }

  /**
   * Load schema packages as files using EMFTs to parse metadata XMI
   */
  private async loadSchemaFiles(
    client: ModelAtlasClient,
    config: AtlasConfig,
    stage: string,
    parent: Folder,
    factory: typeof StorageFactory.eINSTANCE,
    infoMap: Map<string, AtlasFileInfo>
  ): Promise<void> {
    const xmi = await client.listSchemas(config.scopeName, stage)
    const metadataList = parseMetadataListXmi(xmi)

    for (const meta of metadataList) {
      const fileName = this.schemaFileName(meta)
      const filePath = `${parent.path}/${fileName}`

      const file = factory.createFile()
      file.name = fileName
      file.path = filePath
      file.hash = meta.contentHash || ''
      file.mimeType = 'application/xml'
      file.state = getFileState('UNLOADED')
      file.parent = parent
      parent.children.push(file)

      infoMap.set(filePath, {
        registry: 'schema',
        stage,
        objectId: meta.objectId,
        metadata: meta,
        readOnly: meta.isReadOnly || false,
        isSchema: true
      })
    }
  }

  /**
   * Load registry objects as files using EMFTs to parse metadata XMI
   */
  private async loadObjectFiles(
    client: ModelAtlasClient,
    config: AtlasConfig,
    registryName: string,
    stage: string,
    parent: Folder,
    factory: typeof StorageFactory.eINSTANCE,
    infoMap: Map<string, AtlasFileInfo>
  ): Promise<void> {
    const xmi = await client.listObjects(config.scopeName, registryName, stage)
    const metadataList = parseMetadataListXmi(xmi)

    for (const meta of metadataList) {
      const fileName = this.objectFileName(meta)
      const filePath = `${parent.path}/${fileName}`

      const file = factory.createFile()
      file.name = fileName
      file.path = filePath
      file.hash = meta.contentHash || ''
      file.mimeType = 'application/xml'
      file.state = getFileState('UNLOADED')
      file.parent = parent
      parent.children.push(file)

      infoMap.set(filePath, {
        registry: registryName,
        stage,
        objectId: meta.objectId,
        metadata: meta,
        readOnly: meta.isReadOnly || false,
        isSchema: false
      })
    }
  }

  private schemaFileName(meta: ObjectMetadata): string {
    if (meta.objectName) return `${meta.objectName}.ecore`
    const parts = meta.objectId.split('/').filter(Boolean)
    const name = parts.find(p => !p.includes('.') && !p.match(/^\d/)) || parts[parts.length - 1] || 'Unknown'
    return `${name}.ecore`
  }

  private objectFileName(meta: ObjectMetadata): string {
    if (meta.objectName) return `${meta.objectName}.xmi`
    return `${meta.objectId}.xmi`
  }

  async disconnect(repository: Repository): Promise<void> {
    this.clients.delete(repository.uri)
    this.configs.delete(repository.uri)
    this.fileInfoMap.delete(repository.uri)
    repository.state = RepositoryState.DISCONNECTED
  }

  async list(repository: Repository, folder: Folder): Promise<void> {
    // Tree is already loaded during connect
  }

  async read(repository: Repository, file: File): Promise<string> {
    const client = this.getClient(repository)
    const config = this.getConfig(repository)
    const info = this.getFileInfo(repository, file)

    if (!info) throw new Error(`No Atlas metadata for file: ${file.path}`)

    let content: string | null = null

    if (info.isSchema) {
      content = await client.getSchemaContent(config.scopeName, info.stage, info.objectId)
    } else {
      content = await client.getObjectContent(config.scopeName, info.registry, info.stage, info.objectId)
    }

    if (content === null) throw new Error(`File not found on Atlas: ${file.path}`)

    file.content = content
    file.state = getFileState('LOADED')
    return content
  }

  async write(repository: Repository, file: File, content: string): Promise<void> {
    const client = this.getClient(repository)
    const config = this.getConfig(repository)
    const info = this.getFileInfo(repository, file)

    if (!info) throw new Error(`No Atlas metadata for file: ${file.path}`)
    if (info.readOnly) throw new Error(`File is read-only (from parent scope): ${file.path}`)

    if (info.isSchema) {
      await client.updateSchemaContent(config.scopeName, info.stage, info.objectId, content)
    } else {
      await client.updateObjectContent(config.scopeName, info.registry, info.stage, info.objectId, content)
    }

    file.content = content
    file.state = getFileState('LOADED')
  }

  async delete(repository: Repository, entry: File | Folder): Promise<void> {
    if ('children' in entry) {
      throw new Error('Cannot delete Atlas registry or stage folders')
    }

    const client = this.getClient(repository)
    const config = this.getConfig(repository)
    const info = this.getFileInfo(repository, entry as File)

    if (!info) throw new Error(`No Atlas metadata for file: ${entry.path}`)
    if (info.readOnly) throw new Error(`File is read-only (from parent scope): ${entry.path}`)

    if (info.isSchema) {
      await client.deleteSchema(config.scopeName, info.stage, info.objectId)
    } else {
      await client.deleteObject(config.scopeName, info.registry, info.stage, info.objectId)
    }

    const parent = entry.parent
    if (parent) {
      const index = parent.children.indexOf(entry)
      if (index >= 0) parent.children.splice(index, 1)
    }

    this.fileInfoMap.get(repository.uri)?.delete(entry.path)
  }

  async createFolder(repository: Repository, parent: Folder, name: string): Promise<Folder> {
    throw new Error('Cannot create folders in Model Atlas (registries/stages are managed by the server)')
  }

  async createFile(repository: Repository, parent: Folder, name: string, content: string = ''): Promise<File> {
    const client = this.getClient(repository)
    const config = this.getConfig(repository)
    const factory = StorageFactory.eINSTANCE
    const infoMap = this.fileInfoMap.get(repository.uri)!

    const pathParts = parent.path.split('/').filter(Boolean)
    if (pathParts.length < 2) {
      throw new Error('Files can only be created inside stage folders (e.g. /schema/draft/)')
    }

    const registryName = pathParts[0]
    const stage = pathParts[1]
    const isSchema = registryName === 'schema'
    const filePath = `${parent.path}/${name}`

    let metadataXmi: string
    if (isSchema) {
      metadataXmi = await client.uploadSchema(config.scopeName, stage, content, {
        name: name.replace(/\.ecore$/, '')
      })
    } else {
      const objectId = name.replace(/\.xmi$/, '')
      metadataXmi = await client.uploadObject(config.scopeName, registryName, stage, objectId, content, {
        name: objectId
      })
    }

    const metadata = parseMetadataXmi(metadataXmi)
    if (!metadata) throw new Error(`Failed to parse upload response for: ${name}`)

    const file = factory.createFile()
    file.name = name
    file.path = filePath
    file.content = content
    file.mimeType = 'application/xml'
    file.size = new Blob([content]).size
    file.state = getFileState('LOADED')
    file.hash = metadata.contentHash || ''
    file.parent = parent
    parent.children.push(file)

    infoMap.set(filePath, {
      registry: registryName,
      stage,
      objectId: metadata.objectId,
      metadata,
      readOnly: false,
      isSchema
    })

    return file
  }

  async sync(repository: Repository): Promise<SyncResult> {
    try {
      repository.state = RepositoryState.SYNCING

      const client = this.getClient(repository)
      const config = this.getConfig(repository)
      const scopeXmi = await client.getScope(config.scopeName)

      if (scopeXmi) {
        const scope = parseScopeXmi(scopeXmi)
        if (scope) {
          await this.buildTree(repository, client, config, scope)
        }
      }

      repository.state = RepositoryState.CONNECTED
      return { success: true, created: [], updated: [], deleted: [], errors: [] }
    } catch (error) {
      repository.state = RepositoryState.ERROR
      repository.errorMessage = error instanceof Error ? error.message : 'Sync failed'
      return {
        success: false,
        created: [],
        updated: [],
        deleted: [],
        errors: [{ file: null as any, message: repository.errorMessage || 'Unknown error' }]
      }
    }
  }

  async exists(repository: Repository): Promise<boolean> {
    try {
      const baseUrl = (repository as any).atlasBaseUrl
      const scopeName = (repository as any).scopeName
      if (!baseUrl || !scopeName) return false

      const client = new ModelAtlasClient({ baseUrl })
      const scopeXmi = await client.getScope(scopeName)
      return scopeXmi !== null
    } catch {
      return false
    }
  }

  // ============================================
  // Atlas-specific methods
  // ============================================

  getClientForRepo(repository: Repository): ModelAtlasClient {
    return this.getClient(repository)
  }

  getAtlasFileInfo(repository: Repository, file: File): AtlasFileInfo | undefined {
    return this.getFileInfo(repository, file)
  }

  async transitionFile(
    repository: Repository,
    file: File,
    targetStage: string
  ): Promise<ObjectMetadata | null> {
    const client = this.getClient(repository)
    const config = this.getConfig(repository)
    const info = this.getFileInfo(repository, file)

    if (!info) throw new Error(`No Atlas metadata for file: ${file.path}`)

    let resultXmi: string | null
    if (info.isSchema) {
      resultXmi = await client.transitionSchema(config.scopeName, info.stage, info.objectId, targetStage)
    } else {
      resultXmi = await client.transitionObject(config.scopeName, info.registry, info.stage, info.objectId, targetStage)
    }

    if (!resultXmi) return null
    return parseMetadataXmi(resultXmi)
  }

  // ============================================
  // Private helpers
  // ============================================

  private getClient(repository: Repository): ModelAtlasClient {
    const client = this.clients.get(repository.uri)
    if (!client) throw new Error(`Not connected to repository: ${repository.uri}`)
    return client
  }

  private getConfig(repository: Repository): AtlasConfig {
    const config = this.configs.get(repository.uri)
    if (!config) throw new Error(`No config for repository: ${repository.uri}`)
    return config
  }

  private getFileInfo(repository: Repository, file: File): AtlasFileInfo | undefined {
    return this.fileInfoMap.get(repository.uri)?.get(file.path)
  }
}