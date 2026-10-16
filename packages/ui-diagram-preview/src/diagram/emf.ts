/**
 * Tiny ergonomic helpers over @emfts/core's reflective API.
 */
import type { EObject, EStructuralFeature, EList } from '@emfts/core'

export function sf(o: EObject, name: string): EStructuralFeature {
  const f = o.eClass().getEStructuralFeature(name)
  if (!f) throw new Error(`No feature "${name}" on ${o.eClass().getName()}`)
  return f
}

export function get(o: EObject, name: string): any {
  return o.eGet(sf(o, name))
}

export function tryGet(o: EObject, name: string): any {
  const f = o.eClass().getEStructuralFeature(name)
  return f ? o.eGet(f) : undefined
}

export function set(o: EObject, name: string, value: unknown): void {
  o.eSet(sf(o, name), value)
}

export function elist(o: EObject, name: string): EList<EObject> {
  return get(o, name) as EList<EObject>
}

export function items(o: EObject, name: string): EObject[] {
  return elist(o, name).toArray()
}
