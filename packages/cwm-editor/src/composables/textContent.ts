/**
 * The text of an ObjectRow (FR-2.5, CON-2.5).
 *
 * The text lives in a Description's `body`: for a Description row its own,
 * for a Table the description the table owns about itself. Its type -
 * Markdown, Mermaid or README - is detected from the text and stored in the
 * model as a TaggedValue `textType` on the description, so it survives
 * saving and loading. CWM itself has no attribute for it, and `type` is
 * already used for doc/inline.
 */
import { toRaw } from 'tsm:vue'
import { attr, isDescription, isTable, many } from './documentation'
import { children } from './contextView'

export type TextType = 'markdown' | 'mermaid' | 'readme'

export const TEXT_TYPES: { value: TextType; label: string }[] = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'mermaid', label: 'Mermaid' },
  { value: 'readme', label: 'README' }
]

const TEXT_TYPE_TAG = 'textType'

export interface RowText {
  /** The Description holding the text */
  owner: any
  body: string
  type: TextType
  /** The type is stored in the model, not only detected */
  stored: boolean
}

const MERMAID_START = /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph)\b/
const MARKDOWN_HINTS = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)/

export function detectTextType(body: string): TextType {
  if (MERMAID_START.test(body)) return 'mermaid'
  if (MARKDOWN_HINTS.test(body)) return 'markdown'
  return 'readme'
}

/** The description that holds the row's text, or null */
export function textOwner(object: any): any | null {
  const o = toRaw(object)
  if (isDescription(o)) return o
  if (isTable(o)) return children(o).find(d => isDescription(d) && many(attr(d, 'modelElement')).includes(o)) ?? null
  return null
}

function taggedValues(o: any): any[] {
  return many(attr(o, 'taggedValue'))
}

function storedType(owner: any): TextType | null {
  const tv = taggedValues(owner).find(t => attr(t, 'tag') === TEXT_TYPE_TAG)
  const value = tv ? String(attr(tv, 'value') ?? '') : ''
  return TEXT_TYPES.some(t => t.value === value) ? (value as TextType) : null
}

export function textOf(object: any): RowText | null {
  const owner = textOwner(object)
  if (!owner) return null
  const body = String(attr(owner, 'body') ?? '')
  const stored = storedType(owner)
  return { owner, body, type: stored ?? detectTextType(body), stored: !!stored }
}

/** A new TaggedValue, created by the factory of the package that defines it */
function createTaggedValue(owner: any): any | null {
  const feature = owner.eClass().getEStructuralFeature('taggedValue')
  const eClass = feature?.getEType?.()
  const factory = eClass?.getEPackage?.()?.getEFactoryInstance?.()
  return eClass && factory ? factory.create(eClass) : null
}

function setTextType(owner: any, type: TextType): void {
  const existing = taggedValues(owner).find(t => attr(t, 'tag') === TEXT_TYPE_TAG)
  const tv = existing ?? createTaggedValue(owner)
  if (!tv) return
  tv.eSet(tv.eClass().getEStructuralFeature('tag'), TEXT_TYPE_TAG)
  tv.eSet(tv.eClass().getEStructuralFeature('value'), type)
  if (!existing) {
    const list = owner.eGet(owner.eClass().getEStructuralFeature('taggedValue'))
    list.add(tv)
  }
}

/** Writes text and type; the type goes into the model with every edit (CON-2.5) */
export function setText(owner: any, body: string, type: TextType): void {
  const o = toRaw(owner)
  o.eSet(o.eClass().getEStructuralFeature('body'), body)
  setTextType(o, type)
}
