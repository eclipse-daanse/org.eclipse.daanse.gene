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
  /** The providers themselves, to fetch schemas again afterwards */
  providers: unknown[]
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
    return { searched: [], providers: [], note: 'Instanzbaum bietet keinen URIConverter-Haken' }
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
      providers: [],
      note: 'keine Fundstelle — die Datei nennt keine Atlas-Herkunft, und es ist keine Resolver-Kette konfiguriert',
    }
  }

  install(createAtlasURIConverter(providers) as never)
  return { searched: providers.map((p) => describeProvider(p)), providers }
}

/**
 * Registers the metamodels a loaded document uses as models, too.
 *
 * The loader only needs them in the package registry, and that is where its
 * URI converter puts them. The model browser keeps its own list, and the
 * editor asks *that* one which classes fit a reference — so a metamodel that
 * arrived only through the converter leaves the "Add child" menu empty for
 * every abstract type (#155).
 *
 * Registered is the **package instance the objects already stand on**, never a
 * freshly parsed copy: two instances of the same nsURI look alike but compare
 * false, and every "is this class a subtype of that reference's type?" is an
 * identity check.
 *
 * Returns the nsURIs newly registered.
 */
export function registerUsedModels(
  resource: unknown,
  deps: {
    modelBrowserComposables?: {
      registerLoadedPackage?: (ePackage: unknown, sourceFile: string) => unknown
      useSharedModelRegistry?: () => { allPackages: { value: Array<{ nsURI: string }> } }
    }
  },
): string[] {
  const register = deps.modelBrowserComposables?.registerLoadedPackage
  const registry = deps.modelBrowserComposables?.useSharedModelRegistry?.()
  if (!register || !registry) return []

  const known = new Set(registry.allPackages.value.map((p) => p.nsURI))
  const registered: string[] = []
  for (const ePackage of packagesOf(resource)) {
    const nsURI = ePackage.getNsURI?.()
    if (!nsURI || known.has(nsURI)) continue
    try {
      // The source is the nsURI: it did not come from a file, and the model
      // browser shows it under that name.
      register(ePackage, nsURI)
      known.add(nsURI)
      registered.push(nsURI)
    } catch (e) {
      console.warn('[AtlasResolution] Metamodell nicht als Modell registrierbar:', nsURI, e)
    }
  }
  return registered
}

/** Every package the objects of a resource stand on — the instances themselves. */
function packagesOf(resource: unknown): Array<{ getNsURI?: () => string | null }> {
  const contents = (resource as { getContents?: () => Iterable<unknown> })?.getContents?.()
  if (!contents) return []
  const found = new Map<string, { getNsURI?: () => string | null }>()
  const visit = (obj: any) => {
    const ePackage = obj?.eClass?.()?.getEPackage?.()
    const nsURI = ePackage?.getNsURI?.()
    if (nsURI && !found.has(nsURI)) found.set(nsURI, ePackage)
    for (const child of obj?.eContents?.() ?? []) visit(child)
  }
  for (const root of contents) visit(root)
  return [...found.values()]
}
