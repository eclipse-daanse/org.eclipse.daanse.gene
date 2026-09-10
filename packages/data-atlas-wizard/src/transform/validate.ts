/**
 * Prüfung des Fassadenmodells, bevor serialisiert wird (Plan, Abschnitt 4).
 *
 * Harte Fehler werfen: eine Konfiguration mit leerem Pflichtfeld oder
 * doppelter id ist für den Data Atlas unbrauchbar. Warnungen erscheinen in der
 * Zusammenfassung, halten den Nutzer aber nicht auf.
 */
import { URI } from '@emfts/core';
import { ExportKind, InputKind, MappingKind, type AtlasSetup, type DataChain } from '../generated';
import { newResourceSet } from '../emf/setup';
import { effectiveSource } from '../wizard/context';

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

/** Die ausgewählten Datensätze aller Wege, mit ihrem Weg. */
function auswahl(setup: AtlasSetup) {
  return setup.chains.flatMap((chain) =>
    chain.datasets.filter((d) => d.selected).map((dataset) => ({ chain, dataset })),
  );
}

/** Alle im Zieldokument vergebenen ids — Dubletten wären nicht auflösbar. */
export function collectIds(setup: AtlasSetup): string[] {
  const ids: string[] = [setup.serviceId];
  const quellen = new Set<unknown>();
  for (const chain of setup.chains) {
    const quelle = effectiveSource(chain);
    // Eine geteilte Quelle wird ein einziger DataInput
    if (quelle && !quellen.has(quelle)) {
      quellen.add(quelle);
      ids.push(quelle.id);
      if (quelle.kind === InputKind.DATABASE && quelle.dataSourceId) {
        ids.push(quelle.dataSourceId);
      }
    }
    for (const dataset of chain.datasets.filter((d) => d.selected)) {
      ids.push(dataset.id, `${dataset.id}-config`);
    }
  }
  // Gleiche Exportvorlagen werden zusammengefasst, deshalb nur eindeutige ids
  const exportIds = new Set(
    setup.chains.flatMap((c) => c.exports.filter((e) => e.selected).map((e) => e.id)),
  );
  ids.push(...exportIds);
  return ids;
}

/** Harte Fehler. Leere Liste heißt: die Konfiguration lässt sich schreiben. */
export function findErrors(setup: AtlasSetup): string[] {
  const fehler: string[] = [];
  const eintraege = auswahl(setup);

  if (!setup.modelPackage) fehler.push('Kein Domänenmodell gewählt.');
  if (leer(setup.instanceName)) fehler.push('Der Name der Instanz fehlt.');
  if (setup.chains.length === 0) fehler.push('Kein Datenweg angelegt.');
  if (eintraege.length === 0) fehler.push('Kein Datensatz ausgewählt.');

  // name und description sind an DataProvider lowerBound=1 — leer ist ein
  // Fehler, keine Warnung.
  if (leer(setup.serviceId)) fehler.push('Die id des REST-Endpunkts fehlt.');
  if (leer(setup.serviceName)) fehler.push('Der Name des REST-Endpunkts fehlt.');
  if (leer(setup.serviceDescription)) fehler.push('Die Beschreibung des REST-Endpunkts fehlt.');
  if (leer(setup.urlContext)) fehler.push('Der Basis-Pfad (urlContext) fehlt.');

  for (const chain of setup.chains) {
    if (leer(chain.id)) fehler.push('Ein Datenweg hat keine id.');
    fehler.push(...pruefeQuelle(chain, setup));
    for (const exportConfig of chain.exports.filter((e) => e.selected)) {
      const bezeichnung = `${chain.id}/${exportConfig.id || exportConfig.kind}`;
      if (leer(exportConfig.id)) fehler.push(`Format „${bezeichnung}": id fehlt.`);
      if (leer(exportConfig.name)) fehler.push(`Format „${bezeichnung}": Name fehlt.`);
      if (leer(exportConfig.description)) fehler.push(`Format „${bezeichnung}": Beschreibung fehlt.`);
    }
  }

  for (const { chain, dataset } of eintraege) {
    const bezeichnung = dataset.id || dataset.targetClass?.getName() || 'Datensatz';
    if (leer(dataset.id)) fehler.push(`Datensatz „${bezeichnung}": id fehlt.`);
    if (leer(dataset.name)) fehler.push(`Datensatz „${bezeichnung}": Name fehlt.`);
    if (leer(dataset.description)) fehler.push(`Datensatz „${bezeichnung}": Beschreibung fehlt.`);
    if (leer(dataset.path)) fehler.push(`Datensatz „${bezeichnung}": Pfad fehlt.`);
    if (!dataset.targetClass) fehler.push(`Datensatz „${bezeichnung}": keine Klasse zugeordnet.`);
    void chain;
  }

  const ids = collectIds(setup);
  const doppelt = ids.filter((id, i) => id && ids.indexOf(id) !== i);
  for (const id of new Set(doppelt)) {
    fehler.push(`Die id „${id}" ist mehrfach vergeben.`);
  }

  return fehler;
}

/** Die Quelle eines Datenwegs. */
function pruefeQuelle(chain: DataChain, setup: AtlasSetup): string[] {
  const fehler: string[] = [];
  const quelle = effectiveSource(chain);
  if (!quelle) {
    fehler.push(`Datenweg „${chain.id}": keine Datenquelle.`);
    return fehler;
  }
  if (chain.source && chain.sharedSource) {
    fehler.push(`Datenweg „${chain.id}": eigene und geteilte Quelle gleichzeitig.`);
  }
  if (chain.sharedSource && !setup.chains.some((c) => c.source === chain.sharedSource)) {
    fehler.push(`Datenweg „${chain.id}": die geteilte Datenquelle gehört keinem Datenweg.`);
  }

  const bezeichnung = `${chain.id}/${quelle.id || quelle.kind}`;
  if (leer(quelle.id)) fehler.push(`Datenweg „${chain.id}": die Datenquelle hat keine id.`);

  if (quelle.kind === InputKind.FILE) {
    if (leer(quelle.fileUri)) {
      fehler.push(`Datenquelle „${bezeichnung}": Pfad der Datendatei fehlt.`);
    } else if (!quelle.fileUri!.startsWith('/') && !quelle.fileUri!.includes('://')) {
      // Die Konfiguration kommt über HTTP aus dem Model Atlas — ein relativer
      // Pfad hätte dort keinen Bezugspunkt.
      fehler.push(
        `Datenquelle „${bezeichnung}": der Pfad muss absolut sein (ist: „${quelle.fileUri}").`,
      );
    }
    return fehler;
  }

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
   * Alle Klassen, die aus dieser Datenbank gelesen werden, müssen aus einem
   * Package kommen (JPADataInputConfigurator prüft das ebenso). Geteilte
   * Quellen zählen über alle Wege.
   */
  const pakete = new Set(
    setup.chains
      .filter((c) => effectiveSource(c) === quelle)
      .flatMap((c) => c.datasets.filter((d) => d.selected))
      .map((d) => d.targetClass?.getEPackage()?.getNsURI())
      .filter((n): n is string => !!n),
  );
  if (pakete.size > 1) {
    fehler.push(
      `Datenquelle „${bezeichnung}": bei einer Datenbank müssen alle Datensätze aus ` +
        `einem Package kommen (gefunden: ${[...pakete].join(', ')}).`,
    );
  }
  return fehler;
}

/** Hinweise, die den Nutzer nicht aufhalten. */
export function findWarnings(setup: AtlasSetup): string[] {
  const warnungen: string[] = [];

  for (const chain of setup.chains) {
    const exporte = chain.exports.filter((e) => e.selected);
    if (exporte.length > 0 && chain.datasets.some((d) => d.selected)) {
      const hatCsv = exporte.some(
        (e) => e.kind === ExportKind.CSV || e.kind === ExportKind.CSV_ZIP,
      );
      const hatJsonOderXml = exporte.some(
        (e) => e.kind === ExportKind.JSON || e.kind === ExportKind.XML,
      );
      if (hatCsv && !hatJsonOderXml) {
        warnungen.push(
          `Datenweg „${chain.id}": nur CSV gewählt — ein einziges Format ersetzt die ` +
            `Vorgaben des Data Atlas vollständig, JSON und XML werden dann mit 406 abgelehnt.`,
        );
      }
    }

    const quelle = effectiveSource(chain);
    if (quelle?.kind === InputKind.DATABASE && quelle.mappingKind === MappingKind.DERIVED) {
      warnungen.push(
        `Datenweg „${chain.id}": abgeleitetes JPA-Mapping — Tabellenname ist der ` +
          `Klassenname in Großbuchstaben, Spaltennamen sind die Feature-Namen unverändert, ` +
          `beide unquoted. Auf PostgreSQL liest ein Modell mit „firstName" also die ` +
          `Spalte „firstname".`,
      );
    }

    for (const dataset of chain.datasets.filter((d) => d.selected)) {
      const batchSize = dataset.batchSize ?? -1;
      const batchSizeLimit = dataset.batchSizeLimit ?? -1;
      if (batchSizeLimit > -1 && batchSize > -1 && batchSizeLimit < batchSize) {
        warnungen.push(
          `Datensatz „${dataset.id}": batchSizeLimit (${batchSizeLimit}) ist kleiner ` +
            `als batchSize (${batchSize}).`,
        );
      }
    }
  }

  return [...new Set(warnungen)];
}

/** Wirft, wenn die Konfiguration nicht schreibbar ist. */
export function assertValid(setup: AtlasSetup): void {
  const fehler = findErrors(setup);
  if (fehler.length > 0) throw new SetupInvalidError(fehler);
}
