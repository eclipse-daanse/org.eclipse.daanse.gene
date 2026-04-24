/**
 * Editor Context
 *
 * Provides a common interface for both Instance Editor and Metamodeler.
 * Components use inject() to get the current context and work with
 * either instance data (.xmi) or metamodel data (.ecore).
 */

import { inject, provide, ref, computed, type InjectionKey, type Ref, type ComputedRef } from 'tsm:vue'
import type { EObject, EClass, EReference, EPackage } from '@emfts/core'

// ============ Global Reactive Mode ============
// This allows components to reactively switch between contexts

export type EditorMode = 'instance' | 'metamodel'

// Global reactive mode state
const currentMode = ref<EditorMode>('instance')

// Context factories - registered at runtime
let instanceContextFactory: (() => EditorContext) | null = null
let metamodelContextFactory: (() => EditorContext) | null = null

/**
 * Set the current editor mode (called by App.vue on perspective switch)
 */
export function setEditorMode(mode: EditorMode): void {
  console.log('[EditorContext] Setting mode to:', mode)
  currentMode.value = mode
}

/**
 * Get the current editor mode (reactive)
 */
export function getEditorMode(): Ref<EditorMode> {
  return currentMode
}

/**
 * Register the instance context factory
 */
export function registerInstanceContextFactory(factory: () => EditorContext): void {
  instanceContextFactory = factory
}

/**
 * Register the metamodel context factory
 */
export function registerMetamodelContextFactory(factory: () => EditorContext): void {
  metamodelContextFactory = factory
}

// Cached context instances
let cachedInstanceContext: EditorContext | null = null
let cachedMetamodelContext: EditorContext | null = null

/**
 * Get the current context based on mode (non-reactive, for one-time access)
 */
export function getCurrentContext(): EditorContext | null {
  const mode = currentMode.value

  if (mode === 'instance') {
    if (!cachedInstanceContext && instanceContextFactory) {
      cachedInstanceContext = instanceContextFactory()
    }
    return cachedInstanceContext
  } else {
    if (!cachedMetamodelContext && metamodelContextFactory) {
      cachedMetamodelContext = metamodelContextFactory()
    }
    return cachedMetamodelContext
  }
}

/**
 * Get the instance context (always returns instance context)
 */
export function getInstanceContext(): EditorContext | null {
  if (!cachedInstanceContext && instanceContextFactory) {
    cachedInstanceContext = instanceContextFactory()
  }
  return cachedInstanceContext
}

/**
 * Get the metamodel context (always returns metamodel context)
 */
export function getMetamodelContext(): EditorContext | null {
  if (!cachedMetamodelContext && metamodelContextFactory) {
    cachedMetamodelContext = metamodelContextFactory()
  }
  return cachedMetamodelContext
}

// EditorContext service interface (for TSM DI registration)
export interface EditorContextService {
  getEditorMode: () => Ref<EditorMode>
  getCurrentContext: () => EditorContext | null
  getInstanceContext: () => EditorContext | null
  getMetamodelContext: () => EditorContext | null
  setEditorMode: (mode: EditorMode) => void
  registerInstanceContextFactory: (factory: () => EditorContext) => void
  registerMetamodelContextFactory: (factory: () => EditorContext) => void
}

/**
 * Get the EditorContext service object (for TSM registration)
 */
export function getEditorContextService(): EditorContextService {
  return {
    getEditorMode: () => currentMode,
    getCurrentContext,
    getInstanceContext,
    getMetamodelContext,
    setEditorMode,
    registerInstanceContextFactory,
    registerMetamodelContextFactory
  }
}

/**
 * Common interface for tree nodes (works for both instances and ecore elements)
 */
export interface TreeNode {
  key: string
  label: string
  icon?: string
  data?: any
  children?: TreeNode[]
  leaf?: boolean
  selectable?: boolean
  draggable?: boolean
}

/**
 * Package info for the model browser
 */
export interface PackageInfo {
  nsURI: string
  name: string
  nsPrefix: string
  ePackage: EPackage
  sourceFile: string | null
  isBuiltIn: boolean
}

/**
 * Class info for creating instances
 */
export interface ClassInfo {
  qualifiedName: string
  name: string
  eClass: EClass
  packageInfo: PackageInfo
  isAbstract: boolean
  isInterface: boolean
}

/**
 * Editor Context interface - common API for both modes
 */
export interface EditorContext {
  // Mode
  mode: 'instance' | 'metamodel'

  // Tree state
  treeNodes: ComputedRef<TreeNode[]>
  selectedObject: Ref<EObject | null>
  selectedNode: Ref<TreeNode | null>
  selectedKeys: Ref<Record<string, boolean>>
  expandedKeys: Ref<Record<string, boolean>>

  // Selection
  selectObject: (obj: EObject | null) => void
  selectNode: (node: TreeNode) => void

  // Tree operations - context-aware (uses selectedObject as parent)
  createChildInSelected: (eClass: EClass, ref: EReference) => EObject | null
  deleteSelected: () => boolean

  // Tree operations - explicit parent
  createChild: (parent: EObject, ref: EReference, eClass: EClass) => EObject | null
  deleteObject: (obj: EObject) => void

  // Get available operations for selected object
  getAvailableContainmentRefs: () => EReference[]
  getValidChildClasses: (ref: EReference) => EClass[]
  getContainmentReferences: (eClass: EClass) => EReference[]

  // Model Browser - available packages/classes
  allPackages: ComputedRef<PackageInfo[]>
  getConcreteClasses: (pkg: PackageInfo) => ClassInfo[]
  findClass: (qualifiedName: string) => ClassInfo | null

  // Model Browser tree nodes (for displaying package/class hierarchy)
  modelTreeNodes: ComputedRef<any[]>

  // Package management
  unregisterPackage: (nsURI: string) => boolean

  // Root object management
  addRootObject: (obj: EObject) => void

  // Root package (for metamodeler - the package being edited)
  rootPackage?: Ref<EPackage | null>

  // Dirty state
  dirty: Ref<boolean>

  // Mark as dirty (for properties panel to notify changes)
  markDirty?: () => void

  // Trigger update
  triggerUpdate: () => void
}

/**
 * Injection key for the editor context
 * Using Symbol.for() so it's the same symbol across all packages
 */
export const EDITOR_CONTEXT_KEY: InjectionKey<EditorContext> = Symbol.for('gene:editorContext')

/**
 * Provide editor context (call from perspective setup)
 */
export function provideEditorContext(context: EditorContext): void {
  provide(EDITOR_CONTEXT_KEY, context)
}

/**
 * Inject editor context (call from components)
 * Returns null if no context is provided (component used outside perspective)
 */
export function useEditorContext(): EditorContext | null {
  return inject(EDITOR_CONTEXT_KEY, null)
}
