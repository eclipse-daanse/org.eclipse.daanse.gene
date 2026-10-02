/**
 * The collector between the service registry and the editor registry.
 *
 * What is tested here is the seam, not the loader: that the declaration is on
 * the class (otherwise the loader would never look at it), and that what the
 * collector is handed shows up among the views - without swallowing one that
 * was registered by hand.
 */
import { describe, it, expect, beforeEach } from 'vitest'
/*
 * The metadata readers are not on the package's main entry - the declaration is
 * the loader's business, and only a test has reason to look at it.
 */
import { isComponent, getInjectAllMetadata, getActivateMethod } from '@eclipse-daanse/tsm/decorators'
import { EDITOR_ART, type EditorArt } from 'gene-contracts'
import { EditorArtCollector } from '../context/editorArtCollector'
import {
  alleEditorArten,
  registerEditorArt,
  unregisterEditorArt,
  setEditorArtenAusDiensten,
  editorFuer
} from '../context/editorRegistry'

const EORM: EditorArt = {
  id: 'eorm',
  name: 'eorm-Mapping',
  extensions: [],
  nsURIs: ['https://eclipse.org/fennec/persistence/eorm/1.0.0']
}

const INSTANCE: EditorArt = { id: 'instance', name: 'Instanz-Editor', extensions: ['.xmi'], priority: 10 }

beforeEach(() => {
  setEditorArtenAusDiensten([])
  for (const art of alleEditorArten()) unregisterEditorArt(art.id)
})

describe('The declaration', () => {
  it('marks the class as a component, so the loader runs it', () => {
    expect(isComponent(EditorArtCollector)).toBe(true)
    // Without an activate method nothing would build a collector: nobody
    // resolves it, and a delayed component is built on resolution
    expect(getActivateMethod(EditorArtCollector)).toBe('start')
  })

  it('collects every provider of the editor art service', () => {
    const [collection] = getInjectAllMetadata(EditorArtCollector)
    expect(collection?.serviceId).toBe(EDITOR_ART)
    expect(collection?.propertyKey).toBe('arts')
  })
})

describe('What the collector is handed', () => {
  it('becomes the views the registry answers with', () => {
    const collector = new EditorArtCollector()
    collector.arts = [EORM, INSTANCE]

    expect(alleEditorArten().map((a) => a.id).sort()).toEqual(['eorm', 'instance'])
    expect(editorFuer('a/history.xmi')?.id).toBe('instance')
  })

  it('leaves a view registered by hand alone', () => {
    const collector = new EditorArtCollector()
    collector.arts = [INSTANCE]
    registerEditorArt({ id: 'xmi', name: 'Rohes XMI', extensions: ['.xmi'], priority: 1 })

    expect(alleEditorArten().map((a) => a.id).sort()).toEqual(['instance', 'xmi'])
    // A later collection does not drop it
    collector.arts = [INSTANCE, EORM]
    expect(alleEditorArten().map((a) => a.id)).toContain('xmi')
  })

  it('lets a hand-registered view win over a service of the same id', () => {
    const collector = new EditorArtCollector()
    collector.arts = [INSTANCE]
    registerEditorArt({ ...INSTANCE, name: 'Eigener Instanz-Editor' })

    const found = alleEditorArten().filter((a) => a.id === 'instance')
    expect(found).toHaveLength(1)
    expect(found[0]?.name).toBe('Eigener Instanz-Editor')
  })

  it('gives everything back when the collector stops', () => {
    const collector = new EditorArtCollector()
    collector.arts = [INSTANCE, EORM]
    collector.stop()

    expect(alleEditorArten()).toHaveLength(0)
  })
})
