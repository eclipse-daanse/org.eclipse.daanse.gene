/**
 * The context view (PH-1, PH-2, PH-6): one row per object below the context
 * object, in depth-first order of the containment.
 *
 * Depth is relative to the context object: its own row has depth 0, its
 * direct children 1. A row knows its ancestors from the context object down
 * to itself - one hierarchy line each (PH-2), plus the outermost line.
 *
 * Columns of a table are no rows of their own; they are rows of the table's
 * columns table (PH-8). The same holds for descriptions the table already
 * shows: its own and those of its columns. Likewise a class shows its
 * attributes as a table (attributes.ts). Outside of a table or class, a
 * column or attribute keeps its own row.
 *
 * The context object itself comes first, as a row of its own; everything
 * below it follows one level deeper.
 */
import { toRaw } from 'tsm:vue'
import { attr, className, isRemark, isTable, many, objectSlug } from './documentation'
import { isAttributeContainer, shownByClass } from './attributes'

export interface ContextRow {
  key: string
  object: any
  /** Test-id slug, "<Class>-<name>" */
  slug: string
  kind: string
  name: string
  /** 0 for direct children of the context object */
  depth: number
  /** Ancestors below the context object, outermost first; their depth is their index */
  ancestors: any[]
  /** The row has descendant rows */
  hasChildren: boolean
}

/** Deeper than this nobody reads; it also stops a cyclic model from recursing forever */
const MAX_DEPTH = 30

/** Contained objects in containment order */
export function children(o: any): any[] {
  const raw = toRaw(o)
  if (typeof raw?.eContents === 'function') return many(raw.eContents())
  return many(attr(raw, 'ownedElement'))
}

export function parentOf(o: any): any | null {
  return toRaw(toRaw(o)?.eContainer?.() ?? null)
}

/** Ancestors from the root down to (excluding) o */
export function pathTo(o: any): any[] {
  const path: any[] = []
  for (let p = parentOf(o); p; p = parentOf(p)) path.unshift(p)
  return path
}

export function isInside(o: any, ancestor: any): boolean {
  const target = toRaw(ancestor)
  for (let p = toRaw(o); p; p = parentOf(p)) if (p === target) return true
  return false
}

export function displayName(o: any): string {
  const name = attr(o, 'name')
  return name == null || name === '' ? '(ohne Namen)' : String(name)
}

/** Objects a table shows itself, so they get no row of their own */
export function shownByTable(table: any): Set<any> {
  const shown = new Set<any>()
  const columns = many(attr(table, 'feature')).filter(c => className(c) === 'Column')
  columns.forEach(c => shown.add(c))
  // Only remarks fill the description fields; other descriptions keep their rows
  for (const d of children(table).filter(isRemark)) {
    const described = many(attr(d, 'modelElement'))
    if (described.some(m => m === table || columns.includes(m))) shown.add(d)
  }
  return shown
}

/* Stable keys for v-for: the object itself, numbered on first sight */
const keys = new WeakMap<object, number>()
let nextKey = 1
function keyOf(o: any): string {
  let k = keys.get(o)
  if (!k) { k = nextKey++; keys.set(o, k) }
  return `r${k}`
}

/** Objects a table or class shows in its own row, or null */
function shownBy(o: any): Set<any> | null {
  if (isTable(o)) return shownByTable(o)
  if (isAttributeContainer(o)) return shownByClass(o)
  return null
}

function rowFor(object: any, ancestors: any[]): ContextRow {
  return {
    key: keyOf(object),
    object,
    slug: objectSlug(object),
    kind: className(object),
    name: displayName(object),
    depth: ancestors.length,
    ancestors,
    hasChildren: false
  }
}

/** The rows below the context object, depth first */
export function contextRows(context: any): ContextRow[] {
  const rows: ContextRow[] = []
  const walk = (parent: any, ancestors: any[]) => {
    if (ancestors.length > MAX_DEPTH) return
    const hidden = shownBy(parent)
    for (const child of children(parent)) {
      if (hidden?.has(child)) continue
      const row = rowFor(child, ancestors)
      rows.push(row)
      const before = rows.length
      walk(child, [...ancestors, child])
      row.hasChildren = rows.length > before
    }
  }
  const root = toRaw(context)
  if (!root) return rows
  // The context object first; everything else below it
  const own = rowFor(root, [])
  rows.push(own)
  walk(root, [root])
  own.hasChildren = rows.length > 1
  return rows
}

/** Rows that stay visible when the rows in `collapsed` hide their descendants */
export function visibleRows(rows: ContextRow[], collapsed: Set<any>): ContextRow[] {
  if (collapsed.size === 0) return rows
  return rows.filter(r => !r.ancestors.some(a => collapsed.has(a)))
}

/** Siblings of o in its container - or in its resource for a root object - for the jumps back and forward (PH-6) */
export function siblingOf(o: any, step: -1 | 1): any | null {
  const parent = parentOf(o)
  const list = parent ? children(parent) : many(toRaw(o)?.eResource?.()?.getContents?.())
  const i = list.indexOf(toRaw(o))
  return i < 0 ? null : list[i + step] ?? null
}
