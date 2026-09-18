/**
 * Resolving metamodels from a Model Atlas — the way EMF has for it.
 *
 * In EMF a package's nsURI is an ordinary resource URI, and the **resource
 * set's URI converter** says where the Ecore really is:
 * `XMLHandler.getPackageForURI` fetches it from there and puts it into the
 * registry itself. Since `@emfts/core` 0.3 (emf.ts#88) the loader can do that
 * too — `loadFromStringAsync` collects the unknown nsURIs on the first pass,
 * fetches them through the converter and parses again.
 *
 * So all that happens here is **installing**: which providers apply to this
 * document (the scope it came from, including inherited parents, plus the
 * resolver chain configured in the workspace), and the converter for them on
 * the instance tree's resource set. The loading is the loader's job.
 *
 * gene-app is the place for it, because only here do the explorer, the Atlas
 * connection and the instance tree meet.
 */

/** What an explorer entry carries about its Atlas origin. */
interface AtlasHandle {
  atlasBaseUrl: string
  scopeName: string
  token?: string
  stage?: string
}

/** Reads a feature of an EObject, typed or reflective. */
function featureValue(obj: any, name: string): any {
  if (!obj) return undefined
  if (obj[name] !== undefined) return obj[name]
  if (typeof obj.eGet === 'function') {
    const feature = obj.eClass?.()?.getEStructuralFeature?.(name)
    if (feature) return obj.eGet(feature)
  }
  return undefined
}

/** Does this explorer entry carry an Atlas origin? */
function atlasHandle(entry: any): AtlasHandle | null {
  const handle = entry?.handle
  return handle?.atlasBaseUrl && handle?.scopeName ? (handle as AtlasHandle) : null
}

export interface AtlasResolutionSetup {
  /** Where the loader will look — for messages */
  searched: string[]
  /** Why nothing was installed, if nothing was */
  note?: string
}

/**
 * Hängt den Atlas-Converter für dieses Dokument ein.
 *
 * Wirft nicht: ohne Provider bleibt es beim bisherigen Verhalten, der Loader
 * meldet die offenen nsURIs dann selbst.
 */
export async function prepareAtlasResolution(
  entry: any,
  deps: {
    editorConfig?: any
    /** The instance tree's hook; the converter type comes from @emfts/core */
    instanceTreeComposables?: { setPackageURIConverter?: (c: never) => void }
  },
): Promise<AtlasResolutionSetup> {
  const install = deps.instanceTreeComposables?.setPackageURIConverter
  if (!install) {
    return { searched: [], note: 'Instanzbaum bietet keinen URIConverter-Haken' }
  }

  const { ModelAtlasClient, providersForScopeChain, createAtlasURIConverter, describeProvider } =
    await import('storage-model-atlas')

  const providers: any[] = []

  // 1. Implicit: the instance's own scope and its inherited parents
  const handle = atlasHandle(entry)
  if (handle) {
    const client = new ModelAtlasClient({ baseUrl: handle.atlasBaseUrl, token: handle.token })
    providers.push(...(await providersForScopeChain(client, handle.scopeName, handle.stage)))
  }

  // 2. In addition: the resolver chain from the workspace settings
  const chain = deps.editorConfig?.packageResolverChain?.value
  const resolvers = chain ? featureValue(chain.__v_raw || chain, 'resolvers') || [] : []
  for (const resolver of resolvers) {
    if ((featureValue(resolver, 'enabled') ?? true) === false) continue
    if (String(featureValue(resolver, 'kind')) !== 'MODEL_ATLAS') continue
    const baseUrl = featureValue(resolver, 'baseUrl')
    const scopeName = featureValue(resolver, 'scopeName')
    if (!baseUrl || !scopeName) continue
    providers.push({
      client: new ModelAtlasClient({ baseUrl, token: featureValue(resolver, 'token') }),
      scopeName,
      stage: featureValue(resolver, 'stage') || 'release',
    })
  }

  if (providers.length === 0) {
    return {
      searched: [],
      note: 'keine Fundstelle — die Datei nennt keine Atlas-Herkunft, und es ist keine Resolver-Kette konfiguriert',
    }
  }

  install(createAtlasURIConverter(providers) as never)
  return { searched: providers.map((p) => describeProvider(p)) }
}
