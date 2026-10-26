/**
 * Opening another workspace while the loaded one has unsaved changes.
 * They used to be lost without a word.
 */
import { describe, it, expect, vi } from 'vitest'
import { mayLeaveWorkspace, type LeaveChoice } from '../services/workspaceSwitch'

function leaving(over: Partial<{ loaded: boolean; dirty: boolean; choice: LeaveChoice; saveFails: boolean }> = {}) {
  const ask = vi.fn(async () => over.choice ?? 'cancel')
  const save = vi.fn(async () => { if (over.saveFails) throw new Error('disk full') })
  return { loaded: over.loaded ?? true, dirty: over.dirty ?? true, name: 'uni', ask, save }
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
    expect(current.ask).toHaveBeenCalledWith('uni')
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
