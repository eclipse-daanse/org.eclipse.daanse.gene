/**
 * Die deklarativen Schritt-XMIs gegen das Fassadenmodell (Schritt 8).
 *
 * Der Compiler verbindet beide nicht: die Formulare verweisen per nsURI-Href
 * auf Features, und eine Umbenennung im Modell fällt sonst erst im Browser
 * auf — als leeres Formular. Geprüft wird deshalb: jeder `feature=`-Href löst
 * auf, und für jedes Feld liefert die Registry eine Komponente. Das fängt
 * zugleich den Codegen-Bug (emf.ts#83), denn ohne eType findet der Matcher
 * der vue-registry nichts.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { URI, type EObject, type EStructuralFeature, type XMIResource } from '@emfts/core';
import {
  componentRegistry,
  EBooleanEditor,
  EDateEditor,
  EEnumEditor,
  EIntEditor,
  EReferenceEditor,
  EStringEditor,
} from '@emfts/vue-registry';
import { newResourceSet, setupPackages } from '../src/emf/setup';
import { registerWizardWidgets } from '../src/widgets/register';
import EnumChooser from '../src/widgets/EnumChooser.vue';
import InputFieldWidget from '../src/widgets/InputFieldWidget.vue';

const wizardUi = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src', 'assets', 'wizard-ui');
const STEP_FILES = ['step-instance.xmi', 'step-source.xmi', 'step-service.xmi'];

beforeAll(async () => {
  await setupPackages();
  // Entspricht den Default-Registrierungen des EmftsRendererPlugin …
  componentRegistry.registerForDataType('EString', EStringEditor);
  componentRegistry.registerForDataType('EInt', EIntEditor);
  componentRegistry.registerForDataType('EDouble', EIntEditor);
  componentRegistry.registerForDataType('EBoolean', EBooleanEditor);
  componentRegistry.registerForDataType('EDate', EDateEditor);
  componentRegistry.registerForEnum(EEnumEditor);
  componentRegistry.registerForReference(EReferenceEditor);
  // … und dann unsere
  registerWizardWidgets();
});

function ladeSchritt(datei: string): EObject {
  const resource = newResourceSet().createResource(URI.createURI(datei)) as XMIResource;
  resource.loadFromString(readFileSync(join(wizardUi, datei), 'utf-8'));
  expect(resource.getContents().isEmpty(), `${datei} ist leer`).toBe(false);
  return resource.getContents().get(0) as unknown as EObject;
}

function lies(obj: EObject, name: string): unknown {
  const feature = obj.eClass().getEStructuralFeature(name);
  return feature ? obj.eGet(feature) : undefined;
}

function formViews(uiModel: EObject): EObject[] {
  return [...((lies(uiModel, 'components') ?? []) as Iterable<EObject>)];
}

function felder(formView: EObject): EObject[] {
  return [...((lies(formView, 'fields') ?? []) as Iterable<EObject>)];
}

describe.each(STEP_FILES)('%s', (datei) => {
  it('jeder Feature-Href löst auf und findet eine Komponente', () => {
    const uiModel = ladeSchritt(datei);
    const views = formViews(uiModel);
    expect(views.length).toBeGreaterThan(0);

    let anzahlFelder = 0;
    for (const view of views) {
      for (const feld of felder(view)) {
        anzahlFelder++;
        const name = lies(feld, 'name');
        const feature = lies(feld, 'feature') as EStructuralFeature | undefined;
        expect(feature, `${datei}/${name}: feature nicht gesetzt`).toBeTruthy();
        expect(
          typeof feature!.getName === 'function' && feature!.getName(),
          `${datei}/${name}: feature ist ein unaufgelöster Proxy`,
        ).toBeTruthy();
        expect(
          componentRegistry.getComponentForFeature(feature!),
          `${datei}/${name}: keine Komponente in der Registry`,
        ).toBeTruthy();
      }
    }
    expect(anzahlFelder).toBeGreaterThan(0);
  });

  it('die Zielklasse des Formulars gehört zur Fassade', () => {
    for (const view of formViews(ladeSchritt(datei))) {
      const klassen = [...((lies(view, 'targetClasses') ?? []) as Iterable<unknown>)];
      expect(klassen.length, 'targetClasses fehlt').toBeGreaterThan(0);
      for (const klasse of klassen) {
        const eClass = klasse as { getEPackage?: () => { getNsURI(): string | null } | null };
        expect(eClass.getEPackage?.()?.getNsURI()).toBe(
          'http://fennec/data/atlas/data-atlas-wizard/1.0',
        );
      }
    }
  });
});

describe('Widget-Zuordnung', () => {
  it('Enum-Felder bekommen den EnumChooser, nicht den Default-Editor', () => {
    const uiModel = ladeSchritt('step-instance.xmi');
    const feld = felder(formViews(uiModel)[0]).find((f) => lies(f, 'name') === 'configMode');
    const feature = lies(feld!, 'feature') as EStructuralFeature;
    expect(componentRegistry.getComponentForFeature(feature)).toBe(EnumChooser);
  });

  it('Textfelder bekommen das eigene Eingabefeld', () => {
    const uiModel = ladeSchritt('step-instance.xmi');
    const feld = felder(formViews(uiModel)[0]).find((f) => lies(f, 'name') === 'instanceName');
    const feature = lies(feld!, 'feature') as EStructuralFeature;
    expect(componentRegistry.getComponentForFeature(feature)).toBe(InputFieldWidget);
  });

  it('die Registrierung meldet ein Feature, das es nicht gibt', () => {
    // Sonst bliebe eine Umbenennung im Modell unbemerkt
    expect(() => registerWizardWidgets()).not.toThrow();
  });
});

describe('Sichtbarkeit und Prüfungen im Modell', () => {
  it('der Datenquellen-Schritt trennt Datei und Datenbank in zwei Formulare', () => {
    const views = formViews(ladeSchritt('step-source.xmi'));
    expect(views.map((v) => lies(v, 'name'))).toEqual(['FileSourceForm', 'DatabaseSourceForm']);
  });

  it('Pflichtfelder tragen eine Validierung', () => {
    const uiModel = ladeSchritt('step-instance.xmi');
    const feld = felder(formViews(uiModel)[0]).find((f) => lies(f, 'name') === 'instanceName');
    const pruefungen = [...((lies(feld!, 'validations') ?? []) as Iterable<EObject>)];
    expect(pruefungen.length).toBeGreaterThan(0);
    expect(lies(pruefungen[0], 'severity')).toBeTruthy();
  });
});
