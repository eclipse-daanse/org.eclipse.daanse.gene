/**
 * The documentation of a CWM element, read from the model.
 *
 * CWM keeps documentation as `businessinformation:Description` objects: a
 * description has a `body`, may own further descriptions (it is a Namespace),
 * and points with `modelElement` at what it describes. A handbook is a tree of
 * descriptions; a table carries one description for itself and one per column.
 *
 * This module turns a selected object into sections: the object's own text,
 * then its children and grandchildren, each one level deeper. A table shows up
 * as a table - columns with type, nullability, keys and the column's own
 * description - instead of a list of paragraphs.
 *
 * Everything here reads the model through the generic EMF API, so it needs
 * no generated CWM code and works on whatever CWM package set is loaded.
 */
import { toRaw } from 'tsm:vue'

export interface TableColumnView {
  name: string
  type: string
  nullable: string
  primaryKey: boolean
  /** "table(column, ...)" the foreign key points at, or null */
  foreignKey: string | null
  description: string
}

export interface TableView {
  name: string
  columns: TableColumnView[]
}

export interface DocSection {
  key: string
  title: string
  /** The class, for the badge next to the title */
  kind: string
  body: string
  depth: number
  isDescription: boolean
  table: TableView | null
  children: DocSection[]
  object: any
}

const BUSINESS_INFORMATION = 'businessinformation'
const RELATIONAL = 'resource/relational'
/** Deeper than this nobody reads; it also stops a cyclic model from recursing forever */
const MAX_DEPTH = 12

function nsUri(o: any): string {
  return o?.eClass?.()?.getEPackage?.()?.getNsURI?.() ?? ''
}

export function className(o: any): string {
  return o?.eClass?.()?.getName?.() ?? ''
}

export function isDescription(o: any): boolean {
  return className(o) === 'Description' && nsUri(o).includes(BUSINESS_INFORMATION)
}

export function isTable(o: any): boolean {
  return className(o) === 'Table' && nsUri(o).includes(RELATIONAL)
}

function isColumn(o: any): boolean {
  return className(o) === 'Column'
}

/** A feature's value by name, or undefined when the class has no such feature */
export function attr(o: any, name: string): any {
  const feature = o?.eClass?.()?.getEStructuralFeature?.(name)
  return feature ? toRaw(o.eGet(feature)) : undefined
}

/** A many-valued feature as an array - EList or anything iterable */
export function many(value: any): any[] {
  if (!value) return []
  if (typeof value.toArray === 'function') return value.toArray().map((x: any) => toRaw(x))
  if (typeof value[Symbol.iterator] === 'function') return Array.from(value, (x: any) => toRaw(x))
  return []
}

function text(value: any): string {
  return value == null ? '' : String(value)
}

/** An enum value as its literal - EEnumLiteral or plain string */
function literal(value: any): string {
  if (value == null) return ''
  if (typeof value === 'object') return String(value.getLiteral?.() ?? value.getName?.() ?? value)
  return String(value)
}

function owned(o: any): any[] {
  return many(attr(o, 'ownedElement'))
}

function container(o: any): any {
  return toRaw(o?.eContainer?.() ?? null)
}

/* Stable keys for v-for: the object itself, numbered on first sight */
const keys = new WeakMap<object, number>()
let nextKey = 1
function keyOf(o: any): string {
  if (!o || typeof o !== 'object') return String(o)
  let k = keys.get(o)
  if (!k) { k = nextKey++; keys.set(o, k) }
  return `o${k}`
}

/** The descriptions among a table's own elements that describe one of its columns */
function describesColumnOf(description: any, table: any): boolean {
  const columns = many(attr(table, 'feature')).filter(isColumn)
  return many(attr(description, 'modelElement')).some(m => columns.includes(m))
}

/** A relational table as rows: columns with type, nullability, keys and description */
export function tableView(table: any): TableView {
  const columns = many(attr(table, 'feature')).filter(isColumn)
  const ownedAll = owned(table)
  const uniqueKeys = ownedAll.filter(e => className(e) === 'PrimaryKey' || className(e) === 'UniqueConstraint')
  const foreignKeys = ownedAll.filter(e => className(e) === 'ForeignKey')
  const descriptions = ownedAll.filter(isDescription)
  const inKey = (key: any, column: any) => many(attr(key, 'feature')).includes(column)

  return {
    name: text(attr(table, 'name')),
    columns: columns.map(column => {
      const foreignKey = foreignKeys.find(k => inKey(k, column))
      const target = foreignKey ? toRaw(attr(foreignKey, 'uniqueKey')) : null
      const targetTable = target ? container(target) : null
      const targetColumns = target ? many(attr(target, 'feature')).map(f => text(attr(f, 'name'))).join(', ') : ''
      return {
        name: text(attr(column, 'name')),
        type: text(attr(toRaw(attr(column, 'type')), 'name')),
        nullable: literal(attr(column, 'isNullable')),
        primaryKey: uniqueKeys.some(k => inKey(k, column)),
        foreignKey: targetTable ? `${text(attr(targetTable, 'name'))} (${targetColumns})` : null,
        description: descriptions
          .filter(d => many(attr(d, 'modelElement')).includes(column))
          .map(d => text(attr(d, 'body')))
          .filter(Boolean)
          .join(' ')
      }
    })
  }
}

/** The table a description belongs to: the one it describes, or the one that owns it */
function tableOf(description: any): any | null {
  const described = many(attr(description, 'modelElement')).find(isTable)
  if (described) return described
  const parent = container(description)
  return isTable(parent) ? parent : null
}

/**
 * The section for an object, with everything beneath it.
 *
 * - A description: its text, its table if it describes one, its own
 *   descriptions as children.
 * - A table: as a table, with the descriptions it owns as children - except
 *   those of its columns, which are already in the table.
 * - Anything else that owns elements (package, schema, class): a heading, and
 *   whatever beneath it has documentation.
 *
 * Returns null for an object with nothing to show.
 */
export function sectionFor(object: any, depth = 0): DocSection | null {
  const o = toRaw(object)
  if (!o || depth > MAX_DEPTH) return null

  const base = {
    key: keyOf(o),
    title: text(attr(o, 'name')),
    kind: className(o),
    depth,
    object: o
  }

  if (isDescription(o)) {
    const table = tableOf(o)
    const children = owned(o)
      .map(child => sectionFor(child, depth + 1))
      .filter((s): s is DocSection => !!s)
    return { ...base, body: text(attr(o, 'body')), isDescription: true, table: table ? tableView(table) : null, children }
  }

  if (isTable(o)) {
    const children = owned(o)
      .filter(e => isDescription(e) && !describesColumnOf(e, o) && !many(attr(e, 'modelElement')).includes(o))
      .map(child => sectionFor(child, depth + 1))
      .filter((s): s is DocSection => !!s)
    // The table's own description, if it has one, is its text
    const own = owned(o).find(e => isDescription(e) && many(attr(e, 'modelElement')).includes(o))
    return { ...base, body: own ? text(attr(own, 'body')) : '', isDescription: false, table: tableView(o), children }
  }

  const children = owned(o)
    .map(child => sectionFor(child, depth + 1))
    .filter((s): s is DocSection => !!s && (s.isDescription || !!s.table || !!s.body || s.children.length > 0))
  if (depth > 0 && children.length === 0) return null
  return { ...base, body: '', isDescription: false, table: null, children }
}

/**
 * The sections in reading order, depth first. The view renders them as one
 * flat column: every text starts at the same left edge, and the stripes in
 * the gutter say how deep a section sits - not an indent.
 */
export function flatten(section: DocSection): DocSection[] {
  const out: DocSection[] = []
  const walk = (s: DocSection) => { out.push(s); s.children.forEach(walk) }
  walk(section)
  return out
}

/** Writes a description's text or name back into the model */
export function setDescriptionField(description: any, field: 'name' | 'body', value: string): boolean {
  const o = toRaw(description)
  const feature = o?.eClass?.()?.getEStructuralFeature?.(field)
  if (!feature) return false
  o.eSet(feature, value)
  return true
}
