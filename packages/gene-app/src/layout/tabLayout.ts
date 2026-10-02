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

/** The little this needs from the frame. `null` clears a zone. */
export interface LayoutFrame {
  selectPanel(panelId: string | null, area: 'primary' | 'primary-bottom' | 'secondary' | 'panel'): void
  setSecondarySidebarVisible?(visible: boolean): void
}

export interface TabLayoutService {
  /** Remembers which view carries a tab. Called when the tab is opened. */
  bindTab(tabId: string, editorId: string): void
  /** Forgets a closed tab. */
  releaseTab(tabId: string): void
  /**
   * The tab came forward: select the panels its view declared - and clear the
   * zones it did not, so nothing of the previous tab is left standing.
   *
   * Without a tab, or with one no view claimed (the workspace preview), every
   * zone that belongs to a file is cleared.
   */
  activateTab(tabId: string | null | undefined): void
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

    activateTab(tabId: string | null | undefined): void {
      const editorId = tabId === null || tabId === undefined ? undefined : editorIdByTab.get(tabId)
      const panels = editorId === undefined ? undefined : editorArtById(editorId)?.panels

      // Null rather than "leave it": what the previous tab showed is not this
      // tab's, and a stale tree is worse than an empty zone
      frame.selectPanel(panels?.tree ?? null, 'primary-bottom')

      const secondary = panels?.secondary?.[0] ?? null
      frame.selectPanel(secondary, 'secondary')
      if (!secondary) frame.setSecondarySidebarVisible?.(false)
      else frame.setSecondarySidebarVisible?.(true)

      const bottom = panels?.bottom?.[0]
      if (bottom) frame.selectPanel(bottom, 'panel')
    }
  }
}
