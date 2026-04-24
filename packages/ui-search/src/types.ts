/**
 * Search Types
 *
 * Type definitions for the full-text search service.
 */

import type { EObject, EClass, EStructuralFeature, EReference, Resource } from '@emfts/core'

/**
 * Search mode - scoped to current perspective or global
 */
export type SearchMode = 'perspective' | 'global'

/**
 * Filter options for search
 */
export interface SearchFilters {
  /** Filter by specific classes */
  classes?: EClass[]
  /** Include subclasses in class filter (default: true) */
  includeSubclasses?: boolean
  /** Limit search to descendants of this container */
  containerScope?: EObject
  /** OCL expression to filter results (uses 'target' for candidate object) */
  oclExpression?: string
  /** Source object for OCL filter context ('self' in OCL expression) */
  sourceObject?: EObject
  /** Problems service for OCL evaluation */
  problemsService?: {
    query: (obj: EObject, expression: string) => Promise<unknown>
  }
}

/**
 * A single search hit
 */
export interface SearchHit {
  /** The object that matched */
  object: EObject
  /** The feature (attribute/reference) that matched */
  feature: EStructuralFeature
  /** The raw value that matched */
  value: string
  /** Snippet with context around the match */
  snippet: string
  /** Start position of match in value */
  matchStart: number
  /** End position of match in value */
  matchEnd: number
  /** Path from root to object */
  breadcrumb: BreadcrumbItem[]
  /** Whether object is filtered out by OCL (shown but not selectable) */
  isFilteredByOcl: boolean
  /** Reason why OCL filter excluded this object */
  oclFilterReason?: string
  /** Whether OCL has been evaluated for this hit */
  oclEvaluated?: boolean
}

/**
 * A breadcrumb item (one level in the path)
 */
export interface BreadcrumbItem {
  /** The object at this level */
  object: EObject
  /** Display label for this object */
  label: string
}

/**
 * Search options
 */
export interface SearchOptions {
  /** Search mode - scoped or global */
  mode: SearchMode
  /** Filter options */
  filters?: SearchFilters
  /** Maximum number of results (default: 100) */
  maxResults?: number
  /** Allow empty/short queries (for browse mode) */
  allowEmptyQuery?: boolean
}

/**
 * Options for reference selection mode
 */
export interface ReferenceSelectionOptions {
  /** The object whose reference is being set */
  sourceObject: EObject
  /** The reference being set */
  reference: EReference
  /** OCL constraint from reference annotation */
  oclConstraint?: string
  /** Callback when a hit is selected */
  onSelect?: (hit: SearchHit) => void
}

/**
 * Search service state
 */
export interface SearchState {
  /** Whether a search is in progress */
  isSearching: boolean
  /** Current search results */
  results: SearchHit[]
  /** Current search query */
  query: string
  /** Current search mode */
  mode: SearchMode
  /** Current filters */
  filters: SearchFilters
  /** Error message if search failed */
  error: string | null
}

/**
 * Navigation behavior when selecting a hit outside current view
 */
export type NavigationBehavior = 'navigate_only' | 'switch_view' | 'ask_user'
