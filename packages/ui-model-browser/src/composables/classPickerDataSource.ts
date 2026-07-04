/**
 * ClassPickerDataSource — maps PickerClass[] to PickerItem[] with client-side search.
 */

import type { PickerItem, PickerDataSource } from 'ui-search'
import { getEcorePackage } from '@emfts/core'
import { deriveRootEPackages, collectClassesDeep, type PickerClass } from '../components/classPickerSource'
import { getClassifierIcon, getIconForClassViaRegistry } from '../types'

function iconFor(eClass: any): string {
  return (eClass && getIconForClassViaRegistry(eClass)) || getClassifierIcon(eClass)
}

export interface ClassPickerDataSourceOptions {
  /** Registry packages (from useSharedModelRegistry().userPackages). */
  registryPackages?: () => any[] | undefined
  /** Explicit source packages (live model). Overrides registry. */
  sourcePackages?: () => any[] | undefined
  includeAbstract?: boolean
  includeEcoreClasses?: boolean
  /** 'flat' = no groups, 'grouped' = group by package */
  grouped?: boolean
}

function classToPickerItem(cls: PickerClass, grouped: boolean): PickerItem {
  return {
    key: cls.qualifiedName,
    label: cls.className,
    icon: iconFor(cls.eClass),
    styleHints: cls.isAbstract ? { italic: true, tag: 'abstract' } : undefined,
    groupKey: grouped ? cls.packageNsURI || cls.packageName : undefined,
    groupLabel: grouped ? cls.packageName : undefined,
    groupIcon: grouped ? 'pi pi-folder' : undefined,
    secondaryLabel: grouped ? undefined : cls.packageName,
    payload: {
      eClass: cls.eClass,
      qualifiedName: cls.qualifiedName,
      className: cls.className,
      packageNsURI: cls.packageNsURI
    }
  }
}

export function createClassPickerDataSource(opts: ClassPickerDataSourceOptions): PickerDataSource {
  const grouped = opts.grouped ?? false

  function getRootPackages(): any[] {
    const roots = deriveRootEPackages(
      opts.registryPackages?.()?.map?.((p: any) => (p.ePackage ? p : { ePackage: p })),
      opts.sourcePackages?.()
    )
    if (opts.includeEcoreClasses) {
      try {
        const ecore = getEcorePackage()
        if (ecore) return [...roots, ecore]
      } catch { /* ignore */ }
    }
    return roots
  }

  function getAllClasses(): PickerClass[] {
    return collectClassesDeep(getRootPackages(), opts.includeAbstract ?? true)
  }

  return {
    minQueryLength: 0,

    loadInitial(): PickerItem[] {
      return getAllClasses().map(c => classToPickerItem(c, grouped))
    },

    search(query: string): PickerItem[] {
      const q = query.toLowerCase()
      return getAllClasses()
        .filter(c => c.className.toLowerCase().includes(q) || c.packageName.toLowerCase().includes(q))
        .map(c => classToPickerItem(c, grouped))
    }
  }
}
