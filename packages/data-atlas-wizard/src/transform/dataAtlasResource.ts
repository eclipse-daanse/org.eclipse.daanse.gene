/**
 * Serializer-Anpassungen für die DataAtlasConfiguration.
 *
 * Das Ziel-XMI entsteht über EMF (`saveToString()`), nicht über einen
 * String-Builder — Escaping, Namespaces, `xsi:type` und Referenzlisten macht
 * damit der Serializer. Zwei Stellen bleiben, an denen emf.ts von Java EMF
 * abweicht und die deshalb hier überschrieben werden:
 *
 *  a) **Href-Dialekt** — im `FILE`-Modus muss ein EClassifier als
 *     `model/person.ecore#//Person` erscheinen, im `ATLAS`-Modus als
 *     `<nsURI>#//Person`. Den Atlas-Fall trifft `XMLSave.getHref()` schon,
 *     weil EClassifier in emf.ts kein `eResource()` haben (emf.ts#80) und die
 *     Methode dann auf den nsURI zurückfällt. Für den Datei-Fall gibt es die
 *     Karte nsURI → Dateiname.
 *  b) **ID-Fragmente** — emf.ts wertet `iD="true"` beim Speichern nicht aus
 *     (emf.ts#84); ohne die Überschreibung stünde `dataInput="/0/0"` in der
 *     Datei statt `dataInput="persons-file"`. Der Weg über `resource.setID()`
 *     wirkt auch, schreibt aber zusätzlich ein `xmi:id`, das die Vorlagen des
 *     Data Atlas nicht haben.
 */
import { URI, XMIResource, XMISave } from '@emfts/core';
import type { EObject, XMLHelper } from '@emfts/core';
import type { ConfigMode } from '../generated';

/** Karte nsURI → Dateiname, wie sie aus `AtlasSetup.modelFiles` entsteht. */
export type ModelFileMap = ReadonlyMap<string, string>;

export interface DataAtlasResourceOptions {
  /** `FILE` schreibt relative Datei-Hrefs, `ATLAS` nsURI-Hrefs. */
  mode: ConfigMode;
  /** Nur im `FILE`-Modus benutzt; fehlt ein Eintrag, wird geworfen. */
  modelFiles?: ModelFileMap;
}

/** Ist das Objekt ein EClassifier, also ein Verweis ins Metamodell? */
function asClassifier(obj: EObject): { getName(): string | null; getEPackage(): { getNsURI(): string | null } | null } | null {
  const kandidat = obj as unknown as {
    getEPackage?: () => { getNsURI?: () => string | null } | null;
    getName?: () => string | null;
  };
  if (typeof kandidat.getEPackage !== 'function' || typeof kandidat.getName !== 'function') {
    return null;
  }
  return kandidat as never;
}

export class DataAtlasSave extends XMISave {
  private options: DataAtlasResourceOptions;

  constructor(helper: XMLHelper | undefined, options: DataAtlasResourceOptions) {
    super(helper);
    this.options = options;
  }

  /**
   * Im `FILE`-Modus wird der Href über die Datei aufgebaut, unter der das
   * Package neben der Konfiguration liegt. Fehlt der Eintrag, ist das ein
   * harter Fehler: ein nsURI-Href in einer Datei-Konfiguration sieht
   * plausibel aus und löst beim Laden nicht auf.
   */
  protected override getHref(obj: EObject): string | null {
    if (this.options.mode !== 'FILE') return super.getHref(obj);

    const classifier = asClassifier(obj);
    const nsURI = classifier?.getEPackage()?.getNsURI() ?? null;
    if (!classifier || !nsURI) return super.getHref(obj);

    const datei = this.options.modelFiles?.get(nsURI);
    if (!datei) {
      throw new Error(
        `Kein modelFiles-Eintrag für ${nsURI} — im FILE-Modus braucht jedes ` +
          `referenzierte Package den Pfad seiner .ecore neben der Konfiguration ` +
          `(betroffen: ${classifier.getName() ?? '?'}).`,
      );
    }
    return `${datei}#//${classifier.getName() ?? ''}`;
  }
}

export class DataAtlasResource extends XMIResource {
  private options: DataAtlasResourceOptions;

  constructor(uri: URI, options: DataAtlasResourceOptions) {
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
  options: DataAtlasResourceOptions,
): DataAtlasResource {
  return new DataAtlasResource(URI.createURI(fileName), options);
}
