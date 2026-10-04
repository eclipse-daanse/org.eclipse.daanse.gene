/**
 * A tab can be reordered within the strip - and only there.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutState } from '../composables/useLayoutState'

const Leer = { render: () => null }

describe('Editor tab order', () => {
  let layout: ReturnType<typeof useLayoutState>

  beforeEach(() => {
    layout = useLayoutState()
    layout.clearAll()
    for (const id of ['a', 'b', 'c']) layout.openEditor({ id, title: id, component: Leer })
  })

  const order = () => layout.state.editorTabs.map(t => t.id)

  it('moves a tab forward; the index counts the strip without it', () => {
    layout.moveEditorTab('a', 2)
    expect(order()).toEqual(['b', 'c', 'a'])
  })

  it('moves a tab back', () => {
    layout.moveEditorTab('c', 0)
    expect(order()).toEqual(['c', 'a', 'b'])
  })

  it('clamps to the ends and ignores unknown tabs', () => {
    layout.moveEditorTab('b', 99)
    expect(order()).toEqual(['a', 'c', 'b'])
    layout.moveEditorTab('x', 0)
    expect(order()).toEqual(['a', 'c', 'b'])
  })

  it('keeps the front tab in front', () => {
    layout.selectEditor('b')
    layout.moveEditorTab('b', 0)
    expect(layout.state.activeEditorTabId).toBe('b')
  })
})
