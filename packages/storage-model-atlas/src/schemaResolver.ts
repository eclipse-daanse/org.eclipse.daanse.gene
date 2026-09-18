/**
 * Schemas eines Model-Atlas-Scopes auflösen.
 *
 * In EMF ist der nsURI eines Packages ein ganz normaler Resource-URI, und der
 * URIConverter des ResourceSet sagt, wo das Ecore wirklich liegt
 * (`XMLHandler.getPackageForURI` in org.eclipse.emf.ecore.xmi holt es von dort
 * und stellt es selbst in die Registry). Dieses Paket kennt den Ort — also
 * gehört der Converter hierher, nicht zu einem UI-Plugin.
 *
 * Seit `@emfts/core` 0.3 fragt der Loader ihn auch: `loadFromStringAsync`
 * sammelt beim ersten Durchgang die unbekannten nsURIs, holt sie über den
 * Converter und parst erneut (emf.ts#88). Der Aufrufer muss nur die
 * Fundstellen kennen — `providersForScopeChain` — und den Converter
 * einhängen.
 */

import type { URIConverter } from '@emfts/core'
import { URI } from '@emfts/core'
import { ModelAtlasClient } from './ModelAtlasClient'
import { parseMetadataListXmi, parseScopeXmi } from './AtlasResourceSet'
import { schemaNsUri } from './schemaIdentity'

/**
 * Eine Fundstelle: ein Scope in einer Stage.
 *
 * `registryName` nennt die Schema-Registry, wenn der Scope eine eigene hat.
 * Der Kurzweg `/{scope}/schema/...` gilt nur für die synthetische Registry;
 * eine benannte wird über ihren Namen angesprochen, und dort ist die
 * `objectId` eines Schemas serverabhängig — deshalb der Umweg über die
 * Metadatenliste (s. `schemaNsUri`).
 */
export interface AtlasProvider {
  client: ModelAtlasClient
  scopeName: string
  stage: string
  registryName?: string
}

/**
 * Was eine Fundstelle führt: nsURI → objectId, aus ihrer Metadatenliste.
 *
 * Erst listen, dann gezielt holen — das ist der einzige verlässliche Weg. Die
 * `objectId` eines Schemas ist serverabhängig (UUID oder Base64 des nsURI),
 * und nur die Metadaten sagen, welcher nsURI dahintersteckt. Nebeneffekt: ein
 * „nicht gefunden" ist danach eine Aussage über den Bestand der Stelle und
 * nicht über eine geratene URL.
 */
async function bestandVon(p: AtlasProvider): Promise<Map<string, string>> {
  const karte = new Map<string, string>()
  const xmi = p.registryName
    ? await p.client.listObjects(p.scopeName, p.registryName, p.stage)
    : await p.client.listSchemas(p.scopeName, p.stage)
  for (const meta of parseMetadataListXmi(xmi)) {
    const nsURI = schemaNsUri(meta, meta.objectId)
    if (nsURI) karte.set(nsURI, meta.objectId)
  }
  return karte
}

/** Holt ein Schema von genau einer Fundstelle. */
async function schemaVon(
  p: AtlasProvider,
  nsURI: string,
  bestaende: Map<AtlasProvider, Map<string, string>>,
): Promise<string | null> {
  let bestand = bestaende.get(p)
  if (!bestand) {
    bestand = await bestandVon(p)
    bestaende.set(p, bestand)
  }
  const objectId = bestand.get(nsURI)
  if (!objectId) return null

  if (p.registryName) {
    return p.client.getObjectContent(p.scopeName, p.registryName, p.stage, objectId)
  }
  // Kurzweg: der Content-Endpunkt nimmt den nsURI. Ältere Server adressieren
  // ihn über die objectId — deshalb der zweite Versuch.
  const ueberNsUri = await p.client.getSchemaContent(p.scopeName, p.stage, nsURI)
  if (ueberNsUri && ueberNsUri.trim()) return ueberNsUri
  if (objectId === nsURI) return null
  return p.client.getSchemaContent(p.scopeName, p.stage, objectId)
}

/**
 * Holt zu jedem nsURI das Ecore aus der ersten Stelle, die es kennt.
 * Rückgabe: nsURI → Ecore-Quelltext. Was nirgends liegt, fehlt in der Karte.
 */
export async function fetchSchemas(
  nsUris: string[],
  providers: AtlasProvider[],
  bericht?: string[],
  bekannt?: Set<string>,
): Promise<Map<string, string>> {
  const gefunden = new Map<string, string>()
  // Listen je Fundstelle nur einmal holen, auch bei mehreren nsURIs
  const bestaende = new Map<AtlasProvider, Map<string, string>>()
  for (const nsURI of nsUris) {
    for (const p of providers) {
      try {
        const inhalt = await schemaVon(p, nsURI, bestaende)
        if (inhalt && inhalt.trim()) {
          gefunden.set(nsURI, inhalt)
          break
        }
      } catch (e) {
        bericht?.push(`${describeProvider(p)}: ${(e as Error)?.message || e}`)
      }
    }
  }
  for (const [p, bestand] of bestaende) {
    bericht?.push(`${describeProvider(p)}: ${bestand.size} Schema(s)`)
    // Was dort liegt, ist die einzige Gegenprobe zu "ist nicht da": ein
    // Tippfehler im nsURI oder eine schiefe Metadaten-Abbildung sieht man
    // nur, wenn man die gefuehrten nsURIs danebenlegt.
    for (const nsURI of bestand.keys()) bekannt?.add(nsURI)
  }
  return gefunden
}

/** Eine Fundstelle in einem Wort — für Meldungen. */
export function describeProvider(p: AtlasProvider): string {
  return `${p.scopeName}/${p.registryName ?? '(kurzweg)'}/${p.stage}`
}

/**
 * Alle Stages eines Scopes als Fundstellen, `bevorzugt` zuerst.
 *
 * Ein Schema liegt selten in derselben Stage wie die Instanz — die Stage der
 * Instanz ist trotzdem die wahrscheinlichste, und danach zählt die Reihenfolge
 * des Servers.
 */
export function providersForScope(
  client: ModelAtlasClient,
  scopeName: string,
  stages: string[],
  bevorzugt?: string,
  registryName?: string,
): AtlasProvider[] {
  const geordnet = bevorzugt
    ? [bevorzugt, ...stages.filter((s) => s !== bevorzugt)]
    : [...stages]
  return geordnet.map((stage) => ({ client, scopeName, stage, registryName }))
}

/** Mehr Ebenen hat keine sinnvolle Scope-Hierarchie — und Zyklen enden hier. */
const MAX_SCOPE_TIEFE = 10

/**
 * Alle Fundstellen eines Scopes **samt seiner geerbten Eltern**.
 *
 * Die Vererbung ist der Regelfall: gemeinsame Metamodelle liegen im
 * Plattform-Scope, und die Registry-Liste eines Kind-Scopes führt sie nicht
 * mit auf. Wer nur dort sucht, findet sie nie.
 *
 * Je Scope sagt der Server selbst, welche Registry die Schemas führt und
 * welche Stages es gibt. Der Kurzweg `/schema` gilt nur, wenn keine eigene
 * Schema-Registry ausgewiesen ist — sonst antwortet er mit 400; heisst die
 * Registry selbst `schema`, wäre er derselbe Bestand ein zweites Mal.
 */
export async function providersForScopeChain(
  client: ModelAtlasClient,
  scopeName: string,
  bevorzugteStage?: string,
): Promise<AtlasProvider[]> {
  const stellen: AtlasProvider[] = []
  const gesehen = new Set<string>()
  let aktuell: string | undefined = scopeName

  for (let tiefe = 0; aktuell && tiefe < MAX_SCOPE_TIEFE; tiefe++) {
    if (gesehen.has(aktuell)) break
    gesehen.add(aktuell)

    let schemaRegistry: string | undefined
    let stages: string[] = []
    let parentScope: string | undefined
    try {
      const scopeXmi = await client.getScope(aktuell)
      const scope = scopeXmi ? parseScopeXmi(scopeXmi) : null
      parentScope = scope?.parentScope || undefined
      const registries = (scope?.registries ?? []) as Array<{
        name?: string
        type?: string
        stages?: Array<{ name?: string }>
      }>
      schemaRegistry = registries.find((r) => r?.type === 'SCHEMA')?.name
      const eigene = registries.filter((r) => !schemaRegistry || r.name === schemaRegistry)
      stages = [
        ...new Set(
          eigene.flatMap((r) => (r.stages ?? []).map((st) => st.name).filter(Boolean) as string[]),
        ),
      ]
    } catch {
      // Ohne Scope-Antwort bleibt die Stage, aus der die Instanz kommt
    }
    if (stages.length === 0 && bevorzugteStage) stages = [bevorzugteStage]

    stellen.push(...providersForScope(client, aktuell, stages, bevorzugteStage, schemaRegistry))
    if (schemaRegistry && schemaRegistry !== 'schema') {
      stellen.push(...providersForScope(client, aktuell, stages, bevorzugteStage))
    }
    aktuell = parentScope
  }

  return stellen
}

/**
 * Ein URIConverter, der nsURIs über eine Kette von Atlas-Fundstellen auflöst.
 * Löst keine auf, greift der optionale Vorgänger (z. B. lokale Dateien).
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
      const gefunden = await fetchSchemas([nsURI], providers)
      const inhalt = gefunden.get(nsURI)
      if (inhalt !== undefined) {
        return new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(inhalt))
            controller.close()
          },
        })
      }

      if (fallback) return fallback.createInputStream(uri)
      throw new Error(`Schema not found: ${nsURI}`)
    },

    async exists(uri: URI): Promise<boolean> {
      const nsURI = uri.toString()
      const gefunden = await fetchSchemas([nsURI], providers)
      if (gefunden.has(nsURI)) return true
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
