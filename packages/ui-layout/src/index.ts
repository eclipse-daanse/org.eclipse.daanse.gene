/**
 * UI Layout Module
 *
 * Provides a VS Code-like layout system with dockable panels,
 * resizable sidebars, editor tabs, and activity bar.
 */

// Theme CSS (auto-imported by GeneLayout, but can be imported separately)
import './theme.css'

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { ref } from 'tsm:vue'
import { EventBusService, setEventBusInstance, type EventBus } from './composables/useEventBus'
import { useLayoutState } from './composables/useLayoutState'

// Shared reactive open-file title — perspectives set this to show current file in title bar
export const openFileTitle = ref<string | null>(null)

// Re-export types
export * from './types'

// Re-export composables
export { useLayoutState, useSharedLayoutState, setEditorConfig } from './composables/useLayoutState'
export { usePanelDragDrop, usePanelKeyboardShortcuts } from './composables/usePanelDragDrop'
export { useGlobalSettings, COLOR_PRESETS, type Theme, type Language, type GlobalSettings } from './composables/useGlobalSettings'
export { useEventBus, EventBusService, type EventBus, type EventBusEvents } from './composables/useEventBus'

// Re-export components
export {
  GeneLayout,
  ActivityBar,
  PrimarySidebar,
  SecondarySidebar,
  EditorArea,
  EditorTabs,
  PanelArea,
  StatusBar,
  SettingsDialog
} from './components'

// Import components for service registration
import * as components from './components'
import * as composables from './composables'

/**
 * TSM lifecycle: activate
 * Registers layout components and state as services
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating UI Layout module...')

  // Bind EventBus as DI singleton
  context.services.bindClass('gene.eventbus', EventBusService)
  const eventBus = context.services.getRequired<EventBus>('gene.eventbus')
  setEventBusInstance(eventBus)

  // Create layout state and register as service
  const layoutState = useLayoutState()
  context.services.register('gene.layout.state', layoutState)

  // Register components as service
  context.services.register('ui.layout.components', components)

  // Register composables/state as service (legacy compat)
  context.services.register('ui.layout.composables', composables)
  // Keep legacy service ID for existing consumers
  context.services.register('ui.layout.state', composables)

  // Register menu registry — perspectives register their toolbar items here
  const menusByPerspective = new Map<string, any[]>()
  // Register open-file title service (perspectives set this to show current file in title bar)
  context.services.register('gene.layout.openFile', openFileTitle)

  // Register menu registry — perspectives register their toolbar items here
  context.services.register('gene.menu.registry', {
    registerMenu(perspectiveId: string, items: any[]) {
      menusByPerspective.set(perspectiveId, items)
      eventBus.emit('gene:menu-changed')
    },
    appendMenu(perspectiveId: string, items: any[]) {
      const existing = menusByPerspective.get(perspectiveId) || []
      menusByPerspective.set(perspectiveId, [...existing, ...items])
      eventBus.emit('gene:menu-changed')
    },
    getMenu(perspectiveId: string): any[] {
      return menusByPerspective.get(perspectiveId) || []
    },
    unregisterMenu(perspectiveId: string) {
      menusByPerspective.delete(perspectiveId)
      eventBus.emit('gene:menu-changed')
    }
  })

  context.log.info('UI Layout module activated')
}

/**
 * TSM lifecycle: deactivate
 * Unregisters services
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating UI Layout module...')

  context.services.unregister('gene.eventbus')
  context.services.unregister('gene.layout.state')
  context.services.unregister('ui.layout.components')
  context.services.unregister('ui.layout.composables')
  context.services.unregister('ui.layout.state')

  context.log.info('UI Layout module deactivated')
}
