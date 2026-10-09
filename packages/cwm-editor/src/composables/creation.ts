/**
 * Creating model objects from the context view.
 *
 * Every new object comes from the factory of the package that defines its
 * class, goes into a containment feature of its container, and then gets an
 * xmi:id - through a hook the view installs from the instance tree, so the
 * rules stay in one place (no xmi:id for classes with an ID attribute).
 */
import { toRaw } from 'tsm:vue'

let onCreated: (object: any) => void = () => {}

/** Installed by the context view: assigns the xmi:id of a new object */
export function setCreatedHook(hook: (object: any) => void): void {
  onCreated = hook
}

export function newObject(eClass: any): any | null {
  return eClass?.getEPackage?.()?.getEFactoryInstance?.()?.create?.(eClass) ?? null
}

/**
 * Creates an object of `eClass` in `container.<featureName>` - at `index`
 * when given, else at the end - and returns it, or null.
 */
export function createIn(container: any, featureName: string, eClass: any, index?: number): any | null {
  const c = toRaw(container)
  const feature = c?.eClass?.()?.getEStructuralFeature?.(featureName)
  const object = newObject(eClass)
  if (!feature || !object) return null
  if (feature.isMany?.()) {
    const list = c.eGet(feature)
    list.add(object)
    if (index != null && index >= 0 && index < list.size() - 1) list.move(index, list.size() - 1)
  } else {
    c.eSet(feature, object)
  }
  onCreated(object)
  return object
}

/** Sets a feature by name, if the class has it */
export function setByName(object: any, featureName: string, value: unknown): void {
  const o = toRaw(object)
  const feature = o?.eClass?.()?.getEStructuralFeature?.(featureName)
  if (feature) o.eSet(feature, value)
}
