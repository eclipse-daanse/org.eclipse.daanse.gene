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
  proposedActions?: ProposedAction[]
}

/** Server-proposed follow-up command (requires user approval) */
export interface ProposedAction {
  commandId: string
  label: string
  description?: string
  args?: string
  autoExecute?: boolean
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

// ─── Job & Async Types ────────────────────────────────────────────

export type JobState = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELED'

export interface Job {
  id: string
  actionId: string
  actionLabel: string
  status: JobState
  progress: number
  progressMessage: string
  startedAt: Date
  completedAt: Date | null
  logs: JobLogEntry[]
  result: ActionResult | null
  /** Remote job ID (from server) */
  remoteJobId: string | null
  /** Async configuration for polling */
  asyncConfig: AsyncConfig | null
  /** Cancel function (set by poller) */
  cancelFn: (() => void) | null
}

export interface JobLogEntry {
  message: string
  level: 'INFO' | 'WARN' | 'ERROR'
  timestamp: string
}

export interface AsyncConfig {
  pollIntervalMs: number
  maxJobDurationMs: number
  statusEndpoint: string
  cancelEndpoint: string
  resultEndpoint: string
}

export interface JobStatusResponse {
  jobId: string
  status: JobState
  progress: number
  progressMessage: string
  startedAt?: string
  logs?: JobLogEntry[]
}

// ─── Discovery Types ──────────────────────────────────────────────

export interface ServiceAuthConfig {
  authMethod: string
  authorizationEndpoint?: string
  tokenEndpoint?: string
  logoutEndpoint?: string
  clientId?: string
  scopes?: string
  issuer?: string
}

export interface ServiceCapabilities {
  name: string
  version: string
  endpoints: Endpoint[]
  jobManagement?: JobManagement
  authConfig?: ServiceAuthConfig
}

export interface Endpoint {
  id: string
  name: string
  description: string
  path: string
  httpMethod: string
  inputType: string
  outputType: string
  asyncSupported: boolean
  parameters: EndpointParameter[]
  category: string
}

export interface EndpointParameter {
  name: string
  type: string
  required: boolean
  description: string
  defaultValue?: string
}

export interface JobManagement {
  statusEndpoint: string
  cancelEndpoint: string
  resultEndpoint: string
  pollIntervalMs: number
  maxJobDurationMs: number
}
