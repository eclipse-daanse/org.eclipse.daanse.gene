<script setup lang="ts">
/**
 * PropertyField Component
 *
 * Dynamically renders the appropriate field component
 * based on the structural feature type.
 */

import { computed } from 'tsm:vue'
import type { EObject, EStructuralFeature, EAttribute, EReference, EClass, EClassifier, EPackage } from '@emfts/core'
import AttributeField from './AttributeField.vue'
import ReferenceField from './ReferenceField.vue'
import ETypeField from './ETypeField.vue'
import EClassField from './EClassField.vue'
import EOppositeField from './EOppositeField.vue'
import DerivedField from './DerivedField.vue'
import { analyzeFeature } from '../types'
import { usePropertyRegistry } from '../composables/usePropertyRegistry'

const props = defineProps<{
  feature: EStructuralFeature
  eObject: EObject
  value: any
  readonly?: boolean
  error?: string
  /** Available objects for reference selection */
  availableObjects?: EObject[]
  /** Available concrete classes for containment references */
  validChildClasses?: EClass[]
  /** Root package for metamodel mode (user's classes) */
  rootPackage?: EPackage | null
  /** Problems service for OCL evaluation of derived features */
  problemsService?: {
    evaluateDerived: (obj: EObject, featureName: string) => Promise<unknown>
    hasDerivedExpression: (eClass: any, featureName: string) => Promise<boolean>
    query: (obj: EObject, expression: string) => Promise<unknown>
  }
  /** OCL referenceFilter expression for references */
  oclFilter?: string
}>()

const emit = defineEmits<{
  'update:value': [value: any]
  'create': [eClass: EClass]
  'select': [eObject: EObject]
  'navigate': [eObject: EObject]
  'search': [feature: EReference, callback: (obj: EObject) => void]
  'ocl-blocked': [object: EObject, reason: string]
}>()

// Analyze the feature
const featureInfo = computed(() => analyzeFeature(props.feature))

// Check if this is an EType feature for EAttribute (shows EDataTypes)
const isEAttributeTypeFeature = computed(() => {
  const featureName = props.feature.getName()
  if (featureName !== 'eType' && featureName !== 'eAttributeType') {
    return false
  }
  // Only use ETypeField when parent is an EAttribute (not EReference)
  // EAttribute has getEAttributeType, EReference has getEReferenceType
  const eObj = props.eObject
  return eObj && typeof (eObj as any).getEAttributeType === 'function'
})

// Check if this is an EType feature for EReference (shows EClasses)
const isEReferenceTypeFeature = computed(() => {
  const featureName = props.feature.getName()
  if (featureName !== 'eType' && featureName !== 'eReferenceType') {
    return false
  }
  // Only use EClassField when parent is an EReference (not EAttribute)
  // EReference has getEReferenceType
  const eObj = props.eObject
  return eObj && typeof (eObj as any).getEReferenceType === 'function'
})

// Check if this is an eOpposite feature (for EReference)
const isEOppositeFeature = computed(() => {
  const featureName = props.feature.getName()
  if (featureName !== 'eOpposite') {
    return false
  }
  // Only for EReference objects
  const eObj = props.eObject
  return eObj && typeof (eObj as any).getEReferenceType === 'function'
})

// Registry lookup for custom editors
const { getCustomEditor } = usePropertyRegistry()
const customEditor = computed(() => getCustomEditor(props.feature, props.eObject))

// Pass through events
function onUpdate(value: any) {
  emit('update:value', value)
}

function onCreate(eClass: EClass) {
  emit('create', eClass)
}

function onSelect(eObject: EObject) {
  emit('select', eObject)
}

function onNavigate(eObject: EObject) {
  emit('navigate', eObject)
}

function onSearch(feature: EReference, callback: (obj: EObject) => void) {
  emit('search', feature, callback)
}

function onOclBlocked(object: EObject, reason: string) {
  emit('ocl-blocked', object, reason)
}
</script>

<template>
  <!-- Custom editor from registry (highest priority) -->
  <component
    v-if="customEditor"
    :is="customEditor"
    :feature="feature"
    :eObject="eObject"
    :value="value"
    :readonly="readonly"
    :error="error"
    @update:value="onUpdate"
    @navigate="onNavigate"
  />

  <!-- Built-in editors (fallback) -->
  <template v-else>
    <!-- Derived features (read-only, OCL computed) -->
    <DerivedField
      v-if="featureInfo.isDerived && !featureInfo.isTransient"
      :feature="feature"
      :eObject="eObject"
      :problemsService="problemsService"
      @navigate="onNavigate"
    />

    <!-- Skip transient features, show regular features -->
    <template v-else-if="!featureInfo.isTransient">
      <!-- Attribute field -->
      <AttributeField
        v-if="featureInfo.isAttribute"
        :feature="feature as EAttribute"
        :value="value"
        @update:value="onUpdate"
        :readonly="readonly"
        :error="error"
      />

      <!-- EType field for EDataType selection (only for EAttribute.eType) -->
      <ETypeField
        v-else-if="featureInfo.isReference && isEAttributeTypeFeature"
        :feature="feature as EReference"
        :value="value as EClassifier | null"
        @update:value="onUpdate"
        :readonly="readonly"
        :error="error"
      />

      <!-- EClass field for EClass selection (only for EReference.eType) -->
      <EClassField
        v-else-if="featureInfo.isReference && isEReferenceTypeFeature"
        :feature="feature as EReference"
        :value="value as EClass | null"
        :eObject="eObject"
        :rootPackage="rootPackage"
        @update:value="onUpdate"
        :readonly="readonly"
        :error="error"
      />

      <!-- EOpposite field for selecting opposite reference -->
      <EOppositeField
        v-else-if="featureInfo.isReference && isEOppositeFeature"
        :feature="feature as EReference"
        :value="value as EReference | null"
        :eObject="eObject"
        @update:value="onUpdate"
        :readonly="readonly"
        :error="error"
      />

      <!-- Reference field -->
      <ReferenceField
        v-else-if="featureInfo.isReference"
        :feature="feature as EReference"
        :value="value"
        @update:value="onUpdate"
        @create="onCreate"
        @select="onSelect"
        @navigate="onNavigate"
        @search="onSearch"
        @ocl-blocked="onOclBlocked"
        :readonly="readonly"
        :error="error"
        :availableObjects="availableObjects"
        :validChildClasses="validChildClasses"
        :oclFilter="oclFilter"
        :sourceObject="eObject"
        :problemsService="problemsService"
      />
    </template>
  </template>
</template>
