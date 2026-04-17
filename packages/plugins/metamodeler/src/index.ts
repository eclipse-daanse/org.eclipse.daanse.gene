/**
 * Metamodeler Plugin
 *
 * Visual Ecore Metamodel Editor with OCL Support.
 * Provides a tree-based editor for creating and editing .ecore metamodels.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw } from 'tsm:vue'

// Re-export types
export * from './types'

// Re-export composables
export { useMetamodeler, useSharedMetamodeler } from './composables/useMetamodeler'

// Re-export components
export * from './components'

// Import for service registration
import { MetamodelerPerspective, MetamodelerTree, MetamodelerEditor } from './components'
import { useMetamodeler, useSharedMetamodeler } from './composables/useMetamodeler'

// Type imports
import type { PanelRegistry, ActivityRegistry, PerspectiveManager } from 'ui-perspectives'

/**
 * TSM lifecycle: activate
 * Registers metamodeler services and perspective
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Metamodeler plugin...')

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
