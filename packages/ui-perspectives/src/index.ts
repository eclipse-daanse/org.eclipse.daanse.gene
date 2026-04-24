/**
 * Perspectives Module
 *
 * Manages application perspectives (File Explorer, Model Editor, Metamodeler).
 * Provides registries for perspectives, panels, and activities.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'

// Re-export types (legacy)
export * from './types'

// Re-export registry (selective to avoid conflicts)
export {
  // Registry types
  type PanelDefinition,
  type ActivityDefinition,
  type PerspectiveDefinition,
  type PerspectiveContext,
  type PanelRegistry,
  type ActivityRegistry,
  type PerspectiveRegistry,
  type LayoutLocation,
  // Registry classes
  PanelRegistryImpl,
  ActivityRegistryImpl,
  PerspectiveManagerImpl,
  // Perspective definitions
  explorerPerspective,
  modelEditorPerspective
} from './registry'

// Re-export with renamed to avoid conflicts with legacy
export { DEFAULT_PERSPECTIVES as REGISTRY_DEFAULT_PERSPECTIVES } from './registry'
export { type PerspectiveState as RegistryPerspectiveState, type PerspectiveManager } from './registry'

// Re-export composables (legacy - use registries for new code)
export { usePerspective, useSharedPerspective } from './composables/usePerspective'
export { useXMILoader, loadXMI, saveToXMI } from './composables/useXMILoader'

// Import for service registration
import { usePerspective, useSharedPerspective } from './composables/usePerspective'
import { useXMILoader, loadXMI, saveToXMI } from './composables/useXMILoader'
import {
  PanelRegistryImpl,
  ActivityRegistryImpl,
  PerspectiveManagerImpl,
  DEFAULT_PERSPECTIVES as REGISTRY_DEFAULT_PERSPECTIVES,
  type PerspectiveManager
} from './registry'

/**
 * TSM lifecycle: activate
 * Registers perspective service and registries via DI
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Perspectives module...')

  // Bind registries via DI (singleton, lazy instantiation)
  context.services.bindClass('gene.registry.panels', PanelRegistryImpl)
  context.services.bindClass('gene.registry.activities', ActivityRegistryImpl)
  context.services.bindClass('gene.registry.perspectives', PerspectiveManagerImpl)

  // Backwards-compat aliases for existing consumers
  context.services.register('ui.registry.panels', context.services.get('gene.registry.panels'))
  context.services.register('ui.registry.activities', context.services.get('gene.registry.activities'))
  context.services.register('ui.registry.perspectives', context.services.get('gene.registry.perspectives'))

  // Set layout state on PerspectiveManager (layout module loads before perspectives)
  const manager = context.services.getRequired<PerspectiveManager>('gene.registry.perspectives')
  const layoutState = context.services.get<any>('gene.layout.state')
  if (layoutState) {
    manager.setLayoutState(layoutState)
    context.log.info('LayoutState set on PerspectiveManager')
  } else {
    context.log.warn('LayoutState not available yet — PerspectiveManager will not manage layout')
  }

  // Register default perspectives
  for (const perspective of REGISTRY_DEFAULT_PERSPECTIVES) {
    manager.registry.register(perspective)
    context.log.info(`Registered perspective: ${perspective.id}`)
  }

  // Register perspective service (legacy API)
  context.services.register('ui.perspectives', {
    usePerspective,
    useSharedPerspective,
    useXMILoader,
    loadXMI,
    saveToXMI
  })

  // Also register convenience accessors
  context.services.register('ui.registries', {
    panels: context.services.get('gene.registry.panels'),
    activities: context.services.get('gene.registry.activities'),
    perspectives: manager
  })

  context.log.info('Perspectives module activated with DI registries')
}

/**
 * TSM lifecycle: deactivate
 * Unregisters services
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Perspectives module...')

  context.services.unregister('ui.perspectives')
  context.services.unregister('ui.registry.panels')
  context.services.unregister('ui.registry.activities')
  context.services.unregister('ui.registry.perspectives')
  context.services.unregister('ui.registries')
  context.services.unregister('gene.registry.panels')
  context.services.unregister('gene.registry.activities')
  context.services.unregister('gene.registry.perspectives')

  context.log.info('Perspectives module deactivated')
}
