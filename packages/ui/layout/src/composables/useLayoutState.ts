/**
 * Layout State Composable
 *
 * Provides reactive state management for the VS Code-like layout system.
 * Uses a singleton pattern for shared state across components.
 */

import { reactive, computed, markRaw, type Component, type Raw } from 'tsm:vue'
import type {
  Activity,
  Panel,
  PanelLocation,
  PanelPositionOverride,
  EditorTab,
  PanelTab,
  StatusBarItem,
  LayoutState,
  LayoutDimensions,
  LayoutVisibility
} from '../types'
import { DEFAULT_DIMENSIONS, DEFAULT_VISIBILITY } from '../types'

const STORAGE_KEY = 'gene-layout-state'

// Module-level EditorConfig reference (set from outside)
let _editorConfig: any = null

/**
 * Set the EditorConfig instance (called from module activate)
 */
export function setEditorConfig(config: any): void {
  _editorConfig = config
}

/**
 * Get EditorConfig instance if available
 */
function getEditorConfig(): any {
  return _editorConfig
}

/**
 * Sync layout state to EditorConfig (if available)
 */
function syncToEditorConfig(state: LayoutState) {
  const editorConfig = getEditorConfig()
  if (editorConfig?.updateLayoutConfig) {
    // Convert Map to array for EditorConfig
    const panelPositions = Array.from(state.panelPositionOverrides.values())

    editorConfig.updateLayoutConfig(
      {
        primarySidebarWidth: state.dimensions.primarySidebarWidth,
        secondarySidebarWidth: state.dimensions.secondarySidebarWidth,
        panelAreaHeight: state.dimensions.panelAreaHeight
      },
      {
        primarySidebar: state.visibility.primarySidebar,
        secondarySidebar: state.visibility.secondarySidebar,
        panelArea: state.visibility.panelArea,
        activityBar: state.visibility.activityBar,
        statusBar: state.visibility.statusBar
      },
      state.activeActivityId,
      panelPositions
    )
  }
}

/**
 * Create initial layout state
 */
function createInitialState(): LayoutState {
  return {
    activities: [],
    activeActivityId: null,
    panels: [],
    activePrimaryPanelId: null,
    activeSecondaryPanelId: null,
    panelPositionOverrides: new Map(),
    editorTabs: [],
    activeEditorTabId: null,
    panelTabs: [],
    activePanelTabId: null,
    statusBarItems: [],
    dimensions: { ...DEFAULT_DIMENSIONS },
    visibility: { ...DEFAULT_VISIBILITY }
  }
}

/**
 * Load persisted state from localStorage
 */
function loadPersistedState(): Partial<LayoutState> & { panelPositionOverrides?: Map<string, PanelPositionOverride> } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)

      // Convert panelPositionOverrides from array back to Map
      const overrides = new Map<string, PanelPositionOverride>()
      if (parsed.panelPositionOverrides && Array.isArray(parsed.panelPositionOverrides)) {
        for (const override of parsed.panelPositionOverrides) {
          overrides.set(override.panelId, override)
        }
      }

      return {
        dimensions: parsed.dimensions || DEFAULT_DIMENSIONS,
        visibility: parsed.visibility || DEFAULT_VISIBILITY,
        activeActivityId: parsed.activeActivityId || null,
        panelPositionOverrides: overrides
      }
    }
  } catch (e) {
    console.warn('Failed to load layout state:', e)
  }
  return {}
}

/**
 * Persist state to localStorage and sync to EditorConfig
 */
function persistState(state: LayoutState) {
  try {
    // Convert Map to array for JSON serialization
    const overridesArray = Array.from(state.panelPositionOverrides.values())

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      dimensions: state.dimensions,
      visibility: state.visibility,
      activeActivityId: state.activeActivityId,
      panelPositionOverrides: overridesArray
    }))
  } catch (e) {
    console.warn('Failed to persist layout state:', e)
  }

  // Also sync to EditorConfig for workspace persistence
  syncToEditorConfig(state)
}

// Module-level shared state (singleton)
let _sharedState: LayoutState | null = null

/**
 * Get or create the shared layout state
 */
function getSharedState(): LayoutState {
  if (_sharedState) {
    return _sharedState
  }

  // Create new state
  const initial = createInitialState()
  const persisted = loadPersistedState()
  _sharedState = reactive({
    ...initial,
    ...persisted,
    dimensions: { ...initial.dimensions, ...persisted.dimensions },
    visibility: { ...initial.visibility, ...persisted.visibility },
    panelPositionOverrides: persisted.panelPositionOverrides || new Map()
  }) as LayoutState

  return _sharedState
}

/**
 * Get the effective location for a panel (considering overrides)
 */
function getEffectivePanelLocation(panel: Panel, overrides: Map<string, PanelPositionOverride>): PanelLocation {
  const override = overrides.get(panel.id)
  return override ? override.location : panel.location
}

/**
 * Get the effective order for a panel (considering overrides)
 */
function getEffectivePanelOrder(panel: Panel, overrides: Map<string, PanelPositionOverride>): number {
  const override = overrides.get(panel.id)
  return override ? override.order : (panel.order || 0)
}

/**
 * Layout state composable
 */
export function useLayoutState() {
  const state = getSharedState()

  // Computed properties
  const activeActivity = computed(() =>
    state.activities.find(a => a.id === state.activeActivityId)
  )

  const activePrimaryPanel = computed(() =>
    state.panels.find(p =>
      p.id === state.activePrimaryPanelId &&
      getEffectivePanelLocation(p, state.panelPositionOverrides) === 'primary'
    )
  )

  const activeSecondaryPanel = computed(() =>
    state.panels.find(p =>
      p.id === state.activeSecondaryPanelId &&
      getEffectivePanelLocation(p, state.panelPositionOverrides) === 'secondary'
    )
  )

  const activeEditorTab = computed(() =>
    state.editorTabs.find(t => t.id === state.activeEditorTabId)
  )

  const activePanelTab = computed(() =>
    state.panelTabs.find(t => t.id === state.activePanelTabId)
  )

  const primaryPanels = computed(() =>
    state.panels
      .filter(p => getEffectivePanelLocation(p, state.panelPositionOverrides) === 'primary')
      .sort((a, b) => getEffectivePanelOrder(a, state.panelPositionOverrides) - getEffectivePanelOrder(b, state.panelPositionOverrides))
  )

  const secondaryPanels = computed(() =>
    state.panels
      .filter(p => getEffectivePanelLocation(p, state.panelPositionOverrides) === 'secondary')
      .sort((a, b) => getEffectivePanelOrder(a, state.panelPositionOverrides) - getEffectivePanelOrder(b, state.panelPositionOverrides))
  )

  const bottomPanels = computed(() =>
    state.panels
      .filter(p => getEffectivePanelLocation(p, state.panelPositionOverrides) === 'bottom')
      .sort((a, b) => getEffectivePanelOrder(a, state.panelPositionOverrides) - getEffectivePanelOrder(b, state.panelPositionOverrides))
  )

  // Activity management
  function registerActivity(activity: Activity) {
    const existing = state.activities.findIndex(a => a.id === activity.id)
    if (existing >= 0) {
      state.activities[existing] = activity
    } else {
      state.activities.push(activity)
    }

    // Auto-select first activity
    if (!state.activeActivityId && state.activities.length > 0) {
      state.activeActivityId = state.activities[0]?.id ?? null
    }
  }

  function unregisterActivity(activityId: string) {
    const index = state.activities.findIndex(a => a.id === activityId)
    if (index >= 0) {
      state.activities.splice(index, 1)
      if (state.activeActivityId === activityId) {
        state.activeActivityId = state.activities[0]?.id || null
      }
    }
  }

  function selectActivity(activityId: string) {
    const activity = state.activities.find(a => a.id === activityId)
    if (activity) {
      state.activeActivityId = activityId

      // Show primary sidebar if it has a panel
      if (activity.panel) {
        state.activePrimaryPanelId = activity.panel
        state.visibility.primarySidebar = true
      }

      persistState(state)
    }
  }

  // Panel management
  function registerPanel(panel: Omit<Panel, 'component'> & { component: Component }) {
    const rawPanel: Panel = {
      ...panel,
      component: markRaw(panel.component) as Raw<Component>
    }

    const existing = state.panels.findIndex(p => p.id === panel.id)
    if (existing >= 0) {
      state.panels[existing] = rawPanel
    } else {
      state.panels.push(rawPanel)
    }

    // Auto-select first panel in each location
    if (panel.location === 'primary' && !state.activePrimaryPanelId) {
      state.activePrimaryPanelId = panel.id
    } else if (panel.location === 'secondary' && !state.activeSecondaryPanelId) {
      state.activeSecondaryPanelId = panel.id
    }
  }

  function unregisterPanel(panelId: string) {
    const index = state.panels.findIndex(p => p.id === panelId)
    if (index >= 0) {
      const panel = state.panels[index]!
      state.panels.splice(index, 1)

      if (panel.location === 'primary' && state.activePrimaryPanelId === panelId) {
        state.activePrimaryPanelId = primaryPanels.value[0]?.id ?? null
      } else if (panel.location === 'secondary' && state.activeSecondaryPanelId === panelId) {
        state.activeSecondaryPanelId = secondaryPanels.value[0]?.id ?? null
      }
    }
  }

  function selectPanel(panelId: string, location: PanelLocation) {
    if (location === 'primary') {
      state.activePrimaryPanelId = panelId
    } else if (location === 'secondary') {
      state.activeSecondaryPanelId = panelId
    }
  }

  // Editor tab management
  function openEditor(tab: Omit<EditorTab, 'component'> & { component: Component }) {
    const existing = state.editorTabs.findIndex(t => t.id === tab.id)

    const rawTab: EditorTab = {
      ...tab,
      component: markRaw(tab.component) as Raw<Component>,
      closable: tab.closable ?? true
    }

    if (existing >= 0) {
      state.editorTabs[existing] = rawTab
    } else {
      state.editorTabs.push(rawTab)
    }

    state.activeEditorTabId = tab.id
  }

  function closeEditor(tabId: string) {
    const index = state.editorTabs.findIndex(t => t.id === tabId)
    if (index >= 0) {
      const tab = state.editorTabs[index]!
      if (tab.closable === false) return

      state.editorTabs.splice(index, 1)

      if (state.activeEditorTabId === tabId) {
        // Select adjacent tab
        const newIndex = Math.min(index, state.editorTabs.length - 1)
        state.activeEditorTabId = state.editorTabs[newIndex]?.id ?? null
      }
    }
  }

  function selectEditor(tabId: string) {
    if (state.editorTabs.find(t => t.id === tabId)) {
      state.activeEditorTabId = tabId
    }
  }

  function setEditorDirty(tabId: string, dirty: boolean) {
    const tab = state.editorTabs.find(t => t.id === tabId)
    if (tab) {
      tab.dirty = dirty
    }
  }

  // Panel area tab management
  function registerPanelTab(tab: Omit<PanelTab, 'component'> & { component: Component }) {
    const rawTab: PanelTab = {
      ...tab,
      component: markRaw(tab.component) as Raw<Component>
    }

    const existing = state.panelTabs.findIndex(t => t.id === tab.id)
    if (existing >= 0) {
      state.panelTabs[existing] = rawTab
    } else {
      state.panelTabs.push(rawTab)
    }

    if (!state.activePanelTabId && state.panelTabs.length > 0) {
      state.activePanelTabId = state.panelTabs[0]?.id ?? null
    }
  }

  function selectPanelTab(tabId: string) {
    if (state.panelTabs.find(t => t.id === tabId)) {
      state.activePanelTabId = tabId
      state.visibility.panelArea = true
      persistState(state)
    }
  }

  function updatePanelTabBadge(tabId: string, badge: number | string | undefined) {
    const tab = state.panelTabs.find(t => t.id === tabId)
    if (tab) {
      tab.badge = badge
    }
  }

  /**
   * Update badge for any content type (Panel, EditorTab, or PanelTab)
   */
  function updateBadge(contentId: string, badge: number | string | undefined) {
    // Check panel tabs
    const panelTab = state.panelTabs.find(t => t.id === contentId)
    if (panelTab) {
      panelTab.badge = badge
      return
    }

    // Check editor tabs
    const editorTab = state.editorTabs.find(t => t.id === contentId)
    if (editorTab) {
      editorTab.badge = badge
      return
    }

    // Check panels
    const panel = state.panels.find(p => p.id === contentId)
    if (panel) {
      panel.badge = badge
      return
    }
  }

  // Status bar management
  function registerStatusBarItem(item: StatusBarItem) {
    const existing = state.statusBarItems.findIndex(i => i.id === item.id)
    if (existing >= 0) {
      state.statusBarItems[existing] = item
    } else {
      state.statusBarItems.push(item)
    }
  }

  function unregisterStatusBarItem(itemId: string) {
    const index = state.statusBarItems.findIndex(i => i.id === itemId)
    if (index >= 0) {
      state.statusBarItems.splice(index, 1)
    }
  }

  // Visibility toggles
  function togglePrimarySidebar() {
    const newVisible = !state.visibility.primarySidebar
    state.visibility.primarySidebar = newVisible
    // Auto-select first panel if becoming visible with no selection
    if (newVisible && !state.activePrimaryPanelId && primaryPanels.value.length > 0) {
      state.activePrimaryPanelId = primaryPanels.value[0]?.id ?? null
    }
    persistState(state)
  }

  function toggleSecondarySidebar() {
    const newVisible = !state.visibility.secondarySidebar
    state.visibility.secondarySidebar = newVisible
    // Auto-select first panel if becoming visible with no selection
    if (newVisible && !state.activeSecondaryPanelId && secondaryPanels.value.length > 0) {
      state.activeSecondaryPanelId = secondaryPanels.value[0]?.id ?? null
    }
    persistState(state)
  }

  function togglePanelArea() {
    const newVisible = !state.visibility.panelArea
    state.visibility.panelArea = newVisible
    // Auto-select first panel tab if becoming visible with no selection
    if (newVisible && !state.activePanelTabId && state.panelTabs.length > 0) {
      state.activePanelTabId = state.panelTabs[0]?.id ?? null
    }
    persistState(state)
  }

  function setPrimarySidebarVisible(visible: boolean) {
    state.visibility.primarySidebar = visible
    // Auto-select first panel if none selected but panels exist
    if (visible && !state.activePrimaryPanelId && primaryPanels.value.length > 0) {
      state.activePrimaryPanelId = primaryPanels.value[0]?.id ?? null
    }
    persistState(state)
  }

  function setSecondarySidebarVisible(visible: boolean) {
    state.visibility.secondarySidebar = visible
    // Auto-select first panel if none selected but panels exist
    if (visible && !state.activeSecondaryPanelId && secondaryPanels.value.length > 0) {
      state.activeSecondaryPanelId = secondaryPanels.value[0]?.id ?? null
    }
    persistState(state)
  }

  function setPanelAreaVisible(visible: boolean) {
    state.visibility.panelArea = visible
    // Auto-select first panel tab if none selected but tabs exist
    if (visible && !state.activePanelTabId && state.panelTabs.length > 0) {
      state.activePanelTabId = state.panelTabs[0]?.id ?? null
    }
    persistState(state)
  }

  // Perspective support - clear methods for perspective switching
  function clearPanels() {
    state.panels = []
    state.activePrimaryPanelId = null
    state.activeSecondaryPanelId = null
  }

  function clearActivities() {
    state.activities = []
    state.activeActivityId = null
  }

  function clearEditorTabs() {
    state.editorTabs = []
    state.activeEditorTabId = null
  }

  function clearPanelTabs() {
    state.panelTabs = []
    state.activePanelTabId = null
  }

  function clearAll() {
    clearPanels()
    clearActivities()
    clearEditorTabs()
    clearPanelTabs()
    // Clear position overrides so new panels use their registered locations
    state.panelPositionOverrides.clear()
  }

  // Dimension updates
  function setPrimarySidebarWidth(width: number) {
    state.dimensions.primarySidebarWidth = Math.max(
      state.dimensions.primarySidebarMinWidth,
      Math.min(state.dimensions.primarySidebarMaxWidth, width)
    )
    persistState(state)
  }

  function setSecondarySidebarWidth(width: number) {
    state.dimensions.secondarySidebarWidth = Math.max(
      state.dimensions.secondarySidebarMinWidth,
      Math.min(state.dimensions.secondarySidebarMaxWidth, width)
    )
    persistState(state)
  }

  function setPanelAreaHeight(height: number) {
    state.dimensions.panelAreaHeight = Math.max(
      state.dimensions.panelAreaMinHeight,
      Math.min(state.dimensions.panelAreaMaxHeight, height)
    )
    persistState(state)
  }

  // ============================================
  // Panel Position Management
  // ============================================

  /**
   * Find content info by ID across all collections
   * Returns the source location and content info
   */
  function findContentById(contentId: string): {
    sourceLocation: PanelLocation | null
    panel?: Panel
    editorTab?: EditorTab
    panelTab?: PanelTab
  } {
    // Check panels first
    const panel = state.panels.find(p => p.id === contentId)
    if (panel) {
      const effectiveLocation = getEffectivePanelLocation(panel, state.panelPositionOverrides)
      return { sourceLocation: effectiveLocation, panel }
    }

    // Check editor tabs
    const editorTab = state.editorTabs.find(t => t.id === contentId)
    if (editorTab) {
      return { sourceLocation: 'editor', editorTab }
    }

    // Check panel tabs (bottom)
    const panelTab = state.panelTabs.find(t => t.id === contentId)
    if (panelTab) {
      return { sourceLocation: 'bottom', panelTab }
    }

    return { sourceLocation: null }
  }

  /**
   * Move content (panel, editor tab, or panel tab) to a new location
   * Handles conversion between different content types
   * @param contentId The ID of the content to move
   * @param targetLocation The target location ('primary', 'secondary', 'editor', or 'bottom')
   * @param order Optional display order within the location
   */
  function movePanel(contentId: string, targetLocation: PanelLocation, order?: number) {
    const found = findContentById(contentId)

    if (!found.sourceLocation) {
      console.warn(`[LayoutState] Content not found: ${contentId}`)
      return
    }

    // If source and target are the same, nothing to do
    if (found.sourceLocation === targetLocation) {
      console.log(`[LayoutState] Content ${contentId} is already at ${targetLocation}`)
      return
    }

    // Extract common properties for conversion
    const commonProps = found.panel ? {
      id: found.panel.id,
      title: found.panel.title,
      icon: found.panel.icon,
      component: found.panel.component,
      closable: found.panel.closable,
      badge: found.panel.badge
    } : found.editorTab ? {
      id: found.editorTab.id,
      title: found.editorTab.title,
      icon: found.editorTab.icon,
      component: found.editorTab.component,
      closable: found.editorTab.closable,
      badge: found.editorTab.badge
    } : found.panelTab ? {
      id: found.panelTab.id,
      title: found.panelTab.title,
      icon: found.panelTab.icon,
      component: found.panelTab.component,
      closable: true,
      badge: found.panelTab.badge
    } : null

    if (!commonProps) {
      console.warn(`[LayoutState] Could not extract properties for: ${contentId}`)
      return
    }

    // Remove from source
    if (found.panel) {
      // If it's a panel, just update the position override instead of removing
      // This preserves the panel registration
    } else if (found.editorTab) {
      const idx = state.editorTabs.findIndex(t => t.id === contentId)
      if (idx >= 0) {
        state.editorTabs.splice(idx, 1)
        if (state.activeEditorTabId === contentId) {
          state.activeEditorTabId = state.editorTabs[0]?.id || null
        }
      }
    } else if (found.panelTab) {
      const idx = state.panelTabs.findIndex(t => t.id === contentId)
      if (idx >= 0) {
        state.panelTabs.splice(idx, 1)
        if (state.activePanelTabId === contentId) {
          state.activePanelTabId = state.panelTabs[0]?.id || null
        }
      }
    }

    // Add to target
    if (targetLocation === 'editor') {
      // Convert to EditorTab
      const newTab: EditorTab = {
        id: commonProps.id,
        title: commonProps.title,
        icon: commonProps.icon,
        component: commonProps.component,
        closable: commonProps.closable ?? true,
        badge: commonProps.badge
      }

      // Remove panel override if exists
      state.panelPositionOverrides.delete(contentId)

      // Always remove from panels if exists (prevent duplicates)
      const panelIdx = state.panels.findIndex(p => p.id === contentId)
      if (panelIdx >= 0) {
        state.panels.splice(panelIdx, 1)
      }

      // Remove from panelTabs if exists (prevent duplicates)
      const panelTabIdx = state.panelTabs.findIndex(t => t.id === contentId)
      if (panelTabIdx >= 0) {
        state.panelTabs.splice(panelTabIdx, 1)
      }

      // Check if already in editorTabs
      const existingEditorIdx = state.editorTabs.findIndex(t => t.id === contentId)
      if (existingEditorIdx >= 0) {
        state.editorTabs[existingEditorIdx] = newTab
      } else {
        state.editorTabs.push(newTab)
      }
      state.activeEditorTabId = contentId

    } else if (targetLocation === 'bottom') {
      // Convert to PanelTab
      const newTab: PanelTab = {
        id: commonProps.id,
        title: commonProps.title,
        icon: commonProps.icon,
        component: commonProps.component,
        badge: commonProps.badge
      }

      // Remove panel override if exists
      state.panelPositionOverrides.delete(contentId)

      // Always remove from panels if exists (prevent duplicates)
      const panelIdx = state.panels.findIndex(p => p.id === contentId)
      if (panelIdx >= 0) {
        state.panels.splice(panelIdx, 1)
      }

      // Remove from editorTabs if exists (prevent duplicates)
      const editorTabIdx = state.editorTabs.findIndex(t => t.id === contentId)
      if (editorTabIdx >= 0) {
        state.editorTabs.splice(editorTabIdx, 1)
      }

      // Check if already in panelTabs
      const existingPanelTabIdx = state.panelTabs.findIndex(t => t.id === contentId)
      if (existingPanelTabIdx >= 0) {
        state.panelTabs[existingPanelTabIdx] = newTab
      } else {
        state.panelTabs.push(newTab)
      }
      state.activePanelTabId = contentId
      state.visibility.panelArea = true

    } else {
      // Target is 'primary' or 'secondary' - convert to Panel

      // Remove from editorTabs if exists (prevent duplicates)
      const editorTabIdx = state.editorTabs.findIndex(t => t.id === contentId)
      if (editorTabIdx >= 0) {
        state.editorTabs.splice(editorTabIdx, 1)
        if (state.activeEditorTabId === contentId) {
          state.activeEditorTabId = state.editorTabs[0]?.id ?? null
        }
      }

      // Remove from panelTabs if exists (prevent duplicates)
      const panelTabIdx = state.panelTabs.findIndex(t => t.id === contentId)
      if (panelTabIdx >= 0) {
        state.panelTabs.splice(panelTabIdx, 1)
        if (state.activePanelTabId === contentId) {
          state.activePanelTabId = state.panelTabs[0]?.id ?? null
        }
      }

      // Check if panel already exists in state.panels (prevent duplicates)
      const existingPanelIdx = state.panels.findIndex(p => p.id === contentId)

      if (existingPanelIdx >= 0) {
        // Panel exists - just update its location property
        const existingPanel = state.panels[existingPanelIdx]!
        existingPanel.location = targetLocation
      } else {
        // Need to create a new panel registration
        const newPanel: Panel = {
          id: commonProps.id,
          title: commonProps.title,
          icon: commonProps.icon,
          component: commonProps.component,
          location: targetLocation,
          closable: commonProps.closable,
          order: order ?? 0,
          badge: commonProps.badge
        }
        state.panels.push(newPanel)
      }

      // Set or update position override
      const panelsInLocation = state.panels.filter(
        p => getEffectivePanelLocation(p, state.panelPositionOverrides) === targetLocation && p.id !== contentId
      )
      const newOrder = order ?? panelsInLocation.length

      state.panelPositionOverrides.set(contentId, {
        panelId: contentId,
        location: targetLocation,
        order: newOrder
      })

      // Update active panel for the location
      if (targetLocation === 'primary') {
        state.activePrimaryPanelId = contentId
        state.visibility.primarySidebar = true
      } else if (targetLocation === 'secondary') {
        state.activeSecondaryPanelId = contentId
        state.visibility.secondarySidebar = true
      }
    }

    persistState(state)
    console.log(`[LayoutState] Moved ${contentId} from ${found.sourceLocation} to ${targetLocation}`)
  }

  /**
   * Swap all panels between two locations
   * @param location1 First location
   * @param location2 Second location
   */
  function swapLocations(location1: PanelLocation, location2: PanelLocation) {
    const panels1 = state.panels.filter(
      p => getEffectivePanelLocation(p, state.panelPositionOverrides) === location1
    )
    const panels2 = state.panels.filter(
      p => getEffectivePanelLocation(p, state.panelPositionOverrides) === location2
    )

    // Move panels from location1 to location2
    for (const panel of panels1) {
      const currentOrder = getEffectivePanelOrder(panel, state.panelPositionOverrides)
      state.panelPositionOverrides.set(panel.id, {
        panelId: panel.id,
        location: location2,
        order: currentOrder
      })
    }

    // Move panels from location2 to location1
    for (const panel of panels2) {
      const currentOrder = getEffectivePanelOrder(panel, state.panelPositionOverrides)
      state.panelPositionOverrides.set(panel.id, {
        panelId: panel.id,
        location: location1,
        order: currentOrder
      })
    }

    // Swap active panel IDs if swapping primary and secondary
    if ((location1 === 'primary' && location2 === 'secondary') ||
        (location1 === 'secondary' && location2 === 'primary')) {
      const tempActive = state.activePrimaryPanelId
      state.activePrimaryPanelId = state.activeSecondaryPanelId
      state.activeSecondaryPanelId = tempActive
    }

    persistState(state)
    console.log(`[LayoutState] Swapped panels between ${location1} and ${location2}`)
  }

  /**
   * Reset panel position override (restore to default location)
   * @param panelId The ID of the panel to reset
   */
  function resetPanelPosition(panelId: string) {
    state.panelPositionOverrides.delete(panelId)
    persistState(state)
    console.log(`[LayoutState] Reset panel position: ${panelId}`)
  }

  /**
   * Reset all panel position overrides
   */
  function resetAllPanelPositions() {
    state.panelPositionOverrides.clear()
    persistState(state)
    console.log('[LayoutState] Reset all panel positions')
  }

  /**
   * Get current panel position overrides as array (for persistence)
   */
  function getPanelPositionOverrides(): PanelPositionOverride[] {
    return Array.from(state.panelPositionOverrides.values())
  }

  /**
   * Set panel position overrides from array (for loading)
   */
  function setPanelPositionOverrides(overrides: PanelPositionOverride[]) {
    state.panelPositionOverrides.clear()
    for (const override of overrides) {
      state.panelPositionOverrides.set(override.panelId, override)
    }
    // Don't persist here - this is for loading
  }

  /**
   * Apply layout values from external source (e.g., workspace file)
   * Does NOT persist to localStorage - use for loading workspace-specific layouts
   */
  function applyLayoutValues(
    dimensions?: {
      primarySidebarWidth?: number
      secondarySidebarWidth?: number
      panelAreaHeight?: number
    },
    visibility?: {
      primarySidebar?: boolean
      secondarySidebar?: boolean
      panelArea?: boolean
      activityBar?: boolean
      statusBar?: boolean
    },
    activeActivityId?: string | null,
    panelPositions?: PanelPositionOverride[]
  ): void {
    if (dimensions) {
      if (dimensions.primarySidebarWidth !== undefined) {
        state.dimensions.primarySidebarWidth = Math.max(
          state.dimensions.primarySidebarMinWidth,
          Math.min(state.dimensions.primarySidebarMaxWidth, dimensions.primarySidebarWidth)
        )
      }
      if (dimensions.secondarySidebarWidth !== undefined) {
        state.dimensions.secondarySidebarWidth = Math.max(
          state.dimensions.secondarySidebarMinWidth,
          Math.min(state.dimensions.secondarySidebarMaxWidth, dimensions.secondarySidebarWidth)
        )
      }
      if (dimensions.panelAreaHeight !== undefined) {
        state.dimensions.panelAreaHeight = Math.max(
          state.dimensions.panelAreaMinHeight,
          Math.min(state.dimensions.panelAreaMaxHeight, dimensions.panelAreaHeight)
        )
      }
    }

    if (visibility) {
      if (visibility.primarySidebar !== undefined) {
        state.visibility.primarySidebar = visibility.primarySidebar
      }
      if (visibility.secondarySidebar !== undefined) {
        state.visibility.secondarySidebar = visibility.secondarySidebar
      }
      if (visibility.panelArea !== undefined) {
        state.visibility.panelArea = visibility.panelArea
      }
      if (visibility.activityBar !== undefined) {
        state.visibility.activityBar = visibility.activityBar
      }
      if (visibility.statusBar !== undefined) {
        state.visibility.statusBar = visibility.statusBar
      }
    }

    if (activeActivityId !== undefined) {
      state.activeActivityId = activeActivityId
    }

    // Apply panel position overrides
    if (panelPositions !== undefined) {
      state.panelPositionOverrides.clear()
      for (const pos of panelPositions) {
        state.panelPositionOverrides.set(pos.panelId, pos)
      }
    }

    console.log('[LayoutState] Applied external layout values')
  }

  /**
   * Export current layout values for saving to external storage
   */
  function exportLayoutValues(): {
    dimensions: {
      primarySidebarWidth: number
      secondarySidebarWidth: number
      panelAreaHeight: number
    }
    visibility: {
      primarySidebar: boolean
      secondarySidebar: boolean
      panelArea: boolean
      activityBar: boolean
      statusBar: boolean
    }
    activeActivityId: string | null
  } {
    return {
      dimensions: {
        primarySidebarWidth: state.dimensions.primarySidebarWidth,
        secondarySidebarWidth: state.dimensions.secondarySidebarWidth,
        panelAreaHeight: state.dimensions.panelAreaHeight
      },
      visibility: {
        primarySidebar: state.visibility.primarySidebar,
        secondarySidebar: state.visibility.secondarySidebar,
        panelArea: state.visibility.panelArea,
        activityBar: state.visibility.activityBar,
        statusBar: state.visibility.statusBar
      },
      activeActivityId: state.activeActivityId
    }
  }

  return {
    // State
    state,

    // Computed
    activeActivity,
    activePrimaryPanel,
    activeSecondaryPanel,
    activeEditorTab,
    activePanelTab,
    primaryPanels,
    secondaryPanels,
    bottomPanels,

    // Activity methods
    registerActivity,
    unregisterActivity,
    selectActivity,

    // Panel methods
    registerPanel,
    unregisterPanel,
    selectPanel,

    // Editor methods
    openEditor,
    closeEditor,
    selectEditor,
    setEditorDirty,

    // Panel area methods
    registerPanelTab,
    selectPanelTab,
    updatePanelTabBadge,
    updateBadge,

    // Status bar methods
    registerStatusBarItem,
    unregisterStatusBarItem,

    // Visibility methods
    togglePrimarySidebar,
    toggleSecondarySidebar,
    togglePanelArea,
    setPrimarySidebarVisible,
    setSecondarySidebarVisible,
    setPanelAreaVisible,

    // Dimension methods
    setPrimarySidebarWidth,
    setSecondarySidebarWidth,
    setPanelAreaHeight,

    // Panel position methods
    movePanel,
    findContentById,
    swapLocations,
    resetPanelPosition,
    resetAllPanelPositions,
    getPanelPositionOverrides,
    setPanelPositionOverrides,

    // Perspective support methods
    clearPanels,
    clearActivities,
    clearEditorTabs,
    clearPanelTabs,
    clearAll,

    // External sync methods (for workspace persistence)
    applyLayoutValues,
    exportLayoutValues
  }
}

/**
 * Shared layout state (for use without composable pattern)
 */
export function useSharedLayoutState() {
  return useLayoutState()
}
