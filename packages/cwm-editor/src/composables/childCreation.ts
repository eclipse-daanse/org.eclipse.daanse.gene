/**
 * Creating children and siblings in the context view: the containment
 * features an object offers, the classes each can hold - grouped so the
 * classes of the parent's own namespace come first - and the creation itself.
 */
import { EPackageRegistry } from '@emfts/core'
import { toRaw } from 'tsm:vue'
import { attr, many } from './documentation'
import { createIn, setByName } from './creation'
import { classKey, conforms, referenceType } from './references'

/** Containment features that can take another object: lists, or single ones still empty */
export function containmentFeatures(object: any): any[] {
  const o = toRaw(object)
  return many(o?.eClass?.()?.getEAllReferences?.()).filter((f: any) =>
    f.isContainment?.() && !f.isDerived?.() && !f.isTransient?.() && (f.isMany?.() || !o.eIsSet?.(f)))
}

/** Every package the model can reach: its resource set's registry, the global one, the packages in use */
function knownPackages(object: any, objects: any[]): Set<any> {
  const packages = new Set<any>()
  const add = (p: any) => {
    if (!p || packages.has(p)) return
    packages.add(p)
    many(p.getESubpackages?.()).forEach(add)
  }
  const registries = [toRaw(object)?.eResource?.()?.getResourceSet?.()?.getPackageRegistry?.(), EPackageRegistry.INSTANCE]
  for (const r of registries) for (const ns of r?.keys?.() ?? []) add(r.getEPackage?.(ns))
  for (const x of objects) add(x.eClass?.()?.getEPackage?.())
  return packages
}

export interface CreatableGroups {
  /** Label of the parent's namespace (its package) */
  nearLabel: string
  /** Classes of the parent's own namespace */
  near: any[]
  /** All other classes the feature can hold */
  more: any[]
}

/** Concrete classes a containment feature of the parent can hold - its own namespace first */
export function creatableGroups(parent: any, feature: any, objects: any[]): CreatableGroups {
  const type = referenceType(feature)
  const ownPkg = toRaw(parent)?.eClass?.()?.getEPackage?.()
  const ownNs = ownPkg?.getNsURI?.()
  const seen = new Set<any>()
  const near: any[] = []
  const more: any[] = []
  if (type) {
    for (const p of knownPackages(parent, objects)) {
      for (const c of many(p.getEClassifiers?.())) {
        // The same class may come from several copies of a package - once is enough
        if (typeof c.isAbstract !== 'function' || c.isAbstract() || c.isInterface?.() || seen.has(classKey(c))) continue
        if (!conforms(c, type)) continue
        seen.add(classKey(c))
        ;(p.getNsURI?.() === ownNs ? near : more).push(c)
      }
    }
  }
  const byName = (a: any, b: any) => String(a.getName()).localeCompare(String(b.getName()))
  return { nearLabel: String(ownPkg?.getName?.() ?? ''), near: near.sort(byName), more: more.sort(byName) }
}

function freeName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base
  for (let i = 2; ; i++) if (!taken.includes(`${base}_${i}`)) return `${base}_${i}`
}

/**
 * Creates an object of `eClass` in the parent's `feature` - at `index` when
 * given, else at the end - named "neu_<class>" (made unique among its
 * siblings) when the class has a name. Returns it, or null.
 */
export function createChild(parent: any, feature: any, eClass: any, index?: number): any | null {
  const p = toRaw(parent)
  const created = createIn(p, feature.getName(), eClass, index)
  if (!created) return null
  if (created.eClass().getEStructuralFeature('name')) {
    const siblings = feature.isMany?.() ? many(p.eGet(feature)).filter((x: any) => x !== created) : []
    const taken = siblings.map((x: any) => String(attr(x, 'name') ?? ''))
    setByName(created, 'name', freeName(`neu_${String(eClass.getName()).toLowerCase()}`, taken))
  }
  return created
}
