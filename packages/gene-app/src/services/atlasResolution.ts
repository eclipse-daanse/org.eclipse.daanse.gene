/**
 * Metamodelle aus dem Model Atlas auflösen — auf dem Weg, den EMF dafür hat.
 *
 * In EMF ist der nsURI eines Packages ein gewöhnlicher Resource-URI, und der
 * **URIConverter des ResourceSet** sagt, wo das Ecore wirklich liegt:
 * `XMLHandler.getPackageForURI` holt es von dort und stellt es selbst in die
 * Registry. Seit `@emfts/core` 0.3 (emf.ts#88) kann der Loader das auch —
 * `loadFromStringAsync` sammelt beim ersten Durchgang die unbekannten nsURIs,
 * lädt sie über den Converter nach und parst erneut.
 *
 * Hier wird deshalb nur noch **eingehängt**: welche Fundstellen für dieses
 * Dokument gelten (der Scope, aus dem es stammt, samt geerbter Eltern, dazu
 * die im Workspace konfigurierte Resolver-Kette), und der Converter dazu ans
 * ResourceSet des Instanzbaums. Das Laden macht dann der Loader.
 *
 * gene-app ist der Ort dafür, weil nur hier Explorer, Atlas-Anbindung und
 * Instanzbaum zusammenkommen.
 */

/** Was ein Explorer-Eintrag über seine Atlas-Herkunft mitbringt. */
interface AtlasHandle {
  atlasBaseUrl: string
  scopeName: string
  token?: string
  stage?: string
}

/** Liest ein Feature eines EObject, egal ob getypt oder reflektiv. */
function featureValue(obj: any, name: string): any {
  if (!obj) return undefined
  if (obj[name] !== undefined) return obj[name]
  if (typeof obj.eGet === 'function') {
    const feature = obj.eClass?.()?.getEStructuralFeature?.(name)
    if (feature) return obj.eGet(feature)
  }
  return undefined
}

/** Steckt in dem Explorer-Eintrag eine Atlas-Herkunft? */
function atlasHandle(entry: any): AtlasHandle | null {
  const handle = entry?.handle
  return handle?.atlasBaseUrl && handle?.scopeName ? (handle as AtlasHandle) : null
}

export interface AtlasResolutionSetup {
  /** Wo gesucht werden wird — für Meldungen */
  searched: string[]
  /** Warum nichts eingehängt wurde, falls nichts eingehängt wurde */
  note?: string
}

/**
 * Hängt den Atlas-Converter für dieses Dokument ein.
 *
 * Wirft nicht: ohne Fundstelle bleibt es beim bisherigen Verhalten, der Loader
 * meldet die offenen nsURIs dann selbst.
 */
export async function prepareAtlasResolution(
  entry: any,
  deps: {
    editorConfig?: any
    /** Der Haken des Instanzbaums; der Converter-Typ kommt aus @emfts/core */
    instanceTreeComposables?: { setPackageURIConverter?: (c: never) => void }
  },
): Promise<AtlasResolutionSetup> {
  const einhaengen = deps.instanceTreeComposables?.setPackageURIConverter
  if (!einhaengen) {
    return { searched: [], note: 'Instanzbaum bietet keinen URIConverter-Haken' }
  }

  const { ModelAtlasClient, providersForScopeChain, createAtlasURIConverter, describeProvider } =
    await import('storage-model-atlas')

  const stellen: any[] = []

  // 1. Implizit: der Scope der Instanz und seine geerbten Eltern
  const handle = atlasHandle(entry)
  if (handle) {
    const client = new ModelAtlasClient({ baseUrl: handle.atlasBaseUrl, token: handle.token })
    stellen.push(...(await providersForScopeChain(client, handle.scopeName, handle.stage)))
  }

  // 2. Ergänzend: die Resolver-Kette aus den Workspace Settings
  const chain = deps.editorConfig?.packageResolverChain?.value
  const resolvers = chain ? featureValue(chain.__v_raw || chain, 'resolvers') || [] : []
  for (const resolver of resolvers) {
    if ((featureValue(resolver, 'enabled') ?? true) === false) continue
    if (String(featureValue(resolver, 'kind')) !== 'MODEL_ATLAS') continue
    const baseUrl = featureValue(resolver, 'baseUrl')
    const scopeName = featureValue(resolver, 'scopeName')
    if (!baseUrl || !scopeName) continue
    stellen.push({
      client: new ModelAtlasClient({ baseUrl, token: featureValue(resolver, 'token') }),
      scopeName,
      stage: featureValue(resolver, 'stage') || 'release',
    })
  }

  if (stellen.length === 0) {
    return {
      searched: [],
      note: 'keine Fundstelle — die Datei nennt keine Atlas-Herkunft, und es ist keine Resolver-Kette konfiguriert',
    }
  }

  einhaengen(createAtlasURIConverter(stellen) as never)
  return { searched: stellen.map((p) => describeProvider(p)) }
}
