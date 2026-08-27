/**
 * Registriert alle EPackages, die der Mapping-Assistent braucht:
 *  - Ecore-Basis
 *  - Core-UIModel (für die Wizard-Oberfläche)
 *  - das SensiNact-Mapping-Metamodell (dynamisch aus der .ecore geladen —
 *    Instanzen entstehen reflektiv über die Default-Factory des EPackage)
 *
 * Das Ecore-Modell des Sensors wird NICHT hier geladen, sondern erst zur
 * Laufzeit per Datei-Upload (siehe wizard/).
 */
import {
  BasicEDataType,
  BasicResourceSet,
  XMIResourceFactory,
  XMIResource,
  EPackageRegistry,
  getEcorePackage,
  registerEcorePackage,
  URI,
} from '@emfts/core';
import type { EPackage } from '@emfts/core';
import { UimodelPackage, UimodelFactory } from '@emfts/uimodel-composer';
import { EormwizardPackage, EormwizardFactory } from '../generated';
import { fixupWizardPackage } from './wizardPackageFixup';

import eormXml from '../assets/eorm.ecore?raw';
import epersistenceXml from '../assets/epersistence.ecore?raw';
import atlasManagementXml from '../assets/atlas-management.ecore?raw';
import atlasWorkflowXml from '../assets/atlas-workflow-api.ecore?raw';

/** nsURIs der Persistence-Metamodelle (müssen exakt stimmen). */
export const EORM_NS_URI = 'https://eclipse.org/fennec/persistence/eorm/1.0.0';
export const EPERSISTENCE_NS_URI = 'https://eclipse.org/fennec/persistence/epersistence/3.2.0';

let eormPackage: EPackage | undefined;

/** Das dynamisch geladene eorm-Metamodell (für Round-Trip/Validierung). */
export function getEormPackage(): EPackage {
  if (!eormPackage) throw new Error('setupPackages() wurde noch nicht ausgeführt');
  return eormPackage;
}

/**
 * Lädt eine .ecore aus einem XML-String und registriert alle enthaltenen EPackages.
 * Optional in ein gemeinsames ResourceSet laden (nötig, wenn Modelle einander
 * per relativem Datei-href referenzieren).
 */
export function registerEcoreFromString(
  ecoreXml: string,
  uri: string,
  resourceSet?: BasicResourceSet,
): EPackage {
  const rs = resourceSet ?? newResourceSet();
  const resource = rs.createResource(URI.createURI(uri)) as XMIResource;
  resource.loadFromString(ecoreXml);
  if (resource.getContents().isEmpty()) {
    throw new Error(`Ecore-Modell ${uri} konnte nicht geladen werden`);
  }
  const pkg = resource.getContents().get(0) as unknown as EPackage;
  registerPackageTree(pkg);
  return pkg;
}

function registerPackageTree(pkg: EPackage): void {
  const nsURI = pkg.getNsURI();
  if (nsURI) EPackageRegistry.INSTANCE.set(nsURI, pkg);
  for (const sub of pkg.getESubpackages?.() ?? []) {
    registerPackageTree(sub as EPackage);
  }
}

/**
 * Lädt mehrere zusammengehörige .ecore-Dateien (z. B. Sensor-Modell + Basis-Modell,
 * die sich per relativem href referenzieren) in EIN ResourceSet und registriert
 * alle EPackages. Die Datei-Namen dienen als Resource-URIs, damit relative
 * Querverweise (`lorawan-uplink.ecore#//UplinkMessage`) aufgelöst werden.
 */
export function registerEcoreFiles(files: { name: string; content: string }[]): EPackage[] {
  const rs = newResourceSet();
  const resources = files.map((f) => {
    const resource = rs.createResource(URI.createURI(f.name)) as XMIResource;
    resource.loadFromString(f.content);
    return { file: f, resource };
  });
  const packages: EPackage[] = [];
  for (const { file, resource } of resources) {
    if (resource.getContents().isEmpty()) {
      throw new Error(`Ecore-Modell ${file.name} konnte nicht geladen werden`);
    }
    const pkg = resource.getContents().get(0) as unknown as EPackage;
    registerPackageTree(pkg);
    packages.push(pkg);
  }
  return packages;
}

/** ResourceSet mit XMI-Factory für .xmi und .ecore. */
export function newResourceSet(): BasicResourceSet {
  const rs = new BasicResourceSet();
  const xmiFactory = new XMIResourceFactory();
  const map = rs.getResourceFactoryRegistry().getExtensionToFactoryMap();
  map.set('xmi', xmiFactory);
  map.set('ecore', xmiFactory);
  return rs;
}

/**
 * emf.ts führt die Ecore-Wrapper-Datentypen (EDoubleObject usw.) nicht —
 * reale Modelle (und sensinact-mapping.ecore selbst) referenzieren sie aber.
 * Ohne sie bleiben Attribut-Typen unaufgelöst und fallen z. B. aus der
 * Messwert-Erkennung. Wir ergänzen sie im Ecore-Package.
 */
function ensureEcoreWrapperTypes(): void {
  const ecore = getEcorePackage();
  const wrappers: [string, string][] = [
    ['EBooleanObject', 'java.lang.Boolean'],
    ['EByteObject', 'java.lang.Byte'],
    ['ECharacterObject', 'java.lang.Character'],
    ['EDoubleObject', 'java.lang.Double'],
    ['EFloatObject', 'java.lang.Float'],
    ['EIntegerObject', 'java.lang.Integer'],
    ['ELongObject', 'java.lang.Long'],
    ['EShortObject', 'java.lang.Short'],
  ];
  for (const [name, instanceClassName] of wrappers) {
    if (ecore.getEClassifier(name)) continue;
    const type = new BasicEDataType();
    type.setName(name);
    type.setInstanceClassName(instanceClassName);
    ecore.getEClassifiers().push(type);
  }
}

/**
 * Einmalige Initialisierung beim App-Start. Alle Registrierungen sind
 * idempotent — im gene-Plugin-Betrieb sind Ecore-Basis und UIModel-Package
 * bereits vom Host registriert.
 */
export async function setupPackages(): Promise<void> {
  registerEcorePackage();
  ensureEcoreWrapperTypes();

  if (!EPackageRegistry.INSTANCE.get('http://uimodel/1.0')) {
    const uimodel = UimodelPackage.eINSTANCE;
    uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);
    EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel);
  }

  // Wizard-Fassadenmodell registrieren — die UIModel-XMIs der Schritte
  // referenzieren seine Features per nsURI.
  const wizard = EormwizardPackage.eINSTANCE;
  wizard.setEFactoryInstance(EormwizardFactory.eINSTANCE);
  fixupWizardPackage();
  EPackageRegistry.INSTANCE.set(wizard.getNsURI()!, wizard);

  // Persistence-Metamodelle als gebündelte Assets (kein fetch — funktioniert
  // damit auch als gene-Plugin ohne eigene public/-Auslieferung).
  if (!EPackageRegistry.INSTANCE.get(EORM_NS_URI)) {
    eormPackage = registerEcoreFromString(eormXml, 'eorm.ecore');
  } else {
    eormPackage = EPackageRegistry.INSTANCE.get(EORM_NS_URI) as EPackage;
  }
  if (!EPackageRegistry.INSTANCE.get(EPERSISTENCE_NS_URI)) {
    registerEcoreFromString(epersistenceXml, 'epersistence.ecore');
  }
  registerAtlasApiPackagesOnce();
}

/** Atlas-API-Metamodelle (Antwort-Parsing) registrieren — idempotent. */
function registerAtlasApiPackagesOnce(): void {
  if (!EPackageRegistry.INSTANCE.get('http://eclipse.org/fennec/model/atlas/management/1.0.0')) {
    registerEcoreFromString(atlasManagementXml, 'atlas-management.ecore');
  }
  if (!EPackageRegistry.INSTANCE.get('http://eclipse.org/fennec/model/atlas/workflow/api/1.0.0')) {
    registerEcoreFromString(atlasWorkflowXml, 'atlas-workflow-api.ecore');
  }
}
