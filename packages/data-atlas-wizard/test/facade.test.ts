/**
 * Fassadenmodell (Umsetzungsschritt 2).
 *
 * Hält Namen, Kardinalitäten und Vorgabewerte fest. Die Namen tauchen an drei
 * Stellen wieder auf, die der Compiler nicht verbindet: in den UIModel-Schritten
 * (`feature=`-Hrefs), in `wizardPackageFixup.ts` und im Transformer. Eine
 * Umbenennung im Modell fällt hier auf, statt erst im Browser.
 */
import { describe, expect, it } from 'vitest';
import {
  ConfigMode,
  DataatlaswizardFactory,
  DataatlaswizardPackage,
  ExportKind,
  InputKind,
  MappingKind,
} from '../src/generated';
import type { EClass, EStructuralFeature } from '@emfts/core';

const pkg = DataatlaswizardPackage.eINSTANCE;
const factory = DataatlaswizardFactory.eINSTANCE;

function feature(eClass: EClass, name: string): EStructuralFeature {
  const f = eClass.getEStructuralFeature(name);
  expect(f, `Feature ${eClass.getName()}.${name} fehlt`).toBeTruthy();
  return f as EStructuralFeature;
}

describe('Fassadenmodell', () => {
  it('Package-Identität', () => {
    expect(pkg.getNsURI()).toBe('http://fennec/data/atlas/data-atlas-wizard/1.0');
    expect(pkg.getNsPrefix()).toBe('dataatlaswizard');
  });

  it('die sechs Klassen der Fassade', () => {
    const namen = [...pkg.getEClassifiers()].map((c) => c.getName());
    expect(namen).toEqual([
      'AtlasSetup',
      'ModelFileRef',
      'FileSourceConfig',
      'DatabaseSourceConfig',
      'DatasetConfig',
      'ExportConfig',
    ]);
  });

  it('AtlasSetup trägt alle Entscheidungen des Nutzers', () => {
    const setup = DataatlaswizardPackage.Literals.ATLAS_SETUP;
    const namen = [...setup.getEAllStructuralFeatures()].map((f) => f.getName());
    expect(namen).toEqual([
      'instanceName',
      'instanceDescription',
      'configMode',
      'modelPackage',
      'modelFiles',
      'inputKind',
      'fileSource',
      'databaseSource',
      'datasets',
      'exports',
      'serviceId',
      'serviceName',
      'serviceDescription',
      'urlContext',
      'openApi',
      'paginationOffsetParameterName',
      'paginationSizeParameterName',
    ]);
  });

  it('Pflichtfelder sind als lowerBound=1 markiert', () => {
    const setup = DataatlaswizardPackage.Literals.ATLAS_SETUP;
    for (const name of ['instanceName', 'configMode', 'modelPackage', 'inputKind', 'serviceId', 'urlContext']) {
      expect(feature(setup, name).getLowerBound(), name).toBe(1);
    }
    // Beschreibung der Instanz bleibt optional
    expect(feature(setup, 'instanceDescription').getLowerBound()).toBe(0);
  });

  it('die Datenquellen hängen als optionale Containments am Setup', () => {
    const setup = DataatlaswizardPackage.Literals.ATLAS_SETUP;
    for (const name of ['fileSource', 'databaseSource']) {
      const ref = feature(setup, name) as unknown as { isContainment(): boolean; getUpperBound(): number };
      expect(ref.isContainment(), name).toBe(true);
      expect(ref.getUpperBound(), name).toBe(1);
    }
    for (const name of ['modelFiles', 'datasets', 'exports']) {
      const ref = feature(setup, name) as unknown as { isContainment(): boolean; getUpperBound(): number };
      expect(ref.isContainment(), name).toBe(true);
      expect(ref.getUpperBound(), name).toBe(-1);
    }
  });

  it('DatasetConfig nennt die Klasse targetClass, nicht eClass', () => {
    // "eClass" kollidiert mit EObject.eClass(); die generierte Impl liesse
    // sich damit nicht uebersetzen. Gleiche Wahl wie im eorm-Wizard.
    const dataset = DataatlaswizardPackage.Literals.DATASET_CONFIG;
    expect(dataset.getEStructuralFeature('eClass')).toBeFalsy();
    expect(feature(dataset, 'targetClass')).toBeTruthy();
  });

  it('Vorgabewerte stehen an einer frischen Instanz', () => {
    const setup = factory.createAtlasSetup();
    expect(setup.configMode).toBe(ConfigMode.FILE);
    expect(setup.inputKind).toBe(InputKind.FILE);
    expect(setup.openApi).toBe(false);
    expect(setup.paginationOffsetParameterName).toBe('offset');
    expect(setup.paginationSizeParameterName).toBe('limit');
    expect(setup.modelFiles).toEqual([]);
    expect(setup.datasets).toEqual([]);
    expect(setup.exports).toEqual([]);
  });

  it('Vorgaben der Kind-Objekte', () => {
    const dataset = factory.createDatasetConfig();
    expect(dataset.selected).toBe(true);
    // -1 heisst "nicht gesetzt" — der Transformer schreibt es dann nicht
    expect(dataset.batchSize).toBe(-1);
    expect(dataset.batchSizeLimit).toBe(-1);

    const exp = factory.createExportConfig();
    expect(exp.selected).toBe(true);
    expect(exp.kind).toBe(ExportKind.JSON);
    expect(exp.separator).toBe(';');
    expect(exp.includeTypeHeader).toBe(false);

    const db = factory.createDatabaseSourceConfig();
    expect(db.mappingKind).toBe(MappingKind.DERIVED);
  });

  it('die vier Enums decken die Fälle des Plans ab', () => {
    expect(Object.keys(ConfigMode)).toEqual(['FILE', 'ATLAS']);
    expect(Object.keys(InputKind)).toEqual(['FILE', 'DATABASE']);
    expect(Object.keys(MappingKind)).toEqual(['DERIVED', 'IMPORTED']);
    expect(Object.keys(ExportKind)).toEqual(['JSON', 'XML', 'CSV', 'CSV_ZIP']);
  });

  it('Werte werden über die Property-Accessoren geschrieben', () => {
    // emfts-codegen erzeugt TS-Properties, keine Java-Setter: setup.instanceName = …
    const setup = factory.createAtlasSetup();
    setup.instanceName = 'demo';
    expect(setup.instanceName).toBe('demo');
    expect(setup.eGet(feature(DataatlaswizardPackage.Literals.ATLAS_SETUP, 'instanceName'))).toBe('demo');
  });
});
