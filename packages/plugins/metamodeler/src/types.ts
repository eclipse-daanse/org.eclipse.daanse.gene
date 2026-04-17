/**
 * Metamodeler Types
 *
 * Type definitions for the Ecore Metamodel Editor.
 */

import type { EPackage, EClass, EAttribute, EReference, EDataType, ENamedElement, EAnnotation } from '@emfts/core'

/**
 * Metamodeler state
 */
export interface MetamodelerState {
  /** Root package being edited */
  rootPackage: EPackage | null
  /** Currently selected element */
  selectedElement: ENamedElement | null
  /** Whether the model has unsaved changes */
  dirty: boolean
  /** File path of the loaded .ecore file */
  filePath: string | null
}

/**
 * Tree node types for the metamodel tree
 */
export type MetaTreeNodeType = 'package' | 'class' | 'attribute' | 'reference' | 'constraint' | 'datatype' | 'literal' | 'operation'

/**
 * Tree node for PrimeVue Tree component
 * Note: label is optional to be compatible with PrimeVue's TreeNode
 */
export interface MetaTreeNode {
  key: string
  label?: string
  icon?: string
  type: MetaTreeNodeType
  data: ENamedElement | EAnnotation | OclConstraintInfo
  children?: MetaTreeNode[]
  leaf?: boolean
  selectable?: boolean
  draggable?: boolean
}

/**
 * OCL Constraint info extracted from EAnnotation
 */
export interface OclConstraintInfo {
  /** Constraint name */
  name: string
  /** OCL expression */
  expression: string
  /** Context class name */
  contextClassName: string
  /** Source annotation */
  annotation: EAnnotation
}

/**
 * EClass info for display
 */
export interface EClassInfo {
  eClass: EClass
  name: string
  isAbstract: boolean
  isInterface: boolean
  superTypes: string[]
  attributes: EAttributeInfo[]
  references: EReferenceInfo[]
  constraints: OclConstraintInfo[]
}

/**
 * EAttribute info for display
 */
export interface EAttributeInfo {
  eAttribute: EAttribute
  name: string
  typeName: string
  lowerBound: number
  upperBound: number
  isDerived: boolean
  derivationExpression?: string
}

/**
 * EReference info for display
 */
export interface EReferenceInfo {
  eReference: EReference
  name: string
  typeName: string
  lowerBound: number
  upperBound: number
  isContainment: boolean
  oppositeName?: string
}

/**
 * Icon mapping for metamodel elements
 */
export const META_ICONS = {
  package: 'pi pi-box',
  class: 'pi pi-file',
  abstractClass: 'pi pi-file-o',
  interface: 'pi pi-share-alt',
  attribute: 'pi pi-minus',
  reference: 'pi pi-arrow-right',
  containment: 'pi pi-inbox',
  constraint: 'pi pi-check-circle',
  datatype: 'pi pi-hashtag',
  literal: 'pi pi-list',
  operation: 'pi pi-bolt'
} as const

/**
 * OCL annotation source URIs
 */
export const OCL_ANNOTATION_SOURCES = {
  EMF_OCL: 'http://www.eclipse.org/emf/2002/Ecore/OCL',
  OCL_PIVOT: 'http://www.eclipse.org/OCL/Pivot'
} as const

/**
 * Get the appropriate icon for a classifier
 */
export function getClassifierIcon(eClass: EClass): string {
  if (eClass.isInterface()) {
    return META_ICONS.interface
  }
  if (eClass.isAbstract()) {
    return META_ICONS.abstractClass
  }
  return META_ICONS.class
}
