/**
 * ui-workspace
 *
 * UI components for workspace management
 * Supports TSM lifecycle for plugin-based loading
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import type { StorageAdapterRegistry } from 'storage-core'

// Components
export * from './components'

// Composables
export * from './composables'

// Re-export for TSM service access
import { WorkspaceExplorer } from './components'
import { useWorkspace, useSharedWorkspace, waitForWorkspaceInit, useFileTree, setStorageRegistry } from './composables'

/**
 * TSM lifecycle: activate
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating UI Workspace module...')

  // Inject storage registry dependency
  const storageRegistry = context.services.getRequired<StorageAdapterRegistry>('storage.registry')
  setStorageRegistry(storageRegistry)

  // Register components as service
  context.services.register('ui.workspace.components', {
    WorkspaceExplorer
  })

  // Register composables as service
  context.services.register('ui.workspace.composables', {
    useWorkspace,
    useSharedWorkspace,
    waitForWorkspaceInit,
    useFileTree
  })

  context.log.info('UI Workspace module activated')
}

/**
 * TSM lifecycle: deactivate
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating UI Workspace module...')

  context.services.unregister('ui.workspace.components')
  context.services.unregister('ui.workspace.composables')

  context.log.info('UI Workspace module deactivated')
}
