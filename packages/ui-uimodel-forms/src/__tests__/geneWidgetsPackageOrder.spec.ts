/**
 * Selbstgenuegsamkeit der Registrierung (Plan 10.1).
 *
 * Eigene Datei, weil `registerGeneWidgetsPackage()` memoisiert und die
 * EPackageRegistry ein Singleton ist: hier laeuft die Registrierung OHNE
 * jedes Setup — kein vorher registriertes uimodel-Paket, kein Bootstrap.
 *
 * Das ist der Ersatz fuer die frueheren Konstrukte an dieser Stelle: erst
 * eine "Supertyp-Reparatur" (griff nie), dann eine Laufzeit-Pruefung der
 * Startreihenfolge (pruefte eine Bedingung, die gene selbst garantiert).
 * Stattdessen stellt das Modul seine Voraussetzung selbst her — dann gibt
 * es keine Reihenfolge, die man verletzen kann, und genau das haelt dieser
 * Test fest.
 */
import { describe, it, expect } from 'vitest'
import { EPackageRegistry } from '@emfts/core'
import { registerGeneWidgetsPackage, GENE_WIDGETS_NS_URI } from '../geneWidgetsPackage'

describe('geneWidgetsPackage — ohne Setup', () => {
  it('registriert sich selbst, auch wenn das uimodel-Paket noch fehlt', async () => {
    // Ausgangslage: leere Registry (kein main.ts-Bootstrap gelaufen)
    expect(EPackageRegistry.INSTANCE.getEPackage('http://uimodel/1.0')).toBeFalsy()

    const pkg = await registerGeneWidgetsPackage()

    expect(pkg).toBeTruthy()
    expect(EPackageRegistry.INSTANCE.getEPackage(GENE_WIDGETS_NS_URI)).toBe(pkg)
    // das uimodel-Paket wurde dabei mit registriert
    expect(EPackageRegistry.INSTANCE.getEPackage('http://uimodel/1.0')).toBeTruthy()
  })

  it('die genew-Klassen erben trotzdem von WidgetComponent', async () => {
    const pkg = await registerGeneWidgetsPackage() as {
      getEClassifier: (n: string) => any
    } | null
    expect(pkg).toBeTruthy()
    for (const name of ['CodeWidget', 'MarkdownWidget', 'RichTextWidget']) {
      const eClass = pkg!.getEClassifier(name)
      expect([...eClass.getESuperTypes()].map((s: any) => s.getName?.()), name)
        .toContain('WidgetComponent')
      // geerbte Features erreichbar — wirft, wenn der Supertyp ein Proxy waere
      expect(eClass.getEStructuralFeature('feature'), `${name}.feature`).toBeTruthy()
    }
  })
})
