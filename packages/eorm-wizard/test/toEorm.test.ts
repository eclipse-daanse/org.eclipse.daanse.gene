/**
 * Transformer-Tests gegen das echte Referenzformat aus emf.persistence-jpa
 * (test/fixtures/glt.ecore + glt.eorm — die einzige Fixture im aktuellen
 * eorm-Format; citizen.eorm dort ist Legacy ohne accessibleObject-Wrapper).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  BasicResourceSet,
  EPackageRegistry,
  registerEcorePackage,
  URI,
  XMIResourceFactory,
} from '@emfts/core';
import type { EClass, EObject, EPackage, XMIResource } from '@emfts/core';
import { buildEormXmi, EORM_NS_URI } from '../src/transform/toEorm';
import { buildEntity, initSetup, setup as setupRef } from '../src/wizard/context';
import { fixupWizardPackage } from '../src/emf/wizardPackageFixup';
import {
  AttributeRole,
  EormwizardFactory,
  EormwizardPackage,
  IdStrategy,
  JoinStrategy,
  RelationKind,
} from '../src/generated';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');
const ASSETS = path.join(__dirname, '..', 'src', 'assets');

let rs: BasicResourceSet;
let gltPkg: EPackage;
let eormPkg: EPackage;

function loadXmi(uri: string, content: string): XMIResource {
  const resource = rs.createResource(URI.createURI(uri)) as XMIResource;
  resource.loadFromString(content);
  expect(resource.getContents().isEmpty(), `${uri} ist leer`).toBe(false);
  return resource;
}

beforeAll(() => {
  registerEcorePackage();
  const wiz = EormwizardPackage.eINSTANCE;
  wiz.setEFactoryInstance(EormwizardFactory.eINSTANCE);
  fixupWizardPackage();
  EPackageRegistry.INSTANCE.set(wiz.getNsURI()!, wiz);

  rs = new BasicResourceSet();
  const f = new XMIResourceFactory();
  for (const ext of ['xmi', 'ecore', 'eorm']) {
    rs.getResourceFactoryRegistry().getExtensionToFactoryMap().set(ext, f);
  }

  gltPkg = loadXmi('glt.ecore', readFileSync(path.join(FIXTURES, 'glt.ecore'), 'utf-8'))
    .getContents()
    .get(0) as unknown as EPackage;
  EPackageRegistry.INSTANCE.set(gltPkg.getNsURI()!, gltPkg);

  eormPkg = loadXmi('eorm.ecore', readFileSync(path.join(ASSETS, 'eorm.ecore'), 'utf-8'))
    .getContents()
    .get(0) as unknown as EPackage;
  EPackageRegistry.INSTANCE.set(eormPkg.getNsURI()!, eormPkg);
});

describe('Ableitungsregeln (initSetup)', () => {
  it('legt für jede konkrete Klasse ein Entity mit Spalten an', () => {
    const s = initSetup(gltPkg);
    expect(s.mappingName).toBe('glt');
    expect(s.schema).toBe('GLT');
    const names = s.entities.map((e) => e.targetClass.getName());
    expect(names).toContain('Building');
    expect(names).toContain('Contact');

    const building = s.entities.find((e) => e.targetClass.getName() === 'Building')!;
    expect(building.tableName).toBe('BUILDING');
    expect(building.attributes.length).toBeGreaterThan(0);
    // Spaltennamen aus dem Modell übernommen
    expect(building.attributes.map((a) => a.columnName)).toContain('city');
  });

  it('erkennt den Schlüssel aus dem iD-Attribut und wählt eine Strategie', () => {
    const building = initSetup(gltPkg).entities.find((e) => e.targetClass.getName() === 'Building')!;
    const id = building.attributes.find((a) => a.role === AttributeRole.ID);
    expect(id, 'Building hat ein iD-Attribut → Schlüssel erkannt').toBeTruthy();
    expect(id!.nullable).toBe(false);
    expect(id!.unique).toBe(true);
    // numerisch → Sequenz, Text → UUID
    expect([IdStrategy.SEQUENCE, IdStrategy.UUID]).toContain(id!.idStrategy);
  });

  it('setzt unique bei normalen Spalten NICHT (Korrektur des Generator-Verhaltens)', () => {
    const building = initSetup(gltPkg).entities.find((e) => e.targetClass.getName() === 'Building')!;
    const basics = building.attributes.filter((a) => a.role === AttributeRole.BASIC);
    expect(basics.length).toBeGreaterThan(0);
    expect(basics.every((a) => a.unique === false)).toBe(true);
  });

  it('leitet Beziehungsart und Join-Strategie aus dem Modell ab', () => {
    const building = initSetup(gltPkg).entities.find((e) => e.targetClass.getName() === 'Building')!;
    const contacts = building.relations.find((r) => r.feature.getName() === 'contacts');
    expect(contacts, 'Referenz contacts gefunden').toBeTruthy();
    // containment + many → 1:n mit Fremdschlüssel in der Kind-Tabelle,
    // Kinder hängen am Elternobjekt (cascade + orphanRemoval)
    expect(contacts!.kind).toBe(RelationKind.ONE_TO_MANY);
    expect(contacts!.joinStrategy).toBe(JoinStrategy.JOIN_COLUMN);
    expect(contacts!.cascadeAll).toBe(true);
    expect(contacts!.orphanRemoval).toBe(true);
  });
});

describe('buildEormXmi', () => {
  it('erzeugt das Referenzformat (accessibleObject-Wrapper, nsURI-hrefs)', () => {
    const s = initSetup(gltPkg);
    const xmi = buildEormXmi(s).eormXmi;

    expect(xmi).toContain(`xmlns:eorm="${EORM_NS_URI}"`);
    expect(xmi).toContain('name="glt"');
    expect(xmi).toContain('package="https://civitas.org/glt/1.0.0"');
    expect(xmi).toContain('schema="GLT"');
    // Entity mit Klassen-Verankerung wie in glt.eorm
    expect(xmi).toContain('<entity access="FIELD" name="Building">');
    expect(xmi).toContain('<accessibleObject xsi:type="eorm:EClassObject" name="Building">');
    expect(xmi).toContain('<eclass href="https://civitas.org/glt/1.0.0#//Building"/>');
    expect(xmi).toContain('<table name="BUILDING"/>');
    // Attribut mit Feature-Verankerung + Spalte
    expect(xmi).toContain('<accessibleObject xsi:type="eorm:EFeatureObject" name="city">');
    expect(xmi).toContain(
      '<feature xsi:type="ecore:EAttribute" href="https://civitas.org/glt/1.0.0#//Building/city"/>',
    );
    expect(xmi).toMatch(/<column insertable="true" name="city" nullable="true" updatable="true"\/>/);
    // Querverweis am Ende des Entity
    expect(xmi).toContain('<class xsi:type="ecore:EClass" href="https://civitas.org/glt/1.0.0#//Building"/>');
  });

  it('lädt per Round-Trip gegen das echte eorm-Metamodell zurück', () => {
    const s = initSetup(gltPkg);
    const result = buildEormXmi(s);
    const root = loadXmi('roundtrip.eorm', result.eormXmi).getContents().get(0) as unknown as EObject;

    expect(root.eClass().getName()).toBe('EntityMappings');
    const eget = (o: EObject, n: string) => {
      const f = o.eClass().getEStructuralFeature(n);
      return f ? o.eGet(f) : undefined;
    };
    expect(eget(root, 'name')).toBe('glt');
    expect(eget(root, 'package')).toBe('https://civitas.org/glt/1.0.0');

    const entities = Array.from(eget(root, 'entity') as Iterable<EObject>);
    expect(entities.length).toBe(s.entities.length);
    const building = entities.find((e) => eget(e, 'name') === 'Building')!;
    // Verankerung löst gegen das geladene glt.ecore auf
    const accessor = eget(building, 'accessibleObject') as EObject;
    const eclass = eget(accessor, 'eclass') as unknown as EClass;
    expect(eclass.getName()).toBe('Building');
    // Attribute vorhanden und mit aufgelösten Features
    const attributes = eget(building, 'attributes') as EObject;
    const basics = Array.from(eget(attributes, 'basic') as Iterable<EObject>);
    expect(basics.length).toBeGreaterThan(0);
    const firstAccessor = eget(basics[0], 'accessibleObject') as EObject;
    expect((eget(firstAccessor, 'feature') as unknown as { getName(): string }).getName()).toBeTruthy();
  });

  it('warnt bei SQL-Schlüsselwörtern und fehlendem Schlüssel', () => {
    const s = initSetup(gltPkg);
    const entity = s.entities[0];
    entity.tableName = 'ORDER';
    const idAttr = entity.attributes.find((a) => a.role === AttributeRole.ID);
    if (idAttr) idAttr.role = AttributeRole.BASIC; // Schlüssel entfernen
    const result = buildEormXmi(s);
    expect(result.warnings.some((w) => w.includes('ORDER'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('keinen Schlüssel'))).toBe(true);
  });

  it('setzt Bezeichner-Quoting global, wenn gewünscht', () => {
    const s = initSetup(gltPkg);
    s.delimitedIdentifiers = true;
    const xmi = buildEormXmi(s).eormXmi;
    expect(xmi).toContain('<delimitedIdentifiers/>');
    expect(xmi).toContain('<persistenceUnitDefaults>');
  });

  it('erzeugt Zwischentabelle bzw. Fremdschlüssel je Join-Strategie', () => {
    const s = initSetup(gltPkg);
    const building = s.entities.find((e) => e.targetClass.getName() === 'Building')!;
    const rel = building.relations.find((r) => r.feature.getName() === 'contacts')!;
    rel.joinStrategy = JoinStrategy.JOIN_TABLE;
    rel.mappedBy = '';
    const withTable = buildEormXmi(s).eormXmi;
    expect(withTable).toMatch(/<joinTable name="BUILDING__CONTACT">/);

    rel.joinStrategy = JoinStrategy.JOIN_COLUMN;
    rel.joinName = 'building_id';
    const withColumn = buildEormXmi(s).eormXmi;
    expect(withColumn).toContain('<joinColumn name="building_id"/>');
  });

  it('verlangt ein Modell und mindestens eine Klasse', () => {
    const s = initSetup(gltPkg);
    for (const e of s.entities) e.selected = false;
    expect(() => buildEormXmi(s)).toThrow(/keine Klasse/);
  });
});
