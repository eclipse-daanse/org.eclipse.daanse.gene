/**
 * Zentraler, reaktiver Zustand des eorm-Assistenten — inklusive der
 * Ableitungsregeln, die aus einem EPackage sinnvolle Vorschläge machen.
 *
 * Die Regeln sind der Java-Pipeline nachgebaut
 * (emf.persistence-jpa/.../orm/processor/MappingProcessor + EntityProcessor,
 * BasicProcessor, OneToManyProcessor …), mit zwei bewussten Abweichungen:
 *  - `unique` ist standardmäßig FALSE. Der Java-Generator übernimmt
 *    `feature.isUnique()`, was bei EMF-Attributen fast immer true ist und zu
 *    fehlerhaften UNIQUE-Constraints führt (siehe citizen.eorm/glt.eorm, wo
 *    jede Spalte unique="true" trägt).
 *  - Eine einzelne Non-Containment-Referenz wird als MANY_TO_ONE mit
 *    Fremdschlüssel-Spalte vorgeschlagen (JPA-Norm) statt als OneToOne mit
 *    Zwischentabelle. In der UI jederzeit änderbar.
 */
import { computed, ref, shallowRef, triggerRef } from 'vue';
import type { EAttribute, EClass, EPackage, EReference } from '@emfts/core';
import type { AtlasModelSource } from '../atlas/atlasSource';
import type { AttributeConfig, EntityConfig, EormSetup, RelationConfig } from '../generated';
import {
  AttributeRole,
  EormwizardFactory,
  FetchMode,
  IdStrategy,
  InheritanceStrategy,
  JoinStrategy,
  RelationKind,
} from '../generated';

/** Aktive Atlas-Verbindung (zum Veröffentlichen der erzeugten .eorm). */
export const atlasSource = shallowRef<AtlasModelSource | undefined>(undefined);

export const modelPackages = shallowRef<EPackage[]>([]);
export const setup = shallowRef<EormSetup | undefined>(undefined);
export const version = ref(0);

export const ready = computed(() => !!setup.value);

/** Manuelles Re-Rendern anstoßen (EMF-Objekte sind nicht deep-reactive). */
export function touch(): void {
  version.value++;
  triggerRef(setup);
}

const ANNOTATION_XSD = 'http:///org/eclipse/emf/ecore/util/ExtendedMetaData';

/**
 * Spaltenname aus der XSD-Annotation, sonst der Feature-Name.
 * Nur für Features gedacht: Bei XSD-generierten Modellen trägt die Annotation
 * den DB-nahen Namen (Feature `firstName` → `first_name`, so auch im
 * Referenz-eorm). Für EClasses ist sie NICHT verwendbar — dort steht der
 * XML-Elementname, häufig im Plural (`Building` → `Buildings`).
 */
function featureColumnName(element: { getEAnnotation(source: string): unknown; getName(): string | null }): string {
  const ann = element.getEAnnotation(ANNOTATION_XSD) as
    | { getDetails?: () => { getByKey?: (k: string) => unknown } }
    | null;
  const value = ann?.getDetails?.()?.getByKey?.('name');
  return typeof value === 'string' && value ? value : (element.getName() ?? '');
}

function isNumericType(attr: EAttribute): boolean {
  const name = attr.getEAttributeType()?.getName() ?? '';
  return ['EInt', 'ELong', 'EShort', 'EIntegerObject', 'ELongObject', 'EBigInteger'].includes(name);
}

/** Persistierbare Attribute: keine abgeleiteten/transienten Felder. */
function persistableAttributes(eClass: EClass): EAttribute[] {
  return eClass.getEAllAttributes().filter(
    (a) => !a.isDerived?.() && !a.isTransient?.() && !a.isVolatile?.(),
  );
}

function persistableReferences(eClass: EClass): EReference[] {
  return eClass.getEAllReferences().filter((r) => !r.isDerived?.() && !r.isTransient?.());
}

/** Ein Attribut → Spalten-Vorschlag. */
function buildAttribute(attr: EAttribute, idAttribute: EAttribute | null): AttributeConfig {
  const f = EormwizardFactory.eINSTANCE;
  const a = f.createAttributeConfig();
  a.selected = true;
  a.feature = attr;
  a.columnName = featureColumnName(attr);
  a.nullable = !attr.isRequired?.();
  a.unique = false; // bewusst: siehe Kommentar am Dateikopf
  a.length = 0;

  if (idAttribute && attr === idAttribute) {
    a.role = AttributeRole.ID;
    a.nullable = false;
    a.unique = true;
    // Schlüsselwerte: Zahlen aus einer Sequenz, Zeichenketten als UUID
    a.idStrategy = isNumericType(attr) ? IdStrategy.SEQUENCE : IdStrategy.UUID;
  } else {
    a.role = AttributeRole.BASIC;
  }
  return a;
}

/** Eine Referenz → Beziehungs-Vorschlag. */
function buildRelation(ref: EReference, owner: EClass): RelationConfig {
  const f = EormwizardFactory.eINSTANCE;
  const r = f.createRelationConfig();
  r.selected = true;
  r.feature = ref;
  const many = ref.isMany();
  const containment = ref.isContainment();

  if (containment) {
    r.kind = many ? RelationKind.ONE_TO_MANY : RelationKind.ONE_TO_ONE;
    r.joinStrategy = JoinStrategy.JOIN_COLUMN;
    r.fetch = FetchMode.EAGER;
    r.cascadeAll = true;
    r.orphanRemoval = true;
  } else {
    r.kind = many ? RelationKind.MANY_TO_MANY : RelationKind.MANY_TO_ONE;
    r.joinStrategy = many ? JoinStrategy.JOIN_TABLE : JoinStrategy.JOIN_COLUMN;
    r.fetch = FetchMode.LAZY;
    r.cascadeAll = false;
    r.orphanRemoval = false;
  }

  // Bidirektional: Die Sammlungs-Seite überlässt der Einzel-Seite den
  // Fremdschlüssel (JPA-Standard für 1:n).
  const opposite = ref.getEOpposite?.();
  if (opposite && many && !opposite.isMany()) {
    r.mappedBy = opposite.getName() ?? '';
  }
  r.joinName = many ? '' : `${ref.getName() ?? 'ref'}_id`;
  void owner;
  return r;
}

/** Eine EClass → Entity-Vorschlag mit Spalten und Beziehungen. */
export function buildEntity(eClass: EClass): EntityConfig {
  const f = EormwizardFactory.eINSTANCE;
  const entity = f.createEntityConfig();
  entity.selected = true;
  entity.targetClass = eClass;
  entity.entityName = eClass.getName() ?? '';
  entity.tableName = (eClass.getName() || 'TABLE').toUpperCase();

  // Vererbung nur an der Wurzel einer Hierarchie vorschlagen
  const hasSubtypes = (eClass.getEPackage()?.getEClassifiers() ?? []).some((c) => {
    const sub = c as EClass;
    return typeof sub.getEAllSuperTypes === 'function' && sub !== eClass
      ? sub.getEAllSuperTypes().includes(eClass)
      : false;
  });
  if (hasSubtypes && eClass.getEAllSuperTypes().length === 0) {
    entity.inheritance = InheritanceStrategy.SINGLE_TABLE;
    entity.discriminatorColumn = 'DTYPE';
  } else {
    entity.inheritance = InheritanceStrategy.NONE;
  }

  const idAttribute = eClass.getEIDAttribute?.() ?? null;
  for (const attr of persistableAttributes(eClass)) {
    entity.attributes.push(buildAttribute(attr, idAttribute));
  }
  for (const ref of persistableReferences(eClass)) {
    entity.relations.push(buildRelation(ref, eClass));
  }
  return entity;
}

/**
 * Initialisiert das Fassadenmodell für ein EPackage: alle konkreten EClasses
 * werden als Entity-Vorschlag angelegt.
 */
export function initSetup(pkg: EPackage): EormSetup {
  const f = EormwizardFactory.eINSTANCE;
  const s = f.createEormSetup();
  s.modelPackage = pkg;
  s.mappingName = pkg.getName() ?? 'mapping';
  s.schema = (pkg.getName() ?? 'mapping').toUpperCase();
  s.delimitedIdentifiers = false;

  for (const classifier of pkg.getEClassifiers()) {
    const eClass = classifier as EClass;
    if (typeof eClass.isAbstract !== 'function') continue; // EDataType/EEnum
    if (eClass.isAbstract() || eClass.isInterface?.()) continue;
    s.entities.push(buildEntity(eClass));
  }

  setup.value = s;
  touch();
  return s;
}
