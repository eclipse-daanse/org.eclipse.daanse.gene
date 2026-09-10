/**
 * Registriert die Widgets des Assistenten in der vue-registry.
 *
 * Zwei Gründe, die Defaults zu übergehen:
 *  - Der `EEnumEditor` schreibt numerische Werte, das generierte Modell
 *    erwartet die Enum-Namen (`'FILE'`), also übernimmt der `EnumChooser`.
 *  - Die Default-Editoren ignorieren das Label aus dem UIModel und zeigen
 *    „featureName (EType)", also übernimmt das `InputFieldWidget`.
 *
 * Prioritäten ≥ 900, weil der gene-Host über `ui-uimodel-forms/WidgetBridge`
 * einen Catch-all mit Priorität 1 in dieselbe globale Registry hängt.
 */
import { componentRegistry } from '@emfts/vue-registry';
import type { EClass } from '@emfts/core';
import EnumChooser from './EnumChooser.vue';
import InputFieldWidget from './InputFieldWidget.vue';
import { DataatlaswizardPackage } from '../generated';

/** Enum-Felder → Radio-Auswahl. */
const ENUM_FEATURES: [keyof typeof DataatlaswizardPackage.Literals, string][] = [
  ['ATLAS_SETUP', 'configMode'],
  ['ATLAS_SETUP', 'inputKind'],
  ['DATABASE_SOURCE_CONFIG', 'mappingKind'],
  ['EXPORT_CONFIG', 'kind'],
];

/** Text- und Zahlfelder der Formular-Schritte → eigenes Eingabefeld. */
const INPUT_FEATURES: [keyof typeof DataatlaswizardPackage.Literals, string[]][] = [
  [
    'ATLAS_SETUP',
    [
      'instanceName',
      'instanceDescription',
      'serviceId',
      'serviceName',
      'serviceDescription',
      'urlContext',
      'paginationOffsetParameterName',
      'paginationSizeParameterName',
    ],
  ],
  ['FILE_SOURCE_CONFIG', ['id', 'fileUri']],
  ['DATABASE_SOURCE_CONFIG', ['id', 'dataSourceId', 'dataSourceName', 'dataSourceFilter']],
  ['DATASET_CONFIG', ['id', 'name', 'description', 'path', 'batchSize', 'batchSizeLimit']],
  ['EXPORT_CONFIG', ['id', 'name', 'description', 'separator']],
];

export function registerWizardWidgets(): void {
  // Package anfassen, damit die Literals gefüllt sind
  void DataatlaswizardPackage.eINSTANCE;

  for (const [literal, featureName] of ENUM_FEATURES) {
    const eClass = DataatlaswizardPackage.Literals[literal] as EClass;
    componentRegistry.registerForFeature(eClass, featureName, EnumChooser, {
      priority: 1000,
      displayName: `Chooser:${featureName}`,
    });
  }

  for (const [literal, featureNames] of INPUT_FEATURES) {
    const eClass = DataatlaswizardPackage.Literals[literal] as EClass;
    for (const featureName of featureNames) {
      if (!eClass.getEStructuralFeature(featureName)) {
        throw new Error(`Widget-Registrierung: ${literal}.${featureName} gibt es nicht`);
      }
      componentRegistry.registerForFeature(eClass, featureName, InputFieldWidget, {
        priority: 900,
        displayName: `InputField:${featureName}`,
      });
    }
  }
}
