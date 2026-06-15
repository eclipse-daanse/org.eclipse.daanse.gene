import { describe, it, expect, vi } from 'vitest'
import { PerspectiveManagerImpl } from '../PerspectiveRegistry'

function makeManager() {
  const emit = vi.fn()
  const eventBus = { emit, on: vi.fn(), off: vi.fn() }
  const panelRegistry: any = { getForPerspective: () => [], register: vi.fn() }
  const activityRegistry: any = { register: vi.fn() }
  const mgr = new PerspectiveManagerImpl(panelRegistry, activityRegistry, eventBus)
  return { mgr, emit }
}

function perspective(over: Record<string, any> = {}) {
  return {
    id: 'metamodeler',
    name: 'Metamodeler',
    defaultLayout: { left: [], center: [], right: [], bottom: [] },
    defaultVisibility: { left: true, right: true, bottom: false },
    ...over
  } as any
}

describe('PerspectiveManagerImpl', () => {
  it('switchTo updates the current id and emits gene:menu-changed (so the MenuBar reloads)', async () => {
    const { mgr, emit } = makeManager()
    mgr.registry.register(perspective())

    await mgr.switchTo('metamodeler')

    expect(mgr.state.currentPerspectiveId).toBe('metamodeler')
    expect(emit).toHaveBeenCalledWith('gene:menu-changed')
  })

  it('setCurrentPerspectiveId also emits gene:menu-changed', () => {
    const { mgr, emit } = makeManager()
    mgr.registry.register(perspective())

    mgr.setCurrentPerspectiveId('metamodeler')

    expect(mgr.state.currentPerspectiveId).toBe('metamodeler')
    expect(emit).toHaveBeenCalledWith('gene:menu-changed')
  })

  it('does not switch nor emit when a workspace-only perspective is activated without a workspace', async () => {
    const { mgr, emit } = makeManager()
    mgr.registry.register(perspective({ requiresWorkspace: true }))

    await mgr.switchTo('metamodeler')

    expect(mgr.state.currentPerspectiveId).toBeNull()
    expect(emit).not.toHaveBeenCalled()
  })

  it('switches to a workspace-only perspective once a workspace is open', async () => {
    const { mgr, emit } = makeManager()
    mgr.registry.register(perspective({ requiresWorkspace: true }))

    mgr.setWorkspace({}, '/ws/Waterpark.wsp')
    await mgr.switchTo('metamodeler')

    expect(mgr.state.currentPerspectiveId).toBe('metamodeler')
    expect(emit).toHaveBeenCalledWith('gene:menu-changed')
  })

  it('ignores switchTo for an unknown perspective', async () => {
    const { mgr, emit } = makeManager()

    await mgr.switchTo('does-not-exist')

    expect(mgr.state.currentPerspectiveId).toBeNull()
    expect(emit).not.toHaveBeenCalled()
  })
})
