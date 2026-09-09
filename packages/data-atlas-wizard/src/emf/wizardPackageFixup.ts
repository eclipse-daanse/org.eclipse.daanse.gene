/**
 * Runtime-Fixup für das generierte Fassaden-Package (emf.ts#83).
 *
 * `emfts-codegen` setzt `eType` nur an EReferences: EAttribute bleiben ohne
 * Typ, und die EEnums entstehen nur als TypeScript-Konstanten, nicht als
 * `EEnum`-Classifier des Packages. Was daran hängt:
 *
 *  - Der Round-Trip verliert die Datentypen — aus `openApi = true` wird beim
 *    Laden der String `"true"`, aus `batchSize = 500` der String `"500"`.
 *  - Die vue-registry findet keine Editoren (ihr Matcher fragt
 *    `feature.getEType().getName()`), und die UIModel-Schritte des Wizards
 *    hängen daran.
 *  - `pkg.getEClassifier('ConfigMode')` liefert `null`, ein Enum-Editor kann
 *    die Literale also nicht anbieten.
 *
 * Anders als die Vorlagen in den beiden anderen Wizards pflegt diese Datei
 * **keine Tabelle** der Typen, sondern liest sie aus derselben `.ecore`, aus
 * der der Generator kommt. Eine Modelländerung ist damit automatisch gedeckt;
 * eine Tabelle müsste man von Hand nachziehen und würde es vergessen.
 */
import {
  BasicResourceSet,
  URI,
  XMIResourceFactory,
  getEcorePackage,
  registerEcorePackage,
} from '@emfts/core';
import type { EClass, EClassifier, EPackage, EStructuralFeature, XMIResource } from '@emfts/core';
import { DataatlaswizardPackage } from '../generated';
import facadeEcoreXml from '../../model/data-atlas-wizard.ecore?raw';

/** `setEType` steht nicht auf der EStructuralFeature-Schnittstelle. */
type MutableFeature = EStructuralFeature & { setEType(type: EClassifier): void };

let applied = false;

/**
 * Lädt das Fassadenmodell aus der `.ecore` — in ein eigenes ResourceSet und
 * **ohne** Registrierung, damit das geparste Package nicht mit dem generierten
 * um den nsURI konkurriert. Gebraucht werden daraus nur die Typen.
 */
function parseFacadeEcore(): EPackage {
  registerEcorePackage(); // die Attribut-Hrefs zeigen auf das Ecore-Package
  const rs = new BasicResourceSet();
  const factory = new XMIResourceFactory();
  const map = rs.getResourceFactoryRegistry().getExtensionToFactoryMap();
  map.set('xmi', factory);
  map.set('ecore', factory);
  const resource = rs.createResource(URI.createURI('data-atlas-wizard.ecore')) as XMIResource;
  resource.loadFromString(facadeEcoreXml);
  if (resource.getContents().isEmpty()) {
    throw new Error('Fixup: model/data-atlas-wizard.ecore konnte nicht geladen werden');
  }
  return resource.getContents().get(0) as unknown as EPackage;
}

function isEEnum(classifier: EClassifier): boolean {
  return typeof (classifier as unknown as { getELiterals?: unknown }).getELiterals === 'function';
}

function isEClass(classifier: EClassifier): classifier is EClass {
  return typeof (classifier as unknown as { getEStructuralFeatures?: unknown })
    .getEStructuralFeatures === 'function';
}

/**
 * Trägt EEnums und Attribut-eTypes am generierten Package nach. Idempotent,
 * weil sowohl der Standalone-Start als auch das TSM-Plugin `setupPackages()`
 * aufrufen können.
 */
export function fixupWizardPackage(): EPackage {
  const generated = DataatlaswizardPackage.eINSTANCE as unknown as EPackage;
  if (applied) return generated;

  const parsed = parseFacadeEcore();
  const ecore = getEcorePackage();

  // 1. EEnums als Classifier übernehmen — dieselben Objekte, auf die gleich
  //    die Attribut-eTypes zeigen.
  for (const classifier of parsed.getEClassifiers()) {
    if (!isEEnum(classifier)) continue;
    const name = classifier.getName();
    if (!name || generated.getEClassifier(name)) continue;
    generated.getEClassifiers().push(classifier);
  }

  // 2. Fehlende Attribut-eTypes setzen. Die Referenzen hat der Generator
  //    schon verdrahtet, die bleiben unangetastet.
  for (const classifier of parsed.getEClassifiers()) {
    if (!isEClass(classifier)) continue;
    const className = classifier.getName();
    const target = className ? (generated.getEClassifier(className) as EClass | null) : null;
    if (!target) {
      throw new Error(`Fixup: Klasse ${className} fehlt im generierten Package`);
    }
    for (const source of classifier.getEStructuralFeatures()) {
      const featureName = source.getName();
      if (!featureName) continue;
      const feature = target.getEStructuralFeature(featureName) as MutableFeature | null;
      if (!feature) {
        throw new Error(`Fixup: Feature ${className}.${featureName} fehlt im generierten Package`);
      }
      if (feature.getEType()) continue;
      const type = source.getEType();
      if (!type) {
        throw new Error(`Fixup: ${className}.${featureName} hat auch in der .ecore keinen Typ`);
      }
      // Ecore-Datentypen aus dem kanonischen Package nehmen, damit die
      // Identitätsvergleiche im Serializer stimmen; Modell-Enums sind die
      // Objekte aus Schritt 1.
      const canonical = ecore.getEClassifier(type.getName() ?? '') ?? type;
      feature.setEType(canonical);
    }
  }

  applied = true;
  return generated;
}
