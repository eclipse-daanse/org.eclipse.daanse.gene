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
 * attributes as a table (attributes.ts), and a responsible party its
 * contacts as a business card (contactCard.ts). Outside of a table or class, a
 * column or attribute keeps its own row.
 *
 * The context object itself comes first, as a row of its own; everything
 * below it follows one level deeper.
 */
import { toRaw } from 'tsm:vue'
import { attr, className, isRemark, isTable, many, objectSlug } from './documentation'
import { isAttributeContainer, shownByClass } from './attributes'
import { isResponsibleParty, shownByParty } from './contactCard'
import { shownPrivileges } from './privileges'
import { isTaggedValue } from './taggedValues'
import { isAccessRole, shownByRole } from './grants'

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

/** A resource (a file): the context above its root objects, showing all of them */
export function isResource(o: any): boolean {
  const raw = toRaw(o)
  return typeof raw?.getContents === 'function' && typeof raw?.eClass !== 'function'
}

/** The resource an object lives in, or null */
export function resourceOf(o: any): any | null {
  return toRaw(toRaw(o)?.eResource?.() ?? null)
}

/** Contained objects in containment order - of a resource its root objects */
export function children(o: any): any[] {
  const raw = toRaw(o)
  if (isResource(raw)) return many(raw.getContents())
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
  if (isResource(target)) return resourceOf(o) === target
  for (let p = toRaw(o); p; p = parentOf(p)) if (p === target) return true
  return false
}

export function displayName(o: any): string {
  if (isResource(o)) return String(toRaw(o).getURI?.()?.toString?.() ?? '').split('/').pop() || '(Datei)'
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
  if (isResponsibleParty(o)) return new Set([...shownByParty(o), ...shownPrivileges(o)])
  if (isAccessRole(o)) return shownByRole(o)
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
      // Tagged values are settings of their element, not rows
      if (hidden?.has(child) || isTaggedValue(child)) continue
      const row = rowFor(child, ancestors)
      rows.push(row)
      const before = rows.length
      walk(child, [...ancestors, child])
      row.hasChildren = rows.length > before
    }
  }
  const root = toRaw(context)
  if (!root) return rows
  // A file: its root objects at the top, no row of its own
  if (isResource(root)) {
    walk(root, [])
    return rows
  }
  // The context object first; everything else below it
  const own = rowFor(root, [])
  rows.push(own)
  walk(root, [root])
  own.hasChildren = rows.length > 1
  return rows
}

export type RowMode = 'full' | 'head' | 'hidden'

/**
 * How a row shows: below a folded element its children show as heads only
 * (title and type) and their descendants not at all - unless a child was
 * opened on its own, then it shows in full and its subtree as usual.
 */
export function rowMode(r: ContextRow, collapsed: Set<any>, opened: Set<any>): RowMode {
  const chain = [...r.ancestors, r.object]
  for (let i = 0; i < r.ancestors.length; i++) {
    if (!collapsed.has(r.ancestors[i])) continue
    const child = chain[i + 1]
    if (opened.has(child)) continue
    return child === r.object ? 'head' : 'hidden'
  }
  return 'full'
}

/** Rows that stay visible, each with how it shows */
export function visibleRows(rows: ContextRow[], collapsed: Set<any>, opened: Set<any> = new Set()): ContextRow[] {
  if (collapsed.size === 0) return rows
  return rows.filter(r => rowMode(r, collapsed, opened) !== 'hidden')
}

/** The context above o: its container - for a root object its file */
export function contextUp(o: any): any | null {
  if (!o || isResource(o)) return null
  return parentOf(o) ?? resourceOf(o)
}

/** The contexts from the file down to (excluding) o, for the breadcrumb */
export function contextPath(o: any): any[] {
  if (!o || isResource(o)) return []
  const file = resourceOf(o)
  return file ? [file, ...pathTo(o)] : pathTo(o)
}

/** Siblings of o in its container - or in its resource for a root object - for the jumps back and forward (PH-6) */
export function siblingOf(o: any, step: -1 | 1): any | null {
  const parent = parentOf(o)
  const list = parent ? children(parent) : many(toRaw(o)?.eResource?.()?.getContents?.())
  const i = list.indexOf(toRaw(o))
  return i < 0 ? null : list[i + step] ?? null
}
