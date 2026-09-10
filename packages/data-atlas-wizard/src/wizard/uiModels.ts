/**
 * Lädt die deklarativen UIModel-XMIs der Formular-Schritte. Sie sind als
 * ?raw-Assets ins Bundle eingebettet — kein fetch, damit es auch im
 * gene-Plugin-Betrieb funktioniert (dort lieferte ein fetch die
 * SPA-Index-Seite statt der Datei).
 */
import { URI } from '@emfts/core';
import type { XMIResource } from '@emfts/core';
import type { UIModel } from '@emfts/uimodel-composer';
import { newResourceSet } from '../emf/setup';
import instanceXmi from '../assets/wizard-ui/step-instance.xmi?raw';
import sourceXmi from '../assets/wizard-ui/step-source.xmi?raw';
import serviceXmi from '../assets/wizard-ui/step-service.xmi?raw';

export interface WizardUiModels {
  instance: UIModel;
  /** Enthält zwei FormViews: Datei und Datenbank. */
  source: UIModel;
  service: UIModel;
}

/** Das FormView mit diesem Namen — der Schritt zeigt je nach inputKind eines. */
export function formView(uiModel: UIModel, name: string): unknown {
  const components = (uiModel as unknown as { components?: Iterable<{ name?: string }> }).components;
  for (const component of components ?? []) {
    if (component.name === name) return component;
  }
  throw new Error(`UIModel: FormView „${name}" fehlt`);
}

export async function loadWizardUiModels(): Promise<WizardUiModels> {
  const rs = newResourceSet();
  const load = (name: string, content: string): UIModel => {
    const resource = rs.createResource(URI.createURI(name)) as XMIResource;
    resource.loadFromString(content);
    if (resource.getContents().isEmpty()) {
      throw new Error(`UIModel ${name} konnte nicht geladen werden`);
    }
    return resource.getContents().get(0) as unknown as UIModel;
  };

  return {
    instance: load('step-instance.xmi', instanceXmi),
    source: load('step-source.xmi', sourceXmi),
    service: load('step-service.xmi', serviceXmi),
  };
}
