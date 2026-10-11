/**
 * The attributes of an ObjectRow as inline fields (PH-5, PH-7 after CR-2).
 *
 * Every single-valued attribute becomes a field: text, number, yes/no or a
 * choice of enum literals. Unset attributes stay out until the row shows all
 * of them - unless a field rule gives them a UI default. Field rules
 * (fieldDefaults.ts) add suggested values and hide attributes.
 */
import { toRaw } from 'tsm:vue'
import { many } from './documentation'
import { fieldRule } from './fieldDefaults'

export type FieldKind = 'text' | 'number' | 'boolean' | 'enum'

export interface RowField {
  feature: any
  name: string
  label: string
  kind: FieldKind
  /** The value as the input shows it: string, number, boolean, or the literal string */
  value: string | number | boolean | null
  isSet: boolean
  /** Name of the attribute's data type or enum */
  typeName: string
  /** Literal strings for an enum */
  options: string[]
  /** Suggested values for a text field (FR-1.1) */
  suggestions: string[]
  /** Shown while unset; never written (FR-1.2) */
  uiDefault: string | null
  /** Hidden by a field rule; shown only with all attributes */
  hidden: boolean
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
    const rule = fieldRule(o, name)
    if (!all && (rule?.hidden || (!isSet && rule?.uiDefault == null))) continue
    const kind = kindOf(feature)
    const raw = toRaw(o.eGet(feature))
    fields.push({
      feature,
      name,
      label: name,
      kind,
      value: kind === 'enum' ? literalString(raw) : kind === 'boolean' ? !!raw : raw == null ? null : kind === 'number' ? Number(raw) : String(raw),
      isSet,
      typeName: String(feature.getEType?.()?.getName?.() ?? ''),
      options: kind === 'enum' ? many(feature.getEType().getELiterals()).map((l: any) => String(l.getLiteral?.() ?? l.getName?.())) : [],
      suggestions: rule?.suggestions ?? [],
      uiDefault: rule?.uiDefault ?? null,
      hidden: !!rule?.hidden
    })
  }
  return fields
}

/** How many single-valued attributes stay out of the row until it shows all */
export function hiddenFieldCount(object: any): number {
  return fieldsOf(object, true).length - fieldsOf(object).length
}

/**
 * Sets an attribute from its text form - as typed into a field or written in
 * a field rule: numbers parsed, booleans from "true"/"false", enums by
 * literal. An empty text unsets the attribute.
 */
export function setAttributeFromText(object: any, feature: any, text: string): void {
  const o = toRaw(object)
  const kind = kindOf(feature)
  if (kind === 'boolean') {
    o.eSet(feature, text === 'true')
    return
  }
  if (text === '') {
    o.eUnset?.(feature)
    return
  }
  if (kind === 'number') {
    const n = Number(text)
    if (!Number.isNaN(n)) o.eSet(feature, n)
    return
  }
  if (kind === 'enum') {
    const literal = many(feature.getEType().getELiterals())
      .find((l: any) => String(l.getLiteral?.() ?? l.getName?.()) === text)
    if (literal) o.eSet(feature, literal)
    return
  }
  o.eSet(feature, text)
}

/** Writes a field's input back into the model; an empty text or number unsets it */
export function setField(object: any, field: RowField, input: string | boolean): void {
  setAttributeFromText(object, field.feature, typeof input === 'boolean' ? String(input) : input)
}

/** Writes the backend defaults of the field rules into a new object (FR-1.2) */
export function applyBackendDefaults(object: any, defaults: Map<string, string>): void {
  const o = toRaw(object)
  for (const [name, value] of defaults) {
    const feature = o.eClass().getEStructuralFeature(name)
    if (feature && !feature.isMany?.()) setAttributeFromText(o, feature, value)
  }
}
