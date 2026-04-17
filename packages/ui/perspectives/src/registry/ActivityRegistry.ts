/**
 * Activity Registry
 *
 * Manages activity bar registrations.
 */

import { injectable, singleton } from '@eclipse-daanse/tsm'
import { reactive } from 'tsm:vue'
import type { ActivityDefinition, ActivityRegistry } from './types'

@injectable()
@singleton()
export class ActivityRegistryImpl implements ActivityRegistry {
  private activities = reactive(new Map<string, ActivityDefinition>())

  register(activity: ActivityDefinition): void {
    console.log(`[ActivityRegistry] Registering activity: ${activity.id}`)
    this.activities.set(activity.id, activity)
  }

  unregister(id: string): void {
    console.log(`[ActivityRegistry] Unregistering activity: ${id}`)
    this.activities.delete(id)
  }

  get(id: string): ActivityDefinition | undefined {
    return this.activities.get(id)
  }

  getAll(): ActivityDefinition[] {
    return Array.from(this.activities.values())
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  }

  getForPerspective(perspectiveId: string): ActivityDefinition[] {
    return Array.from(this.activities.values())
      .filter(activity => {
        if (activity.perspectives === '*') return true
        return activity.perspectives.includes(perspectiveId)
      })
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  }
}
