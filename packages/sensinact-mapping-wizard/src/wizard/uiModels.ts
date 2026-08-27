/**
 * Lädt die deklarativen UIModel-XMIs der Formular-Schritte. Die XMIs sind
 * als ?raw-Assets ins Bundle eingebettet — kein fetch, funktioniert damit
 * auch im gene-Plugin-Betrieb (dort würde ein fetch die SPA-Index-Seite
 * statt der Datei liefern).
 */
import { URI } from '@emfts/core';
import type { XMIResource } from '@emfts/core';
import type { UIModel } from '@emfts/uimodel-composer';
import { newResourceSet } from '../emf/setup';
import identificationXmi from '../assets/wizard-ui/step-identification.xmi?raw';
import timestampXmi from '../assets/wizard-ui/step-timestamp.xmi?raw';
import locationXmi from '../assets/wizard-ui/step-location.xmi?raw';

export interface WizardUiModels {
  identification: UIModel;
  timestamp: UIModel;
  location: UIModel;
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
    identification: load('step-identification.xmi', identificationXmi),
    timestamp: load('step-timestamp.xmi', timestampXmi),
    location: load('step-location.xmi', locationXmi),
  };
}
