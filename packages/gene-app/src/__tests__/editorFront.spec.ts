/**
 * Commands ask which file is in front; panels never do.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { EditorArt } from 'gene-contracts'
import { createEditorFront, type EditorFrontService } from '../layout/editorFront'

const VIEWS: Record<string, EditorArt> = {
  instance: { id: 'instance', name: 'Instanz-Editor', extensions: ['.xmi'], replacesPerspective: 'model-editor' },
  metamodel: { id: 'metamodel', name: 'Metamodell-Editor', extensions: ['.ecore'], replacesPerspective: 'metamodeler' }
}

let front: EditorFrontService

beforeEach(() => {
  front = createEditorFront({ editorArtById: (id) => VIEWS[id] })
})

describe('The tab in front', () => {
  it('is known together with the view that carries it', () => {
    front.bindTab('instance:a.xmi', 'instance')
    front.bindTab('metamodel:b.ecore', 'metamodel')

    front.setFrontTab('metamodel:b.ecore')
    expect(front.frontTabId()).toBe('metamodel:b.ecore')
    expect(front.frontArt()?.replacesPerspective).toBe('metamodeler')

    front.setFrontTab('instance:a.xmi')
    expect(front.frontArt()?.id).toBe('instance')
  })

  it('has no view when nobody claimed the tab', () => {
    front.setFrontTab('workspace-preview')
    expect(front.frontTabId()).toBe('workspace-preview')
    expect(front.frontArt()).toBeUndefined()
  })

  it('is nobody when no tab is open', () => {
    front.bindTab('t', 'instance')
    front.setFrontTab('t')
    front.setFrontTab(null)
    expect(front.frontTabId()).toBeNull()
    expect(front.frontArt()).toBeUndefined()
  })
})

describe('A closed tab', () => {
  it('is forgotten, also as the one in front', () => {
    front.bindTab('t', 'instance')
    front.setFrontTab('t')
    front.releaseTab('t')

    expect(front.editorIdOf('t')).toBeUndefined()
    expect(front.frontTabId()).toBeNull()
    expect(front.frontArt()).toBeUndefined()
  })
})
