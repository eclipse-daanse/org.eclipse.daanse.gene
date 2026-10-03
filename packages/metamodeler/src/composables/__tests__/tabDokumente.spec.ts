/**
 * Ein Metamodell je Tab — und es überlebt den Wechsel.
 *
 * Der Editor-Bereich baut die Tab-Komponente bei jedem Wechsel neu auf. Die
 * Instanz liegt deshalb an der Tab-Id und nicht in der Komponente; sonst wäre
 * beim Zurückwechseln das geladene Modell weg.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  tabIdFuer,
  metamodelerFuerTab,
  tabIstGeladen,
  tabGeschlossen,
  tabIstGeaendert,
  offeneTabIds
} from '../tabDokumente'

afterEach(() => {
  for (const id of offeneTabIds()) tabGeschlossen(id)
})

describe('Metamodelle je Tab', () => {
  it('leitet die Tab-Id aus der Datei ab — eine Datei, ein Tab', () => {
    expect(tabIdFuer('model/shop.ecore')).toBe(tabIdFuer('model/shop.ecore'))
    expect(tabIdFuer('model/shop.ecore')).not.toBe(tabIdFuer('model/lager.ecore'))
  })

  it('gibt beim Wiederaufbau dieselbe Instanz zurueck', () => {
    const id = tabIdFuer('model/shop.ecore')
    const beimErstenMal = metamodelerFuerTab(id)
    beimErstenMal.filePath.value = 'model/shop.ecore'

    // Tab-Wechsel und zurueck: die Komponente wird neu aufgebaut
    const beimZweitenMal = metamodelerFuerTab(id)
    expect(beimZweitenMal).toBe(beimErstenMal)
    expect(beimZweitenMal.filePath.value).toBe('model/shop.ecore')
  })

  it('haelt zwei Dateien auseinander', () => {
    const shop = metamodelerFuerTab(tabIdFuer('model/shop.ecore'))
    const lager = metamodelerFuerTab(tabIdFuer('model/lager.ecore'))
    shop.dirty.value = true

    expect(lager.dirty.value).toBe(false)
    expect(tabIstGeaendert(tabIdFuer('model/shop.ecore'))).toBe(true)
    expect(tabIstGeaendert(tabIdFuer('model/lager.ecore'))).toBe(false)
  })

  it('sagt, ob ein Tab schon geladen ist — sonst wuerde erneut geparst', () => {
    const id = tabIdFuer('model/shop.ecore')
    metamodelerFuerTab(id)
    expect(tabIstGeladen(id)).toBe(false)
  })

  it('vergisst den Tab beim Schliessen', () => {
    const id = tabIdFuer('model/shop.ecore')
    const vorher = metamodelerFuerTab(id)
    vorher.filePath.value = 'model/shop.ecore'

    tabGeschlossen(id)
    expect(offeneTabIds()).not.toContain(id)
    // Danach ist es ein neuer, leerer Tab
    expect(metamodelerFuerTab(id).filePath.value).toBeNull()
  })
})
