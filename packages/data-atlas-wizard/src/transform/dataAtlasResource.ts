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
 *  b) **Fehlende Namespace-Deklaration** — beim eingebetteten eorm-Mapping
 *     schreibt emf.ts Typpräfixe in Attributwerte
 *     (`feature="ecore:EAttribute …"`), zählt für die Deklarationen aber nur
 *     Präfixe, die von Elementen gebraucht werden (emf.ts#87).
 *
 * Der Href-Dialekt braucht **keine** Überschreibung: Verweise auf
 * Modellklassen entstehen immer über den nsURI, und genau den liefert
 * `XMLSave.getHref()` für einen EClassifier von sich aus (weil EClassifier in
 * emf.ts kein `eResource()` haben, emf.ts#80).
 */
import { URI, XMIResource, XMISave } from '@emfts/core';
import type { EObject, XMLHelper } from '@emfts/core';

export interface DataAtlasResourceOptions {
  /**
   * Zusätzliche Namespace-Deklarationen für den Dokumentkopf, als
   * Präfix → nsURI (emf.ts#87).
   */
  extraNamespaces?: Readonly<Record<string, string>>;
}

/** Ecore-Namespace — von eingebetteten eorm-Mappings gebraucht. */
export const ECORE_NS_URI = 'http://www.eclipse.org/emf/2002/Ecore';

export class DataAtlasSave extends XMISave {
  private options: DataAtlasResourceOptions;

  constructor(helper: XMLHelper | undefined, options: DataAtlasResourceOptions) {
    super(helper);
    this.options = options;
  }

  /**
   * Ergänzt die Deklarationen, die emf.ts nicht selbst schreibt. Ein Präfix,
   * das schon deklariert ist, wird nicht wiederholt.
   */
  protected override writeNamespaces(obj: EObject): void {
    super.writeNamespaces(obj);
    for (const [prefix, nsURI] of Object.entries(this.options.extraNamespaces ?? {})) {
      if (this.declaredNamespaces.has(nsURI)) continue;
      this.output.push(` xmlns:${prefix}="${nsURI}"`);
      this.declaredNamespaces.set(nsURI, prefix);
    }
  }
}

export class DataAtlasResource extends XMIResource {
  private options: DataAtlasResourceOptions;

  constructor(uri: URI, options: DataAtlasResourceOptions = {}) {
    super(uri);
    this.options = options;
  }

  protected override createXMLSave(): XMISave {
    return new DataAtlasSave(this.xmlHelper, this.options);
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
export function createDataAtlasResource(
  fileName: string,
  options: DataAtlasResourceOptions = {},
): DataAtlasResource {
  return new DataAtlasResource(URI.createURI(fileName), options);
}
