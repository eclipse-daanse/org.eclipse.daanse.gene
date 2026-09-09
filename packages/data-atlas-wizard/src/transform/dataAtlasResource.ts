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
  /**
   * Zusätzliche Namespace-Deklarationen für den Dokumentkopf, als
   * Präfix → nsURI.
   *
   * Nötig, weil emf.ts Typpräfixe in Href-Werten schreibt
   * (`feature="ecore:EAttribute …"`), ohne das Präfix zu deklarieren
   * (emf.ts#87). Ein Leser kann `ecore:EAttribute` dann nicht auflösen.
   */
  extraNamespaces?: Readonly<Record<string, string>>;
}

/** Ecore-Namespace — von eingebetteten eorm-Mappings gebraucht. */
export const ECORE_NS_URI = 'http://www.eclipse.org/emf/2002/Ecore';

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

/**
 * Ist das Objekt ein EStructuralFeature? Ein eingebettetes eorm-Mapping
 * verweist auf Features (`…#//Person/firstName`), und die brauchen im
 * Datei-Modus denselben Dialekt — belegt durch `example/dataatlas-history.xmi`,
 * wo `<feature href="model/sensinact-history.ecore#//GeoData/latitude"/>`
 * steht.
 */
function asFeature(
  obj: EObject,
): { getName(): string | null; owner: { getName(): string | null; nsURI: string | null } } | null {
  const kandidat = obj as unknown as {
    getEContainingClass?: () => { getName?: () => string | null; getEPackage?: () => { getNsURI?: () => string | null } | null } | null;
    getName?: () => string | null;
  };
  if (typeof kandidat.getEContainingClass !== 'function' || typeof kandidat.getName !== 'function') {
    return null;
  }
  const owner = kandidat.getEContainingClass();
  if (!owner) return null;
  return {
    getName: () => kandidat.getName?.() ?? null,
    owner: { getName: () => owner.getName?.() ?? null, nsURI: owner.getEPackage?.()?.getNsURI?.() ?? null },
  };
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

  protected override getHref(obj: EObject): string | null {
    if (this.options.mode !== 'FILE') return super.getHref(obj);

    const classifier = asClassifier(obj);
    if (classifier) {
      const nsURI = classifier.getEPackage()?.getNsURI() ?? null;
      if (!nsURI) return super.getHref(obj);
      return `${this.fileFor(nsURI, classifier.getName())}#//${classifier.getName() ?? ''}`;
    }

    const feature = asFeature(obj);
    if (feature?.owner.nsURI) {
      const datei = this.fileFor(feature.owner.nsURI, feature.getName());
      return `${datei}#//${feature.owner.getName() ?? ''}/${feature.getName() ?? ''}`;
    }

    return super.getHref(obj);
  }

  /**
   * Der Dateiname zu einem nsURI. Fehlt der Eintrag, ist das ein harter
   * Fehler: ein nsURI-Href in einer Datei-Konfiguration sieht plausibel aus
   * und löst beim Laden nicht auf.
   */
  private fileFor(nsURI: string, betroffen: string | null): string {
    const datei = this.options.modelFiles?.get(nsURI);
    if (!datei) {
      throw new Error(
        `Kein modelFiles-Eintrag für ${nsURI} — im FILE-Modus braucht jedes ` +
          `referenzierte Package den Pfad seiner .ecore neben der Konfiguration ` +
          `(betroffen: ${betroffen ?? '?'}).`,
      );
    }
    return datei;
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
