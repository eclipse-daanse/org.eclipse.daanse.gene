/**
 * What the rows of the context view share: one way to change the model
 * (write, mark the document dirty, re-render) and the indexes built once per
 * model version instead of once per row.
 */
import type { ComputedRef, InjectionKey, Ref } from 'tsm:vue'
import type { ReferenceIndex } from './references'
import type { GrantIndex } from './grants'

export interface CwmEditing {
  /** Runs a model change, then marks the document dirty and re-renders */
  change: (write: () => void) => void
  /** Selects an object like a click in the tree */
  select: (object: any) => void
  /** The object selected in the tree */
  selected: ComputedRef<any>
  /** The object whose row the pointer is over; its bracket shows in the primary colour */
  hovered: Ref<any>
  setContext: (object: any) => void
  /** Validates one object anew with the problems service */
  validate: (object: any) => void
  /** Issues the problems service holds for the object */
  issuesFor: (object: any) => { severity: string; message: string }[]
  deleteObject: (object: any) => void
  /** The object's icon as the tree shows it: a CSS class or an image */
  iconFor: (object: any) => { iconClass?: string; iconDataUrl?: string } | null
  /** Opens the field rule editor, optionally at an object's attribute */
  openFieldRules: (object?: any, attributeName?: string) => void
  /** All objects of the resource set, once per model version */
  objects: ComputedRef<any[]>
  /** SQL data types of the resource set, for the columns table */
  dataTypes: ComputedRef<any[]>
  /** Classifiers of the resource set, as attribute types */
  classifiers: ComputedRef<any[]>
  /** Class for new descriptions, taken from an existing one */
  descriptionClass: ComputedRef<any | null>
  /** target -> reference objects pointing at it */
  references: ComputedRef<ReferenceIndex>
  /** object -> the access grants on it */
  grants: ComputedRef<GrantIndex>
  /** Reference objects that could still point at the target */
  referenceCandidates: (target: any) => any[]
}

// Symbol.for: a hot reload of this module keeps the same key, so mounted rows still find it
export const CWM_EDITING: InjectionKey<CwmEditing> = Symbol.for('cwm-editing')
