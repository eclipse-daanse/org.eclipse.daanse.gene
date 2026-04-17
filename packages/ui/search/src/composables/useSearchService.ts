/**
 * Search Service Composable
 *
 * Provides full-text search over EObject instances with filtering,
 * OCL support, and breadcrumb generation.
 */

import { ref, shallowRef } from 'tsm:vue'
import type { Ref } from 'tsm:vue'
import type { EObject, EClass, EStructuralFeature, Resource } from '@emfts/core'
import type {
  SearchHit,
  SearchOptions,
  SearchFilters,
  BreadcrumbItem,
  SearchMode
} from '../types'

// Singleton state
const isSearching = ref(false)
const results = shallowRef<SearchHit[]>([])
const currentQuery = ref('')
const error = ref<string | null>(null)

// Cancellation
let searchAbortController: AbortController | null = null

// Views service reference (set externally to avoid circular deps)
let viewsService: any = null

/**
 * Set the views service for perspective-aware search
 */
export function setViewsService(service: any): void {
  viewsService = service
}

/**
 * Label attributes to check in order of preference
 */
const LABEL_ATTRIBUTES = ['name', 'id', 'key', 'title', 'label']

/**
 * Get a display label for an EObject
 */
export function getObjectLabel(obj: EObject): string {
  try {
    const eClass = obj.eClass()
    const className = eClass.getName() || 'Unknown'

    for (const attrName of LABEL_ATTRIBUTES) {
      const feature = eClass.getEStructuralFeature(attrName)
      if (feature) {
        const value = obj.eGet(feature)
        if (value !== undefined && value !== null && value !== '') {
          return `${className}: ${value}`
        }
      }
    }

    return className
  } catch (e) {
    return 'Unknown'
  }
}

/**
 * Build breadcrumb path from root to object
 */
export function buildBreadcrumb(obj: EObject): BreadcrumbItem[] {
  const breadcrumb: BreadcrumbItem[] = []
  let current: EObject | null = obj

  while (current !== null) {
    breadcrumb.unshift({
      object: current,
      label: getObjectLabel(current)
    })

    try {
      current = current.eContainer()
    } catch {
      current = null
    }
  }

  return breadcrumb
}

/**
 * Create a snippet with context around the match
 */
export function createSnippet(
  value: string,
  matchStart: number,
  matchEnd: number,
  contextLength: number = 30
): string {
  const start = Math.max(0, matchStart - contextLength)
  const end = Math.min(value.length, matchEnd + contextLength)

  let snippet = value.substring(start, end)

  if (start > 0) snippet = '...' + snippet
  if (end < value.length) snippet = snippet + '...'

  return snippet
}

/**
 * Convert any value to a searchable string
 */
function valueToString(value: any): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map(v => valueToString(v)).join(' ')
  }
  // For EObjects (references), get their label
  if (typeof value === 'object' && typeof value.eClass === 'function') {
    return getObjectLabel(value as EObject)
  }
  // Enum values
  if (typeof value === 'object' && value.name) {
    return value.name
  }
  return String(value)
}

/**
 * Check if an EClass matches the filter (with optional subclass checking)
 */
function matchesClassFilter(obj: EObject, filters: SearchFilters): boolean {
  if (!filters.classes || filters.classes.length === 0) return true

  const objClass = obj.eClass()
  const includeSubclasses = filters.includeSubclasses !== false

  for (const filterClass of filters.classes) {
    // Compare by name since EClass instances might be from different packages
    const objClassName = objClass.getName()
    const filterClassName = filterClass.getName()

    if (objClassName === filterClassName) return true
    if (objClass === filterClass) return true

    if (includeSubclasses) {
      // Check if objClass is a subtype of filterClass
      try {
        const superTypes = objClass.getEAllSuperTypes?.() || []
        for (const superType of superTypes) {
          if (superType === filterClass) return true
          // Also compare by name
          if (superType.getName() === filterClassName) return true
        }
      } catch {
        // Ignore errors in type checking
      }
    }
  }

  return false
}

/**
 * Check if an object is a descendant of another
 */
function isDescendantOf(obj: EObject, ancestor: EObject): boolean {
  let current: EObject | null = obj

  while (current !== null) {
    if (current === ancestor) return true
    try {
      current = current.eContainer()
    } catch {
      return false
    }
  }

  return false
}

/**
 * Check if object is visible in current view
 */
function isVisibleInView(obj: EObject): boolean {
  if (!viewsService) return true
  try {
    return viewsService.isNodeVisible(obj)
  } catch {
    return true
  }
}

/**
 * Transform OCL referenceFilter expression for evaluation
 * Replaces 'target' with 'self' so we can evaluate with the candidate object as context
 */
function transformReferenceFilterExpression(expression: string): string {
  // Replace 'target' with 'self' using word boundary matching
  // This handles: target.status, target <> self, target->includes(x)
  return expression.replace(/\btarget\b/g, 'self')
}

/**
 * Check if expression uses 'self' (which would refer to the source object)
 * We can't handle this case easily, so we'll mark but not filter
 */
function expressionUsesSelf(expression: string): boolean {
  // Look for standalone 'self' that's not part of 'target' replacement
  // After transformation, all 'target' becomes 'self', so we need to check original
  return /\bself\b/.test(expression)
}

/**
 * Main search function
 */
export async function search(
  query: string,
  resource: Resource,
  options: SearchOptions
): Promise<SearchHit[]> {
  // Allow empty query if class filter is set (for reference selection mode) or allowEmptyQuery
  const hasClassFilter = options.filters?.classes && options.filters.classes.length > 0
  if (!hasClassFilter && !options.allowEmptyQuery && (!query || query.length < 2)) {
    return []
  }

  // Cancel previous search
  searchAbortController?.abort()
  searchAbortController = new AbortController()
  const signal = searchAbortController.signal

  const hits: SearchHit[] = []
  const lowerQuery = query.toLowerCase()
  const maxResults = options.maxResults ?? 100

  // OCL filter setup
  const oclExpression = options.filters?.oclExpression
  const problemsService = options.filters?.problemsService
  const canEvaluateOcl = oclExpression && problemsService?.query
  const expressionHasSelf = oclExpression ? expressionUsesSelf(oclExpression) : false
  const transformedExpression = oclExpression ? transformReferenceFilterExpression(oclExpression) : null

  try {
    // Collect all objects from resource
    const objects: EObject[] = []
    for (const root of resource.getContents()) {
      if (signal.aborted) return []
      objects.push(root)

      // Use eAllContents if available, otherwise manual traversal
      const allContents = root.eAllContents?.()
      if (allContents) {
        for (const obj of allContents) {
          if (signal.aborted) return []
          objects.push(obj)
        }
      }
    }

    // Search through objects
    for (const obj of objects) {
      if (signal.aborted) return []
      if (hits.length >= maxResults) break

      // Perspective filter
      if (options.mode === 'perspective' && !isVisibleInView(obj)) {
        continue
      }

      // Class filter
      if (options.filters?.classes?.length) {
        if (!matchesClassFilter(obj, options.filters)) continue
      }

      // Container filter
      if (options.filters?.containerScope) {
        if (!isDescendantOf(obj, options.filters.containerScope)) continue
      }

      // Search through features
      try {
        const eClass = obj.eClass()
        const features = eClass.getEAllStructuralFeatures?.() || []

        // If no query, just add the object with its label (for reference selection)
        if (!query || query.length === 0) {
          const label = getObjectLabel(obj)
          // Find name feature for display
          const nameFeature = eClass.getEStructuralFeature('name') || features[0]
          hits.push({
            object: obj,
            feature: nameFeature,
            value: label,
            snippet: label,
            matchStart: 0,
            matchEnd: 0,
            breadcrumb: buildBreadcrumb(obj),
            isFilteredByOcl: false,
            oclEvaluated: false
          })
          continue
        }

        for (const feature of features) {
          if (signal.aborted) return []
          if (hits.length >= maxResults) break

          try {
            const value = obj.eGet(feature)
            const stringValue = valueToString(value)

            if (!stringValue) continue

            const matchIndex = stringValue.toLowerCase().indexOf(lowerQuery)
            if (matchIndex >= 0) {
              hits.push({
                object: obj,
                feature,
                value: stringValue,
                snippet: createSnippet(stringValue, matchIndex, matchIndex + query.length),
                matchStart: matchIndex,
                matchEnd: matchIndex + query.length,
                breadcrumb: buildBreadcrumb(obj),
                isFilteredByOcl: false,
                oclEvaluated: false
              })
            }
          } catch {
            // Skip features that can't be accessed
          }
        }
      } catch {
        // Skip objects that can't be analyzed
      }
    }

    // Apply OCL filter to hits if configured
    if (canEvaluateOcl && transformedExpression && !expressionHasSelf) {
      console.log('[Search] Applying OCL referenceFilter:', oclExpression)

      // Deduplicate hits by object (same object might match multiple features)
      const processedObjects = new Set<EObject>()

      for (const hit of hits) {
        if (processedObjects.has(hit.object)) {
          // Copy OCL result from first hit of this object
          const firstHit = hits.find(h => h.object === hit.object && h.oclEvaluated)
          if (firstHit) {
            hit.isFilteredByOcl = firstHit.isFilteredByOcl
            hit.oclFilterReason = firstHit.oclFilterReason
            hit.oclEvaluated = true
          }
          continue
        }

        processedObjects.add(hit.object)

        try {
          // Evaluate OCL with candidate object as 'self' (transformed from 'target')
          const result = await problemsService.query(hit.object, transformedExpression)
          hit.oclEvaluated = true

          if (result !== true) {
            hit.isFilteredByOcl = true
            hit.oclFilterReason = `Filter: ${oclExpression}`
          }
        } catch (e) {
          console.warn('[Search] OCL evaluation error for', getObjectLabel(hit.object), ':', e)
          hit.oclEvaluated = true
          hit.oclFilterReason = `OCL Error: ${(e as Error).message}`
          // Don't filter on error - let user see the object
        }
      }
    } else if (canEvaluateOcl && expressionHasSelf) {
      // Expression uses both 'self' and 'target' - can't evaluate without sourceObject context
      console.warn('[Search] OCL referenceFilter uses both self and target, cannot evaluate:', oclExpression)
      for (const hit of hits) {
        hit.oclEvaluated = false
        hit.oclFilterReason = 'Complex filter with self reference (not evaluated)'
      }
    }

    return hits
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      return []
    }
    throw e
  }
}

/**
 * Apply OCL filter to a single hit
 */
export async function applyOclFilter(
  obj: EObject,
  expression: string,
  problemsService?: any
): Promise<{ passes: boolean; reason?: string }> {
  if (!expression || !problemsService?.query) {
    return { passes: true }
  }

  try {
    const result = await problemsService.query(obj, expression)
    return {
      passes: result === true,
      reason: result === true ? undefined : `OCL: ${expression}`
    }
  } catch (e) {
    return {
      passes: true, // On error, show the object but with warning
      reason: `OCL Error: ${(e as Error).message}`
    }
  }
}

/**
 * Search service composable
 */
export function useSearchService() {
  return {
    // State
    isSearching,
    results,
    currentQuery,
    error,

    // Functions
    search,
    getObjectLabel,
    buildBreadcrumb,
    createSnippet,
    applyOclFilter,
    setViewsService,

    // Cancel current search
    cancel: () => {
      searchAbortController?.abort()
    }
  }
}

/**
 * Get shared search service instance
 */
export function useSharedSearchService() {
  return useSearchService()
}
