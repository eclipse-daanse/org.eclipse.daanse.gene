/**
 * Registry Module
 *
 * Exports all registry types and implementations.
 */

export * from './types'
export { PanelRegistryImpl } from './PanelRegistry'
export { ActivityRegistryImpl } from './ActivityRegistry'
export {
  PerspectiveManagerImpl,
  type PerspectiveState,
  type PerspectiveManager
} from './PerspectiveRegistry'
export {
  DEFAULT_PERSPECTIVES,
  explorerPerspective,
  modelEditorPerspective
} from './defaultPerspectives'
