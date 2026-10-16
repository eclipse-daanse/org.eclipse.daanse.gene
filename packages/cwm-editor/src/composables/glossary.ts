/**
 * The glossary beside the context view: a table of the objects of chosen
 * classifiers - optionally with their subclasses - one column per attribute
 * the context view would show. Columns a field rule hides are kept but
 * marked, so the column menu can show them greyed and switch them on. Columns of the
 * most general class come first, so `name` of ModelElement leads.
 */
import { toRaw } from 'tsm:vue'
import { many } from './documentation'
import { fieldRule } from './fieldDefaults'
import { classKey, conforms } from './references'

export interface GlossaryColumn {
  key: string
  name: string
  /** The class that defines the attribute */
  owner: string
  feature: any
  /** A field rule hides the attribute for every object that has it */
  ruleHidden: boolean
}

export interface GlossaryRow {
  object: any
  className: string
  /** Cell text per column key; undefined = the object has no such attribute */
  cells: Record<string, string | undefined>
}

/** Attributes the glossary leaves out: long texts */
const NOT_A_COLUMN = new Set(['body'])

function columnKey(feature: any): string {
  return `${classKey(feature.getEContainingClass?.())}.${feature.getName?.()}`
}

/** Single-valued attributes of the object, each with whether a field rule hides it */
function attributesOf(object: any): { feature: any; hidden: boolean }[] {
  const o = toRaw(object)
  return many(o?.eClass?.()?.getEAllAttributes?.())
    .filter((f: any) => {
      const name = f.getName?.()
      return name && !NOT_A_COLUMN.has(name) && !f.isMany?.() && !f.isDerived?.()
    })
    .map((f: any) => ({ feature: f, hidden: !!fieldRule(o, f.getName())?.hidden }))
}

function cellText(object: any, feature: any): string {
  const o = toRaw(object)
  const isSet = typeof o.eIsSet === 'function' ? o.eIsSet(feature) : o.eGet(feature) != null
  if (!isSet) return ''
  const v = toRaw(o.eGet(feature))
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'ja' : 'nein'
  if (typeof v === 'object') return String(v.getLiteral?.() ?? v.getName?.() ?? v)
  return String(v)
}

/** Objects of the chosen classes - with `withSubclasses` also of the classes inheriting from them */
export function glossaryObjects(objects: any[], classes: any[], withSubclasses: boolean): any[] {
  if (!classes.length) return []
  const keys = new Set(classes.map(classKey))
  return objects.filter(o => {
    const c = toRaw(o)?.eClass?.()
    if (!c) return false
    return withSubclasses ? classes.some(t => conforms(c, t)) : keys.has(classKey(c))
  })
}

/** Columns and rows of the glossary */
export function glossaryTable(objects: any[]): { columns: GlossaryColumn[]; rows: GlossaryRow[] } {
  const columns = new Map<string, { column: GlossaryColumn; depth: number; order: number }>()
  const rows: GlossaryRow[] = []
  for (const o of objects) {
    const cells: Record<string, string | undefined> = {}
    for (const { feature: f, hidden } of attributesOf(o)) {
      const key = columnKey(f)
      const known = columns.get(key)
      if (known) known.column.ruleHidden &&= hidden
      else {
        const owner = f.getEContainingClass?.()
        columns.set(key, {
          column: { key, name: String(f.getName()), owner: String(owner?.getName?.() ?? ''), feature: f, ruleHidden: hidden },
          // The more supertypes the defining class has, the more special the attribute
          depth: many(owner?.getEAllSuperTypes?.()).length,
          order: many(owner?.getEAttributes?.()).indexOf(f)
        })
      }
      cells[key] = cellText(o, f)
    }
    rows.push({ object: o, className: String(toRaw(o).eClass().getName()), cells })
  }
  const sorted = [...columns.values()].sort((a, b) =>
    a.depth - b.depth || a.column.owner.localeCompare(b.column.owner) || a.order - b.order)
  return { columns: sorted.map(c => c.column), rows }
}

/** Compares cells: empty last, numbers by value, else text */
export function compareCells(a: string | undefined, b: string | undefined): number {
  const ea = a == null || a === ''
  const eb = b == null || b === ''
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1
  const na = Number(a)
  const nb = Number(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  return a!.localeCompare(b!, undefined, { numeric: true, sensitivity: 'base' })
}
