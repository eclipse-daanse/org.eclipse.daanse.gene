/**
 * Atlas URIConverter - Cascaded EPackage resolution via Model Atlas
 *
 * Creates a URIConverter that resolves EPackage nsURIs by querying
 * a cascade of Model Atlas providers. Falls back to an optional
 * delegate URIConverter for local/other resolution.
 */

import { ModelAtlasClient } from 'storage-model-atlas'
import type { URIConverter } from '@emfts/core'
import { URI } from '@emfts/core'

export interface AtlasProvider {
  client: ModelAtlasClient
  scopeName: string
  stage: string
}

/**
 * Creates a URIConverter that resolves nsURIs from Model Atlas providers.
 * Providers are tried in order (cascade). If none resolves, falls back to
 * the optional fallback converter.
 */
export function createAtlasURIConverter(
  providers: AtlasProvider[],
  fallback?: URIConverter
): URIConverter {
  return {
    normalize(uri: URI): URI {
      return fallback?.normalize(uri) ?? uri
    },

    async createInputStream(uri: URI): Promise<ReadableStream> {
      const nsURI = uri.toString()

      // Cascade: try providers in order
      for (const p of providers) {
        try {
          const content = await p.client.getSchemaContent(p.scopeName, p.stage, nsURI)
          if (content) {
            return new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(content))
                controller.close()
              }
            })
          }
        } catch {
          // Provider unavailable, try next
        }
      }

      // Fallback (e.g. for local files)
      if (fallback) return fallback.createInputStream(uri)
      throw new Error(`Schema not found: ${nsURI}`)
    },

    async exists(uri: URI): Promise<boolean> {
      const nsURI = uri.toString()
      for (const p of providers) {
        try {
          const content = await p.client.getSchemaContent(p.scopeName, p.stage, nsURI)
          if (content) return true
        } catch {
          // Provider unavailable, try next
        }
      }
      return fallback?.exists(uri) ?? false
    },

    async createOutputStream(_uri: URI): Promise<WritableStream> {
      throw new Error('Atlas URIConverter is read-only')
    },

    async delete(_uri: URI): Promise<void> {
      throw new Error('Atlas URIConverter is read-only')
    },

    getURIMap(): Map<URI, URI> {
      return fallback?.getURIMap() ?? new Map()
    }
  }
}
