/**
 * Declarative navigation for diagram definitions: queries (steps forward,
 * inverse, to the container, with class filters), conditions, values and the
 * diagram's switches. Generic over any EMF model - nothing here knows a
 * particular metamodel.
 */
import type { EObject } from '@emfts/core'
import { evaluateBoolean } from './evaluateExpression'

/** Everything a definition is evaluated with: the switch settings and the inverse index */
export interface DiagramContext {
  /** switch name -> value ("true"/"false", or a choice like INLINE) */
  settings: Map<string, string>
  /** Objects searched for inverse steps: the whole resource set of the diagram root */
  scope: () => EObject[]
  /** feature -> target -> objects whose feature holds the target; built per feature on demand */
  inverse: Map<any, Map<any, EObject[]>>
  /** Focus diagram: only these objects (and their containers) become nodes; null = everything */
  focus?: Set<EObject> | null
  /** Containers of the focus objects - shown as frames only */
  focusAncestors?: Set<EObject>
  /** Rows left out (by rowObjId): in a focus diagram the rows of a node's own object no edge starts at */
  hiddenRows?: Set<string>
}

function list(v: unknown): EObject[] {
  if (v == null) return []
  if (Array.isArray(v)) return v as EObject[]
  const anyV = v as { toArray?: () => EObject[] }
  return typeof anyV.toArray === 'function' ? anyV.toArray() : [v as EObject]
}

function feature(o: EObject, name: string): any {
  return o.eClass().getEStructuralFeature(name)
}

/** A feature of a mapping element (a reference into the domain metamodel), resolved */
function refOf(o: EObject | null | undefined, name: string): any {
  if (!o) return null
  const f = feature(o, name)
  const v = f ? o.eGet(f) : null
  if (v && typeof (v as any).eIsProxy === 'function' && (v as any).eIsProxy()) {
    try {
      return (o as any).eResource?.()?.getResourceSet?.()?.getEObject?.((v as any).eProxyURI(), true) ?? v
    } catch {
      return v
    }
  }
  return v ?? null
}

function attrOf(o: EObject | null | undefined, name: string): string {
  if (!o) return ''
  const f = feature(o, name)
  const v = f ? o.eGet(f) : null
  return v == null ? '' : String(v)
}

function boolOf(o: EObject | null | undefined, name: string): boolean {
  if (!o) return false
  const f = feature(o, name)
  const v = f ? o.eGet(f) : false
  return v === true || v === 'true'
}

function childrenOf(o: EObject | null | undefined, name: string): EObject[] {
  if (!o) return []
  const f = feature(o, name)
  return f ? list(o.eGet(f)) : []
}

function childOf(o: EObject | null | undefined, name: string): EObject | null {
  if (!o) return null
  const f = feature(o, name)
  return f ? ((o.eGet(f) as EObject | null) ?? null) : null
}

/** Same feature even when the definition and the model hold different copies of the metamodel */
function sameFeature(a: any, b: any): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.getName?.() === b.getName?.() &&
    a.getEContainingClass?.()?.getName?.() === b.getEContainingClass?.()?.getName?.()
}

/** instance of the class or a subclass, by name and package nsURI */
function isInstance(o: EObject, cls: any): boolean {
  if (!cls) return true
  const name = cls.getName?.()
  const ns = cls.getEPackage?.()?.getNsURI?.()
  const matches = (c: any) => c?.getName?.() === name && (!ns || c?.getEPackage?.()?.getNsURI?.() === ns)
  const c = o.eClass()
  return matches(c) || list(c.getEAllSuperTypes?.()).some(matches)
}

/** The model's own feature matching the definition's one, on the object's class */
function modelFeature(o: EObject, defFeature: any): any {
  if (!defFeature) return null
  const own = o.eClass().getEStructuralFeature(defFeature.getName?.())
  return own && sameFeature(own, defFeature) ? own : own ?? null
}

function inverseIndex(defFeature: any, ctx: DiagramContext): Map<any, EObject[]> {
  const key = `${defFeature.getEContainingClass?.()?.getName?.()}.${defFeature.getName?.()}`
  let index = ctx.inverse.get(key)
  if (index) return index
  index = new Map()
  for (const o of ctx.scope()) {
    const f = modelFeature(o, defFeature)
    if (!f || !sameFeature(f, defFeature)) continue
    for (const t of list(o.eGet(f))) {
      const arr = index.get(t) ?? []
      arr.push(o)
      index.set(t, arr)
    }
  }
  ctx.inverse.set(key, index)
  return index
}

/** The objects a query leads to from a start object, without duplicates */
export function runQuery(query: EObject | null | undefined, start: EObject, ctx: DiagramContext): EObject[] {
  if (!query) return [start]
  let current: EObject[] = [start]
  for (const step of childrenOf(query, 'steps')) {
    const f = refOf(step, 'feature')
    const filter = refOf(step, 'filterClass')
    const next: EObject[] = []
    const where = childOf(step, 'where')
    const index = attrOf(step, 'index').trim()
    for (const o of current) {
      let found: EObject[]
      const ancestor = attrOf(step, 'ancestor').toLowerCase()
      if (ancestor) {
        const all: EObject[] = []
        for (let p = o.eContainer?.() as EObject | null; p; p = p.eContainer?.() as EObject | null) if (isInstance(p, filter)) all.push(p)
        found = all.length ? [ancestor === 'outermost' ? all[all.length - 1] : all[0]] : []
      } else if (boolOf(step, 'container')) found = o.eContainer?.() ? [o.eContainer() as EObject] : []
      else if (boolOf(step, 'siblings')) {
        const parent = o.eContainer?.() as EObject | null
        const cf = (o as any).eContainingFeature?.()
        found = parent && cf ? list(parent.eGet(cf)).filter(x => x !== o) : []
      }
      else if (!f) found = [o]
      else if (boolOf(step, 'inverse')) found = inverseIndex(f, ctx).get(o) ?? []
      else {
        const mf = modelFeature(o, f)
        found = mf ? list(o.eGet(mf)) : []
      }
      found = found.filter(x => x && isInstance(x, filter) && (!where || evalCondition(where, x, ctx)))
      if (index) {
        const i = index === 'last' ? found.length - 1 : Number(index)
        found = Number.isInteger(i) && i >= 0 && i < found.length ? [found[i]] : []
      }
      for (const x of found) if (!next.includes(x)) next.push(x)
    }
    current = next
  }
  for (const u of childrenOf(query, 'union')) {
    for (const x of runQuery(u, start, ctx)) if (!current.includes(x)) current.push(x)
  }
  return current
}

/**
 * The diagram an object shows with this definition, or null when no binding
 * takes its class. With a focus, the root query runs from every focus
 * object too: partners in other top-level packages bring their own root.
 */
export function bindingFor(model: EObject, obj: EObject): { roots: EObject[]; focus: EObject[] | null } | null {
  const name = obj.eClass().getName()
  const ns = obj.eClass().getEPackage?.()?.getNsURI?.()
  for (const b of childrenOf(model, 'bindings')) {
    const sc = refOf(b, 'sourceClass')
    if (!sc || sc.getName?.() !== name || (sc.getEPackage?.()?.getNsURI?.() && sc.getEPackage().getNsURI() !== ns)) continue
    const ctx = createContext(model, obj)
    const rootQ = childOf(b, 'root')
    const focusQ = childOf(b, 'focus')
    const focus = focusQ ? runQuery(focusQ, obj, ctx) : null
    const roots: EObject[] = []
    for (const o of [obj, ...(focus ?? [])]) {
      const r = rootQ ? runQuery(rootQ, o, ctx)[0] ?? null : o
      if (r && !roots.includes(r)) roots.push(r)
      if (!focus) break
    }
    if (!roots.length) continue
    return { roots, focus }
  }
  return null
}

function literalText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    const o = v as any
    if (typeof o.getLiteral === 'function') return String(o.getLiteral())
    if (typeof o.eClass === 'function') {
      const nf = o.eClass().getEStructuralFeature('name')
      return nf ? String(o.eGet(nf) ?? '') : ''
    }
  }
  return String(v)
}

/** Whether a condition holds for an object; no condition holds always */
export function evalCondition(cond: EObject | null | undefined, obj: EObject, ctx: DiagramContext): boolean {
  if (!cond) return true
  const kind = attrOf(cond, 'kind').toUpperCase() || 'EXISTS'
  switch (kind) {
    case 'SWITCH': {
      const value = ctx.settings.get(attrOf(cond, 'switch')) ?? ''
      const wanted = attrOf(cond, 'value').split(',').map(v => v.trim()).filter(Boolean)
      return wanted.length === 0 ? value === 'true' : wanted.includes(value)
    }
    case 'NOT':
      return !childrenOf(cond, 'operands').every(c => evalCondition(c, obj, ctx))
    case 'AND':
      return childrenOf(cond, 'operands').every(c => evalCondition(c, obj, ctx))
    case 'OR':
      return childrenOf(cond, 'operands').some(c => evalCondition(c, obj, ctx))
    case 'EXPRESSION': {
      const e = childOf(cond, 'expression')
      return e ? evaluateBoolean({ language: attrOf(e, 'language'), body: attrOf(e, 'body') }, obj) : true
    }
    case 'EXISTS':
      return runQuery(childOf(cond, 'query'), obj, ctx).length > 0
    case 'SET':
    case 'EQUALS': {
      const f = refOf(cond, 'feature')
      const targets = runQuery(childOf(cond, 'query'), obj, ctx)
      return targets.some(t => {
        const mf = modelFeature(t, f)
        if (!mf) return false
        if (kind === 'SET') return typeof (t as any).eIsSet === 'function' ? (t as any).eIsSet(mf) : t.eGet(mf) != null
        return literalText(t.eGet(mf)) === attrOf(cond, 'value')
      })
    }
    default:
      return true
  }
}

function multiplicityText(o: EObject): string {
  // CWM: multiplicity -> range -> lower/upper; Ecore-like: lowerBound/upperBound
  const m = childOf(o, 'multiplicity')
  const range = m ? childrenOf(m, 'range')[0] ?? null : null
  const src = range ?? o
  const lowF = feature(src, range ? 'lower' : 'lowerBound')
  const upF = feature(src, range ? 'upper' : 'upperBound')
  if (!lowF && !upF) return ''
  const isSet = (f: any) => f && (typeof (src as any).eIsSet !== 'function' || (src as any).eIsSet(f))
  if (!isSet(lowF) && !isSet(upF)) return ''
  const lo = isSet(lowF) ? Number(src.eGet(lowF)) : 0
  const up = isSet(upF) ? Number(src.eGet(upF)) : -1
  const upText = up < 0 ? '*' : String(up)
  return String(lo) === upText ? upText : `${lo}..${upText}`
}

/** The text a value reads from an object; '' when there is none */
export function readValue(value: EObject | null | undefined, obj: EObject, ctx: DiagramContext): string {
  if (!value) return ''
  if (!evalCondition(childOf(value, 'when'), obj, ctx)) return ''
  const fixed = attrOf(value, 'text')
  const parts = childrenOf(value, 'parts')
  let text: string
  if (fixed) {
    text = fixed
  } else if (parts.length) {
    const sepF = feature(value, 'separator')
    const sep = sepF && (value as any).eIsSet?.(sepF) ? attrOf(value, 'separator') : ' '
    text = parts.map(p => readValue(p, obj, ctx)).filter(Boolean).join(sep)
  } else {
    const targets = runQuery(childOf(value, 'query'), obj, ctx)
    const f = refOf(value, 'feature')
    const map = childrenOf(value, 'literalMap')
    const texts = targets.map(t => {
      if (boolOf(value, 'multiplicity')) return multiplicityText(t)
      const raw = f ? t.eGet(modelFeature(t, f) ?? f) : t
      const lit = literalText(raw)
      const mapped = map.find(m => attrOf(m, 'literal') === lit)
      return mapped ? attrOf(mapped, 'text') : lit
    }).filter(Boolean)
    text = texts.join(', ')
  }
  if (!text) return ''
  if (boolOf(value, 'upperCase')) text = text.toUpperCase()
  return `${attrOf(value, 'prefix')}${text}${attrOf(value, 'suffix')}`
}

/** The switch settings of a preset: every switch's default, overridden by the preset */
export function settingsOf(model: EObject, presetName?: string): Map<string, string> {
  const settings = new Map<string, string>()
  for (const sw of childrenOf(model, 'switches')) settings.set(attrOf(sw, 'name'), attrOf(sw, 'defaultValue'))
  const presets = childrenOf(model, 'presets')
  const preset = presets.find(p => attrOf(p, 'name') === presetName) ?? presets[0]
  for (const s of childrenOf(preset, 'settings')) settings.set(attrOf(s, 'switch'), attrOf(s, 'value'))
  return settings
}

/** The presets of a definition as {name, label}, in order; the first is the default */
export function presetsOf(model: EObject | null | undefined): { name: string; label: string }[] {
  return childrenOf(model, 'presets').map(p => ({ name: attrOf(p, 'name'), label: attrOf(p, 'label') || attrOf(p, 'name') }))
}

/** A context for one interpretation: settings of the preset, inverse search over the root's resource set */
export function createContext(model: EObject, root: EObject, presetName?: string, focus?: EObject[] | null): DiagramContext {
  let scope: EObject[] | null = null
  const focusAncestors = new Set<EObject>()
  for (const f of focus ?? []) for (let p = f.eContainer?.() as EObject | null; p; p = p.eContainer?.() as EObject | null) focusAncestors.add(p)
  return {
    settings: settingsOf(model, presetName),
    inverse: new Map(),
    focus: focus ? new Set(focus) : null,
    focusAncestors,
    scope: () => {
      if (scope) return scope
      const out: EObject[] = []
      const res = (root as any).eResource?.()
      const resources = list(res?.getResourceSet?.()?.getResources?.())
      const roots = (resources.length ? resources : res ? [res] : []).flatMap((r: any) => list(r.getContents?.()))
      const walk = (o: EObject) => {
        out.push(o)
        for (const c of list(o.eContents?.())) walk(c)
      }
      ;(roots.length ? roots : [root]).forEach(walk)
      scope = out
      return out
    }
  }
}
