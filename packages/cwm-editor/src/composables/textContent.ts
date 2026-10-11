/**
 * The text of an ObjectRow (FR-2.5, CON-2.5).
 *
 * The text lives in a Description's `body`: for a Description row its own,
 * for a Table the description the table owns about itself. The Description's
 * `type` attribute decides how it is shown: "markdown", "mermaid" or
 * "plaintext". Any other value (older data uses doc/inline) or none means the
 * type is detected from the text; saving an edit writes the type into `type`.
 */
import { toRaw } from 'tsm:vue'
import { attr, isDescription, isTable, many } from './documentation'
import { children } from './contextView'
import { setByName } from './creation'

export type TextType = 'markdown' | 'mermaid' | 'plaintext'

export const TEXT_TYPES: { value: TextType; label: string }[] = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'mermaid', label: 'Mermaid' },
  { value: 'plaintext', label: 'Plain Text' }
]

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
  return 'plaintext'
}

/** The description that holds the row's text, or null */
export function textOwner(object: any): any | null {
  const o = toRaw(object)
  if (isDescription(o)) return o
  if (isTable(o)) return children(o).find(d => isDescription(d) && many(attr(d, 'modelElement')).includes(o)) ?? null
  return null
}

/** The Description's `type`, when it names a text type */
function storedType(owner: any): TextType | null {
  const value = String(attr(owner, 'type') ?? '').trim().toLowerCase()
  return TEXT_TYPES.some(t => t.value === value) ? (value as TextType) : null
}

export function textOf(object: any): RowText | null {
  const owner = textOwner(object)
  if (!owner) return null
  const body = String(attr(owner, 'body') ?? '')
  const stored = storedType(owner)
  return { owner, body, type: stored ?? detectTextType(body), stored: !!stored }
}

/** Writes text and type; the type goes into `type` with every edit (CON-2.5) */
export function setText(owner: any, body: string, type: TextType): void {
  const o = toRaw(owner)
  o.eSet(o.eClass().getEStructuralFeature('body'), body)
  setByName(o, 'type', type)
}
