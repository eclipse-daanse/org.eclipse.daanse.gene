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
import type { EPackage, URIConverter } from '@emfts/core';
import { UimodelPackage, UimodelFactory } from '@emfts/uimodel-composer';
import { MappingwizardPackage, MappingwizardFactory } from '../generated';
import { fixupWizardPackage } from './wizardPackageFixup';
import mappingEcoreXml from '../assets/event-atlas-mapping.ecore?raw';
// The Atlas management model 1:1 from eclipse-fennec/model.atlas - one copy in
// gene, kept by storage-model-atlas (see its src/model/SOURCE), read as text here
import atlasManagementXml from '../../../storage-model-atlas/src/model/management.ecore?raw';
import atlasWorkflowXml from '../assets/atlas-workflow-api.ecore?raw';

/** nsURI des SensiNact-Mapping-Metamodells (muss exakt stimmen, sonst PackageNotFound). */
export const MAPPING_NS_URI = 'https://fennec.eclipse.org/event.atlas/mapping/1.0';

/**
 * Vorheriges nsURI desselben Metamodells (vor dem Umzug von
 * emf.util/org.eclipse.fennec.sensinact.mapping nach
 * dim_xdp/event.atlas/org.eclipse.fennec.event.atlas.mapping — Struktur
 * unverändert, nur nsURI und Java-Package). Wird als Alias registriert, damit
 * ältere Mappings weiterhin geöffnet werden können.
 */
export const LEGACY_MAPPING_NS_URI = 'https://fennec.eclipse.org/sensinact/core/mapping/1.0';

let mappingPackage: EPackage | undefined;

/*
 * Ecore files by name. A model refers to its neighbours by file name
 * (`lorawan-uplink.ecore#//UplinkMessage`), while the resources live under
 * their nsURI - the name EMF itself gives a package, and the one the Java side
 * resolves through its registry. The resource set's URI converter maps the
 * one onto the other, so both forms meet the same resource (see
 * `newResourceSet`). Filled by `registerEcoreFromString`.
 */
const ecoreAliases = new Map<string, string>();

/** nsURI of the root package in an .ecore text - known before loading. */
export function nsUriOf(ecoreXml: string): string | undefined {
  return ecoreXml.match(/<ecore:EPackage[^>]*?\bnsURI="([^"]+)"/)?.[1];
}

/** Name of the root package in an .ecore text - known before loading. */
export function packageNameOf(ecoreXml: string): string | undefined {
  return ecoreXml.match(/<ecore:EPackage[^>]*?\bname="([^"]+)"/)?.[1];
}

/** Lets `<fileName>` stand for the model at `nsUri` in every resource set of the wizard. */
export function registerEcoreAlias(fileName: string, nsUri: string): void {
  const name = fileName.split('/').pop();
  if (name) ecoreAliases.set(name, nsUri);
}

function lastSegment(uriText: string): string {
  return uriText.split('#')[0].split('?')[0].split('/').pop() ?? '';
}

/**
 * The resource set's converter, extended by the file-name aliases: a URI whose
 * last segment is a known Ecore file name normalizes to that model's nsURI,
 * whatever base it was resolved against. Everything else goes to the original.
 */
function withEcoreAliases(base: URIConverter): URIConverter {
  return {
    normalize(uri: URI): URI {
      const text = uri.toString();
      const nsUri = ecoreAliases.get(lastSegment(text));
      if (nsUri) {
        const hash = text.indexOf('#');
        return URI.createURI(hash >= 0 ? `${nsUri}${text.substring(hash)}` : nsUri);
      }
      return base.normalize(uri);
    },
    createInputStream: (uri: URI) => base.createInputStream(uri),
    createOutputStream: (uri: URI) => base.createOutputStream(uri),
    exists: (uri: URI) => base.exists(uri),
    delete: (uri: URI) => base.delete(uri),
    getURIMap: () => base.getURIMap(),
  } as URIConverter;
}

/**
 * The mapping metamodel. Normally put in place by `setupPackages()`; a caller
 * that comes earlier (the transformer under test) gets the registered one, or
 * the bundled .ecore loaded on the spot.
 */
export function getMappingPackage(): EPackage {
  if (!mappingPackage) {
    mappingPackage =
      (EPackageRegistry.INSTANCE.get(MAPPING_NS_URI) as EPackage | undefined)
      ?? registerEcoreFromString(mappingEcoreXml, 'event-atlas-mapping.ecore');
  }
  return mappingPackage;
}

/**
 * Lädt eine .ecore aus einem XML-String und registriert alle enthaltenen EPackages.
 * Optional in ein gemeinsames ResourceSet laden (nötig, wenn Modelle einander
 * per relativem Datei-href referenzieren).
 *
 * The resource takes the package's nsURI as its URI; `uri` - the file name -
 * becomes an alias for it, as does `<packagename>.ecore`, the name EMF writes
 * into neighbouring models. References into this model then serialize as
 * `nsURI#//Class/feature`, which the Java side resolves through its registry.
 */
export function registerEcoreFromString(
  ecoreXml: string,
  uri: string,
  resourceSet?: BasicResourceSet,
): EPackage {
  const rs = resourceSet ?? newResourceSet();
  const nsUri = nsUriOf(ecoreXml);
  if (nsUri) {
    registerEcoreAlias(uri, nsUri);
    const name = packageNameOf(ecoreXml);
    if (name) registerEcoreAlias(`${name}.ecore`, nsUri);
  }
  const resource = rs.createResource(URI.createURI(nsUri ?? uri)) as XMIResource;
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
  // Every name is known before the first file loads - the order of the upload
  // must not decide whether a reference between two of them resolves
  for (const f of files) {
    const nsUri = nsUriOf(f.content);
    if (nsUri) {
      registerEcoreAlias(f.name, nsUri);
      const name = packageNameOf(f.content);
      if (name) registerEcoreAlias(`${name}.ecore`, nsUri);
    }
  }
  const resources = files.map((f) => {
    const resource = rs.createResource(URI.createURI(nsUriOf(f.content) ?? f.name)) as XMIResource;
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

/** ResourceSet mit XMI-Factory für .xmi und .ecore — und den Ecore-Aliasen. */
export function newResourceSet(): BasicResourceSet {
  const rs = new BasicResourceSet();
  const xmiFactory = new XMIResourceFactory();
  const map = rs.getResourceFactoryRegistry().getExtensionToFactoryMap();
  map.set('xmi', xmiFactory);
  map.set('ecore', xmiFactory);
  // A model resource lives under its nsURI, which has no file extension: the
  // wildcard entry (Resource.Factory.Registry.DEFAULT_EXTENSION) catches it
  map.set('*', xmiFactory);
  rs.setURIConverter(withEcoreAliases(rs.getURIConverter()));
  return rs;
}

/**
 * emf.ts führt die Ecore-Wrapper-Datentypen (EDoubleObject usw.) nicht —
 * reale Modelle (und das Mapping-Metamodell selbst) referenzieren sie aber.
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
  // referenzieren seine Features per nsURI. Der Fixup trägt die vom
  // Codegen ausgelassenen Attribut-eTypes und EEnums nach (nötig für die
  // Editor-Auswahl der vue-registry).
  const wizard = MappingwizardPackage.eINSTANCE;
  wizard.setEFactoryInstance(MappingwizardFactory.eINSTANCE);
  fixupWizardPackage();
  EPackageRegistry.INSTANCE.set(wizard.getNsURI()!, wizard);

  // Metamodelle als gebündelte Assets (kein fetch — funktioniert damit auch
  // als gene-Plugin ohne eigene public/-Auslieferung).
  if (!EPackageRegistry.INSTANCE.get(MAPPING_NS_URI)) {
    mappingPackage = registerEcoreFromString(mappingEcoreXml, 'event-atlas-mapping.ecore');
    // Alias: Mappings mit dem alten nsURI bleiben ladbar.
    EPackageRegistry.INSTANCE.set(LEGACY_MAPPING_NS_URI, mappingPackage);
  } else {
    mappingPackage = EPackageRegistry.INSTANCE.get(MAPPING_NS_URI) as EPackage;
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
