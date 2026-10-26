/**
 * "Editor wird geladen" while a file opens in an editor.
 *
 * Taken over from the CWM editor for the instance and the model editor. The
 * work blocks the page, so the overlay must be up before it starts, stay
 * until the tab has drawn, outlast nested opens and never get stuck.
 */
import { describe, it, expect } from 'vitest'
import { createEditorLoading } from '../services/editorLoading'

/** Frames that resolve at once, counted */
function frames() {
  const counter = { count: 0 }
  return { counter, frame: async () => { counter.count++ } }
}

describe('editor loading overlay', () => {
  it('is up with the file name before the work starts, and down after', async () => {
    const { counter, frame } = frames()
    const loading = createEditorLoading(frame)
    let seen: { active: boolean; name: string; framesBefore: number } | null = null

    const result = await loading.run('university-instance.xmi', async () => {
      seen = { active: loading.active.value, name: loading.name.value, framesBefore: counter.count }
      return 42
    })

    expect(result).toBe(42)
    expect(seen).toEqual({ active: true, name: 'university-instance.xmi', framesBefore: 2 })
    // One more frame after the work, so the tab has drawn
    expect(counter.count).toBe(3)
    expect(loading.active.value).toBe(false)
  })

  it('stays up until the outermost of nested opens is done', async () => {
    const { frame } = frames()
    const loading = createEditorLoading(frame)
    const states: boolean[] = []

    await loading.run('outer.xmi', async () => {
      await loading.run('referenced.xmi', async () => {})
      states.push(loading.active.value)
    })

    expect(states).toEqual([true])
    expect(loading.active.value).toBe(false)
  })

  it('goes away when opening fails', async () => {
    const { frame } = frames()
    const loading = createEditorLoading(frame)

    await expect(loading.run('broken.xmi', async () => { throw new Error('parse error') })).rejects.toThrow('parse error')

    expect(loading.active.value).toBe(false)
  })
})
