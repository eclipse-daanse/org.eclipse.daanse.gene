/**
 * SearchDataSource — maps useSearchService results to PickerItem[].
 */

import type { Resource, EClass, EObject } from '@emfts/core'
import type { PickerItem, PickerDataSource, SearchFilters, SearchHit, ReferenceSelectionOptions } from '../types'
import { useSearchService, getObjectLabel, buildBreadcrumb } from '../composables/useSearchService'

export interface SearchDataSourceOptions {
  resource: Resource
  referenceOptions?: ReferenceSelectionOptions
  problemsService?: { query: (obj: any, expression: string) => Promise<unknown> }
  browseMode?: boolean
  candidates?: EObject[]
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function hitToPickerItem(hit: SearchHit, query: string): PickerItem {
  // Build snippet HTML with match highlighting
  let snippetHtml: string | undefined
  if (hit.snippet) {
    const q = query.toLowerCase()
    const lowerSnippet = hit.snippet.toLowerCase()
    const idx = lowerSnippet.indexOf(q)
    if (q && idx >= 0) {
      const before = hit.snippet.substring(0, idx)
      const match = hit.snippet.substring(idx, idx + q.length)
      const after = hit.snippet.substring(idx + q.length)
      snippetHtml = `${escapeHtml(before)}<mark>${escapeHtml(match)}</mark>${escapeHtml(after)}`
    } else {
      snippetHtml = escapeHtml(hit.snippet)
    }
  }

  // Breadcrumb string
  const breadcrumb = hit.breadcrumb?.length
    ? hit.breadcrumb.map(b => b.label).join(' > ')
    : undefined

  // Icon
  let icon = 'pi pi-file'
  try {
    const eClass = hit.object.eClass()
    if (eClass.isAbstract()) icon = 'pi pi-box'
  } catch { /* keep default */ }

  // Secondary label (feature name)
  const secondaryLabel = hit.feature ? hit.feature.getName() : undefined

  return {
    key: hitKey(hit),
    label: hit.value || getObjectLabel(hit.object),
    secondaryLabel,
    icon,
    breadcrumb,
    snippetHtml,
    disabled: hit.isFilteredByOcl,
    disabledReason: hit.isFilteredByOcl
      ? (hit.oclFilterReason || 'OCL constraint not satisfied')
      : undefined,
    payload: hit
  }
}

function hitKey(hit: SearchHit): string {
  try {
    const objId = (hit.object as any).eGetId?.() || ''
    const featureName = hit.feature?.getName?.() || ''
    return `${objId}-${featureName}`
  } catch {
    return `hit-${Math.random()}`
  }
}

function buildFilters(opts: SearchDataSourceOptions): SearchFilters {
  const filters: SearchFilters = {}
  if (opts.referenceOptions?.reference) {
    const refType = opts.referenceOptions.reference.getEReferenceType()
    if (refType) {
      filters.classes = [refType]
      filters.includeSubclasses = true
    }
    if (opts.referenceOptions.oclConstraint) {
      filters.oclExpression = opts.referenceOptions.oclConstraint
    }
    if (opts.referenceOptions.sourceObject) {
      filters.sourceObject = opts.referenceOptions.sourceObject
    }
    if (opts.problemsService) {
      filters.problemsService = opts.problemsService
    }
  }
  return filters
}

/** Search within pre-collected candidates (for Ecore meta-type references). */
function searchCandidates(candidates: EObject[], query: string): PickerItem[] {
  const q = query.toLowerCase()
  const items: PickerItem[] = []
  for (const obj of candidates) {
    const featureName = getObjectLabel(obj)
    const container = (obj as any).eContainer?.()
    const ownerName = container && typeof container.getName === 'function' ? container.getName() : null
    const label = ownerName ? `${featureName} (${ownerName})` : featureName

    if (!q || label.toLowerCase().includes(q)) {
      items.push({
        key: `cand-${label}-${items.length}`,
        label,
        icon: 'pi pi-file',
        breadcrumb: ownerName || undefined,
        payload: {
          object: obj,
          feature: null,
          value: label,
          snippet: label,
          matchStart: 0,
          matchEnd: 0,
          breadcrumb: ownerName ? [{ label: ownerName, eClass: container }] : [],
          isFilteredByOcl: false
        } as SearchHit
      })
    }
  }
  return items
}

export function createSearchDataSource(opts: SearchDataSourceOptions): PickerDataSource {
  const searchService = useSearchService()
  const isRefOrBrowse = !!opts.referenceOptions || !!opts.browseMode

  return {
    minQueryLength: isRefOrBrowse ? 0 : 2,

    async loadInitial(): Promise<PickerItem[]> {
      if (!isRefOrBrowse) return []
      if (opts.candidates) return searchCandidates(opts.candidates, '')

      const filters = buildFilters(opts)
      const hits = await searchService.search('', opts.resource, {
        mode: 'global',
        filters,
        maxResults: 100,
        allowEmptyQuery: true
      })
      return hits.map(h => hitToPickerItem(h, ''))
    },

    async search(query: string): Promise<PickerItem[]> {
      if (opts.candidates) return searchCandidates(opts.candidates, query)

      const filters = buildFilters(opts)
      const hits = await searchService.search(query, opts.resource, {
        mode: isRefOrBrowse ? 'global' : 'perspective',
        filters,
        maxResults: isRefOrBrowse ? 100 : 50,
        allowEmptyQuery: isRefOrBrowse
      })
      // Sort: available items first
      hits.sort((a, b) => {
        if (a.isFilteredByOcl && !b.isFilteredByOcl) return 1
        if (!a.isFilteredByOcl && b.isFilteredByOcl) return -1
        return 0
      })
      return hits.map(h => hitToPickerItem(h, query))
    }
  }
}
