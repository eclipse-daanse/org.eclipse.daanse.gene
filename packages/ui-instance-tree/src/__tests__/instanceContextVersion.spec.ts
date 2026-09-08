/**
 * Signal fuer die Properties-Ansicht (#148).
 *
 * Die Ansicht liest `version` aus dem Editor-Kontext, um nach einer Aenderung
 * am Modell neu zu lesen. Der Metamodell-Kontext gab sie durch, der
 * Instanz-Kontext nicht — deshalb blieb ein im Baum eingefuegtes Kind dort
 * unsichtbar, bis man die Auswahl wechselte. Das Feld ist im Interface
 * optional, ein Tippfehler wuerde also nicht auffallen: darum dieser Test.
 */
import { describe, it, expect } from 'vitest'
import { ref } from 'tsm:vue'
import { useInstanceTree } from '../composables/useInstanceTree'
import { createInstanceContext } from '../context/instanceContext'
import type { Resource } from '@emfts/core'

describe('Instanz-Kontext', () => {
  it('gibt die Modellversion durch', () => {
    const ctx = createInstanceContext()
    expect(ctx.version).toBeDefined()
    expect(typeof ctx.version!.value).toBe('number')
  })

  it('triggerUpdate zieht die Version hoch', () => {
    const ctx = createInstanceContext()
    const vorher = ctx.version!.value
    ctx.triggerUpdate!()
    expect(ctx.version!.value).toBe(vorher + 1)
  })

  it('das Composable gibt version heraus', () => {
    const tree = useInstanceTree(ref([] as Resource[]), ref(null))
    const vorher = tree.version.value
    tree.triggerUpdate()
    expect(tree.version.value).toBe(vorher + 1)
  })
})
