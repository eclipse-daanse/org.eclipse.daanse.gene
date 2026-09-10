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
  addChain,
  buildChain,
  buildDatabaseSource,
  buildDataset,
  buildFileSource,
  concreteClasses,
  datasetsWithChain,
  defaultFileUri,
  documentationOf,
  effectiveSource,
  initSetup,
  lowerCamel,
  ownSource,
  ownedSources,
  removeChain,
  selectedDatasets,
  setup,
  shareSource,
  slugOf,
  titleCase,
  version,
} from '../src/wizard/context';
import { InputKind, MappingKind } from '../src/generated';

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
    expect(dataset.targetClass).toBe(personPackage.getEClassifier('Person'));
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
    expect(s.modelPackage).toBe(personPackage);
  });

  it('der REST-Endpunkt', () => {
    const s = setup.value!;
    expect(s.serviceId).toBe('person-rest');
    expect(s.serviceName).toBe('person REST');
    expect(s.urlContext).toBe('/person');
    expect(s.serviceDescription).toBeTruthy();
  });

  it('ein Datenweg als Vorschlag, mit eigener Datei-Quelle', () => {
    const s = setup.value!;
    expect(s.chains).toHaveLength(1);
    const chain = s.chains[0];
    expect(chain.id).toBe('person');
    expect(chain.source?.id).toBe('person-file');
    expect(chain.source?.kind).toBe(InputKind.FILE);
    expect(chain.source?.fileUri).toBe(`${ATLAS_DATA_PREFIX}data/person.xmi`);
    expect(effectiveSource(chain)).toBe(chain.source);
  });

  it('eine Datenbank-Quelle bringt die JdbcDataSource-Angaben mit', () => {
    const quelle = buildDatabaseSource('person', 'person');
    expect(quelle.kind).toBe(InputKind.DATABASE);
    expect(quelle.id).toBe('person-jpa');
    expect(quelle.dataSourceId).toBe('person-db');
    expect(quelle.dataSourceFilter).toBe('(dataSourceName=personDs)');
    expect(quelle.mappingKind).toBe(MappingKind.DERIVED);
  });

  it('addChain nummeriert doppelte ids durch', () => {
    addChain(buildChain('person', buildFileSource('person', '/x.xmi')));
    expect(setup.value!.chains.map((c) => c.id)).toEqual(['person', 'person-2']);
  });

  it('ein Weg kann die Quelle eines anderen mitbenutzen', () => {
    const s = setup.value!;
    const zweiter = addChain(buildChain('zweit', buildFileSource('zweit', '/y.xmi')))!;
    const fremde = s.chains[0].source!;
    shareSource(zweiter, fremde);
    expect(zweiter.source).toBeFalsy();
    expect(zweiter.sharedSource).toBe(fremde);
    expect(effectiveSource(zweiter)).toBe(fremde);
    // Nur eigene Quellen kommen als geteilte in Frage
    expect(ownedSources(s).map((q) => q.id)).toEqual(['person-file']);

    // und wieder zurück auf eine eigene
    ownSource(zweiter, buildFileSource('zweit', '/y.xmi'));
    expect(zweiter.sharedSource).toBeFalsy();
    expect(zweiter.source?.fileUri).toBe('/y.xmi');
  });

  it('removeChain lässt die Erben die Quelle übernehmen', () => {
    const s = setup.value!;
    const erster = s.chains[0];
    const quelle = erster.source!;
    const zweiter = addChain(buildChain('zweit', buildFileSource('zweit', '/y.xmi')))!;
    const dritter = addChain(buildChain('dritt', buildFileSource('dritt', '/z.xmi')))!;
    shareSource(zweiter, quelle);
    shareSource(dritter, quelle);

    removeChain(erster);
    expect(s.chains.map((c) => c.id)).toEqual(['zweit', 'dritt']);
    // Der erste Erbe hält sie jetzt, der zweite teilt sich seine
    expect(zweiter.source).toBe(quelle);
    expect(zweiter.sharedSource).toBeFalsy();
    expect(dritter.sharedSource).toBe(quelle);
    expect(effectiveSource(dritter)).toBe(quelle);
  });

  it('datasetsWithChain nennt zu jedem Datensatz seinen Weg', () => {
    const s = setup.value!;
    const paare = datasetsWithChain(s);
    expect(paare).toHaveLength(2);
    expect(paare.every((p) => p.chain === s.chains[0])).toBe(true);
    expect(paare.map((p) => p.dataset.id)).toEqual(['person', 'waterQuality']);
  });

  it('ein Datensatz je konkreter Klasse, alle ausgewählt', () => {
    const s = setup.value!;
    expect(s.chains[0].datasets.map((d) => d.id)).toEqual(['person', 'waterQuality']);
    expect(selectedDatasets.value).toHaveLength(2);
  });

  it('exports bleibt leer — sonst fielen die Runtime-Vorgaben weg', () => {
    expect(setup.value!.chains[0].exports).toEqual([]);
  });

  it('touch() zählt hoch, damit die Oberfläche neu liest', () => {
    const vorher = version.value;
    initSetup(personPackage);
    expect(version.value).toBeGreaterThan(vorher);
  });
});

describe('Datei-URI', () => {
  it('ist immer absolut — die Konfiguration kommt über HTTP', () => {
    expect(defaultFileUri(personPackage)).toBe(`${ATLAS_DATA_PREFIX}data/person.xmi`);
    expect(defaultFileUri(personPackage).startsWith('/')).toBe(true);
  });
});
