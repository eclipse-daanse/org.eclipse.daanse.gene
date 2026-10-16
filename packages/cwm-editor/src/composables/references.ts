/**
 * The references of an object (PH-9, FR-2.9): the Descriptions, Documents,
 * Responsible Parties, Measurements and Change Requests that point at it with
 * `modelElement`. CWM keeps that reference on the documenting side only, so
 * the view needs the inverse: an index over the whole resource set, rebuilt
 * when the model changes.
 *
 * A classifier also shows what points at its features - a class's
 * structural features, a table's columns, a record's fields - but not what it
 * contains itself (those it shows as its own text or in its tables).
 */
import { toRaw } from 'tsm:vue'
import { attr, className, many } from './documentation'
import { children, displayName, isInside, pathTo } from './contextView'
import { fieldRule } from './fieldDefaults'

/** The classes shown as references, in the order of FR-2.9 */
export const REFERENCE_CLASSES = ['Description', 'Document', 'ResponsibleParty', 'Measurement', 'ChangeRequest']

export interface ReferenceRow {
  object: any
  name: string
  /** Breadcrumb from the root down to the referencing object's container */
  path: string
  /** The same breadcrumb as objects, to click */
  crumbs: Crumb[]
  description: string
  type: string
  /** Set attributes, for the tooltip */
  details: string
  /** Names of the features it points at, when not at the object itself */
  via: string[]
}

export type ReferenceIndex = Map<any, any[]>

/** One step of a breadcrumb */
export interface Crumb {
  object: any
  name: string
}

/** The containers from the root down to the object's container, to click */
export function crumbsOf(o: any): Crumb[] {
  return pathTo(o).map(object => ({ object, name: displayName(object) }))
}

export function isReferenceObject(o: any): boolean {
  return REFERENCE_CLASSES.includes(className(o)) && !!o.eClass().getEStructuralFeature('modelElement')
}

/** All objects of the resource set the context object lives in, depth first */
export function allObjects(context: any): any[] {
  const o = toRaw(context)
  const resource = o?.eResource?.()
  const uri = (r: any) => String(r?.getURI?.() ?? '')
  // The object's own resource always counts, even when its set does not list
  // it; older copies of the same file in the set do not
  const resources = many(resource?.getResourceSet?.()?.getResources?.())
    .filter(r => r === resource || !resource || uri(r) !== uri(resource))
  if (resource && !resources.includes(resource)) resources.unshift(resource)
  const roots = resources.flatMap(r => many(r.getContents?.()))
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
 * The reference rows of an object: what points at it or at one of its
 * features (`feature`, not `ownedElement`), without what the object contains
 * itself and without `shown` - objects the row already shows elsewhere.
 */
export function referenceRows(index: ReferenceIndex, target: any, shown: Set<any> = new Set()): ReferenceRow[] {
  const t = toRaw(target)
  // referrer -> names of the features it points at; empty when it points at the object
  const found = new Map<any, string[]>()
  const collect = (on: any, via: string | null) => {
    for (const o of index.get(on) ?? []) {
      if (shown.has(o) || isInside(o, t)) continue
      const list = found.get(o) ?? []
      if (via != null && !list.includes(via)) list.push(via)
      found.set(o, list)
    }
  }
  collect(t, null)
  for (const f of many(attr(t, 'feature')).map(x => toRaw(x))) collect(f, displayName(f))
  // Pointing at the object itself counts more than pointing at a feature
  for (const o of index.get(t) ?? []) if (found.has(o)) found.set(o, [])
  return [...found.entries()]
    .sort(([a], [b]) => REFERENCE_CLASSES.indexOf(className(a)) - REFERENCE_CLASSES.indexOf(className(b)))
    .map(([o, via]) => ({
      object: o,
      name: displayName(o),
      path: pathTo(o).map(displayName).join(' › '),
      crumbs: crumbsOf(o),
      description: describe(o),
      type: className(o),
      details: details(o),
      via
    }))
}

export interface ReferenceFieldTarget {
  object: any
  name: string
  /** Class of the target */
  type: string
  /** Breadcrumb from the root down to the target's container */
  path: string
  /** The same breadcrumb as objects, to click */
  crumbs: Crumb[]
}

export interface ReferenceField {
  feature: any
  name: string
  containment: boolean
  many: boolean
  /** Name of the referenced class */
  typeName: string
  /** A field rule hides it until the row shows all */
  hidden: boolean
  targets: ReferenceFieldTarget[]
}

/**
 * The class a reference points at. getEReferenceType() throws while the
 * eType is not (yet) an EClass - e.g. an unresolved cross-package proxy -
 * so fall back to the eType itself.
 */
export function referenceType(f: any): any | null {
  try {
    return f.getEReferenceType?.() ?? null
  } catch {
    return f.getEType?.() ?? null
  }
}

function referenceList(o: any, f: any): any[] {
  const value = o.eGet(f)
  return (f.isMany?.() ? many(value) : value ? [value] : []).map((x: any) => toRaw(x)).filter(Boolean)
}

/**
 * All non-containment reference fields of the object's class, set or empty,
 * with what they point at, like the attributes above them. Left out:
 * containments (their objects are the row's children), the reference to the
 * container, derived and transient references, and targets in `shown` (a table's columns, a
 * class's attributes - shown in their tables; a field with only such targets
 * is left out entirely). Without `all`, fields a field rule hides stay out
 * too.
 */
export function referenceFields(object: any, shown: Set<any> = new Set(), all = true): ReferenceField[] {
  const o = toRaw(object)
  const out: ReferenceField[] = []
  for (const f of many(o?.eClass?.()?.getEAllReferences?.())) {
    // Contained objects are the row's children - they get rows of their own
    if (f.isContainment?.() || f.isContainer?.() || f.isDerived?.() || f.isTransient?.()) continue
    const hidden = !!fieldRule(o, f.getName())?.hidden
    if (hidden && !all) continue
    const values = referenceList(o, f)
    const list = values.filter(x => !shown.has(x))
    if (values.length > 0 && list.length === 0) continue
    out.push({
      hidden,
      feature: f,
      name: f.getName(),
      containment: !!f.isContainment?.(),
      many: !!f.isMany?.(),
      typeName: referenceType(f)?.getName?.() ?? '',
      targets: list.map((t: any) => ({
        object: t,
        name: displayName(t),
        type: className(t),
        path: pathTo(t).map(displayName).join(' › '),
        crumbs: crumbsOf(t)
      }))
    })
  }
  return out
}

/**
 * A class's identity by package nsURI and name - also for an unresolved
 * proxy (its URI). Cross-package supertypes can be other objects for the same
 * class, so identity of the objects is not enough.
 */
export function classKey(c: any): string {
  if (!c) return ''
  const proxy = c.eIsProxy?.() ? String(c.eProxyURI?.() ?? '') : ''
  if (proxy) {
    const [uri, fragment = ''] = proxy.split('#')
    return `${uri.replace(/\.ecore$/, '')}#${fragment.split('/').pop()}`
  }
  return `${c.getEPackage?.()?.getNsURI?.() ?? ''}#${c.getName?.() ?? ''}`
}

/** The class is the type or inherits from it */
export function conforms(eClass: any, type: any): boolean {
  if (!eClass || !type) return false
  if (eClass === type) return true
  const key = classKey(type)
  const same = (c: any) => {
    if (c === type) return true
    const k = classKey(c)
    if (k === key) return true
    // A relative proxy (core.ecore#//X) has no nsURI to compare - the name decides
    const [ns, name] = k.split('#')
    const [tns, tname] = key.split('#')
    return name === tname && (!ns.includes('://') || !tns.includes('://'))
  }
  return same(eClass) || many(eClass.getEAllSuperTypes?.()).some(same)
}

/** How many reference fields a field rule hides until the row shows all */
export function hiddenReferenceCount(object: any, shown: Set<any> = new Set()): number {
  return referenceFields(object, shown, true).length - referenceFields(object, shown, false).length
}

/** Objects a non-containment reference can still point at: of its type, not yet in it */
export function referenceTargetCandidates(objects: any[], object: any, feature: any): any[] {
  const o = toRaw(object)
  const type = referenceType(feature)
  const current = referenceList(o, feature)
  return objects.filter(x => x !== o && conforms(x.eClass?.(), type) && !current.includes(x))
}

/**
 * Classes a containment reference can create: its type and the concrete
 * subclasses in the packages the model uses.
 */
export function creatableClasses(objects: any[], feature: any): any[] {
  const type = referenceType(feature)
  if (!type) return []
  const packages = new Set<any>([type.getEPackage?.()])
  for (const x of objects) packages.add(x.eClass?.()?.getEPackage?.())
  const out = new Set<any>()
  for (const p of packages) {
    for (const c of many(p?.getEClassifiers?.())) {
      if (typeof c.isAbstract !== 'function' || c.isAbstract() || c.isInterface?.()) continue
      if (conforms(c, type)) out.add(c)
    }
  }
  return [...out].sort((a, b) => String(a.getName()).localeCompare(String(b.getName())))
}

/** Points the reference at the target - added to a list, set on a single reference */
export function addToReference(object: any, feature: any, target: any): void {
  const o = toRaw(object)
  if (feature.isMany?.()) {
    const list = o.eGet(feature)
    if (!many(list).includes(toRaw(target))) list.add(toRaw(target))
  } else {
    o.eSet(feature, toRaw(target))
  }
}

/** Takes the target out of a non-containment reference */
export function removeFromReference(object: any, feature: any, target: any): void {
  const o = toRaw(object)
  if (feature.isMany?.()) o.eGet(feature).remove(toRaw(target))
  else o.eUnset?.(feature)
}

/** Adds the target to the `modelElement` of each chosen reference object */
export function addReferences(target: any, referrers: any[]): void {
  const t = toRaw(target)
  for (const r of referrers.map(x => toRaw(x))) {
    const list = r.eGet(r.eClass().getEStructuralFeature('modelElement'))
    if (!many(list).includes(t)) list.add(t)
  }
}
