/**
 * Model Browser Module
 *
 * Provides EPackage/EClass browser for the Model Perspective.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw } from 'tsm:vue'
import type { PanelRegistry, ActivityRegistry } from 'ui-perspectives'

// Re-export types
export * from './types'

// Re-export composables
export { useModelRegistry, useSharedModelRegistry } from './composables/useModelRegistry'

// Re-export components
export { ModelBrowser } from './components'

// Import for service registration
import * as components from './components'
import { useModelRegistry, useSharedModelRegistry, setViewsService } from './composables/useModelRegistry'
import { setIconRegistry } from './types'

/**
 * TSM lifecycle: activate
 * Registers model browser services and panels
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Model Browser module...')

  // Register components as service (legacy)
  context.services.register('ui.model-browser.components', components)

  // Initialize the model registry
  const registry = useSharedModelRegistry()
  context.log.info(`Model registry initialized with ${registry.allPackages.value.length} packages`)

  // Set icon registry reference and subscribe to changes (via TSM DI)
  const iconRegistrySvc = context.services.get<any>('gene.icons.classRegistry')
  if (iconRegistrySvc) {
    setIconRegistry(iconRegistrySvc)
  }
  if (iconRegistrySvc?.onIconsChanged) {
    iconRegistrySvc.onIconsChanged(() => {
      registry.refreshIcons()
    })
    context.log.info('Subscribed to icon changes')
  } else {
    context.log.warn('Icon registry not available for subscription')
  }

  // Inject views service from ui-instance-tree (breaks circular dependency)
  // ui-instance-tree may load after model-browser, so retry if not available yet
  function trySetViews() {
    const viewsService = context.services.get<any>('gene.views')
    if (viewsService) {
      setViewsService(viewsService)
      return true
    }
    return false
  }
  if (!trySetViews()) {
    const interval = setInterval(() => {
      if (trySetViews()) clearInterval(interval)
    }, 100)
  }

  // Register composables as service, including direct function access
  context.services.register('ui.model-browser.composables', {
    useModelRegistry,
    useSharedModelRegistry,
    loadEcoreFile: registry.loadEcoreFile,
    refreshIcons: registry.refreshIcons,
    getEcoreResourceSet: registry.getEcoreResourceSet
  })

  // Register with panel registry
  const panelRegistry = context.services.get<PanelRegistry>('ui.registry.panels')
  if (panelRegistry) {
    panelRegistry.register({
      id: 'model-browser',
      title: 'Models',
      icon: 'pi pi-box',
      component: markRaw(components.ModelBrowser),
      perspectives: ['model-editor', 'metamodeler'],
      defaultLocation: 'right',
      defaultOrder: 0
    })
    context.log.info('Model Browser panel registered')
  }

  // Register with activity registry
  const activityRegistry = context.services.get<ActivityRegistry>('ui.registry.activities')
  if (activityRegistry) {
    activityRegistry.register({
      id: 'model-browser',
      icon: 'pi pi-box',
      label: 'Models',
      tooltip: 'Model Browser',
      panelId: 'model-browser',
      order: 20,
      perspectives: ['model-editor', 'metamodeler']
    })
    context.log.info('Model Browser activity registered')
  }

  context.log.info('Model Browser module activated')
}

/**
 * TSM lifecycle: deactivate
 * Unregisters services
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Model Browser module...')

  context.services.unregister('ui.model-browser.components')
  context.services.unregister('ui.model-browser.composables')

  context.log.info('Model Browser module deactivated')
}
