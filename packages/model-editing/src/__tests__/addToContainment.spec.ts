/**
 * Einhaengen und nachlesen (#148).
 *
 * `eGet` ist bei den mitgelieferten Ecore-Klassen nicht durchgaengig
 * implementiert — eine EAnnotation liefert fuer `eAnnotations` nichts zurueck,
 * obwohl `getEAnnotations()` die Liste hat. Ohne den Getter nach
 * EMF-Namenskonvention landete das Element nirgends, und `addToContainment`
 * meldete trotzdem Erfolg. Beim Ausschneiden waere es damit verschwunden: Aus
 * dem alten Container geloest, im neuen nie angekommen.
 */
import { describe, it, expect } from 'vitest'
import { addToContainment } from '../containment'
import type { EObject, EReference } from '@emfts/core'

/** Referenz-Attrappe: nur der Name zaehlt fuer den Getter-Weg. */
function fakeRef(name: string): EReference {
  return { getName: () => name } as unknown as EReference
}

/** Listen-Attrappe mit der EList-Oberflaeche, die addToContainment nutzt. */
function fakeList() {
  const werte: unknown[] = []
  return {
    werte,
    add: (v: unknown) => { werte.push(v) },
    contains: (v: unknown) => werte.includes(v)
  }
}

const element = { id: 'element' } as unknown as EObject

describe('addToContainment', () => {
  it('haengt in die Liste ein, die eGet liefert', () => {
    const liste = fakeList()
    const ziel = { eGet: () => liste, eSet: () => undefined } as unknown as EObject
    expect(addToContainment(element, ziel, fakeRef('feature'))).toBe(true)
    expect(liste.werte).toEqual([element])
  })

  it('findet die Liste auch ueber den Getter, wenn eGet nichts liefert', () => {
    const liste = fakeList()
    // So verhaelt sich eine EAnnotation: eGet leer, getEAnnotations() hat die Liste
    const ziel = {
      eGet: () => null,
      eSet: () => undefined,
      getEAnnotations: () => liste
    } as unknown as EObject
    expect(addToContainment(element, ziel, fakeRef('eAnnotations'))).toBe(true)
    expect(liste.werte).toEqual([element])
  })

  it('meldet keinen Erfolg, wenn das Element nicht ankommt', () => {
    // eSet bleibt wirkungslos, und nachlesen laesst sich nichts
    const ziel = { eGet: () => null, eSet: () => undefined } as unknown as EObject
    expect(addToContainment(element, ziel, fakeRef('feature'))).toBe(false)
  })

  it('eine einwertige Referenz wird ueber eSet belegt', () => {
    let gesetzt: unknown = null
    const ziel = {
      eGet: () => gesetzt,
      eSet: (_ref: unknown, v: unknown) => { gesetzt = v }
    } as unknown as EObject
    expect(addToContainment(element, ziel, fakeRef('main'))).toBe(true)
    expect(gesetzt).toBe(element)
  })
})
