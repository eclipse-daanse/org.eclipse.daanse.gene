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
import { fieldRule, headAttributeName } from './fieldDefaults'

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

/** Attributes shown elsewhere in the row - the text in the text view; the head attribute (see fieldsOf) in the title */
const NOT_A_FIELD = new Set(['body'])

/**
 * Text attributes a class shows as editors of their own - multi-line, full
 * width, always there (also while unset) - instead of a line in the table
 */
const TEXT_BLOCKS: Record<string, string[]> = {
  Concept: ['definition', 'example', 'usage']
}

/** Names of the text blocks of the object's class, in their order */
export function textBlockNames(object: any): string[] {
  const o = toRaw(object)
  return TEXT_BLOCKS[String(o?.eClass?.()?.getName?.() ?? '')] ?? []
}

/**
 * References a class shows as blocks of their own, under a heading as its
 * text blocks, the targets as a table below it
 */
const REFERENCE_BLOCKS: Record<string, string[]> = {
  Concept: ['relatedConcept']
}

/** Names of the reference blocks of the object's class, in their order */
export function referenceBlockNames(object: any): string[] {
  const o = toRaw(object)
  return REFERENCE_BLOCKS[String(o?.eClass?.()?.getName?.() ?? '')] ?? []
}

/** A block's heading from its feature name: "relatedConcept" → "Related Concepts" (plural when many) */
export function blockHeading(name: string, many = false): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1))
  const heading = words.join(' ')
  return many && !heading.endsWith('s') ? `${heading}s` : heading
}

const NUMBER_TYPES = /^(EInt|EIntegerObject|ELong|ELongObject|EShort|EShortObject|EDouble|EDoubleObject|EFloat|EFloatObject|EBigInteger|EBigDecimal|Integer|Float|Double|Long)$/
const BOOLEAN_TYPES = /^(EBoolean|EBooleanObject|Boolean)$/

function isEnum(type: any): boolean {
  return typeof type?.getELiterals === 'function'
}

/** How a single-valued attribute is edited - text, number, yes/no or enum (also for the field rules) */
export function kindOf(feature: any): FieldKind {
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
  const blocks = textBlockNames(o)
  // The head attribute stands in the title instead; "name" becomes a field when another attribute is the head
  const head = headAttributeName(o)
  for (const feature of many(o?.eClass?.()?.getEAllAttributes?.())) {
    const name = feature.getName?.()
    if (!name || name === head || NOT_A_FIELD.has(name) || feature.isMany?.() || feature.isDerived?.()) continue
    const field = fieldFor(o, feature)
    // Text blocks are always there, also while unset
    if (!all && (field.hidden || (!field.isSet && field.uiDefault == null && !blocks.includes(name)))) continue
    fields.push(field)
  }
  return fields
}

/** One single-valued attribute of an object as a field - for the row and the glossary's cells */
export function fieldFor(object: any, feature: any): RowField {
  const o = toRaw(object)
  const name = String(feature.getName?.())
  const isSet = typeof o.eIsSet === 'function' ? o.eIsSet(feature) : o.eGet(feature) != null
  const rule = fieldRule(o, name)
  const kind = kindOf(feature)
  const raw = toRaw(o.eGet(feature))
  return {
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
  }
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

/**
 * Checks a text for an attribute before it is written - as pasted into the
 * glossary. Returns the text to write (booleans as "true"/"false"), or why
 * it does not fit.
 */
export function checkAttributeText(feature: any, text: string): { text: string } | { error: string } {
  if (feature.isChangeable?.() === false) return { error: `${feature.getName()} ist nicht änderbar` }
  const value = text.trim()
  const kind = kindOf(feature)
  if (kind === 'boolean') {
    const v = value.toLowerCase()
    if (['true', 'ja', 'yes', '1', 'x', '✓'].includes(v)) return { text: 'true' }
    if (['false', 'nein', 'no', '0', ''].includes(v)) return { text: 'false' }
    return { error: `„${value}“ ist kein Ja/Nein-Wert` }
  }
  if (value === '') return { text: '' }
  if (kind === 'number') {
    return Number.isNaN(Number(value)) ? { error: `„${value}“ ist keine Zahl` } : { text: value }
  }
  if (kind === 'enum') {
    const literals = many(feature.getEType().getELiterals()).map((l: any) => String(l.getLiteral?.() ?? l.getName?.()))
    const hit = literals.find(l => l === value) ?? literals.find(l => l.toLowerCase() === value.toLowerCase())
    return hit ? { text: hit } : { error: `„${value}“ ist kein Wert von ${feature.getEType().getName()} (${literals.join(', ')})` }
  }
  return { text }
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
