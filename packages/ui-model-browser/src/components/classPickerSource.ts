/**
 * Pure, framework-free source resolution for ClassPickerDialog.
 *
 * Extracted from the component so the dedup / sourcePackages / subpackage-recursion
 * logic is unit-testable without mounting Vue or PrimeVue. Operates on duck-typed
 * EPackage/EClass objects (getNsURI/getName/getEClassifiers/getESubpackages/
 * getESuperPackage/isAbstract), so tests can pass plain mocks.
 */

export interface PickerClass {
  eClass: any
  qualifiedName: string
  className: string
  packageNsURI: string
  packageName: string
  isAbstract: boolean
}

/** A registry entry as exposed by useSharedModelRegistry().userPackages. */
export interface RegistryPackage {
  ePackage: any
}

/**
 * Decide which root EPackages to render classes from.
 *
 * - With an explicit `sourcePackages` (caller owns the hierarchy, e.g. a live model),
 *   use those as-is.
 * - Otherwise derive roots from the registry entries: the registry lists every
 *   subpackage as its own entry in addition to its parent, and callers recurse into
 *   subpackages themselves — so keep only packages whose super package is not itself
 *   a listed entry, to avoid emitting each class once per ancestor level.
 */
export function deriveRootEPackages(
  registryPackages: RegistryPackage[] | undefined,
  sourcePackages?: any[]
): any[] {
  if (sourcePackages && sourcePackages.length) return sourcePackages
  const pkgs = registryPackages ?? []
  const listed = new Set(pkgs.map((p) => p.ePackage))
  return pkgs
    .filter((p) => {
      const sup = p.ePackage?.getESuperPackage?.()
      return !sup || !listed.has(sup)
    })
    .map((p) => p.ePackage)
}

/**
 * Recursively collect EClasses from the given root EPackages and all their subpackages.
 * Mirrors the dialog's display rules: only classifiers that look like EClasses
 * (have attribute accessors), named, and abstract ones filtered out when requested.
 */
export function collectClassesDeep(rootEPackages: any[], includeAbstract = true): PickerClass[] {
  const result: PickerClass[] = []
  const visit = (pkg: any, pkgLabel: string) => {
    const nsURI = pkg.getNsURI?.() || ''
    for (const cls of Array.from(pkg.getEClassifiers?.() ?? []) as any[]) {
      if (!('getEAllAttributes' in cls || 'getEAttributes' in cls)) continue
      const name = cls.getName?.() || ''
      if (!name) continue
      const isAbstract = cls.isAbstract?.() || false
      if (!includeAbstract && isAbstract) continue
      result.push({
        eClass: cls,
        qualifiedName: nsURI ? `${nsURI}#//${name}` : `${pkgLabel}.${name}`,
        className: name,
        packageNsURI: nsURI,
        packageName: pkgLabel,
        isAbstract
      })
    }
    for (const sub of Array.from(pkg.getESubpackages?.() ?? []) as any[]) {
      visit(sub, `${pkgLabel}.${sub.getName?.() || ''}`)
    }
  }
  rootEPackages.forEach((p) => visit(p, p.getName?.() || ''))
  return result
}
