/**
 * WorkspaceActionService
 *
 * Global singleton service for App-level workspace actions.
 * Components use useWorkspaceActions() instead of emitting events up to App.vue.
 * Same singleton pattern as EventBus (gene.eventbus TSM service).
 */

import type { ComputedRef } from 'tsm:vue'

/** Minimal FileEntry shape (avoids hard dependency on ui-file-explorer) */
export interface FileEntryLike {
  name: string
  path: string
  sourceId?: string
  handle?: any
  [key: string]: any
}

export interface ReferenceSearchOptions {
  feature: any
  resource: any
  callback: (obj: any) => void
}

export interface WorkspaceActionService {
  // --- Model / Instance Loading ---
  loadModel(entry: FileEntryLike, content: string): Promise<void>
  loadInstances(entry: FileEntryLike, content: string): Promise<void>

  // --- File Type Handlers ---
  openWorkspace(entry: FileEntryLike, content: string): Promise<void>
  openMetamodelInEditor(entry: FileEntryLike, content: string): Promise<void>
  loadCoclFile(entry: FileEntryLike, content: string): Promise<void>
  loadTransformation(entry: FileEntryLike, content: string): Promise<void>
  loadDmnFile(entry: FileEntryLike, content: string): Promise<void>
  publishToAtlas(entry: FileEntryLike, content: string): void

  // --- Navigation ---
  selectObject(obj: any): void
  selectFile(file: any): void
  showProblemsPanel(): void
  openSearchDialog(options?: ReferenceSearchOptions): void
  createInstance(classInfo: any): void

  // --- Workspace State (readonly) ---
  readonly isWorkspaceOpen: ComputedRef<boolean>
}

// Module-level singleton
let _instance: WorkspaceActionService | null = null

/**
 * Register the workspace action service singleton.
 * Called once from App.vue during setup.
 * Also registers as TSM service 'gene.workspace.actions'.
 */
export function registerWorkspaceActions(service: WorkspaceActionService, tsm?: any): void {
  _instance = service
  if (tsm) {
    tsm.registerService('gene.workspace.actions', service)
  }
}

/**
 * Get the shared WorkspaceActionService instance.
 * Components call this instead of using props/emits for App-level actions.
 */
export function useWorkspaceActions(): WorkspaceActionService {
  if (_instance) return _instance
  throw new Error('[WorkspaceActionService] Not available — must be registered by App.vue first')
}
