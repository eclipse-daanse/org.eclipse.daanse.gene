/**
 * Ein Kontext je Tab.
 *
 * Die Tab-Leisten sind je Ansicht: im Metamodeler stehen die bearbeiteten
 * .ecore-Dateien, im Modell-Editor die Instanzen. Welcher Tab vorn liegt,
 * entscheidet deshalb je Modus, welchen Kontext die Panels bekommen —
 * Eigenschaften, Modell-Browser und Baum fragen alle `getCurrentContext()`.
 *
 * Solange niemand einen Tab anmeldet, bleibt es beim bisherigen Verhalten:
 * ein Kontext je Modus.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  setEditorMode,
  getCurrentContext,
  registerInstanceContextFactory,
  registerMetamodelContextFactory,
  registerTabContext,
  activateTabContext,
  releaseTabContext,
  type EditorContext
} from '../context/editorContext'

/** Ein Kontext, der nur seinen Namen kennt — mehr braucht der Test nicht. */
function kontext(mode: 'instance' | 'metamodel', name: string): EditorContext {
  return { mode, name } as unknown as EditorContext
}

const nameVon = (ctx: EditorContext | null) => (ctx as unknown as { name?: string })?.name ?? null

describe('Kontext je Tab', () => {
  beforeEach(() => {
    for (const id of ['mm:a', 'mm:b', 'inst:a']) releaseTabContext(id)
    registerInstanceContextFactory(() => kontext('instance', 'modus-instanz'))
    registerMetamodelContextFactory(() => kontext('metamodel', 'modus-metamodell'))
  })

  it('nimmt den Kontext des Modus, solange kein Tab angemeldet ist', () => {
    setEditorMode('metamodel')
    expect(nameVon(getCurrentContext())).toBe('modus-metamodell')
    setEditorMode('instance')
    expect(nameVon(getCurrentContext())).toBe('modus-instanz')
  })

  it('liefert den Kontext des Tabs, der vorn liegt', () => {
    setEditorMode('metamodel')
    registerTabContext('mm:a', kontext('metamodel', 'shop.ecore'))
    registerTabContext('mm:b', kontext('metamodel', 'lager.ecore'))
    // Zuletzt angemeldet liegt vorn
    expect(nameVon(getCurrentContext())).toBe('lager.ecore')

    activateTabContext('mm:a')
    expect(nameVon(getCurrentContext())).toBe('shop.ecore')
  })

  it('haelt die Ansichten auseinander — je Modus ein vorderer Tab', () => {
    registerTabContext('mm:a', kontext('metamodel', 'shop.ecore'))
    registerTabContext('inst:a', kontext('instance', 'bestellungen.xmi'))

    setEditorMode('metamodel')
    expect(nameVon(getCurrentContext())).toBe('shop.ecore')
    setEditorMode('instance')
    expect(nameVon(getCurrentContext())).toBe('bestellungen.xmi')
  })

  it('faellt beim Schliessen auf einen anderen Tab zurueck, sonst auf den Modus', () => {
    setEditorMode('metamodel')
    registerTabContext('mm:a', kontext('metamodel', 'shop.ecore'))
    registerTabContext('mm:b', kontext('metamodel', 'lager.ecore'))

    releaseTabContext('mm:b')
    expect(nameVon(getCurrentContext())).toBe('shop.ecore')

    releaseTabContext('mm:a')
    expect(nameVon(getCurrentContext())).toBe('modus-metamodell')
  })

  it('ignoriert einen Tab, den es nicht gibt', () => {
    setEditorMode('metamodel')
    registerTabContext('mm:a', kontext('metamodel', 'shop.ecore'))
    activateTabContext('mm:unbekannt')
    expect(nameVon(getCurrentContext())).toBe('shop.ecore')
  })
})
