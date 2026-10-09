/**
 * The actions menu of an ObjectRow (PH-4, PH-1.b, PH-8.c).
 *
 * A registry: every action says which objects it applies to; the menu of a
 * row lists the matching ones in registration order. Plugins add their own
 * through the service `ui.cwm-editor.actions` - Daanse validations, for one,
 * only where Daanse provides them for the type.
 *
 * Built in: add and duplicate a column (Table), create a sub or sibling
 * description (Description), validate, set as context object, delete.
 */
import { reactive, toRaw } from 'tsm:vue'
import { attr, className, isDescription, isTable, many } from './documentation'
import { children, parentOf } from './contextView'
import { createIn, setByName } from './creation'

/** What an action may do */
export interface ActionApi {
  /** Runs a model change, then marks the document dirty and re-renders */
  change: (write: () => void) => void
  select: (object: any) => void
  /** The object selected in the tree, or null */
  selected: any
  setContext: (object: any) => void
  validate: (object: any) => void
  deleteObject: (object: any) => void
}

export interface CwmAction {
  id: string
  /** Text in the menu; may depend on the object */
  label: string | ((object: any, api: ActionApi) => string)
  appliesTo: (object: any) => boolean
  enabled?: (object: any, api: ActionApi) => boolean
  /** Asks again in the menu before running, with this text */
  confirm?: string
  run: (object: any, api: ActionApi) => void
}

const actions = reactive<CwmAction[]>([])

export const actionRegistry = {
  register(action: CwmAction): () => void {
    const i = actions.findIndex(a => a.id === action.id)
    if (i >= 0) actions.splice(i, 1, action)
    else actions.push(action)
    return () => actionRegistry.unregister(action.id)
  },
  unregister(id: string): void {
    const i = actions.findIndex(a => a.id === id)
    if (i >= 0) actions.splice(i, 1)
  },
  actionsFor(object: any): CwmAction[] {
    return actions.filter(a => {
      try { return a.appliesTo(object) } catch { return false }
    })
  }
}

export function actionLabel(action: CwmAction, object: any, api: ActionApi): string {
  return typeof action.label === 'function' ? action.label(object, api) : action.label
}

/* ── built-in actions ─────────────────────────────────────────────── */

function columnsOf(table: any): any[] {
  return many(attr(table, 'feature')).filter(c => className(c) === 'Column')
}

/** "base", or "base_2", "base_3" … - the first name not taken */
function freeName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base
  for (let i = 2; ; i++) if (!taken.includes(`${base}_${i}`)) return `${base}_${i}`
}

/** The column to duplicate: the one selected in this table, else the last one */
function duplicateSource(table: any, api: ActionApi): any | null {
  const columns = columnsOf(table)
  const selected = toRaw(api.selected)
  return columns.includes(selected) ? selected : columns[columns.length - 1] ?? null
}

function addColumn(table: any, api: ActionApi): void {
  const t = toRaw(table)
  const columnClass = t.eClass().getEPackage().getEClassifier('Column')
  let created: any = null
  api.change(() => {
    const names = columnsOf(t).map(c => String(attr(c, 'name') ?? ''))
    created = createIn(t, 'feature', columnClass)
    if (created) setByName(created, 'name', freeName('neue_spalte', names))
  })
  if (created) api.select(created)
}

function duplicateColumn(table: any, api: ActionApi): void {
  const t = toRaw(table)
  const source = duplicateSource(t, api)
  if (!source) return
  let created: any = null
  api.change(() => {
    const list = t.eGet(t.eClass().getEStructuralFeature('feature'))
    created = createIn(t, 'feature', source.eClass(), list.indexOf(source) + 1)
    if (!created) return
    // Copy the column's own values: single-valued attributes and its type
    for (const f of many(source.eClass().getEAllAttributes())) {
      if (!f.isMany?.() && source.eIsSet?.(f)) created.eSet(f, source.eGet(f))
    }
    const type = attr(source, 'type')
    if (type) setByName(created, 'type', toRaw(type))
    const names = columnsOf(t).filter(c => c !== created).map(c => String(attr(c, 'name') ?? ''))
    setByName(created, 'name', freeName(`${attr(source, 'name') ?? 'spalte'}_kopie`, names))
  })
  if (created) api.select(created)
}

function createDescription(container: any, featureName: string, eClass: any, index: number | undefined, api: ActionApi): void {
  let created: any = null
  api.change(() => {
    created = createIn(container, featureName, eClass, index)
    if (created) setByName(created, 'name', 'Neue Beschreibung')
  })
  if (created) api.select(created)
}

const BUILT_IN: CwmAction[] = [
  {
    id: 'cwm.table.addColumn',
    label: 'Spalte hinzufügen',
    appliesTo: isTable,
    run: addColumn
  },
  {
    id: 'cwm.table.duplicateColumn',
    label: (table, api) => {
      const source = duplicateSource(table, api)
      return source ? `Spalte duplizieren (${attr(source, 'name') ?? '?'})` : 'Spalte duplizieren'
    },
    appliesTo: isTable,
    enabled: (table, api) => !!duplicateSource(table, api),
    run: duplicateColumn
  },
  {
    id: 'cwm.description.addChild',
    label: 'Sub-Description anlegen',
    appliesTo: isDescription,
    run: (d, api) => createDescription(d, 'ownedElement', toRaw(d).eClass(), undefined, api)
  },
  {
    id: 'cwm.description.addSibling',
    label: 'Geschwister-Description anlegen',
    appliesTo: d => isDescription(d) && !!parentOf(d),
    run: (d, api) => {
      const o = toRaw(d)
      const parent = parentOf(o)
      const feature = o.eContainingFeature?.()
      if (!parent || !feature?.isMany?.()) return
      createDescription(parent, feature.getName(), o.eClass(), parent.eGet(feature).indexOf(o) + 1, api)
    }
  },
  {
    id: 'cwm.validate',
    label: 'Validieren',
    appliesTo: () => true,
    run: (o, api) => api.validate(o)
  },
  {
    id: 'cwm.setContext',
    label: 'Als Kontextobjekt setzen',
    appliesTo: o => children(o).length > 0,
    run: (o, api) => api.setContext(o)
  },
  {
    id: 'cwm.delete',
    label: 'Löschen',
    confirm: 'Wirklich löschen?',
    appliesTo: o => !!parentOf(o),
    run: (o, api) => api.deleteObject(o)
  }
]

BUILT_IN.forEach(a => actionRegistry.register(a))
