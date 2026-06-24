/**
 * Model Browser Module
 *
 * Provides EPackage/EClass browser for the Model Perspective.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw } from 'tsm:vue'
import type { PanelRegistry, ActivityRegistry } from 'ui-perspectives'
import modelCommandsEcore from '../model/model-commands.ecore?raw'

// Re-export types
export * from './types'

// Re-export composables
export { useModelRegistry, useSharedModelRegistry } from './composables/useModelRegistry'

// Re-export components
export { ModelBrowser, ClassPickerDialog } from './components'

// Import for service registration
import * as components from './components'
import { useModelRegistry, useSharedModelRegistry, setViewsService, setCanonicalPackageRegistry } from './composables/useModelRegistry'
import { setIconRegistry } from './types'

/**
 * TSM lifecycle: activate
 * Registers model browser services and panels
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Model Browser module...')

  // Inject canonical package registry from main bundle
  const canonicalRegistry = context.services.get('gene.package.registry')
  if (canonicalRegistry) {
    setCanonicalPackageRegistry(canonicalRegistry)
    context.log.info('Canonical package registry set')
  }

  // Register components as service (legacy)
  context.services.register('ui.model-browser.components', components)

  // Initialize the model registry
  const registry = useSharedModelRegistry()
  context.log.info(`Model registry initialized with ${registry.allPackages.value.length} packages`)

  // Set icon registry reference and subscribe to changes (via TSM DI)
  // ui-instance-tree may load after model-browser, so retry if not available yet
  function trySetupIconRegistry() {
    const svc = context.services.get<any>('gene.icons.classRegistry')
    if (svc) {
      setIconRegistry(svc)
      if (svc.onIconsChanged) {
        svc.onIconsChanged(() => registry.refreshIcons())
      }
      // Refresh immediately to pick up icons loaded before we subscribed
      registry.refreshIcons()
      context.log.info('Subscribed to icon changes')
      return true
    }
    return false
  }
  if (!trySetupIconRegistry()) {
    setTimeout(() => {
      if (!trySetupIconRegistry()) {
        setTimeout(() => trySetupIconRegistry(), 2000)
      }
    }, 500)
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
    const eventBus = context.services.get<any>('gene.eventbus')
    panelRegistry.register({
      id: 'model-browser',
      title: 'Models',
      icon: 'pi pi-box',
      component: markRaw(components.ModelBrowser),
      perspectives: ['model-editor', 'metamodeler'],
      defaultLocation: 'right',
      defaultOrder: 0,
      headerActions: [
        { icon: 'pi pi-plus', tooltip: 'Add Model', onClick: () => eventBus?.emit('show-add-model-dialog') }
      ]
    } as any)
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

  // Register commands from ecore
  const commandRegistry = context.services.get<any>('gene.command.registry')
  const keybindingSvc = context.services.get<any>('gene.keybindings')
  if (commandRegistry) {
    const cmds = commandRegistry.registerCommandsFromEcore(modelCommandsEcore, 'ui-model-browser')
    if (keybindingSvc) keybindingSvc.registerFromCommands(cmds)
    context.log.info('Model commands registered')
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
