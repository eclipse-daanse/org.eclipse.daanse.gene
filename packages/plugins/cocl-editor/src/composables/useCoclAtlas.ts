/**
 * C-OCL Atlas API Client
 *
 * Upload/download OclConstraintSet to/from Model Atlas COCL registry.
 * Resolves the ModelAtlasClient from the Atlas Browser connection.
 */

import { ref } from 'tsm:vue'
import { XMIResource, URI, BasicResourceSet } from '@emfts/core'
import type { EObject } from '@emfts/core'

export interface CoclConfigMeta {
  objectId: string
  name: string
  version: string
  stage: string
}

const REGISTRY = 'cocl'

/** Resolve Atlas Browser and client */
function getAtlasClient(tsm: any, connectionId?: string): { client: any; scopeName: string } | null {
  const browser = tsm?.getService?.('gene.atlas.browser')
  if (!browser) return null

  const connections = browser.connections?.value || []
  const conn = connectionId
    ? connections.find((c: any) => c.id === connectionId)
    : connections.find((c: any) => c.status === 'connected')

  if (!conn) return null
  const client = browser.getClient(conn.id)
  return client ? { client, scopeName: conn.scopeName || 'jena' } : null
}

/** Read a feature value from an EObject */
function getFeatureValue(obj: any, eClass: any, name: string): any {
  const feature = eClass?.getEStructuralFeature?.(name)
  return feature ? obj.eGet(feature) : undefined
}

export function useCoclAtlas(tsm: any) {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const configs = ref<CoclConfigMeta[]>([])

  async function listConstraintSets(stage?: string): Promise<CoclConfigMeta[]> {
    loading.value = true
    error.value = null
    try {
      const atlas = getAtlasClient(tsm)
      if (!atlas) { error.value = 'No Atlas connection'; return [] }

      const xmi = stage
        ? await atlas.client.listObjects(atlas.scopeName, REGISTRY, stage)
        : await atlas.client.listAllObjects(atlas.scopeName, REGISTRY)
      if (!xmi) return []

      const uri = URI.createURI('cocl-metadata.xmi')
      const resource = new XMIResource(uri)
      const resourceSet = new BasicResourceSet()
      resourceSet.getResources().push(resource)
      resource.setResourceSet(resourceSet)
      resource.loadFromString(xmi)

      const contents = resource.getContents()
      const items: CoclConfigMeta[] = []

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
              stage: getFeatureValue(meta, eClass, 'stage') || ''
            })
          }
        }
      }

      configs.value = items
      return items
    } catch (e: any) {
      error.value = e.message
      return []
    } finally {
      loading.value = false
    }
  }

  async function loadConstraintSet(objectId: string, stage = 'release'): Promise<string | null> {
    loading.value = true
    error.value = null
    try {
      const atlas = getAtlasClient(tsm)
      if (!atlas) { error.value = 'No Atlas connection'; return null }
      return await atlas.client.getObjectContent(atlas.scopeName, REGISTRY, stage, objectId)
    } catch (e: any) {
      error.value = e.message
      return null
    } finally {
      loading.value = false
    }
  }

  async function uploadConstraintSet(
    xmiContent: string,
    name: string,
    version: string,
    objectId?: string,
    stage = 'draft'
  ): Promise<{ success: boolean; objectId?: string }> {
    loading.value = true
    error.value = null
    try {
      const atlas = getAtlasClient(tsm)
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

  return {
    loading,
    error,
    configs,
    listConstraintSets,
    loadConstraintSet,
    uploadConstraintSet
  }
}
