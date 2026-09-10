/**
 * Prüfregeln aus Plan Abschnitt 4 — jede harte Regel und jede Warnung einmal.
 *
 * Harte Fehler werfen, statt eine unbrauchbare Konfiguration zu schreiben:
 * `name`, `description` und `path` sind im Zielmodell `lowerBound=1`, eine
 * doppelte id löst nicht auf, und ein relativer Datei-Pfad hat keinen
 * Bezugspunkt, weil die Konfiguration über HTTP aus dem Model Atlas kommt.
 *
 * Geprüft wird immer je Datenweg: die Quelle gehört der Kette, nicht dem
 * Setup, und eine geteilte Quelle muss einem anderen Weg gehören.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EClass, EPackage } from '@emfts/core';
import { registerEcoreFromString, setupPackages } from '../src/emf/setup';
import { buildDataAtlasXmi } from '../src/transform/toDataAtlasConfig';
import { SetupInvalidError, findErrors, findWarnings } from '../src/transform/validate';
import {
  addChain,
  buildChain,
  buildDatabaseSource,
  buildFileSource,
  initSetup,
  setup as setupRef,
  shareSource,
} from '../src/wizard/context';
import {
  DataatlaswizardFactory,
  ExportKind,
  MappingKind,
  type AtlasSetup,
  type DataChain,
  type DataSourceConfig,
} from '../src/generated';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
let personPackage: EPackage;
let s: AtlasSetup;
let kette: DataChain;

beforeAll(async () => {
  await setupPackages();
  personPackage = registerEcoreFromString(
    readFileSync(join(fixtures, 'person.ecore'), 'utf-8'),
    'model/person.ecore',
  );
});

beforeEach(() => {
  initSetup(personPackage);
  s = setupRef.value!;
  kette = s.chains[0];
  // Nur den ersten Datensatz behalten, damit die Fälle übersichtlich bleiben
  kette.datasets = [kette.datasets[0]];
});

/** Ersetzt die Datei-Quelle des Wegs durch eine Datenbank-Quelle. */
function setzeDatenbank(chain: DataChain): DataSourceConfig {
  const quelle = buildDatabaseSource('person', 'person');
  chain.source = quelle;
  return quelle;
}

/** Ein weiterer Datensatz derselben Klasse, mit eigenen Pflichtfeldern. */
function neuerDatensatz(id: string, eClass: EClass) {
  const dataset = DataatlaswizardFactory.eINSTANCE.createDatasetConfig();
  dataset.targetClass = eClass;
  dataset.id = id;
  dataset.name = id;
  dataset.description = `${id}.`;
  dataset.path = id;
  return dataset;
}

/** Der abgeleitete Zustand muss von sich aus gültig sein. */
describe('Ausgangslage', () => {
  it('was initSetup liefert, ist schreibbar', () => {
    expect(findErrors(s)).toEqual([]);
    expect(findWarnings(s)).toEqual([]);
    expect(() => buildDataAtlasXmi(s)).not.toThrow();
  });
});

describe('harte Fehler', () => {
  it('kein Domänenmodell', () => {
    s.modelPackage = undefined as never;
    expect(findErrors(s)).toContain('Kein Domänenmodell gewählt.');
  });

  it('kein Name der Instanz', () => {
    s.instanceName = '  ';
    expect(findErrors(s)).toContain('Der Name der Instanz fehlt.');
  });

  it('kein Datenweg', () => {
    s.chains = [];
    expect(findErrors(s)).toContain('Kein Datenweg angelegt.');
  });

  it('ein Datenweg ohne id', () => {
    kette.id = '';
    expect(findErrors(s)).toContain('Ein Datenweg hat keine id.');
  });

  it('kein ausgewählter Datensatz', () => {
    kette.datasets[0].selected = false;
    expect(findErrors(s)).toContain('Kein Datensatz ausgewählt.');
  });

  it('leere Pflichtfelder des Endpunkts', () => {
    s.serviceId = '';
    s.serviceName = '';
    s.serviceDescription = '';
    s.urlContext = '';
    const fehler = findErrors(s).join('\n');
    expect(fehler).toMatch(/id des REST-Endpunkts/);
    expect(fehler).toMatch(/Name des REST-Endpunkts/);
    expect(fehler).toMatch(/Beschreibung des REST-Endpunkts/);
    expect(fehler).toMatch(/Basis-Pfad/);
  });

  it('leere Pflichtfelder eines Datensatzes', () => {
    kette.datasets[0].name = '';
    kette.datasets[0].description = '';
    kette.datasets[0].path = '';
    const fehler = findErrors(s).join('\n');
    expect(fehler).toMatch(/Name fehlt/);
    expect(fehler).toMatch(/Beschreibung fehlt/);
    expect(fehler).toMatch(/Pfad fehlt/);
  });

  it('leere Pflichtfelder eines Formats', () => {
    const csv = DataatlaswizardFactory.eINSTANCE.createExportConfig();
    csv.kind = ExportKind.CSV;
    csv.id = '';
    kette.exports.push(csv);
    const fehler = findErrors(s).join('\n');
    expect(fehler).toMatch(/id fehlt/);
    expect(fehler).toMatch(/Name fehlt/);
    expect(fehler).toMatch(/Beschreibung fehlt/);
  });

  it('relativer Datei-Pfad', () => {
    // Die Konfiguration kommt über HTTP aus dem Model Atlas — relativ zu was?
    kette.source!.fileUri = 'data/person.xmi';
    expect(findErrors(s).join('\n')).toMatch(/muss absolut sein/);
  });

  it('eine file:-URI gilt als absolut', () => {
    kette.source!.fileUri = 'file:///DATA/data/person.xmi';
    expect(findErrors(s)).toEqual([]);
  });

  it('ein Datenweg ohne Datenquelle', () => {
    kette.source = undefined as never;
    expect(findErrors(s).join('\n')).toMatch(/keine Datenquelle/);
  });

  it('eigene und geteilte Quelle gleichzeitig', () => {
    const zweiter = addChain(buildChain('zweit', buildFileSource('zweit', '/y.xmi')))!;
    zweiter.sharedSource = kette.source!;
    expect(findErrors(s).join('\n')).toMatch(/eigene und geteilte Quelle gleichzeitig/);
  });

  it('eine geteilte Quelle, die keinem Datenweg gehört', () => {
    kette.source = undefined as never;
    kette.sharedSource = buildFileSource('fremd', '/y.xmi');
    expect(findErrors(s).join('\n')).toMatch(/gehört keinem Datenweg/);
  });

  it('doppelte ids', () => {
    kette.datasets.push(
      neuerDatensatz(kette.datasets[0].id, personPackage.getEClassifier('Person') as EClass),
    );
    expect(findErrors(s).join('\n')).toMatch(/ist mehrfach vergeben/);
  });

  it('eine geteilte Quelle wird nur einmal gezählt', () => {
    // Sie ergibt genau einen DataInput — ihre id ist also nicht doppelt
    const zweiter = addChain(buildChain('zweit', buildFileSource('zweit', '/y.xmi')))!;
    zweiter.datasets.push(
      neuerDatensatz('zweitPerson', personPackage.getEClassifier('Person') as EClass),
    );
    shareSource(zweiter, kette.source!);
    expect(findErrors(s)).toEqual([]);
  });

  it('IMPORTED ohne Mapping', () => {
    setzeDatenbank(kette).mappingKind = MappingKind.IMPORTED;
    expect(findErrors(s).join('\n')).toMatch(/keines geladen/);
  });

  it('IMPORTED mit einem Dokument, das kein EntityMappings ist', () => {
    const quelle = setzeDatenbank(kette);
    quelle.mappingKind = MappingKind.IMPORTED;
    quelle.eormXmi = '<?xml version="1.0"?><irgendwas/>';
    expect(findErrors(s).join('\n')).toMatch(/kein EntityMappings-Dokument/);
  });

  it('bei einer Datenbank müssen alle Klassen aus einem Package kommen', () => {
    // JPADataInputConfigurator prueft das serverseitig ebenso
    const fremd = registerEcoreFromString(
      readFileSync(join(fixtures, 'person.ecore'), 'utf-8')
        .replace('name="person"', 'name="fremd"')
        .replace('example/person/1.0.0', 'example/fremd/1.0.0'),
      'model/fremd.ecore',
    );
    kette.datasets.push(neuerDatensatz('fremd', fremd.getEClassifier('Person') as EClass));
    setzeDatenbank(kette);
    expect(findErrors(s).join('\n')).toMatch(/aus einem Package kommen/);
  });

  it('das gilt auch über die Wege, die sich die Datenbank teilen', () => {
    const fremd = registerEcoreFromString(
      readFileSync(join(fixtures, 'person.ecore'), 'utf-8')
        .replace('name="person"', 'name="fremd2"')
        .replace('example/person/1.0.0', 'example/fremd2/1.0.0'),
      'model/fremd2.ecore',
    );
    const datenbank = setzeDatenbank(kette);
    const zweiter = addChain(buildChain('zweit', buildFileSource('zweit', '/y.xmi')))!;
    zweiter.datasets.push(neuerDatensatz('fremd', fremd.getEClassifier('Person') as EClass));
    shareSource(zweiter, datenbank);
    expect(findErrors(s).join('\n')).toMatch(/aus einem Package kommen/);
  });

  it('buildDataAtlasXmi wirft mit allen Gründen', () => {
    s.instanceName = '';
    s.urlContext = '';
    try {
      buildDataAtlasXmi(s);
      expect.unreachable('hätte werfen müssen');
    } catch (e) {
      expect(e).toBeInstanceOf(SetupInvalidError);
      expect((e as SetupInvalidError).reasons.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('Warnungen', () => {
  /** Ein Format an den Weg hängen. */
  function setzeFormat(chain: DataChain, kind: ExportKind, id: string) {
    const e = DataatlaswizardFactory.eINSTANCE.createExportConfig();
    e.kind = kind;
    e.id = id;
    e.name = id;
    e.description = `${id}.`;
    chain.exports.push(e);
    return e;
  }

  it('nur CSV ersetzt die Vorgaben vollständig', () => {
    setzeFormat(kette, ExportKind.CSV, 'csv');
    expect(findWarnings(s).join('\n')).toMatch(/406/);
  });

  it('CSV zusammen mit JSON warnt nicht', () => {
    setzeFormat(kette, ExportKind.CSV, 'csv');
    setzeFormat(kette, ExportKind.JSON, 'json');
    expect(findWarnings(s)).toEqual([]);
  });

  it('die Warnung nennt den betroffenen Datenweg', () => {
    const zweiter = addChain(buildChain('zweit', buildFileSource('zweit', '/y.xmi')))!;
    zweiter.datasets.push(
      neuerDatensatz('zweitPerson', personPackage.getEClassifier('Person') as EClass),
    );
    setzeFormat(zweiter, ExportKind.CSV, 'csv');
    const warnungen = findWarnings(s);
    expect(warnungen).toHaveLength(1);
    expect(warnungen[0]).toMatch(/Datenweg „zweit"/);
  });

  it('abgeleitetes JPA-Mapping warnt vor der Namens-Asymmetrie', () => {
    setzeDatenbank(kette).mappingKind = MappingKind.DERIVED;
    expect(findWarnings(s).join('\n')).toMatch(/Großbuchstaben/);
  });

  it('batchSizeLimit kleiner als batchSize', () => {
    kette.datasets[0].batchSize = 100;
    kette.datasets[0].batchSizeLimit = 10;
    expect(findWarnings(s).join('\n')).toMatch(/batchSizeLimit \(10\) ist kleiner/);
  });

  it('Warnungen halten nicht auf — sie stehen im Ergebnis', () => {
    setzeDatenbank(kette);
    const ergebnis = buildDataAtlasXmi(s);
    expect(ergebnis.warnings.length).toBeGreaterThan(0);
    expect(ergebnis.xmi).toContain('JPADataInput');
  });
});
