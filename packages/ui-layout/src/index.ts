/**
 * UI Layout Module
 *
 * Provides a VS Code-like layout system with dockable panels,
 * resizable sidebars, editor tabs, and activity bar.
 */

// Theme CSS (auto-imported by GeneLayout, but can be imported separately)
import './theme.css'

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { EventBusService, setEventBusInstance, type EventBus } from './composables/useEventBus'
import { useLayoutState } from './composables/useLayoutState'

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
