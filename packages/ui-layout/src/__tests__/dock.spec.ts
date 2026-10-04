/**
 * The frame has dock zones; what is shown in them belongs to the tab in front.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useLayoutState } from '../composables/useLayoutState'

describe('Dock zones', () => {
  let layout: ReturnType<typeof useLayoutState>

  beforeEach(() => {
    layout = useLayoutState()
    layout.clearAll()
    layout.undock('primary-bottom')
    layout.undock('secondary')
  })

  it('are empty until a tab docks something', () => {
    expect(layout.state.docks['primary-bottom']).toBeNull()
    expect(layout.state.docks.secondary).toBeNull()
  })

  it('show what the tab docked, with a way back', () => {
    let takenBack = false
    layout.dock('primary-bottom', { title: 'Instanzen', icon: 'pi pi-sitemap', undock: () => { takenBack = true } })

    expect(layout.state.docks['primary-bottom']?.title).toBe('Instanzen')
    layout.state.docks['primary-bottom']?.undock()
    expect(takenBack).toBe(true)
  })

  it('open the right side for a docked pane and close it again when nothing is left', () => {
    layout.setSecondarySidebarVisible(false)
    layout.dock('secondary', { title: 'Modelle', undock: () => {} })
    expect(layout.state.visibility.secondarySidebar).toBe(true)

    layout.undock('secondary')
    expect(layout.state.docks.secondary).toBeNull()
    expect(layout.state.visibility.secondarySidebar).toBe(false)
  })

  it('know where docked content goes once the sidebar reports its host', () => {
    expect(layout.dockHost('primary-bottom')).toBeNull()
    const host = document.createElement('div')
    layout.setDockHost('primary-bottom', host)
    expect(layout.dockHost('primary-bottom')).toBe(host)
    layout.setDockHost('primary-bottom', null)
    expect(layout.dockHost('primary-bottom')).toBeNull()
  })

  it('replace an earlier dock in the same zone', () => {
    layout.dock('primary-bottom', { title: 'A', undock: () => {} })
    layout.dock('primary-bottom', { title: 'B', undock: () => {} })
    expect(layout.state.docks['primary-bottom']?.title).toBe('B')
  })
})
