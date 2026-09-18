/**
 * Fehlende Metamodelle vor dem Laden einer Instanz beschaffen.
 *
 * In EMF wäre das die Aufgabe des ResourceSet: `XMLHandler.getPackageForURI`
 * nimmt einen unbekannten nsURI als Resource-URI, holt ihn über den
 * URIConverter und stellt das Package selbst in die Registry. Der Loader von
 * emf.ts tut das nicht — er bricht beim ersten unbekannten Präfix ab
 * (emf.ts#88) und nennt dabei nicht einmal den nsURI. Also wird hier vorher
 * aufgelöst: nsURIs aus dem Dokument lesen, fehlende aus dem Model Atlas
 * holen, über den gewohnten Modell-Weg registrieren.
 *
 * gene-app ist der Ort dafür, weil nur hier Explorer, Atlas-Anbindung und
 * Model Browser zusammenkommen. Der Atlas liefert den Ort
 * (`storage-model-atlas`), der Model Browser registriert.
 *
 * Fällt weg, sobald emf.ts#88 behoben ist — dann genügt der URIConverter am
 * ResourceSet.
 */

import { EPackageRegistry } from '@emfts/core'

/** Eine Fundstelle, wie `storage-model-atlas` sie versteht. */
interface Fundstelle {
  client: any
  scopeName: string
  stage: string
}

export interface PackageResolutionResult {
  /** nsURIs, die nachgeladen und registriert wurden */
  registered: string[]
  /** nsURIs, die nirgends zu finden waren */
  missing: string[]
  /** Wo gesucht wurde und was dort lag — für die Fehlersuche */
  searched: string[]
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
function atlasHandle(entry: any): any | null {
  const handle = entry?.handle
  return handle?.atlasBaseUrl && handle?.scopeName ? handle : null
}

/**
 * Die Fundstellen für eine Instanz: erst der Scope, aus dem sie stammt (ihre
 * eigene Stage zuerst), dann die im Workspace konfigurierte Resolver-Kette.
 */
async function fundstellen(entry: any, editorConfig: any): Promise<Fundstelle[]> {
  const { ModelAtlasClient, providersForScope, parseScopeXmi } = await import('storage-model-atlas')
  const stellen: Fundstelle[] = []

  // 1. Implizit: der Scope der Instanz. Welche Registry die Schemas führt und
  //    welche Stages es gibt, sagt der Scope selbst.
  const handle = atlasHandle(entry)
  if (handle) {
    const client = new ModelAtlasClient({ baseUrl: handle.atlasBaseUrl, token: handle.token })
    let schemaRegistry: string | undefined
    let stages: string[] = []
    try {
      const scopeXmi = await client.getScope(handle.scopeName)
      const scope = scopeXmi ? parseScopeXmi(scopeXmi) : null
      const registries = (scope?.registries || []) as any[]
      // Der Kurzweg '/schema' gilt nur, wenn der Scope keine eigene
      // Schema-Registry ausweist — sonst antwortet der Server mit 400.
      schemaRegistry = registries.find((r) => r?.type === 'SCHEMA')?.name
      const eigene = registries.filter((r) => !schemaRegistry || r?.name === schemaRegistry)
      stages = [
        ...new Set(
          eigene.flatMap((r: any) => (r.stages || []).map((s: any) => s.name).filter(Boolean)),
        ),
      ] as string[]
    } catch {
      // Ohne Scope-Antwort bleibt die Stage der Instanz
    }
    if (stages.length === 0 && handle.stage) stages = [handle.stage]
    stellen.push(
      ...providersForScope(client, handle.scopeName, stages, handle.stage, schemaRegistry),
    )
    // Manche Server führen Schemas zusätzlich unter dem Kurzweg '/schema'.
    // Listet der nichts, kostet der Versuch nur eine leere Antwort.
    if (schemaRegistry) {
      stellen.push(...providersForScope(client, handle.scopeName, stages, handle.stage))
    }
  }

  // 2. Ergänzend: die Resolver-Kette aus den Workspace Settings
  const chain = editorConfig?.packageResolverChain?.value
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

  return stellen
}

/**
 * Sorgt dafür, dass alle Packages registriert sind, die das Dokument braucht.
 *
 * Wirft nicht: was nicht zu finden ist, steht in `missing` und führt beim
 * anschließenden Laden zur gewohnten Meldung — nur eben mit dem nsURI im Text.
 */
export async function ensurePackagesForInstance(
  xmiContent: string,
  entry: any,
  deps: {
    editorConfig?: any
    modelBrowserComposables?: { loadEcoreFile: (content: string, path: string) => Promise<any> }
    packageRegistry?: { getEPackage(nsURI: string): unknown }
  },
): Promise<PackageResolutionResult> {
  const leer: PackageResolutionResult = { registered: [], missing: [], searched: [] }
  const loadEcoreFile = deps.modelBrowserComposables?.loadEcoreFile
  if (!loadEcoreFile) return leer

  const { collectNsUris, fetchSchemas } = await import('storage-model-atlas')
  const registry = deps.packageRegistry ?? EPackageRegistry.INSTANCE
  const fehlend = collectNsUris(xmiContent).filter((nsURI) => !registry.getEPackage(nsURI))
  if (fehlend.length === 0) return leer

  const stellen = await fundstellen(entry, deps.editorConfig)
  if (stellen.length === 0) return { registered: [], missing: fehlend, searched: [] }

  const searched: string[] = []
  const gefunden = await fetchSchemas(fehlend, stellen, searched)
  const registered: string[] = []
  for (const [nsURI, ecore] of gefunden) {
    try {
      // Der nsURI ist die Herkunft — damit greift die Dedup des Model Browsers
      // je Package, und ein zweites Laden parst nicht neu.
      await loadEcoreFile(ecore, nsURI)
      registered.push(nsURI)
    } catch (e) {
      console.warn('[PackageResolution] Schema nicht ladbar:', nsURI, e)
    }
  }

  return {
    registered,
    missing: fehlend.filter((nsURI) => !registered.includes(nsURI)),
    searched,
  }
}
