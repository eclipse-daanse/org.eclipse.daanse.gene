/**
 * Registry Types
 *
 * Core type definitions for the perspective, panel, and activity registries.
 */

import type { Component, Raw } from 'tsm:vue'

/**
 * Layout locations where panels can be placed
 */
export type LayoutLocation = 'left' | 'center' | 'right' | 'bottom'

/**
 * Panel definition for registration
 */
export interface PanelDefinition {
  /** Unique panel ID */
  id: string
  /** Display title */
  title: string
  /** Icon class (e.g., 'pi pi-folder') */
  icon: string
  /** Vue component to render */
  component: Component | Raw<Component>
  /** Which perspectives this panel is available in ('*' = all) */
  perspectives: string[] | '*'
  /** Default location in layout */
  defaultLocation: LayoutLocation
  /** Default order within location (lower = higher priority) */
  defaultOrder?: number
  /** Whether the panel can be closed */
  closable?: boolean
  /** Context provider for perspective-specific data */
  getContext?: (perspectiveId: string, workspace: any) => any
}

/**
 * Activity definition for the activity bar
 */
export interface ActivityDefinition {
  /** Unique activity ID */
  id: string
  /** Icon class */
  icon: string
  /** Display label */
  label: string
  /** Tooltip text */
  tooltip?: string
  /** Associated panel ID (opens when clicked) */
  panelId?: string
  /** Associated perspective ID (switches when clicked) */
  perspectiveId?: string
  /** Order in activity bar (lower = higher) */
  order?: number
  /** Which perspectives this activity appears in ('*' = all) */
  perspectives: string[] | '*'
}

/**
 * Perspective definition
 */
export interface PerspectiveDefinition {
  /** Unique perspective ID */
  id: string
  /** Display name */
  name: string
  /** Icon class */
  icon: string
  /** Whether this perspective requires an open workspace */
  requiresWorkspace: boolean
  /** Sort order in ActivityBar (lower = higher). Perspectives without order appear last. */
  order?: number
  /** Default layout configuration */
  defaultLayout: {
    left?: string[]    // Panel IDs
    center?: string[]  // Editor/Panel IDs
    right?: string[]   // Panel IDs
    bottom?: string[]  // Panel IDs
  }
  /** Default visibility settings */
  defaultVisibility?: {
    left?: boolean
    right?: boolean
    bottom?: boolean
  }
  /** Setup function called when perspective is activated */
  onActivate?: (context: PerspectiveContext) => void | Promise<void>
  /** Cleanup function called when perspective is deactivated */
  onDeactivate?: (context: PerspectiveContext) => void | Promise<void>
}

/**
 * Context passed to perspective lifecycle hooks
 */
export interface PerspectiveContext {
  /** Current workspace (if any) */
  workspace: any | null
  /** Layout state for registering panels */
  layout: any
  /** Panel registry */
  panelRegistry: PanelRegistry
  /** Activity registry */
  activityRegistry: ActivityRegistry
}

/**
 * Workspace layout state (persisted per workspace)
 */
export interface WorkspaceLayoutState {
  /** Layout state per perspective */
  perspectives: {
    [perspectiveId: string]: PerspectiveLayoutState
  }
}

/**
 * Layout state for a single perspective
 */
export interface PerspectiveLayoutState {
  /** Panel positions (overrides defaults) */
  panelPositions: { [panelId: string]: LayoutLocation }
  /** Panel sizes */
  panelSizes: { [panelId: string]: number }
  /** Sidebar/panel visibility */
  visibility: {
    left: boolean
    right: boolean
    bottom: boolean
  }
  /** Sidebar widths */
  dimensions: {
    leftWidth: number
    rightWidth: number
    bottomHeight: number
  }
}

/**
 * Panel Registry interface
 */
export interface PanelRegistry {
  /** Register a panel */
  register(panel: PanelDefinition): void
  /** Unregister a panel */
  unregister(id: string): void
  /** Get a panel by ID */
  get(id: string): PanelDefinition | undefined
  /** Get all panels */
  getAll(): PanelDefinition[]
  /** Get panels available for a perspective */
  getForPerspective(perspectiveId: string): PanelDefinition[]
  /** Get panels for a specific location in a perspective */
  getForLocation(perspectiveId: string, location: LayoutLocation): PanelDefinition[]
}

/**
 * Activity Registry interface
 */
export interface ActivityRegistry {
  /** Register an activity */
  register(activity: ActivityDefinition): void
  /** Unregister an activity */
  unregister(id: string): void
  /** Get an activity by ID */
  get(id: string): ActivityDefinition | undefined
  /** Get all activities */
  getAll(): ActivityDefinition[]
  /** Get activities for a perspective */
  getForPerspective(perspectiveId: string): ActivityDefinition[]
}

/**
 * Perspective Registry interface
 */
export interface PerspectiveRegistry {
  /** Register a perspective */
  register(perspective: PerspectiveDefinition): void
  /** Unregister a perspective */
  unregister(id: string): void
  /** Get a perspective by ID */
  get(id: string): PerspectiveDefinition | undefined
  /** Get all perspectives */
  getAll(): PerspectiveDefinition[]
  /** Get perspectives that don't require a workspace */
  getAvailableWithoutWorkspace(): PerspectiveDefinition[]
}

/**
 * Combined registry service
 */
export interface RegistryService {
  perspectives: PerspectiveRegistry
  panels: PanelRegistry
  activities: ActivityRegistry
}
