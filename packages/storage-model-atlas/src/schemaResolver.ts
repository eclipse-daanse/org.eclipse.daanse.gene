/**
 * Schemas eines Model-Atlas-Scopes auflösen.
 *
 * In EMF ist der nsURI eines Packages ein ganz normaler Resource-URI, und der
 * URIConverter des ResourceSet sagt, wo das Ecore wirklich liegt
 * (`XMLHandler.getPackageForURI` in org.eclipse.emf.ecore.xmi holt es von dort
 * und stellt es selbst in die Registry). Dieses Paket kennt den Ort — also
 * gehört der Converter hierher, nicht zu einem UI-Plugin.
 *
 * Der XMI-Loader von emf.ts fragt ihn beim Parsen allerdings nicht: fehlt ein
 * nsURI in der Registry, bricht er sofort ab (emf.ts#88). Solange das so ist,
 * braucht der Aufrufer die Packages **vor** dem Laden — dafür `collectNsUris`
 * und `fetchSchemas`, die denselben Weg ohne den Umweg über den Converter
 * gehen. Fällt weg, sobald der Loader nachlädt.
 */

import type { URIConverter } from '@emfts/core'
import { URI } from '@emfts/core'
import { ModelAtlasClient } from './ModelAtlasClient'
import { parseMetadataListXmi } from './AtlasResourceSet'
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
 * Namensräume, die nie ein Domänen-Package sind: Sie stehen in jedem Dokument
 * und sind entweder eingebaut oder rein technisch.
 */
const TECHNISCHE_NS = new Set([
  'http://www.omg.org/XMI',
  'http://www.w3.org/2001/XMLSchema-instance',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.eclipse.org/emf/2002/Ecore',
  'http://www.eclipse.org/emf/2003/XMLType',
])

const XMLNS = /\sxmlns(?::[A-Za-z_][\w.-]*)?\s*=\s*"([^"]*)"/g

/**
 * Die nsURIs, die ein Dokument braucht — aus seinen xmlns-Deklarationen.
 *
 * Das ist dieselbe Quelle, aus der der Loader seine Präfixe auflöst; er nennt
 * im Fehlerfall aber nur das Präfix, nicht den nsURI. Deshalb hier selbst
 * lesen, statt den Fehler auszuwerten.
 */
export function collectNsUris(xmi: string): string[] {
  const gefunden = new Set<string>()
  // Nur der Dokumentkopf ist interessant; xmlns steht am Wurzelelement.
  for (const treffer of xmi.matchAll(XMLNS)) {
    const nsURI = treffer[1]?.trim()
    if (nsURI && !TECHNISCHE_NS.has(nsURI)) gefunden.add(nsURI)
  }
  return [...gefunden]
}

/** nsURI → objectId einer benannten Schema-Registry, einmal je Fundstelle. */
async function objectIdsOf(p: AtlasProvider): Promise<Map<string, string>> {
  const karte = new Map<string, string>()
  if (!p.registryName) return karte
  const xmi = await p.client.listObjects(p.scopeName, p.registryName, p.stage)
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
  karten: Map<AtlasProvider, Map<string, string>>,
): Promise<string | null> {
  if (!p.registryName) {
    // Kurzweg: der Server kennt seine Schemas unter dem nsURI
    return p.client.getSchemaContent(p.scopeName, p.stage, nsURI)
  }
  let karte = karten.get(p)
  if (!karte) {
    karte = await objectIdsOf(p)
    karten.set(p, karte)
  }
  const objectId = karte.get(nsURI)
  if (!objectId) return null
  return p.client.getObjectContent(p.scopeName, p.registryName, p.stage, objectId)
}

/**
 * Holt zu jedem nsURI das Ecore aus der ersten Stelle, die es kennt.
 * Rückgabe: nsURI → Ecore-Quelltext. Was nirgends liegt, fehlt in der Karte.
 */
export async function fetchSchemas(
  nsUris: string[],
  providers: AtlasProvider[],
): Promise<Map<string, string>> {
  const gefunden = new Map<string, string>()
  // Listen je Fundstelle nur einmal holen, auch bei mehreren nsURIs
  const karten = new Map<AtlasProvider, Map<string, string>>()
  for (const nsURI of nsUris) {
    for (const p of providers) {
      try {
        const inhalt = await schemaVon(p, nsURI, karten)
        if (inhalt && inhalt.trim()) {
          gefunden.set(nsURI, inhalt)
          break
        }
      } catch {
        // Diese Stelle antwortet nicht — die nächste versuchen
      }
    }
  }
  return gefunden
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
