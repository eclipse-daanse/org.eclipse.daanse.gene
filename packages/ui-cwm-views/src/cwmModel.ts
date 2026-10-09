/**
 * Read access to CWM relational objects.
 *
 * Works on dynamic EObjects by feature name, so the plugin needs no
 * generated CWM classes.
 */

import type { EObject, EClass } from '@emfts/core'

export const RELATIONAL_NS_URI = 'http://www.omg.org/spec/CWM/1.1/resource/relational'
export const BUSINESSINFORMATION_NS_URI = 'http://www.omg.org/spec/CWM/1.1/foundation/businessinformation'

/** True when eClass is the given class or one of its subclasses */
export function isKindOf(eClass: EClass | null | undefined, nsURI: string, className: string): boolean {
  if (!eClass) return false
  const same = (c: EClass) => c.getName() === className && c.getEPackage()?.getNsURI() === nsURI
  if (same(eClass)) return true
  return toArray<EClass>(eClass.getEAllSuperTypes()).some(same)
}

export function isInstanceOf(obj: unknown, nsURI: string, className: string): obj is EObject {
  return !!obj && typeof (obj as EObject).eClass === 'function' && isKindOf((obj as EObject).eClass(), nsURI, className)
}

export function toArray<T>(value: unknown): T[] {
  if (value == null) return []
  if (Array.isArray(value)) return value as T[]
  if (typeof (value as any).toArray === 'function') return (value as any).toArray()
  if (typeof (value as any)[Symbol.iterator] === 'function') return Array.from(value as Iterable<T>)
  return [value as T]
}

/** Value of a feature by name; undefined when the class has no such feature */
export function get(obj: EObject | null | undefined, featureName: string): any {
  if (!obj) return undefined
  const feature = obj.eClass().getEStructuralFeature(featureName)
  return feature ? obj.eGet(feature) : undefined
}

/** Like get, but undefined when the feature is unset (avoids defaults such as 0) */
export function getIfSet(obj: EObject | null | undefined, featureName: string): any {
  if (!obj) return undefined
  const feature = obj.eClass().getEStructuralFeature(featureName)
  return feature && obj.eIsSet(feature) ? obj.eGet(feature) : undefined
}

export function getMany<T = EObject>(obj: EObject | null | undefined, featureName: string): T[] {
  return toArray<T>(get(obj, featureName))
}

export function nameOf(obj: EObject | null | undefined): string {
  const name = get(obj, 'name')
  return name != null && name !== '' ? String(name) : ''
}

/** Enum values come as literal objects or plain values depending on how they were set */
export function enumName(value: any): string {
  if (value == null) return ''
  if (typeof value === 'object') {
    return value.getName?.() ?? value.getLiteral?.() ?? value.name ?? String(value)
  }
  return String(value)
}

export interface ColumnRow {
  column: EObject
  name: string
  typeName: string
  type: EObject | null
  length: string
  precision: string
  scale: string
  nullable: boolean | null
  primaryKey: boolean
  /** Referenced tables of the foreign keys this column belongs to */
  foreignKeyTargets: EObject[]
  description: string
}

export interface TableSummary {
  name: string
  /** Containing schema/catalog path, outermost first */
  path: string[]
  descriptions: string[]
  rows: ColumnRow[]
}

function nullableOf(value: any): boolean | null {
  const name = enumName(value)
  if (name === 'columnNoNulls') return false
  if (name === 'columnNullable') return true
  return null
}

function numberText(value: any): string {
  return value == null || value === '' ? '' : String(value)
}

/** Table that owns a unique key (target of a foreign key) */
function owningTable(key: EObject | null | undefined): EObject | null {
  const container = key?.eContainer() ?? null
  return isInstanceOf(container, RELATIONAL_NS_URI, 'ColumnSet') ? container : null
}

/** Descriptions owned by the table, grouped by the element they describe */
function descriptionsByElement(table: EObject): Map<EObject, string[]> {
  const result = new Map<EObject, string[]>()
  for (const owned of getMany(table, 'ownedElement')) {
    if (!isInstanceOf(owned, BUSINESSINFORMATION_NS_URI, 'Description')) continue
    const body = get(owned, 'body')
    if (body == null || body === '') continue
    for (const element of getMany(owned, 'modelElement')) {
      const list = result.get(element) ?? []
      list.push(String(body))
      result.set(element, list)
    }
  }
  return result
}

export function summarizeTable(table: EObject): TableSummary {
  const owned = getMany(table, 'ownedElement')
  const primaryKeyColumns = new Set<EObject>()
  const foreignKeys = new Map<EObject, EObject[]>()

  for (const element of owned) {
    if (isInstanceOf(element, RELATIONAL_NS_URI, 'PrimaryKey')) {
      getMany(element, 'feature').forEach(c => primaryKeyColumns.add(c))
    } else if (isInstanceOf(element, RELATIONAL_NS_URI, 'ForeignKey')) {
      const target = owningTable(get(element, 'uniqueKey'))
      for (const column of getMany(element, 'feature')) {
        const targets = foreignKeys.get(column) ?? []
        if (target && !targets.includes(target)) targets.push(target)
        foreignKeys.set(column, targets)
      }
    }
  }

  const descriptions = descriptionsByElement(table)

  const rows: ColumnRow[] = getMany(table, 'feature')
    .filter(f => isInstanceOf(f, RELATIONAL_NS_URI, 'Column'))
    .map(column => {
      const type = (get(column, 'type') as EObject | null) ?? null
      return {
        column,
        name: nameOf(column),
        typeName: nameOf(type),
        type,
        length: numberText(getIfSet(column, 'length')),
        precision: numberText(getIfSet(column, 'precision')),
        scale: numberText(getIfSet(column, 'scale')),
        nullable: nullableOf(get(column, 'isNullable')),
        primaryKey: primaryKeyColumns.has(column),
        foreignKeyTargets: foreignKeys.get(column) ?? [],
        description: (descriptions.get(column) ?? []).join('\n\n')
      }
    })

  const path: string[] = []
  for (let c = table.eContainer(); c; c = c.eContainer()) {
    const name = nameOf(c)
    if (name) path.unshift(name)
  }

  return {
    name: nameOf(table),
    path,
    descriptions: descriptions.get(table) ?? [],
    rows
  }
}
