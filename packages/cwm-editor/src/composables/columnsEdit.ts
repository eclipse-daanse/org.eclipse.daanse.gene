/**
 * Editing a table's columns in place (PH-8): name, type, nullability,
 * primary key membership and the column's description.
 *
 * Writes go straight into the model through the generic EMF API; new objects
 * (a primary key, a column description) are made by createIn.
 */
import { toRaw } from 'tsm:vue'
import { attr, className, isDescription, many, remarks, REMARK_TYPE } from './documentation'
import { children } from './contextView'
import { createIn, setByName } from './creation'

const DATA_TYPE_CLASSES = new Set(['SQLSimpleType', 'SQLDistinctType', 'SQLStructuredType'])

function feature(o: any, name: string): any {
  return o.eClass().getEStructuralFeature(name)
}

/** The SQL data types among the given objects, by name */
export function dataTypes(objects: any[]): any[] {
  return objects
    .filter(o => DATA_TYPE_CLASSES.has(className(o)))
    .sort((a, b) => String(attr(a, 'name') ?? '').localeCompare(String(attr(b, 'name') ?? '')))
}

export function setColumnName(column: any, name: string): void {
  const c = toRaw(column)
  c.eSet(feature(c, 'name'), name)
}

export function setColumnType(column: any, type: any | null): void {
  const c = toRaw(column)
  if (type) c.eSet(feature(c, 'type'), toRaw(type))
  else c.eUnset?.(feature(c, 'type'))
}

/** `literal` is the NullableType literal, e.g. columnNoNulls */
export function setColumnNullable(column: any, literal: string): void {
  const c = toRaw(column)
  const f = feature(c, 'isNullable')
  const value = many(f?.getEType?.()?.getELiterals?.()).find((l: any) => String(l.getLiteral?.() ?? l.getName?.()) === literal)
  if (value) c.eSet(f, value)
}

function primaryKeyOf(table: any): any | null {
  return children(table).find(e => className(e) === 'PrimaryKey') ?? null
}

/** Adds the column to the table's primary key or takes it out; creates the key if needed */
export function setPrimaryKey(table: any, column: any, member: boolean): void {
  const t = toRaw(table)
  const c = toRaw(column)
  let key = primaryKeyOf(t)
  if (!key) {
    if (!member) return
    key = createIn(t, 'ownedElement', t.eClass().getEPackage().getEClassifier('PrimaryKey'))
    if (!key) return
    setByName(key, 'name', `${attr(t, 'name') ?? 'table'}_pkey`)
  }
  const columns = key.eGet(feature(key, 'feature'))
  const has = many(columns).includes(c)
  if (member && !has) columns.add(c)
  if (!member && has) columns.remove(c)
}

/** The remark the table (or class) owns about this column (or attribute), or null */
function columnDescription(table: any, column: any): any | null {
  return children(table).find(d => remarks(d, column)) ?? null
}

/**
 * Sets the column's description text. Without one, a remark is created in
 * the table: a Description of type "remark" - of the same class as the
 * table's other descriptions, or taken from `descriptionClass`.
 */
export function setColumnDescription(table: any, column: any, body: string, descriptionClass?: any): void {
  const t = toRaw(table)
  const c = toRaw(column)
  const existing = columnDescription(t, c)
  if (existing) {
    existing.eSet(feature(existing, 'body'), body)
    return
  }
  if (body === '') return
  const eClass = descriptionClass ?? children(t).find(isDescription)?.eClass?.()
  const d = createIn(t, 'ownedElement', eClass)
  if (!d) return
  setByName(d, 'name', `Column ${attr(t, 'name') ?? ''}.${attr(c, 'name') ?? ''}`)
  setByName(d, 'body', body)
  setByName(d, 'type', REMARK_TYPE)
  d.eGet(feature(d, 'modelElement')).add(c)
}

/** Literal strings of the column's NullableType */
export function nullableLiterals(column: any): string[] {
  const f = feature(toRaw(column), 'isNullable')
  return many(f?.getEType?.()?.getELiterals?.()).map((l: any) => String(l.getLiteral?.() ?? l.getName?.()))
}
