/**
 * Regressionstest für die deklarativen Wizard-UIModels: Alle Feature-
 * Referenzen der Schritt-XMIs müssen sich auflösen und für jedes Feld muss
 * die vue-registry eine Komponente liefern (Default-Editoren bzw. der
 * FeaturePathPicker für FeaturePath-Referenzen).
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
import type { EClass, EObject, EStructuralFeature, XMIResource } from '@emfts/core';
import {
  componentRegistry,
  EStringEditor,
  EIntEditor,
  EBooleanEditor,
  EDateEditor,
  EEnumEditor,
  EReferenceEditor,
} from '@emfts/vue-registry';
import { UimodelPackage, UimodelFactory } from '@emfts/uimodel-composer';
import { MappingwizardPackage, MappingwizardFactory } from '../src/generated';
import { fixupWizardPackage } from '../src/emf/wizardPackageFixup';
import FeaturePathPicker from '../src/widgets/FeaturePathPicker.vue';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const STEP_FILES = ['step-identification.xmi', 'step-timestamp.xmi', 'step-location.xmi'];

let rs: BasicResourceSet;

beforeAll(() => {
  registerEcorePackage();

  const uimodel = UimodelPackage.eINSTANCE;
  uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);
  EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel);

  const wizard = MappingwizardPackage.eINSTANCE;
  wizard.setEFactoryInstance(MappingwizardFactory.eINSTANCE);
  fixupWizardPackage();
  EPackageRegistry.INSTANCE.set(wizard.getNsURI()!, wizard);

  // Entspricht den Default-Registrierungen des EmftsRendererPlugin
  componentRegistry.registerForDataType('EString', EStringEditor);
  componentRegistry.registerForDataType('EInt', EIntEditor);
  componentRegistry.registerForDataType('EDouble', EIntEditor);
  componentRegistry.registerForDataType('EBoolean', EBooleanEditor);
  componentRegistry.registerForDataType('EDate', EDateEditor);
  componentRegistry.registerForEnum(EEnumEditor);
  componentRegistry.registerForReference(EReferenceEditor);
  // Unsere Wizard-Registrierung
  componentRegistry.registerForReference(FeaturePathPicker, {
    targetClass: MappingwizardPackage.Literals.FEATURE_PATH as EClass,
    priority: 1000,
  });

  rs = new BasicResourceSet();
  const xmiFactory = new XMIResourceFactory();
  rs.getResourceFactoryRegistry().getExtensionToFactoryMap().set('xmi', xmiFactory);
});

function loadStep(file: string): EObject {
  const content = readFileSync(path.join(__dirname, '..', 'src', 'assets', 'wizard-ui', file), 'utf-8');
  const resource = rs.createResource(URI.createURI(file)) as XMIResource;
  resource.loadFromString(content);
  expect(resource.getContents().isEmpty()).toBe(false);
  return resource.getContents().get(0) as unknown as EObject;
}

function eget(obj: EObject, name: string): unknown {
  const f = obj.eClass().getEStructuralFeature(name);
  return f ? obj.eGet(f) : undefined;
}

describe.each(STEP_FILES)('%s', (file) => {
  it('löst alle Felder auf und findet für jedes eine Komponente', () => {
    const uiModel = loadStep(file);
    const components = Array.from(eget(uiModel, 'components') as Iterable<EObject>);
    expect(components.length).toBeGreaterThan(0);

    const fields = Array.from(eget(components[0], 'fields') as Iterable<EObject>);
    expect(fields.length).toBeGreaterThan(0);

    for (const field of fields) {
      const name = eget(field, 'name');
      const feature = eget(field, 'feature') as EStructuralFeature | undefined;
      expect(feature, `Feld ${name}: feature nicht gesetzt/aufgelöst`).toBeTruthy();
      expect(
        typeof feature!.getName === 'function' && feature!.getName(),
        `Feld ${name}: feature ist unaufgelöster Proxy`,
      ).toBeTruthy();

      const component = componentRegistry.getComponentForFeature(feature!);
      expect(component, `Feld ${name}: keine Komponente in der Registry`).toBeTruthy();
    }
  });
});
