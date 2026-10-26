/**
 * Opening another workspace while the loaded one has unsaved changes.
 * They used to be lost without a word.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  mayLeaveWorkspace, unloadWorkspace, workspaceTabs, type LeaveChoice, type OpenTab
} from '../services/workspaceSwitch'

function leaving(over: Partial<{
  loaded: boolean; dirty: boolean; unsavedFiles: string[]; choice: LeaveChoice; saveFails: boolean
}> = {}) {
  const ask = vi.fn(async (_name: string, _files: string[]) => over.choice ?? 'cancel')
  const save = vi.fn(async () => { if (over.saveFails) throw new Error('disk full') })
  return {
    loaded: over.loaded ?? true, dirty: over.dirty ?? true, unsavedFiles: over.unsavedFiles,
    name: 'uni', ask, save
  }
}

describe('leaving a workspace', () => {
  it('nothing to lose: goes on without asking', async () => {
    const clean = leaving({ dirty: false })
    expect(await mayLeaveWorkspace(clean)).toBe(true)
    expect(clean.ask).not.toHaveBeenCalled()

    const none = leaving({ loaded: false })
    expect(await mayLeaveWorkspace(none)).toBe(true)
    expect(none.ask).not.toHaveBeenCalled()
  })

  it('unsaved changes: asks, naming the workspace', async () => {
    const current = leaving({ choice: 'cancel' })
    await mayLeaveWorkspace(current)
    expect(current.ask).toHaveBeenCalledWith('uni', [])
  })

  it('cancel stays, and saves nothing', async () => {
    const current = leaving({ choice: 'cancel' })
    expect(await mayLeaveWorkspace(current)).toBe(false)
    expect(current.save).not.toHaveBeenCalled()
  })

  it('discard goes on without saving', async () => {
    const current = leaving({ choice: 'discard' })
    expect(await mayLeaveWorkspace(current)).toBe(true)
    expect(current.save).not.toHaveBeenCalled()
  })

  it('save writes first, then goes on', async () => {
    const current = leaving({ choice: 'save' })
    expect(await mayLeaveWorkspace(current)).toBe(true)
    expect(current.save).toHaveBeenCalledOnce()
  })

  it('if saving fails it stays - the changes are not thrown away', async () => {
    const current = leaving({ choice: 'save', saveFails: true })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await mayLeaveWorkspace(current)).toBe(false)
    error.mockRestore()
  })
})

describe('unsaved files of the workspace', () => {
  it('a changed file alone is reason to ask - and is named', async () => {
    const current = leaving({ dirty: false, unsavedFiles: ['university-instance.xmi'], choice: 'cancel' })
    expect(await mayLeaveWorkspace(current)).toBe(false)
    expect(current.ask).toHaveBeenCalledWith('uni', ['university-instance.xmi'])
  })
})

describe('which tabs go with the workspace', () => {
  const tabs: OpenTab[] = [
    { id: 'instance:uni/university-instance.xmi', title: 'university-instance.xmi' },
    { id: 'metamodel:uni/university.ecore', title: 'university.ecore' },
    { id: 'workspace-preview', title: 'uni.wsp' },
    { id: 'model-atlas', title: 'Model Atlas' },
    { id: 'pinned-file', title: 'fest', closable: false },
  ]
  const fileTabs = new Set(['instance:uni/university-instance.xmi', 'metamodel:uni/university.ecore', 'workspace-preview', 'pinned-file'])

  it('the files close; panels, the workspace preview and fixed tabs stay', () => {
    const closing = workspaceTabs(tabs, (id) => fileTabs.has(id)).map((tab) => tab.id)
    expect(closing).toEqual(['instance:uni/university-instance.xmi', 'metamodel:uni/university.ecore'])
  })
})

describe('unloading the workspace', () => {
  function parts(failing?: string) {
    const calls: string[] = []
    const step = (name: string) => vi.fn((..._args: unknown[]) => {
      calls.push(name)
      if (name === failing) throw new Error(`${name} broke`)
    })
    return {
      calls,
      tabIds: ['instance:a.xmi', 'metamodel:b.ecore'],
      closeTab: step('tab'),
      clearInstances: step('instances'),
      unloadModels: step('models'),
      resetOcl: step('ocl'),
      disconnectAtlas: step('atlas'),
    }
  }

  it('closes the tabs, then unloads instances, models, OCL and Atlas connections', () => {
    const p = parts()
    unloadWorkspace(p)
    expect(p.closeTab).toHaveBeenCalledWith('instance:a.xmi')
    expect(p.closeTab).toHaveBeenCalledWith('metamodel:b.ecore')
    expect(p.calls).toEqual(['tab', 'tab', 'instances', 'models', 'ocl', 'atlas'])
  })

  it('one part failing does not keep the others loaded', () => {
    const p = parts('models')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    unloadWorkspace(p)
    error.mockRestore()
    expect(p.resetOcl).toHaveBeenCalledOnce()
    expect(p.disconnectAtlas).toHaveBeenCalledOnce()
  })
})
