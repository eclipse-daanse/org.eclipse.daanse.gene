/**
 * Which panels belong to the tab that is in front.
 *
 * The frame holds every panel a view could want, registered once. This picks
 * among them: a tab comes forward, and the tree on the lower left, the panel on
 * the right and the one at the bottom become the ones its view declared.
 *
 * It builds nothing and tears nothing down - that is the whole point. Rebuilding
 * the layout on every switch is what made the explorer disappear and left a
 * perspective active that the activity bar no longer showed.
 *
 * It knows neither the views nor the registry: the frame is handed in, and so is
 * the lookup from a view's id to its declaration. That keeps it testable without
 * a running application, and keeps the application free to resolve the view
 * however it likes.
 */
import type { EditorArt } from 'gene-contracts'

/** The little this needs from the frame. */
export interface LayoutFrame {
  selectPanel(panelId: string, area: 'primary' | 'primary-bottom' | 'secondary' | 'panel'): void
  setSecondarySidebarVisible?(visible: boolean): void
}

export interface TabLayoutService {
  /** Remembers which view carries a tab. Called when the tab is opened. */
  bindTab(tabId: string, editorId: string): void
  /** Forgets a closed tab. */
  releaseTab(tabId: string): void
  /** The tab came forward: select the panels its view declared. */
  activateTab(tabId: string): void
  /** Which view carries this tab, if any. */
  editorIdOf(tabId: string): string | undefined
}

export interface TabLayoutOptions {
  frame: LayoutFrame
  /** Resolves a view by its id - the editor registry, from wherever it lives. */
  editorArtById: (editorId: string) => EditorArt | undefined
}

export function createTabLayout({ frame, editorArtById }: TabLayoutOptions): TabLayoutService {
  const editorIdByTab = new Map<string, string>()

  return {
    bindTab(tabId: string, editorId: string): void {
      editorIdByTab.set(tabId, editorId)
    },

    releaseTab(tabId: string): void {
      editorIdByTab.delete(tabId)
    },

    editorIdOf(tabId: string): string | undefined {
      return editorIdByTab.get(tabId)
    },

    activateTab(tabId: string): void {
      const editorId = editorIdByTab.get(tabId)
      if (editorId === undefined) return

      const panels = editorArtById(editorId)?.panels
      if (!panels) return

      if (panels.tree) frame.selectPanel(panels.tree, 'primary-bottom')

      const [secondary] = panels.secondary ?? []
      if (secondary) {
        frame.selectPanel(secondary, 'secondary')
        frame.setSecondarySidebarVisible?.(true)
      }

      const [bottom] = panels.bottom ?? []
      if (bottom) frame.selectPanel(bottom, 'panel')
    }
  }
}
