/**
 * Editor Context
 *
 * One context per open file, owned by its tab. The tab builds it and hands it
 * down with `provide`; tree, properties and model browser take it with
 * `inject`. There is no "current" context and no mode to switch: whichever
 * component asks gets the context of the tab it is rendered in, and nothing
 * else exists to be asked.
 *
 * That is deliberate. The previous design kept one global mode and one
 * "current" context that the panels read while rendering; whenever a switch
 * came late, one tab's content stood in another's panel.
 *
 * What remains here is the contract (`EditorContext`), the injection key, and
 * the registry of file views - published together as the `gene.editor.context`
 * service.
 */

import { inject, provide, type InjectionKey, type Ref, type ComputedRef } from 'tsm:vue'
import type { EObject, EClass, EReference, EPackage, Resource } from '@emfts/core'
import { createMetamodelContext } from './metamodelContext'
import {
  registerEditorArt,
  unregisterEditorArt,
  alleEditorArten,
  abgeloestePerspektiven,
  setEditorZuordnungen,
  kandidatenFuer,
  editorFuer,
  wurzelNsUri,
  type EditorArt,
  type EditorZuordnung
} from './editorRegistry'

/** What `EditorContext.mode` can be */
export type EditorMode = 'instance' | 'metamodel'

// EditorContext service interface (for TSM DI registration)
export interface EditorContextService {
  /** Builds the context of one metamodel tab from its metamodeler instance. */
  createMetamodelContext: (metamodeler: unknown) => EditorContext
  registerEditorArt: (art: EditorArt) => void
  unregisterEditorArt: (id: string) => boolean
  alleEditorArten: () => EditorArt[]
  abgeloestePerspektiven: () => string[]
  setEditorZuordnungen: (zuordnungen: EditorZuordnung[]) => void
  kandidatenFuer: (pfad: string, inhalt?: string) => EditorArt[]
  editorFuer: (pfad: string, inhalt?: string) => EditorArt | null
  wurzelNsUri: (inhalt: string) => string | null
}

/**
 * Get the EditorContext service object (for TSM registration)
 */
export function getEditorContextService(): EditorContextService {
  return {
    createMetamodelContext,
    registerEditorArt,
    unregisterEditorArt,
    alleEditorArten,
    abgeloestePerspektiven,
    setEditorZuordnungen,
    kandidatenFuer,
    editorFuer,
    wurzelNsUri
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
 * Info about a managed Resource (for the resource tier of the tree / save UI).
 */
export interface ResourceInfo {
  resource: Resource
  /** Display name (without extension) */
  name: string
  /** Logical/identity URI (determines the target file) */
  uri: string
  /** Whether the resource has unsaved changes */
  dirty: boolean
  /** Whether this is the active (default target) resource */
  isActive: boolean
}

/** Result of serializing one resource for saving */
export interface SerializedResource {
  filename: string
  content: string
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

  /** Every object of a type in this document - for reference pickers */
  getAllObjectsOfType?: (eClass: EClass) => EObject[]

  // Root package (for metamodeler - the package being edited)
  rootPackage?: Ref<EPackage | null>

  // Dirty state
  dirty: Ref<boolean>

  // Mark as dirty (for properties panel to notify changes)
  markDirty?: () => void

  // Trigger update
  triggerUpdate: () => void

  // Monotonic model version, bumped on every model change (driven by the EMF
  // content adapter / triggerUpdate). Consumers can depend on it to re-read
  // model-derived data (e.g. containment children) after mutations.
  version?: Ref<number>

  // ── Resource management (multi-resource editors) ──────────────────────────
  // Optional so a mode that has not adopted the multi-resource model yet
  // (e.g. metamodeler until Phase 7) can omit them.
  resources?: ComputedRef<ResourceInfo[]>
  activeResource?: Ref<Resource | null>
  setActiveResource?: (res: Resource) => void
  createResource?: (name: string, folder?: string) => Resource
  renameResource?: (res: Resource, newName: string) => void
  deleteResource?: (res: Resource) => void
  moveToResource?: (obj: EObject, target: Resource) => boolean
  /** Reorder/move an object so it becomes a sibling of target (after it by default) */
  moveObjectBeside?: (dragged: EObject, target: EObject, after?: boolean) => boolean
  /** Validate a move-beside without performing it (for drag feedback / prevention). */
  canMoveBeside?: (dragged: EObject, target: EObject) => { ok: boolean; reason?: string }
  /** Validate dropping INTO a parent; returns eligible containment refs (dialog if >1). */
  canDropInto?: (dragged: EObject, targetParent: EObject) => { ok: boolean; refs: EReference[]; reason?: string }
  /** Move an object into a parent's specific containment reference. */
  moveInto?: (dragged: EObject, targetParent: EObject, ref: EReference) => boolean
  /** Zwischenablage: Kopieren, Ausschneiden, Einfügen (#63) */
  copyToClipboard?: (element: EObject) => void
  cutToClipboard?: (element: EObject) => void
  hasClipboardContent?: { value: boolean }
  canPasteInto?: (target: EObject) => { ok: boolean; refs: EReference[]; origin?: EReference | null; reason?: string }
  /** `ref` gibt die Containment-Referenz vor (Auswahldialog bei mehreren, #148). */
  pasteInto?: (target: EObject, ref?: EReference) => boolean
  canPasteIntoResource?: (target: Resource) => { ok: boolean; reason?: string }
  pasteIntoResource?: (target: Resource) => boolean
  isResourceDirty?: (res: Resource) => boolean
  /** Serialize one resource → { filename, content } (caller writes the file) */
  saveResource?: (res: Resource) => Promise<SerializedResource>
  /** Serialize all managed resources */
  saveAll?: () => Promise<SerializedResource[]>
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
