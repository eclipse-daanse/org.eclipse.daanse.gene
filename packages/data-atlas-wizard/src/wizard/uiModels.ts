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

export interface WizardUiModels {
  instance: UIModel;
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
  };
}
