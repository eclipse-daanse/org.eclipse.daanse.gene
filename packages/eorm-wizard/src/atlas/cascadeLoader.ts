/**
 * Cascade-Nachladen referenzierter Modelle (T11): Ein Sensor-Schema
 * referenziert häufig Basis-Modelle (em310udl → lorawan). Beim Bezug aus dem
 * Atlas werden diese automatisch per nsURI nachgeladen — Muster nach
 * gene/packages/atlas-browser/src/composables/atlasURIConverter.ts, hier
 * bewusst VOR dem Laden über Text-Extraktion der Referenzen gelöst, weil der
 * emf.ts-XMI-Loader unauflösbare Querverweise nur verwirft (Warnung
 * "Forward ref UNRESOLVED"), statt Proxies zu hinterlassen.
 */
import type { EPackage } from '@emfts/core';
import { EPackageRegistry } from '@emfts/core';
import type { BasicResourceSet } from '@emfts/core';
import { newResourceSet, registerEcoreFromString } from '../emf/setup';
import type { AtlasModelSource } from './atlasSource';

const ECORE_NS = 'http://www.eclipse.org/emf/2002/Ecore';

/**
 * Extrahiert alle referenzierten Fremd-Dokumente (URI-Teil vor `#`) aus einem
 * .ecore-XMI-Text: `href="…"`, `eSuperTypes="… …"` (mehrwertig) und
 * `eType="prefix:Type URI#//…"`-Kurzformen. Lokale Referenzen (`#//…`) und
 * das Ecore-Metamodell werden ausgelassen.
 */
export function collectReferencedDocuments(ecoreXml: string): string[] {
  const documents = new Set<string>();

  const addRef = (ref: string): void => {
    const trimmed = ref.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const doc = trimmed.split('#')[0];
    if (!doc || doc === ECORE_NS) return;
    documents.add(doc);
  };

  for (const match of ecoreXml.matchAll(/\bhref="([^"]+)"/g)) {
    addRef(match[1]);
  }
  for (const match of ecoreXml.matchAll(/\beSuperTypes="([^"]+)"/g)) {
    for (const ref of match[1].split(/\s+/)) addRef(ref);
  }
  for (const match of ecoreXml.matchAll(/\beType="([^"]+)"/g)) {
    // Formate: "#//Local", "URI#//X" oder "ecore:EDataType URI#//X"
    const value = match[1];
    const parts = value.split(/\s+/);
    addRef(parts.length > 1 ? parts[1] : parts[0]);
  }

  return [...documents];
}

/**
 * EMF schreibt Verweise ins eigene Dokument teils als Dateinamen
 * (`waterpark_domain.ecore#//PersonState`). Solche Selbstreferenzen sind keine
 * fehlenden Fremdmodelle — sonst warnt der Assistent über ein Modell, das er
 * gerade selbst geladen hat.
 */
function isSelfReference(ref: string, ecoreXml: string): boolean {
  const ownName = ecoreXml.match(/<ecore:EPackage[^>]*?\bname="([^"]+)"/)?.[1];
  if (!ownName) return false;
  const base = (ref.split('/').pop() ?? ref).replace(/\.ecore$/, '');
  return base === ownName;
}

export interface CascadeLoadResult {
  /** Das eigentlich angeforderte Package (zuletzt geladen). */
  rootPackage: EPackage;
  /** Alle in diesem Lauf registrierten Packages (Abhängigkeiten zuerst). */
  loadedPackages: EPackage[];
  /** nsURIs geladener Abhängigkeiten. */
  loadedDependencies: string[];
  /** Referenzen, die weder registriert noch im Atlas auflösbar waren. */
  unresolved: string[];
}

function isRegistered(nsUri: string): boolean {
  return EPackageRegistry.INSTANCE.get(nsUri) != null;
}

/**
 * Lädt ein Schema aus dem Atlas inklusive seiner referenzierten Modelle
 * (rekursiv, Abhängigkeiten zuerst). Bereits registrierte nsURIs werden
 * übersprungen; nicht auflösbare Referenzen landen in `unresolved`.
 */
export async function loadSchemaWithDependencies(
  source: AtlasModelSource,
  nsUri: string,
  options: { maxDepth?: number } = {},
): Promise<CascadeLoadResult> {
  const maxDepth = options.maxDepth ?? 5;
  const loadedPackages: EPackage[] = [];
  const loadedDependencies: string[] = [];
  const unresolved: string[] = [];
  const visited = new Set<string>();
  // Gemeinsames ResourceSet, damit auch relative Datei-hrefs zwischen
  // zusammen geladenen Schemas auflösen.
  const sharedResourceSet = newResourceSet();

  const contentOf = async (uri: string): Promise<string | null> => {
    // Direktzugriff; falls der Server die nsURI so nicht kennt,
    // über die exakte Suche normalisieren.
    const direct = await source.getSchemaContent(uri);
    if (direct) return direct;
    const found = await source.findByNsUri(uri);
    return found ? source.getSchemaContent(found.nsUri) : null;
  };

  async function load(uri: string, depth: number): Promise<EPackage | undefined> {
    if (visited.has(uri)) return undefined;
    visited.add(uri);

    const content = await contentOf(uri);
    if (!content) {
      unresolved.push(uri);
      return undefined;
    }

    // Abhängigkeiten zuerst (der XMI-Loader löst nur bereits Registriertes auf)
    if (depth < maxDepth) {
      for (const ref of collectReferencedDocuments(content)) {
        if (visited.has(ref) || isRegistered(ref)) continue;
        if (isSelfReference(ref, content)) continue;
        const dep = await load(ref, depth + 1);
        if (dep) loadedDependencies.push(ref);
      }
    }

    const pkg = registerEcoreFromString(
      content,
      `atlas/${encodeURIComponent(uri)}.ecore`,
      sharedResourceSet,
    );
    loadedPackages.push(pkg);
    return pkg;
  }

  const rootPackage = await load(nsUri, 0);
  if (!rootPackage) {
    throw new Error(`Das Modell „${nsUri}" konnte aus dem Atlas nicht geladen werden.`);
  }
  return { rootPackage, loadedPackages, loadedDependencies, unresolved };
}

/**
 * Für den Upload-Pfad: prüft, welche referenzierten Dokumente eines
 * hochgeladenen .ecore weder mit hochgeladen noch registriert sind —
 * Grundlage für den Nutzerhinweis („Modell X referenziert Y …").
 */
export function findMissingReferences(files: { name: string; content: string }[]): string[] {
  const providedNames = new Set(files.map((f) => f.name));
  const missing = new Set<string>();
  for (const file of files) {
    for (const ref of collectReferencedDocuments(file.content)) {
      if (providedNames.has(ref)) continue;
      if (isRegistered(ref)) continue;
      if (isSelfReference(ref, file.content)) continue;
      missing.add(ref);
    }
  }
  return [...missing];
}
