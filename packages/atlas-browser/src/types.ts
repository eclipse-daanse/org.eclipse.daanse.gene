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
  /**
   * Authentication token (optional).
   *
   * @deprecated Kept for callers that still pass one; it counts as Bearer and
   * moves into the session credential store. Use `auth` instead.
   */
  token?: string
  /** How this connection authenticates — never the secret itself */
  auth?: { kind: 'none' | 'bearer' | 'basic'; user?: string }
  /** Connection status */
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  /** Error message if status is 'error' */
  error?: string
}

/**
 * Types of nodes in the atlas tree
 */
export type AtlasNodeType =
  | 'connection'
  | 'scope'
  | 'registry'
  | 'stage'
  | 'schema'
  | 'object'
  /** A connection that could not be established — carries its reason */
  | 'error'

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
  /**
   * Stage-Flags des Servers, wie gemeldet (nur an Stage-Knoten).
   *
   * `writable` und `final` bedeuten Verschiedenes: `final` heisst nur, dass
   * von dieser Stage keine Transition mehr weiterfuehrt — geschrieben und
   * geloescht werden darf trotzdem. Der Fennec-Atlas meldet fuer `release`
   * beides zugleich.
   */
  stageWritable?: boolean
  stageFinal?: boolean
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
  /**
   * The secret as entered: a Bearer token or a Basic password. It is handed to
   * the session credential store and not kept on the connection.
   */
  token: string
  /** 'none' | 'bearer' | 'basic'; defaults to bearer when a token is given */
  authKind?: 'none' | 'bearer' | 'basic'
  /** User name for Basic */
  user?: string
}
