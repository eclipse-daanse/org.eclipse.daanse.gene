/**
 * Negativfall der Vererbungs-Pruefung (Plan 10.1).
 *
 * Eigene Datei, weil `registerGeneWidgetsPackage()` memoisiert und die
 * EPackageRegistry ein Singleton ist — hier laeuft die Registrierung OHNE
 * vorher registriertes uimodel-Paket, die eSuperTypes-hrefs koennen also
 * nicht aufloesen.
 *
 * Genau dieser Fall war mit der frueheren "Supertyp-Reparatur" nicht
 * pruefbar: sie griff nie und haette im Ernstfall still nichts getan.
 */
import { describe, it, expect, vi } from 'vitest'
import { EPackageRegistry } from '@emfts/core'
import { registerGeneWidgetsPackage, GENE_WIDGETS_NS_URI } from '../geneWidgetsPackage'

describe('geneWidgetsPackage — Reihenfolge beim Start', () => {
  it('registriert NICHT, wenn das uimodel-Paket fehlt, und sagt warum', async () => {
    expect(EPackageRegistry.INSTANCE.getEPackage('http://uimodel/1.0')).toBeFalsy()
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.join(' '))
    })

    const pkg = await registerGeneWidgetsPackage()
    spy.mockRestore()

    // Kein halb funktionsfaehiges Paket in der Registry
    expect(pkg).toBeNull()
    expect(EPackageRegistry.INSTANCE.getEPackage(GENE_WIDGETS_NS_URI)).toBeFalsy()

    // Die Meldung nennt Ursache und Abhilfe
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.join('\n')).toMatch(/eSuperTypes nicht aufgeloest/)
    expect(errors.join('\n')).toMatch(/uimodel-Paket muss VOR/)
  })
})
