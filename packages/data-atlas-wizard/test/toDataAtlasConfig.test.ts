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
 * Transformer schreibt am Service (Plan, Abschnitt 1).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { URI, type BasicResourceSet, type EClass, type EObject, type EPackage } from '@emfts/core';
import { newResourceSet, registerEcoreFromString, setupPackages } from '../src/emf/setup';
import { buildDataAtlasXmi } from '../src/transform/toDataAtlasConfig';
import { initSetup, setup as setupRef } from '../src/wizard/context';
import { ConfigMode, ExportKind, DataatlaswizardFactory, type AtlasSetup } from '../src/generated';

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

/** Das Setup zum Beispiel aus `example/dataatlas.xmi`. */
function beispielSetup(mode: ConfigMode = ConfigMode.FILE): AtlasSetup {
  initSetup(personPackage, mode);
  const s = setupRef.value!;
  s.instanceName = 'example';
  s.instanceDescription =
    'Example Data Atlas instance: one file-based input served over REST (the Milestone 1 vertical slice).';
  s.fileSource!.id = 'persons-file';
  s.fileSource!.fileUri = 'data/persons.xmi';
  s.serviceId = 'persons-rest';
  s.serviceName = 'Persons REST';
  s.serviceDescription = 'REST endpoint publishing the example persons.';
  s.urlContext = '/example';
  s.openApi = false;

  // Die Vorlagen benutzen Plural-Namen; abgeleitet wird person/Person
  // (context.ts erklärt, warum nicht pluralisiert wird).
  const dataset = s.datasets[0];
  dataset.id = 'persons';
  dataset.name = 'Persons';
  dataset.description = 'All persons of the example data set.';
  dataset.path = 'persons';
  dataset.targetClass = person;
  return s;
}

describe('Datei-Grundfall gegen example/dataatlas.xmi', () => {
  it('der Objektgraph stimmt', () => {
    const { erzeugt, vorlage } = vergleiche(beispielSetup(), 'dataatlas.xmi');
    expect(erzeugt).toEqual(vorlage);
  });

  it('die Hrefs sind relative Dateipfade', () => {
    const { xmi } = vergleiche(beispielSetup(), 'dataatlas.xmi');
    const hrefs = [...xmi.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const attribute = [...xmi.matchAll(/(?:inputType|outputType)="([^"]+)"/g)].map((m) => m[1]);
    expect([...new Set([...hrefs, ...attribute])]).toEqual(['model/person.ecore#//Person']);
  });

  it('die id der Service-Konfiguration ist abgeleitet und eindeutig', () => {
    const s = beispielSetup();
    // ein zweiter Datensatz: mit <serviceId>-config waeren beide gleich
    const zweiter = DataatlaswizardFactory.eINSTANCE.createDatasetConfig();
    zweiter.targetClass = person;
    zweiter.id = 'orte';
    zweiter.name = 'Orte';
    zweiter.description = 'Alle Orte.';
    zweiter.path = 'orte';
    s.datasets.push(zweiter);

    const { xmi } = buildDataAtlasXmi(s);
    const ids = [...xmi.matchAll(/<configuration id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(['persons-config', 'orte-config']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Dateiname und keine Warnungen', () => {
    const ergebnis = buildDataAtlasXmi(beispielSetup());
    // So heisst die Datei, die DATA_ATLAS_CONFIG_URI standardmaessig sucht
    expect(ergebnis.fileName).toBe('dataatlas.xmi');
    expect(ergebnis.warnings).toEqual([]);
  });
});

describe('Atlas-Dialekt gegen example/dataatlas-atlas.xmi', () => {
  function atlasSetup(): AtlasSetup {
    const s = beispielSetup(ConfigMode.ATLAS);
    s.instanceName = 'example-atlas';
    s.instanceDescription = 'Example Data Atlas instance served from a Model Atlas.';
    s.fileSource!.fileUri = '/opt/dataatlas/runtime/data/data/persons.xmi';
    return s;
  }

  it('der Objektgraph stimmt', () => {
    const { erzeugt, vorlage } = vergleiche(atlasSetup(), 'dataatlas-atlas.xmi');
    expect(erzeugt).toEqual(vorlage);
  });

  it('die Hrefs sind nsURIs', () => {
    const { xmi } = vergleiche(atlasSetup(), 'dataatlas-atlas.xmi');
    expect(xmi).toContain(
      'href="https://eclipse.org/fennec/data/atlas/example/person/1.0.0#//Person"',
    );
    expect(xmi).not.toContain('model/person.ecore');
  });
});

describe('Pagination gegen fixtures/dataatlas-pagination.xmi', () => {
  it('eigene Parameternamen und Batch-Grenzen', () => {
    const s = beispielSetup();
    s.instanceName = 'pagination';
    s.instanceDescription =
      'Pagination test fixture: custom parameter names, a default batch size and a server-side batch size limit.';
    s.serviceDescription = 'REST endpoint with custom pagination parameter names.';
    s.urlContext = '/paged';
    s.paginationOffsetParameterName = 'start';
    s.paginationSizeParameterName = 'count';
    s.datasets[0].batchSize = 2;
    s.datasets[0].batchSizeLimit = 2;

    const { erzeugt, vorlage } = vergleiche(s, 'dataatlas-pagination.xmi');
    expect(erzeugt).toEqual(vorlage);
  });

  it('Vorgabewerte werden nicht geschrieben', () => {
    const { xmi } = vergleiche(beispielSetup(), 'dataatlas.xmi');
    expect(xmi).not.toContain('paginationOffsetParameterName');
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
    const factory = DataatlaswizardFactory.eINSTANCE;
    const csv = factory.createExportConfig();
    csv.kind = ExportKind.CSV;
    csv.id = 'csv';
    csv.name = 'CSV';
    csv.description = 'Semicolon separated, no SQL-type row.';
    const json = factory.createExportConfig();
    json.kind = ExportKind.JSON;
    json.id = 'json';
    json.name = 'JSON';
    json.description = 'Plain JSON, expressed through mediaType.';
    s.exports.push(csv, json);

    const { erzeugt, vorlage } = vergleiche(s, 'dataatlas-csv.xmi');
    expect(erzeugt.exports).toEqual(vorlage.exports);
  });

  it('die Formate gelten für den Datensatz', () => {
    const s = beispielSetup();
    const factory = DataatlaswizardFactory.eINSTANCE;
    const csv = factory.createExportConfig();
    csv.kind = ExportKind.CSV;
    csv.id = 'csv';
    csv.name = 'CSV';
    csv.description = 'CSV.';
    s.exports.push(csv);

    const { erzeugt } = vergleiche(s, 'dataatlas-csv.xmi');
    expect(erzeugt.dataSets[0].distributionExport).toEqual(['csv']);
  });

  it('CSV-ZIP setzt compressed', () => {
    const s = beispielSetup();
    const zip = DataatlaswizardFactory.eINSTANCE.createExportConfig();
    zip.kind = ExportKind.CSV_ZIP;
    zip.id = 'csv-zip';
    zip.name = 'CSV (ZIP)';
    zip.description = 'Gepackt.';
    s.exports.push(zip);
    const { xmi } = buildDataAtlasXmi(s);
    expect(xmi).toContain('compressed="true"');
  });

  it('nur CSV warnt — ein Format ersetzt die Vorgaben vollständig', () => {
    const s = beispielSetup();
    const csv = DataatlaswizardFactory.eINSTANCE.createExportConfig();
    csv.kind = ExportKind.CSV;
    csv.id = 'csv';
    csv.name = 'CSV';
    csv.description = 'CSV.';
    s.exports.push(csv);
    expect(buildDataAtlasXmi(s).warnings.join(' ')).toMatch(/406/);
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
