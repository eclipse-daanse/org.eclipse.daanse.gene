/**
 * Instance Tree Types
 *
 * Type definitions for the EMF instance tree editor.
 */

import { toRaw } from 'tsm:vue'
import type { EObject, EClass, EReference, Resource } from '@emfts/core'
import { getIconForClass } from './services/iconRegistry'

/**
 * Represents a node in the instance tree
 */
export interface InstanceTreeNode {
  /** Unique key for the node */
  key: string
  /** Display label */
  label: string
  /** Icon class */
  icon: string
  /** The EObject this node represents */
  data: EObject
  /** The EClass of the object */
  eClass: EClass
  /** Child nodes */
  children?: InstanceTreeNode[]
  /** Whether this is a leaf node */
  leaf: boolean
  /** Containment reference (if this is a child node) */
  containmentRef?: EReference
  /** Parent node */
  parent?: InstanceTreeNode
}

/**
 * Tree selection state
 */
export interface TreeSelection {
  /** Selected node key */
  key: string | null
  /** Selected EObject */
  object: EObject | null
  /** Selected tree node */
  node: InstanceTreeNode | null
}

/**
 * Context menu action
 */
export interface TreeAction {
  label: string
  icon: string
  action: () => void
  disabled?: boolean
  separator?: boolean
}

/**
 * Get icon for an EObject based on its EClass
 * Uses the icon registry for configurable icon mappings
 */
export function getObjectIcon(obj: EObject): string {
  const eClass = obj.eClass()
  return getIconForClass(eClass)
}

/**
 * Get display label for an EObject
 */
export function getObjectLabel(obj: EObject): string {
  const eClass = obj.eClass()
  const className = typeof eClass.getName === 'function' ? eClass.getName() : 'Object'

  // Try common naming attributes
  const nameAttr = eClass.getEStructuralFeature('name')
  if (nameAttr) {
    const name = obj.eGet(nameAttr)
    if (name) return `${className}: ${name}`
  }

  // Try EClass ID attribute (marked with iD="true" in ecore)
  if (typeof eClass.getEIDAttribute === 'function') {
    const eidAttr = eClass.getEIDAttribute()
    if (eidAttr) {
      const eid = obj.eGet(eidAttr)
      if (eid) return `${className}: ${eid}`
    }
  }

  // Try 'id' attribute by name
  const idAttr = eClass.getEStructuralFeature('id')
  if (idAttr) {
    const id = obj.eGet(idAttr)
    if (id) return `${className}: ${id}`
  }

  // Try first non-empty string attribute as fallback
  if (typeof eClass.getEAllAttributes === 'function') {
    for (const attr of eClass.getEAllAttributes()) {
      if (attr.isDerived?.() || attr.isTransient?.()) continue
      const val = obj.eGet(attr)
      if (typeof val === 'string' && val.length > 0) {
        return `${className}: ${val}`
      }
    }
  }

  // Fall back to class name only
  return className
}

/**
 * Generate a unique ID for an EObject
 */
let objectIdCounter = 0
const objectIdMap = new WeakMap<EObject, string>()

export function getObjectId(obj: EObject): string {
  // Always use toRaw to ensure consistent IDs regardless of Vue reactive proxies
  const rawObj = toRaw(obj)
  let id = objectIdMap.get(rawObj)
  if (!id) {
    id = `obj_${++objectIdCounter}`
    objectIdMap.set(rawObj, id)
  }
  return id
}
