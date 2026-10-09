/**
 * What an ObjectRow shows in its body (PH-5): the attributes as fields and
 * the object's text.
 *
 * Read-only for now; inline editing with suggested values and defaults from
 * the overlay is PH-7.
 */
import { toRaw } from 'tsm:vue'
import { attr, isDescription, isTable, many } from './documentation'
import { children } from './contextView'

export interface RowField {
  name: string
  label: string
  value: string
}

/** Attributes shown elsewhere in the row - the name in the title, the text in the text view */
const NOT_A_FIELD = new Set(['name', 'body'])

function valueText(value: any): string {
  if (value == null) return ''
  if (typeof value === 'object') return String(value.getLiteral?.() ?? value.getName?.() ?? value)
  return String(value)
}

/** The set, single-valued attributes of an object, in feature order */
export function fieldsOf(object: any): RowField[] {
  const o = toRaw(object)
  const attributes = many(o?.eClass?.()?.getEAllAttributes?.())
  const fields: RowField[] = []
  for (const feature of attributes) {
    const name = feature.getName?.()
    if (!name || NOT_A_FIELD.has(name) || feature.isMany?.()) continue
    if (typeof o.eIsSet === 'function' && !o.eIsSet(feature)) continue
    const value = valueText(toRaw(o.eGet(feature)))
    if (value === '') continue
    fields.push({ name, label: name, value })
  }
  return fields
}

function paragraphs(body: unknown): string[] {
  return body == null ? [] : String(body).split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean)
}

/**
 * The text of a row: a description's body; for a table the body of the
 * description it owns about itself.
 */
export function textOf(object: any): string[] {
  const o = toRaw(object)
  if (isDescription(o)) return paragraphs(attr(o, 'body'))
  if (isTable(o)) {
    const own = children(o).find(d => isDescription(d) && many(attr(d, 'modelElement')).includes(o))
    return own ? paragraphs(attr(own, 'body')) : []
  }
  return []
}
