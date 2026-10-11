/**
 * The text of an ObjectRow (FR-2.5, CON-2.5).
 *
 * The text lives in a Description's `body`: for a Description row its own,
 * for a Table the remark (type "remark", plain text) the table owns about
 * itself. The Description's
 * `type` attribute decides how it is shown: "markdown", "html", "mermaid"
 * or "plaintext". Any other value (older data uses doc/inline) or none means the
 * type is detected from the text; saving an edit writes the type into `type`.
 */
import { EPackageRegistry } from '@emfts/core'
import { toRaw } from 'tsm:vue'
import { attr, isDescription, isRemark, isTable, remarks, REMARK_TYPE } from './documentation'
import { children } from './contextView'
import { createIn, setByName } from './creation'

export type TextType = 'markdown' | 'html' | 'mermaid' | 'plaintext'

export const TEXT_TYPES: { value: TextType; label: string }[] = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
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
  /** A remark: plain text, its type stays "remark" */
  remark: boolean
}

const MERMAID_START = /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph)\b/
const HTML_START = /^\s*<(!doctype\s+html|html|body|div|p|h[1-6]|table|ul|ol|section|article|span|br|img|a)\b/i
const MARKDOWN_HINTS = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)/

export function detectTextType(body: string): TextType {
  if (MERMAID_START.test(body)) return 'mermaid'
  if (HTML_START.test(body)) return 'html'
  if (MARKDOWN_HINTS.test(body)) return 'markdown'
  return 'plaintext'
}

/** The description that holds the row's text, or null */
export function textOwner(object: any): any | null {
  const o = toRaw(object)
  if (isDescription(o)) return o
  if (isTable(o)) return children(o).find(d => remarks(d, o)) ?? null
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
  if (isRemark(owner)) return { owner, body, type: 'plaintext', stored: true, remark: true }
  const stored = storedType(owner)
  return { owner, body, type: stored ?? detectTextType(body), stored: !!stored, remark: false }
}

/** A table without a description of its own can get one */
export function canCreateText(object: any): boolean {
  return isTable(object) && !textOwner(object)
}

const BUSINESS_INFORMATION_NS_URI = 'http://www.omg.org/spec/CWM/1.1/foundation/businessinformation'

/** CWM's Description class from the registries, for a model without any description yet */
function cwmDescriptionClass(o: any): any | null {
  const registries = [o?.eResource?.()?.getResourceSet?.()?.getPackageRegistry?.(), EPackageRegistry.INSTANCE]
  for (const registry of registries) {
    const cls = registry?.getEPackage?.(BUSINESS_INFORMATION_NS_URI)?.getEClassifier?.('Description')
    if (cls) return cls
  }
  return null
}

/**
 * Creates the table's own description: a Description in the table that names
 * the table as its modelElement. Returns it, or null when the class is missing.
 */
export function createTextOwner(table: any, descriptionClass?: any): any | null {
  const t = toRaw(table)
  const eClass = descriptionClass ?? children(t).find(isDescription)?.eClass?.() ?? cwmDescriptionClass(t)
  const d = eClass ? createIn(t, 'ownedElement', eClass) : null
  if (!d) return null
  setByName(d, 'name', `Table ${attr(t, 'name') ?? ''}`)
  setByName(d, 'type', REMARK_TYPE)
  d.eGet(d.eClass().getEStructuralFeature('modelElement')).add(t)
  return d
}

/** Writes text and type; the type goes into `type` with every edit (CON-2.5) */
export function setText(owner: any, body: string, type: TextType): void {
  const o = toRaw(owner)
  o.eSet(o.eClass().getEStructuralFeature('body'), body)
  // A remark stays a remark: plain text, its type is "remark"
  setByName(o, 'type', isRemark(o) ? REMARK_TYPE : type)
}
