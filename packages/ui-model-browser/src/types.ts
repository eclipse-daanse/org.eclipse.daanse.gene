/**
 * Model Browser Types
 *
 * Type definitions for the EPackage/EClass browser.
 */

import type { EPackage, EClass, EClassifier } from '@emfts/core'

/**
 * Represents a registered model package
 */
export interface ModelPackageInfo {
  /** Namespace URI of the package */
  nsURI: string
  /** Package name */
  name: string
  /** Namespace prefix */
  nsPrefix: string
  /** The EPackage instance */
  ePackage: EPackage
  /** Source file name (if loaded from file) */
  sourceFile?: string
  /** Whether the package is built-in (generated code) or loaded at runtime */
  isBuiltIn: boolean
}

/**
 * Represents an EClass in the tree view
 */
export interface ClassInfo {
  /** Fully qualified name */
  qualifiedName: string
  /** Class name */
  name: string
  /** Whether the class is abstract */
  isAbstract: boolean
  /** Whether the class is an interface */
  isInterface: boolean
  /** The EClass instance */
  eClass: EClass
  /** Parent package info */
  packageInfo: ModelPackageInfo
}

/**
 * Represents an EAttribute in the tree view
 */
export interface AttributeInfo {
  name: string
  typeName: string
  isMany: boolean
  isRequired: boolean
}

/**
 * Represents an EReference in the tree view
 */
export interface ReferenceInfo {
  name: string
  typeName: string
  isMany: boolean
  isRequired: boolean
  isContainment: boolean
}

/**
 * Represents an EEnum in the tree view
 */
export interface EnumInfo {
  name: string
  qualifiedName: string
  literals: string[]
  packageInfo: ModelPackageInfo
}

/**
 * Represents an OCL constraint in the tree view
 */
export interface ConstraintInfo {
  name: string
  expression: string
  contextClass: string
}

/**
 * Tree node for PrimeVue Tree component
 */
export interface ModelTreeNode {
  key: string
  label: string
  icon: string
  data: ModelPackageInfo | ClassInfo | EnumInfo | AttributeInfo | ReferenceInfo | ConstraintInfo
  children?: ModelTreeNode[]
  leaf: boolean
  selectable: boolean
  draggable?: boolean
  /** Type discriminator */
  type: 'package' | 'subpackage' | 'class' | 'enum' | 'attribute' | 'reference' | 'constraint'
}

/**
 * Icon mapping for model elements
 */
export const MODEL_ICONS = {
  package: 'pi pi-box',
  class: 'pi pi-file',
  abstractClass: 'pi pi-file-o',
  interface: 'pi pi-share-alt',
  enum: 'pi pi-hashtag'
} as const

/**
 * Get icon for a classifier
 */
export function getClassifierIcon(classifier: EClassifier): string {
  if (!isEClass(classifier)) {
    return 'pi pi-question'
  }

  const eClass = classifier as EClass
  if (eClass.isInterface()) {
    return MODEL_ICONS.interface
  }
  if (eClass.isAbstract()) {
    return MODEL_ICONS.abstractClass
  }
  return MODEL_ICONS.class
}

/**
 * Type guard for EClass
 */
function isEClass(classifier: EClassifier): classifier is EClass {
  return 'isAbstract' in classifier && 'isInterface' in classifier
}

// Module-level icon registry reference (set by activate)
let _iconRegistry: { getIconForClass: (eClass: EClass) => string } | null = null

/**
 * Set the icon registry reference (called from module activate)
 */
export function setIconRegistry(registry: any): void {
  _iconRegistry = registry
}

/**
 * Get icon for a class via the icon registry if available
 * Returns null if no custom mapping exists or registry not available
 */
export function getIconForClassViaRegistry(eClass: EClass): string | null {
  if (_iconRegistry?.getIconForClass) {
    const icon = _iconRegistry.getIconForClass(eClass)
    // Only return if it's not the default fallback
    if (icon && icon !== 'pi pi-circle') {
      return icon
    }
  }
  return null
}

