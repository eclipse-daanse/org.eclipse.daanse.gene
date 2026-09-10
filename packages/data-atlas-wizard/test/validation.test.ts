/**
 * Prüfregeln aus Plan Abschnitt 4 — jede harte Regel und jede Warnung einmal.
 *
 * Harte Fehler werfen, statt eine unbrauchbare Konfiguration zu schreiben:
 * `name`, `description` und `path` sind im Zielmodell `lowerBound=1`, eine
 * doppelte id löst nicht auf, und ein relativer Datei-Pfad hat im Atlas-Modus
 * keinen Bezugspunkt.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EClass, EPackage } from '@emfts/core';
import { registerEcoreFromString, setupPackages } from '../src/emf/setup';
import { buildDataAtlasXmi } from '../src/transform/toDataAtlasConfig';
import { SetupInvalidError, findErrors, findWarnings } from '../src/transform/validate';
import { buildDatabaseSource, initSetup, setup as setupRef } from '../src/wizard/context';
import {
  DataatlaswizardFactory,
  ExportKind,
  MappingKind,
  type AtlasSetup,
} from '../src/generated';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
let personPackage: EPackage;
let s: AtlasSetup;

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
  // Nur den ersten Datensatz behalten, damit die Fälle übersichtlich bleiben
  s.datasets = [s.datasets[0]];
});

/** Ersetzt die Datei-Quelle durch eine Datenbank-Quelle. */
function setzeDatenbank(setup: AtlasSetup) {
  const quelle = buildDatabaseSource('person', 'person');
  setup.dataSources = [quelle];
  for (const d of setup.datasets) d.sourceId = quelle.id;
  return quelle;
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

  it('kein ausgewählter Datensatz', () => {
    s.datasets[0].selected = false;
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
    s.datasets[0].name = '';
    s.datasets[0].description = '';
    s.datasets[0].path = '';
    const fehler = findErrors(s).join('\n');
    expect(fehler).toMatch(/Name fehlt/);
    expect(fehler).toMatch(/Beschreibung fehlt/);
    expect(fehler).toMatch(/Pfad fehlt/);
  });

  it('relativer Datei-Pfad', () => {
    // Die Konfiguration kommt über HTTP aus dem Model Atlas — relativ zu was?
    s.dataSources[0].fileUri = 'data/person.xmi';
    expect(findErrors(s).join('\n')).toMatch(/muss absolut sein/);
  });

  it('eine file:-URI gilt als absolut', () => {
    s.dataSources[0].fileUri = 'file:///DATA/data/person.xmi';
    expect(findErrors(s)).toEqual([]);
  });

  it('keine Datenquelle', () => {
    s.dataSources = [];
    expect(findErrors(s).join('\n')).toMatch(/Keine Datenquelle/);
  });

  it('ein Datensatz ohne Datenquelle', () => {
    s.datasets[0].sourceId = '';
    expect(findErrors(s).join('\n')).toMatch(/keine Datenquelle zugeordnet/);
  });

  it('ein Datensatz mit unbekanntem Format', () => {
    s.datasets[0].exportIds = ['gibt-es-nicht'];
    expect(findErrors(s).join('\n')).toMatch(/das Format „gibt-es-nicht" gibt es nicht/);
  });

  it('ein Datensatz zeigt auf eine unbekannte Datenquelle', () => {
    s.datasets[0].sourceId = 'weg';
    expect(findErrors(s).join('\n')).toMatch(/die Datenquelle „weg" gibt es nicht/);
  });

  it('doppelte ids', () => {
    const zweiter = DataatlaswizardFactory.eINSTANCE.createDatasetConfig();
    zweiter.targetClass = personPackage.getEClassifier('Person') as EClass;
    zweiter.id = s.datasets[0].id;
    zweiter.name = 'Doppelt';
    zweiter.description = 'Doppelt.';
    zweiter.path = 'doppelt';
    s.datasets.push(zweiter);
    expect(findErrors(s).join('\n')).toMatch(/ist mehrfach vergeben/);
  });

  it('IMPORTED ohne Mapping', () => {
    setzeDatenbank(s).mappingKind = MappingKind.IMPORTED;
    expect(findErrors(s).join('\n')).toMatch(/keines geladen/);
  });

  it('IMPORTED mit einem Dokument, das kein EntityMappings ist', () => {
    const quelle = setzeDatenbank(s);
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
    const zweiter = DataatlaswizardFactory.eINSTANCE.createDatasetConfig();
    zweiter.targetClass = fremd.getEClassifier('Person') as EClass;
    zweiter.id = 'fremd';
    zweiter.name = 'Fremd';
    zweiter.description = 'Fremd.';
    zweiter.path = 'fremd';
    s.datasets.push(zweiter);
    setzeDatenbank(s);
    for (const d of s.datasets) d.sourceId = s.dataSources[0].id;
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
  it('nur CSV ersetzt die Vorgaben vollständig', () => {
    const csv = DataatlaswizardFactory.eINSTANCE.createExportConfig();
    csv.kind = ExportKind.CSV;
    csv.id = 'csv';
    csv.name = 'CSV';
    csv.description = 'CSV.';
    s.exports.push(csv);
    for (const d of s.datasets) d.exportIds = ['csv'];
    expect(findWarnings(s).join('\n')).toMatch(/406/);
  });

  it('CSV zusammen mit JSON warnt nicht', () => {
    const factory = DataatlaswizardFactory.eINSTANCE;
    for (const [kind, id] of [
      [ExportKind.CSV, 'csv'],
      [ExportKind.JSON, 'json'],
    ] as const) {
      const e = factory.createExportConfig();
      e.kind = kind;
      e.id = id;
      e.name = id;
      e.description = id;
      s.exports.push(e);
    }
    for (const d of s.datasets) d.exportIds = ['csv', 'json'];
    expect(findWarnings(s)).toEqual([]);
  });

  it('abgeleitetes JPA-Mapping warnt vor der Namens-Asymmetrie', () => {
    setzeDatenbank(s).mappingKind = MappingKind.DERIVED;
    expect(findWarnings(s).join('\n')).toMatch(/Großbuchstaben/);
  });

  it('batchSizeLimit kleiner als batchSize', () => {
    s.datasets[0].batchSize = 100;
    s.datasets[0].batchSizeLimit = 10;
    expect(findWarnings(s).join('\n')).toMatch(/batchSizeLimit \(10\) ist kleiner/);
  });

  it('Warnungen halten nicht auf — sie stehen im Ergebnis', () => {
    setzeDatenbank(s);
    const ergebnis = buildDataAtlasXmi(s);
    expect(ergebnis.warnings.length).toBeGreaterThan(0);
    expect(ergebnis.xmi).toContain('JPADataInput');
  });
});
