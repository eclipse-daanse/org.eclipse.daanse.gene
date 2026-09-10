/**
 * Prüfung des Fassadenmodells, bevor serialisiert wird (Plan, Abschnitt 4).
 *
 * Harte Fehler werfen: eine Konfiguration mit leerem Pflichtfeld oder
 * doppelter id ist für den Data Atlas unbrauchbar, und ein nsURI-Href in einer
 * Datei-Konfiguration löst beim Laden nicht auf. Warnungen erscheinen in der
 * Zusammenfassung, halten den Nutzer aber nicht auf.
 */
import { ExportKind, InputKind, MappingKind, type AtlasSetup } from '../generated';
import { newResourceSet } from '../emf/setup';
import { URI } from '@emfts/core';

export class SetupInvalidError extends Error {
  constructor(public readonly reasons: string[]) {
    super(reasons.join('\n'));
    this.name = 'SetupInvalidError';
  }
}

function leer(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

/** Ist das importierte Dokument ein brauchbares eorm-Mapping? */
export function isEntityMappings(eormXmi: string): boolean {
  try {
    const resource = newResourceSet().createResource(URI.createURI('imported.eorm'));
    (resource as unknown as { loadFromString(s: string): void }).loadFromString(eormXmi);
    const wurzel = resource.getContents().get(0);
    return wurzel?.eClass()?.getName() === 'EntityMappings';
  } catch {
    return false;
  }
}

/** Alle im Zieldokument vergebenen ids — Dubletten wären nicht auflösbar. */
export function collectIds(setup: AtlasSetup): string[] {
  const ids: string[] = [setup.serviceId];
  for (const quelle of setup.dataSources) {
    ids.push(quelle.id);
    if (quelle.kind === InputKind.DATABASE && quelle.dataSourceId) {
      ids.push(quelle.dataSourceId);
    }
  }
  for (const dataset of setup.datasets.filter((d) => d.selected)) {
    ids.push(dataset.id, `${dataset.id}-config`);
  }
  for (const exportConfig of setup.exports.filter((e) => e.selected)) {
    ids.push(exportConfig.id);
  }
  return ids;
}

/**
 * Harte Fehler. Leere Liste heißt: die Konfiguration lässt sich schreiben.
 */
export function findErrors(setup: AtlasSetup): string[] {
  const fehler: string[] = [];

  if (!setup.modelPackage) fehler.push('Kein Domänenmodell gewählt.');
  if (leer(setup.instanceName)) fehler.push('Der Name der Instanz fehlt.');

  const ausgewaehlt = setup.datasets.filter((d) => d.selected);
  if (ausgewaehlt.length === 0) fehler.push('Kein Datensatz ausgewählt.');

  // name und description sind an DataProvider lowerBound=1 — leer ist ein
  // Fehler, keine Warnung.
  if (leer(setup.serviceId)) fehler.push('Die id des REST-Endpunkts fehlt.');
  if (leer(setup.serviceName)) fehler.push('Der Name des REST-Endpunkts fehlt.');
  if (leer(setup.serviceDescription)) fehler.push('Die Beschreibung des REST-Endpunkts fehlt.');
  if (leer(setup.urlContext)) fehler.push('Der Basis-Pfad (urlContext) fehlt.');

  for (const dataset of ausgewaehlt) {
    const bezeichnung = dataset.id || dataset.targetClass?.getName() || 'Datensatz';
    if (leer(dataset.id)) fehler.push(`Datensatz „${bezeichnung}": id fehlt.`);
    if (leer(dataset.name)) fehler.push(`Datensatz „${bezeichnung}": Name fehlt.`);
    if (leer(dataset.description)) fehler.push(`Datensatz „${bezeichnung}": Beschreibung fehlt.`);
    if (leer(dataset.path)) fehler.push(`Datensatz „${bezeichnung}": Pfad fehlt.`);
    if (!dataset.targetClass) fehler.push(`Datensatz „${bezeichnung}": keine Klasse zugeordnet.`);
  }

  for (const exportConfig of setup.exports.filter((e) => e.selected)) {
    const bezeichnung = exportConfig.id || exportConfig.kind;
    if (leer(exportConfig.id)) fehler.push(`Format „${bezeichnung}": id fehlt.`);
    if (leer(exportConfig.name)) fehler.push(`Format „${bezeichnung}": Name fehlt.`);
    if (leer(exportConfig.description)) fehler.push(`Format „${bezeichnung}": Beschreibung fehlt.`);
  }

  if (setup.dataSources.length === 0) {
    fehler.push('Keine Datenquelle konfiguriert.');
  }
  if (setup.dataSources.length > 0 && !setup.dataSources.some((q) => q.id === setup.defaultSourceId)) {
    fehler.push('Der Vorgabe-Eingang zeigt auf keine der Datenquellen.');
  }

  for (const quelle of setup.dataSources) {
    const bezeichnung = quelle.id || quelle.kind;
    if (leer(quelle.id)) fehler.push('Eine Datenquelle hat keine id.');

    if (quelle.kind === InputKind.FILE) {
      if (leer(quelle.fileUri)) {
        fehler.push(`Datenquelle „${bezeichnung}": Pfad der Datendatei fehlt.`);
      } else if (!quelle.fileUri!.startsWith('/') && !quelle.fileUri!.includes('://')) {
        // Die Konfiguration kommt über HTTP aus dem Model Atlas — ein
        // relativer Pfad hätte dort keinen Bezugspunkt.
        fehler.push(
          `Datenquelle „${bezeichnung}": der Pfad muss absolut sein (ist: „${quelle.fileUri}").`,
        );
      }
    } else {
      if (leer(quelle.dataSourceId)) fehler.push(`Datenquelle „${bezeichnung}": id der DataSource fehlt.`);
      if (leer(quelle.dataSourceName)) fehler.push(`Datenquelle „${bezeichnung}": Name der DataSource fehlt.`);
      if (leer(quelle.dataSourceFilter)) fehler.push(`Datenquelle „${bezeichnung}": Filter der DataSource fehlt.`);
      if (quelle.mappingKind === MappingKind.IMPORTED) {
        if (leer(quelle.eormXmi)) {
          fehler.push(
            `Datenquelle „${bezeichnung}": das JPA-Mapping soll importiert werden, ` +
              `es ist aber keines geladen.`,
          );
        } else if (!isEntityMappings(quelle.eormXmi!)) {
          fehler.push(
            `Datenquelle „${bezeichnung}": das importierte JPA-Mapping ist kein ` +
              `EntityMappings-Dokument.`,
          );
        }
      }

      /*
       * Alle Klassen, die aus dieser Datenbank gelesen werden, müssen aus
       * einem Package kommen (JPADataInputConfigurator prüft das ebenso).
       */
      const pakete = new Set(
        ausgewaehlt
          .filter((d) => (d.sourceId?.trim() || setup.defaultSourceId) === quelle.id)
          .map((d) => d.targetClass?.getEPackage()?.getNsURI())
          .filter((n): n is string => !!n),
      );
      if (pakete.size > 1) {
        fehler.push(
          `Datenquelle „${bezeichnung}": bei einer Datenbank müssen alle Datensätze aus ` +
            `einem Package kommen (gefunden: ${[...pakete].join(', ')}).`,
        );
      }
    }
  }

  // Ein Datensatz darf nur auf einen vorhandenen Eingang zeigen
  for (const dataset of ausgewaehlt) {
    const eigene = dataset.sourceId?.trim();
    if (eigene && !setup.dataSources.some((q) => q.id === eigene)) {
      fehler.push(`Datensatz „${dataset.id}": die Datenquelle „${eigene}" gibt es nicht.`);
    }
  }

  const ids = collectIds(setup);
  const doppelt = ids.filter((id, i) => id && ids.indexOf(id) !== i);
  for (const id of new Set(doppelt)) {
    fehler.push(`Die id „${id}" ist mehrfach vergeben.`);
  }

  return fehler;
}

/** Hinweise, die den Nutzer nicht aufhalten. */
export function findWarnings(setup: AtlasSetup): string[] {
  const warnungen: string[] = [];
  const exporte = setup.exports.filter((e) => e.selected);

  if (exporte.length > 0) {
    const hatCsv = exporte.some((e) => e.kind === ExportKind.CSV || e.kind === ExportKind.CSV_ZIP);
    const hatJsonOderXml = exporte.some(
      (e) => e.kind === ExportKind.JSON || e.kind === ExportKind.XML,
    );
    if (hatCsv && !hatJsonOderXml) {
      warnungen.push(
        'Nur CSV gewählt: ein einziges Format ersetzt die Vorgaben des Data Atlas ' +
          'vollständig — JSON und XML werden dann mit 406 abgelehnt.',
      );
    }
  }

  if (
    setup.dataSources.some(
      (q) => q.kind === InputKind.DATABASE && q.mappingKind === MappingKind.DERIVED,
    )
  ) {
    warnungen.push(
      'Abgeleitetes JPA-Mapping: Tabellenname ist der Klassenname in Großbuchstaben, ' +
        'Spaltennamen sind die Feature-Namen unverändert — beide unquoted. Auf PostgreSQL ' +
        'liest ein Modell mit „firstName" also die Spalte „firstname".',
    );
  }

  for (const dataset of setup.datasets.filter((d) => d.selected)) {
    const batchSize = dataset.batchSize ?? -1;
    const batchSizeLimit = dataset.batchSizeLimit ?? -1;
    if (batchSizeLimit > -1 && batchSize > -1 && batchSizeLimit < batchSize) {
      warnungen.push(
        `Datensatz „${dataset.id}": batchSizeLimit (${batchSizeLimit}) ist kleiner ` +
          `als batchSize (${batchSize}).`,
      );
    }
  }

  return warnungen;
}

/** Wirft, wenn die Konfiguration nicht schreibbar ist. */
export function assertValid(setup: AtlasSetup): void {
  const fehler = findErrors(setup);
  if (fehler.length > 0) throw new SetupInvalidError(fehler);
}
