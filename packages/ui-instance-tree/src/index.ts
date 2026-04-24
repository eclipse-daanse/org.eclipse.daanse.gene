/**
 * Instance Tree Module
 *
 * Provides EMF instance tree editor for the Model Perspective.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw } from 'tsm:vue'
import type { PanelRegistry, ActivityRegistry, PerspectiveManager } from 'ui-perspectives'
import { setPerspectiveManager, setEditorConfigForViews } from './composables/useViews'

// Re-export types
export * from './types'

// Re-export editor context (for perspective switching)
export {
  type EditorContext,
  type EditorMode,
  type EditorContextService,
  type TreeNode,
  type PackageInfo,
  type ClassInfo,
  EDITOR_CONTEXT_KEY,
  provideEditorContext,
  useEditorContext,
  setEditorMode,
  getEditorMode,
  registerInstanceContextFactory,
  registerMetamodelContextFactory,
  getCurrentContext,
  getInstanceContext,
  getMetamodelContext,
  getEditorContextService
} from './context/editorContext'

export { createInstanceContext } from './context/instanceContext'
export { createMetamodelContext } from './context/metamodelContext'

// Re-export composables
export {
  useInstanceTree,
  useSharedInstanceTree,
  setSharedResource,
  getSharedResource,
  getInstanceLoadingState,
  loadInstancesFromXMI,
  getObjectSourcePath,
  setObjectSourcePath,
  // XMI ID functions
  getXmiId,
  setXmiId,
  generateXmiId,
  hasXmiId,
  getObjectByXmiId,
  generateMissingXmiIds,
  type XMILoadResult
} from './composables/useInstanceTree'

// Re-export views composable
export {
  useViews,
  useSharedViews,
  getSharedViews,
  getTypeUri,
  getElementUri,
  setPerspectiveManager,
  getPerspectiveManager,
  type FilterType,
  type MappingScope as ViewMappingScope,
  type TreeFilterState,
  type TreeViewState
} from './composables/useViews'

// Re-export icon registry
export {
  MappingScope,
  IconLibrary,
  type IconSpec,
  type IconMapping,
  resolveIconClass,
  getIconForClass,
  registerIconMapping,
  registerIconMappings,
  clearCustomMappings,
  getAllMappings,
  createIconMapping,
  loadFromEditorConfig,
  clearEditorConfigMappings,
  onIconsChanged
} from './services/iconRegistry'

// Re-export icon provider system
export {
  iconProviderRegistry,
  getIconProviderRegistry
} from './services/iconProviderRegistry'
export type {
  IconProvider,
  IconDefinition,
  SelectedIcon,
  ProviderSearchResult
} from './services/iconProviders'
export { PrimeIconsProvider } from './services/providers/PrimeIconsProvider'

// Re-export components
export { InstanceTree, ViewsPanel } from './components'

// Import for service registration
import * as components from './components'
import {
  useInstanceTree,
  useSharedInstanceTree,
  setSharedResource,
  getSharedResource,
  getInstanceLoadingState,
  loadInstancesFromXMI,
  getObjectSourcePath,
  setObjectSourcePath,
  getXmiId,
  setXmiId,
  generateXmiId,
  hasXmiId,
  getObjectByXmiId,
  generateMissingXmiIds
} from './composables/useInstanceTree'
import {
  useViews,
  useSharedViews,
  getSharedViews,
  getTypeUri,
  getElementUri
} from './composables/useViews'
import * as iconRegistry from './services/iconRegistry'
import { getIconRegistryService } from './services/iconRegistry'

// Import context functions for service registration
import { createInstanceContext, setTsmContext } from './context/instanceContext'
import { createMetamodelContext } from './context/metamodelContext'

// Import icon provider system
import { iconProviderRegistry, getIconProviderRegistry } from './services/iconProviderRegistry'
import { PrimeIconsProvider } from './services/providers/PrimeIconsProvider'
import {
  EDITOR_CONTEXT_KEY,
  provideEditorContext,
  useEditorContext,
  setEditorMode,
  getEditorMode,
  registerInstanceContextFactory,
  registerMetamodelContextFactory,
  getCurrentContext,
  getInstanceContext,
  getMetamodelContext,
  getEditorContextService
} from './context/editorContext'

/**
 * TSM lifecycle: activate
 * Registers instance tree services
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Instance Tree module...')

  // Register built-in icon providers
  const primeIconsProvider = new PrimeIconsProvider()
  iconProviderRegistry.register(primeIconsProvider)
  context.log.info('PrimeIcons provider registered')

  // Register icon provider registry as TSM service
  context.services.register('gene.icons.registry', iconProviderRegistry)

  // Set EditorConfig reference for views
  const editorConfig = context.services.get<any>('gene.editor.config')
  if (editorConfig) {
    setEditorConfigForViews(editorConfig)
  }

  // Set PerspectiveManager reference for useViews
  const pm = context.services.get<PerspectiveManager>('ui.registry.perspectives')
  if (pm) {
    setPerspectiveManager(pm)
    context.log.info('PerspectiveManager set for views')
  } else {
    context.log.warn('PerspectiveManager not available yet, will retry...')
    // Retry after a short delay (other modules may not be loaded yet)
    setTimeout(() => {
      const pmRetry = context.services.get<PerspectiveManager>('ui.registry.perspectives')
      if (pmRetry) {
        setPerspectiveManager(pmRetry)
        context.log.info('PerspectiveManager set for views (retry)')
      }
    }, 500)
  }

  // Register shared instance tree state as DI service
  const sharedTree = useSharedInstanceTree()
  context.services.register('gene.instance.tree.state', { instance: sharedTree })

  // Register components as service (legacy)
  context.services.register('ui.instance-tree.components', components)

  // Register composables as service
  context.services.register('ui.instance-tree.composables', {
    useInstanceTree,
    useSharedInstanceTree,
    setSharedResource,
    getSharedResource,
    getInstanceLoadingState,
    loadInstancesFromXMI,
    getObjectSourcePath,
    setObjectSourcePath,
    // XMI ID functions
    getXmiId,
    setXmiId,
    generateXmiId,
    hasXmiId,
    getObjectByXmiId,
    generateMissingXmiIds
  })

  // Register icon registries as TSM services
  context.services.register('gene.icons.classRegistry', getIconRegistryService())
  context.services.register('ui.instance-tree.iconRegistry', iconRegistry)

  // Pass TSM context for lazy service resolution (model-browser loads after instance-tree)
  setTsmContext(context)

  // Register shared views as DI service
  const sharedViews = useSharedViews()
  context.services.register('gene.views', sharedViews)

  // Register views composable as service (legacy compat)
  context.services.register('ui.instance-tree.views', {
    useViews,
    useSharedViews,
    getSharedViews,
    getTypeUri,
    getElementUri
  })

  // Register editor context as DI service
  const editorContextService = getEditorContextService()
  context.services.register('gene.editor.context', editorContextService)

  // Register editor context functions as service (legacy compat)
  context.services.register('ui.instance-tree.context', {
    createInstanceContext,
    createMetamodelContext,
    provideEditorContext,
    useEditorContext,
    setEditorMode,
    getEditorMode,
    registerInstanceContextFactory,
    registerMetamodelContextFactory,
    getCurrentContext,
    getInstanceContext,
    getMetamodelContext,
    EDITOR_CONTEXT_KEY
  })

  // Register model-editor perspective
  const perspectiveManager = context.services.get<PerspectiveManager>('ui.registry.perspectives')
  if (perspectiveManager) {
    perspectiveManager.registry.register({
      id: 'model-editor',
      name: 'Model Editor',
      icon: 'pi pi-pencil',
      requiresWorkspace: true,
      order: 10,
      defaultLayout: {
        left: ['instance-tree'],
        center: ['properties'],
        right: ['model-browser'],
        bottom: ['ocl-problems']
      },
      defaultVisibility: { left: true, right: true, bottom: false },
      onActivate: () => {
        setEditorMode('instance')
      }
    })
    context.log.info('Model Editor perspective registered')
  }

  // Register with panel registry
  const panelRegistry = context.services.get<PanelRegistry>('ui.registry.panels')
  if (panelRegistry) {
    panelRegistry.register({
      id: 'instance-tree',
      title: 'Instances',
      icon: 'pi pi-sitemap',
      component: markRaw(components.InstanceTree),
      perspectives: ['model-editor'],
      defaultLocation: 'left',
      defaultOrder: 0
    })
    context.log.info('Instance Tree panel registered')

context.log.info('ViewsPanel available as component (integrated in InstanceTree)')
  }

  // Register with activity registry
  const activityRegistry = context.services.get<ActivityRegistry>('ui.registry.activities')
  if (activityRegistry) {
    activityRegistry.register({
      id: 'instance-tree',
      icon: 'pi pi-sitemap',
      label: 'Instances',
      tooltip: 'Instance Tree',
      panelId: 'instance-tree',
      order: 0,
      perspectives: ['model-editor']
    })
    context.log.info('Instance Tree activity registered')

  }

  context.log.info('Instance Tree module activated')
}

/**
 * TSM lifecycle: deactivate
 * Unregisters services
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Instance Tree module...')

  // Clear PerspectiveManager reference
  setPerspectiveManager(null)

  context.services.unregister('gene.editor.context')
  context.services.unregister('gene.views')
  context.services.unregister('ui.instance-tree.components')
  context.services.unregister('ui.instance-tree.composables')
  context.services.unregister('ui.instance-tree.iconRegistry')
  context.services.unregister('ui.instance-tree.views')
  context.services.unregister('ui.instance-tree.context')

  context.log.info('Instance Tree module deactivated')
}
