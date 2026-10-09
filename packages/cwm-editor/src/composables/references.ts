/**
 * The references of an object (PH-9, FR-2.9): the Descriptions, Documents,
 * Responsible Parties, Measurements and Change Requests that point at it with
 * `modelElement`. CWM keeps that reference on the documenting side only, so
 * the view needs the inverse: an index over the whole resource set, rebuilt
 * when the model changes.
 */
import { toRaw } from 'tsm:vue'
import { attr, className, many } from './documentation'
import { children, displayName, pathTo } from './contextView'

/** The classes shown as references, in the order of FR-2.9 */
export const REFERENCE_CLASSES = ['Description', 'Document', 'ResponsibleParty', 'Measurement', 'ChangeRequest']

export interface ReferenceRow {
  object: any
  name: string
  /** Breadcrumb from the root down to the referencing object's container */
  path: string
  description: string
  type: string
  /** Set attributes, for the tooltip */
  details: string
}

export type ReferenceIndex = Map<any, any[]>

function isReferenceObject(o: any): boolean {
  return REFERENCE_CLASSES.includes(className(o)) && !!o.eClass().getEStructuralFeature('modelElement')
}

/** All objects of the resource set the context object lives in, depth first */
export function allObjects(context: any): any[] {
  const o = toRaw(context)
  const resource = o?.eResource?.()
  const resources = many(resource?.getResourceSet?.()?.getResources?.())
  const roots = resources.length > 0
    ? resources.flatMap(r => many(r.getContents?.()))
    : many(resource?.getContents?.())
  const out: any[] = []
  const walk = (x: any) => { out.push(x); children(x).forEach(walk) }
  roots.forEach(walk)
  return out
}

/** target -> the reference objects pointing at it */
export function buildReferenceIndex(context: any): ReferenceIndex {
  const index: ReferenceIndex = new Map()
  for (const o of allObjects(context)) {
    if (!isReferenceObject(o)) continue
    for (const target of many(attr(o, 'modelElement'))) {
      const list = index.get(target) ?? []
      list.push(o)
      index.set(target, list)
    }
  }
  return index
}

/** Candidates for "+ Referenz": every reference object not yet pointing at the target */
export function referenceCandidates(context: any, target: any): any[] {
  const t = toRaw(target)
  return allObjects(context).filter(o => isReferenceObject(o) && !many(attr(o, 'modelElement')).includes(t))
}

function describe(o: any): string {
  switch (className(o)) {
    case 'Description': return String(attr(o, 'body') ?? '')
    case 'Document': return String(attr(o, 'reference') ?? attr(o, 'type') ?? '')
    case 'ResponsibleParty': return String(attr(o, 'responsibility') ?? '')
    case 'Measurement': return [attr(o, 'value'), attr(o, 'unit')].filter(v => v != null && v !== '').join(' ')
    case 'ChangeRequest': return String(attr(o, 'changeDescription') ?? attr(o, 'status') ?? '')
    default: return ''
  }
}

function details(o: any): string {
  const lines = [`${className(o)} ${displayName(o)}`]
  for (const feature of many(o.eClass().getEAllAttributes())) {
    if (feature.isMany?.() || !o.eIsSet?.(feature)) continue
    const v = toRaw(o.eGet(feature))
    const text = typeof v === 'object' && v ? String(v.getLiteral?.() ?? v.getName?.() ?? v) : String(v)
    lines.push(`${feature.getName()}: ${text.length > 120 ? text.slice(0, 117) + '…' : text}`)
  }
  return lines.join('\n')
}

/**
 * The reference rows of an object; `shown` holds objects the row already
 * shows elsewhere (a table's own description, its column descriptions).
 */
export function referenceRows(index: ReferenceIndex, target: any, shown: Set<any> = new Set()): ReferenceRow[] {
  return (index.get(toRaw(target)) ?? [])
    .filter(o => !shown.has(o))
    .sort((a, b) => REFERENCE_CLASSES.indexOf(className(a)) - REFERENCE_CLASSES.indexOf(className(b)))
    .map(o => ({
      object: o,
      name: displayName(o),
      path: pathTo(o).map(displayName).join(' › '),
      description: describe(o),
      type: className(o),
      details: details(o)
    }))
}

/** Adds the target to the `modelElement` of each chosen reference object */
export function addReferences(target: any, referrers: any[]): void {
  const t = toRaw(target)
  for (const r of referrers.map(x => toRaw(x))) {
    const list = r.eGet(r.eClass().getEStructuralFeature('modelElement'))
    if (!many(list).includes(t)) list.add(t)
  }
}
