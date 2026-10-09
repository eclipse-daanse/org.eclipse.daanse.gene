/**
 * The attributes of an ObjectRow as inline fields (PH-5, PH-7).
 *
 * Every single-valued attribute becomes a field: text, number, yes/no or a
 * choice of enum literals. Unset attributes are hidden until the row shows
 * all of them. Suggested values, UI defaults and hidden attributes from an
 * overlay resource are not wired yet (PH-7).
 */
import { toRaw } from 'tsm:vue'
import { many } from './documentation'

export type FieldKind = 'text' | 'number' | 'boolean' | 'enum'

export interface RowField {
  feature: any
  name: string
  label: string
  kind: FieldKind
  /** The value as the input shows it: string, number, boolean, or the literal string */
  value: string | number | boolean | null
  isSet: boolean
  /** Literal strings for an enum */
  options: string[]
}

/** Attributes shown elsewhere in the row - the name in the title, the text in the text view */
const NOT_A_FIELD = new Set(['name', 'body'])

const NUMBER_TYPES = /^(EInt|EIntegerObject|ELong|ELongObject|EShort|EShortObject|EDouble|EDoubleObject|EFloat|EFloatObject|EBigInteger|EBigDecimal|Integer|Float|Double|Long)$/
const BOOLEAN_TYPES = /^(EBoolean|EBooleanObject|Boolean)$/

function isEnum(type: any): boolean {
  return typeof type?.getELiterals === 'function'
}

function kindOf(feature: any): FieldKind {
  const type = feature.getEType?.()
  if (isEnum(type)) return 'enum'
  const name = type?.getName?.() ?? ''
  if (BOOLEAN_TYPES.test(name)) return 'boolean'
  if (NUMBER_TYPES.test(name)) return 'number'
  return 'text'
}

function literalString(value: any): string | null {
  if (value == null) return null
  if (typeof value === 'object') return String(value.getLiteral?.() ?? value.getName?.() ?? value)
  return String(value)
}

/** The single-valued attributes of an object, in feature order; unset ones only with `all` */
export function fieldsOf(object: any, all = false): RowField[] {
  const o = toRaw(object)
  const fields: RowField[] = []
  for (const feature of many(o?.eClass?.()?.getEAllAttributes?.())) {
    const name = feature.getName?.()
    if (!name || NOT_A_FIELD.has(name) || feature.isMany?.() || feature.isDerived?.()) continue
    const isSet = typeof o.eIsSet === 'function' ? o.eIsSet(feature) : o.eGet(feature) != null
    if (!isSet && !all) continue
    const kind = kindOf(feature)
    const raw = toRaw(o.eGet(feature))
    fields.push({
      feature,
      name,
      label: name,
      kind,
      value: kind === 'enum' ? literalString(raw) : kind === 'boolean' ? !!raw : raw == null ? null : kind === 'number' ? Number(raw) : String(raw),
      isSet,
      options: kind === 'enum' ? many(feature.getEType().getELiterals()).map((l: any) => String(l.getLiteral?.() ?? l.getName?.())) : []
    })
  }
  return fields
}

/** How many single-valued attributes stay hidden while unset */
export function hiddenFieldCount(object: any): number {
  return fieldsOf(object, true).length - fieldsOf(object).length
}

/** Writes a field's input back into the model; an empty text or number unsets it */
export function setField(object: any, field: RowField, input: string | boolean): void {
  const o = toRaw(object)
  const feature = field.feature
  if (field.kind === 'boolean') {
    o.eSet(feature, !!input)
    return
  }
  const text = String(input)
  if (text === '') {
    o.eUnset?.(feature)
    return
  }
  if (field.kind === 'number') {
    const n = Number(text)
    if (!Number.isNaN(n)) o.eSet(feature, n)
    return
  }
  if (field.kind === 'enum') {
    const literal = many(feature.getEType().getELiterals())
      .find((l: any) => String(l.getLiteral?.() ?? l.getName?.()) === text)
    if (literal) o.eSet(feature, literal)
    return
  }
  o.eSet(feature, text)
}
