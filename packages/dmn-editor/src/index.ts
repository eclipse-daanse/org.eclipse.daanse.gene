/**
 * DMN Editor Plugin
 *
 * Decision Table Editor with FEEL expression support.
 * Uses EMFTs XMIResource for DMN model serialization.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw } from 'tsm:vue'

// Re-export types
export * from './types'

// Re-export components
export { DmnPerspective } from './components'

// Import for service registration
import { DmnPerspective } from './components'
import { setFileSystem } from './composables/useDmnEditor'

// Type imports
import type { PanelRegistry, ActivityRegistry, PerspectiveManager } from 'ui-perspectives'

/**
 * TSM lifecycle: activate
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating DMN Editor plugin...')

  // Inject file system dependency
  const fs = context.services.get<any>('gene.filesystem')
  if (fs) setFileSystem(fs)

  // Register components as service
  context.services.register('ui.dmn-editor.components', {
    DmnPerspective
  })

  // Register DMN editor perspective
  const perspectiveManager = context.services.get<PerspectiveManager>('ui.registry.perspectives')
  if (perspectiveManager) {
    perspectiveManager.registry.register({
      id: 'dmn-editor',
      name: 'DMN Editor',
      icon: 'pi pi-table',
      requiresWorkspace: true,
      order: 70,
      defaultLayout: {
        left: [],
        center: ['dmn-editor'],
        right: [],
        bottom: []
      },
      defaultVisibility: { left: false, right: false, bottom: false }
    })
    context.log.info('DMN Editor perspective registered')
  }

  // Register DMN editor panel
  const panelRegistry = context.services.get<PanelRegistry>('ui.registry.panels')
  if (panelRegistry) {
    panelRegistry.register({
      id: 'dmn-editor',
      title: 'DMN Editor',
      icon: 'pi pi-table',
      component: markRaw(DmnPerspective),
      perspectives: ['dmn-editor'],
      defaultLocation: 'center',
      defaultOrder: 0,
      closable: false
    })
    context.log.info('DMN Editor panel registered')
  }

  // Register with activity registry
  const activityRegistry = context.services.get<ActivityRegistry>('ui.registry.activities')
  if (activityRegistry) {
    activityRegistry.register({
      id: 'dmn-editor',
      icon: 'pi pi-table',
      label: 'DMN',
      tooltip: 'DMN Decision Table Editor',
      panelId: 'dmn-editor',
      perspectiveId: 'dmn-editor',
      order: 70,
      perspectives: ['dmn-editor']
    })
    context.log.info('DMN Editor activity registered')
  }

  context.log.info('DMN Editor plugin activated')
}

/**
 * TSM lifecycle: deactivate
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating DMN Editor plugin...')

  // Unregister perspective
  const perspectiveManager = context.services.get<PerspectiveManager>('ui.registry.perspectives')
  if (perspectiveManager) {
    perspectiveManager.registry.unregister('dmn-editor')
  }

  context.services.unregister('ui.dmn-editor.components')
  context.log.info('DMN Editor plugin deactivated')
}
