/**
 * storage-git
 *
 * Git storage adapter for GitHub, Gitea, etc.
 * Supports TSM lifecycle for plugin-based loading
 */

import { GitAdapter } from './GitAdapter'
import type { ModuleContext } from '@eclipse-daanse/tsm'
import type { StorageAdapterRegistry } from 'storage-core'

export { GitAdapter, type GitConnectionOptions } from './GitAdapter'
export { GitHubApi, type GitHubOptions } from './GitHubApi'

// Adapter instance for lifecycle management
let adapter: GitAdapter | null = null

/**
 * TSM lifecycle: activate
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Git Storage adapter...')

  const registry = context.services.getRequired<StorageAdapterRegistry>('storage.registry')

  adapter = new GitAdapter()
  registry.register(adapter)

  // Also register adapter as TSM service
  context.services.register('storage.adapter.git', adapter)

  context.log.info('Git adapter registered')
}

/**
 * TSM lifecycle: deactivate
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Git Storage adapter...')

  if (adapter) {
    // Get registry and unregister by type
    const registry = context.services.get<StorageAdapterRegistry>('storage.registry')
    if (registry) {
      registry.unregister(adapter.type)
    }
    context.services.unregister('storage.adapter.git')
    adapter = null
  }
}
