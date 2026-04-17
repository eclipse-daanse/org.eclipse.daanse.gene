/**
 * OCL Panel Types
 *
 * Type definitions for OCL validation issues and service state.
 */

import type { EObject, EClass, EPackage } from '@emfts/core'

/**
 * Severity level for validation issues
 */
export type IssueSeverity = 'error' | 'warning' | 'info'

/**
 * Issue source type
 */
export type IssueSource = 'ocl' | 'ocl-live' | 'xmi-parser' | 'general' | 'unresolved-proxy' | 'cocl-loader'

/**
 * A single validation/parser issue
 */
export interface OclValidationIssue {
  /** Unique identifier for this issue */
  id: string
  /** Severity level */
  severity: IssueSeverity
  /** Human-readable message */
  message: string
  /** Source of the issue (ocl, xmi-parser, general) */
  source?: IssueSource
  /** Name of the constraint that failed (if available) */
  constraintName?: string
  /** The EObject that has the issue (optional for parser errors) */
  object?: EObject
  /** Human-readable label for the object */
  objectLabel: string
  /** Name of the EClass */
  eClassName: string
  /** The feature involved (if applicable) */
  featureName?: string
  /** File path for parser errors */
  filePath?: string
  /** Line number for parser errors */
  line?: number
  /** Column number for parser errors */
  column?: number
  /** Timestamp when this issue was detected */
  timestamp: Date
}

/**
 * OCL Service state
 */
export interface OclServiceState {
  /** Current validation issues */
  issues: OclValidationIssue[]
  /** Whether validation is currently in progress */
  isValidating: boolean
  /** Timestamp of last validation */
  lastValidation: Date | null
  /** Number of registered constraints */
  constraintCount: number
  /** Number of registered packages */
  packageCount: number
}

/**
 * Filter options for the OCL panel
 */
export interface OclPanelFilter {
  /** Filter by severity (null = show all) */
  severity: IssueSeverity | null
  /** Filter by EClass name (null = show all) */
  eClassName: string | null
  /** Search text for message */
  searchText: string
}

/**
 * Statistics for the validation results
 */
export interface OclValidationStats {
  /** Number of errors */
  errorCount: number
  /** Number of warnings */
  warningCount: number
  /** Number of info messages */
  infoCount: number
  /** Total issue count */
  totalCount: number
}

/**
 * Options for the OCL service
 */
export interface OclServiceOptions {
  /** Debounce time in ms for on-change validation (default: 300) */
  debounceMs?: number
  /** Whether to validate recursively (default: true) */
  recursive?: boolean
  /** Whether to stop on first failure (default: false) */
  stopOnFirstFailure?: boolean
}

/**
 * Callback for when an issue is selected in the panel
 */
export type OnIssueSelectCallback = (issue: OclValidationIssue) => void
