/**
 * Runtime-Fixup für das generierte Wizard-Package: emfts-codegen setzt eType
 * nur für EReferences — EAttribute bleiben ohne Typ und EEnums werden nicht
 * als Classifier registriert (gleiches Problem wie im uimodel-composer-Editor,
 * dort gelöst via applyEcoreAttributeTypes.ts durch Parsen der .ecore).
 *
 * Ohne eType findet die vue-registry keine Editoren (der DataType-Matcher
 * prüft feature.getEType().getName()). Da unser Modell klein und stabil ist,
 * tragen wir die Typen hier explizit nach — DOM-frei, damit es auch in
 * Node-Tests läuft. Bei Modelländerungen: Zuordnung unten ergänzen
 * (der wizardUi-Test schlägt sonst fehl).
 */
import { BasicEEnum, BasicEEnumLiteral, getEcorePackage } from '@emfts/core';
import type { EClass, EClassifier, EPackage } from '@emfts/core';
import { MappingwizardPackage } from '../generated';

type MutableFeature = { getEType(): EClassifier | null; setEType(t: EClassifier): void };

const ENUMS: Record<string, string[]> = {
  TimestampSource: ['RECEIVE_TIME', 'DEVICE_TIME'],
  NameSource: ['FROM_FIELD', 'STATIC'],
  FriendlyNameSource: ['NONE', 'FROM_FIELD', 'STATIC'],
  LocationMode: ['NONE', 'STATIC', 'FROM_DATA'],
  StoragePreset: ['EVERY_CHANGE', 'CHANGED_5_PERCENT', 'MAX_ONCE_10MIN'],
  RetentionPreset: ['FOREVER', 'DAYS_90', 'YEAR_1'],
};

/** ClassName → featureName → Ecore-Datentyp bzw. Enum-Name. */
const ATTRIBUTE_TYPES: Record<string, Record<string, string>> = {
  SensorMappingSetup: {
    mappingId: 'EString',
    nameSource: 'NameSource',
    nameFallback: 'EString',
    friendlyNameSource: 'FriendlyNameSource',
    friendlyName: 'EString',
  },
  FeaturePath: { collectionIndex: 'EInt', label: 'EString' },
  TimestampChoice: { source: 'TimestampSource', formatHint: 'EString' },
  LocationChoice: {
    mode: 'LocationMode',
    latitude: 'EDouble',
    longitude: 'EDouble',
    elevation: 'EDouble',
  },
  Measurement: {
    selected: 'EBoolean',
    label: 'EString',
    unit: 'EString',
    serviceGroup: 'EString',
    storagePreset: 'StoragePreset',
    retentionPreset: 'RetentionPreset',
  },
};

let applied = false;

export function fixupWizardPackage(): EPackage {
  const pkg = MappingwizardPackage.eINSTANCE as unknown as EPackage;
  if (applied) return pkg;
  applied = true;

  // 1. EEnums als Classifier nachregistrieren
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

  // 2. Fehlende Attribut-eTypes setzen
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
