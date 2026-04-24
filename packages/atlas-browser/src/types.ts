/**
 * Atlas Browser Types
 */

import type { ObjectMetadata } from 'storage-model-atlas'

/**
 * Atlas server connection configuration
 */
export interface AtlasConnection {
  /** Unique connection ID */
  id: string
  /** Display label */
  label: string
  /** Base URL of the Atlas REST API */
  baseUrl: string
  /** Scope name */
  scopeName: string
  /** Authentication token (optional) */
  token?: string
  /** Connection status */
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  /** Error message if status is 'error' */
  error?: string
}

/**
 * Types of nodes in the atlas tree
 */
export type AtlasNodeType = 'connection' | 'scope' | 'registry' | 'stage' | 'schema' | 'object'

/**
 * Atlas tree node data (attached to PrimeVue TreeNode)
 */
export interface AtlasTreeNodeData {
  /** Node type */
  type: AtlasNodeType
  /** Connection ID this node belongs to */
  connectionId: string
  /** Scope name */
  scopeName?: string
  /** Registry name */
  registryName?: string
  /** Stage name */
  stageName?: string
  /** Whether this is a schema registry */
  isSchemaRegistry?: boolean
  /** Schema/Object nsURI or objectId */
  objectId?: string
  /** Full metadata (for schema/object nodes) */
  metadata?: ObjectMetadata
}

/**
 * Connect dialog form data
 */
export interface ConnectFormData {
  baseUrl: string
  scopeName: string
  token: string
}
