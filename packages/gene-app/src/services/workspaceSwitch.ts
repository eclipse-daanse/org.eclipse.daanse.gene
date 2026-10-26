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
  /** Name of the loaded workspace, for the question */
  name: string
  /** Asks what to do with the changes */
  ask(name: string): Promise<LeaveChoice>
  /** Writes the loaded workspace to its file */
  save(): Promise<void>
}

/**
 * Decides whether the next workspace may be opened. True means go on;
 * false means stay - the user cancelled, or saving failed.
 */
export async function mayLeaveWorkspace(current: WorkspaceLeaving): Promise<boolean> {
  if (!current.loaded || !current.dirty) return true
  const choice = await current.ask(current.name)
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
