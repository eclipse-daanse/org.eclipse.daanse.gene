/**
 * Registriert die Assistenten-Widgets in der vue-registry:
 * eigene Editoren im gene-Design, die Label/Placeholder aus dem UIModel
 * respektieren (die Default-Editoren zeigen „featureName (EType)").
 */
import { componentRegistry } from '@emfts/vue-registry';
import type { EClass } from '@emfts/core';
import EnumChooser from './EnumChooser.vue';
import InputFieldWidget from './InputFieldWidget.vue';
import { EormwizardPackage } from '../generated';

export function registerWizardWidgets(): void {
  void EormwizardPackage.eINSTANCE;

  // Textfelder des Setup-Schritts
  const setupClass = EormwizardPackage.Literals.EORM_SETUP as EClass;
  for (const featureName of ['mappingName', 'schema']) {
    componentRegistry.registerForFeature(setupClass, featureName, InputFieldWidget, {
      priority: 900,
      displayName: `InputField:${featureName}`,
    });
  }
}
