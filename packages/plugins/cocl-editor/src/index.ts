/**
 * C-OCL Constraint Editor Plugin
 *
 * Form-based editor for C-OCL constraint files (.c-ocl).
 * Provides a visual editor for creating and editing OCL constraints.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw } from 'tsm:vue'

// Re-export components
export { CoclEditor } from './components'

// Import for service registration
import { CoclEditor } from './components'

// Type imports
import type { PanelRegistry, ActivityRegistry, PerspectiveManager } from 'ui-perspectives'

/**
 * TSM lifecycle: activate
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating C-OCL Editor plugin...')

  // Register components as service
  context.services.register('ui.cocl-editor.components', {
    CoclEditor
  })

  // Register cocl-editor perspective
  const perspectiveManager = context.services.get<PerspectiveManager>('ui.registry.perspectives')
  if (perspectiveManager) {
    perspectiveManager.registry.register({
      id: 'cocl-editor',
      name: 'Constraints',
      icon: 'pi pi-check-square',
      requiresWorkspace: true,
      order: 50,
      defaultLayout: {
        left: [],
        center: ['cocl-editor'],
        right: [],
        bottom: []
      },
      defaultVisibility: { left: false, right: false, bottom: false }
    })
    context.log.info('C-OCL Editor perspective registered')
  }

  // Register cocl-editor panel
  const panelRegistry = context.services.get<PanelRegistry>('ui.registry.panels')
  if (panelRegistry) {
    panelRegistry.register({
      id: 'cocl-editor',
      title: 'C-OCL Constraint Editor',
      icon: 'pi pi-check-square',
      component: markRaw(CoclEditor),
      perspectives: ['cocl-editor'],
      defaultLocation: 'center',
      defaultOrder: 0,
      closable: false
    })
    context.log.info('C-OCL Editor panel registered')
  }

  // Register with activity registry
  const activityRegistry = context.services.get<ActivityRegistry>('ui.registry.activities')
  if (activityRegistry) {
    activityRegistry.register({
      id: 'cocl-editor',
      icon: 'pi pi-check-square',
      label: 'Constraints',
      tooltip: 'C-OCL Constraint Editor',
      panelId: 'cocl-editor',
      perspectiveId: 'cocl-editor',
      order: 50,
      perspectives: ['cocl-editor']
    })
    context.log.info('C-OCL Editor activity registered')
  }

  context.log.info('C-OCL Editor plugin activated')
}

/**
 * TSM lifecycle: deactivate
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating C-OCL Editor plugin...')

  // Unregister perspective
  const perspectiveManager = context.services.get<PerspectiveManager>('ui.registry.perspectives')
  if (perspectiveManager) {
    perspectiveManager.registry.unregister('cocl-editor')
  }

  context.services.unregister('ui.cocl-editor.components')
  context.log.info('C-OCL Editor plugin deactivated')
}
