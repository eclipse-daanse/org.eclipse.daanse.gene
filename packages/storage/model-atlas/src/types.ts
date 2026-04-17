/**
 * Model Atlas configuration and media types
 *
 * DTO types (ObjectMetadata, Scope, etc.) are generated from Ecore models
 * in ./generated/ - see management, workflowapi, and rest packages.
 */

/**
 * Configuration for connecting to a Model Atlas server.
 * Used as connection data in the StorageAdapter.
 */
export interface AtlasConfig {
  /** Base URL of the Model Atlas REST API (e.g. http://localhost:8185/rest) */
  baseUrl: string
  /** Scope to connect to */
  scopeName: string
  /** Authentication token (optional) */
  token?: string
}

export const ATLAS_MEDIA_TYPES = {
  ECORE_XMI: 'application/xml',
  XMI: 'application/xmi',
  JSON: 'application/json',
  JSON_SCHEMA: 'application/schema+json',
  XSD: 'application/schema+xml',
  UML: 'application/uml',
  TEXT: 'text/plain'
} as const

export type AtlasMediaType = typeof ATLAS_MEDIA_TYPES[keyof typeof ATLAS_MEDIA_TYPES]