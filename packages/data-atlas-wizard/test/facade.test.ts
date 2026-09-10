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
  DataatlaswizardFactory,
  DataatlaswizardPackage,
  ExportKind,
  InputKind,
  MappingKind,
} from '../src/generated';
import type { EClass, EStructuralFeature } from '@emfts/core';

const pkg = DataatlaswizardPackage.eINSTANCE;
const factory = DataatlaswizardFactory.eINSTANCE;

/** Was von einer Referenz hier geprüft wird. */
type Ref = { isContainment(): boolean; getUpperBound(): number };

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

  it('die fünf Klassen der Fassade', () => {
    const namen = [...pkg.getEClassifiers()].map((c) => c.getName());
    expect(namen).toEqual([
      'AtlasSetup',
      'DataChain',
      'DataSourceConfig',
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
      'modelPackage',
      'chains',
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
    for (const name of ['instanceName', 'modelPackage', 'serviceId', 'urlContext']) {
      expect(feature(setup, name).getLowerBound(), name).toBe(1);
    }
    // Beschreibung der Instanz bleibt optional
    expect(feature(setup, 'instanceDescription').getLowerBound()).toBe(0);
  });

  it('die Wege hängen als Containment am Setup, ihre Listen am Weg', () => {
    const setup = DataatlaswizardPackage.Literals.ATLAS_SETUP;
    const chains = feature(setup, 'chains') as unknown as Ref;
    expect(chains.isContainment()).toBe(true);
    expect(chains.getUpperBound()).toBe(-1);

    const chain = DataatlaswizardPackage.Literals.DATA_CHAIN;
    for (const name of ['datasets', 'exports']) {
      const ref = feature(chain, name) as unknown as Ref;
      expect(ref.isContainment(), name).toBe(true);
      expect(ref.getUpperBound(), name).toBe(-1);
    }
  });

  it('ein Weg hat entweder eine eigene oder eine geteilte Quelle', () => {
    const chain = DataatlaswizardPackage.Literals.DATA_CHAIN;
    const eigene = feature(chain, 'source') as unknown as Ref;
    expect(eigene.isContainment()).toBe(true);
    expect(eigene.getUpperBound()).toBe(1);
    // Die geteilte Quelle gehört einem anderen Weg — nur Referenz
    const geteilte = feature(chain, 'sharedSource') as unknown as Ref;
    expect(geteilte.isContainment()).toBe(false);
    expect(geteilte.getUpperBound()).toBe(1);
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
    expect(setup.openApi).toBe(false);
    expect(setup.paginationOffsetParameterName).toBe('offset');
    expect(setup.paginationSizeParameterName).toBe('limit');
    expect(setup.chains).toEqual([]);
  });

  it('Vorgaben der Kind-Objekte', () => {
    const chain = factory.createDataChain();
    expect(chain.datasets).toEqual([]);
    expect(chain.exports).toEqual([]);

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

    const quelle = factory.createDataSourceConfig();
    expect(quelle.kind).toBe(InputKind.FILE);
    expect(quelle.mappingKind).toBe(MappingKind.DERIVED);
  });

  it('die drei Enums decken die Fälle des Plans ab', () => {
    // ConfigMode ist entfallen: Verweise entstehen immer über den nsURI
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
