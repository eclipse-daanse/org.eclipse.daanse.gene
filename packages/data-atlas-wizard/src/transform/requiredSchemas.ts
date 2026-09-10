/**
 * Welche Schemas im Scope liegen müssen, damit der Model Atlas die
 * Konfiguration deserialisieren kann — in der Reihenfolge, in der sie
 * hochgeladen werden.
 *
 * `eorm` zuerst, dann `configuration.ecore`, dann die Domänenmodelle: der
 * Verweis auf `eorm#//EntityMappings` in `configuration.ecore` bleibt sonst
 * unaufgelöst (Plan, Abschnitt 5).
 */
import type { EPackage } from '@emfts/core';
import type { RequiredSchema } from '../atlas/publish';
import { CONFIGURATION_NS_URI, EORM_NS_URI } from '../emf/setup';
import configurationEcoreXml from '../assets/configuration.ecore?raw';
import eormEcoreXml from '../assets/eorm.ecore?raw';
import type { AtlasSetup } from '../generated';

/**
 * Der Inhalt der `.ecore` eines geladenen Packages.
 *
 * Das Package steckt in der Resource, aus der es geladen wurde — die kann es
 * wieder ausgeben. Fehlt sie, bleibt nur `null`, und der Publish-Flow bricht
 * mit einer Aussage darüber ab, statt etwas Falsches hochzuladen.
 */
export function schemaContentOf(pkg: EPackage): string | null {
  const resource = (pkg as unknown as { eResource?: () => { saveToString?: () => string } | null })
    .eResource?.();
  try {
    return resource?.saveToString?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * Die Liste für `publishConfiguration`. Domänenmodelle kommen aus
 * `modelFiles` — dort steht genau das, was die Konfiguration referenziert.
 */
export function requiredSchemas(setup: AtlasSetup): RequiredSchema[] {
  const liste: RequiredSchema[] = [
    { nsUri: EORM_NS_URI, name: 'eorm', content: eormEcoreXml },
    { nsUri: CONFIGURATION_NS_URI, name: 'configuration', content: configurationEcoreXml },
  ];

  const gesehen = new Set(liste.map((s) => s.nsUri));
  for (const ref of setup.modelFiles) {
    const pkg = ref.modelPackage;
    const nsUri = pkg?.getNsURI();
    if (!pkg || !nsUri || gesehen.has(nsUri)) continue;
    gesehen.add(nsUri);
    const content = schemaContentOf(pkg);
    if (!content) {
      throw new Error(
        `Vom Modell „${pkg.getName() ?? nsUri}" liegt kein Quelltext vor — ` +
          `es kann nicht in den Model Atlas geladen werden.`,
      );
    }
    liste.push({ nsUri, name: pkg.getName() ?? nsUri, content });
  }
  return liste;
}
