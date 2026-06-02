/**
 * Instance Tree Types
 *
 * Type definitions for the EMF instance tree editor.
 */

import { toRaw } from 'tsm:vue'
import type { EObject, EClass, EReference, Resource } from '@emfts/core'
import { getIconForClass } from './services/iconRegistry'
import { resolveCustomIconDataUrl } from './services/iconProviderRegistry'

/**
 * Represents a node in the instance tree
 */
export interface InstanceTreeNode {
  /** Unique key for the node */
  key: string
  /** Display label */
  label: string
  /** Icon class — always empty to prevent PrimeVue double-rendering */
  icon: string
  /** CSS class for regular icons (rendered in slot) */
  iconClass?: string
  /** DataURL for custom icons (rendered as img in slot) */
  iconDataUrl?: string
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
  /** XMI ID (for tooltip) */
  xmiId?: string | null
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
 * Get icon info for an EObject, including dataUrl for custom icons.
 * Returns { icon, iconDataUrl } where iconDataUrl is set for custom icons
 * and icon is cleared (empty) so PrimeVue Tree won't render a broken span.
 */
export function getObjectIconInfo(obj: EObject): { icon: string; iconClass?: string; iconDataUrl?: string } {
  const cssClass = getObjectIcon(obj)
  const dataUrl = resolveCustomIconDataUrl(cssClass)
  if (dataUrl) {
    return { icon: '', iconDataUrl: dataUrl }
  }
  return { icon: '', iconClass: cssClass }
}

/**
 * Get the class name from an EClass, handling both native and DynamicEObject
 */
export function getClassName(eClass: EClass): string {
  // Try native getName
  if (typeof eClass.getName === 'function') {
    const name = eClass.getName()
    if (name) return name
  }
  // DynamicEObject - try eGet for 'name' feature
  try {
    const metaClass = (eClass as any).eClass?.()
    if (metaClass) {
      const nameFeature = metaClass.getEStructuralFeature?.('name')
      if (nameFeature) {
        const name = (eClass as any).eGet?.(nameFeature)
        if (name) return String(name)
      }
    }
  } catch { /* ignore */ }
  // Try eSettings Map (EMFTs internal storage)
  try {
    if ((eClass as any).eSettings instanceof Map) {
      const name = (eClass as any).eSettings.get('name')
      if (name) return String(name)
    }
  } catch { /* ignore */ }
  return 'Object'
}

/**
 * Get display label for an EObject
 */
export function getObjectLabel(obj: EObject): string {
  const eClass = obj.eClass()
  const className = getClassName(eClass)

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
      if (eid) return `${className} [${eid}]`
    }
  }

  // Try 'id' attribute by name
  const idAttr = eClass.getEStructuralFeature('id')
  if (idAttr) {
    const id = obj.eGet(idAttr)
    if (id) return `${className} [${id}]`
  }

  // Try XMI ID as fallback
  try {
    const resource = obj.eResource?.()
    if (resource && typeof (resource as any).getID === 'function') {
      const xmiId = (resource as any).getID(obj)
      if (xmiId) return `${className} [${xmiId}]`
    }
  } catch { /* ignore */ }

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

  // Fall back to class name with sibling index
  try {
    const container = obj.eContainer?.()
    const feature = obj.eContainingFeature?.()
    if (container && feature && (feature as any).isMany?.()) {
      const siblings = container.eGet(feature)
      if (siblings && typeof siblings.indexOf === 'function') {
        const idx = siblings.indexOf(obj)
        if (idx >= 0) return `${className} #${idx + 1}`
      }
    }
  } catch { /* ignore */ }

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
