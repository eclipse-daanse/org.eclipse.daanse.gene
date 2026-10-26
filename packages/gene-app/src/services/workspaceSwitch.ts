/**
 * Leaving a workspace with unsaved changes.
 *
 * Opening a workspace replaces the configuration in memory - the instance
 * files added, the editor choices, the layout of the one before. Unsaved
 * changes went without a word. Now they are asked about first: save, discard
 * or stay.
 */

export type LeaveChoice = 'save' | 'discard' | 'cancel'

export interface WorkspaceLeaving {
  /** Whether a workspace is loaded at all */
  loaded: boolean
  /** Whether it has unsaved changes */
  dirty: boolean
  /** Open files with unsaved changes - they close with the workspace */
  unsavedFiles?: string[]
  /** Name of the loaded workspace, for the question */
  name: string
  /** Asks what to do with the changes */
  ask(name: string, unsavedFiles: string[]): Promise<LeaveChoice>
  /** Writes the loaded workspace to its file */
  save(): Promise<void>
}

/**
 * Decides whether the next workspace may be opened. True means go on;
 * false means stay - the user cancelled, or saving failed.
 */
export async function mayLeaveWorkspace(current: WorkspaceLeaving): Promise<boolean> {
  const unsavedFiles = current.unsavedFiles ?? []
  if (!current.loaded || (!current.dirty && unsavedFiles.length === 0)) return true
  const choice = await current.ask(current.name, unsavedFiles)
  if (choice === 'cancel') return false
  if (choice === 'discard') return true
  try {
    await current.save()
    return true
  } catch (e) {
    console.error('[Workspace] Saving before the switch failed - staying:', e)
    return false
  }
}

/** An open editor tab, as far as the switch is concerned. */
export interface OpenTab {
  id: string
  title: string
  dirty?: boolean
  closable?: boolean
}

/** The tab showing the workspace file itself - it stays, the next one reuses it. */
export const WORKSPACE_PREVIEW_TAB = 'workspace-preview'

/**
 * The tabs that belong to the loaded workspace: everything showing one of its
 * files. Panels (Model Atlas and the like) and the workspace preview stay.
 */
export function workspaceTabs(tabs: OpenTab[], isFileTab: (tabId: string) => boolean): OpenTab[] {
  return tabs.filter((tab) =>
    tab.closable !== false && tab.id !== WORKSPACE_PREVIEW_TAB && isFileTab(tab.id))
}

/** What the loaded workspace leaves behind, and how to get rid of each part. */
export interface WorkspaceUnloading {
  /** Tab ids to close - see workspaceTabs() */
  tabIds: string[]
  closeTab(tabId: string): void
  /** Metamodels from the registries and the Ecore resource set */
  unloadModels(): void
  /** OCL packages, constraints, C-OCL sets and issues */
  resetOcl(): void
  /** Connections to Atlas servers */
  disconnectAtlas(): void
  /** The instance tree's shared resource */
  clearInstances(): void
}

/**
 * Unloads the workspace before the next one opens. Before, its models,
 * constraints, tabs and connections stayed and mixed with the next one.
 * Each part on its own: one failing must not keep the others loaded.
 */
export function unloadWorkspace(parts: WorkspaceUnloading): void {
  const steps: Array<[string, () => void]> = [
    ['tabs', () => { for (const id of parts.tabIds) parts.closeTab(id) }],
    ['instances', parts.clearInstances],
    ['models', parts.unloadModels],
    ['ocl', parts.resetOcl],
    ['atlas', parts.disconnectAtlas],
  ]
  for (const [name, step] of steps) {
    try {
      step()
    } catch (e) {
      console.error(`[Workspace] Unloading ${name} failed:`, e)
    }
  }
}
