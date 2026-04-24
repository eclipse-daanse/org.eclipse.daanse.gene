/**
 * Model View Package
 *
 * Provides configurable views into EMF model hierarchies.
 * A View defines which levels of the model chain are visible (depth)
 * and which classes are filtered out.
 *
 * Key concepts:
 * - Focus: The resource being edited (your "instance")
 * - Depth: How many meta-levels above the focus are visible
 * - Filter: Which EClasses to show/hide per level
 *
 * This module provides:
 * - useModelView/useSharedModelView: State management for model depth
 * - DepthToolbar (ModelEditorPerspective): UI component for depth control
 *
 * The actual tree/editor UI comes from the existing Instance Editor.
 */

import type { ModuleContext } from '@eclipse-daanse/tsm'

// Types
export type {
  ModelView,
  ModelLevel,
  ClassFilter,
  Perspective,
  PerspectiveLayout,
  ModelTreeNode
} from './types'

export { DEFAULT_PERSPECTIVES } from './types'

// Composables
export { useModelView, useSharedModelView } from './composables/useModelView'

// Components - DepthToolbar for controlling view depth
export { default as ModelEditorPerspective } from './components/ModelEditorPerspective.vue'

// Import for registration
import ModelEditorPerspective from './components/ModelEditorPerspective.vue'
import { useModelView, useSharedModelView } from './composables/useModelView'

const components = {
  ModelEditorPerspective,
  // Alias for clarity
  DepthToolbar: ModelEditorPerspective
}

/**
 * TSM lifecycle: activate
 * Registers model view services
 */
export async function activate(context: ModuleContext): Promise<void> {
  context.log.info('Activating Model View module...')

  // Register components as service
  context.services.register('ui.model-view.components', components)

  // Register composables as service
  context.services.register('ui.model-view.composables', {
    useModelView,
    useSharedModelView
  })

  context.log.info('Model View module activated')
}

/**
 * TSM lifecycle: deactivate
 * Unregisters services
 */
export async function deactivate(context: ModuleContext): Promise<void> {
  context.log.info('Deactivating Model View module...')

  context.services.unregister('ui.model-view.components')
  context.services.unregister('ui.model-view.composables')

  context.log.info('Model View module deactivated')
}
