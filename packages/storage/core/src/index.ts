/**
 * storage-core
 *
 * Core storage abstractions and registry
 * Supports TSM lifecycle for service registration
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'
import { StorageAdapterRegistry } from './StorageAdapterRegistry'

// Re-export model types
export * from 'storage-model';

// Adapter interface and base class
export type {
  StorageAdapter,
  ConnectionOptions,
  SyncResult,
  SyncError
} from './StorageAdapter';
export { BaseStorageAdapter } from './StorageAdapter';

// Registry
export type { RegistryObserver } from './StorageAdapterRegistry';
export { StorageAdapterRegistry };

/**
 * TSM lifecycle: activate
 * Registers the StorageAdapterRegistry via bindClass
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Storage Core...')

  context.services.bindClass('storage.registry', StorageAdapterRegistry)

  context.log.info('StorageAdapterRegistry registered via bindClass')
}

/**
 * TSM lifecycle: deactivate
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Storage Core...')
  context.services.unregister('storage.registry')
}
