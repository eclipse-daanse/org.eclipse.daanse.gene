/**
 * Eingebettetes JPA-Mapping (Umsetzungsschritt 7).
 *
 * Bei `MappingKind.IMPORTED` reist ein fertiges eorm-Dokument in der
 * Konfiguration mit — als Containment, nicht als Href auf eine Datei: ein
 * Verweis auf einen deployment-lokalen Pfad lässt sich vom Model Atlas beim
 * Deserialisieren nicht auflösen, und der Upload scheitert mit
 * „EClass.getEPackage() is null" (Kommentar in
 * `example/dataatlas-history-atlas.xmi`).
 *
 * Der Witz am EMF-Weg: das Dokument wird geladen und angehängt, den Rest macht
 * der Serializer — Namespaces, `xsi:type`-Präfixe und die Hrefs im Inneren,
 * die dem Modus folgen müssen. Textchirurgie am fremden Dokument entfällt.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { URI, type EObject, type EPackage } from '@emfts/core';
import { newResourceSet, registerEcoreFromString, setupPackages } from '../src/emf/setup';
import { buildDataAtlasXmi } from '../src/transform/toDataAtlasConfig';
import { findErrors } from '../src/transform/validate';
import { initSetup, setup as setupRef } from '../src/wizard/context';
import { ConfigMode, InputKind, MappingKind, type AtlasSetup } from '../src/generated';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const PERSON_NS = 'https://eclipse.org/fennec/data/atlas/example/person/1.0.0';

/**
 * Ein Mapping, wie es der eorm-Wizard liefert: nsURI-Hrefs, ein Entity mit
 * Tabelle, einem id- und einem basic-Attribut. Aufgebaut nach dem Muster in
 * `example/dataatlas-history-atlas.xmi`.
 */
const EORM = `<?xml version="1.0" encoding="UTF-8"?>
<eorm:EntityMappings xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    xmlns:eorm="https://eclipse.org/fennec/persistence/eorm/1.0.0"
    package="${PERSON_NS}" name="person">
  <entity access="FIELD" name="Person">
    <accessibleObject xsi:type="eorm:EClassObject" name="person.Person">
      <eclass href="${PERSON_NS}#//Person"/>
    </accessibleObject>
    <table name="person" schema="public"/>
    <attributes>
      <id access="FIELD" name="id">
        <accessibleObject xsi:type="eorm:EFeatureObject" name="id">
          <feature xsi:type="ecore:EAttribute" href="${PERSON_NS}#//Person/id"/>
        </accessibleObject>
        <column name="id" nullable="false"/>
      </id>
      <basic access="FIELD" name="firstName" fetch="EAGER" optional="true">
        <accessibleObject xsi:type="eorm:EFeatureObject" name="firstName">
          <feature xsi:type="ecore:EAttribute" href="${PERSON_NS}#//Person/firstName"/>
        </accessibleObject>
        <column name="first_name" nullable="true"/>
      </basic>
    </attributes>
    <class xsi:type="ecore:EClass" href="${PERSON_NS}#//Person"/>
  </entity>
</eorm:EntityMappings>`;

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
  s.datasets = [s.datasets[0]];
  s.datasets[0].id = 'persons';
  s.datasets[0].name = 'Persons';
  s.datasets[0].description = 'All persons.';
  s.datasets[0].path = 'persons';
  s.inputKind = InputKind.DATABASE;
  s.databaseSource!.mappingKind = MappingKind.IMPORTED;
  s.databaseSource!.eormXmi = EORM;
});

describe('Prüfung', () => {
  it('ein gültiges EntityMappings wird angenommen', () => {
    expect(findErrors(s)).toEqual([]);
  });
});

describe('Atlas-Modus', () => {
  beforeEach(() => {
    s.configMode = ConfigMode.ATLAS;
    s.fileSource!.fileUri = '/opt/dataatlas/runtime/data/data/person.xmi';
  });

  it('das Mapping hängt als Containment im JPADataInput', () => {
    const { xmi } = buildDataAtlasXmi(s);
    expect(xmi).toContain('<persistenceConfig');
    // Die Sachattribute des EntityMappings reisen mit
    expect(xmi).toMatch(/<persistenceConfig[^>]*name="person"/);
    expect(xmi).toMatch(new RegExp(`<persistenceConfig[^>]*package="${PERSON_NS}"`));
    // und der Inhalt
    expect(xmi).toContain('<entity');
    expect(xmi).toContain('<table name="person" schema="public"/>');
    expect(xmi).toContain('name="first_name"');
  });

  it('Namespaces und xsi:type-Präfixe stehen im Kopf', () => {
    const { xmi } = buildDataAtlasXmi(s);
    // eorm deklariert der Serializer selbst (es gibt eorm-typisierte Elemente)
    expect(xmi).toContain('xmlns:eorm="https://eclipse.org/fennec/persistence/eorm/1.0.0"');
    // ecore muss der Wizard nachtragen: das Präfix kommt nur in
    // Attributwerten vor, und die zählt emf.ts nicht mit (#87)
    expect(xmi).toContain('xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"');
    expect(xmi).toContain('xsi:type="eorm:EClassObject"');
    expect(xmi).toContain('xsi:type="eorm:EFeatureObject"');
    // Der Ecore-Typ steht im Attributwert des Verweises, nicht als xsi:type
    expect(xmi).toMatch(/feature="ecore:EAttribute /);
    // kein zweiter Dokumentkopf des fremden Dokuments
    expect(xmi.match(/<\?xml/g)).toHaveLength(1);
    expect(xmi).not.toContain('EntityMappings');
  });

  it('die Verweise im Inneren bleiben nsURIs', () => {
    /*
     * Geschrieben werden sie als typpraefixierte Attribute, nicht als
     * href-Kindelemente wie in der Vorlage — einwertige
     * Cross-Document-Referenzen behandelt emf.ts so (#85). Der Wert selbst
     * stimmt, und der Round-Trip loest ihn auf.
     */
    const { xmi } = buildDataAtlasXmi(s);
    expect(xmi).toContain(`eclass="${PERSON_NS}#//Person"`);
    expect(xmi).toContain(`feature="ecore:EAttribute ${PERSON_NS}#//Person/id"`);
    expect(xmi).toContain(`class="ecore:EClass ${PERSON_NS}#//Person"`);
  });
});

describe('Datei-Modus', () => {
  it('die Verweise im Inneren gehen mit dem Modus mit', () => {
    /*
     * Der eorm-Wizard schreibt nsURI-Hrefs. Im Datei-Modus muessen sie zu
     * `model/person.ecore#//…` werden — auch die auf Features, wie
     * `example/dataatlas-history.xmi` es zeigt
     * (`<feature href="model/sensinact-history.ecore#//GeoData/latitude"/>`).
     */
    const { xmi } = buildDataAtlasXmi(s);
    expect(xmi).toContain('eclass="model/person.ecore#//Person"');
    expect(xmi).toContain('feature="ecore:EAttribute model/person.ecore#//Person/id"');
    expect(xmi).toContain('feature="ecore:EAttribute model/person.ecore#//Person/firstName"');
    expect(xmi).not.toContain(PERSON_NS + '#//');
  });

  it('das package-Attribut bleibt der nsURI — es ist kein Verweis', () => {
    const { xmi } = buildDataAtlasXmi(s);
    expect(xmi).toMatch(new RegExp(`<persistenceConfig[^>]*package="${PERSON_NS}"`));
  });
});

describe('Round-Trip', () => {
  it('das eingebettete Mapping lässt sich wieder lesen', () => {
    s.configMode = ConfigMode.ATLAS;
    s.fileSource!.fileUri = '/opt/dataatlas/runtime/data/data/person.xmi';
    const { xmi } = buildDataAtlasXmi(s);

    const resource = newResourceSet().createResource(URI.createURI('zurueck.xmi'));
    (resource as unknown as { loadFromString(x: string): void }).loadFromString(xmi);
    const root = resource.getContents().get(0);
    const inputs = [
      ...(root.eGet(root.eClass().getEStructuralFeature('dataInputs')!) as Iterable<EObject>),
    ];
    expect(inputs).toHaveLength(1);
    const input = inputs[0];
    expect(input.eClass().getName()).toBe('JPADataInput');

    const mapping = input.eGet(
      input.eClass().getEStructuralFeature('persistenceConfig')!,
    ) as EObject | null;
    expect(mapping).toBeTruthy();
    expect(mapping!.eClass().getName()).toBe('EntityMappings');

    // und die Verweise darin zeigen wieder auf das Domänenmodell
    const entities = [
      ...(mapping!.eGet(mapping!.eClass().getEStructuralFeature('entity')!) as Iterable<EObject>),
    ];
    const eClassRef = entities[0].eGet(
      entities[0].eClass().getEStructuralFeature('class')!,
    ) as unknown as { getName(): string };
    expect(eClassRef.getName()).toBe('Person');
  });
});
