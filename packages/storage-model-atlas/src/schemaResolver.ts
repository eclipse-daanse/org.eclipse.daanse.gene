/**
 * Resolving the schemas of a Model Atlas scope.
 *
 * In EMF a package's nsURI is an ordinary resource URI, and the resource set's
 * URI converter says where the Ecore really is (`XMLHandler.getPackageForURI`
 * in org.eclipse.emf.ecore.xmi fetches it from there and puts it into the
 * registry itself). This package knows the location — so the converter belongs
 * here, not in a UI plugin.
 *
 * Since `@emfts/core` 0.3 the loader asks it too: `loadFromStringAsync`
 * collects the unknown nsURIs on the first pass, fetches them through the
 * converter and parses again (emf.ts#88). Callers only need to know the
 * providers — `providersForScopeChain` — and to install the converter.
 */

import type { URIConverter } from '@emfts/core'
import { URI } from '@emfts/core'
import { ModelAtlasClient } from './ModelAtlasClient'
import { parseMetadataListXmi, parseScopeXmi } from './AtlasResourceSet'
import { schemaNsUri } from './schemaIdentity'

/**
 * One place to look: a scope in a stage.
 *
 * `registryName` names the schema registry when the scope has one of its own.
 * The shortcut `/{scope}/schema/...` only applies to the synthetic registry; a
 * named one is addressed by its name, and there a schema's `objectId` is
 * server-dependent — hence the detour via the metadata listing (see
 * `schemaNsUri`).
 */
export interface AtlasProvider {
  client: ModelAtlasClient
  scopeName: string
  stage: string
  registryName?: string
}

/**
 * What a provider holds: nsURI → objectId, from its metadata listing.
 *
 * List first, then fetch on purpose — the only reliable way. A schema's
 * `objectId` is server-dependent (UUID or base64 of the nsURI), and only the
 * metadata says which nsURI is behind it. Side effect: a "not found" is then a
 * statement about what the provider holds, not about a guessed URL.
 */
async function listingOf(p: AtlasProvider): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const xmi = p.registryName
    ? await p.client.listObjects(p.scopeName, p.registryName, p.stage)
    : await p.client.listSchemas(p.scopeName, p.stage)
  for (const meta of parseMetadataListXmi(xmi)) {
    const nsURI = schemaNsUri(meta, meta.objectId)
    if (nsURI) map.set(nsURI, meta.objectId)
  }
  return map
}

/** Fetches one schema from exactly one provider. */
async function schemaFrom(
  p: AtlasProvider,
  nsURI: string,
  listings: Map<AtlasProvider, Map<string, string>>,
): Promise<string | null> {
  let listing = listings.get(p)
  if (!listing) {
    listing = await listingOf(p)
    listings.set(p, listing)
  }
  const objectId = listing.get(nsURI)
  if (!objectId) return null

  if (p.registryName) {
    return p.client.getObjectContent(p.scopeName, p.registryName, p.stage, objectId)
  }
  // Shortcut: the content endpoint takes the nsURI. Older servers address it
  // by objectId — hence the second attempt.
  const byNsUri = await p.client.getSchemaContent(p.scopeName, p.stage, nsURI)
  if (byNsUri && byNsUri.trim()) return byNsUri
  if (objectId === nsURI) return null
  return p.client.getSchemaContent(p.scopeName, p.stage, objectId)
}

/**
 * Fetches the Ecore for each nsURI from the first provider that has it.
 * Returns nsURI → Ecore source. What is nowhere is missing from the map.
 */
export async function fetchSchemas(
  nsUris: string[],
  providers: AtlasProvider[],
  report?: string[],
  known?: Set<string>,
): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  // Fetch each provider's listing only once, even for several nsURIs
  const listings = new Map<AtlasProvider, Map<string, string>>()
  for (const nsURI of nsUris) {
    for (const p of providers) {
      try {
        const content = await schemaFrom(p, nsURI, listings)
        if (content && content.trim()) {
          found.set(nsURI, content)
          break
        }
      } catch (e) {
        report?.push(`${describeProvider(p)}: ${(e as Error)?.message || e}`)
      }
    }
  }
  for (const [p, listing] of listings) {
    report?.push(`${describeProvider(p)}: ${listing.size} Schema(s)`)
    // What a provider holds is the only counter-check to "it is not there": a
    // typo in the nsURI or a skewed metadata mapping only shows when the
    // listed nsURIs are put next to it.
    for (const nsURI of listing.keys()) known?.add(nsURI)
  }
  return found
}

/** One provider in a single word — for messages. */
export function describeProvider(p: AtlasProvider): string {
  return `${p.scopeName}/${p.registryName ?? '(shortcut)'}/${p.stage}`
}

/**
 * All stages of a scope as providers, `preferred` first.
 *
 * A schema rarely sits in the same stage as the instance — the instance's
 * stage is still the most likely one, and after that the server's order
 * counts.
 */
export function providersForScope(
  client: ModelAtlasClient,
  scopeName: string,
  stages: string[],
  preferred?: string,
  registryName?: string,
): AtlasProvider[] {
  const ordered = preferred
    ? [preferred, ...stages.filter((s) => s !== preferred)]
    : [...stages]
  return ordered.map((stage) => ({ client, scopeName, stage, registryName }))
}

/** No sensible scope hierarchy is deeper — and cycles end here. */
const MAX_SCOPE_DEPTH = 10

/**
 * All providers of a scope **including its inherited parents**.
 *
 * Inheritance is the normal case: shared metamodels live in the platform
 * scope, and a child scope's registry listing does not carry them. Looking
 * only there never finds them.
 *
 * For each scope the server itself says which registry holds the schemas and
 * which stages exist. The `/schema` shortcut only applies when no schema
 * registry of its own is declared — otherwise the server answers 400; and if
 * the registry is itself called `schema`, it would be the same listing twice.
 */
export async function providersForScopeChain(
  client: ModelAtlasClient,
  scopeName: string,
  preferredStage?: string,
): Promise<AtlasProvider[]> {
  const providers: AtlasProvider[] = []
  const seen = new Set<string>()
  let current: string | undefined = scopeName

  for (let depth = 0; current && depth < MAX_SCOPE_DEPTH; depth++) {
    if (seen.has(current)) break
    seen.add(current)

    let schemaRegistry: string | undefined
    let stages: string[] = []
    let parentScope: string | undefined
    try {
      const scopeXmi = await client.getScope(current)
      const scope = scopeXmi ? parseScopeXmi(scopeXmi) : null
      parentScope = scope?.parentScope || undefined
      const registries = (scope?.registries ?? []) as Array<{
        name?: string
        type?: string
        stages?: Array<{ name?: string }>
      }>
      schemaRegistry = registries.find((r) => r?.type === 'SCHEMA')?.name
      const own = registries.filter((r) => !schemaRegistry || r.name === schemaRegistry)
      stages = [
        ...new Set(
          own.flatMap((r) => (r.stages ?? []).map((st) => st.name).filter(Boolean) as string[]),
        ),
      ]
    } catch {
      // Without a scope answer the instance's own stage is all we have
    }
    if (stages.length === 0 && preferredStage) stages = [preferredStage]

    providers.push(...providersForScope(client, current, stages, preferredStage, schemaRegistry))
    if (schemaRegistry && schemaRegistry !== 'schema') {
      providers.push(...providersForScope(client, current, stages, preferredStage))
    }
    current = parentScope
  }

  return providers
}

/**
 * A URI converter that resolves nsURIs through a chain of Atlas providers.
 * If none resolves, the optional fallback takes over (e.g. local files).
 */
export function createAtlasURIConverter(
  providers: AtlasProvider[],
  fallback?: URIConverter,
): URIConverter {
  return {
    normalize(uri: URI): URI {
      return fallback?.normalize(uri) ?? uri
    },

    async createInputStream(uri: URI): Promise<ReadableStream> {
      const nsURI = uri.toString()
      const found = await fetchSchemas([nsURI], providers)
      const content = found.get(nsURI)
      if (content !== undefined) {
        return new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(content))
            controller.close()
          },
        })
      }

      if (fallback) return fallback.createInputStream(uri)
      throw new Error(`Schema not found: ${nsURI}`)
    },

    async exists(uri: URI): Promise<boolean> {
      const nsURI = uri.toString()
      const found = await fetchSchemas([nsURI], providers)
      if (found.has(nsURI)) return true
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
    },
  }
}
