/**
 * Action System Types
 * Runtime types for action execution (separate from EMF model types)
 */

import type { EObject, EClass } from '@emfts/core'

/** Context passed to action execution */
export interface ActionContext {
  selectedObject: EObject | null
  selectedObjects: EObject[]
  perspectiveId: string
  workspaceId?: string
  timestamp: Date
}

/** Result of action execution */
export interface ActionResult {
  status: 'SUCCESS' | 'WARNING' | 'ERROR' | 'CANCELED'
  logs: LogEntry[]
  artifacts: Artifact[]
}

export interface LogEntry {
  message: string
  detail?: string
  objectUri?: string
  level: 'INFO' | 'WARN' | 'ERROR'
  timestamp: Date
}

export interface Artifact {
  type: string  // matches ReturnType enum values
  name: string
  data: unknown
}

export interface FileArtifact extends Artifact {
  type: 'FILE'
  fileName: string
  mimeType: string
  content: Blob | string
  handling: string // FileHandling enum
}

export interface XmiArtifact extends Artifact {
  type: 'XMI'
  xmiContent: string
  importMode: string // XmiImportMode enum
  targetResourceUri?: string
}

export interface ValidationArtifact extends Artifact {
  type: 'VALIDATION_MESSAGES'
  messages: ValidationMessage[]
}

export interface ValidationMessage {
  severity: 'INFO' | 'WARN' | 'ERROR'
  message: string
  objectUri?: string
  className?: string
  featureName?: string
}

export interface MarkdownArtifact extends Artifact {
  type: 'MARKDOWN'
  content: string
}

/** Handler interface for InternalAction execution */
export interface ActionHandler {
  execute(context: HandlerContext): Promise<ActionResult>
}

export interface HandlerContext {
  input: CollectedInput
  parameters: Record<string, unknown>
  actionId: string
}

export interface CollectedInput {
  primaryObject: EObject | null
  additionalObjects: EObject[]
  schema?: any // EPackage
  context: ActionContext
}

/** Registered action info (wraps EMF AbstractAction with runtime metadata) */
export interface RegisteredAction {
  /** The EMF action definition */
  definition: any  // AbstractAction EMF instance
  /** Source: 'plugin' (from module activate) or 'workspace' (from EditorConfig) */
  source: 'plugin' | 'workspace'
  /** Module that registered this action */
  moduleId?: string
}

/** Event context passed to EventDispatcher */
export interface EventContext {
  type: 'lifecycle' | 'domain' | 'custom'
  eventData: Record<string, unknown>
  sourceObject?: EObject
  timestamp: Date
}
