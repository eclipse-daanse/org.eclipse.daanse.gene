/**
 * storage-indexeddb
 *
 * IndexedDB storage adapter for browser-local storage
 * Supports TSM lifecycle for plugin-based loading
 */

import { IndexedDBAdapter } from './IndexedDBAdapter'
import type { ModuleContext } from '@eclipse-daanse/tsm'
import type { StorageAdapterRegistry } from 'storage-core'

export { IndexedDBAdapter } from './IndexedDBAdapter'

// Adapter instance for lifecycle management
let adapter: IndexedDBAdapter | null = null

/**
 * TSM lifecycle: activate
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating IndexedDB Storage adapter...')

  const registry = context.services.getRequired<StorageAdapterRegistry>('storage.registry')

  adapter = new IndexedDBAdapter()
  registry.register(adapter)

  // Also register adapter as TSM service
  context.services.register('storage.adapter.indexeddb', adapter)

  context.log.info('IndexedDB adapter registered')
}

/**
 * TSM lifecycle: deactivate
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating IndexedDB Storage adapter...')

  if (adapter) {
    // Get registry and unregister by type
    const registry = context.services.get<StorageAdapterRegistry>('storage.registry')
    if (registry) {
      registry.unregister(adapter.type)
    }
    context.services.unregister('storage.adapter.indexeddb')
    adapter = null
  }
}
