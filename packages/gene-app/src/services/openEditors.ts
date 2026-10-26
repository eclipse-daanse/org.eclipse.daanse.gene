/**
 * The file tabs of a workspace: which files were open, in which editor, and
 * which one was in front.
 *
 * Saving records them, opening the workspace brings them back. Before, only
 * the instance files the workspace lists came back as tabs; a metamodel, a
 * constraint file or the XML view of a file were gone.
 */
import type { OpenEditorState } from '@/services/useEditorConfig'

export interface TabLike {
  id: string
}

export interface TabBinding {
  editorIdOf(tabId: string): string | undefined
  filePathOf(tabId: string): string | undefined
}

/** The open file tabs, in tab order. Panels and the workspace tab are no files. */
export function collectOpenEditors(tabs: TabLike[], activeTabId: string | null, binding: TabBinding): OpenEditorState[] {
  const states: OpenEditorState[] = []
  for (const tab of tabs) {
    const editorId = binding.editorIdOf(tab.id)
    const filePath = binding.filePathOf(tab.id)
    if (!editorId || !filePath) continue
    states.push({ filePath, editorId, active: tab.id === activeTabId })
  }
  return states
}

export interface EditorRestoring {
  /** Whether the file is already open in that editor - the workspace may have opened it */
  isOpen(state: OpenEditorState): boolean
  /** Opens the file in the editor; false if the file or the editor is gone */
  open(state: OpenEditorState): Promise<boolean>
  /** Brings the tab of the file to the front */
  activate(state: OpenEditorState): void
}

/**
 * Reopens the recorded tabs, one after the other, and brings the one in front
 * back to the front. A file that is gone is skipped - the others still open.
 * Returns the files that could not be opened.
 */
export async function restoreOpenEditors(states: OpenEditorState[], io: EditorRestoring): Promise<string[]> {
  const failed: string[] = []
  for (const state of states) {
    if (io.isOpen(state)) continue
    try {
      if (!(await io.open(state))) failed.push(state.filePath)
    } catch (e) {
      console.warn('[Workspace] Reopening failed:', state.filePath, e)
      failed.push(state.filePath)
    }
  }
  const active = states.find((state) => state.active && !failed.includes(state.filePath))
  if (active) io.activate(active)
  return failed
}
