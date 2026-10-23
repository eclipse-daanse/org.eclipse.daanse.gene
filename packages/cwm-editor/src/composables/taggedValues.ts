/**
 * Settings of the editor kept in the model, as CWM tagged values
 * (ModelElement.taggedValue, tag + value) - they travel with the model:
 *
 * - `gene.children`: "collapsed" shows the element's children folded at
 *   first; missing or "expanded" shows them unfolded (the default).
 * - `gene.numbering`: how the element counts in the editor's numbering -
 *   "restart" (its level starts again at 1), "deeper" / "higher" (it and its
 *   subtree are numbered one level deeper / higher), "none" (it and its
 *   subtree get no number and do not count). Missing: numbered as it lies.
 */
import { toRaw } from 'tsm:vue'
import { attr, className, many } from './documentation'
import { createIn, setByName } from './creation'

export const TAG_CHILDREN = 'gene.children'
export const TAG_NUMBERING = 'gene.numbering'

export type ChildrenDefault = 'expanded' | 'collapsed'
export type NumberingMode = 'normal' | 'restart' | 'deeper' | 'higher' | 'none'

export function isTaggedValue(o: any): boolean {
  return className(o) === 'TaggedValue'
}

function tagged(o: any, tag: string): any | null {
  return many(attr(o, 'taggedValue')).find(t => String(attr(t, 'tag') ?? '') === tag) ?? null
}

export function tagValue(o: any, tag: string): string | null {
  const t = tagged(o, tag)
  return t ? String(attr(t, 'value') ?? '') : null
}

/** Sets a tag; null removes it */
export function setTag(o: any, tag: string, value: string | null): void {
  const raw = toRaw(o)
  const feature = raw?.eClass?.()?.getEStructuralFeature?.('taggedValue')
  if (!feature) return
  const existing = tagged(raw, tag)
  if (value == null) {
    if (existing) raw.eGet(feature).remove(existing)
    return
  }
  if (existing) {
    setByName(existing, 'value', value)
    return
  }
  const t = createIn(raw, 'taggedValue', feature.getEType())
  if (!t) return
  setByName(t, 'tag', tag)
  setByName(t, 'value', value)
}

export function canHaveTags(o: any): boolean {
  return !!toRaw(o)?.eClass?.()?.getEStructuralFeature?.('taggedValue')
}

export function childrenDefault(o: any): ChildrenDefault {
  return tagValue(o, TAG_CHILDREN) === 'collapsed' ? 'collapsed' : 'expanded'
}

export function numberingMode(o: any): NumberingMode {
  const v = tagValue(o, TAG_NUMBERING)
  return v === 'restart' || v === 'deeper' || v === 'higher' || v === 'none' ? v : 'normal'
}

export const NUMBERING_LABELS: Record<NumberingMode, string> = {
  normal: 'normal',
  restart: 'neu beginnen',
  deeper: 'eine Ebene tiefer',
  higher: 'eine Ebene höher',
  none: 'ohne Nummer'
}

/**
 * Outline numbers ("1", "1.2", "1.2.3") for rows in depth-first order,
 * starting at the top: the context object (and any other row at the top) is
 * "1", "2" …, its children "1.1" … The rows count by their depth, moved by
 * "deeper"/"higher" of themselves and their ancestors, restarted by
 * "restart", left out with their subtree by "none".
 */
export function outlineNumbers(rows: { object: any; depth: number; ancestors: any[] }[]): Map<any, string> {
  const numbers = new Map<any, string>()
  const counters: number[] = []
  for (const r of rows) {
    const chain = [...r.ancestors, r.object]
    const modes = chain.map(numberingMode)
    if (modes.includes('none')) continue
    const shift = modes.reduce((n, m) => n + (m === 'deeper' ? 1 : m === 'higher' ? -1 : 0), 0)
    const level = Math.max(1, r.depth + 1 + shift)
    if (modes[modes.length - 1] === 'restart') counters[level] = 0
    counters[level] = (counters[level] ?? 0) + 1
    counters.length = level + 1
    const parts: number[] = []
    for (let l = 1; l <= level; l++) parts.push(counters[l] || 1)
    numbers.set(r.object, parts.join('.'))
  }
  return numbers
}
