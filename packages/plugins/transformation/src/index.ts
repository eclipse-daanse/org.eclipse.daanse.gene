/**
 * Model Transformation Plugin
 *
 * Visual model-to-model transformation mapping editor.
 * Three-column layout: Source Model | Variables | Target Model
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw } from 'tsm:vue'

// Re-export components
export { TransformationEditor, OclMonacoEditor } from './components'

// Import for service registration
import { TransformationEditor } from './components'

// Type imports
import type { PanelRegistry, ActivityRegistry, PerspectiveManager } from 'ui-perspectives'

/**
 * TSM lifecycle: activate
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Transformation plugin...')

  // Register components as service
  context.services.register('ui.transformation.components', {
    TransformationEditor
  })

  // Register transformation perspective
  const perspectiveManager = context.services.get<PerspectiveManager>('ui.registry.perspectives')
  if (perspectiveManager) {
    perspectiveManager.registry.register({
      id: 'transformation',
      name: 'Transformation',
      icon: 'pi pi-arrows-h',
      requiresWorkspace: true,
      order: 40,
      defaultLayout: {
        left: [],
        center: ['transformation-editor'],
        right: [],
        bottom: []
      },
      defaultVisibility: { left: false, right: false, bottom: false }
    })
    context.log.info('Transformation perspective registered')
  }

  // Register transformation editor panel
  const panelRegistry = context.services.get<PanelRegistry>('ui.registry.panels')
  if (panelRegistry) {
    panelRegistry.register({
      id: 'transformation-editor',
      title: 'Transformation Mapping',
      icon: 'pi pi-arrows-h',
      component: markRaw(TransformationEditor),
      perspectives: ['transformation'],
      defaultLocation: 'center',
      defaultOrder: 0,
      closable: false
    })
    context.log.info('Transformation panel registered')
  }

  // Register with activity registry
  const activityRegistry = context.services.get<ActivityRegistry>('ui.registry.activities')
  if (activityRegistry) {
    activityRegistry.register({
      id: 'transformation',
      icon: 'pi pi-arrows-h',
      label: 'Transformation',
      tooltip: 'Model Transformation Editor',
      panelId: 'transformation-editor',
      perspectiveId: 'transformation',
      order: 40,
      perspectives: ['transformation']
    })
    context.log.info('Transformation activity registered')
  }

  context.log.info('Transformation plugin activated')
}

/**
 * TSM lifecycle: deactivate
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Transformation plugin...')

  // Unregister perspective
  const perspectiveManager = context.services.get<PerspectiveManager>('ui.registry.perspectives')
  if (perspectiveManager) {
    perspectiveManager.registry.unregister('transformation')
  }

  context.services.unregister('ui.transformation.components')
  context.log.info('Transformation plugin deactivated')
}