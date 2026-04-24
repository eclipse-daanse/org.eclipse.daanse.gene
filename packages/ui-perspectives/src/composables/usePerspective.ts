/**
 * Perspective State Management
 *
 * Singleton composable for managing application perspectives.
 */

import { reactive, readonly } from 'tsm:vue'
import type { Resource } from '@emfts/core'
import type {
  PerspectiveId,
  Perspective,
  PerspectiveState,
  PerspectiveService,
  WorkspaceSettings
} from '../types'
import { DEFAULT_PERSPECTIVES, DEFAULT_WORKSPACE_SETTINGS } from '../types'

// Singleton state
let perspectiveState: PerspectiveState | null = null
let perspectives: Map<PerspectiveId, Perspective> | null = null

/**
 * Initialize the perspective state
 */
function initState(): PerspectiveState {
  if (!perspectiveState) {
    perspectiveState = reactive<PerspectiveState>({
      currentPerspective: 'explorer',
      openWorkspace: null,
      workspacePath: null,
      loading: false,
      error: null,
      workspaceSettings: { ...DEFAULT_WORKSPACE_SETTINGS }
    })

    // Initialize default perspectives
    perspectives = new Map()
    for (const [id, perspective] of Object.entries(DEFAULT_PERSPECTIVES)) {
      perspectives.set(id as PerspectiveId, perspective)
    }
  }
  return perspectiveState
}

/**
 * Composable for perspective management
 */
export function usePerspective(): PerspectiveService {
  const state = initState()

  /**
   * Switch to a different perspective
   */
  function switchTo(perspectiveId: PerspectiveId): void {
    if (!perspectives?.has(perspectiveId)) {
      console.warn(`Perspective not found: ${perspectiveId}`)
      return
    }

    state.currentPerspective = perspectiveId
    console.log(`Switched to perspective: ${perspectiveId}`)
  }

  /**
   * Open a workspace from an EMF Resource
   */
  function openWorkspace(resource: Resource, path: string): void {
    state.openWorkspace = resource
    state.workspacePath = path
    state.error = null

    // Automatically switch to model-editor perspective
    switchTo('model-editor')

    console.log(`Opened workspace: ${path}`)
  }

  /**
   * Close the current workspace
   */
  function closeWorkspace(): void {
    state.openWorkspace = null
    state.workspacePath = null
    state.error = null
    // Reset workspace settings to defaults
    Object.assign(state.workspaceSettings, DEFAULT_WORKSPACE_SETTINGS)

    // Switch back to explorer perspective
    switchTo('explorer')

    console.log('Closed workspace')
  }

  /**
   * Get the current perspective definition
   */
  function getCurrentPerspective(): Perspective | undefined {
    return perspectives?.get(state.currentPerspective)
  }

  /**
   * Register a new perspective or update an existing one
   */
  function registerPerspective(perspective: Perspective): void {
    perspectives?.set(perspective.id, perspective)
  }

  /**
   * Update workspace settings
   */
  function updateWorkspaceSettings(settings: Partial<WorkspaceSettings>): void {
    Object.assign(state.workspaceSettings, settings)
    console.log('Updated workspace settings:', state.workspaceSettings)
  }

  return {
    state: readonly(state) as PerspectiveState,
    switchTo,
    openWorkspace,
    closeWorkspace,
    getCurrentPerspective,
    registerPerspective,
    updateWorkspaceSettings
  }
}

/**
 * Get the shared perspective service instance
 * Alias for usePerspective() to match naming convention
 */
export function useSharedPerspective(): PerspectiveService {
  return usePerspective()
}
