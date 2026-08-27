/**
 * File Actions Registry
 *
 * Contribution point for plugin-provided actions on workspace files. Instead of
 * the explorer knowing every consumer, plugins register an action and declare
 * which files it applies to — e.g. a mapping editor registering itself for
 * `.xmi` files.
 *
 * Mirrors `gene.atlas.objectActions` in the Atlas Browser.
 */

import { ref } from 'tsm:vue'
import type { FileEntry } from './types'

export interface FileActionContext {
  entry: FileEntry
  /** File content, read by the explorer before invoking. */
  content: string
}

export interface FileAction {
  /** Stable id, used for replacing/unregistering. */
  id: string
  label: string
  /** PrimeIcons class, e.g. `pi pi-share-alt`. */
  icon?: string
  /** Sort order among actions (ascending, default 100). */
  order?: number
  /** Does this action apply to the selected file? */
  matches(entry: FileEntry): boolean
  run(context: FileActionContext): void | Promise<void>
}

const actions = ref<FileAction[]>([])

export const fileActionRegistry = {
  /** Reactive list — the explorer renders the matching subset. */
  actions,
  register(action: FileAction): void {
    actions.value = [...actions.value.filter(a => a.id !== action.id), action]
  },
  unregister(id: string): void {
    actions.value = actions.value.filter(a => a.id !== id)
  },
  /** Actions applicable to the given file, in display order. */
  matching(entry: FileEntry | null | undefined): FileAction[] {
    if (!entry) return []
    return actions.value
      .filter(action => {
        try {
          return action.matches(entry)
        } catch {
          return false
        }
      })
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  }
}
