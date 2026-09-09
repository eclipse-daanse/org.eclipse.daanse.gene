/**
 * Die zwei Serializer-Überschreibungen (Umsetzungsschritt 5).
 *
 * Getestet gegen das echte Zielmetamodell: eine kleine, aber vollständige
 * DataAtlasConfiguration mit einem FileDataInput, einem DataSet und einem
 * RestDataService — genau die Referenzarten, an denen die beiden emf.ts-Lücken
 * hängen. Erwartet wird das Format von `example/dataatlas.xmi` bzw.
 * `example/dataatlas-atlas.xmi`.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EClass, EObject, EPackage } from '@emfts/core';
import { getConfigurationPackage, registerEcoreFromString, setupPackages } from '../src/emf/setup';
import { createDataAtlasResource, type ModelFileMap } from '../src/transform/dataAtlasResource';
import { ConfigMode } from '../src/generated';

const PERSON_ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" name="person"
    nsURI="https://eclipse.org/fennec/data/atlas/example/person/1.0.0" nsPrefix="person">
  <eClassifiers xsi:type="ecore:EClass" name="Person">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="id" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString" iD="true"/>
  </eClassifiers>
</ecore:EPackage>`;

const PERSON_NS = 'https://eclipse.org/fennec/data/atlas/example/person/1.0.0';

let personPackage: EPackage;
let config: EPackage;

beforeAll(async () => {
  await setupPackages();
  personPackage = registerEcoreFromString(PERSON_ECORE, 'model/person.ecore');
  config = getConfigurationPackage();
});

/** Baut die Beispiel-Instanz auf — dieselbe Struktur wie das Golden-File. */
function buildConfiguration(): EObject {
  const factory = config.getEFactoryInstance() as unknown as { create(c: EClass): EObject };
  const create = (name: string) => factory.create(config.getEClassifier(name) as EClass);
  const set = (o: EObject, name: string, v: unknown) =>
    o.eSet(o.eClass().getEStructuralFeature(name)!, v);
  const add = (o: EObject, name: string, v: unknown) =>
    (o.eGet(o.eClass().getEStructuralFeature(name)!) as unknown as { add(x: unknown): void }).add(v);

  const person = personPackage.getEClassifier('Person') as EClass;

  const root = create('DataAtlasConfiguration');
  set(root, 'name', 'example');

  const input = create('FileDataInput');
  set(input, 'id', 'persons-file');
  set(input, 'uri', 'data/persons.xmi');
  add(input, 'supportedEClasses', person);
  add(root, 'dataInputs', input);

  const dataSet = create('DataSet');
  set(dataSet, 'id', 'persons');
  set(dataSet, 'name', 'Persons');
  set(dataSet, 'description', 'All persons.');
  set(dataSet, 'dataInput', input);
  set(dataSet, 'inputType', person);
  set(dataSet, 'outputType', person);
  add(root, 'dataSets', dataSet);

  const service = create('RestDataService');
  set(service, 'id', 'persons-rest');
  set(service, 'name', 'Persons REST');
  set(service, 'description', 'REST endpoint.');
  set(service, 'urlContext', '/example');
  const serviceConfig = create('RestDataServiceConfiguration');
  set(serviceConfig, 'id', 'persons-rest-config');
  set(serviceConfig, 'dataSet', dataSet);
  set(serviceConfig, 'path', 'persons');
  add(service, 'configuration', serviceConfig);
  add(root, 'services', service);

  return root;
}

function serialize(mode: ConfigMode, modelFiles?: ModelFileMap): string {
  const resource = createDataAtlasResource('dataatlas.xmi', { mode, modelFiles });
  resource.getContents().add(buildConfiguration());
  return resource.saveToString();
}

const dateien: ModelFileMap = new Map([[PERSON_NS, 'model/person.ecore']]);

describe('Href-Dialekt', () => {
  it('FILE-Modus: relativer Datei-Href', () => {
    const xmi = serialize(ConfigMode.FILE, dateien);
    expect(xmi).toContain('href="model/person.ecore#//Person"');
    expect(xmi).not.toContain(PERSON_NS);
  });

  it('ATLAS-Modus: nsURI-Href', () => {
    const xmi = serialize(ConfigMode.ATLAS);
    expect(xmi).toContain(`href="${PERSON_NS}#//Person"`);
    expect(xmi).not.toContain('model/person.ecore');
  });

  it('FILE-Modus ohne Eintrag: harter Fehler statt falschem Href', () => {
    // Ein nsURI-Href in einer Datei-Konfiguration sieht plausibel aus und
    // loest beim Laden nicht auf — deshalb wirft es hier.
    expect(() => serialize(ConfigMode.FILE, new Map())).toThrowError(
      /Kein modelFiles-Eintrag für https:\/\/eclipse\.org\/fennec\/data\/atlas\/example\/person/,
    );
  });

  it('der Fehler nennt die betroffene Klasse', () => {
    expect(() => serialize(ConfigMode.FILE)).toThrowError(/Person/);
  });
});

describe('ID-Fragmente', () => {
  let xmi: string;

  beforeEach(() => {
    xmi = serialize(ConfigMode.FILE, dateien);
  });

  it('dokumentinterne Referenzen benutzen den iD-Wert', () => {
    expect(xmi).toContain('dataInput="persons-file"');
    expect(xmi).toContain('dataSet="persons"');
  });

  it('kein Pfadfragment mehr (emf.ts#84)', () => {
    expect(xmi).not.toMatch(/="\/\d+(\/\d+)*"/);
  });

  it('und kein xmi:id — die Vorlagen des Data Atlas haben keins', () => {
    expect(xmi).not.toContain('xmi:id');
  });
});

describe('was der Serializer von sich aus richtig macht', () => {
  it('xsi:type an den abstrakten Features', () => {
    const xmi = serialize(ConfigMode.FILE, dateien);
    expect(xmi).toContain('xsi:type="configuration:FileDataInput"');
    expect(xmi).toContain('xsi:type="configuration:RestDataService"');
  });

  it('Elementreihenfolge nach dem Metamodell', () => {
    const xmi = serialize(ConfigMode.FILE, dateien);
    expect(xmi.indexOf('<dataInputs')).toBeLessThan(xmi.indexOf('<dataSets'));
    expect(xmi.indexOf('<dataSets')).toBeLessThan(xmi.indexOf('<services'));
  });

  it('Namespace-Deklaration des Zielmetamodells', () => {
    const xmi = serialize(ConfigMode.FILE, dateien);
    expect(xmi).toContain(
      'xmlns:configuration="https://eclipse.org/fennec/data/atlas/configuration/1.0.0"',
    );
  });
});

describe('Round-Trip', () => {
  it('beide Referenzarten lösen wieder zu Objekten auf', () => {
    const xmi = serialize(ConfigMode.ATLAS);
    const zurueck = createDataAtlasResource('back.xmi', { mode: ConfigMode.ATLAS });
    zurueck.loadFromString(xmi);
    const root: any = zurueck.getContents().get(0);
    const dataSet = root.eGet(root.eClass().getEStructuralFeature('dataSets')).get(0);
    const input = dataSet.eGet(dataSet.eClass().getEStructuralFeature('dataInput'));
    const inputType = dataSet.eGet(dataSet.eClass().getEStructuralFeature('inputType'));

    // ID-Referenz auf ein Objekt derselben Datei
    expect(input.eGet(input.eClass().getEStructuralFeature('id'))).toBe('persons-file');
    // Cross-Document-Referenz ins Metamodell
    expect(inputType.getName()).toBe('Person');
  });
});
