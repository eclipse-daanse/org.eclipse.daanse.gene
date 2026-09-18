/**
 * Serializer-Anpassungen für die DataAtlasConfiguration.
 *
 * Das Ziel-XMI entsteht über EMF (`saveToString()`), nicht über einen
 * String-Builder — Escaping, Namespaces, `xsi:type` und Referenzlisten macht
 * damit der Serializer. Zwei Stellen bleiben, an denen emf.ts von Java EMF
 * abweicht:
 *
 *  a) **ID-Fragmente** — emf.ts wertet `iD="true"` beim Speichern nicht aus
 *     (emf.ts#84); ohne die Überschreibung stünde `dataInput="/0/0"` in der
 *     Datei statt `dataInput="persons-file"`. Der Weg über `resource.setID()`
 *     wirkt auch, schreibt aber zusätzlich ein `xmi:id`, das die Vorlagen des
 *     Data Atlas nicht haben.
 *  b) **Href-Dialekt** — Verweise auf Modellklassen müssen über den nsURI
 *     gehen. Bis @emfts/core 0.2 ergab sich das von selbst, weil EClassifier
 *     kein `eResource()` hatten (emf.ts#80); seit 0.3 haben sie eins, und
 *     `XMLSave.getHref()` schreibt den Verweis relativ zum Dokument
 *     (`model/person.ecore#//Person`). Das ist für eine Datei neben dem
 *     Modell richtig — die Konfiguration kommt aber über HTTP aus dem Model
 *     Atlas und hätte für einen relativen Pfad keinen Bezugspunkt.
 */
import { URI, XMIResource, XMISave } from '@emfts/core';
import type { EObject } from '@emfts/core';

/** Was ein Modellelement ausmacht, ohne auf Klassen zu prüfen. */
interface ModellElement {
  getName?: () => string | null;
  getEPackage?: () => { getNsURI?: () => string | null } | null;
  getEContainingClass?: () => {
    getName?: () => string | null;
    getEPackage?: () => { getNsURI?: () => string | null } | null;
  } | null;
}

/**
 * Der nsURI-Href eines Modellelements, oder `null`, wenn es keines ist.
 *
 * Ein Proxy bleibt aussen vor: sein Ziel steht noch nicht fest, und der
 * Serializer löst ihn mit seiner eigenen URI auf.
 */
function modellHref(obj: EObject): string | null {
  if ((obj as { eIsProxy?: () => boolean }).eIsProxy?.()) return null;
  const element = obj as unknown as ModellElement;

  const containingClass = element.getEContainingClass?.();
  if (containingClass) {
    const nsURI = containingClass.getEPackage?.()?.getNsURI?.();
    const className = containingClass.getName?.();
    const featureName = element.getName?.();
    if (nsURI && className && featureName) return `${nsURI}#//${className}/${featureName}`;
    return null;
  }

  if (typeof element.getEPackage === 'function') {
    const nsURI = element.getEPackage()?.getNsURI?.();
    const name = element.getName?.();
    if (nsURI && name) return `${nsURI}#//${name}`;
  }
  return null;
}

export class DataAtlasSave extends XMISave {
  /**
   * Verweise auf Modellelemente immer über den nsURI.
   *
   * Betrifft EClassifier (`nsURI#//Person`) und EStructuralFeature
   * (`nsURI#//Person/firstName`, aus eingebetteten eorm-Mappings). Alles
   * andere — dokumentinterne Verweise, Proxies — bleibt beim Serializer.
   */
  override getHref(obj: EObject): string | null {
    const nsHref = modellHref(obj);
    return nsHref ?? super.getHref(obj);
  }
}

export class DataAtlasResource extends XMIResource {
  protected override createXMLSave(): XMISave {
    return new DataAtlasSave(this.xmlHelper);
  }

  /**
   * Fragment = Wert des `iD="true"`-Attributs, sonst der Pfad. Java EMF geht
   * über `EcoreUtil.getID()` denselben Weg; emf.ts liest nur die eigene
   * ID-Karte (emf.ts#84).
   */
  override getURIFragment(eObject: EObject): string {
    const idAttribute = eObject.eClass?.()?.getEIDAttribute?.();
    if (idAttribute) {
      const wert = eObject.eGet(idAttribute);
      if (wert !== null && wert !== undefined && wert !== '') return String(wert);
    }
    return super.getURIFragment(eObject);
  }
}

/**
 * Erzeugt die Ausgabe-Resource. Der Dateiname ist nur der Resource-URI; er
 * taucht in der Ausgabe nicht auf, bestimmt aber, welche Verweise als
 * dokumentintern gelten.
 */
export function createDataAtlasResource(fileName: string): DataAtlasResource {
  return new DataAtlasResource(URI.createURI(fileName));
}
