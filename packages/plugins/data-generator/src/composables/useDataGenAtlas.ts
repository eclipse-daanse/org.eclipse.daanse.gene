/**
 * DataGen Atlas API Client
 *
 * Communicates with the Model Atlas DataGen REST endpoints:
 * - Upload/download DataGenConfig to/from the DataGen registry
 * - Trigger server-side data generation
 */

import { ref, computed } from 'tsm:vue'
import { XMIResource, URI, BasicResourceSet, EPackageRegistry } from '@emfts/core'
import type { EObject } from '@emfts/core'

export interface DataGenConfigMeta {
  objectId: string
  name: string
  version: string
  stage: string
}

const REGISTRY = 'DataGen'
const SCOPE = 'jena'
const DRAFT_STAGE = 'draft'
const RELEASE_STAGE = 'release'

let _baseUrl = ''

/** Read a feature value from an EObject by name */
function getFeatureValue(obj: any, eClass: any, name: string): any {
  const feature = eClass?.getEStructuralFeature?.(name)
  if (feature) return obj.eGet(feature)
  return undefined
}

/**
 * Set the Atlas base URL (called from plugin activation or Atlas Browser connection)
 */
export function setAtlasBaseUrl(url: string) {
  _baseUrl = url.replace(/\/+$/, '')
}

function getBaseUrl(): string {
  if (_baseUrl) return _baseUrl

  // Try to detect from proxy config (dev mode: /rest proxied to Atlas)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/rest`
  }
  return 'http://localhost:8086/atlas/rest'
}

async function atlasGet(path: string, accept = 'application/xmi'): Promise<Response> {
  const url = `${getBaseUrl()}${path}`
  return fetch(url, {
    method: 'GET',
    headers: { 'Accept': accept }
  })
}

async function atlasPost(path: string, body: string, contentType = 'application/xmi'): Promise<Response> {
  const url = `${getBaseUrl()}${path}`
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'Accept': 'application/json'
    },
    body
  })
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
  async function listConfigs(stage = RELEASE_STAGE): Promise<DataGenConfigMeta[]> {
    loading.value = true
    error.value = null
    try {
      const res = await atlasGet(`/${SCOPE}/registries/${REGISTRY}/stages/${stage}?name=*`, 'application/xmi')
      if (!res.ok) {
        error.value = `Failed to list configs: ${res.status}`
        return []
      }
      const xmi = await res.text()

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
        // ObjectMetadataContainer has a 'metadata' containment reference
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
  async function loadConfig(objectId: string, stage = RELEASE_STAGE): Promise<string | null> {
    loading.value = true
    error.value = null
    try {
      const res = await atlasGet(
        `/${SCOPE}/registries/${REGISTRY}/stages/${stage}/content?objectId=${encodeURIComponent(objectId)}`
      )
      if (!res.ok) {
        error.value = `Failed to load config: ${res.status}`
        return null
      }
      return await res.text()
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
    stage = DRAFT_STAGE
  ): Promise<{ success: boolean; objectId?: string }> {
    loading.value = true
    error.value = null
    try {
      const id = objectId || name.toLowerCase().replace(/\s+/g, '-')
      const params = new URLSearchParams({ name, version, override: 'true' })
      const res = await atlasPost(
        `/${SCOPE}/registries/${REGISTRY}/stages/${stage}/${encodeURIComponent(id)}?${params}`,
        xmiContent
      )
      if (!res.ok) {
        error.value = `Failed to upload: ${res.status} ${await res.text()}`
        return { success: false }
      }
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
  async function generateOnServer(configName: string, version?: string): Promise<{ success: boolean; xmiContent: string; error?: string }> {
    loading.value = true
    error.value = null
    try {
      const versionParam = version ? `?version=${encodeURIComponent(version)}` : ''
      const res = await atlasGet(`/datagen/${encodeURIComponent(configName)}${versionParam}`)
      if (res.status === 204) {
        error.value = `Config not found: ${configName}`
        return { success: false, xmiContent: '', error: error.value }
      }
      if (!res.ok) {
        error.value = `Generation failed: ${res.status}`
        return { success: false, xmiContent: '', error: error.value }
      }
      const xmi = await res.text()
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
  async function generateFromConfig(configXmi: string): Promise<{ success: boolean; xmiContent: string; error?: string }> {
    loading.value = true
    error.value = null
    try {
      const res = await atlasPost('/datagen', configXmi)
      if (!res.ok) {
        const text = await res.text()
        error.value = `Generation failed: ${res.status} ${text}`
        return { success: false, xmiContent: '', error: error.value }
      }
      const xmi = await res.text()
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