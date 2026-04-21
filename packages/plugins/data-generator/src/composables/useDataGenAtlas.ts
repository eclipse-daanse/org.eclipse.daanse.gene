/**
 * DataGen Atlas API Client
 *
 * Uses ModelAtlasClient (from storage-model-atlas) for all REST communication.
 * Resolves the client from the Atlas Browser's active connections.
 */

import { ref } from 'tsm:vue'
import { XMIResource, URI, BasicResourceSet } from '@emfts/core'
import type { EObject } from '@emfts/core'

export interface DataGenConfigMeta {
  objectId: string
  name: string
  version: string
  stage: string
}

const REGISTRY = 'DataGen'
const DRAFT_STAGE = 'draft'
const RELEASE_STAGE = 'release'

/** Read a feature value from an EObject by name */
function getFeatureValue(obj: any, eClass: any, name: string): any {
  const feature = eClass?.getEStructuralFeature?.(name)
  if (feature) return obj.eGet(feature)
  return undefined
}

let _sharedBrowser: any = null

/** Set the shared Atlas Browser (called from plugin activate) */
export function setAtlasBrowser(browser: any) {
  _sharedBrowser = browser
}

/** Resolve a ModelAtlasClient from the Atlas Browser */
function getAtlasClient(connectionId?: string): { client: any; scopeName: string } | null {
  if (!_sharedBrowser) return null

  const connections = browser.connections?.value || []
  const conn = connectionId
    ? connections.find((c: any) => c.id === connectionId)
    : connections.find((c: any) => c.status === 'connected')

  if (!conn) return null

  const client = browser.getClient(conn.id)
  return client ? { client, scopeName: conn.scopeName || 'jena' } : null
}

/**
 * DataGen Atlas composable
 */
export function useDataGenAtlas() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const configs = ref<DataGenConfigMeta[]>([])

  /**
   * List all DataGenConfig entries on the server
   */
  async function listConfigs(stage?: string, connectionId?: string): Promise<DataGenConfigMeta[]> {
    loading.value = true
    error.value = null
    try {
      const atlas = getAtlasClient(connectionId)
      if (!atlas) { error.value = 'No Atlas connection'; return [] }

      // Use /all endpoint to list across all stages, or specific stage if provided
      const xmi = stage
        ? await atlas.client.listObjects(atlas.scopeName, REGISTRY, stage)
        : await atlas.client.listAllObjects(atlas.scopeName, REGISTRY)
      if (!xmi) return []

      // Deserialize with emfts
      const uri = URI.createURI('atlas-metadata.xmi')
      const resource = new XMIResource(uri)
      const resourceSet = new BasicResourceSet()
      resourceSet.getResources().push(resource)
      resource.setResourceSet(resourceSet)
      resource.loadFromString(xmi)

      const contents = resource.getContents()
      const items: DataGenConfigMeta[] = []

      for (let i = 0; i < contents.size(); i++) {
        const root = contents.get(i)
        const metadataFeature = root.eClass()?.getEStructuralFeature('metadata')
        if (metadataFeature) {
          const metadataList = root.eGet(metadataFeature)
          for (const meta of metadataList) {
            const eClass = (meta as EObject).eClass()
            items.push({
              objectId: getFeatureValue(meta, eClass, 'objectId') || '',
              name: getFeatureValue(meta, eClass, 'objectName') || '',
              version: getFeatureValue(meta, eClass, 'version') || '',
              stage: getFeatureValue(meta, eClass, 'stage') || stage
            })
          }
        }
      }

      configs.value = items
      return configs.value
    } catch (e: any) {
      error.value = e.message
      return []
    } finally {
      loading.value = false
    }
  }

  /**
   * Load a DataGenConfig XMI from the server
   */
  async function loadConfig(objectId: string, stage = RELEASE_STAGE, connectionId?: string): Promise<string | null> {
    loading.value = true
    error.value = null
    try {
      const atlas = getAtlasClient(connectionId)
      if (!atlas) { error.value = 'No Atlas connection'; return null }

      return await atlas.client.getObjectContent(atlas.scopeName, REGISTRY, stage, objectId)
    } catch (e: any) {
      error.value = e.message
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * Upload a DataGenConfig XMI to the server
   */
  async function uploadConfig(
    xmiContent: string,
    name: string,
    version: string,
    objectId?: string,
    stage = DRAFT_STAGE,
    connectionId?: string
  ): Promise<{ success: boolean; objectId?: string }> {
    loading.value = true
    error.value = null
    try {
      const atlas = getAtlasClient(connectionId)
      if (!atlas) { error.value = 'No Atlas connection'; return { success: false } }

      const id = objectId || name.toLowerCase().replace(/\s+/g, '-')
      await atlas.client.uploadObject(atlas.scopeName, REGISTRY, stage, id, xmiContent, { name, version, override: true })
      return { success: true, objectId: id }
    } catch (e: any) {
      error.value = e.message
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  /**
   * Trigger server-side data generation from a stored config
   */
  async function generateOnServer(configName: string, version?: string, connectionId?: string): Promise<{ success: boolean; xmiContent: string; error?: string }> {
    loading.value = true
    error.value = null
    try {
      const atlas = getAtlasClient(connectionId)
      if (!atlas) { error.value = 'No Atlas connection'; return { success: false, xmiContent: '', error: error.value! } }

      const xmi = await atlas.client.generateDataByName(configName, version)
      return { success: true, xmiContent: xmi }
    } catch (e: any) {
      error.value = e.message
      return { success: false, xmiContent: '', error: e.message }
    } finally {
      loading.value = false
    }
  }

  /**
   * Generate from inline config (POST config XMI directly)
   */
  async function generateFromConfig(configXmi: string, connectionId?: string): Promise<{ success: boolean; xmiContent: string; error?: string }> {
    loading.value = true
    error.value = null
    try {
      const atlas = getAtlasClient(connectionId)
      if (!atlas) { error.value = 'No Atlas connection'; return { success: false, xmiContent: '', error: error.value! } }

      const xmi = await atlas.client.generateData(configXmi)
      return { success: true, xmiContent: xmi }
    } catch (e: any) {
      error.value = e.message
      return { success: false, xmiContent: '', error: e.message }
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    configs,
    listConfigs,
    loadConfig,
    uploadConfig,
    generateOnServer,
    generateFromConfig,
  }
}
