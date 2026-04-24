<script setup lang="ts">
/**
 * SearchDialog - Command Palette style full-text search
 *
 * Provides search across all EObject instances with:
 * - Perspective/Global search modes
 * - Class and container filters
 * - OCL expression filtering
 * - Keyboard navigation
 * - Reference selection mode
 */

import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'tsm:vue'
import type { Resource, EClass, EObject } from '@emfts/core'
import type { SearchHit, SearchMode, SearchFilters, ReferenceSelectionOptions } from '../types'
import { useSearchService, getObjectLabel, buildBreadcrumb } from '../composables/useSearchService'

const props = defineProps<{
  visible: boolean
  resource: Resource
  /** Optional: For reference selection mode */
  referenceOptions?: ReferenceSelectionOptions
  /** Available classes for filter dropdown */
  availableClasses?: EClass[]
  /** Problems service for OCL evaluation (required for referenceFilter) */
  problemsService?: {
    query: (obj: any, expression: string) => Promise<unknown>
  }
  /** Browse mode: loads all objects on open, allows empty query (like reference mode but without type filter) */
  browseMode?: boolean
}>()

const emit = defineEmits<{
  'close': []
  'select': [hit: SearchHit]
  'navigate': [object: EObject]
}>()

// Search service
const searchService = useSearchService()

// Local state
const searchQuery = ref('')
const searchMode = ref<SearchMode>('perspective')
const selectedIndex = ref(0)
const isSearching = ref(false)
const localResults = ref<SearchHit[]>([])
const inputRef = ref<HTMLInputElement | null>(null)
const resultsContainerRef = ref<HTMLDivElement | null>(null)
const hideUnavailable = ref(false)

// Debounce timer
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Computed: Is this reference selection mode?
const isReferenceMode = computed(() => !!props.referenceOptions)

// Computed: Allow empty query and initial load (reference mode or browse mode)
const allowsEmptyQuery = computed(() => isReferenceMode.value || !!props.browseMode)

// Computed: Title
const dialogTitle = computed(() => {
  if (isReferenceMode.value) {
    const refName = props.referenceOptions?.reference.getName()
    return `Select ${refName}`
  }
  return 'Search'
})

// Mode options
const modeOptions = [
  { value: 'perspective', label: 'Current View', icon: 'pi pi-eye' },
  { value: 'global', label: 'All', icon: 'pi pi-globe' }
]

// Computed: Sorted and filtered results (available first, optionally hide unavailable)
const displayResults = computed(() => {
  let results = [...localResults.value]

  // Sort: available items first
  results.sort((a, b) => {
    if (a.isFilteredByOcl && !b.isFilteredByOcl) return 1
    if (!a.isFilteredByOcl && b.isFilteredByOcl) return -1
    return 0
  })

  // Filter: hide unavailable if option is enabled
  if (hideUnavailable.value) {
    results = results.filter(r => !r.isFilteredByOcl)
  }

  return results
})

// Count of unavailable items
const unavailableCount = computed(() => {
  return localResults.value.filter(r => r.isFilteredByOcl).length
})

// Execute search with debounce
function onSearchInput() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }

  const query = searchQuery.value.trim()

  // In reference/browse mode, allow empty query (shows all matching objects)
  // In normal mode, require at least 2 characters
  if (!allowsEmptyQuery.value && query.length < 2) {
    localResults.value = []
    return
  }

  debounceTimer = setTimeout(async () => {
    isSearching.value = true
    selectedIndex.value = 0

    try {
      const filters: SearchFilters = {}

      // Apply reference type filter in reference mode
      if (isReferenceMode.value && props.referenceOptions?.reference) {
        const refType = props.referenceOptions.reference.getEReferenceType()
        if (refType) {
          filters.classes = [refType]
          filters.includeSubclasses = true
        }
        if (props.referenceOptions.oclConstraint) {
          filters.oclExpression = props.referenceOptions.oclConstraint
        }
        if (props.referenceOptions.sourceObject) {
          filters.sourceObject = props.referenceOptions.sourceObject
        }
        if (props.problemsService) {
          filters.problemsService = props.problemsService
        }
      }

      localResults.value = await searchService.search(query, props.resource, {
        mode: allowsEmptyQuery.value ? 'global' : searchMode.value,
        filters,
        maxResults: allowsEmptyQuery.value ? 100 : 50,
        allowEmptyQuery: allowsEmptyQuery.value
      })
    } catch (e) {
      console.error('[SearchDialog] Search error:', e)
      localResults.value = []
    } finally {
      isSearching.value = false
    }
  }, 200)
}

// Watch for mode changes to re-search
watch(searchMode, () => {
  if (searchQuery.value.trim().length >= 2) {
    onSearchInput()
  }
})

// Handle keyboard navigation
function handleKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      if (displayResults.value.length > 0) {
        selectedIndex.value = Math.min(selectedIndex.value + 1, displayResults.value.length - 1)
        scrollToSelected()
      }
      break
    case 'ArrowUp':
      event.preventDefault()
      if (displayResults.value.length > 0) {
        selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
        scrollToSelected()
      }
      break
    case 'Enter':
      event.preventDefault()
      if (displayResults.value.length > 0 && selectedIndex.value < displayResults.value.length) {
        selectHit(displayResults.value[selectedIndex.value])
      }
      break
    case 'Escape':
      event.preventDefault()
      close()
      break
  }
}

// Scroll selected item into view
function scrollToSelected() {
  nextTick(() => {
    const container = resultsContainerRef.value
    const selected = container?.querySelector('.result-item.selected')
    if (selected) {
      selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  })
}

// Select a hit
function selectHit(hit: SearchHit) {
  if (hit.isFilteredByOcl) {
    // Show warning, don't select
    return
  }

  emit('select', hit)
  if (!isReferenceMode.value) {
    emit('navigate', hit.object)
  }
  close()
}

// Close dialog
function close() {
  searchQuery.value = ''
  localResults.value = []
  selectedIndex.value = 0
  emit('close')
}

// Format breadcrumb for display
function formatBreadcrumb(breadcrumb: typeof localResults.value[0]['breadcrumb']): string {
  return breadcrumb.map(b => b.label).join(' > ')
}

// Format snippet with match highlighting
function formatSnippet(hit: SearchHit): string {
  const { snippet, matchStart, matchEnd, value } = hit

  // Find match position in snippet
  const snippetStart = value.indexOf(snippet.replace(/^\.\.\./, '').replace(/\.\.\.$/, ''))
  const relativeStart = matchStart - Math.max(0, matchStart - 30)
  const relativeEnd = relativeStart + (matchEnd - matchStart)

  // Simple approach: just highlight the query in the snippet
  const query = searchQuery.value.toLowerCase()
  const lowerSnippet = snippet.toLowerCase()
  const idx = lowerSnippet.indexOf(query)

  if (idx >= 0) {
    const before = snippet.substring(0, idx)
    const match = snippet.substring(idx, idx + query.length)
    const after = snippet.substring(idx + query.length)
    return `${escapeHtml(before)}<mark>${escapeHtml(match)}</mark>${escapeHtml(after)}`
  }

  return escapeHtml(snippet)
}

// Escape HTML entities
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Get icon for EClass
function getIconForHit(hit: SearchHit): string {
  try {
    const eClass = hit.object.eClass()
    if (eClass.isAbstract()) return 'pi pi-box'
    return 'pi pi-file'
  } catch {
    return 'pi pi-file'
  }
}

// Focus input when dialog opens, and load initial results in reference mode
watch(() => props.visible, async (visible) => {
  if (visible) {
    nextTick(() => {
      inputRef.value?.focus()
    })

    // In reference/browse mode, load all matching objects initially
    if (allowsEmptyQuery.value) {
      isSearching.value = true
      try {
        const filters: SearchFilters = {}

        // Apply reference type filter in reference mode
        if (isReferenceMode.value && props.referenceOptions?.reference) {
          const refType = props.referenceOptions.reference.getEReferenceType()
          if (refType) {
            filters.classes = [refType]
            filters.includeSubclasses = true
          }
          if (props.referenceOptions.oclConstraint) {
            filters.oclExpression = props.referenceOptions.oclConstraint
          }
          if (props.referenceOptions.sourceObject) {
            filters.sourceObject = props.referenceOptions.sourceObject
          }
          if (props.problemsService) {
            filters.problemsService = props.problemsService
          }
        }

        // Search with empty query to get all matching instances
        localResults.value = await searchService.search('', props.resource, {
          mode: 'global',
          filters,
          maxResults: 100,
          allowEmptyQuery: true
        })
      } catch (e) {
        console.error('[SearchDialog] Initial load error:', e)
        localResults.value = []
      } finally {
        isSearching.value = false
      }
    }
  } else {
    // Reset when closing
    searchQuery.value = ''
    localResults.value = []
    selectedIndex.value = 0
  }
})

// Generate unique key for hit
function getHitKey(hit: SearchHit, index: number): string {
  try {
    const objId = (hit.object as any).eGetId?.() || index
    const featureName = hit.feature.getName()
    return `${objId}-${featureName}-${index}`
  } catch {
    return `hit-${index}`
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="search-overlay" @click.self="close">
      <div class="search-dialog" @keydown="handleKeydown">
        <!-- Header with search input -->
        <div class="search-header">
          <i class="pi pi-search search-icon" />
          <input
            ref="inputRef"
            v-model="searchQuery"
            type="text"
            class="search-input"
            :placeholder="isReferenceMode ? `Search ${referenceOptions?.reference.getName()}...` : 'Search instances...'"
            @input="onSearchInput"
          />
          <button class="close-btn" @click="close" title="Close (Escape)">
            <i class="pi pi-times" />
          </button>
        </div>

        <!-- Mode toggle and options -->
        <div class="search-modes">
          <button
            v-for="mode in modeOptions"
            :key="mode.value"
            class="mode-btn"
            :class="{ active: searchMode === mode.value }"
            @click="searchMode = mode.value as SearchMode"
          >
            <i :class="mode.icon" />
            <span>{{ mode.label }}</span>
          </button>

          <!-- Hide unavailable option (only in reference mode) -->
          <label v-if="isReferenceMode && unavailableCount > 0" class="hide-unavailable-option">
            <input type="checkbox" v-model="hideUnavailable" />
            <span>Hide unavailable ({{ unavailableCount }})</span>
          </label>
        </div>

        <!-- Results area -->
        <div ref="resultsContainerRef" class="search-results">
          <!-- Loading state -->
          <div v-if="isSearching" class="loading-state">
            <i class="pi pi-spin pi-spinner" />
            <span>Searching...</span>
          </div>

          <!-- Empty state (only in normal mode) -->
          <div v-else-if="!allowsEmptyQuery && searchQuery.length < 2" class="empty-state">
            <i class="pi pi-search" />
            <span>Type at least 2 characters to search</span>
          </div>

          <!-- No results -->
          <div v-else-if="displayResults.length === 0" class="empty-state">
            <i class="pi pi-inbox" />
            <span>{{ hideUnavailable && localResults.length > 0 ? 'All results are unavailable' : 'No results found' }}</span>
          </div>

          <!-- Results list -->
          <div v-else class="result-list">
            <div class="result-count">
              {{ displayResults.length }} result{{ displayResults.length !== 1 ? 's' : '' }}
              <span v-if="unavailableCount > 0 && !hideUnavailable" class="unavailable-hint">
                ({{ localResults.length - unavailableCount }} available)
              </span>
            </div>
            <div
              v-for="(hit, index) in displayResults"
              :key="getHitKey(hit, index)"
              class="result-item"
              :class="{
                selected: selectedIndex === index,
                disabled: hit.isFilteredByOcl
              }"
              @click="selectHit(hit)"
              @mouseenter="selectedIndex = index"
            >
              <div class="result-header">
                <i :class="getIconForHit(hit)" class="result-icon" />
                <span class="object-label">{{ getObjectLabel(hit.object) }}</span>
                <span class="feature-name">{{ hit.feature.getName() }}</span>
              </div>
              <div class="result-snippet" v-html="formatSnippet(hit)" />
              <div class="result-breadcrumb">
                <i class="pi pi-sitemap" />
                {{ formatBreadcrumb(hit.breadcrumb) }}
              </div>
              <div v-if="hit.isFilteredByOcl" class="ocl-warning">
                <i class="pi pi-exclamation-triangle" />
                {{ hit.oclFilterReason || 'OCL constraint not satisfied' }}
              </div>
            </div>
          </div>
        </div>

        <!-- Footer with hints -->
        <div class="search-footer">
          <span class="hint"><kbd>↑↓</kbd> Navigate</span>
          <span class="hint"><kbd>Enter</kbd> Select</span>
          <span class="hint"><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.search-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
  z-index: 1000;
}

.search-dialog {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  width: 600px;
  max-width: 90vw;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.search-header {
  display: flex;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--surface-border);
  gap: 12px;
}

.search-icon {
  color: var(--text-color-secondary);
  font-size: 1.1rem;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 1rem;
  color: var(--text-color);
}

.search-input::placeholder {
  color: var(--text-color-secondary);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.close-btn:hover {
  color: var(--text-color);
  background: var(--surface-hover);
}

.search-modes {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--surface-border);
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--surface-border);
  background: var(--surface-ground);
  color: var(--text-color-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.mode-btn:hover {
  color: var(--text-color);
  background: var(--surface-hover);
}

.mode-btn.active {
  color: var(--primary-color);
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 10%, var(--surface-ground));
}

.mode-btn i {
  font-size: 0.875rem;
}

.hide-unavailable-option {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 6px 12px;
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
  cursor: pointer;
  user-select: none;
}

.hide-unavailable-option:hover {
  color: var(--text-color);
}

.hide-unavailable-option input[type="checkbox"] {
  accent-color: var(--primary-color);
  cursor: pointer;
}

.search-results {
  flex: 1;
  overflow-y: auto;
  min-height: 200px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--text-color-secondary);
}

.loading-state i,
.empty-state i {
  font-size: 2rem;
  opacity: 0.5;
}

.result-list {
  padding: 8px;
}

.result-count {
  padding: 8px 12px;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.unavailable-hint {
  color: var(--green-500);
  font-weight: 500;
}

.result-item {
  padding: 12px;
  margin: 4px 0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.1s ease;
}

.result-item:hover,
.result-item.selected {
  background: var(--surface-hover);
}

.result-item.selected {
  background: color-mix(in srgb, var(--primary-color) 15%, var(--surface-ground));
}

.result-item.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.result-icon {
  color: var(--primary-color);
  font-size: 0.875rem;
}

.object-label {
  font-weight: 600;
  color: var(--text-color);
}

.feature-name {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  margin-left: auto;
}

.result-snippet {
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
  margin-bottom: 4px;
  word-break: break-word;
}

.result-snippet :deep(mark) {
  background: color-mix(in srgb, var(--primary-color) 30%, transparent);
  color: var(--text-color);
  padding: 0 2px;
  border-radius: 2px;
}

.result-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.6875rem;
  color: var(--text-color-secondary);
  opacity: 0.7;
}

.result-breadcrumb i {
  font-size: 0.625rem;
}

.ocl-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--orange-500) 15%, transparent);
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--orange-500);
}

.search-footer {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  border-top: 1px solid var(--surface-border);
  background: var(--surface-ground);
}

.hint {
  font-size: 0.6875rem;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

kbd {
  display: inline-block;
  padding: 2px 6px;
  background: var(--surface-hover);
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  font-family: inherit;
  font-size: 0.625rem;
  color: var(--text-color-secondary);
}
</style>
