/**
 * Metamodeler Plugin
 *
 * Visual Ecore Metamodel Editor with OCL Support.
 * Provides a tree-based editor for creating and editing .ecore metamodels.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw } from 'tsm:vue'
import metamodelCommandsEcore from '../model/metamodel-commands.ecore?raw'

// Re-export types
export * from './types'

// Re-export composables
export { useMetamodeler, useSharedMetamodeler } from './composables/useMetamodeler'

// Re-export components
export * from './components'

// Import for service registration
import { MetamodelerPerspective, MetamodelerTree, MetamodelerEditor } from './components'
import { useMetamodeler, useSharedMetamodeler, setMetamodelerIconRegistry, refreshMetamodelerIcons } from './composables/useMetamodeler'

// Type imports
import type { PanelRegistry, ActivityRegistry, PerspectiveManager } from 'ui-perspectives'

/**
 * TSM lifecycle: activate
 * Registers metamodeler services and perspective
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Metamodeler plugin...')

  // Set icon registry reference for custom icons in metamodeler tree
  // ui-instance-tree may load after metamodeler, so retry if not available yet
  function trySetupIconRegistry() {
    const svc = context.services.get<any>('gene.icons.classRegistry')
    if (svc) {
      setMetamodelerIconRegistry(svc)
      if (svc.onIconsChanged) {
        svc.onIconsChanged(() => refreshMetamodelerIcons())
      }
      // Refresh immediately to pick up icons loaded before we subscribed
      refreshMetamodelerIcons()
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

  // Register components as service
  context.services.register('ui.metamodeler.components', {
    MetamodelerPerspective,
    MetamodelerTree,
    MetamodelerEditor
  })

  // Register composables as service
  context.services.register('ui.metamodeler.composables', {
    useMetamodeler,
    useSharedMetamodeler
  })

  // Register metamodeler perspective
  const perspectiveManager = context.services.get<PerspectiveManager>('ui.registry.perspectives')
  if (perspectiveManager) {
    perspectiveManager.registry.register({
      id: 'metamodeler',
      name: 'Metamodeler',
      icon: 'pi pi-sitemap',
      requiresWorkspace: true,
      order: 30,
      defaultLayout: {
        left: ['metamodeler-tree'],
        center: ['properties'],
        right: ['model-browser'],
        bottom: []
      },
      defaultVisibility: { left: true, right: true, bottom: false },
      onActivate: () => {
        // Set editor mode to metamodel for context-aware components
        const editorCtx = context.services.get<any>('gene.editor.context')
        editorCtx?.setEditorMode('metamodel')
      }
    })
    context.log.info('Metamodeler perspective registered')
  }

  // Register metamodeler panels
  const panelRegistry = context.services.get<PanelRegistry>('ui.registry.panels')
  if (panelRegistry) {
    panelRegistry.register({
      id: 'metamodeler-tree',
      title: 'Metamodel',
      icon: 'pi pi-sitemap',
      component: markRaw(MetamodelerTree),
      perspectives: ['metamodeler'],
      defaultLocation: 'left',
      defaultOrder: 0
    })
    context.log.info('Metamodeler tree panel registered')
  }

  // Register with activity registry
  const activityRegistry = context.services.get<ActivityRegistry>('ui.registry.activities')
  if (activityRegistry) {
    activityRegistry.register({
      id: 'metamodeler',
      icon: 'pi pi-sitemap',
      label: 'Metamodeler',
      tooltip: 'Ecore Metamodel Editor',
      panelId: 'metamodeler',
      perspectiveId: 'metamodeler',
      order: 30,
      perspectives: ['metamodeler']
    })
    context.log.info('Metamodeler activity registered')
  }

  // Register a function to switch to the metamodeler perspective
  const openMetamodeler = () => {
    const perspectiveService = context.services.get<any>('ui.perspectives')
    if (perspectiveService?.usePerspective) {
      const perspective = perspectiveService.usePerspective()
      perspective.switchTo('metamodeler')
      context.log.info('Switched to Metamodeler perspective')
    } else {
      context.log.warn('Perspective service not available')
    }
  }

  // Register the opener as a service
  context.services.register('ui.metamodeler.open', openMetamodeler)

  // Register menu for metamodeler perspective
  const menuRegistry = context.services.get<any>('gene.menu.registry')
  if (menuRegistry) {
    const eventBus = context.services.get<any>('gene.eventbus')
    const mm = useSharedMetamodeler()
    const hasPackage = () => !!mm.rootPackage.value

    menuRegistry.registerMenu('metamodeler', [
      {
        id: 'meta.newPackage',
        icon: 'pi pi-plus',
        label: 'New Package',
        disabled: () => hasPackage(),
        action: () => eventBus?.emit('metamodeler:new-package')
      },
      { id: 'meta.sep1', separator: true, icon: '', label: '', action: () => {} },
      {
        id: 'meta.showSupertypes',
        icon: 'pi pi-sitemap',
        label: 'Show Supertypes',
        active: () => mm.showSuperTypes.value,
        action: () => { mm.showSuperTypes.value = !mm.showSuperTypes.value }
      },
      { id: 'meta.sep2', separator: true, icon: '', label: '', action: () => {} },
      {
        id: 'meta.save',
        icon: 'pi pi-save',
        label: 'Save Metamodel',
        disabled: () => !hasPackage() || !mm.dirty.value,
        action: () => mm.saveToFile()
      },
      {
        id: 'meta.saveAs',
        icon: 'pi pi-file-export',
        label: 'Save As...',
        disabled: () => !hasPackage(),
        action: () => mm.saveAsFile()
      },
      {
        id: 'meta.exportJson',
        icon: 'pi pi-download',
        label: 'Export JSON Schema',
        disabled: () => !hasPackage(),
        action: () => eventBus?.emit('metamodeler:export-json-schema')
      }
    ])
    context.log.info('Metamodeler menu registered')
  }

  // Register commands from ecore
  const commandRegistry = context.services.get<any>('gene.command.registry')
  const keybindingSvc = context.services.get<any>('gene.keybindings')
  if (commandRegistry) {
    const cmds = commandRegistry.registerCommandsFromEcore(metamodelCommandsEcore, 'metamodeler')
    if (keybindingSvc) keybindingSvc.registerFromCommands(cmds)
    context.log.info('Metamodeler commands registered')
  }

  context.log.info('Metamodeler plugin activated')
}

/**
 * TSM lifecycle: deactivate
 * Unregisters services and perspective
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Metamodeler plugin...')

  // Unregister opener service
  context.services.unregister('ui.metamodeler.open')

  // Unregister perspective
  const perspectiveManager = context.services.get<PerspectiveManager>('ui.registry.perspectives')
  if (perspectiveManager) {
    perspectiveManager.registry.unregister('metamodeler')
  }

  // Unregister services
  context.services.unregister('ui.metamodeler.components')
  context.services.unregister('ui.metamodeler.composables')

  context.log.info('Metamodeler plugin deactivated')
}
