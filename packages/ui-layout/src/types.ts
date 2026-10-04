/**
 * Layout System Types
 *
 * Type definitions for the VS Code-like layout system.
 */

import type { Component, Raw } from 'tsm:vue'

/**
 * Activity bar item - represents an icon in the activity bar
 */
export interface Activity {
  id: string
  icon: string  // PrimeIcons class (e.g., 'pi pi-folder')
  label: string
  tooltip?: string
  badge?: number | string
  panel?: string  // ID of the panel to show in primary sidebar
}

/**
 * Panel location in the layout
 * - 'primary': Left sidebar
 * - 'secondary': Right sidebar
 * - 'editor': Center/editor area
 * - 'bottom': Bottom panel area
 */
/**
 * Wo ein Panel sitzt.
 *
 * Die linke Seite ist zweigeteilt: oben der Navigator (Explorer, Model Atlas),
 * unten die Ansicht zur offenen Datei — ihr Baum. Deshalb 'primary-bottom'.
 */
export type PanelLocation = 'primary' | 'secondary' | 'editor' | 'bottom'

/**
 * A zone of the frame that a tab can dock one of its panes into.
 *
 * The zone is the frame's; what is shown in it belongs to the tab in front,
 * rendered there by Teleport and gone when the tab goes. Lower left is where a
 * file's tree docks, the right side where its model browser docks.
 */
export type DockZone = 'primary-bottom' | 'secondary'

/** What a tab tells the frame when it docks a pane. */
export interface DockInfo {
  title: string
  icon?: string
  /** Takes the pane back into the tab - the frame offers it as a button. */
  undock: () => void
}

/**
 * Sidebar/Panel content definition
 */
export interface Panel {
  id: string
  title: string
  icon?: string
  component: Raw<Component>
  location: PanelLocation
  closable?: boolean
  order?: number
  badge?: number | string
}

/**
 * Editor tab definition
 */
export interface EditorTab {
  id: string
  title: string
  icon?: string
  component: Raw<Component>
  props?: Record<string, unknown>
  dirty?: boolean
  closable?: boolean
  pinned?: boolean
  badge?: number | string
}

/**
 * Panel tab in the bottom panel area
 */
export interface PanelTab {
  id: string
  title: string
  icon?: string
  component: Raw<Component>
  props?: Record<string, unknown>
  badge?: number | string
}

/**
 * Status bar item
 */
export interface StatusBarItem {
  id: string
  content: string | Raw<Component>
  alignment: 'left' | 'right'
  priority?: number
  tooltip?: string
  onClick?: () => void
}

/**
 * Layout dimensions configuration
 */
export interface LayoutDimensions {
  activityBarWidth: number
  statusBarHeight: number
  primarySidebarWidth: number
  primarySidebarMinWidth: number
  primarySidebarMaxWidth: number
  /** Hoehe der unteren Haelfte links, in Pixeln */
  primaryBottomHeight: number
  primaryBottomMinHeight: number
  secondarySidebarWidth: number
  secondarySidebarMinWidth: number
  secondarySidebarMaxWidth: number
  panelAreaHeight: number
  panelAreaMinHeight: number
  panelAreaMaxHeight: number
}

/**
 * Layout visibility state
 */
export interface LayoutVisibility {
  primarySidebar: boolean
  secondarySidebar: boolean
  panelArea: boolean
  statusBar: boolean
  activityBar: boolean
}

/**
 * Panel position override - allows moving panels to different locations
 */
export interface PanelPositionOverride {
  panelId: string
  location: PanelLocation
  order: number
}

/**
 * Complete layout state
 */
export interface LayoutState {
  // Activities
  activities: Activity[]
  activeActivityId: string | null

  // Panels
  panels: Panel[]
  activePrimaryPanelId: string | null
  /** What is docked into each zone right now - by the tab in front, or nobody */
  docks: Record<DockZone, DockInfo | null>
  activeSecondaryPanelId: string | null

  // Panel position overrides (allows moving panels to different locations)
  panelPositionOverrides: Map<string, PanelPositionOverride>

  // Editors
  editorTabs: EditorTab[]
  activeEditorTabId: string | null

  // Panel area tabs
  panelTabs: PanelTab[]
  activePanelTabId: string | null

  // Status bar
  statusBarItems: StatusBarItem[]

  // Dimensions
  dimensions: LayoutDimensions

  // Visibility
  visibility: LayoutVisibility
}

/**
 * Default layout dimensions
 */
export const DEFAULT_DIMENSIONS: LayoutDimensions = {
  activityBarWidth: 48,
  statusBarHeight: 24,
  primarySidebarWidth: 260,
  primarySidebarMinWidth: 170,
  primarySidebarMaxWidth: 500,
  primaryBottomHeight: 320,
  primaryBottomMinHeight: 80,
  secondarySidebarWidth: 300,
  secondarySidebarMinWidth: 170,
  secondarySidebarMaxWidth: 500,
  panelAreaHeight: 200,
  panelAreaMinHeight: 100,
  panelAreaMaxHeight: 600
}

/**
 * Default visibility state
 */
export const DEFAULT_VISIBILITY: LayoutVisibility = {
  primarySidebar: true,
  secondarySidebar: false,
  panelArea: false,
  statusBar: true,
  activityBar: true
}
