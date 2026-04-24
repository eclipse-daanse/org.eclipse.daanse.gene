/**
 * Perspectives Type Definitions
 */

import type { Component } from 'tsm:vue'
import type { Resource } from '@emfts/core'

/**
 * Available perspective identifiers
 */
export type PerspectiveId = 'explorer' | 'model-editor' | 'metamodeler'

/**
 * Panel location in the layout
 */
export type PanelLocation = 'primary' | 'secondary' | 'bottom' | 'editor'

/**
 * Panel configuration for a perspective
 */
export interface PerspectivePanel {
  /** Panel ID */
  id: string
  /** Panel location */
  location: PanelLocation
  /** Component to render */
  component?: Component
  /** Panel title */
  title?: string
  /** Panel icon */
  icon?: string
}

/**
 * Perspective definition
 */
export interface Perspective {
  /** Unique perspective ID */
  id: PerspectiveId
  /** Display name */
  name: string
  /** Icon class (e.g., 'pi pi-folder') */
  icon: string
  /** Panels to display in this perspective */
  panels: PerspectivePanel[]
  /** Activities to show in activity bar */
  activities?: string[]
}

/**
 * State for perspective management
 */
export interface PerspectiveState {
  /** Currently active perspective */
  currentPerspective: PerspectiveId
  /** Currently open workspace resource (XMI) */
  openWorkspace: Resource | null
  /** Path to the open workspace file */
  workspacePath: string | null
  /** Whether a workspace is being loaded */
  loading: boolean
  /** Error message if any */
  error: string | null
  /** Workspace-specific settings */
  workspaceSettings: WorkspaceSettings
}

/**
 * Perspective service interface
 */
export interface PerspectiveService {
  /** Current state */
  state: PerspectiveState
  /** Switch to a different perspective */
  switchTo: (perspectiveId: PerspectiveId) => void
  /** Open a workspace from XMI content */
  openWorkspace: (resource: Resource, path: string) => void
  /** Close the current workspace */
  closeWorkspace: () => void
  /** Get the current perspective */
  getCurrentPerspective: () => Perspective | undefined
  /** Register a perspective */
  registerPerspective: (perspective: Perspective) => void
  /** Update workspace settings */
  updateWorkspaceSettings: (settings: Partial<WorkspaceSettings>) => void
}

/**
 * Storage strategy for workspace data
 */
export type StorageStrategy = 'single-file' | 'file-per-entity'

/**
 * Workspace-specific settings
 */
export interface WorkspaceSettings {
  /** Storage strategy for model data */
  storageStrategy: StorageStrategy
}

/**
 * Default workspace settings
 */
export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  storageStrategy: 'single-file'
}

/**
 * Default perspectives (legacy)
 */
export const DEFAULT_PERSPECTIVES: Record<PerspectiveId, Perspective> = {
  'explorer': {
    id: 'explorer',
    name: 'Explorer',
    icon: 'pi pi-folder',
    panels: [
      { id: 'file-explorer', location: 'primary', title: 'Explorer', icon: 'pi pi-folder' },
      { id: 'welcome', location: 'editor', title: 'Workspace' }
    ],
    activities: ['file-explorer']
  },
  'model-editor': {
    id: 'model-editor',
    name: 'Model Editor',
    icon: 'pi pi-box',
    panels: [
      { id: 'instance-tree', location: 'primary', title: 'Instances', icon: 'pi pi-sitemap' },
      { id: 'properties', location: 'editor', title: 'Properties', icon: 'pi pi-sliders-h' },
      { id: 'model-browser', location: 'secondary', title: 'Models', icon: 'pi pi-box' }
    ],
    activities: ['instance-tree', 'model-browser']
  },
  'metamodeler': {
    id: 'metamodeler',
    name: 'Metamodeler',
    icon: 'pi pi-sitemap',
    panels: [
      { id: 'metamodeler', location: 'editor', title: 'Metamodeler', icon: 'pi pi-sitemap' }
    ],
    activities: ['metamodeler']
  }
}
