/**
 * Unified File System Composable
 *
 * Provides access to multiple file sources:
 * - Local filesystem (File System Access API)
 * - Git repositories
 * - IndexedDB storage
 */

import { ref, computed, reactive } from 'tsm:vue'
import type { FileEntry, FileFilter, FileTreeNode, FileSource, SourceType } from '../types'
import { getFileIcon, getSourceIcon, isWorkspaceFile } from '../types'

/**
 * Check if File System Access API is supported
 */
export function isFileSystemAccessSupported(): boolean {
  return 'showDirectoryPicker' in window
}

/**
 * Composable for unified file system access
 */
export function useFileSystem() {
  // All registered sources
  const sources = ref<FileSource[]>([])

  // Files by source ID
  const filesBySource = reactive<Map<string, FileEntry[]>>(new Map())

  // Loading state per source
  const loadingBySource = reactive<Map<string, boolean>>(new Map())

  // Global state
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Default filter (no extension restriction for unified explorer)
  const filter = ref<FileFilter>({
    extensions: undefined, // Show all files
    showHidden: false,
    showDirectories: true
  })

  // ----- Source Management -----

  /**
   * Add a local folder source
   */
  async function addLocalSource(name?: string): Promise<FileSource | null> {
    if (!isFileSystemAccessSupported()) {
      error.value = 'File System Access API is not supported in this browser'
      return null
    }

    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
      const source: FileSource = {
        id: `local-${Date.now()}`,
        name: name || handle.name,
        type: 'local',
        icon: getSourceIcon('local'),
        connected: true,
        data: { handle }
      }

      sources.value.push(source)
      await refreshSource(source.id)
      return source
    } catch (e: any) {
      if (e.name === 'AbortError') {
        return null // User cancelled
      }
      error.value = `Failed to open directory: ${e.message}`
      return null
    }
  }

  /**
   * Add an IndexedDB source
   */
  function addIndexedDBSource(name: string, databaseName: string): FileSource {
    const source: FileSource = {
      id: `indexeddb-${Date.now()}`,
      name,
      type: 'indexeddb',
      icon: getSourceIcon('indexeddb'),
      connected: true,
      data: { databaseName }
    }

    sources.value.push(source)
    // IndexedDB sources start empty or need to be loaded from storage
    filesBySource.set(source.id, [])
    return source
  }

  /**
   * Add a Git repository source
   */
  function addGitSource(name: string, repoUrl: string, token?: string): FileSource {
    const source: FileSource = {
      id: `git-${Date.now()}`,
      name,
      type: 'git',
      icon: getSourceIcon('git'),
      connected: false, // Need to connect first
      data: { repoUrl, token }
    }

    sources.value.push(source)
    filesBySource.set(source.id, [])
    return source
  }

  /**
   * Add a Model Atlas source
   */
  function addAtlasSource(name: string, baseUrl: string, scopeName: string, token?: string): FileSource {
    const source: FileSource = {
      id: `atlas-${Date.now()}`,
      name,
      type: 'model-atlas',
      icon: getSourceIcon('model-atlas'),
      connected: false, // Need to connect first
      data: { baseUrl, scopeName, token }
    }

    sources.value.push(source)
    filesBySource.set(source.id, [])
    // Auto-connect
    refreshSource(source.id)
    return source
  }

  /**
   * Remove a source
   */
  function removeSource(sourceId: string): boolean {
    const idx = sources.value.findIndex(s => s.id === sourceId)
    if (idx >= 0) {
      sources.value.splice(idx, 1)
      filesBySource.delete(sourceId)
      loadingBySource.delete(sourceId)
      return true
    }
    return false
  }

  /**
   * Get a source by ID
   */
  function getSource(sourceId: string): FileSource | undefined {
    return sources.value.find(s => s.id === sourceId)
  }

  // ----- File Operations -----

  /**
   * Refresh files for a specific source
   */
  async function refreshSource(sourceId: string): Promise<void> {
    const source = getSource(sourceId)
    if (!source) return

    loadingBySource.set(sourceId, true)
    error.value = null

    try {
      let files: FileEntry[] = []

      switch (source.type) {
        case 'local':
          files = await scanLocalDirectory(source.data.handle, '', sourceId)
          break
        case 'indexeddb':
          files = await scanIndexedDB(source.data.databaseName, sourceId)
          break
        case 'git':
          files = await scanGitRepo(source.data, sourceId)
          break
        case 'model-atlas':
          files = await scanAtlasScope(source.data, sourceId)
          break
      }

      filesBySource.set(sourceId, files)
      source.connected = true
      source.error = undefined
    } catch (e: any) {
      source.connected = false
      source.error = e.message
      error.value = `Failed to load ${source.name}: ${e.message}`
    } finally {
      loadingBySource.set(sourceId, false)
    }
  }

  /**
   * Refresh all sources
   */
  async function refreshAll(): Promise<void> {
    loading.value = true
    await Promise.all(sources.value.map(s => refreshSource(s.id)))
    loading.value = false
  }

  /**
   * Scan local directory recursively
   */
  async function scanLocalDirectory(
    dirHandle: FileSystemDirectoryHandle,
    parentPath: string,
    sourceId: string
  ): Promise<FileEntry[]> {
    const entries: FileEntry[] = []

    for await (const [name, handle] of dirHandle.entries()) {
      // Skip hidden files unless enabled
      if (!filter.value.showHidden && name.startsWith('.')) {
        continue
      }

      const entryPath = parentPath ? `${parentPath}/${name}` : name
      const ext = name.includes('.') ? `.${name.split('.').pop()}` : ''

      if (handle.kind === 'directory') {
        if (filter.value.showDirectories) {
          const children = await scanLocalDirectory(
            handle as FileSystemDirectoryHandle,
            entryPath,
            sourceId
          )
          entries.push({
            name,
            path: entryPath,
            isDirectory: true,
            sourceId,
            handle,
            children
          })
        }
      } else {
        const entry: FileEntry = {
          name,
          path: entryPath,
          isDirectory: false,
          sourceId,
          handle,
          extension: ext
        }
        entry.isWorkspace = isWorkspaceFile(entry)
        entries.push(entry)
      }
    }

    // Sort: directories first, then alphabetically
    return entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      return a.name.localeCompare(b.name)
    })
  }

  /**
   * Scan IndexedDB storage (placeholder - to be integrated with storage-indexeddb)
   */
  async function scanIndexedDB(databaseName: string, sourceId: string): Promise<FileEntry[]> {
    // TODO: Integrate with storage-indexeddb
    // For now, return empty array
    return []
  }

  /**
   * Scan Git repository (placeholder - to be integrated with storage-git)
   */
  async function scanGitRepo(data: any, sourceId: string): Promise<FileEntry[]> {
    // TODO: Integrate with storage-git
    // For now, return empty array
    return []
  }

  /**
   * Scan a Model Atlas scope and build file tree using EMFTs for XMI parsing
   */
  async function scanAtlasScope(data: any, sourceId: string): Promise<FileEntry[]> {
    const { baseUrl, scopeName, token } = data

    // Import EMFTs-based client and parsers from storage-model-atlas
    const { ModelAtlasClient, parseScopeXmi, parseMetadataListXmi } = await import('storage-model-atlas')

    const client = new ModelAtlasClient({ baseUrl, token })

    // Get scope using XMI and parse with EMFTs
    const scopeXmi = await client.getScope(scopeName)
    if (!scopeXmi) throw new Error(`Scope '${scopeName}' not found`)

    const scope = parseScopeXmi(scopeXmi)
    if (!scope) throw new Error(`Failed to parse scope '${scopeName}'`)

    // Get registries and stages from the parsed Scope EObject
    const registries = scope.registries || []
    const registryNames = registries.map((r: any) => r.name)
    if (!registryNames.includes('schema')) registryNames.unshift('schema')

    const entries: FileEntry[] = []

    for (const registryName of registryNames) {
      const registryEntry: FileEntry = {
        name: registryName,
        path: registryName,
        isDirectory: true,
        sourceId,
        children: []
      }

      // Get stages from registry definition or use defaults
      const registry = registries.find((r: any) => r.name === registryName)
      const stages: string[] = registry?.stages?.map((s: any) => s.name) || ['draft', 'review', 'approved', 'release']

      for (const stageName of stages) {
        const stageEntry: FileEntry = {
          name: stageName,
          path: `${registryName}/${stageName}`,
          isDirectory: true,
          sourceId,
          children: []
        }

        try {
          let metadataXmi: string
          if (registryName === 'schema') {
            metadataXmi = await client.listSchemas(scopeName, stageName)
          } else {
            metadataXmi = await client.listObjects(scopeName, registryName, stageName)
          }

          // Parse metadata list XMI with EMFTs
          const metadataList = parseMetadataListXmi(metadataXmi)

          for (const meta of metadataList) {
            const isSchema = registryName === 'schema'
            const fileName = meta.objectName
              ? `${meta.objectName}${isSchema ? '.ecore' : '.xmi'}`
              : `${meta.objectId}${isSchema ? '.ecore' : '.xmi'}`
            const ext = isSchema ? '.ecore' : '.xmi'

            stageEntry.children!.push({
              name: fileName,
              path: `${registryName}/${stageName}/${fileName}`,
              isDirectory: false,
              sourceId,
              extension: ext,
              isWorkspace: ext === '.xmi',
              handle: {
                atlasBaseUrl: baseUrl, scopeName, token,
                registryName, stage: stageName,
                objectId: meta.objectId, isSchema,
                metadata: meta
              }
            })
          }
        } catch {
          // Stage not available - skip
        }

        registryEntry.children!.push(stageEntry)
      }

      entries.push(registryEntry)
    }

    return entries
  }

  /**
   * Read a text file
   */
  async function readTextFile(entry: FileEntry): Promise<string> {
    if (entry.isDirectory) {
      throw new Error('Cannot read directory as text')
    }

    const source = getSource(entry.sourceId)
    if (!source) throw new Error('Source not found')

    switch (source.type) {
      case 'local': {
        const fileHandle = entry.handle as FileSystemFileHandle
        const file = await fileHandle.getFile()
        return await file.text()
      }
      case 'indexeddb':
        // TODO: Implement
        throw new Error('IndexedDB read not implemented')
      case 'git':
        // TODO: Implement
        throw new Error('Git read not implemented')
      case 'model-atlas': {
        const h = entry.handle
        if (!h?.atlasBaseUrl) throw new Error('No Atlas handle for file')
        const headers: Record<string, string> = { 'Accept': 'application/xml' }
        if (h.token) headers['Authorization'] = `Bearer ${h.token}`

        let url: string
        if (h.isSchema) {
          const nsUriB64 = btoa(h.objectId).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
          url = `${h.atlasBaseUrl}/${encodeURIComponent(h.scopeName)}/schema/stages/${encodeURIComponent(h.stage)}/content?nsUri=${nsUriB64}`
        } else {
          url = `${h.atlasBaseUrl}/${encodeURIComponent(h.scopeName)}/registries/${encodeURIComponent(h.registryName)}/stages/${encodeURIComponent(h.stage)}/content?objectId=${encodeURIComponent(h.objectId)}`
        }

        const resp = await fetch(url, { headers })
        if (!resp.ok) throw new Error(`Atlas read failed: ${resp.status}`)
        return await resp.text()
      }
      default:
        throw new Error('Unknown source type')
    }
  }

  /**
   * Write to a text file
   */
  async function writeTextFile(entry: FileEntry, content: string): Promise<void> {
    if (entry.isDirectory) {
      throw new Error('Cannot write to directory')
    }

    const source = getSource(entry.sourceId)
    if (!source) throw new Error('Source not found')

    switch (source.type) {
      case 'local': {
        const fileHandle = entry.handle as FileSystemFileHandle
        const writable = await fileHandle.createWritable()
        await writable.write(content)
        await writable.close()
        break
      }
      case 'indexeddb':
        // TODO: Implement
        throw new Error('IndexedDB write not implemented')
      case 'git':
        // TODO: Implement
        throw new Error('Git write not implemented')
      case 'model-atlas': {
        const h = entry.handle
        if (!h?.atlasBaseUrl) throw new Error('No Atlas handle for file')
        const headers: Record<string, string> = { 'Content-Type': 'application/xml', 'Accept': 'application/json' }
        if (h.token) headers['Authorization'] = `Bearer ${h.token}`

        let url: string
        if (h.isSchema) {
          const nsUriB64 = btoa(h.objectId).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
          url = `${h.atlasBaseUrl}/${encodeURIComponent(h.scopeName)}/schema/stages/${encodeURIComponent(h.stage)}/content?nsUri=${nsUriB64}`
        } else {
          url = `${h.atlasBaseUrl}/${encodeURIComponent(h.scopeName)}/registries/${encodeURIComponent(h.registryName)}/stages/${encodeURIComponent(h.stage)}/content?objectId=${encodeURIComponent(h.objectId)}&version=1.0.0`
        }

        const resp = await fetch(url, { method: 'PUT', headers, body: content })
        if (!resp.ok) {
          const errText = await resp.text()
          throw new Error(`Atlas write failed (${resp.status}): ${errText}`)
        }
        break
      }
      default:
        throw new Error('Unknown source type')
    }
  }

  /**
   * Create a new folder
   */
  async function createFolder(sourceId: string, parentPath: string, folderName: string): Promise<void> {
    const source = getSource(sourceId)
    if (!source) throw new Error('Source not found')

    switch (source.type) {
      case 'local': {
        const rootHandle = source.data.handle as FileSystemDirectoryHandle
        // Navigate to parent directory
        const dirHandle = await getDirectoryHandle(rootHandle, parentPath)
        // Create the new folder
        await dirHandle.getDirectoryHandle(folderName, { create: true })
        // Refresh source to update tree
        await refreshSource(sourceId)
        break
      }
      case 'indexeddb':
        // TODO: Implement
        throw new Error('IndexedDB folder creation not implemented')
      case 'git':
        throw new Error('Cannot create folders in Git repositories (read-only)')
      default:
        throw new Error('Unknown source type')
    }
  }

  /**
   * Create a new file
   */
  async function createFile(sourceId: string, parentPath: string, fileName: string): Promise<void> {
    const source = getSource(sourceId)
    if (!source) throw new Error('Source not found')

    switch (source.type) {
      case 'local': {
        const rootHandle = source.data.handle as FileSystemDirectoryHandle
        // Navigate to parent directory
        const dirHandle = await getDirectoryHandle(rootHandle, parentPath)
        // Create the new file
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true })
        // Write empty content to ensure file exists
        const writable = await fileHandle.createWritable()
        await writable.write('')
        await writable.close()
        // Refresh source to update tree
        await refreshSource(sourceId)
        break
      }
      case 'indexeddb':
        // TODO: Implement
        throw new Error('IndexedDB file creation not implemented')
      case 'git':
        throw new Error('Cannot create files in Git repositories (read-only)')
      default:
        throw new Error('Unknown source type')
    }
  }

  /**
   * Navigate to a directory handle by path
   */
  async function getDirectoryHandle(
    rootHandle: FileSystemDirectoryHandle,
    path: string
  ): Promise<FileSystemDirectoryHandle> {
    if (!path) return rootHandle

    const parts = path.split('/').filter(p => p.length > 0)
    let currentHandle = rootHandle

    for (const part of parts) {
      currentHandle = await currentHandle.getDirectoryHandle(part)
    }

    return currentHandle
  }

  /**
   * Create a new workspace file with XMI content
   */
  async function createWorkspace(
    sourceId: string,
    parentPath: string,
    fileName: string,
    workspaceName: string
  ): Promise<void> {
    const source = getSource(sourceId)
    if (!source) throw new Error('Source not found')

    // Generate XMI content for empty workspace
    const xmiContent = generateWorkspaceXMI(workspaceName)

    switch (source.type) {
      case 'local': {
        const rootHandle = source.data.handle as FileSystemDirectoryHandle
        const dirHandle = await getDirectoryHandle(rootHandle, parentPath)
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(xmiContent)
        await writable.close()
        await refreshSource(sourceId)
        break
      }
      case 'indexeddb':
        throw new Error('IndexedDB workspace creation not implemented')
      case 'git':
        throw new Error('Cannot create workspaces in Git repositories (read-only)')
      default:
        throw new Error('Unknown source type')
    }
  }

  /**
   * Generate XMI content for a new workspace (EditorConfig format)
   */
  function generateWorkspaceXMI(name: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<fennecui:EditorConfig
    xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:fennecui="https://eclipse.org/fennec/ts/generic/ui"
    xmi:version="2.0"
    name="${escapeXml(name)}"
    enabled="true">
</fennecui:EditorConfig>
`
  }

  /**
   * Escape XML special characters
   */
  function escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  // ----- Tree Nodes -----

  /**
   * Convert all sources and files to PrimeVue tree nodes
   */
  const treeNodes = computed<FileTreeNode[]>(() => {
    return sources.value.map(source => {
      const files = filesBySource.get(source.id) ?? []
      const isLoading = loadingBySource.get(source.id) ?? false

      return {
        key: `source:${source.id}`,
        label: source.name,
        icon: source.icon,
        data: source,
        type: 'source' as const,
        leaf: false,
        loading: isLoading,
        children: files.map(entry => convertToTreeNode(entry))
      }
    })
  })

  function convertToTreeNode(entry: FileEntry): FileTreeNode {
    const nodeType = entry.isDirectory
      ? 'directory'
      : entry.isWorkspace
        ? 'workspace'
        : 'file'

    return {
      key: `${entry.sourceId}:${entry.path}`,
      label: entry.name,
      icon: getFileIcon(entry),
      data: entry,
      type: nodeType,
      children: entry.children?.map(convertToTreeNode),
      leaf: !entry.isDirectory
    }
  }

  /**
   * Get file by path within a source
   */
  function getFileByPath(sourceId: string, path: string): FileEntry | undefined {
    const files = filesBySource.get(sourceId)
    if (!files) return undefined

    function findInEntries(entries: FileEntry[], targetPath: string): FileEntry | undefined {
      for (const entry of entries) {
        if (entry.path === targetPath) return entry
        if (entry.children) {
          const found = findInEntries(entry.children, targetPath)
          if (found) return found
        }
      }
      return undefined
    }

    return findInEntries(files, path)
  }

  // Selected file (shared across FileExplorer and WorkspacePreview)
  const selectedFile = ref<FileEntry | null>(null)

  // ----- Legacy compatibility -----
  // These maintain compatibility with existing code

  const rootHandle = computed(() => {
    const localSource = sources.value.find(s => s.type === 'local')
    return localSource?.data?.handle ?? null
  })

  const rootPath = computed(() => {
    const localSource = sources.value.find(s => s.type === 'local')
    return localSource?.name ?? ''
  })

  const files = computed(() => {
    const allFiles: FileEntry[] = []
    for (const [, entries] of filesBySource) {
      allFiles.push(...entries)
    }
    return allFiles
  })

  async function openDirectory(): Promise<boolean> {
    const source = await addLocalSource()
    return source !== null
  }

  async function refresh(): Promise<void> {
    await refreshAll()
  }

  return {
    // Source management
    sources,
    addLocalSource,
    addIndexedDBSource,
    addGitSource,
    addAtlasSource,
    removeSource,
    getSource,

    // File operations
    refreshSource,
    refreshAll,
    readTextFile,
    writeTextFile,
    createFolder,
    createFile,
    createWorkspace,
    getFileByPath,

    // State
    filesBySource,
    loadingBySource,
    loading,
    error,
    filter,
    treeNodes,

    // Selected file
    selectedFile,

    // Legacy compatibility
    rootHandle,
    rootPath,
    files,
    openDirectory,
    refresh,

    // Utils
    isSupported: isFileSystemAccessSupported
  }
}

/**
 * Shared singleton instance
 */
let sharedInstance: ReturnType<typeof useFileSystem> | null = null

export function useSharedFileSystem() {
  if (!sharedInstance) {
    sharedInstance = useFileSystem()
  }
  return sharedInstance
}

/**
 * Get the shared file system instance
 * Returns null if not initialized
 */
export function getGlobalFileSystem(): ReturnType<typeof useFileSystem> | null {
  return sharedInstance
}
