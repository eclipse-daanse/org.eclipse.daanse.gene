/**
 * The tab decides what is visible, and nothing is rebuilt to make it so.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { EditorArt } from 'gene-contracts'
import { createTabLayout, type LayoutFrame, type TabLayoutService } from '../layout/tabLayout'

const VIEWS: Record<string, EditorArt> = {
  instance: {
    id: 'instance',
    name: 'Instanz-Editor',
    extensions: ['.xmi'],
    panels: { tree: 'instance-tree', secondary: ['model-browser'], bottom: ['ocl-problems'] }
  },
  metamodel: {
    id: 'metamodel',
    name: 'Metamodell-Editor',
    extensions: ['.ecore'],
    panels: { tree: 'metamodeler-tree', secondary: ['model-browser'] }
  },
  plain: { id: 'plain', name: 'Ohne Panels', extensions: ['.txt'] }
}

let selected: Array<[string, string | null]>
let secondaryShown: boolean[]
let frame: LayoutFrame
let tabs: TabLayoutService

beforeEach(() => {
  selected = []
  secondaryShown = []
  frame = {
    selectPanel: (panelId, area) => selected.push([area, panelId]),
    setSecondarySidebarVisible: (visible) => secondaryShown.push(visible)
  }
  tabs = createTabLayout({ frame, editorArtById: (id) => VIEWS[id] })
})

describe('A tab coming forward', () => {
  it('shows the tree of its own view', () => {
    tabs.bindTab('instance:a/daten.xmi', 'instance')
    tabs.bindTab('metamodel:a/modell.ecore', 'metamodel')

    tabs.activateTab('instance:a/daten.xmi')
    expect(selected).toContainEqual(['primary-bottom', 'instance-tree'])

    selected = []
    tabs.activateTab('metamodel:a/modell.ecore')
    expect(selected).toContainEqual(['primary-bottom', 'metamodeler-tree'])
    // and not the other one
    expect(selected).not.toContainEqual(['primary-bottom', 'instance-tree'])
  })

  it('brings its side panel out with it', () => {
    tabs.bindTab('t', 'instance')
    tabs.activateTab('t')

    expect(selected).toContainEqual(['secondary', 'model-browser'])
    expect(secondaryShown).toEqual([true])
    expect(selected).toContainEqual(['panel', 'ocl-problems'])
  })

  it('clears the zones its view did not claim', () => {
    tabs.bindTab('mit-baum', 'instance')
    tabs.bindTab('ohne', 'plain')

    tabs.activateTab('mit-baum')
    selected = []
    secondaryShown = []

    tabs.activateTab('ohne')
    // Nothing of the previous tab is left standing
    expect(selected).toContainEqual(['primary-bottom', null])
    expect(selected).toContainEqual(['secondary', null])
    expect(secondaryShown).toEqual([false])
  })

  it('clears everything for a tab nobody claimed', () => {
    tabs.bindTab('mit-baum', 'instance')
    tabs.activateTab('mit-baum')
    selected = []

    tabs.activateTab('fremder-tab')
    expect(selected).toContainEqual(['primary-bottom', null])
    expect(selected).toContainEqual(['secondary', null])
  })

  it('clears everything when no tab is in front', () => {
    tabs.bindTab('mit-baum', 'instance')
    tabs.activateTab('mit-baum')
    selected = []

    tabs.activateTab(null)
    expect(selected).toContainEqual(['primary-bottom', null])
    expect(selected).toContainEqual(['secondary', null])
  })
})

describe('A closed tab', () => {
  it('is forgotten, so its panels no longer follow', () => {
    tabs.bindTab('t', 'instance')
    tabs.releaseTab('t')

    expect(tabs.editorIdOf('t')).toBeUndefined()
    tabs.activateTab('t')
    expect(selected).toContainEqual(['primary-bottom', null])
  })
})
