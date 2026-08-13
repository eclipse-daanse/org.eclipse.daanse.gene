/**
 * gene-Widget-Erweiterung fuer das uimodel (Plan Abschnitt 10, emf.ts.ui#9).
 *
 * Registriert `model/gene-widgets.ecore` (CodeWidget/MarkdownWidget/
 * RichTextWidget als WidgetComponent-Subklassen) als eigenes EPackage in der
 * zentralen EPackageRegistry, damit Overlay-/UIModel-XMIs genew:-Widgets
 * referenzieren koennen.
 *
 * Bewusst NICHT ueber den Ecore-Loader des Model-Browsers: das Paket ist ein
 * Host-Artefakt und soll nicht als Nutzer-Metamodell im Model-Browser
 * auftauchen. Laden und Registrieren erledigen die Bordmittel von
 * @emfts/core (EResourceSetImpl bringt die XMI-Factory fuer .ecore mit).
 *
 * Der einzige gene-spezifische Kunstgriff ist der Property-Proxy: der
 * Composer greift auf Widgets per Property zu (widget.feature, widget.styles,
 * ...). Die generierten uimodel-Impls bieten das, dynamisch geladene
 * EClasses liefern aber DynamicEObjects. Statt eines Codegen-Schritts im
 * Build registriert die Factory Creators, die Instanzen hinter einem Proxy
 * erzeugen, der unbekannte Properties auf eGet/eSet des gleichnamigen
 * Features abbildet.
 */

import { EResourceSetImpl, URI, EPackageRegistry, isEClass } from '@emfts/core'
import type { EClass, EObject, EPackage } from '@emfts/core'
import geneWidgetsEcore from '../model/gene-widgets.ecore?raw'

export const GENE_WIDGETS_NS_URI = 'http://gene/uimodel/widgets/1.0'
export const GENE_WIDGETS_NS_PREFIX = 'genew'

/** EClass-Namen der gene String-Editor-Widgets (Hints fuer den WidgetBridge). */
export const GENE_STRING_WIDGET_CLASSES = ['CodeWidget', 'MarkdownWidget', 'RichTextWidget'] as const
export type GeneStringWidgetClass = (typeof GENE_STRING_WIDGET_CLASSES)[number]

export function isGeneStringWidget(eClassName: string | undefined): eClassName is GeneStringWidgetClass {
  return !!eClassName && (GENE_STRING_WIDGET_CLASSES as readonly string[]).includes(eClassName)
}

function propertyProxy(target: EObject): EObject {
  return new Proxy(target as object, {
    get(t, prop, receiver) {
      if (typeof prop !== 'string' || prop in t) return Reflect.get(t, prop, receiver)
      const feature = (t as EObject).eClass?.()?.getEStructuralFeature?.(prop)
      return feature ? (t as EObject).eGet(feature) : undefined
    },
    set(t, prop, value, receiver) {
      if (typeof prop === 'string' && !(prop in t)) {
        const feature = (t as EObject).eClass?.()?.getEStructuralFeature?.(prop)
        if (feature) {
          ;(t as EObject).eSet(feature, value)
          return true
        }
      }
      return Reflect.set(t, prop, value, receiver)
    },
    has(t, prop) {
      if (Reflect.has(t, prop)) return true
      return typeof prop === 'string' && !!(t as EObject).eClass?.()?.getEStructuralFeature?.(prop)
    }
  }) as EObject
}

/** Klassen des Pakets (EEnums/EDataTypes fallen raus). */
function eClassesOf(pkg: EPackage): EClass[] {
  return [...pkg.getEClassifiers()].filter(isEClass)
}

/**
 * Prueft, dass die eSuperTypes-hrefs auf
 * `http://uimodel/1.0#//WidgetComponent` aufgeloest haben.
 *
 * Nicht ueber die geerbten Features pruefen: `getEStructuralFeature()` wirft
 * bei unaufgeloestem Supertyp innerhalb von @emfts/core
 * ("eClass.getESuperTypes is not a function"), weil der Proxy die
 * EClass-API nicht hat. Geprueft wird deshalb der Supertyp selbst.
 *
 * Pruefen statt reparieren: eine Reparatur wuerde die eigentliche Ursache
 * — falsche Reihenfolge beim Start — verdecken, und ihr Erfolgsfall waere
 * nicht testbar.
 */
function superTypesResolved(pkg: EPackage): boolean {
  let ok = true
  for (const eClass of eClassesOf(pkg)) {
    const superTypes = [...eClass.getESuperTypes()]
    // isEClass faellt bei einem Proxy durch (ihm fehlt die EClass-API)
    const unresolved = superTypes.filter(s => !isEClass(s) || s.eIsProxy())
    if (superTypes.length > 0 && unresolved.length === 0) continue
    ok = false
    console.error(
      `[GeneWidgets] ${eClass.getName()}: eSuperTypes nicht aufgeloest ` +
      `(${superTypes.length} Supertyp(en), davon ${unresolved.length} unaufgeloest). ` +
      'Das uimodel-Paket muss VOR registerGeneWidgetsPackage() in der ' +
      'EPackageRegistry stehen — sonst fehlen den Widgets alle geerbten ' +
      'Features (feature, label, validations, ...).'
    )
  }
  return ok
}

/** Factory des Pakets so verdrahten, dass genew-Instanzen Property-Zugriff bieten. */
function installPropertyProxyCreators(pkg: EPackage): void {
  const factory = pkg.getEFactoryInstance?.() as
    | { createDynamic?: (eClass: EClass) => EObject; registerCreator?: (eClass: EClass, creator: () => EObject) => void }
    | undefined
  if (!factory?.registerCreator || !factory.createDynamic) {
    console.warn('[GeneWidgets] Factory ohne registerCreator/createDynamic — Widgets ohne Property-Zugriff')
    return
  }
  for (const eClass of eClassesOf(pkg)) {
    factory.registerCreator(eClass, () => propertyProxy(factory.createDynamic!(eClass)))
  }
}

let registration: Promise<EPackage | null> | null = null

/**
 * Paket laden und registrieren (idempotent). Muss laufen, NACHDEM das
 * uimodel-Paket registriert wurde (sonst loesen die Supertypen nicht auf)
 * und BEVOR Overlay-/UIModel-XMIs mit genew:-Widgets geladen werden.
 */
export function registerGeneWidgetsPackage(): Promise<EPackage | null> {
  if (registration) return registration
  registration = (async () => {
    const existing = EPackageRegistry.INSTANCE.getEPackage(GENE_WIDGETS_NS_URI)
    if (existing) return existing as EPackage

    const resourceSet = new EResourceSetImpl()
    const resource = resourceSet.createResource(URI.createURI('gene://uimodel/gene-widgets.ecore'))
    await (resource as unknown as { loadFromString: (s: string) => Promise<void> }).loadFromString(geneWidgetsEcore)

    const pkg = resource.getContents().get(0) as EPackage
    if (!pkg?.getNsURI || pkg.getNsURI() !== GENE_WIDGETS_NS_URI) {
      console.error('[GeneWidgets] gene-widgets.ecore konnte nicht geladen werden')
      return null
    }

    // Nicht registrieren, wenn die Vererbung nicht steht — sonst entstuenden
    // Widget-Prototypen ohne Feature-Bindung und der Fehler bliebe unsichtbar.
    if (!superTypesResolved(pkg)) return null

    installPropertyProxyCreators(pkg)
    EPackageRegistry.INSTANCE.set(GENE_WIDGETS_NS_URI, pkg)
    console.log('[GeneWidgets] Paket registriert:', GENE_WIDGETS_NS_URI)
    return pkg
  })()
  return registration
}
