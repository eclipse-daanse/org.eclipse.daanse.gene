/**
 * Instance Builder Type Definitions
 */

import type { EObject, EClass, EStructuralFeature, EAttribute, EReference, EDataType, EEnum } from '@emfts/core'

/**
 * Editor mode
 */
export type EditorMode = 'create' | 'edit'

/**
 * Props for InstanceEditor component
 */
export interface InstanceEditorProps {
  /** EObject to edit (for edit mode) */
  eObject?: EObject
  /** EClass to create instance of (for create mode) */
  eClass?: EClass
  /** Whether this is a new instance */
  isNew?: boolean
  /** Callback when instance is saved */
  onSave?: (eObject: EObject) => void
  /** Callback when editor is closed */
  onClose?: () => void
}

/**
 * Props for PropertyField component
 */
export interface PropertyFieldProps {
  /** The structural feature to render */
  feature: EStructuralFeature
  /** The EObject containing the value */
  eObject: EObject
  /** Whether the field is read-only */
  readonly?: boolean
}

/**
 * Props for AttributeField component
 */
export interface AttributeFieldProps {
  /** The attribute feature */
  feature: EAttribute
  /** The EObject containing the value */
  eObject: EObject
  /** Whether the field is read-only */
  readonly?: boolean
}

/**
 * Props for ReferenceField component
 */
export interface ReferenceFieldProps {
  /** The reference feature */
  feature: EReference
  /** The EObject containing the value */
  eObject: EObject
  /** Whether the field is read-only */
  readonly?: boolean
  /** Callback to create a new referenced object */
  onCreate?: (eClass: EClass) => void
  /** Callback to select an existing object */
  onSelect?: (eObject: EObject) => void
}

/**
 * Props for EnumField component
 */
export interface EnumFieldProps {
  /** The attribute feature with enum type */
  feature: EAttribute
  /** The EObject containing the value */
  eObject: EObject
  /** Whether the field is read-only */
  readonly?: boolean
}

/**
 * Props for ClassSelector component
 */
export interface ClassSelectorProps {
  /** Available classes to select from */
  classes: EClass[]
  /** Selected class */
  modelValue?: EClass
  /** Label text */
  label?: string
  /** Placeholder text */
  placeholder?: string
}

/**
 * Feature classification result
 */
export interface FeatureInfo {
  feature: EStructuralFeature
  isAttribute: boolean
  isReference: boolean
  isMany: boolean
  isRequired: boolean
  isContainment: boolean
  isOpposite: boolean
  isDerived: boolean
  isTransient: boolean
}

/**
 * Editor state for tracking dirty status
 */
export interface EditorState {
  /** The EObject being edited */
  eObject: EObject | null
  /** Original values (for reset) */
  originalValues: Map<string, any>
  /** Whether the editor has unsaved changes */
  isDirty: boolean
  /** Validation errors by feature name */
  errors: Map<string, string>
}

/**
 * Instance editor service interface
 */
export interface InstanceEditorService {
  /** Open an editor for an existing EObject */
  openEditor(eObject: EObject): void
  /** Open an editor to create a new instance */
  openNewEditor(eClass: EClass): void
  /** Get all concrete (non-abstract) classes from a package */
  getConcreteClasses(): EClass[]
}

/**
 * Feature type constants
 */
export const FeatureTypes = {
  STRING: 'EString',
  INT: 'EInt',
  INTEGER: 'EInteger',
  LONG: 'ELong',
  FLOAT: 'EFloat',
  DOUBLE: 'EDouble',
  BOOLEAN: 'EBoolean',
  DATE: 'EDate',
  BYTE_ARRAY: 'EByteArray'
} as const

/**
 * Check if a feature is an EAttribute
 */
export function isEAttribute(feature: EStructuralFeature): feature is EAttribute {
  return 'eAttributeType' in feature || !('eReferenceType' in feature || 'isContainment' in feature)
}

/**
 * Check if a feature is an EReference
 */
export function isEReference(feature: EStructuralFeature): feature is EReference {
  return 'isContainment' in feature || 'eReferenceType' in feature
}

/**
 * Check if a feature is many-valued
 */
export function isMany(feature: EStructuralFeature): boolean {
  return feature.getUpperBound() === -1 || feature.getUpperBound() > 1
}

/**
 * Check if a feature is required
 */
export function isRequired(feature: EStructuralFeature): boolean {
  return feature.getLowerBound() > 0
}

/**
 * Analyze a structural feature
 */
export function analyzeFeature(feature: EStructuralFeature): FeatureInfo {
  const isRef = isEReference(feature)
  const ref = isRef ? feature as EReference : null

  return {
    feature,
    isAttribute: !isRef,
    isReference: isRef,
    isMany: isMany(feature),
    isRequired: isRequired(feature),
    isContainment: ref?.isContainment() ?? false,
    isOpposite: ref?.getEOpposite() != null,
    isDerived: feature.isDerived(),
    isTransient: feature.isTransient()
  }
}
