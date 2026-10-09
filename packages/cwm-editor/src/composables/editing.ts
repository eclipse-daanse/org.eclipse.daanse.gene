/**
 * What the rows of the context view share: one way to change the model
 * (write, mark the document dirty, re-render) and the indexes built once per
 * model version instead of once per row.
 */
import type { ComputedRef, InjectionKey } from 'tsm:vue'
import type { ReferenceIndex } from './references'

export interface CwmEditing {
  /** Runs a model change, then marks the document dirty and re-renders */
  change: (write: () => void) => void
  /** Selects an object like a click in the tree */
  select: (object: any) => void
  /** The object selected in the tree */
  selected: ComputedRef<any>
  setContext: (object: any) => void
  /** Validates one object anew with the problems service */
  validate: (object: any) => void
  /** Issues the problems service holds for the object */
  issuesFor: (object: any) => { severity: string; message: string }[]
  deleteObject: (object: any) => void
  /** SQL data types of the resource set, for the columns table */
  dataTypes: ComputedRef<any[]>
  /** Class for new descriptions, taken from an existing one */
  descriptionClass: ComputedRef<any | null>
  /** target -> reference objects pointing at it */
  references: ComputedRef<ReferenceIndex>
  /** Reference objects that could still point at the target */
  referenceCandidates: (target: any) => any[]
}

export const CWM_EDITING: InjectionKey<CwmEditing> = Symbol('cwm-editing')
