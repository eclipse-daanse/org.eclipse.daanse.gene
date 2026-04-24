/**
 * Panel Registry
 *
 * Manages panel registrations for all perspectives.
 */

import { injectable, singleton } from '@eclipse-daanse/tsm'
import { reactive } from 'tsm:vue'
import type { PanelDefinition, PanelRegistry, LayoutLocation } from './types'

@injectable()
@singleton()
export class PanelRegistryImpl implements PanelRegistry {
  private panels = reactive(new Map<string, PanelDefinition>())

  register(panel: PanelDefinition): void {
    console.log(`[PanelRegistry] Registering panel: ${panel.id}`)
    this.panels.set(panel.id, panel)
  }

  unregister(id: string): void {
    console.log(`[PanelRegistry] Unregistering panel: ${id}`)
    this.panels.delete(id)
  }

  get(id: string): PanelDefinition | undefined {
    return this.panels.get(id)
  }

  getAll(): PanelDefinition[] {
    return Array.from(this.panels.values())
  }

  getForPerspective(perspectiveId: string): PanelDefinition[] {
    return Array.from(this.panels.values()).filter(panel => {
      if (panel.perspectives === '*') return true
      return panel.perspectives.includes(perspectiveId)
    })
  }

  getForLocation(perspectiveId: string, location: LayoutLocation): PanelDefinition[] {
    return this.getForPerspective(perspectiveId)
      .filter(panel => panel.defaultLocation === location)
      .sort((a, b) => (a.defaultOrder ?? 0) - (b.defaultOrder ?? 0))
  }
}
