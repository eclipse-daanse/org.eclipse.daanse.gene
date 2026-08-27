/**
 * Object Actions Registry
 *
 * Contribution point for plugin-provided actions on Atlas objects. Instead of
 * the detail panel knowing every consumer (as with the built-in "Open in
 * Modeler" button), plugins register an action and declare which objects it
 * applies to — e.g. a mapping editor registering itself for
 * `ProviderMapping` objects.
 */

import { ref } from 'tsm:vue'
import type { ObjectMetadata, AtlasTreeNodeData } from './types'

export interface AtlasObjectActionContext {
  /** Metadata of the selected object. */
  detail: ObjectMetadata
  /** Tree node data (connection, scope, registry, stage, objectId). */
  nodeData: AtlasTreeNodeData
  /** Raw content of the object, loaded by the panel before invoking. */
  content: string
}

export interface AtlasObjectAction {
  /** Stable id, used for replacing/unregistering. */
  id: string
  label: string
  /** PrimeIcons class, e.g. `pi pi-pencil`. */
  icon?: string
  /** Sort order among actions (ascending, default 100). */
  order?: number
  /** Does this action apply to the selected object? */
  matches(detail: ObjectMetadata, nodeData: AtlasTreeNodeData): boolean
  run(context: AtlasObjectActionContext): void | Promise<void>
}

const actions = ref<AtlasObjectAction[]>([])

export const objectActionRegistry = {
  /** Reactive list — the detail panel renders the matching subset. */
  actions,
  register(action: AtlasObjectAction): void {
    actions.value = [...actions.value.filter(a => a.id !== action.id), action]
  },
  unregister(id: string): void {
    actions.value = actions.value.filter(a => a.id !== id)
  },
  /** Actions applicable to the given object, in display order. */
  matching(detail: ObjectMetadata | null, nodeData: AtlasTreeNodeData | null): AtlasObjectAction[] {
    if (!detail || !nodeData) return []
    return actions.value
      .filter(action => {
        try {
          return action.matches(detail, nodeData)
        } catch {
          return false
        }
      })
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  }
}
