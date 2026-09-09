/**
 * Registriert alle EPackages, die der Assistent braucht:
 *
 *  - Ecore-Basis (im gene-Betrieb schon vom Host registriert)
 *  - Core-UIModel für die Schritt-Formulare
 *  - das Fassadenmodell des Assistenten, samt Fixup (emf.ts#83)
 *  - configuration.ecore — das Zielmetamodell
 *  - eorm.ecore — nötig, sobald ein JPA-Mapping eingebettet wird
 *
 * Das Domänenmodell des Nutzers wird **nicht** hier geladen, sondern zur
 * Laufzeit aus dem Model Atlas oder per Upload.
 */
import {
  BasicEDataType,
  BasicResourceSet,
  EPackageRegistry,
  URI,
  XMIResourceFactory,
  getEcorePackage,
  registerEcorePackage,
} from '@emfts/core';
import type { EPackage, XMIResource } from '@emfts/core';
import { UimodelFactory, UimodelPackage } from '@emfts/uimodel-composer';
import { DataatlaswizardFactory, DataatlaswizardPackage } from '../generated';
import { fixupWizardPackage } from './wizardPackageFixup';
import configurationEcoreXml from '../assets/configuration.ecore?raw';
import eormEcoreXml from '../assets/eorm.ecore?raw';

/** nsURI des Zielmetamodells (muss exakt stimmen, sonst PackageNotFound). */
export const CONFIGURATION_NS_URI = 'https://eclipse.org/fennec/data/atlas/configuration/1.0.0';

/** nsURI des eorm-Metamodells — Wurzel eines importierten JPA-Mappings. */
export const EORM_NS_URI = 'https://eclipse.org/fennec/persistence/eorm/1.0.0';

let configurationPackage: EPackage | undefined;
let eormPackage: EPackage | undefined;

export function getConfigurationPackage(): EPackage {
  if (!configurationPackage) throw new Error('setupPackages() wurde noch nicht ausgeführt');
  return configurationPackage;
}

export function getEormPackage(): EPackage {
  if (!eormPackage) throw new Error('setupPackages() wurde noch nicht ausgeführt');
  return eormPackage;
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
 * Lädt eine .ecore aus einem XML-String und registriert alle enthaltenen
 * EPackages. Ein gemeinsames ResourceSet ist nötig, wenn die Modelle einander
 * per relativem Datei-href referenzieren.
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
 * Lädt mehrere zusammengehörige .ecore-Dateien in EIN ResourceSet und
 * registriert alle EPackages. Die Dateinamen dienen als Resource-URIs, damit
 * relative Querverweise (`person.ecore#//Person`) aufgelöst werden — und damit
 * der FILE-Href-Dialekt später dieselben Namen benutzen kann.
 */
export function registerEcoreFiles(files: { name: string; content: string }[]): EPackage[] {
  const rs = newResourceSet();
  const geladen = files.map((file) => {
    const resource = rs.createResource(URI.createURI(file.name)) as XMIResource;
    resource.loadFromString(file.content);
    return { file, resource };
  });
  const packages: EPackage[] = [];
  for (const { file, resource } of geladen) {
    if (resource.getContents().isEmpty()) {
      throw new Error(`Ecore-Modell ${file.name} konnte nicht geladen werden`);
    }
    const pkg = resource.getContents().get(0) as unknown as EPackage;
    registerPackageTree(pkg);
    packages.push(pkg);
  }
  return packages;
}

/**
 * emf.ts führt die Ecore-Wrapper-Datentypen (EIntegerObject usw.) nicht.
 * Domänenmodelle aus Java-Werkzeugen referenzieren sie aber regelmäßig; ohne
 * sie bleiben deren Attribut-Typen unaufgelöst. Dieselbe Ergänzung wie im
 * SensiNact-Assistenten, wo reale Sensormodelle darüber gestolpert sind.
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
 * Einmalige Initialisierung. Alle Registrierungen sind idempotent — im
 * gene-Plugin-Betrieb bringt der Host Ecore-Basis und UIModel-Package
 * bereits mit.
 */
export async function setupPackages(): Promise<void> {
  registerEcorePackage();
  ensureEcoreWrapperTypes();

  if (!EPackageRegistry.INSTANCE.get('http://uimodel/1.0')) {
    const uimodel = UimodelPackage.eINSTANCE;
    uimodel.setEFactoryInstance(UimodelFactory.eINSTANCE);
    EPackageRegistry.INSTANCE.set(uimodel.getNsURI()!, uimodel);
  }

  // Fassadenmodell: Die UIModel-Schritte referenzieren seine Features per
  // nsURI. Der Fixup trägt nach, was der Codegen ausgelassen hat.
  const facade = DataatlaswizardPackage.eINSTANCE;
  facade.setEFactoryInstance(DataatlaswizardFactory.eINSTANCE);
  fixupWizardPackage();
  EPackageRegistry.INSTANCE.set(facade.getNsURI()!, facade);

  // Zielmetamodelle als gebündelte Assets — kein fetch, damit es auch als
  // gene-Plugin ohne eigene public/-Auslieferung funktioniert.
  //
  // eorm **zuerst**: configuration.ecore verweist mit einem nsURI-Href auf
  // `eorm#//EntityMappings` (JPADataInput.persistenceConfig). Wird eorm später
  // registriert, bleibt dieser Verweis unaufgelöst — dieselbe Reihenfolge, die
  // auch der Publish-Flow braucht.
  eormPackage =
    (EPackageRegistry.INSTANCE.get(EORM_NS_URI) as EPackage | undefined) ??
    registerEcoreFromString(eormEcoreXml, 'eorm.ecore');
  configurationPackage =
    (EPackageRegistry.INSTANCE.get(CONFIGURATION_NS_URI) as EPackage | undefined) ??
    registerEcoreFromString(configurationEcoreXml, 'configuration.ecore');
}
