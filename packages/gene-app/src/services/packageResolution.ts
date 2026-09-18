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
  /** Welche nsURIs die durchsuchten Stellen führen — Gegenprobe zu „ist nicht da" */
  known: string[]
  /** Warum nichts passiert ist, falls nichts passiert ist */
  note?: string
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
 * Die Fundstellen eines einzelnen Scopes, und wie sein Elternscope heisst.
 *
 * Welche Registry die Schemas führt und welche Stages es gibt, sagt der Scope
 * selbst. Der Kurzweg `/schema` gilt nur, wenn er keine eigene
 * Schema-Registry ausweist — sonst antwortet der Server mit 400.
 */
async function stellenFuerScope(
  client: any,
  scopeName: string,
  bevorzugteStage: string | undefined,
  hilfen: {
    providersForScope: (...args: any[]) => Fundstelle[]
    parseScopeXmi: (xmi: string) => any
  },
): Promise<{ stellen: Fundstelle[]; parentScope?: string }> {
  let schemaRegistry: string | undefined
  let stages: string[] = []
  let parentScope: string | undefined
  try {
    const scopeXmi = await client.getScope(scopeName)
    const scope = scopeXmi ? hilfen.parseScopeXmi(scopeXmi) : null
    parentScope = scope?.parentScope || undefined
    const registries = (scope?.registries || []) as any[]
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
  if (stages.length === 0 && bevorzugteStage) stages = [bevorzugteStage]

  const stellen = hilfen.providersForScope(
    client,
    scopeName,
    stages,
    bevorzugteStage,
    schemaRegistry,
  )
  // Manche Server führen Schemas zusätzlich unter dem Kurzweg '/schema'.
  // Listet der nichts, kostet der Versuch nur eine leere Antwort — heisst
  // die Registry aber selbst 'schema', waere es derselbe Bestand zweimal.
  if (schemaRegistry && schemaRegistry !== 'schema') {
    stellen.push(...hilfen.providersForScope(client, scopeName, stages, bevorzugteStage))
  }
  return { stellen, parentScope }
}

/** Mehr Ebenen hat keine sinnvolle Scope-Hierarchie — und Zyklen enden hier. */
const MAX_SCOPE_TIEFE = 10

/**
 * Die Fundstellen für eine Instanz: der Scope, aus dem sie stammt, **samt
 * seiner geerbten Eltern-Scopes**, dann die im Workspace konfigurierte
 * Resolver-Kette.
 *
 * Die Vererbung ist der Regelfall, nicht die Ausnahme: gemeinsame Metamodelle
 * liegen im Plattform-Scope, und die Registry-Liste eines Kind-Scopes führt
 * sie nicht mit auf. Wer nur dort sucht, findet sie nie.
 */
async function fundstellen(entry: any, editorConfig: any): Promise<Fundstelle[]> {
  const { ModelAtlasClient, providersForScope, parseScopeXmi } = await import('storage-model-atlas')
  const hilfen = { providersForScope, parseScopeXmi } as any
  const stellen: Fundstelle[] = []

  // 1. Implizit: der Scope der Instanz und seine Eltern
  const handle = atlasHandle(entry)
  if (handle) {
    const client = new ModelAtlasClient({ baseUrl: handle.atlasBaseUrl, token: handle.token })
    const gesehen = new Set<string>()
    let scopeName: string | undefined = handle.scopeName
    for (let tiefe = 0; scopeName && tiefe < MAX_SCOPE_TIEFE; tiefe++) {
      if (gesehen.has(scopeName)) break
      gesehen.add(scopeName)
      const ergebnis = await stellenFuerScope(client, scopeName, handle.stage, hilfen)
      stellen.push(...ergebnis.stellen)
      scopeName = ergebnis.parentScope
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
  const leer: PackageResolutionResult = { registered: [], missing: [], searched: [], known: [] }
  const loadEcoreFile = deps.modelBrowserComposables?.loadEcoreFile
  if (!loadEcoreFile) {
    return { ...leer, note: 'Model Browser nicht verfügbar — nichts registrierbar' }
  }

  const { collectNsUris, fetchSchemas } = await import('storage-model-atlas')
  const registry = deps.packageRegistry ?? EPackageRegistry.INSTANCE
  const fehlend = collectNsUris(xmiContent).filter((nsURI) => !registry.getEPackage(nsURI))
  if (fehlend.length === 0) return { ...leer, note: 'alle Packages bereits registriert' }

  const stellen = await fundstellen(entry, deps.editorConfig)
  if (stellen.length === 0) {
    return {
      registered: [],
      missing: fehlend,
      searched: [],
      known: [],
      note: 'keine Fundstelle — die Datei nennt keine Atlas-Herkunft, und es ist keine Resolver-Kette konfiguriert',
    }
  }

  const searched: string[] = []
  const bekannt = new Set<string>()
  const gefunden = await fetchSchemas(fehlend, stellen, searched, bekannt)
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
    known: [...bekannt],
  }
}
