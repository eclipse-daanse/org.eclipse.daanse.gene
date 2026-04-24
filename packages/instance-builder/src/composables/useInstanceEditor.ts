/**
 * Instance Editor State Management
 *
 * Composable for managing the state of an instance editor.
 * Supports derived attributes with OCL expressions.
 */

import { ref, computed, type Ref } from 'tsm:vue'
import type { EObject, EClass, EStructuralFeature } from '@emfts/core'
import { analyzeFeature, isEAttribute, isEReference } from '../types'

// Optional Problems service import (lazy loaded to avoid circular dependencies)
let problemsServiceModule: any = null
async function getProblemsService() {
  if (!problemsServiceModule) {
    try {
      problemsServiceModule = await import('ui-problems-panel')
    } catch {
      // Problems module not available
      problemsServiceModule = { useSharedProblemsService: () => null }
    }
  }
  return problemsServiceModule.useSharedProblemsService?.()
}

export interface UseInstanceEditorOptions {
  /** EObject to edit */
  eObject?: EObject
  /** EClass for creating new instances */
  eClass?: EClass
  /** Whether this is a new instance */
  isNew?: boolean
  /** Include Ecore base features (for metamodel editing) */
  includeEcoreFeatures?: boolean
}

export interface UseInstanceEditorReturn {
  /** The EClass of the object being edited */
  eClass: Ref<EClass | null>
  /** All structural features of the class */
  features: Ref<EStructuralFeature[]>
  /** Attribute features only (non-derived) */
  attributes: Ref<EStructuralFeature[]>
  /** Derived attribute features (computed via OCL) */
  derivedAttributes: Ref<EStructuralFeature[]>
  /** Reference features only */
  references: Ref<EStructuralFeature[]>
  /** Derived reference features (computed via OCL) */
  derivedReferences: Ref<EStructuralFeature[]>
  /** Current values map */
  values: Ref<Map<string, any>>
  /** Whether the editor has unsaved changes */
  isDirty: Ref<boolean>
  /** Validation errors */
  errors: Ref<Map<string, string>>
  /** Get value for a feature */
  getValue: (feature: EStructuralFeature) => any
  /** Get derived value for a feature (evaluated via OCL if available) */
  getDerivedValue: (feature: EStructuralFeature) => any
  /** Set value for a feature */
  setValue: (feature: EStructuralFeature, value: any) => void
  /** Reset to original values */
  reset: () => void
  /** Validate all fields */
  validate: () => boolean
  /** Save changes */
  save: () => void
}

/**
 * Composable for managing instance editor state
 */
export function useInstanceEditor(options: UseInstanceEditorOptions): UseInstanceEditorReturn {
  const { eObject, eClass: inputEClass, isNew = false, includeEcoreFeatures = false } = options

  // Determine EClass
  const eClass = ref<EClass | null>(eObject?.eClass() ?? inputEClass ?? null)

  // Track original values for dirty detection
  const originalValues = ref<Map<string, any>>(new Map())

  // Current values (reactive copy)
  const values = ref<Map<string, any>>(new Map())

  // Track dirty state
  const isDirty = ref(false)

  // Validation errors
  const errors = ref<Map<string, string>>(new Map())

  // Check if a feature belongs to the base Ecore package (should be excluded)
  function isEcoreBaseFeature(feature: EStructuralFeature): boolean {
    try {
      const containingClass = feature.getEContainingClass?.()
      if (!containingClass) return false
      const pkg = containingClass.getEPackage?.()
      if (!pkg) return false
      const nsURI = pkg.getNsURI?.()
      // Filter out features from the Ecore metamodel itself
      return nsURI === 'http://www.eclipse.org/emf/2002/Ecore'
    } catch {
      return false
    }
  }

  // Get all features (optionally excluding Ecore base features)
  const features = computed<EStructuralFeature[]>(() => {
    if (!eClass.value) return []
    const allFeatures = eClass.value.getEAllStructuralFeatures()
    return includeEcoreFeatures ? allFeatures : allFeatures.filter(f => !isEcoreBaseFeature(f))
  })

  // Get attribute features
  const attributes = computed<EStructuralFeature[]>(() => {
    return features.value.filter(f => {
      const info = analyzeFeature(f)
      return info.isAttribute && !info.isDerived && !info.isTransient
    })
  })

  // Get reference features
  const references = computed<EStructuralFeature[]>(() => {
    return features.value.filter(f => {
      const info = analyzeFeature(f)
      return info.isReference && !info.isDerived && !info.isTransient
    })
  })

  // Get derived attribute features (computed via OCL)
  // Note: Derived features are typically transient (not serialized), but we still show them
  const derivedAttributes = computed<EStructuralFeature[]>(() => {
    return features.value.filter(f => {
      const info = analyzeFeature(f)
      return info.isAttribute && info.isDerived
    })
  })

  // Get derived reference features (computed via OCL)
  // Note: Derived features are typically transient (not serialized), but we still show them
  const derivedReferences = computed<EStructuralFeature[]>(() => {
    return features.value.filter(f => {
      const info = analyzeFeature(f)
      return info.isReference && info.isDerived
    })
  })

  // Initialize values from EObject
  function initializeValues() {
    if (!eObject || !eClass.value) return

    originalValues.value.clear()
    values.value.clear()

    for (const feature of features.value) {
      const info = analyzeFeature(feature)
      if (info.isDerived || info.isTransient) continue

      try {
        let value = eObject.eGet(feature)
        // Make a copy of arrays for Vue reactivity
        if (info.isMany && value) {
          value = Array.isArray(value) ? [...value] : Array.from(value as Iterable<any>)
        }
        originalValues.value.set(feature.getName(), value)
        values.value.set(feature.getName(), value)
      } catch (e) {
        console.warn(`Failed to get value for feature ${feature.getName()}:`, e)
      }
    }
  }

  // Get value for a feature
  function getValue(feature: EStructuralFeature): any {
    const value = values.value.get(feature.getName())
    // Return a copy of arrays to ensure Vue reactivity
    const info = analyzeFeature(feature)
    if (info.isMany && value) {
      return Array.isArray(value) ? [...value] : Array.from(value as Iterable<any>)
    }
    return value
  }

  // Get derived value for a feature (evaluated via OCL if available)
  function getDerivedValue(feature: EStructuralFeature): any {
    if (!eObject) return undefined

    const info = analyzeFeature(feature)
    if (!info.isDerived) {
      // Not a derived feature, return regular value
      return getValue(feature)
    }

    // Try to evaluate via Problems service (which includes OCL)
    try {
      // Synchronous check - Problems service may be available
      if (problemsServiceModule) {
        const problemsService = problemsServiceModule.useSharedProblemsService?.()
        if (problemsService?.hasDerivedExpression(eClass.value!, feature.getName())) {
          return problemsService.evaluateDerived(eObject, feature.getName())
        }
      }
    } catch (e) {
      console.warn(`Failed to evaluate derived attribute ${feature.getName()} via OCL:`, e)
    }

    // Fallback: try to get value directly from the model (may have getter implementation)
    try {
      return eObject.eGet(feature)
    } catch {
      return undefined
    }
  }

  // Set value for a feature (immediately persists to the model)
  function setValue(feature: EStructuralFeature, value: any): void {
    values.value.set(feature.getName(), value)

    // Immediately persist to the EMF model
    if (eObject) {
      try {
        const info = analyzeFeature(feature)

        if (info.isMany) {
          // For multi-valued features, modify the existing EMF list
          const existingList = eObject.eGet(feature) as any

          if (existingList && typeof existingList.clear === 'function') {
            // EMF EList - clear and add all
            existingList.clear()
            if (Array.isArray(value)) {
              for (let i = 0; i < value.length; i++) {
                const item = value[i]
                existingList.add(item)
              }
            }
          } else if (existingList && typeof existingList.addAll === 'function') {
            // EMF EList with addAll
            existingList.clear()
            if (Array.isArray(value)) {
              existingList.addAll(value)
            }
          } else {
            // Fallback to eSet
            eObject.eSet(feature, value)
          }

        } else {
          // Single-valued feature - use eSet
          eObject.eSet(feature, value)
        }

        // Update original value since we auto-save
        originalValues.value.set(feature.getName(), value)
      } catch (e) {
        console.error(`Failed to set value for feature ${feature.getName()}:`, e)
      }
    }

    updateDirtyState()
    validateFeature(feature, value)
  }

  // Update dirty state
  function updateDirtyState(): void {
    if (isNew) {
      isDirty.value = values.value.size > 0
      return
    }

    for (const [name, value] of values.value) {
      const original = originalValues.value.get(name)
      if (value !== original) {
        isDirty.value = true
        return
      }
    }
    isDirty.value = false
  }

  // Validate a single feature
  function validateFeature(feature: EStructuralFeature, value: any): boolean {
    const info = analyzeFeature(feature)
    const name = feature.getName()

    // Clear previous error
    errors.value.delete(name)

    // Required check
    if (info.isRequired && (value === null || value === undefined || value === '')) {
      errors.value.set(name, `${name} is required`)
      return false
    }

    return true
  }

  // Validate all fields
  function validate(): boolean {
    errors.value.clear()
    let valid = true

    for (const feature of features.value) {
      const info = analyzeFeature(feature)
      if (info.isDerived || info.isTransient) continue

      const value = values.value.get(feature.getName())
      if (!validateFeature(feature, value)) {
        valid = false
      }
    }

    return valid
  }

  // Reset to original values
  function reset(): void {
    values.value = new Map(originalValues.value)
    errors.value.clear()
    isDirty.value = false
  }

  // Save changes to the EObject
  function save(): void {
    if (!eObject || !validate()) return

    for (const feature of features.value) {
      const info = analyzeFeature(feature)
      if (info.isDerived || info.isTransient) continue

      const value = values.value.get(feature.getName())
      try {
        eObject.eSet(feature, value)
      } catch (e) {
        console.error(`Failed to set value for feature ${feature.getName()}:`, e)
      }
    }

    // Update original values after save
    originalValues.value = new Map(values.value)
    isDirty.value = false
  }

  // Initialize on creation
  if (eObject) {
    initializeValues()
  }

  return {
    eClass,
    features,
    attributes,
    derivedAttributes,
    references,
    derivedReferences,
    values,
    isDirty,
    errors,
    getValue,
    getDerivedValue,
    setValue,
    reset,
    validate,
    save
  }
}
