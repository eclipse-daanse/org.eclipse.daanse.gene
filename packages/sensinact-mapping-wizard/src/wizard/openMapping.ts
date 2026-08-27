/**
 * Ein bestehendes Mapping öffnen (T19/#190, T21/#192) — aus dem Modelatlas
 * oder aus Dateien: referenzierte Sensormodelle nachladen, Nachbar-Artefakte
 * (Profil, Speicher-Regeln) einsammeln, Fassadenmodell rekonstruieren und als
 * Dokument in den Wizard-Kontext übernehmen.
 */
import type { EPackage } from '@emfts/core';
import { EPackageRegistry } from '@emfts/core';
import type { AtlasModelSource, AtlasObjectInfo } from '../atlas/atlasSource';
import { loadSchemaWithDependencies } from '../atlas/cascadeLoader';
import {
  analyzeMappingXmi,
  referencedClassifiers,
  restoreSetupFromMappingXmi,
  rewriteEcoreFileHrefs,
} from '../transform/fromProviderMapping';
import { applyOpenedMapping } from './context';
import type { MappingDocument } from './context';

export interface OpenResult {
  warnings: string[];
  /** Zusätzlich nachgeladene Modelle (nsURI). */
  loadedModels: string[];
}

export interface OpenContentOptions {
  /** Das Mapping-XMI. */
  content: string;
  /** Woher es kommt — steuert später das Speichern. */
  document: MappingDocument;
  /**
   * Optionale Atlas-Quelle: lädt fehlende Sensormodelle (per nsURI bzw. über
   * die Klassifizierer-Suche) und Nachbar-Artefakte nach.
   */
  source?: AtlasModelSource;
  /** Bereits vorliegende Nachbar-Artefakte (z. B. mit abgelegte Dateien). */
  siblings?: { fileName: string; content: string }[];
  /** Bereits registrierte Modelle, die zu diesem Mapping gehören. */
  packages?: EPackage[];
}

/** Die Registry kann Deskriptoren halten — nur echte Packages sind nutzbar. */
function registeredPackage(nsUri: string): EPackage | undefined {
  const candidate = EPackageRegistry.INSTANCE.get(nsUri) as EPackage | null;
  return candidate && typeof candidate.getEClassifiers === 'function' ? candidate : undefined;
}

/**
 * Kern des Öffnens: prüft das Format, beschafft was fehlt und übernimmt das
 * Ergebnis in den Kontext. Wirft mit nutzerlesbarer Meldung, wenn das Objekt
 * kein Mapping ist oder die Sensorklasse unauflösbar bleibt.
 */
export async function openMappingContent(options: OpenContentOptions): Promise<OpenResult> {
  const { content, document, source } = options;

  const analysis = analyzeMappingXmi(content);
  if (analysis.rootType && analysis.rootType !== 'ProviderMapping') {
    throw new Error(
      `„${document.name || 'Das Objekt'}" ist kein Sensor-Mapping, sondern ein ${analysis.rootType}-Objekt.`,
    );
  }

  const warnings: string[] = [];
  const packages: EPackage[] = [...(options.packages ?? [])];
  const siblings = [...(options.siblings ?? [])];
  const loadedModels: string[] = [];

  // Referenzierte Sensormodelle: registrierte übernehmen, fehlende nachladen.
  for (const nsUri of analysis.nsUris) {
    const registered = registeredPackage(nsUri);
    if (registered) {
      packages.push(registered);
      continue;
    }
    if (!source) {
      warnings.push(
        `Das Mapping bezieht sich auf das Modell „${nsUri}", das hier nicht vorliegt — ` +
          'legen Sie die .ecore-Datei mit ab oder verbinden Sie den Modelatlas.',
      );
      continue;
    }
    try {
      const result = await loadSchemaWithDependencies(source, nsUri);
      packages.push(...result.loadedPackages);
      loadedModels.push(nsUri);
      for (const unresolvedRef of result.unresolved) {
        warnings.push(
          `Das Modell „${unresolvedRef}" ist im Atlas nicht verfügbar — davon abhängige Felder fehlen eventuell.`,
        );
      }
    } catch (error) {
      warnings.push(
        `Das Modell „${nsUri}" konnte nicht geladen werden: ${(error as Error).message}`,
      );
    }
  }

  // Handgeschriebene Mappings verweisen über Dateipfade auf ihre Modelle
  // (`../../lorawan-uplink.ecore`). Was die bekannten Packages nicht abdecken,
  // wird über die Klassifizierer-Suche des Atlas gesucht (der Rest ist Sache
  // der Fragment-Heuristik beim Umschreiben).
  if (source) {
    const byFile = referencedClassifiers(content);
    for (const file of rewriteEcoreFileHrefs(content, packages).unresolved) {
      for (const classifier of (byFile[file] ?? []).slice(0, 2)) {
        try {
          for (const hit of (await source.searchByClassifier(classifier)).slice(0, 3)) {
            if (registeredPackage(hit.nsUri)) continue;
            const result = await loadSchemaWithDependencies(source, hit.nsUri);
            packages.push(...result.loadedPackages);
            loadedModels.push(hit.nsUri);
          }
        } catch {
          /* Suche ist nur eine Zusatzchance — restore warnt, wenn es nicht reicht */
        }
      }
    }
  }

  // Nachbar-Artefakte aus dem Atlas: Der Assistent legt sie unter ihrem
  // Dateinamen als objectId ab, damit die hrefs (`<datei>.xmi#<id>`) gelten.
  if (source && document.source === 'atlas' && document.registry && document.stage) {
    for (const fileName of analysis.xmiFiles) {
      if (siblings.some((s) => s.fileName === fileName)) continue;
      try {
        const siblingContent = await source.getObjectContent(
          document.registry,
          document.stage,
          fileName,
        );
        if (siblingContent) siblings.push({ fileName, content: siblingContent });
      } catch {
        /* fehlende Nachbardateien sind kein Fehler — restore warnt bei Bedarf */
      }
    }
  }

  const restored = restoreSetupFromMappingXmi(content, { siblings, packages });
  warnings.push(...restored.warnings);

  // Bewusst ohne die Kandidaten-Packages der Suche: Klassen-Kandidaten liefert
  // nur das Modell der Sensorklasse — die übrigen sind registriert und damit
  // für Pfade/Vererbung verfügbar (wie bei der Schema-Auswahl).
  applyOpenedMapping({ setup: restored.setup, warnings, profile: restored.profile }, document);

  return { warnings, loadedModels };
}

/** Ein Objekt aus einer Registry-Stage des Modelatlas öffnen. */
export async function openMappingFromAtlas(options: {
  source: AtlasModelSource;
  registry: string;
  stage: string;
  object: AtlasObjectInfo;
}): Promise<OpenResult> {
  const { source, registry, stage, object } = options;
  const content = await source.getObjectContent(registry, stage, object.objectId);
  if (!content) {
    throw new Error(`Das Objekt „${object.objectId}" konnte nicht geladen werden.`);
  }
  return openMappingContent({
    content,
    source,
    document: {
      source: 'atlas',
      name: object.name || object.objectId,
      registry,
      stage,
      objectId: object.objectId,
    },
  });
}
