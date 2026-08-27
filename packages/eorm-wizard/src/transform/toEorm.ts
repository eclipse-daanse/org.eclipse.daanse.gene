/**
 * Transformer: Fassadenmodell (EormSetup) → eorm-XMI
 * (Metamodell eorm.ecore, nsURI https://eclipse.org/fennec/persistence/eorm/1.0.0
 * aus emf.persistence-jpa/org.eclipse.fennec.persistence.orm).
 *
 * Das XMI wird direkt erzeugt (kein generischer Serializer), weil die hrefs
 * nsURI-basiert sein müssen (`<eclass href="<nsURI>#//Klasse"/>`) und die
 * Feature-Verweise ein `xsi:type` tragen müssen — genau wie beim
 * SensiNact-Mapping. Referenzformat: emf.persistence-jpa/.../test/data/glt/glt.eorm.
 *
 * Konformanz wird über Golden-/Round-Trip-Tests abgesichert (test/toEorm.test.ts).
 */
import type { EClass, EPackage, EReference, EStructuralFeature } from '@emfts/core';
import type { AttributeConfig, EntityConfig, EormSetup, RelationConfig } from '../generated';
import {
  AttributeRole,
  FetchMode,
  IdStrategy,
  InheritanceStrategy,
  JoinStrategy,
  RelationKind,
} from '../generated';

export const EORM_NS_URI = 'https://eclipse.org/fennec/persistence/eorm/1.0.0';
const ECORE_NS_URI = 'http://www.eclipse.org/emf/2002/Ecore';

export interface EormResult {
  /** Das EntityMappings-XMI (Endprodukt). */
  eormXmi: string;
  eormFileName: string;
  /** Hinweise für die Zusammenfassung (nicht blockierend). */
  warnings: string[];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isReference(f: EStructuralFeature): f is EReference {
  return typeof (f as EReference).isContainment === 'function';
}

/** nsURI-basierter href auf ein Feature — zeigt auf die DEKLARIERENDE Klasse. */
function featureHref(f: EStructuralFeature): string {
  const owner = f.getEContainingClass();
  const pkg = owner?.getEPackage();
  if (!owner || !pkg?.getNsURI()) {
    throw new Error(`Feature ${f.getName()} hat keine auflösbare deklarierende Klasse`);
  }
  return `${pkg.getNsURI()}#//${owner.getName()}/${f.getName()}`;
}

function eClassHref(eClass: EClass): string {
  const pkg = eClass.getEPackage();
  if (!pkg?.getNsURI()) throw new Error(`Klasse ${eClass.getName()} hat kein Package mit nsURI`);
  return `${pkg.getNsURI()}#//${eClass.getName()}`;
}

/** `<accessibleObject xsi:type="eorm:EFeatureObject">` — Verankerung im Ecore. */
function featureAccessor(f: EStructuralFeature, indent: string): string[] {
  const xsiType = isReference(f) ? 'ecore:EReference' : 'ecore:EAttribute';
  return [
    `${indent}<accessibleObject xsi:type="eorm:EFeatureObject" name="${escapeXml(f.getName() ?? '')}">`,
    `${indent}  <feature xsi:type="${xsiType}" href="${escapeXml(featureHref(f))}"/>`,
    `${indent}</accessibleObject>`,
  ];
}

/** `<column .../>` mit den Angaben aus der Attribut-Konfiguration. */
function columnElement(a: AttributeConfig, indent: string): string {
  const name = a.columnName || a.feature.getName() || 'value';
  const parts = [
    `insertable="true"`,
    `name="${escapeXml(name)}"`,
    `nullable="${a.nullable ? 'true' : 'false'}"`,
    `updatable="true"`,
  ];
  if (a.unique) parts.push('unique="true"');
  if (a.length && a.length > 0) parts.push(`length="${a.length}"`);
  return `${indent}<column ${parts.join(' ')}/>`;
}

const RELATION_TAG: Record<RelationKind, string> = {
  [RelationKind.ONE_TO_ONE]: 'oneToOne',
  [RelationKind.ONE_TO_MANY]: 'oneToMany',
  [RelationKind.MANY_TO_ONE]: 'manyToOne',
  [RelationKind.MANY_TO_MANY]: 'manyToMany',
};

/** Beziehungs-Element (oneToMany/manyToOne/…) inklusive Join-Strategie. */
function relationElement(r: RelationConfig, entity: EntityConfig, indent: string): string[] {
  const tag = RELATION_TAG[r.kind as RelationKind] ?? 'oneToMany';
  const name = r.feature.getName() ?? 'ref';
  const attrs = [`access="FIELD"`, `name="${escapeXml(name)}"`];
  if (r.fetch) attrs.push(`fetch="${r.fetch === FetchMode.EAGER ? 'EAGER' : 'LAZY'}"`);
  // mappedBy nur auf der Nicht-Besitzer-Seite (JPA erlaubt es nicht bei manyToOne)
  const supportsMappedBy = r.kind !== RelationKind.MANY_TO_ONE;
  if (supportsMappedBy && r.mappedBy) attrs.push(`mappedBy="${escapeXml(r.mappedBy)}"`);
  if (r.kind !== RelationKind.MANY_TO_ONE) {
    attrs.push(`orphanRemoval="${r.orphanRemoval ? 'true' : 'false'}"`);
  }
  if (r.batch) attrs.push(`batch="true"`);

  const lines = [`${indent}<${tag} ${attrs.join(' ')}>`];
  lines.push(...featureAccessor(r.feature, `${indent}  `));
  if (r.cascadeAll) {
    lines.push(`${indent}  <cascade>`, `${indent}    <cascadeAll/>`, `${indent}  </cascade>`);
  }
  // Die Besitzer-Seite trägt die Join-Information; bei mappedBy entfällt sie.
  if (!r.mappedBy) {
    const target = (r.feature as EReference).getEReferenceType();
    const joinName =
      r.joinName ||
      (r.joinStrategy === JoinStrategy.JOIN_TABLE
        ? `${(entity.tableName || entity.targetClass.getName() || '').toUpperCase()}__${(target?.getName() ?? '').toUpperCase()}`
        : `${name}_id`);
    if (r.joinStrategy === JoinStrategy.JOIN_TABLE) {
      lines.push(`${indent}  <joinTable name="${escapeXml(joinName)}">`);
      lines.push(`${indent}    <joinColumn name="${escapeXml(name)}_source"/>`);
      lines.push(`${indent}    <inverseJoinColumn name="${escapeXml(name)}_target"/>`);
      lines.push(`${indent}  </joinTable>`);
    } else {
      lines.push(`${indent}  <joinColumn name="${escapeXml(joinName)}"/>`);
    }
  }
  lines.push(`${indent}</${tag}>`);
  return lines;
}

/** SQL-Schlüsselwörter, die als Spalten-/Tabellenname Probleme machen (Issue #8). */
const RESERVED_SQL = new Set([
  'order', 'user', 'group', 'key', 'year', 'month', 'day', 'date', 'time', 'timestamp',
  'value', 'values', 'table', 'column', 'select', 'from', 'where', 'index', 'check',
  'primary', 'foreign', 'default', 'null', 'level', 'size', 'start', 'end', 'position',
]);

export function buildEormXmi(setup: EormSetup): EormResult {
  const warnings: string[] = [];
  const pkg = setup.modelPackage as EPackage | undefined;
  if (!pkg?.getNsURI()) throw new Error('Es wurde kein EMF-Modell (EPackage) gewählt');

  const mappingName = setup.mappingName?.trim() || pkg.getName() || 'mapping';
  const schema = setup.schema?.trim() || mappingName.toUpperCase();
  const eormFileName = `${mappingName}.eorm`;

  const entities = setup.entities.filter((e) => e.selected);
  if (entities.length === 0) throw new Error('Es wurde keine Klasse zum Speichern ausgewählt');

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<eorm:EntityMappings');
  lines.push('    xmi:version="2.0"');
  lines.push('    xmlns:xmi="http://www.omg.org/XMI"');
  lines.push('    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
  lines.push(`    xmlns:ecore="${ECORE_NS_URI}"`);
  lines.push(`    xmlns:eorm="${EORM_NS_URI}"`);
  lines.push(`    name="${escapeXml(mappingName)}"`);
  lines.push(`    package="${escapeXml(pkg.getNsURI()!)}"`);
  lines.push(`    schema="${escapeXml(schema)}">`);

  // Bezeichner-Quoting global (persistenceUnitDefaults/delimitedIdentifiers)
  if (setup.delimitedIdentifiers) {
    lines.push('  <persistenceUnitMetadata>');
    lines.push('    <persistenceUnitDefaults>');
    lines.push('      <delimitedIdentifiers/>');
    lines.push('    </persistenceUnitDefaults>');
    lines.push('  </persistenceUnitMetadata>');
  }

  for (const entity of entities) {
    const eClass = entity.targetClass as EClass;
    const entityName = entity.entityName || eClass.getName() || 'Entity';
    const tableName = entity.tableName || (eClass.getName() ?? 'TABLE').toUpperCase();
    if (RESERVED_SQL.has(tableName.toLowerCase())) {
      warnings.push(
        `Tabelle „${tableName}" ist ein SQL-Schlüsselwort — aktivieren Sie „Bezeichner in Anführungszeichen" oder wählen Sie einen anderen Namen.`,
      );
    }

    lines.push(`  <entity access="FIELD" name="${escapeXml(entityName)}">`);
    // Verankerung der Klasse (Fennec-Erweiterung EClassObject)
    lines.push(
      `    <accessibleObject xsi:type="eorm:EClassObject" name="${escapeXml(eClass.getName() ?? '')}">`,
    );
    lines.push(`      <eclass href="${escapeXml(eClassHref(eClass))}"/>`);
    lines.push('    </accessibleObject>');
    lines.push(`    <table name="${escapeXml(tableName)}"/>`);

    // Vererbung (nur an der Wurzel)
    if (entity.inheritance && entity.inheritance !== InheritanceStrategy.NONE) {
      lines.push(`    <inheritance strategy="${entity.inheritance}"/>`);
      lines.push(`    <discriminatorValue>${escapeXml(entityName)}</discriminatorValue>`);
      lines.push(
        `    <discriminatorColumn name="${escapeXml(entity.discriminatorColumn || 'DTYPE')}" discriminatorType="STRING"/>`,
      );
    }

    const attributes = entity.attributes.filter((a) => a.selected);
    const relations = entity.relations.filter((r) => r.selected);
    const ids = attributes.filter((a) => a.role === AttributeRole.ID);
    if (ids.length === 0) {
      warnings.push(
        `Klasse „${entityName}" hat keinen Schlüssel — bitte ein Attribut als Schlüssel markieren (im Ecore entspricht das einem iD-Attribut).`,
      );
    }

    if (attributes.length || relations.length) {
      lines.push('    <attributes>');
      for (const a of attributes) {
        const columnName = a.columnName || a.feature.getName() || 'value';
        if (RESERVED_SQL.has(columnName.toLowerCase())) {
          warnings.push(
            `Spalte „${columnName}" (${entityName}) ist ein SQL-Schlüsselwort — Bezeichner-Quoting aktivieren oder umbenennen.`,
          );
        }
        const name = a.feature.getName() ?? 'value';
        if (a.role === AttributeRole.ID) {
          lines.push(`      <id access="FIELD" name="${escapeXml(name)}">`);
          lines.push(...featureAccessor(a.feature, '        '));
          lines.push(columnElement(a, '        '));
          if (a.idStrategy === IdStrategy.SEQUENCE) {
            const seq = a.sequenceName || `SEQ_${(entity.targetClass.getName() ?? '').toUpperCase()}_${name.toUpperCase()}`;
            lines.push(`        <sequenceGenerator name="${escapeXml(seq)}" sequenceName="${escapeXml(seq)}"/>`);
            lines.push('        <generatedValue strategy="SEQUENCE"/>');
          } else if (a.idStrategy && a.idStrategy !== IdStrategy.NONE) {
            lines.push(`        <generatedValue strategy="${a.idStrategy}"/>`);
          }
          lines.push('      </id>');
        } else if (a.role === AttributeRole.VERSION) {
          lines.push(`      <version access="FIELD" name="${escapeXml(name)}">`);
          lines.push(...featureAccessor(a.feature, '        '));
          lines.push(columnElement(a, '        '));
          lines.push('      </version>');
        } else {
          lines.push(
            `      <basic access="FIELD" name="${escapeXml(name)}" fetch="EAGER" optional="${a.nullable ? 'true' : 'false'}">`,
          );
          lines.push(...featureAccessor(a.feature, '        '));
          lines.push(columnElement(a, '        '));
          lines.push('      </basic>');
        }
      }
      for (const r of relations) {
        lines.push(...relationElement(r, entity, '      '));
      }
      lines.push('    </attributes>');
    }

    // Querverweis auf die EClass (wie im Referenzformat zusätzlich zum accessibleObject)
    lines.push(`    <class xsi:type="ecore:EClass" href="${escapeXml(eClassHref(eClass))}"/>`);
    lines.push('  </entity>');
  }

  lines.push('</eorm:EntityMappings>');
  return { eormXmi: lines.join('\n') + '\n', eormFileName, warnings };
}
