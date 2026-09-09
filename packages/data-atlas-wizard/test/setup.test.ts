/**
 * EMF-Setup (Umsetzungsschritt 3).
 *
 * Prüft, was ohne laufende App nicht auffällt: dass alle vier Metamodelle
 * registriert sind und dass der Fixup die Codegen-Lücken (emf.ts#83) wirklich
 * schließt. Der letzte Test ist der eigentliche Beweis — ohne Fixup kommt aus
 * dem Round-Trip der String "true" statt des Wahrheitswerts zurück.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  EPackageRegistry,
  URI,
  getEcorePackage,
  type EClass,
  type EEnum,
  type EPackage,
} from '@emfts/core';
import {
  CONFIGURATION_NS_URI,
  EORM_NS_URI,
  getConfigurationPackage,
  getEormPackage,
  newResourceSet,
  setupPackages,
} from '../src/emf/setup';
import { DataatlaswizardFactory, DataatlaswizardPackage } from '../src/generated';

beforeAll(async () => {
  await setupPackages();
});

const facade = DataatlaswizardPackage.eINSTANCE as unknown as EPackage;

describe('setupPackages', () => {
  it('registriert Fassade, Zielmetamodell, eorm und das UIModel', () => {
    expect(EPackageRegistry.INSTANCE.get(facade.getNsURI()!)).toBeTruthy();
    expect(EPackageRegistry.INSTANCE.get(CONFIGURATION_NS_URI)).toBeTruthy();
    expect(EPackageRegistry.INSTANCE.get(EORM_NS_URI)).toBeTruthy();
    expect(EPackageRegistry.INSTANCE.get('http://uimodel/1.0')).toBeTruthy();
  });

  it('ist idempotent — der zweite Aufruf ändert nichts', async () => {
    const vorher = getConfigurationPackage();
    await setupPackages();
    expect(getConfigurationPackage()).toBe(vorher);
  });

  it('das Zielmetamodell trägt die Klassen, die der Transformer braucht', () => {
    const pkg = getConfigurationPackage();
    for (const name of [
      'DataAtlasConfiguration',
      'FileDataInput',
      'JPADataInput',
      'DataSet',
      'RestDataService',
      'RestDataServiceConfiguration',
      'DistributionExport',
      'CSVDistributionExport',
      'JdbcDataSource',
    ]) {
      expect(pkg.getEClassifier(name), name).toBeTruthy();
    }
  });

  it('eorm liefert EntityMappings als Wurzel für ein importiertes Mapping', () => {
    expect(getEormPackage().getEClassifier('EntityMappings')).toBeTruthy();
  });

  it('die Ecore-Wrapper-Datentypen stehen bereit', () => {
    // Domänenmodelle aus Java-Werkzeugen referenzieren sie regelmäßig
    for (const name of ['EIntegerObject', 'EBooleanObject', 'EDoubleObject', 'ELongObject']) {
      expect(getEcorePackage().getEClassifier(name), name).toBeTruthy();
    }
  });
});

describe('Fixup der Codegen-Lücken (emf.ts#83)', () => {
  it('die vier EEnums sind Classifier des Packages', () => {
    for (const name of ['ConfigMode', 'InputKind', 'MappingKind', 'ExportKind']) {
      const eEnum = facade.getEClassifier(name) as EEnum | null;
      expect(eEnum, name).toBeTruthy();
      expect([...eEnum!.getELiterals()].length, name).toBeGreaterThan(1);
    }
    expect((facade.getEClassifier('ExportKind') as EEnum).getELiterals().get(3).getName()).toBe(
      'CSV_ZIP',
    );
  });

  it('jedes Attribut der Fassade hat einen eType', () => {
    const ohneTyp: string[] = [];
    for (const classifier of facade.getEClassifiers()) {
      const eClass = classifier as EClass;
      if (typeof eClass.getEStructuralFeatures !== 'function') continue;
      for (const feature of eClass.getEStructuralFeatures()) {
        if (!feature.getEType()) ohneTyp.push(`${eClass.getName()}.${feature.getName()}`);
      }
    }
    expect(ohneTyp).toEqual([]);
  });

  it('die Typen sind die erwarteten', () => {
    const setup = DataatlaswizardPackage.Literals.ATLAS_SETUP;
    const typ = (name: string) => setup.getEStructuralFeature(name)?.getEType()?.getName();
    expect(typ('instanceName')).toBe('EString');
    expect(typ('openApi')).toBe('EBoolean');
    expect(typ('configMode')).toBe('ConfigMode');
    expect(typ('inputKind')).toBe('InputKind');

    const dataset = DataatlaswizardPackage.Literals.DATASET_CONFIG;
    expect(dataset.getEStructuralFeature('batchSize')?.getEType()?.getName()).toBe('EInt');
    // Ecore-Datentypen müssen aus dem kanonischen Package kommen, sonst
    // scheitern die Identitätsvergleiche im Serializer
    expect(setup.getEStructuralFeature('instanceName')?.getEType()).toBe(
      getEcorePackage().getEClassifier('EString'),
    );
  });

  it('der Round-Trip behält Wahrheitswerte und Zahlen', () => {
    // Genau der Schaden aus emf.ts#83: ohne eType kommt "true"/"500" als
    // String zurück, und ein if() auf "false" wäre wahr.
    const rs = newResourceSet();
    const raus: any = rs.createResource(URI.createURI('setup.xmi'));
    const setup = DataatlaswizardFactory.eINSTANCE.createAtlasSetup();
    setup.instanceName = 'demo';
    setup.openApi = true;
    const dataset = DataatlaswizardFactory.eINSTANCE.createDatasetConfig();
    dataset.id = 'persons';
    dataset.batchSize = 500;
    setup.datasets.push(dataset);
    raus.getContents().add(setup);
    const xmi = raus.saveToString();

    const rein: any = newResourceSet().createResource(URI.createURI('back.xmi'));
    rein.loadFromString(xmi);
    const geladen = rein.getContents().get(0);

    expect(geladen.openApi).toBe(true);
    expect(typeof geladen.openApi).toBe('boolean');
    expect(geladen.datasets[0].batchSize).toBe(500);
    expect(typeof geladen.datasets[0].batchSize).toBe('number');
  });

  it('Enums kommen als EEnumLiteral zurück, nicht als Name', () => {
    /*
     * Kehrseite des Fixups und festgehalten, damit es nicht überrascht: Mit
     * eType am Feature wandelt der Loader den Wert in ein EEnumLiteral
     * (emf.ts#70). Der generierte TypeScript-Typ ist aber ein String-Union
     * (`ConfigMode.FILE === 'FILE'`) — beides passt nicht zusammen.
     *
     * Für Iteration 1 ohne Folgen: die Fassade wird in der Oberfläche
     * aufgebaut, nie aus XMI geladen. Wer sie einmal speichern und
     * zurücklesen will, braucht beim Lesen eine Normalisierung auf den Namen.
     */
    const rs = newResourceSet();
    const raus: any = rs.createResource(URI.createURI('enum.xmi'));
    const setup = DataatlaswizardFactory.eINSTANCE.createAtlasSetup();
    setup.instanceName = 'demo';
    raus.getContents().add(setup);
    const xmi = raus.saveToString();
    expect(xmi).toContain('configMode="FILE"'); // geschrieben wird der Name

    const rein: any = newResourceSet().createResource(URI.createURI('enum-back.xmi'));
    rein.loadFromString(xmi);
    const geladen = rein.getContents().get(0);
    expect(typeof geladen.configMode).toBe('object');
    expect((geladen.configMode as { getName(): string }).getName()).toBe('FILE');
  });
});
