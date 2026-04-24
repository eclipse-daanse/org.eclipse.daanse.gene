<script setup lang="ts">
/**
 * OperationParameterDialog Component
 *
 * Modal dialog for entering operation parameters before execution.
 * Supports:
 * - Primitive types (String, Number, Boolean)
 * - Enumeration types (dropdown)
 * - Reference types (object selector)
 */

import { ref, computed, watch } from 'tsm:vue'
import { Dialog } from 'tsm:primevue'
import { Button } from 'tsm:primevue'
import { InputText } from 'tsm:primevue'
import { InputNumber } from 'tsm:primevue'
import { Checkbox } from 'tsm:primevue'
import { Select } from 'tsm:primevue'
import type { EObject, EOperation, EParameter, EDataType, EEnum, EClass } from '@emfts/core'

const props = defineProps<{
  visible: boolean
  operation: EOperation | null
  eObject: EObject | null
  /** Available objects for reference parameter selection */
  availableObjects?: EObject[]
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  'execute': [params: Record<string, unknown>]
  'cancel': []
}>()

// Parameter values
const parameterValues = ref<Record<string, unknown>>({})

// Helper to get name from an ENamedElement (handles DynamicEObjects)
function getElementName(element: any): string {
  if (!element) return 'unnamed'

  // Try direct method first
  let name = element.getName?.()
  if (name) return name

  // Try eGet for DynamicEObject
  const eClass = element.eClass?.()
  if (eClass) {
    const nameFeature = eClass.getEStructuralFeature?.('name')
    if (nameFeature) {
      name = element.eGet?.(nameFeature)
      if (name) return name
    }
  }

  // Try eSettings
  if (element.eSettings instanceof Map) {
    name = element.eSettings.get('name')
    if (name) return name
  }

  return 'unnamed'
}

// Helper to get EType from an ETypedElement (handles DynamicEObjects)
function getElementType(element: any): any {
  if (!element) return null

  // Try direct method first
  let eType = element.getEType?.()
  if (eType) return eType

  // Try eGet for DynamicEObject
  const eClass = element.eClass?.()
  if (eClass) {
    const typeFeature = eClass.getEStructuralFeature?.('eType')
    if (typeFeature) {
      eType = element.eGet?.(typeFeature)
      if (eType) return eType
    }
  }

  return null
}

// Helper to get lowerBound from an ETypedElement (handles DynamicEObjects)
function getElementLowerBound(element: any): number {
  if (!element) return 0

  // Try direct method first
  let lowerBound = element.getLowerBound?.()
  if (typeof lowerBound === 'number') return lowerBound

  // Try eGet for DynamicEObject
  const eClass = element.eClass?.()
  if (eClass) {
    const lowerBoundFeature = eClass.getEStructuralFeature?.('lowerBound')
    if (lowerBoundFeature) {
      lowerBound = element.eGet?.(lowerBoundFeature)
      if (typeof lowerBound === 'number') return lowerBound
    }
  }

  // Try eSettings
  if (element.eSettings instanceof Map) {
    lowerBound = element.eSettings.get('lowerBound')
    if (typeof lowerBound === 'number') return lowerBound
  }

  return 0
}

// Helper to get parameters from an EOperation (handles DynamicEObjects)
function getOperationParameters(op: any): any[] {
  if (!op) return []

  // Try direct method first
  let params = op.getEParameters?.()
  if (params && (Array.isArray(params) || params.data)) {
    return params.data ?? params ?? []
  }

  // Try eGet for DynamicEObject
  const eClass = op.eClass?.()
  if (eClass) {
    const paramsFeature = eClass.getEStructuralFeature?.('eParameters')
    if (paramsFeature) {
      params = op.eGet?.(paramsFeature)
      if (params) {
        return params.data ?? params ?? []
      }
    }
  }

  return []
}

// Helper to get annotations from an EModelElement (handles DynamicEObjects)
function getElementAnnotations(element: any): any[] {
  if (!element) return []

  // Try direct method first
  let annotations = element.getEAnnotations?.()
  if (annotations && (Array.isArray(annotations) || annotations.data)) {
    return annotations.data ?? annotations ?? []
  }

  // Try eGet for DynamicEObject
  const eClass = element.eClass?.()
  if (eClass) {
    const annotationsFeature = eClass.getEStructuralFeature?.('eAnnotations')
    if (annotationsFeature) {
      annotations = element.eGet?.(annotationsFeature)
      if (annotations) {
        return annotations.data ?? annotations ?? []
      }
    }
  }

  return []
}

// Helper to get enum literals from an EEnum (handles DynamicEObjects)
function getEnumLiterals(eEnum: any): any[] {
  if (!eEnum) return []

  // Try direct method first
  let literals = eEnum.getELiterals?.()
  if (literals && (Array.isArray(literals) || literals.data)) {
    return literals.data ?? literals ?? []
  }

  // Try eGet for DynamicEObject
  const eClass = eEnum.eClass?.()
  if (eClass) {
    const literalsFeature = eClass.getEStructuralFeature?.('eLiterals')
    if (literalsFeature) {
      literals = eEnum.eGet?.(literalsFeature)
      if (literals) {
        return literals.data ?? literals ?? []
      }
    }
  }

  return []
}

// Get parameters from operation
const parameters = computed<EParameter[]>(() => {
  return getOperationParameters(props.operation)
})

// Operation name for title
const operationName = computed(() => {
  return getElementName(props.operation) || 'Operation'
})

// Initialize parameter values when dialog opens
watch(() => props.visible, (visible) => {
  if (visible && props.operation) {
    parameterValues.value = {}
    for (const param of parameters.value) {
      const name = getElementName(param)
      const defaultValue = getDefaultValue(param)
      parameterValues.value[name] = defaultValue
    }
  }
})

// Get default value for a parameter based on its type
function getDefaultValue(param: EParameter): unknown {
  const eType = getElementType(param)
  if (!eType) return null

  const typeName = getElementName(eType)

  switch (typeName) {
    case 'EString':
      return ''
    case 'EInt':
    case 'EInteger':
    case 'ELong':
    case 'EFloat':
    case 'EDouble':
      return 0
    case 'EBoolean':
      return false
    default:
      // Check if enum
      if (isEnumType(eType)) {
        const enumLiterals = getEnumLiterals(eType)
        if (enumLiterals && enumLiterals.length > 0) {
          return enumLiterals[0]
        }
      }
      return null
  }
}

// Check if type is an EEnum
function isEnumType(eType: any): boolean {
  return eType && typeof eType.getELiterals === 'function'
}

// Check if type is a reference type (EClass)
function isReferenceType(eType: any): boolean {
  return eType && typeof eType.getEAllStructuralFeatures === 'function'
}

// Get parameter type info
function getParameterTypeInfo(param: EParameter) {
  const eType = getElementType(param)
  if (!eType) return { type: 'unknown', name: '?' }

  const typeName = getElementName(eType)

  // Numeric types
  if (['EInt', 'EInteger', 'ELong'].includes(typeName)) {
    return { type: 'integer', name: typeName }
  }
  if (['EFloat', 'EDouble'].includes(typeName)) {
    return { type: 'decimal', name: typeName }
  }
  if (typeName === 'EBoolean') {
    return { type: 'boolean', name: typeName }
  }
  if (typeName === 'EString') {
    return { type: 'string', name: typeName }
  }

  // Enum type
  if (isEnumType(eType)) {
    return {
      type: 'enum',
      name: typeName,
      literals: getEnumLiterals(eType)
    }
  }

  // Reference type (EClass)
  if (isReferenceType(eType)) {
    return {
      type: 'reference',
      name: typeName,
      eClass: eType as EClass
    }
  }

  return { type: 'unknown', name: typeName }
}

// Get available objects for a reference parameter
function getAvailableObjectsForType(eClass: EClass): EObject[] {
  if (!props.availableObjects) return []

  return props.availableObjects.filter(obj => {
    try {
      const objClass = obj.eClass()
      // Check if object is of the required type or a subtype
      if (objClass === eClass) return true
      if (objClass.getName() === eClass.getName()) return true

      // Check supertypes
      const superTypes = objClass.getEAllSuperTypes?.() || []
      for (const superType of superTypes) {
        if (superType === eClass || superType.getName() === eClass.getName()) {
          return true
        }
      }
      return false
    } catch {
      return false
    }
  })
}

// Get label for an EObject
function getObjectLabel(obj: EObject): string {
  try {
    const eClass = obj.eClass()
    const className = eClass.getName()
    const nameFeature = eClass.getEStructuralFeature('name')
    if (nameFeature) {
      const name = obj.eGet(nameFeature)
      if (name) return `${name} (${className})`
    }
    return `[${className}]`
  } catch {
    return '[Object]'
  }
}

// Get documentation for a parameter
function getParameterDocumentation(param: EParameter): string | null {
  try {
    const annotations = getElementAnnotations(param)
    for (const annotation of annotations) {
      // Get source using eGet (for DynamicEObject)
      const annClass = annotation.eClass?.()
      let source: string | undefined

      if (annClass) {
        const sourceFeature = annClass.getEStructuralFeature?.('source')
        if (sourceFeature) {
          source = annotation.eGet?.(sourceFeature) as string
        }
      }

      // Try eSettings
      if (!source && annotation.eSettings instanceof Map) {
        source = annotation.eSettings.get('source')
      }

      if (!source) {
        source = annotation.getSource?.() ?? (annotation as any).source
      }

      if (source === 'http://www.eclipse.org/emf/2002/GenModel') {
        // Get details
        let details: any = null
        if (annClass) {
          const detailsFeature = annClass.getEStructuralFeature?.('details')
          if (detailsFeature) {
            details = annotation.eGet?.(detailsFeature)
          }
        }

        if (!details) {
          details = annotation.getDetails?.() ?? (annotation as any).details
        }

        if (details) {
          // Try to get documentation from details
          if (details.get) {
            return details.get('documentation') || null
          }
          // Try entries structure
          const entries = details.data ?? details
          if (Array.isArray(entries)) {
            for (const entry of entries) {
              const eSettings = entry?.eSettings
              if (eSettings instanceof Map) {
                const key = eSettings.get('key')
                const value = eSettings.get('value')
                if (key === 'documentation') {
                  return value
                }
              }
            }
          }
        }
      }
    }
  } catch {
    // Ignore
  }
  return null
}

// Validation
const isValid = computed(() => {
  for (const param of parameters.value) {
    const name = getElementName(param)
    const value = parameterValues.value[name]
    const isRequired = getElementLowerBound(param) > 0

    if (isRequired && (value === null || value === undefined || value === '')) {
      return false
    }
  }
  return true
})

// Handle execute
function handleExecute() {
  if (!isValid.value) return
  emit('execute', { ...parameterValues.value })
  emit('update:visible', false)
}

// Handle cancel
function handleCancel() {
  emit('cancel')
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="$emit('update:visible', $event)"
    :header="`Execute: ${operationName}`"
    :modal="true"
    :closable="true"
    :style="{ width: '450px' }"
  >
    <div class="parameter-form">
      <div v-if="parameters.length === 0" class="no-params">
        This operation has no parameters.
      </div>

      <div
        v-for="param in parameters"
        :key="getElementName(param)"
        class="parameter-field"
      >
        <label class="parameter-label">
          {{ getElementName(param) }}
          <span v-if="getElementLowerBound(param) > 0" class="required-marker">*</span>
        </label>

        <small v-if="getParameterDocumentation(param)" class="parameter-doc">
          {{ getParameterDocumentation(param) }}
        </small>

        <!-- String input -->
        <InputText
          v-if="getParameterTypeInfo(param).type === 'string'"
          v-model="parameterValues[getElementName(param)]"
          class="w-full"
          :placeholder="`Enter ${getElementName(param)}...`"
        />

        <!-- Integer input -->
        <InputNumber
          v-else-if="getParameterTypeInfo(param).type === 'integer'"
          v-model="parameterValues[getElementName(param)]"
          class="w-full"
          :useGrouping="false"
        />

        <!-- Decimal input -->
        <InputNumber
          v-else-if="getParameterTypeInfo(param).type === 'decimal'"
          v-model="parameterValues[getElementName(param)]"
          class="w-full"
          :minFractionDigits="1"
          :maxFractionDigits="6"
        />

        <!-- Boolean input -->
        <div v-else-if="getParameterTypeInfo(param).type === 'boolean'" class="boolean-field">
          <Checkbox
            v-model="parameterValues[getElementName(param)]"
            :inputId="getElementName(param)"
            :binary="true"
          />
          <label :for="getElementName(param)">{{ getElementName(param) }}</label>
        </div>

        <!-- Enum dropdown -->
        <Select
          v-else-if="getParameterTypeInfo(param).type === 'enum'"
          v-model="parameterValues[getElementName(param)]"
          :options="getParameterTypeInfo(param).literals"
          optionLabel="name"
          class="w-full"
          :placeholder="`Select ${getElementName(param)}...`"
        />

        <!-- Reference selector -->
        <Select
          v-else-if="getParameterTypeInfo(param).type === 'reference'"
          v-model="parameterValues[getElementName(param)]"
          :options="getAvailableObjectsForType(getParameterTypeInfo(param).eClass)"
          :optionLabel="getObjectLabel"
          class="w-full"
          :placeholder="`Select ${getParameterTypeInfo(param).name}...`"
          :filter="true"
        />

        <!-- Unknown type - show as text -->
        <InputText
          v-else
          v-model="parameterValues[getElementName(param)]"
          class="w-full"
          :placeholder="`Enter ${getElementName(param)}...`"
        />

        <small class="parameter-type">
          Type: {{ getParameterTypeInfo(param).name }}
        </small>
      </div>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        icon="pi pi-times"
        severity="secondary"
        @click="handleCancel"
      />
      <Button
        label="Execute"
        icon="pi pi-play"
        :disabled="!isValid"
        @click="handleExecute"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.parameter-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.no-params {
  color: var(--text-color-secondary);
  font-style: italic;
  text-align: center;
  padding: 1rem;
}

.parameter-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.parameter-label {
  font-weight: 500;
  color: var(--text-color);
}

.required-marker {
  color: var(--red-500);
}

.parameter-doc {
  color: var(--text-color-secondary);
  font-style: italic;
  margin-bottom: 0.25rem;
}

.parameter-type {
  color: var(--text-color-secondary);
  font-family: monospace;
  font-size: 0.75rem;
}

.boolean-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
}

.w-full {
  width: 100%;
}
</style>
