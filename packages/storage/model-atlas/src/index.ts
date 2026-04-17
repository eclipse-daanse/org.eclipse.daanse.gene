/**
 * storage-model-atlas
 *
 * Model Atlas storage adapter for remote EMF model management.
 * Connects to a Model Atlas server via REST API.
 * Uses EMFTs-generated classes for XMI serialization/deserialization.
 */

import { ModelAtlasAdapter } from './ModelAtlasAdapter'
import type { ModuleContext } from '@eclipse-daanse/tsm'
import { StorageAdapterRegistry } from 'storage-core'
import { EPackageRegistry } from '@emfts/core'
import { ManagementPackage } from './generated/management'
import { WorkflowApiPackage } from './generated/workflowapi'
import { RestPackage } from './generated/rest'

// Re-export adapter and client
export { ModelAtlasAdapter, type AtlasConnectionOptions } from './ModelAtlasAdapter'
export { ModelAtlasClient, type ModelAtlasClientOptions, type ValidationDiagnostic } from './ModelAtlasClient'

// Re-export config types
export type { AtlasConfig, AtlasMediaType } from './types'
export { ATLAS_MEDIA_TYPES } from './types'

// Re-export generated EMFTs types
export type { ObjectMetadata, ObjectMetadataContainer } from './generated/management'
export { ManagementPackage, ManagementFactory, ObjectStatus } from './generated/management'
export type { Scope, Registry, Stage, StageTransition, ScopeListResponse } from './generated/workflowapi'
export { WorkflowApiPackage, WorkflowApiFactory } from './generated/workflowapi'
export type { ErrorResponse, StageTransitionRequest, EPackageInfo } from './generated/rest'
export { RestPackage, RestFactory } from './generated/rest'

// Re-export XMI parsing helpers
export {
  parseXMI,
  parseScopeXmi,
  parseScopeListXmi,
  parseMetadataListXmi,
  parseMetadataXmi,
  serializeTransitionXmi
} from './AtlasResourceSet'

// Adapter instance for lifecycle management
let adapter: ModelAtlasAdapter | null = null

/**
 * TSM lifecycle: activate
 * Registers Atlas EPackages globally and registers the storage adapter
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Model Atlas Storage adapter...')

  // Register Atlas EPackages in global registry for XMI parsing
  EPackageRegistry.INSTANCE.set(ManagementPackage.eNS_URI, ManagementPackage.eINSTANCE)
  EPackageRegistry.INSTANCE.set(WorkflowApiPackage.eNS_URI, WorkflowApiPackage.eINSTANCE)
  EPackageRegistry.INSTANCE.set(RestPackage.eNS_URI, RestPackage.eINSTANCE)

  const registry = context.services.getRequired<StorageAdapterRegistry>('storage.registry')
  adapter = new ModelAtlasAdapter()
  registry.register(adapter)

  context.services.register('storage.adapter.model-atlas', adapter)
  context.log.info('Model Atlas adapter registered with EMFTs packages')
}

/**
 * TSM lifecycle: deactivate
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Model Atlas Storage adapter...')

  if (adapter) {
    const registry = context.services.get<StorageAdapterRegistry>('storage.registry')
    if (registry) registry.unregister(adapter.type)
    context.services.unregister('storage.adapter.model-atlas')
    adapter = null
  }

  // Unregister Atlas EPackages
  EPackageRegistry.INSTANCE.delete(ManagementPackage.eNS_URI)
  EPackageRegistry.INSTANCE.delete(WorkflowApiPackage.eNS_URI)
  EPackageRegistry.INSTANCE.delete(RestPackage.eNS_URI)
}