/**
 * Runtime-Fixup für das generierte Wizard-Package: emfts-codegen setzt eType
 * nur für EReferences — EAttribute bleiben ohne Typ und EEnums werden nicht als
 * Classifier registriert. Ohne eType findet die vue-registry keine Editoren
 * (der DataType-Matcher prüft feature.getEType().getName()).
 *
 * Bei Modelländerungen die Zuordnung unten ergänzen (der wizardUi-Test schlägt
 * sonst fehl).
 */
import { BasicEEnum, BasicEEnumLiteral, getEcorePackage } from '@emfts/core';
import type { EClass, EClassifier, EPackage } from '@emfts/core';
import { EormwizardPackage } from '../generated';

type MutableFeature = { getEType(): EClassifier | null; setEType(t: EClassifier): void };

const ENUMS: Record<string, string[]> = {
  AttributeRole: ['BASIC', 'ID', 'VERSION'],
  IdStrategy: ['NONE', 'SEQUENCE', 'UUID', 'IDENTITY', 'TABLE'],
  InheritanceStrategy: ['NONE', 'SINGLE_TABLE', 'JOINED', 'TABLE_PER_CLASS'],
  RelationKind: ['ONE_TO_ONE', 'ONE_TO_MANY', 'MANY_TO_ONE', 'MANY_TO_MANY'],
  JoinStrategy: ['JOIN_COLUMN', 'JOIN_TABLE'],
  FetchMode: ['LAZY', 'EAGER'],
};

/** ClassName → featureName → Ecore-Datentyp bzw. Enum-Name. */
const ATTRIBUTE_TYPES: Record<string, Record<string, string>> = {
  EormSetup: {
    mappingName: 'EString',
    schema: 'EString',
    delimitedIdentifiers: 'EBoolean',
  },
  EntityConfig: {
    selected: 'EBoolean',
    entityName: 'EString',
    tableName: 'EString',
    inheritance: 'InheritanceStrategy',
    discriminatorColumn: 'EString',
  },
  AttributeConfig: {
    selected: 'EBoolean',
    role: 'AttributeRole',
    columnName: 'EString',
    nullable: 'EBoolean',
    unique: 'EBoolean',
    length: 'EInt',
    idStrategy: 'IdStrategy',
    sequenceName: 'EString',
  },
  RelationConfig: {
    selected: 'EBoolean',
    kind: 'RelationKind',
    joinStrategy: 'JoinStrategy',
    joinName: 'EString',
    fetch: 'FetchMode',
    cascadeAll: 'EBoolean',
    orphanRemoval: 'EBoolean',
    mappedBy: 'EString',
    batch: 'EBoolean',
  },
};

let applied = false;

export function fixupWizardPackage(): EPackage {
  const pkg = EormwizardPackage.eINSTANCE as unknown as EPackage;
  if (applied) return pkg;
  applied = true;

  for (const [name, literals] of Object.entries(ENUMS)) {
    if (pkg.getEClassifier(name)) continue;
    const eEnum = new BasicEEnum();
    eEnum.setName(name);
    literals.forEach((literalName, value) => {
      const literal = new BasicEEnumLiteral();
      literal.setName(literalName);
      literal.setLiteral(literalName);
      literal.setValue(value);
      eEnum.getELiterals().push(literal);
    });
    pkg.getEClassifiers().push(eEnum as unknown as EClassifier);
  }

  const ecore = getEcorePackage();
  for (const [className, features] of Object.entries(ATTRIBUTE_TYPES)) {
    const eClass = pkg.getEClassifier(className) as EClass | null;
    if (!eClass) throw new Error(`Wizard-Fixup: Klasse ${className} fehlt im Package`);
    for (const [featureName, typeName] of Object.entries(features)) {
      const feature = eClass.getEStructuralFeature(featureName) as MutableFeature | null;
      if (!feature) throw new Error(`Wizard-Fixup: Feature ${className}.${featureName} fehlt`);
      if (feature.getEType()) continue;
      const type = ecore.getEClassifier(typeName) ?? pkg.getEClassifier(typeName);
      if (!type) throw new Error(`Wizard-Fixup: Typ ${typeName} nicht auflösbar`);
      feature.setEType(type);
    }
  }
  return pkg;
}
