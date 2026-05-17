/**
 * Instance Tree Module
 *
 * Provides EMF instance tree editor for the Model Perspective.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw } from 'tsm:vue'
import type { PanelRegistry, ActivityRegistry, PerspectiveManager } from 'ui-perspectives'
import { setPerspectiveManager, setEditorConfigForViews } from './composables/useViews'
import instanceCommandsEcore from '../model/instance-commands.ecore?raw'

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
  getIconProviderRegistry,
  resolveCustomIconDataUrl
} from './services/iconProviderRegistry'
export type {
  IconProvider,
  IconDefinition,
  SelectedIcon,
  ProviderSearchResult
} from './services/iconProviders'
export { PrimeIconsProvider } from './services/providers/PrimeIconsProvider'
export { CustomIconProvider, CUSTOM_ICONS_PROVIDER_ID, type CustomIconEntry } from './services/providers/CustomIconProvider'

// Re-export components
export { InstanceTree, ViewsPanel, IconPicker } from './components'

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
 * Check for dangling (unresolved proxy) references in the shared resource
 */
function checkDanglingReferences(): Array<{ className: string; featureName: string; objectUri: string }> {
  const resource = getSharedResource()
  if (!resource) return []

  const results: Array<{ className: string; featureName: string; objectUri: string }> = []
  const contents = resource.getContents()

  function checkObject(obj: any) {
    if (!obj?.eClass) return
    const eClass = obj.eClass()
    const features = eClass.getEAllStructuralFeatures?.() || eClass.getEStructuralFeatures?.() || []

    for (const feature of features) {
      // Only check references (not attributes or containments)
      if (!feature.getEType || feature.isContainment?.()) continue
      const isRef = feature.constructor?.name?.includes('Reference') ||
                    (feature.getEType?.()?.constructor?.name?.includes('Class') && !feature.isContainment?.())
      if (!isRef) continue

      const value = obj.eGet?.(feature)
      if (!value) continue

      const checkProxy = (v: any) => {
        if (v && typeof v.eIsProxy === 'function' && v.eIsProxy()) {
          results.push({
            className: eClass.getName?.() || 'Unknown',
            featureName: feature.getName?.() || 'unknown',
            objectUri: v.eProxyURI?.()?.toString?.() || 'unknown'
          })
        }
      }

      if (Array.isArray(value)) {
        value.forEach(checkProxy)
      } else if (value && typeof value[Symbol.iterator] === 'function') {
        for (const v of value) checkProxy(v)
      } else {
        checkProxy(value)
      }
    }

    // Recurse into contained objects
    const containments = eClass.getEAllContainments?.() || []
    for (const cont of containments) {
      const children = obj.eGet?.(cont)
      if (!children) continue
      const arr = Array.isArray(children) ? children :
                  typeof children[Symbol.iterator] === 'function' ? Array.from(children) : [children]
      arr.forEach(checkObject)
    }
  }

  for (const root of contents) {
    checkObject(root)
  }

  return results
}

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
        bottom: ['ocl-problems', 'action-jobs']
      },
      defaultVisibility: { left: true, right: true, bottom: true },
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

  // Register commands from ecore
  const commandRegistry = context.services.get<any>('gene.command.registry')
  const keybindingSvc = context.services.get<any>('gene.keybindings')
  if (commandRegistry) {
    const cmds = commandRegistry.registerCommandsFromEcore(instanceCommandsEcore, 'ui-instance-tree')
    if (keybindingSvc) keybindingSvc.registerFromCommands(cmds)

    // UC-ACT-006: XMI-Import als Aktionsergebnis
    commandRegistry.registerHandler('instance.importXmi', async (args: any) => {
      const xmiContent = args?.xmiContent as string
      if (!xmiContent) return

      const mode = args?.mode as string | undefined
      const targetUri = (args?.targetResourceUri as string) || 'action-result://import.xmi'
      const artifactName = args?.name as string | undefined

      // No mode specified → show import dialog to let user choose
      if (!mode) {
        const eventBus = context.services.get<any>('gene.eventbus')
        eventBus?.emit('instance:showImportDialog', { xmiContent, name: artifactName })
        return
      }

      const state = useSharedInstanceTree()
      const eventBus = context.services.get<any>('gene.eventbus')
      const problemsService = context.services.get<any>('gene.problems')

      try {
        if (mode === 'REPLACE') {
          // Clear existing resource before loading new content
          setSharedResource(null)
          const result = await loadInstancesFromXMI(xmiContent, targetUri)
          context.log.info(`XMI Import (REPLACE): ${result.loadedCount} objects loaded`)

          if (result.loadedCount === 0) {
            if (problemsService?.addIssues) {
              problemsService.addIssues([{
                severity: 'ERROR',
                message: 'XMI Import failed: No objects could be loaded. The metamodel may not be registered.',
                className: 'XMI Import'
              }])
            }
          }

          if (result.errors.length > 0) {
            if (problemsService?.addIssues) {
              problemsService.addIssues(result.errors.map((e: any) => ({
                severity: 'ERROR',
                message: `Import error: ${e.message}`,
                className: 'XMI Import'
              })))
            }
          }

          // Check for dangling references
          const danglingRefs = checkDanglingReferences()
          if (danglingRefs.length > 0 && problemsService?.addIssues) {
            problemsService.addIssues(danglingRefs.map(d => ({
              severity: 'WARN',
              message: `Dangling reference: ${d.featureName} on ${d.className} → unresolved proxy`,
              className: d.className,
              featureName: d.featureName
            })))
          }

          eventBus?.emit('instance:imported', { mode, count: result.loadedCount, danglingRefs: danglingRefs.length })

        } else if (mode === 'MERGE') {
          // MERGE: add to existing resource (loadInstancesFromXMI appends by default)
          const result = await loadInstancesFromXMI(xmiContent, targetUri)
          context.log.info(`XMI Import (MERGE): ${result.loadedCount} objects merged`)

          if (result.loadedCount === 0) {
            if (problemsService?.addIssues) {
              problemsService.addIssues([{
                severity: 'ERROR',
                message: 'XMI Import (MERGE) failed: No objects could be parsed. The metamodel may not be registered.',
                className: 'XMI Import'
              }])
            }
          }

          if (result.errors.length > 0) {
            if (problemsService?.addIssues) {
              problemsService.addIssues(result.errors.map((e: any) => ({
                severity: 'ERROR',
                message: `Import error: ${e.message}`,
                className: 'XMI Import'
              })))
            }
          }

          const danglingRefs = checkDanglingReferences()
          if (danglingRefs.length > 0 && problemsService?.addIssues) {
            problemsService.addIssues(danglingRefs.map(d => ({
              severity: 'WARN',
              message: `Dangling reference: ${d.featureName} on ${d.className} → unresolved proxy`,
              className: d.className,
              featureName: d.featureName
            })))
          }

          eventBus?.emit('instance:imported', { mode, count: result.loadedCount, danglingRefs: danglingRefs.length })
        }
      } catch (err: any) {
        context.log.error(`XMI Import failed: ${err.message}`)
        if (problemsService?.addIssues) {
          problemsService.addIssues([{
            severity: 'ERROR',
            message: `XMI Import failed: ${err.message}. The required metamodel may not be loaded.`,
            className: 'XMI Import'
          }])
        }
        // Show problems panel
        const ls = context.services.get<any>('gene.layout.state')
        if (ls) {
          if (!ls.state?.visibility?.panelArea) ls.togglePanelArea?.()
          ls.selectPanelTab?.('ocl-problems')
        }
      }
    })

    context.log.info('Instance commands registered')
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
