/**
 * Picker-Datenquellen fuer die Overlay-Settings (Plan 9, D3):
 * Features und eTypes der GELADENEN Metamodelle auswaehlbar machen —
 * konsumiert vom generischen PickerDialog aus ui-search
 * (Service ui.search.components), Daten aus der Model-Registry
 * (ui.model-browser.composables).
 */

// Strukturell kompatibel zu ui-search PickerItem/PickerDataSource —
// bewusst lokal definiert (kein statischer Cross-Plugin-Import).
export interface PickerItemLike {
  key: string
  label: string
  secondaryLabel?: string
  icon: string
  breadcrumb?: string
  groupKey?: string
}

export interface PickerDataSourceLike {
  loadInitial(): PickerItemLike[]
  search(query: string): PickerItemLike[]
}

export interface FeaturePick {
  featureName: string
  eTypeName?: string
}

interface RegistryLike {
  allPackages: { value: Array<{ name?: string; isBuiltIn?: boolean; ePackage?: unknown }> }
  getAllClasses: (pkg: unknown) => Array<{ name?: string; eClass?: EClassLike }>
}

interface EClassLike {
  getName?: () => string
  getEStructuralFeatures?: () => Iterable<FeatureLike>
}

interface FeatureLike {
  getName?: () => string
  getEType?: () => { getName?: () => string } | null
  isContainment?: () => boolean
}

/** Ecore-Standard-Datentypen fuer die eType-Auswahl. */
export const ECORE_DATATYPES = [
  'EString', 'EBoolean', 'EInt', 'ELong', 'EShort', 'EByte',
  'EFloat', 'EDouble', 'EDate', 'EBigDecimal', 'EBigInteger', 'EChar'
]

function matches(query: string, ...haystacks: Array<string | undefined>): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return haystacks.some(h => h?.toLowerCase().includes(q))
}

/** Alle Features der Nutzer-Metamodelle als Picker-Eintraege. */
export function createFeaturePickerSource(registry: RegistryLike): PickerDataSourceLike {
  function collect(): PickerItemLike[] {
    const items: PickerItemLike[] = []
    const seen = new Set<string>()
    for (const pkg of registry.allPackages.value) {
      if (pkg.isBuiltIn) continue
      for (const classInfo of registry.getAllClasses(pkg)) {
        const eClass = classInfo.eClass
        const className = classInfo.name ?? eClass?.getName?.() ?? '?'
        for (const feature of eClass?.getEStructuralFeatures?.() ?? []) {
          const name = feature.getName?.()
          if (!name) continue
          const key = `${pkg.name}.${className}.${name}`
          if (seen.has(key)) continue
          seen.add(key)
          const eTypeName = feature.getEType?.()?.getName?.()
          const isRef = typeof feature.isContainment === 'function'
          items.push({
            key,
            label: name,
            secondaryLabel: eTypeName,
            icon: isRef ? 'pi pi-link' : 'pi pi-tag',
            breadcrumb: `${pkg.name} › ${className}`,
            groupKey: `${pkg.name}.${className}`
          })
        }
      }
    }
    return items.sort((a, b) => a.label.localeCompare(b.label))
  }

  return {
    loadInitial: () => collect(),
    search: (query: string) =>
      collect().filter(i => matches(query, i.label, i.secondaryLabel, i.breadcrumb))
  }
}

/** eTypes: Ecore-Datentypen + EEnums + EClasses der Nutzer-Metamodelle. */
export function createETypePickerSource(registry: RegistryLike): PickerDataSourceLike {
  function collect(): PickerItemLike[] {
    const items: PickerItemLike[] = ECORE_DATATYPES.map(name => ({
      key: `ecore.${name}`,
      label: name,
      icon: 'pi pi-code',
      groupKey: 'Ecore-Datentypen'
    }))
    const seen = new Set<string>()
    for (const pkg of registry.allPackages.value) {
      if (pkg.isBuiltIn) continue
      const classifiers = (pkg.ePackage as { getEClassifiers?: () => Iterable<{ getName?: () => string; eClass?: () => { getName?: () => string } }> })
        ?.getEClassifiers?.() ?? []
      for (const classifier of classifiers) {
        const name = classifier.getName?.()
        if (!name || seen.has(`${pkg.name}.${name}`)) continue
        seen.add(`${pkg.name}.${name}`)
        const kind = classifier.eClass?.()?.getName?.()
        items.push({
          key: `${pkg.name}.${name}`,
          label: name,
          icon: kind === 'EEnum' ? 'pi pi-list' : kind === 'EDataType' ? 'pi pi-code' : 'pi pi-box',
          breadcrumb: pkg.name,
          groupKey: kind === 'EEnum' ? 'Enums' : kind === 'EDataType' ? 'Datentypen' : 'Klassen'
        })
      }
    }
    return items
  }

  return {
    loadInitial: () => collect(),
    search: (query: string) => collect().filter(i => matches(query, i.label, i.breadcrumb))
  }
}
