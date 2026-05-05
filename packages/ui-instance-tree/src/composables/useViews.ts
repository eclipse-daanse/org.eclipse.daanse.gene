/**
 * Views Composable
 *
 * Manages tree view filters for hiding elements in Instance Tree and Model Browser.
 * Views are saved filters that can be toggled, allowing users to create custom
 * "views" of their model by hiding certain types or specific elements.
 */

import { ref, computed, watch, shallowRef } from 'tsm:vue'
import type { Ref, ComputedRef } from 'tsm:vue'
import type { EObject, EClass } from '@emfts/core'

// Filter types (matching FilterType enum in fennec-generic-ui.ecore)
export type FilterType = 'ECLASS_TYPE' | 'ELEMENT'

// Mapping scope (matching MappingScope enum)
export type MappingScope = 'TYPE_ONLY' | 'TYPE_AND_SUBTYPES'

/**
 * A single filter rule
 */
export interface TreeFilterState {
  filterType: FilterType
  targetTypeUri?: string   // For ECLASS_TYPE: nsURI#//ClassName
  scope?: MappingScope     // For ECLASS_TYPE: whether to include subtypes
  elementUri?: string      // For ELEMENT: unique element URI
  hidden: boolean          // Whether this filter is active (hides matching elements)
}

/**
 * A named collection of filters (a "view")
 */
export interface TreeViewState {
  id: string
  name: string
  description?: string
  enabled: boolean
  filters: TreeFilterState[]
  // Perspective configuration
  showInActivityBar?: boolean
  perspectiveIcon?: string
  perspectiveOrder?: number
}

// Shared singleton state
let sharedInstance: ReturnType<typeof useViews> | null = null

// PerspectiveManager reference (set via DI during module activation)
let perspectiveManagerRef: any = null

// EditorConfig reference (set via DI during module activation)
let _editorConfig: any = null

/**
 * Set the EditorConfig reference (called from module activation)
 */
export function setEditorConfigForViews(config: any): void {
  _editorConfig = config
  console.log('[useViews] EditorConfig set:', !!config)
}

/**
 * Set the PerspectiveManager reference (called from module activation)
 */
export function setPerspectiveManager(manager: any): void {
  perspectiveManagerRef = manager
  console.log('[useViews] PerspectiveManager set:', !!manager)
}

/**
 * Get the PerspectiveManager reference
 */
export function getPerspectiveManager(): any {
  return perspectiveManagerRef
}


/**
 * Get the type URI for an EClass
 */
export function getTypeUri(eClass: EClass): string {
  const pkg = eClass.getEPackage()
  const nsURI = pkg?.getNsURI() || 'unknown'
  const name = eClass.getName() || 'Unknown'
  return `${nsURI}#//${name}`
}

/**
 * Get a unique URI for an element (for element-based filtering)
 */
export function getElementUri(obj: EObject): string {
  // Use EMF's internal ID or a combination of container path + feature + index
  const eClass = obj.eClass()
  const container = obj.eContainer()

  if (!container) {
    // Root object - use type + some identifier
    const name = (obj as any).name || (obj as any).id || ''
    return `root:${getTypeUri(eClass)}:${name}`
  }

  const containingFeature = obj.eContainingFeature()
  const featureName = containingFeature?.getName() || 'unknown'

  // Get index in container if many-valued
  let index = 0
  if (containingFeature?.isMany()) {
    const list = container.eGet(containingFeature) as any
    if (Array.isArray(list) || list?.[Symbol.iterator]) {
      const arr = Array.from(list)
      index = arr.indexOf(obj)
    }
  }

  return `${getElementUri(container)}/${featureName}[${index}]`
}

/**
 * Check if a type matches a filter (considering subtypes)
 */
function typeMatchesFilter(eClass: EClass, targetTypeUri: string, scope: MappingScope): boolean {
  const typeUri = getTypeUri(eClass)

  if (typeUri === targetTypeUri) {
    return true
  }

  if (scope === 'TYPE_AND_SUBTYPES') {
    // Check if eClass is a subtype of the target
    const superTypes = eClass.getEAllSuperTypes?.() || []
    for (const superType of superTypes) {
      if (getTypeUri(superType) === targetTypeUri) {
        return true
      }
    }
  }

  return false
}

/**
 * Views composable - manages tree view filters
 */
/**
 * Mark EditorConfig as dirty (if available)
 */
function markEditorConfigDirty(): void {
  try {
    if (_editorConfig?.markDirty) {
      _editorConfig.markDirty()
    }
  } catch (e) {
    // Ignore - EditorConfig not available
  }
}

export function useViews() {
  // State
  const views = ref<TreeViewState[]>([])
  const activeViewId = ref<string | null>(null)
  const defaultViewId = ref<string | null>(null)  // View selected via dropdown (for Model Editor)
  const version = ref(0)

  // Computed: Active view
  const activeView = computed<TreeViewState | null>(() => {
    if (!activeViewId.value) return null
    return views.value.find(v => v.id === activeViewId.value) || null
  })

  // Computed: Set of hidden type URIs from active view
  const hiddenTypeUris = computed<Map<string, MappingScope>>(() => {
    // Access version to re-evaluate when filters are mutated
    void version.value
    const result = new Map<string, MappingScope>()
    const view = activeView.value
    if (!view || !view.enabled) return result

    for (const filter of view.filters) {
      if (filter.filterType === 'ECLASS_TYPE' && filter.hidden && filter.targetTypeUri) {
        result.set(filter.targetTypeUri, filter.scope || 'TYPE_ONLY')
      }
    }

    return result
  })

  // Computed: Set of hidden element URIs from active view
  const hiddenElementUris = computed<Set<string>>(() => {
    // Access version to re-evaluate when filters are mutated
    void version.value
    const result = new Set<string>()
    const view = activeView.value
    if (!view || !view.enabled) return result

    for (const filter of view.filters) {
      if (filter.filterType === 'ELEMENT' && filter.hidden && filter.elementUri) {
        result.add(filter.elementUri)
      }
    }

    return result
  })

  /**
   * Check if a node should be visible
   * @param data - The EObject or node data to check
   * @returns true if visible, false if should be hidden
   */
  function isNodeVisible(data: EObject | null): boolean {
    if (!data) return true
    if (!activeView.value || !activeView.value.enabled) return true

    const eClass = typeof data.eClass === 'function' ? data.eClass() : null
    if (!eClass) return true

    // Check type-based filters
    for (const [typeUri, scope] of hiddenTypeUris.value) {
      if (typeMatchesFilter(eClass, typeUri, scope)) {
        return false
      }
    }

    // Check element-based filters
    const elementUri = getElementUri(data)
    if (hiddenElementUris.value.has(elementUri)) {
      return false
    }

    return true
  }

  /**
   * Check if a type is hidden (for model browser)
   */
  function isTypeHidden(eClass: EClass): boolean {
    if (!activeView.value || !activeView.value.enabled) return false

    for (const [typeUri, scope] of hiddenTypeUris.value) {
      if (typeMatchesFilter(eClass, typeUri, scope)) {
        return true
      }
    }

    return false
  }

  // ============ View Management ============

  /**
   * Create a new view
   */
  function createView(name: string): TreeViewState {
    const id = `view-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const view: TreeViewState = {
      id,
      name,
      enabled: true,
      filters: []
    }
    views.value.push(view)
    version.value++
    markEditorConfigDirty()
    return view
  }

  /**
   * Delete a view
   */
  function deleteView(id: string): boolean {
    const index = views.value.findIndex(v => v.id === id)
    if (index === -1) return false

    views.value.splice(index, 1)

    if (activeViewId.value === id) {
      activeViewId.value = null
    }

    version.value++
    markEditorConfigDirty()
    return true
  }

  /**
   * Set the active view (from dropdown selection)
   * Also sets this as the default view for Model Editor perspective
   */
  function setActiveView(id: string | null): void {
    const view = id ? views.value.find(v => v.id === id) : null
    console.log('[useViews] setActiveView:', id, 'view:', view?.name, 'filters:', view?.filters?.length ?? 0)
    activeViewId.value = id
    defaultViewId.value = id  // Remember as default for Model Editor
    version.value++
    markEditorConfigDirty()
  }

  /**
   * Set active view for a view-perspective (does NOT change defaultViewId)
   * Used when switching to a view-perspective
   */
  function setActiveViewForPerspective(id: string): void {
    const view = views.value.find(v => v.id === id)
    if (!view) {
      console.warn('[useViews] setActiveViewForPerspective: view not found:', id)
      return
    }
    console.log('[useViews] setActiveViewForPerspective:', id, 'view:', view.name, 'filters:', view.filters?.length ?? 0)
    activeViewId.value = id
    // Do NOT change defaultViewId - keep the user's dropdown selection
    version.value++
    // Do NOT persist - this is temporary for the view-perspective
  }

  /**
   * Restore the default view when switching back to Model Editor
   * Used when switching from a view-perspective to Model Editor
   */
  function restoreDefaultView(): void {
    const view = defaultViewId.value ? views.value.find(v => v.id === defaultViewId.value) : null
    console.log('[useViews] restoreDefaultView:', defaultViewId.value, 'view:', view?.name, 'filters:', view?.filters?.length ?? 0)
    activeViewId.value = defaultViewId.value
    version.value++
    // Do NOT persist - defaultViewId is already persisted
  }

  /**
   * Temporarily disable view filtering without persisting
   * @deprecated Use restoreDefaultView() instead
   */
  function suspendViewFiltering(): void {
    // Now just restores the default view instead of setting null
    restoreDefaultView()
  }

  /**
   * Resume view filtering with the last used view
   * If no lastViewId provided, does nothing
   */
  function resumeViewFiltering(viewId: string): void {
    const view = views.value.find(v => v.id === viewId)
    if (view) {
      activeViewId.value = viewId
      version.value++
      console.log('[useViews] View filtering resumed:', view.name)
    }
  }

  /**
   * Update a view's properties
   */
  function updateView(id: string, updates: Partial<Omit<TreeViewState, 'id' | 'filters'>>): void {
    const view = views.value.find(v => v.id === id)
    if (!view) return

    if (updates.name !== undefined) view.name = updates.name
    if (updates.description !== undefined) view.description = updates.description
    if (updates.enabled !== undefined) view.enabled = updates.enabled

    version.value++
    markEditorConfigDirty()
  }

  // ============ Filter Management ============

  /**
   * Add a type-based filter to the active view
   */
  function hideType(typeUri: string, scope: MappingScope = 'TYPE_ONLY'): void {
    const view = activeView.value
    if (!view) {
      console.warn('[useViews] No active view to add filter to')
      return
    }

    // Check if already exists
    const existing = view.filters.find(
      f => f.filterType === 'ECLASS_TYPE' && f.targetTypeUri === typeUri
    )
    if (existing) {
      existing.hidden = true
      existing.scope = scope
    } else {
      view.filters.push({
        filterType: 'ECLASS_TYPE',
        targetTypeUri: typeUri,
        scope,
        hidden: true
      })
    }

    version.value++
    markEditorConfigDirty()
  }

  /**
   * Hide a specific element
   */
  function hideElement(elementUri: string): void {
    const view = activeView.value
    if (!view) {
      console.warn('[useViews] No active view to add filter to')
      return
    }

    // Check if already exists
    const existing = view.filters.find(
      f => f.filterType === 'ELEMENT' && f.elementUri === elementUri
    )
    if (existing) {
      existing.hidden = true
    } else {
      view.filters.push({
        filterType: 'ELEMENT',
        elementUri,
        hidden: true
      })
    }

    version.value++
    markEditorConfigDirty()
  }

  /**
   * Show a type (remove filter or set hidden=false)
   */
  function showType(typeUri: string): void {
    const view = activeView.value
    if (!view) return

    const filter = view.filters.find(
      f => f.filterType === 'ECLASS_TYPE' && f.targetTypeUri === typeUri
    )
    if (filter) {
      filter.hidden = false
      version.value++
      markEditorConfigDirty()
    }
  }

  /**
   * Show an element (remove filter or set hidden=false)
   */
  function showElement(elementUri: string): void {
    const view = activeView.value
    if (!view) return

    const filter = view.filters.find(
      f => f.filterType === 'ELEMENT' && f.elementUri === elementUri
    )
    if (filter) {
      filter.hidden = false
      version.value++
      markEditorConfigDirty()
    }
  }

  /**
   * Remove a filter from the active view
   */
  function removeFilter(index: number): void {
    const view = activeView.value
    if (!view || index < 0 || index >= view.filters.length) return

    view.filters.splice(index, 1)
    version.value++
    markEditorConfigDirty()
  }

  /**
   * Toggle a filter's hidden state
   */
  function toggleFilter(index: number): void {
    const view = activeView.value
    if (!view || index < 0 || index >= view.filters.length) return

    view.filters[index].hidden = !view.filters[index].hidden
    version.value++
    markEditorConfigDirty()
  }

  // ============ Convenience Methods ============

  /**
   * Hide a type by EClass
   */
  function hideTypeByClass(eClass: EClass, scope: MappingScope = 'TYPE_ONLY'): void {
    hideType(getTypeUri(eClass), scope)
  }

  /**
   * Hide an element by EObject
   */
  function hideElementByObject(obj: EObject): void {
    hideElement(getElementUri(obj))
  }

  /**
   * Ensure there's an active view (create default if needed)
   */
  function ensureActiveView(): TreeViewState {
    if (activeView.value) return activeView.value

    const view = createView('Default View')
    setActiveView(view.id)
    return view
  }

  // ============ Serialization ============

  /**
   * Export views to JSON (for persistence)
   */
  function toJSON(): { views: TreeViewState[], activeViewId: string | null, defaultViewId: string | null } {
    return {
      views: views.value,
      activeViewId: activeViewId.value,
      defaultViewId: defaultViewId.value
    }
  }

  /**
   * Import views from JSON
   */
  function fromJSON(data: { views?: TreeViewState[], activeViewId?: string | null, defaultViewId?: string | null }): void {
    if (data.views) {
      views.value = data.views
    }
    if (data.activeViewId !== undefined) {
      activeViewId.value = data.activeViewId
    }
    if (data.defaultViewId !== undefined) {
      defaultViewId.value = data.defaultViewId
    } else if (data.activeViewId !== undefined) {
      // Backwards compatibility: use activeViewId as defaultViewId if not set
      defaultViewId.value = data.activeViewId
    }
    version.value++

    // Register perspectives for views with showInActivityBar=true
    // Use setTimeout to ensure the perspective manager is available
    setTimeout(() => {
      registerAllPerspectives()
    }, 100)
  }

  /**
   * Clear all views
   */
  function clear(): void {
    views.value = []
    activeViewId.value = null
    defaultViewId.value = null
    version.value++
    markEditorConfigDirty()
  }

  // ============ Perspective Management ============

  /**
   * Register a view as a perspective in the Activity Bar
   */
  function registerViewPerspective(view: TreeViewState): void {
    const manager = getPerspectiveManager()
    if (!manager?.registry) {
      console.warn('[useViews] PerspectiveManager not available, cannot register perspective')
      return
    }

    // Capture only primitive values to avoid stale references after fromJSON
    const viewId = view.id
    const perspectiveId = `view-${viewId}`

    // Check if already registered
    if (manager.registry.get(perspectiveId)) {
      console.log('[useViews] Perspective already registered:', perspectiveId)
      return
    }

    const perspectiveDef = {
      id: perspectiveId,
      name: view.name,
      icon: view.perspectiveIcon || 'pi pi-filter',
      requiresWorkspace: true,
      defaultLayout: {
        left: ['instance-tree'],
        center: ['properties'],
        right: ['model-browser'],
        bottom: ['problems']
      },
      defaultVisibility: {
        left: true,
        right: true,
        bottom: false
      },
      onActivate: async () => {
        // Look up the current view by ID (not a captured reference that may be stale)
        const currentView = views.value.find(v => v.id === viewId)
        if (!currentView) {
          console.warn('[useViews] View not found for perspective:', viewId)
          return
        }

        console.log('[useViews] onActivate called for view:', currentView.id, currentView.name)
        console.log('[useViews] View has', currentView.filters.length, 'filters')
        console.log('[useViews] Current version before:', version.value)

        // Use setActiveViewForPerspective to NOT overwrite the defaultViewId
        setActiveViewForPerspective(viewId)

        // Also ensure the view is enabled
        if (!currentView.enabled) {
          currentView.enabled = true
          version.value++
          console.log('[useViews] View was disabled, now enabled')
        }

        console.log('[useViews] Perspective activated, view set to:', currentView.name)
        console.log('[useViews] Active view ID:', activeViewId.value)
        console.log('[useViews] Version after:', version.value)
      }
    }

    manager.registry.register(perspectiveDef)
    console.log('[useViews] Registered perspective:', perspectiveId, 'with icon:', perspectiveDef.icon)
  }

  /**
   * Unregister a view's perspective from the Activity Bar
   */
  function unregisterViewPerspective(viewId: string): void {
    const manager = getPerspectiveManager()
    if (!manager?.registry) {
      return
    }

    const perspectiveId = `view-${viewId}`
    manager.registry.unregister(perspectiveId)
    console.log('[useViews] Unregistered perspective:', perspectiveId)
  }

  /**
   * Enable a view as a perspective in the Activity Bar
   */
  function enableAsPerspective(viewId: string, icon: string, order?: number): void {
    const view = views.value.find(v => v.id === viewId)
    if (!view) {
      console.warn('[useViews] View not found:', viewId)
      return
    }

    view.showInActivityBar = true
    view.perspectiveIcon = icon
    view.perspectiveOrder = order ?? 100

    registerViewPerspective(view)

    version.value++
    markEditorConfigDirty()
    console.log('[useViews] Enabled view as perspective:', view.name)
  }

  /**
   * Disable a view's perspective (remove from Activity Bar)
   */
  function disableAsPerspective(viewId: string): void {
    const view = views.value.find(v => v.id === viewId)
    if (!view) return

    view.showInActivityBar = false

    unregisterViewPerspective(viewId)

    version.value++
    markEditorConfigDirty()
    console.log('[useViews] Disabled view as perspective:', view.name)
  }

  /**
   * Update a perspective's icon
   */
  function updatePerspectiveIcon(viewId: string, icon: string): void {
    const view = views.value.find(v => v.id === viewId)
    if (!view || !view.showInActivityBar) return

    view.perspectiveIcon = icon

    // Re-register with new icon
    unregisterViewPerspective(viewId)
    registerViewPerspective(view)

    version.value++
    markEditorConfigDirty()
  }

  /**
   * Register all views that have showInActivityBar=true as perspectives
   * Should be called after loading views from EditorConfig
   */
  function registerAllPerspectives(): void {
    for (const view of views.value) {
      if (view.showInActivityBar) {
        registerViewPerspective(view)
      }
    }
  }

  return {
    // State
    views,
    activeViewId,
    defaultViewId,
    activeView,
    version,

    // Computed filter sets
    hiddenTypeUris,
    hiddenElementUris,

    // Visibility checks
    isNodeVisible,
    isTypeHidden,

    // View management
    createView,
    deleteView,
    setActiveView,
    setActiveViewForPerspective,
    restoreDefaultView,
    updateView,
    ensureActiveView,
    suspendViewFiltering,
    resumeViewFiltering,

    // Filter management
    hideType,
    hideElement,
    showType,
    showElement,
    hideTypeByClass,
    hideElementByObject,
    removeFilter,
    toggleFilter,

    // Serialization
    toJSON,
    fromJSON,
    clear,

    // Perspective management
    enableAsPerspective,
    disableAsPerspective,
    updatePerspectiveIcon,
    registerAllPerspectives
  }
}

/**
 * Get or create a shared views instance (singleton)
 */
export function useSharedViews(): ReturnType<typeof useViews> {
  if (!sharedInstance) {
    console.log('[useSharedViews] Creating new shared instance')
    sharedInstance = useViews()
  }

  return sharedInstance
}

/**
 * Get shared views (alias)
 */
export function getSharedViews(): ReturnType<typeof useViews> {
  return useSharedViews()
}
