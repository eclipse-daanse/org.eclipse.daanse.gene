/**
 * Ableitungsregeln (Umsetzungsschritt 4, Plan Abschnitt 2).
 *
 * Geprüft wird gegen das Beispiel-Domänenmodell aus dem data.atlas-Repo, also
 * gegen dasselbe Modell, aus dem die Golden-Fixtures entstanden sind — nur
 * dort inline, damit der Test nicht am Nachbar-Checkout hängt.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EClass, EPackage } from '@emfts/core';
import { setupPackages, registerEcoreFromString } from '../src/emf/setup';
import {
  ATLAS_DATA_PREFIX,
  addModelFile,
  buildDataset,
  concreteClasses,
  defaultFileUri,
  documentationOf,
  initSetup,
  lowerCamel,
  selectedDatasets,
  setConfigMode,
  setup,
  slugOf,
  titleCase,
  version,
} from '../src/wizard/context';
import { ConfigMode, InputKind } from '../src/generated';

/** Wie example/model/person.ecore, um eine abstrakte Klasse ergänzt. */
const PERSON_ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore" name="person"
    nsURI="https://eclipse.org/fennec/data/atlas/example/person/1.0.0" nsPrefix="person">
  <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
    <details key="documentation" value="Minimal example domain model."/>
  </eAnnotations>
  <eClassifiers xsi:type="ecore:EClass" name="Person">
    <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
      <details key="documentation" value="A person of the example data set."/>
    </eAnnotations>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="id" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString" iD="true"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="firstName"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
  </eClassifiers>
  <!-- ohne Dokumentation und mit zusammengesetztem Namen -->
  <eClassifiers xsi:type="ecore:EClass" name="WaterQuality"/>
  <!-- abstrakt: kann kein Datensatz werden -->
  <eClassifiers xsi:type="ecore:EClass" name="AbstractThing" abstract="true"/>
  <eClassifiers xsi:type="ecore:EClass" name="Marker" interface="true"/>
  <eClassifiers xsi:type="ecore:EEnum" name="Kind">
    <eLiterals name="A" value="0"/>
  </eClassifiers>
</ecore:EPackage>`;

let personPackage: EPackage;

beforeAll(async () => {
  await setupPackages();
  personPackage = registerEcoreFromString(PERSON_ECORE, 'model/person.ecore');
});

describe('Namensregeln', () => {
  it('slugOf trennt CamelCase', () => {
    expect(slugOf('WaterQuality')).toBe('water-quality');
    expect(slugOf('person')).toBe('person');
    expect(slugOf('CWM Relational')).toBe('cwm-relational');
  });

  it('lowerCamel und titleCase', () => {
    expect(lowerCamel('WaterQuality')).toBe('waterQuality');
    expect(lowerCamel('water-quality')).toBe('waterQuality');
    expect(titleCase('WaterQuality')).toBe('Water Quality');
    expect(titleCase('person')).toBe('Person');
  });
});

describe('documentationOf', () => {
  it('liest die GenModel-Annotation', () => {
    const person = personPackage.getEClassifier('Person') as EClass;
    expect(documentationOf(person)).toBe('A person of the example data set.');
    // Am EPackage nur über den reflektiven Weg zu bekommen: der typisierte
    // Getter sieht die geladenen Annotationen dort nicht (emf.ts#86).
    expect(documentationOf(personPackage)).toBe('Minimal example domain model.');
  });

  it('liefert null, wenn keine da ist', () => {
    expect(documentationOf(personPackage.getEClassifier('WaterQuality') as EClass)).toBeNull();
  });
});

describe('concreteClasses', () => {
  it('lässt abstrakte, Interfaces und Nicht-Klassen weg', () => {
    const namen = concreteClasses(personPackage).map((c) => c.getName());
    expect(namen).toEqual(['Person', 'WaterQuality']);
  });
});

describe('buildDataset', () => {
  it('leitet id, name, path und Beschreibung ab', () => {
    const dataset = buildDataset(personPackage.getEClassifier('Person') as EClass);
    expect(dataset.selected).toBe(true);
    expect(dataset.id).toBe('person');
    expect(dataset.name).toBe('Person');
    expect(dataset.path).toBe('person');
    expect(dataset.description).toBe('A person of the example data set.');
  });

  it('bildet ohne Annotation einen Satz — description ist Pflicht', () => {
    const dataset = buildDataset(personPackage.getEClassifier('WaterQuality') as EClass);
    expect(dataset.id).toBe('waterQuality');
    expect(dataset.name).toBe('Water Quality');
    expect(dataset.description).toBe('Alle WaterQuality-Objekte.');
  });
});

describe('initSetup', () => {
  beforeEach(() => {
    initSetup(personPackage);
  });

  it('Identität und Modus', () => {
    const s = setup.value!;
    expect(s.instanceName).toBe('person');
    expect(s.instanceDescription).toBe('Minimal example domain model.');
    expect(s.configMode).toBe(ConfigMode.FILE);
    expect(s.inputKind).toBe(InputKind.FILE);
    expect(s.modelPackage).toBe(personPackage);
  });

  it('der REST-Endpunkt', () => {
    const s = setup.value!;
    expect(s.serviceId).toBe('person-rest');
    expect(s.serviceName).toBe('person REST');
    expect(s.urlContext).toBe('/person');
    expect(s.serviceDescription).toBeTruthy();
  });

  it('beide Datenquellen sind vorbereitet', () => {
    const s = setup.value!;
    expect(s.fileSource!.id).toBe('person-file');
    expect(s.fileSource!.fileUri).toBe('data/person.xmi');
    expect(s.databaseSource!.id).toBe('person-jpa');
    expect(s.databaseSource!.dataSourceId).toBe('person-db');
    expect(s.databaseSource!.dataSourceFilter).toBe('(dataSourceName=personDs)');
  });

  it('ein Datensatz je konkreter Klasse, alle ausgewählt', () => {
    const s = setup.value!;
    expect(s.datasets.map((d) => d.id)).toEqual(['person', 'waterQuality']);
    expect(selectedDatasets.value).toHaveLength(2);
  });

  it('exports bleibt leer — sonst fielen die Runtime-Vorgaben weg', () => {
    expect(setup.value!.exports).toEqual([]);
  });

  it('das Package steht als Datei-Referenz für den FILE-Modus drin', () => {
    const s = setup.value!;
    expect(s.modelFiles).toHaveLength(1);
    expect(s.modelFiles[0].modelPackage).toBe(personPackage);
    expect(s.modelFiles[0].fileName).toBe('model/person.ecore');
  });

  it('touch() zählt hoch, damit die Oberfläche neu liest', () => {
    const vorher = version.value;
    initSetup(personPackage);
    expect(version.value).toBeGreaterThan(vorher);
  });
});

describe('Datei-URI und Modus', () => {
  beforeEach(() => {
    initSetup(personPackage);
  });

  it('im Atlas-Modus absolut', () => {
    expect(defaultFileUri(personPackage, ConfigMode.ATLAS)).toBe(
      `${ATLAS_DATA_PREFIX}data/person.xmi`,
    );
    expect(defaultFileUri(personPackage, ConfigMode.FILE)).toBe('data/person.xmi');
  });

  it('der Moduswechsel zieht die Vorgabe mit', () => {
    setConfigMode(ConfigMode.ATLAS);
    expect(setup.value!.fileSource!.fileUri).toBe('/opt/dataatlas/runtime/data/data/person.xmi');
    setConfigMode(ConfigMode.FILE);
    expect(setup.value!.fileSource!.fileUri).toBe('data/person.xmi');
  });

  it('eine von Hand eingetragene URI bleibt stehen', () => {
    setup.value!.fileSource!.fileUri = 'irgendwo/anders.xmi';
    setConfigMode(ConfigMode.ATLAS);
    expect(setup.value!.fileSource!.fileUri).toBe('irgendwo/anders.xmi');
  });
});

describe('addModelFile', () => {
  beforeEach(() => {
    initSetup(personPackage);
  });

  it('nimmt ein weiteres Package auf, ohne Doppel', () => {
    const zweites = registerEcoreFromString(
      PERSON_ECORE.replace('name="person"', 'name="zweit"').replace(
        'person/1.0.0',
        'zweit/1.0.0',
      ),
      'model/zweit.ecore',
    );
    addModelFile(zweites);
    addModelFile(zweites);
    expect(setup.value!.modelFiles).toHaveLength(2);
    expect(setup.value!.modelFiles[1].fileName).toBe('model/zweit.ecore');
  });

  it('ein eigener Dateiname wird übernommen', () => {
    const drittes = registerEcoreFromString(
      PERSON_ECORE.replace('name="person"', 'name="dritt"').replace(
        'person/1.0.0',
        'dritt/1.0.0',
      ),
      'model/dritt.ecore',
    );
    addModelFile(drittes, 'schemas/dritt.ecore');
    expect(setup.value!.modelFiles[1].fileName).toBe('schemas/dritt.ecore');
  });
});
