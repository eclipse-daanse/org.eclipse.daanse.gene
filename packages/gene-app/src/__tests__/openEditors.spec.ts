/**
 * The file tabs a workspace records when saved and reopens when opened.
 */
import { describe, it, expect, vi } from 'vitest'
import { collectOpenEditors, restoreOpenEditors } from '../services/openEditors'

describe('collecting the open file tabs', () => {
  const binding = {
    editorIdOf: (id: string) => ({ 'instance:a.xmi': 'instance', 'xml:b.ecore': 'xml' } as Record<string, string>)[id],
    filePathOf: (id: string) => ({ 'instance:a.xmi': 'a.xmi', 'xml:b.ecore': 'b.ecore' } as Record<string, string>)[id],
  }

  it('file tabs in tab order, with the one in front; panels and the workspace tab are left out', () => {
    const tabs = [{ id: 'workspace-preview' }, { id: 'instance:a.xmi' }, { id: 'model-atlas' }, { id: 'xml:b.ecore' }]
    expect(collectOpenEditors(tabs, 'xml:b.ecore', binding)).toEqual([
      { filePath: 'a.xmi', editorId: 'instance', active: false },
      { filePath: 'b.ecore', editorId: 'xml', active: true },
    ])
  })
})

describe('reopening them', () => {
  const states = [
    { filePath: 'a.xmi', editorId: 'instance', active: false },
    { filePath: 'gone.ecore', editorId: 'metamodel', active: false },
    { filePath: 'b.ecore', editorId: 'xml', active: true },
  ]

  it('opens each in its editor, skips what is open already, brings the front one forward', async () => {
    const io = {
      isOpen: vi.fn((s: { filePath: string }) => s.filePath === 'a.xmi'),
      open: vi.fn(async (s: { filePath: string }) => s.filePath !== 'gone.ecore'),
      activate: vi.fn(),
    }
    const failed = await restoreOpenEditors(states, io)
    expect(io.open).toHaveBeenCalledTimes(2)
    expect(io.open).not.toHaveBeenCalledWith(states[0])
    expect(failed).toEqual(['gone.ecore'])
    expect(io.activate).toHaveBeenCalledWith(states[2])
  })

  it('a file failing does not stop the others', async () => {
    const io = {
      isOpen: () => false,
      open: vi.fn(async (s: { filePath: string }) => {
        if (s.filePath === 'a.xmi') throw new Error('unreadable')
        return true
      }),
      activate: vi.fn(),
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failed = await restoreOpenEditors(states, io)
    warn.mockRestore()
    expect(io.open).toHaveBeenCalledTimes(3)
    expect(failed).toEqual(['a.xmi'])
  })
})
