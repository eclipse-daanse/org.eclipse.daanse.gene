/**
 * gene-Widget-Erweiterung fuer das uimodel (Plan Abschnitt 10, emf.ts.ui#9):
 * laedt model/gene-widgets.ecore (CodeWidget/MarkdownWidget/RichTextWidget,
 * WidgetComponent-Subklassen) und registriert das Paket in der zentralen
 * EPackageRegistry, damit Overlay-/UIModel-XMIs genew:-Widgets referenzieren
 * koennen.
 *
 * Zwei Besonderheiten gegenueber einem einfachen Ecore-Load:
 *
 * 1. Supertyp-Reparatur: der eSuperTypes-href auf das uimodel-Paket kann
 *    nach dem Parse als unaufgeloester Proxy stehen bleiben (bekanntes
 *    Verhalten, vgl. resolveCrossPackageProxies im Model-Browser). Ohne
 *    echten Supertyp fehlten die geerbten Features (feature, label,
 *    validations, ...) und die AllFeatures-Expansion braeche.
 *
 * 2. Property-Proxy-Creators: der Composer greift auf Widgets per Property
 *    zu (widget.feature, widget.styles, widget.validations, ...). Die
 *    generierten uimodel-Impls bieten das; DynamicEObjects nicht. Deshalb
 *    erzeugt die Factory fuer genew-Klassen Objekte hinter einem Proxy,
 *    der unbekannte Properties auf eGet/eSet der gleichnamigen
 *    Struktur-Features abbildet.
 */

import { XMIResource, URI, BasicResourceSet, EPackageRegistry } from '@emfts/core'
import type { EClass, EObject, EPackage } from '@emfts/core'
import geneWidgetsEcore from '../model/gene-widgets.ecore?raw'

export const GENE_WIDGETS_NS_URI = 'http://gene/uimodel/widgets/1.0'
export const GENE_WIDGETS_NS_PREFIX = 'genew'
const UIMODEL_NS_URI = 'http://uimodel/1.0'

/** EClass-Namen der gene String-Editor-Widgets (Hints fuer den WidgetBridge). */
export const GENE_STRING_WIDGET_CLASSES = ['CodeWidget', 'MarkdownWidget', 'RichTextWidget'] as const
export type GeneStringWidgetClass = (typeof GENE_STRING_WIDGET_CLASSES)[number]

export function isGeneStringWidget(eClassName: string | undefined): eClassName is GeneStringWidgetClass {
  return !!eClassName && (GENE_STRING_WIDGET_CLASSES as readonly string[]).includes(eClassName)
}

interface EClassLike extends EObject {
  getName(): string
  getESuperTypes(): { length: number; clear?: () => void; add?: (v: unknown) => void; get?: (i: number) => unknown } & Iterable<unknown>
  getEStructuralFeature(name: string): unknown
  getEAllStructuralFeatures(): Iterable<{ getName?: () => string }>
}

function propertyProxy(target: EObject): EObject {
  return new Proxy(target as object, {
    get(t, prop, receiver) {
      if (typeof prop !== 'string' || prop in t) return Reflect.get(t, prop, receiver)
      const feature = (t as EObject).eClass?.()?.getEStructuralFeature?.(prop)
      return feature ? (t as EObject).eGet(feature as never) : undefined
    },
    set(t, prop, value, receiver) {
      if (typeof prop === 'string' && !(prop in t)) {
        const feature = (t as EObject).eClass?.()?.getEStructuralFeature?.(prop)
        if (feature) {
          ;(t as EObject).eSet(feature as never, value)
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

/** Unaufgeloeste eSuperTypes durch die echte WidgetComponent-EClass ersetzen. */
function repairSuperTypes(pkg: EPackage): void {
  const uimodelPkg = EPackageRegistry.INSTANCE.getEPackage(UIMODEL_NS_URI) as
    { getEClassifier?: (name: string) => unknown } | undefined
  const widgetComponent = uimodelPkg?.getEClassifier?.('WidgetComponent')
  if (!widgetComponent) {
    console.warn('[GeneWidgets] uimodel-Paket nicht registriert — Supertypen nicht reparierbar')
    return
  }
  for (const classifier of pkg.getEClassifiers() as Iterable<EClassLike>) {
    if (typeof classifier.getESuperTypes !== 'function') continue
    const supers = classifier.getESuperTypes()
    const resolved = [...supers].some(s =>
      s === widgetComponent ||
      ((s as { eIsProxy?: () => boolean }).eIsProxy?.() !== true &&
        (s as { getName?: () => string }).getName?.() === 'WidgetComponent')
    )
    if (resolved) continue
    supers.clear?.()
    supers.add?.(widgetComponent)
  }
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
  for (const classifier of pkg.getEClassifiers() as Iterable<EClassLike>) {
    if (typeof classifier.getESuperTypes !== 'function') continue
    const eClass = classifier as unknown as EClass
    factory.registerCreator(eClass, () => propertyProxy(factory.createDynamic!(eClass)))
  }
}

let registration: Promise<EPackage | null> | null = null

/**
 * Paket laden und registrieren (idempotent). Muss VOR dem Laden von
 * Overlay-/UIModel-XMIs laufen, die genew:-Widgets referenzieren.
 */
export function registerGeneWidgetsPackage(): Promise<EPackage | null> {
  if (registration) return registration
  registration = (async () => {
    const existing = EPackageRegistry.INSTANCE.getEPackage(GENE_WIDGETS_NS_URI)
    if (existing) return existing as EPackage

    const resourceSet = new BasicResourceSet()
    const res = new XMIResource(URI.createURI('gene://uimodel/gene-widgets.ecore'))
    resourceSet.getResources().push(res)
    res.setResourceSet(resourceSet)
    await res.loadFromString(geneWidgetsEcore)

    const pkg = res.getContents().get(0) as EPackage
    if (!pkg?.getNsURI || pkg.getNsURI() !== GENE_WIDGETS_NS_URI) {
      console.error('[GeneWidgets] gene-widgets.ecore konnte nicht geladen werden')
      return null
    }

    repairSuperTypes(pkg)
    installPropertyProxyCreators(pkg)
    EPackageRegistry.INSTANCE.set(GENE_WIDGETS_NS_URI, pkg)
    console.log('[GeneWidgets] Paket registriert:', GENE_WIDGETS_NS_URI)
    return pkg
  })()
  return registration
}
