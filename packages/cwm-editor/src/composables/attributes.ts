/**
 * The structural features of a classifier as a table - like a table's
 * columns (PH-8): a class's attributes, an association's ends. Name, Typ,
 * Multiplizität, Description; for association ends also Aggregation and
 * Navigierbar. Edited in place.
 *
 * Inside such a classifier the features get no ObjectRow of their own; a
 * feature anywhere else keeps its standard row. Relational tables keep
 * their columns table instead (columns are features too).
 */
import { toRaw } from 'tsm:vue'
import { attr, isDescription, isTable, many } from './documentation'
import { children } from './contextView'
import { createIn, setByName } from './creation'

/** The class is `name` or inherits from it */
export function inherits(o: any, name: string): boolean {
  const c = toRaw(o)?.eClass?.()
  if (!c) return false
  if (c.getName?.() === name) return true
  return many(c.getEAllSuperTypes?.()).some((s: any) => s.getName?.() === name)
}

/** An attribute, an association end, a column - anything with type and multiplicity */
export function isAttribute(o: any): boolean {
  return inherits(o, 'StructuralFeature')
}

export function isAssociationEnd(o: any): boolean {
  return inherits(o, 'AssociationEnd')
}

function features(o: any): any[] {
  return many(attr(o, 'feature'))
}

/** A classifier (not a relational table) with at least one structural feature */
export function isAttributeContainer(o: any): boolean {
  return !isTable(o) && features(o).some(isAttribute)
}

export interface AttributeRow {
  attribute: any
  name: string
  typeObject: any
  typeName: string
  multiplicity: string
  /** Bounds of the multiplicity range as shown: "" when unset, upper "*" for unbounded */
  lower: string
  upper: string
  description: string
  /** Association ends only */
  isEnd: boolean
  aggregation: string
  aggregationOptions: string[]
  navigable: boolean
}

function literalOf(value: any): string {
  if (value == null) return ''
  return typeof value === 'object' ? String(value.getLiteral?.() ?? value.getName?.() ?? value) : String(value)
}

function literalsOf(o: any, featureName: string): string[] {
  const f = toRaw(o)?.eClass?.()?.getEStructuralFeature?.(featureName)
  return many(f?.getEType?.()?.getELiterals?.()).map(literalOf)
}

function rangeOf(attribute: any): any | null {
  const m = toRaw(attr(attribute, 'multiplicity'))
  return many(attr(m, 'range'))[0] ?? null
}

function bound(value: any, fallback: number): number {
  const n = value == null || value === '' ? fallback : Number(value)
  return Number.isNaN(n) ? fallback : n
}

/** "1", "0..1", "0..*", "1..*" … from the attribute's multiplicity range; "" without one */
export function multiplicityText(attribute: any): string {
  const range = rangeOf(attribute)
  if (!range) return ''
  const lower = bound(attr(range, 'lower'), 0)
  const upper = bound(attr(range, 'upper'), -1)
  const up = upper < 0 ? '*' : String(upper)
  return String(lower) === up ? up : `${lower}..${up}`
}

/** Lower and upper bound of the range as text; "" when unset, "*" for an unbounded upper */
export function rangeBounds(attribute: any): { lower: string; upper: string } {
  const range = rangeOf(attribute)
  if (!range) return { lower: '', upper: '' }
  const lower = attr(range, 'lower')
  const upper = attr(range, 'upper')
  return {
    lower: lower == null || lower === '' ? '' : String(lower),
    upper: upper == null || upper === '' ? '' : Number(upper) < 0 ? '*' : String(upper)
  }
}

/** The descriptions the class owns about the given element */
function descriptionsOf(cls: any, element: any): any[] {
  return children(cls).filter(d => isDescription(d) && many(attr(d, 'modelElement')).includes(element))
}

export function attributeRows(cls: any): AttributeRow[] {
  const c = toRaw(cls)
  return features(c).filter(isAttribute).map(a => {
    const type = toRaw(attr(a, 'type')) ?? null
    return {
      attribute: a,
      name: String(attr(a, 'name') ?? ''),
      typeObject: type,
      typeName: String(attr(type, 'name') ?? ''),
      multiplicity: multiplicityText(a),
      ...rangeBounds(a),
      description: descriptionsOf(c, a).map(d => String(attr(d, 'body') ?? '')).filter(Boolean).join(' '),
      isEnd: isAssociationEnd(a),
      aggregation: literalOf(attr(a, 'aggregation')),
      aggregationOptions: isAssociationEnd(a) ? literalsOf(a, 'aggregation') : [],
      navigable: String(attr(a, 'isNavigable') ?? '') === 'true'
    }
  })
}

/** Whether the classifier's features are association ends - the table then shows their extra columns */
export function hasAssociationEnds(cls: any): boolean {
  return features(cls).some(isAssociationEnd)
}

/** What the class row shows itself: its features and the descriptions about them */
export function shownByClass(cls: any): Set<any> {
  const c = toRaw(cls)
  const shown = new Set<any>()
  const attributes = features(c).filter(isAttribute)
  attributes.forEach(a => shown.add(a))
  for (const d of children(c).filter(isDescription)) {
    if (many(attr(d, 'modelElement')).some(m => attributes.includes(m))) shown.add(d)
  }
  return shown
}

/** Classifiers to offer as attribute types, by name */
export function classifiers(objects: any[]): any[] {
  return objects
    .filter(o => inherits(o, 'Classifier') && !isTable(o))
    .sort((a, b) => String(attr(a, 'name') ?? '').localeCompare(String(attr(b, 'name') ?? '')))
}

/* ── editing ─────────────────────────────────────────────────────── */

export function setAttributeType(attribute: any, type: any | null): void {
  const a = toRaw(attribute)
  const f = a.eClass().getEStructuralFeature('type')
  if (type) a.eSet(f, toRaw(type))
  else a.eUnset?.(f)
}

/** The attribute's multiplicity range; multiplicity and range are created if missing */
function ensureRange(attribute: any): any | null {
  const a = toRaw(attribute)
  const mFeature = a.eClass().getEStructuralFeature('multiplicity')
  if (!mFeature) return null
  let multiplicity = toRaw(a.eGet(mFeature))
  if (!multiplicity) multiplicity = createIn(a, 'multiplicity', mFeature.getEType())
  if (!multiplicity) return null
  const range = many(attr(multiplicity, 'range'))[0]
  return range ?? createIn(multiplicity, 'range', multiplicity.eClass().getEStructuralFeature('range').getEType())
}

/**
 * Sets one bound of the multiplicity range: a number, for upper also "*"
 * (unbounded, stored as -1); empty text unsets the bound.
 */
export function setRangeBound(attribute: any, bound: 'lower' | 'upper', text: string): void {
  const t = text.trim()
  const value = bound === 'upper' && t === '*' ? -1 : t === '' ? null : Number(t)
  if (value != null && (Number.isNaN(value) || (value < 0 && !(bound === 'upper' && value === -1)))) return
  const range = ensureRange(attribute)
  if (!range) return
  const f = range.eClass().getEStructuralFeature(bound)
  if (value == null) range.eUnset?.(f)
  else range.eSet(f, value)
}

/** Label for a classifier in a choice: its name, with its container when the name is taken twice */
export function classifierLabel(type: any, all: any[]): string {
  const name = String(attr(type, 'name') ?? '')
  const twins = all.filter(o => String(attr(o, 'name') ?? '') === name).length
  const owner = toRaw(type)?.eContainer?.()
  return twins > 1 && owner ? `${name} · ${attr(owner, 'name') ?? ''}` : name
}
