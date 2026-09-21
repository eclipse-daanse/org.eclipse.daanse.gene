/**
 * Transformer gegen die Vorlagen aus dem data.atlas-Repo (Umsetzungsschritt 6).
 *
 * Verglichen wird **semantisch**: erzeugtes XMI und Vorlage werden geladen und
 * ihre Objektgraphen gegenübergestellt. Ein Textvergleich wäre unbrauchbar,
 * weil EMF Default-Werte weglässt und Kopfattribute anders ordnet (Plan,
 * Abschnitt 8); der Graphvergleich prüft dafür mehr, nämlich auch die
 * aufgelösten Referenzen.
 *
 * Die Trias wird beim Vergleich **aufgelöst**: `dataInput` und
 * `distributionExport` dürfen am Datensatz oder am Service stehen — der Data
 * Atlas liest override-else-default, und die Vorlagen nutzen beide Formen. Der
 * Transformer schreibt am Service, solange alle Datenwege einig sind, sonst an
 * jedem Datensatz (Plan, Abschnitt 1).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { URI, type BasicResourceSet, type EClass, type EObject, type EPackage } from '@emfts/core';
import { newResourceSet, registerEcoreFromString, setupPackages } from '../src/emf/setup';
import { buildDataAtlasXmi } from '../src/transform/toDataAtlasConfig';
import {
  addChain,
  addEndpoint,
  buildChain,
  buildEndpoint,
  syncEndpointEntries,
  buildDatabaseSource,
  buildFileSource,
  initSetup,
  setup as setupRef,
  shareSource,
} from '../src/wizard/context';
import {
  DataatlaswizardFactory,
  EndpointKind,
  ExportKind,
  type AtlasSetup,
  type DataChain,
  type ExportConfig,
} from '../src/generated';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const lies = (name: string) => readFileSync(join(fixtures, name), 'utf-8');

let personPackage: EPackage;
let person: EClass;

beforeAll(async () => {
  await setupPackages();
  personPackage = registerEcoreFromString(lies('person.ecore'), 'model/person.ecore');
  person = personPackage.getEClassifier('Person') as EClass;
});

// ── Vergleichsbeschreibung ────────────────────────────────────────────────

/**
 * Liest ein Feature, wenn die Klasse es hat. `uri` gibt es nur am
 * FileDataInput, `dataSource` nur am JPADataInput — und `eGet(null)` wirft.
 */
const feature = (obj: EObject, name: string): unknown => {
  const f = obj.eClass().getEStructuralFeature(name);
  return f ? obj.eGet(f) : undefined;
};
const liste = (obj: EObject, name: string): EObject[] => [
  ...((feature(obj, name) ?? []) as Iterable<EObject>),
];
const text = (obj: EObject, name: string): string | undefined => {
  const wert = feature(obj, name);
  return wert === null || wert === undefined ? undefined : String(wert);
};
const klassenName = (obj: unknown): string | undefined => {
  const eClass = obj as { getName?: () => string | null; getEPackage?: () => EPackage | null };
  const pkg = eClass?.getEPackage?.()?.getNsURI?.();
  return eClass?.getName?.() ? `${pkg}#//${eClass.getName()}` : undefined;
};

/**
 * Normalisierte Sicht auf eine Konfiguration — unabhängig davon, wo die Trias
 * eingetragen ist.
 */
function describeConfiguration(root: EObject) {
  const services = liste(root, 'services');
  const dataSets = liste(root, 'dataSets');

  /** Der Service, der diesen Datensatz veröffentlicht. */
  const serviceOf = (dataSet: EObject): EObject | undefined =>
    services.find((service) =>
      liste(service, 'configuration').some((c) => feature(c, 'dataSet') === dataSet),
    );

  const triasOf = (dataSet: EObject) => {
    const service = serviceOf(dataSet);
    const eigenerInput = feature(dataSet, 'dataInput') as EObject | null;
    const eigeneExporte = liste(dataSet, 'distributionExport');
    const input = eigenerInput ?? ((service && feature(service, 'dataInput')) as EObject | null);
    const exporte =
      eigeneExporte.length > 0 ? eigeneExporte : service ? liste(service, 'distributionExport') : [];
    return {
      dataInput: input ? text(input, 'id') : undefined,
      distributionExport: exporte.map((e) => text(e, 'id')).sort(),
    };
  };

  return {
    name: text(root, 'name'),
    description: text(root, 'description'),
    dataSources: liste(root, 'dataSources').map((source) => ({
      id: text(source, 'id'),
      name: text(source, 'name'),
      filter: text(source, 'filter'),
    })),
    dataInputs: liste(root, 'dataInputs').map((input) => ({
      type: input.eClass().getName(),
      id: text(input, 'id'),
      uri: text(input, 'uri'),
      dataSource: (() => {
        const source = feature(input, 'dataSource') as EObject | null | undefined;
        return source ? text(source, 'id') : undefined;
      })(),
      supportedEClasses: liste(input, 'supportedEClasses').map(klassenName).sort(),
      hasPersistenceConfig: !!feature(input, 'persistenceConfig'),
    })),
    dataSets: dataSets.map((dataSet) => ({
      id: text(dataSet, 'id'),
      name: text(dataSet, 'name'),
      description: text(dataSet, 'description'),
      inputType: klassenName(feature(dataSet, 'inputType')),
      outputType: klassenName(feature(dataSet, 'outputType')),
      ...triasOf(dataSet),
    })),
    services: services.map((service) => ({
      type: service.eClass().getName(),
      id: text(service, 'id'),
      name: text(service, 'name'),
      description: text(service, 'description'),
      urlContext: text(service, 'urlContext'),
      openAPI: text(service, 'openAPI'),
      paginationOffsetParameterName: text(service, 'paginationOffsetParameterName'),
      paginationSizeParameterName: text(service, 'paginationSizeParameterName'),
      /*
       * Die id der Service-Konfiguration bleibt beim Vergleich aussen vor.
       * Sie bedeutet fachlich nichts, und die Vorlagen sind darin uneinig:
       * die Ein-Datensatz-Beispiele nennen sie `<serviceId>-config`
       * (persons-rest-config), das Mehr-Datensatz-Beispiel
       * `<dataSetId>-config` (persons-csv-only-config). Nur letzteres bleibt
       * bei mehreren Datensaetzen eindeutig, also gilt diese Regel — geprueft
       * wird sie unten eigens.
       */
      configuration: liste(service, 'configuration').map((c) => ({
        dataSet: text(feature(c, 'dataSet') as EObject, 'id'),
        path: text(c, 'path'),
        batchSize: text(c, 'batchSize'),
        batchSizeLimit: text(c, 'batchSizeLimit'),
      })),
    })),
    exports: liste(root, 'exports').map((exportObj) => ({
      type: exportObj.eClass().getName(),
      id: text(exportObj, 'id'),
      name: text(exportObj, 'name'),
      description: text(exportObj, 'description'),
      mediaType: text(exportObj, 'mediaType'),
      separator: text(exportObj, 'separator'),
      includeTypeHeader: text(exportObj, 'includeTypeHeader'),
      compressed: text(exportObj, 'compressed'),
    })),
  };
}

/** Lädt ein Dokument so, dass `model/person.ecore#//Person` auflöst. */
function ladeKonfiguration(xmi: string, rs?: BasicResourceSet): EObject {
  const set = rs ?? newResourceSet();
  const modell = set.createResource(URI.createURI('model/person.ecore'));
  (modell as unknown as { loadFromString(s: string): void }).loadFromString(lies('person.ecore'));
  const resource = set.createResource(URI.createURI('geladen.xmi'));
  (resource as unknown as { loadFromString(s: string): void }).loadFromString(xmi);
  const wurzel = resource.getContents().get(0);
  expect(wurzel, 'Dokument leer').toBeTruthy();
  return wurzel;
}

/** Erzeugt aus dem Setup und vergleicht mit der Vorlage. */
function vergleiche(setup: AtlasSetup, fixture: string) {
  const { xmi } = buildDataAtlasXmi(setup);
  const erzeugt = describeConfiguration(ladeKonfiguration(xmi));
  const vorlage = describeConfiguration(ladeKonfiguration(lies(fixture)));
  return { erzeugt, vorlage, xmi };
}

// ── Aufbau der Setups ─────────────────────────────────────────────────────

/** Ein Format anlegen — die Vorlagen nennen id, Name und Beschreibung. */
function format(kind: ExportKind, id: string, name: string, beschreibung: string): ExportConfig {
  const e = DataatlaswizardFactory.eINSTANCE.createExportConfig();
  e.kind = kind;
  e.id = id;
  e.name = name;
  e.description = beschreibung;
  return e;
}

/** Das Setup zum Beispiel aus `example/dataatlas-atlas.xmi`. */
function beispielSetup(): AtlasSetup {
  initSetup(personPackage);
  const s = setupRef.value!;
  s.instanceName = 'example-atlas';
  s.instanceDescription = 'Example Data Atlas instance served from a Model Atlas.';
  const kette = s.chains[0];
  kette.id = 'persons';
  kette.source!.id = 'persons-file';
  kette.source!.fileUri = '/opt/dataatlas/runtime/data/data/persons.xmi';

  const endpunkt = s.endpoints[0];
  endpunkt.id = 'persons-rest';
  endpunkt.name = 'Persons REST';
  endpunkt.description = 'REST endpoint publishing the example persons.';
  endpunkt.urlContext = '/example';
  endpunkt.openApi = false;

  // Die Vorlagen benutzen Plural-Namen; abgeleitet wird person/Person
  // (context.ts erklärt, warum nicht pluralisiert wird).
  const dataset = kette.datasets[0];
  dataset.id = 'persons';
  dataset.name = 'Persons';
  dataset.description = 'All persons of the example data set.';
  dataset.targetClass = person;
  // Der Pfad haengt am Endpunkt-Eintrag, nicht am Datensatz
  syncEndpointEntries(s, endpunkt);
  endpunkt.entries[0].path = 'persons';
  return s;
}

describe('Grundfall gegen example/dataatlas-atlas.xmi', () => {
  it('der Objektgraph stimmt', () => {
    const { erzeugt, vorlage } = vergleiche(beispielSetup(), 'dataatlas-atlas.xmi');
    expect(erzeugt).toEqual(vorlage);
  });

  it('alle Verweise auf Modellklassen sind nsURIs', () => {
    const { xmi } = vergleiche(beispielSetup(), 'dataatlas-atlas.xmi');
    const hrefs = [...xmi.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const attribute = [...xmi.matchAll(/(?:inputType|outputType)="([^"]+)"/g)].map((m) => m[1]);
    expect([...new Set([...hrefs, ...attribute])]).toEqual([
      'https://eclipse.org/fennec/data/atlas/example/person/1.0.0#//Person',
    ]);
  });

  it('die id der Service-Konfiguration nennt Endpunkt und Datensatz', () => {
    /*
     * Zwei Datensaetze in zwei Endpunkten: der Wert bedeutet fachlich nichts,
     * muss aber eindeutig sein. Mit <dataSetId>-config allein waere er es
     * nicht mehr, sobald zwei Endpunkte denselben Datensatz veroeffentlichen.
     */
    const s = beispielSetup();
    const zweiter = DataatlaswizardFactory.eINSTANCE.createDatasetConfig();
    zweiter.targetClass = person;
    zweiter.id = 'orte';
    zweiter.name = 'Orte';
    zweiter.description = 'Alle Orte.';
    s.chains[0].datasets.push(zweiter);
    addEndpoint(buildEndpoint('persons', 'Persons', EndpointKind.REST));

    const { xmi } = buildDataAtlasXmi(s);
    const ids = [...xmi.matchAll(/<configuration id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual([
      'persons-rest-persons-config',
      'persons-rest-orte-config',
      'persons-rest-2-persons-config',
      'persons-rest-2-orte-config',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Dateiname und keine Warnungen', () => {
    const ergebnis = buildDataAtlasXmi(beispielSetup());
    // So heisst die Datei, die DATA_ATLAS_CONFIG_URI standardmaessig sucht
    expect(ergebnis.fileName).toBe('dataatlas.xmi');
    expect(ergebnis.warnings).toEqual([]);
  });
});

describe('Pagination gegen fixtures/dataatlas-pagination.xmi', () => {
  it('eigene Parameternamen und Batch-Grenzen', () => {
    /*
     * Die Vorlage ist datei-basiert (relative Hrefs, relative Datei-URI), also
     * werden nur die Teile verglichen, um die es hier geht — der Endpunkt und
     * seine Konfigurationen.
     */
    const s = beispielSetup();
    const endpunkt = s.endpoints[0];
    endpunkt.description = 'REST endpoint with custom pagination parameter names.';
    endpunkt.urlContext = '/paged';
    endpunkt.paginationOffsetParameterName = 'start';
    endpunkt.paginationSizeParameterName = 'count';
    endpunkt.entries[0].batchSize = 2;
    endpunkt.entries[0].batchSizeLimit = 2;

    const { erzeugt, vorlage } = vergleiche(s, 'dataatlas-pagination.xmi');
    expect(erzeugt.services).toEqual(vorlage.services);
  });

  it('was der Assistent setzt, steht in der Datei — was er auslässt, nicht', () => {
    /*
     * Seit @emfts/core 0.3 schreibt der Serializer auch Werte, die dem
     * Vorgabewert entsprechen (emf.ts#95 — vorher fielen so auch Pflichtfelder
     * weg). Der Endpunkt traegt seine Pagination-Namen also sichtbar, und das
     * ist richtig: der Assistent hat sie gesetzt.
     *
     * batchSize dagegen setzt er nur, wenn der Nutzer eine Grenze angibt —
     * ein nicht gesetztes Feature schreibt der Serializer weiterhin nicht.
     */
    const { xmi } = vergleiche(beispielSetup(), 'dataatlas-atlas.xmi');
    expect(xmi).toContain('paginationOffsetParameterName="offset"');
    expect(xmi).not.toContain('batchSize');
  });
});

describe('Formate gegen fixtures/dataatlas-csv.xmi', () => {
  /*
   * Nur der <exports>-Block: die Vorlage hat drei Datensaetze mit
   * unterschiedlichen Formaten, und die Fassade kennt nur einen Satz Formate
   * fuer den ganzen Service (Plan, Abschnitt 1).
   */
  it('CSV und JSON entsprechen der Vorlage', () => {
    const s = beispielSetup();
    s.chains[0].exports.push(
      format(ExportKind.CSV, 'csv', 'CSV', 'Semicolon separated, no SQL-type row.'),
      format(ExportKind.JSON, 'json', 'JSON', 'Plain JSON, expressed through mediaType.'),
    );

    const { erzeugt, vorlage } = vergleiche(s, 'dataatlas-csv.xmi');
    expect(erzeugt.exports).toEqual(vorlage.exports);
  });

  it('die Formate gelten für den Datensatz', () => {
    const s = beispielSetup();
    s.chains[0].exports.push(format(ExportKind.CSV, 'csv', 'CSV', 'CSV.'));

    const { erzeugt } = vergleiche(s, 'dataatlas-csv.xmi');
    expect(erzeugt.dataSets[0].distributionExport).toEqual(['csv']);
  });

  it('CSV-ZIP setzt compressed', () => {
    const s = beispielSetup();
    s.chains[0].exports.push(format(ExportKind.CSV_ZIP, 'csv-zip', 'CSV (ZIP)', 'Gepackt.'));
    const { xmi } = buildDataAtlasXmi(s);
    expect(xmi).toContain('compressed="true"');
  });

  it('nur CSV warnt — ein Format ersetzt die Vorgaben vollständig', () => {
    const s = beispielSetup();
    s.chains[0].exports.push(format(ExportKind.CSV, 'csv', 'CSV', 'CSV.'));
    expect(buildDataAtlasXmi(s).warnings.join(' ')).toMatch(/406/);
  });
});

describe('Mehrere Datenwege', () => {
  /**
   * Ein zweiter Weg mit eigener Datei und eigenem Datensatz. Damit sind die
   * Wege uneinig, und die Trias muss an den Datensätzen landen.
   */
  function zweiWege(): { setup: AtlasSetup; zweiter: DataChain } {
    const s = beispielSetup();
    const zweiter = addChain(buildChain('orte', buildFileSource('orte', '/data/orte.xmi')))!;
    const dataset = DataatlaswizardFactory.eINSTANCE.createDatasetConfig();
    dataset.targetClass = person;
    dataset.id = 'orte';
    dataset.name = 'Orte';
    dataset.description = 'Alle Orte.';
    zweiter.datasets.push(dataset);
    return { setup: s, zweiter };
  }

  it('jede Quelle wird ein eigener DataInput', () => {
    const { setup } = zweiWege();
    const { xmi } = buildDataAtlasXmi(setup);
    const wurzel = ladeKonfiguration(xmi);
    expect(describeConfiguration(wurzel).dataInputs.map((i) => i.id)).toEqual([
      'persons-file',
      'orte-file',
    ]);
  });

  it('bei uneinigen Wegen steht dataInput am Datensatz, nicht am Service', () => {
    const { setup } = zweiWege();
    const { xmi } = buildDataAtlasXmi(setup);
    const wurzel = ladeKonfiguration(xmi);
    const service = liste(wurzel, 'services')[0];
    expect(feature(service, 'dataInput')).toBeFalsy();
    // Der Vergleichsblick löst die Trias auf und sieht die Zuordnung
    const beschreibung = describeConfiguration(wurzel);
    expect(beschreibung.dataSets.map((d) => [d.id, d.dataInput])).toEqual([
      ['persons', 'persons-file'],
      ['orte', 'orte-file'],
    ]);
  });

  it('eine geteilte Quelle wird nur ein DataInput — und wandert an den Service', () => {
    const { setup, zweiter } = zweiWege();
    shareSource(zweiter, setup.chains[0].source!);
    const { xmi } = buildDataAtlasXmi(setup);
    const beschreibung = describeConfiguration(ladeKonfiguration(xmi));
    expect(beschreibung.dataInputs.map((i) => i.id)).toEqual(['persons-file']);
    expect(beschreibung.dataSets.every((d) => d.dataInput === 'persons-file')).toBe(true);
    // supportedEClasses des einen Eingangs deckt beide Datensätze ab
    expect(beschreibung.dataInputs[0].supportedEClasses).toEqual([
      'https://eclipse.org/fennec/data/atlas/example/person/1.0.0#//Person',
    ]);
  });

  it('gleiche Formate in beiden Wegen ergeben einen Eintrag', () => {
    const { setup, zweiter } = zweiWege();
    setup.chains[0].exports.push(format(ExportKind.CSV, 'csv', 'CSV', 'CSV.'));
    zweiter.exports.push(format(ExportKind.CSV, 'csv', 'CSV', 'CSV.'));
    const { xmi } = buildDataAtlasXmi(setup);
    const beschreibung = describeConfiguration(ladeKonfiguration(xmi));
    expect(beschreibung.exports.map((e) => e.id)).toEqual(['csv']);
    // Einig sind sie hier — der Wert steht am Service
    expect(beschreibung.dataSets.every((d) => d.distributionExport[0] === 'csv')).toBe(true);
  });

  it('verschiedene Formate bleiben getrennt und stehen am Datensatz', () => {
    const { setup, zweiter } = zweiWege();
    setup.chains[0].exports.push(format(ExportKind.CSV, 'csv', 'CSV', 'CSV.'));
    zweiter.exports.push(format(ExportKind.JSON, 'json', 'JSON', 'JSON.'));
    const { xmi } = buildDataAtlasXmi(setup);
    const beschreibung = describeConfiguration(ladeKonfiguration(xmi));
    expect(beschreibung.exports.map((e) => e.id)).toEqual(['csv', 'json']);
    expect(beschreibung.dataSets.map((d) => [d.id, d.distributionExport])).toEqual([
      ['persons', ['csv']],
      ['orte', ['json']],
    ]);
  });
});

describe('Datenbank gegen example/dataatlas-postgres-atlas.xmi', () => {
  /*
   * Der Atlas-Zwilling. Er traegt publication/<publications>, was Iteration 1
   * nicht erzeugt — der Graphvergleich liest die beiden Felder nicht, deshalb
   * stoert es nicht.
   */
  function postgresSetup(): AtlasSetup {
    const s = beispielSetup();
    s.endpoints[0].id = 'persons-pg-rest';
    s.instanceName = 'example-postgres-atlas';
    s.instanceDescription =
      'Example Data Atlas instance serving a PostgreSQL table as CSV, delivered by a Model Atlas.';
    const quelle = buildDatabaseSource('persons', 'persons');
    quelle.id = 'persons-jpa';
    quelle.dataSourceId = 'persons-db';
    quelle.dataSourceName = 'Persons DB';
    quelle.dataSourceFilter = '(dataSourceName=personsDs)';
    s.chains[0].source = quelle;
    s.endpoints[0].name = 'Persons Postgres REST';
    s.endpoints[0].description = 'REST endpoint publishing the database-backed persons.';
    s.endpoints[0].urlContext = '/pg';
    s.chains[0].datasets[0].description = 'All persons from the database, as CSV or JSON.';
    s.chains[0].exports.push(
      format(ExportKind.CSV, 'csv', 'CSV', 'Semicolon separated, no SQL-type row.'),
      format(ExportKind.JSON, 'json', 'JSON', 'Plain JSON, kept alongside the CSV export.'),
    );
    return s;
  }

  it('der Objektgraph stimmt', () => {
    const { erzeugt, vorlage } = vergleiche(postgresSetup(), 'dataatlas-postgres-atlas.xmi');
    expect(erzeugt).toEqual(vorlage);
  });

  it('JdbcDataSource und JPADataInput hängen zusammen', () => {
    const { xmi } = vergleiche(postgresSetup(), 'dataatlas-postgres.xmi');
    // Attributreihenfolge folgt dem Metamodell (JdbcDataSource: filter, id,
    // name), nicht der Vorlage — deshalb einzeln geprueft.
    expect(xmi).toMatch(/<dataSources [^>]*id="persons-db"/);
    expect(xmi).toMatch(/<dataSources [^>]*name="Persons DB"/);
    expect(xmi).toMatch(/<dataSources [^>]*filter="\(dataSourceName=personsDs\)"/);
    expect(xmi).toContain('xsi:type="configuration:JPADataInput"');
    expect(xmi).toContain('dataSource="persons-db"');
  });

  it('abgeleitetes Mapping heißt: kein persistenceConfig', () => {
    const { xmi } = vergleiche(postgresSetup(), 'dataatlas-postgres-atlas.xmi');
    expect(xmi).not.toContain('persistenceConfig');
  });

  it('und es warnt vor der Namens-Asymmetrie', () => {
    expect(buildDataAtlasXmi(postgresSetup()).warnings.join(' ')).toMatch(/Großbuchstaben/);
  });
});

describe('Round-Trip', () => {
  it('alle Referenzen lösen zu Objekten auf', () => {
    const { xmi } = buildDataAtlasXmi(beispielSetup());
    const root = ladeKonfiguration(xmi);
    const service = liste(root, 'services')[0];
    const dataSet = liste(root, 'dataSets')[0];
    const serviceConfig = liste(service, 'configuration')[0];

    // ID-Referenzen innerhalb der Datei
    const input = feature(service, 'dataInput') as EObject;
    expect(text(input, 'id')).toBe('persons-file');
    expect(feature(serviceConfig, 'dataSet')).toBe(dataSet);
    // Cross-Document-Referenz ins Domänenmodell
    expect((feature(dataSet, 'inputType') as EClass).getName()).toBe('Person');
    expect(liste(input, 'supportedEClasses')).toHaveLength(1);
  });
});
