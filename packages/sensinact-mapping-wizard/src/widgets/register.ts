/**
 * Registriert die Assistenten-Widgets in der vue-registry:
 * Der FeaturePathPicker übernimmt alle Referenzen auf FeaturePath
 * (namePath, valuePath, latitudePath, …) mit hoher Priorität.
 */
import { componentRegistry } from '@emfts/vue-registry';
import type { EClass } from '@emfts/core';
import FeaturePathPicker from './FeaturePathPicker.vue';
import EnumChooser from './EnumChooser.vue';
import InputFieldWidget from './InputFieldWidget.vue';
import { MappingwizardPackage } from '../generated';

export function registerWizardWidgets(): void {
  // Package initialisieren, damit die Literals gefüllt sind
  void MappingwizardPackage.eINSTANCE;
  const featurePathClass = MappingwizardPackage.Literals.FEATURE_PATH as EClass;
  componentRegistry.registerForReference(FeaturePathPicker, {
    targetClass: featurePathClass,
    priority: 1000,
    displayName: 'FeaturePathPicker',
    description: 'Feld-Auswahl im Sensormodell (SensiNact-Mapping-Assistent)',
  });

  // Deutsche Radio-Auswahl statt des generischen Enum-Editors — der
  // Default schreibt numerische Werte, das Fassadenmodell erwartet Namen.
  componentRegistry.registerForFeature(
    MappingwizardPackage.Literals.TIMESTAMP_CHOICE as EClass,
    'source',
    EnumChooser,
    { priority: 1000, displayName: 'TimestampSourceChooser' },
  );
  componentRegistry.registerForFeature(
    MappingwizardPackage.Literals.LOCATION_CHOICE as EClass,
    'mode',
    EnumChooser,
    { priority: 1000, displayName: 'LocationModeChooser' },
  );
  for (const featureName of ['nameSource', 'friendlyNameSource']) {
    componentRegistry.registerForFeature(
      MappingwizardPackage.Literals.SENSOR_MAPPING_SETUP as EClass,
      featureName,
      EnumChooser,
      { priority: 1000, displayName: `Chooser:${featureName}` },
    );
  }

  // Eingabefelder der UIModel-Formulare: eigene Editoren im gene-Design,
  // die Label/Placeholder/required aus dem UIModel-Widget respektieren —
  // die Default-Editoren der Registry zeigen "featureName (EType)".
  // Nur für die Wizard-Modellklassen (Priorität über den DataType-Defaults,
  // unter den spezifischen Widgets oben).
  for (const eClass of [
    MappingwizardPackage.Literals.SENSOR_MAPPING_SETUP,
    MappingwizardPackage.Literals.TIMESTAMP_CHOICE,
    MappingwizardPackage.Literals.LOCATION_CHOICE,
  ] as EClass[]) {
    for (const featureName of [
      'mappingId',
      'nameFallback',
      'friendlyName',
      'formatHint',
      'latitude',
      'longitude',
      'elevation',
    ]) {
      if (eClass.getEStructuralFeature(featureName)) {
        componentRegistry.registerForFeature(eClass, featureName, InputFieldWidget, {
          priority: 900,
          displayName: `InputField:${featureName}`,
        });
      }
    }
  }
}
