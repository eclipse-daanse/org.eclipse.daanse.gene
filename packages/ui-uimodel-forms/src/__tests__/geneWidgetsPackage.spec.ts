/**
 * Unit-Tests fuer die gene-Widget-Erweiterung (Plan Abschnitt 10, emf.ts.ui#9).
 *
 * Kritisch sind zwei Dinge, die der Composer voraussetzt:
 * - die genew-Klassen erben WIRKLICH von WidgetComponent (sonst fehlen
 *   feature/label/validations und die AllFeatures-Expansion braeche),
 * - Instanzen bieten Property-Zugriff (widget.feature = ...), nicht nur eGet.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { EPackageRegistry } from '@emfts/core'
import {
  registerGeneWidgetsPackage,
  GENE_WIDGETS_NS_URI,
  isGeneStringWidget
} from '../geneWidgetsPackage'
import { rulesToOverlayXmi } from '../overlayRules'
import { loadUiModelXmi } from '../uiModelRegistry'

describe('geneWidgetsPackage', () => {
  beforeAll(async () => {
    // Kein Setup noetig: registerGeneWidgetsPackage stellt das
    // uimodel-Paket und die Factory-Verdrahtung selbst her
    // (ensureUimodelPackageRegistered).
    await registerGeneWidgetsPackage()
  })

  it('registriert das Paket unter seiner nsURI', () => {
    const pkg = EPackageRegistry.INSTANCE.getEPackage(GENE_WIDGETS_NS_URI)
    expect(pkg).toBeTruthy()
    expect((pkg as { getNsPrefix: () => string }).getNsPrefix()).toBe('genew')
  })

  it.each(['CodeWidget', 'MarkdownWidget', 'RichTextWidget'])(
    '%s erbt von WidgetComponent (geerbte Features verfuegbar)',
    (className) => {
      const pkg = EPackageRegistry.INSTANCE.getEPackage(GENE_WIDGETS_NS_URI) as
        { getEClassifier: (n: string) => any }
      const eClass = pkg.getEClassifier(className)
      expect(eClass).toBeTruthy()

      const superNames = [...eClass.getESuperTypes()].map((s: any) => s.getName?.())
      expect(superNames).toContain('WidgetComponent')

      // geerbte Features des Kernpakets muessen aufloesbar sein
      for (const inherited of ['feature', 'label', 'readOnly', 'validations', 'bindings']) {
        expect(eClass.getEStructuralFeature(inherited), `geerbtes Feature ${inherited}`).toBeTruthy()
      }
    }
  )

  it('CodeWidget bringt die eigenen Attribute mit', () => {
    const pkg = EPackageRegistry.INSTANCE.getEPackage(GENE_WIDGETS_NS_URI) as
      { getEClassifier: (n: string) => any }
    const eClass = pkg.getEClassifier('CodeWidget')
    for (const own of ['language', 'rows', 'lineNumbers', 'value']) {
      expect(eClass.getEStructuralFeature(own), `eigenes Feature ${own}`).toBeTruthy()
    }
  })

  it('Instanzen bieten Property-Zugriff (Composer-Vertrag)', () => {
    const pkg = EPackageRegistry.INSTANCE.getEPackage(GENE_WIDGETS_NS_URI) as
      { getEClassifier: (n: string) => any; getEFactoryInstance: () => any }
    const eClass = pkg.getEClassifier('CodeWidget')
    const widget = pkg.getEFactoryInstance().create(eClass) as any

    // schreiben per Property → per eGet lesbar (und umgekehrt)
    widget.language = 'json'
    expect(widget.language).toBe('json')
    expect(widget.eGet(eClass.getEStructuralFeature('language'))).toBe('json')

    widget.eSet(eClass.getEStructuralFeature('rows'), 20)
    expect(widget.rows).toBe(20)

    // geerbtes Feature: der Composer setzt widget.feature bei der Expansion
    const fakeFeature = { getName: () => 'description' }
    widget.feature = fakeFeature
    expect(widget.feature).toBe(fakeFeature)

    // EObject-API bleibt erreichbar
    expect(widget.eClass().getName()).toBe('CodeWidget')
  })

  it('Overlay-XMI der Settings-Page laedt genew-Widgets als echte Prototypen', async () => {
    // Kompletter Weg: Settings-Regel → XMI → Registry-Ladepfad. Bricht,
    // wenn die genew-Namespace-Deklaration oder die Paket-Registrierung fehlt.
    const xmi = rulesToOverlayXmi([
      { featureName: 'description', eTypeName: 'EString', widget: 'code' }
    ])
    const [overlay] = await loadUiModelXmi(xmi, 'test-overlay.uimodel.xmi', ['UIModelOverlay'])
    expect(overlay).toBeTruthy()

    const templates = [...((overlay as any).templates ?? [])]
    expect(templates).toHaveLength(1)
    expect(templates[0].eClass().getName()).toBe('CodeWidget')
    expect(templates[0].eClass().getEPackage().getNsURI()).toBe(GENE_WIDGETS_NS_URI)

    // Der Case referenziert den Prototyp (widgetPrototypeFor des Composers)
    const cases = [...((overlay as any).cases ?? [])]
    expect(cases).toHaveLength(1)
    expect(cases[0].widget.eClass().getName()).toBe('CodeWidget')
  })

  it('isGeneStringWidget erkennt nur die gene-Widgets', () => {
    expect(isGeneStringWidget('CodeWidget')).toBe(true)
    expect(isGeneStringWidget('MarkdownWidget')).toBe(true)
    expect(isGeneStringWidget('RichTextWidget')).toBe(true)
    expect(isGeneStringWidget('TextAreaWidget')).toBe(false)
    expect(isGeneStringWidget(undefined)).toBe(false)
  })
})
