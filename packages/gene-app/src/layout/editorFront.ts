/**
 * Which tab is in front, and which view carries it.
 *
 * For the few things that act on "the open file" rather than on a panel: the
 * menu bar, search, save, validate, "click a problem - show the object". They
 * are commands and ask here. Panels never do - a panel belongs to its tab and
 * gets its context from it; nothing it shows depends on what lies in front.
 *
 * That line is the whole point. The previous design let panels ask "who is in
 * front?" and switch a shared context on the answer, and whenever the switch
 * came late one tab's content stood in another's panel.
 *
 * Knows neither the layout nor the registry: the lookup from a view's id to its
 * declaration is handed in.
 */
import type { EditorArt } from 'gene-contracts'

export interface EditorFrontService {
  /** Remembers which view carries a tab. Called when the tab is opened. */
  bindTab(tabId: string, editorId: string): void
  /** Forgets a closed tab. */
  releaseTab(tabId: string): void
  /** The tab that came forward - or none. */
  setFrontTab(tabId: string | null | undefined): void
  /** The tab in front, if any. */
  frontTabId(): string | null
  /** Which view carries this tab, if any. */
  editorIdOf(tabId: string): string | undefined
  /** The view carrying the tab in front, if any. */
  frontArt(): EditorArt | undefined
}

export interface EditorFrontOptions {
  /** Resolves a view by its id - the editor registry, from wherever it lives. */
  editorArtById: (editorId: string) => EditorArt | undefined
}

export function createEditorFront({ editorArtById }: EditorFrontOptions): EditorFrontService {
  const editorIdByTab = new Map<string, string>()
  let front: string | null = null

  return {
    bindTab(tabId, editorId) {
      editorIdByTab.set(tabId, editorId)
    },

    releaseTab(tabId) {
      editorIdByTab.delete(tabId)
      if (front === tabId) front = null
    },

    setFrontTab(tabId) {
      front = tabId ?? null
    },

    frontTabId() {
      return front
    },

    editorIdOf(tabId) {
      return editorIdByTab.get(tabId)
    },

    frontArt() {
      const editorId = front === null ? undefined : editorIdByTab.get(front)
      return editorId === undefined ? undefined : editorArtById(editorId)
    }
  }
}
