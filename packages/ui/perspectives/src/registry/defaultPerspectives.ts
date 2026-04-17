/**
 * Default Perspective Definitions
 *
 * Core perspectives that are always available (not plugin-dependent).
 * Plugin-specific perspectives are registered by each plugin in its activate() function.
 */

import type { PerspectiveDefinition } from './types'

/**
 * File Explorer perspective
 * - Browse local file system
 * - Open workspaces
 * - No workspace required
 */
export const explorerPerspective: PerspectiveDefinition = {
  id: 'explorer',
  name: 'Explorer',
  icon: 'pi pi-folder',
  requiresWorkspace: false,
  order: 10,
  defaultLayout: {
    left: ['file-explorer'],
    center: ['welcome'],
    right: [],
    bottom: []
  },
  defaultVisibility: {
    left: true,
    right: false,
    bottom: false
  }
}

/**
 * Model Editor perspective
 * - Edit EMF model instances
 * - View model structure in tree
 * - Edit properties
 * - Requires workspace
 */
export const modelEditorPerspective: PerspectiveDefinition = {
  id: 'model-editor',
  name: 'Model Editor',
  icon: 'pi pi-box',
  requiresWorkspace: true,
  order: 20,
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
  }
}

/**
 * All default perspectives (core only — plugins register their own)
 */
export const DEFAULT_PERSPECTIVES: PerspectiveDefinition[] = [
  explorerPerspective,
  modelEditorPerspective
]
