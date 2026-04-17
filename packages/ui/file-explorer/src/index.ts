/**
 * File Explorer Module
 *
 * Provides local file system browsing using the File System Access API.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { markRaw } from 'tsm:vue'
import type { PanelRegistry, ActivityRegistry, PerspectiveManager } from 'ui-perspectives'

// Re-export types
export * from './types'

// Re-export composables
export { useFileSystem, useSharedFileSystem } from './composables/useFileSystem'

// Re-export components
export { FileExplorer, WorkspacePreview } from './components'

// Import for service registration
import * as components from './components'
import { useFileSystem, useSharedFileSystem } from './composables/useFileSystem'

/**
 * TSM lifecycle: activate
 * Registers file explorer services and panels
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating File Explorer module...')

  // Register components as service (legacy)
  context.services.register('ui.file-explorer.components', components)

  // Register shared file system as TSM service
  const sharedFS = useSharedFileSystem()
  context.services.register('gene.filesystem', sharedFS)

  // Register composables as service (legacy)
  context.services.register('ui.file-explorer.composables', {
    useFileSystem,
    useSharedFileSystem
  })

  // Register explorer perspective
  const perspectiveManager = context.services.get<PerspectiveManager>('ui.registry.perspectives')
  if (perspectiveManager) {
    perspectiveManager.registry.register({
      id: 'explorer',
      name: 'Explorer',
      icon: 'pi pi-folder',
      requiresWorkspace: false,
      order: 0,
      defaultLayout: {
        left: ['file-explorer'],
        center: ['workspace-preview'],
        right: [],
        bottom: []
      },
      defaultVisibility: { left: true, right: false, bottom: false }
    })
    context.log.info('Explorer perspective registered')
  }

  // Register with panel registry
  const panelRegistry = context.services.get<PanelRegistry>('ui.registry.panels')
  if (panelRegistry) {
    // File explorer sidebar panel
    panelRegistry.register({
      id: 'file-explorer',
      title: 'Explorer',
      icon: 'pi pi-folder',
      component: markRaw(components.FileExplorer),
      perspectives: ['explorer'],
      defaultLocation: 'left',
      defaultOrder: 0
    })
    context.log.info('File Explorer panel registered')

    // Workspace preview panel for center
    panelRegistry.register({
      id: 'workspace-preview',
      title: 'Workspace',
      icon: 'pi pi-box',
      component: markRaw(components.WorkspacePreview),
      perspectives: ['explorer'],
      defaultLocation: 'center',
      defaultOrder: 0,
      closable: false
    })
    context.log.info('Workspace preview panel registered')
  }

  // Register with activity registry
  const activityRegistry = context.services.get<ActivityRegistry>('ui.registry.activities')
  if (activityRegistry) {
    activityRegistry.register({
      id: 'file-explorer',
      icon: 'pi pi-folder',
      label: 'Explorer',
      tooltip: 'File Explorer',
      panelId: 'file-explorer',
      perspectiveId: 'explorer',
      order: 0,
      perspectives: ['explorer']
    })
    context.log.info('File Explorer activity registered')
  }

  context.log.info('File Explorer module activated')
}

/**
 * TSM lifecycle: deactivate
 * Unregisters services
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating File Explorer module...')

  // Unregister from registries
  const panelRegistry = context.services.get<PanelRegistry>('ui.registry.panels')
  if (panelRegistry) {
    panelRegistry.unregister('file-explorer')
  }

  const activityRegistry = context.services.get<ActivityRegistry>('ui.registry.activities')
  if (activityRegistry) {
    activityRegistry.unregister('file-explorer')
  }

  context.services.unregister('gene.filesystem')
  context.services.unregister('ui.file-explorer.components')
  context.services.unregister('ui.file-explorer.composables')

  context.log.info('File Explorer module deactivated')
}
