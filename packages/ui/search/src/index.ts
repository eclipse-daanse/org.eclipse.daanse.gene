/**
 * ui-search
 *
 * Full-text search for Gene - search instances, references, and navigate to results.
 */

// Types
export type {
  SearchMode,
  SearchFilters,
  SearchHit,
  BreadcrumbItem,
  SearchOptions,
  ReferenceSelectionOptions,
  SearchState,
  NavigationBehavior
} from './types'

// Composables
export {
  useSearchService,
  useSharedSearchService,
  search,
  getObjectLabel,
  buildBreadcrumb,
  createSnippet,
  applyOclFilter,
  setViewsService
} from './composables/useSearchService'

// Components
export { default as SearchDialog } from './components/SearchDialog.vue'
