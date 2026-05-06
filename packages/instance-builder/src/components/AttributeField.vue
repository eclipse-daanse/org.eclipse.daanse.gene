<script setup lang="ts">
/**
 * AttributeField Component
 *
 * Renders an input field based on the EAttribute data type.
 */

import { computed } from 'tsm:vue'
import { InputText } from 'tsm:primevue'
import { InputNumber } from 'tsm:primevue'
import { Checkbox } from 'tsm:primevue'
import { Calendar } from 'tsm:primevue'
import { Textarea } from 'tsm:primevue'
import type { EAttribute, EDataType } from '@emfts/core'
import EnumField from './EnumField.vue'

const props = defineProps<{
  feature: EAttribute
  value: any
  readonly?: boolean
  error?: string
}>()

const emit = defineEmits<{
  'update:value': [value: any]
}>()

// Get the data type name
const dataTypeName = computed(() => {
  const eType = props.feature.getEType()
  // Handle different EType representations
  if (!eType) return 'EString'
  if (typeof eType === 'string') return eType
  if (typeof eType.getName === 'function') return eType.getName()
  // Fallback: try to get name from eClass or other properties
  if ('name' in eType) return String((eType as any).name)
  return 'EString'
})

// Check if this is an enum type
const isEnum = computed(() => {
  const eType = props.feature.getEType()
  if (!eType) return false

  // Method 1: Direct check for getELiterals method
  if (typeof eType === 'object' && 'getELiterals' in eType) {
    return true
  }

  // Method 2: Check eClass name (for DynamicEObject)
  try {
    const eClass = (eType as any).eClass?.()
    if (eClass) {
      const className = eClass.getName?.()
      if (className === 'EEnum') return true
    }
  } catch {
    // Ignore
  }

  // Method 3: Check if type has eLiterals feature via eGet (for DynamicEObject)
  try {
    const eClass = (eType as any).eClass?.()
    if (eClass) {
      const literalsFeature = eClass.getEStructuralFeature?.('eLiterals')
      if (literalsFeature) {
        const literals = (eType as any).eGet?.(literalsFeature)
        if (literals && (Array.isArray(literals) || literals.data)) {
          return true
        }
      }
    }
  } catch {
    // Ignore
  }

  return false
})

// Determine the input type based on data type
const inputType = computed(() => {
  const typeName = dataTypeName.value

  if (isEnum.value) return 'enum'

  switch (typeName) {
    case 'EString':
    case 'String':
      return 'string'
    case 'EInt':
    case 'EInteger':
    case 'ELong':
    case 'Integer':
    case 'Long':
      return 'integer'
    case 'EFloat':
    case 'EDouble':
    case 'Float':
    case 'Double':
      return 'decimal'
    case 'EBoolean':
    case 'Boolean':
      return 'boolean'
    case 'EDate':
    case 'Date':
      return 'date'
    case 'EByteArray':
      return 'textarea'
    default:
      return 'string'
  }
})

// Handle value updates
function onUpdate(newValue: any) {
  emit('update:value', newValue)
}

// Format feature name for display
const displayName = computed(() => {
  const name = props.feature.getName()
  // Convert camelCase to Title Case
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
})

// Check if required
const isRequired = computed(() => {
  return props.feature.getLowerBound() > 0
})
</script>

<template>
  <div class="attribute-field">
    <label :for="feature.getName()" class="field-label">
      {{ displayName }}
      <span v-if="isRequired" class="required-indicator">*</span>
    </label>

    <!-- String input -->
    <InputText
      v-if="inputType === 'string'"
      :id="feature.getName()"
      :modelValue="value ?? ''"
      @update:modelValue="onUpdate"
      :disabled="readonly"
      :invalid="!!error"
      class="w-full"
    />

    <!-- Integer input -->
    <InputNumber
      v-else-if="inputType === 'integer'"
      :id="feature.getName()"
      :modelValue="value"
      @update:modelValue="onUpdate"
      :disabled="readonly"
      :invalid="!!error"
      :useGrouping="false"
      class="w-full"
    />

    <!-- Decimal input -->
    <InputNumber
      v-else-if="inputType === 'decimal'"
      :id="feature.getName()"
      :modelValue="value"
      @update:modelValue="onUpdate"
      :disabled="readonly"
      :invalid="!!error"
      :minFractionDigits="1"
      :maxFractionDigits="10"
      class="w-full"
    />

    <!-- Boolean input -->
    <div v-else-if="inputType === 'boolean'" class="boolean-field">
      <Checkbox
        :id="feature.getName()"
        :modelValue="value ?? false"
        @update:modelValue="onUpdate"
        :disabled="readonly"
        binary
      />
      <label :for="feature.getName()" class="boolean-label">{{ value ? 'Yes' : 'No' }}</label>
    </div>

    <!-- Date input -->
    <Calendar
      v-else-if="inputType === 'date'"
      :id="feature.getName()"
      :modelValue="value"
      @update:modelValue="onUpdate"
      :disabled="readonly"
      :invalid="!!error"
      showIcon
      class="w-full"
    />

    <!-- Textarea for large content -->
    <Textarea
      v-else-if="inputType === 'textarea'"
      :id="feature.getName()"
      :modelValue="value ?? ''"
      @update:modelValue="onUpdate"
      :disabled="readonly"
      :invalid="!!error"
      rows="3"
      class="w-full"
    />

    <!-- Enum field -->
    <EnumField
      v-else-if="inputType === 'enum'"
      :feature="feature"
      :value="value"
      @update:value="onUpdate"
      :readonly="readonly"
      :error="error"
    />

    <!-- Fallback string input -->
    <InputText
      v-else
      :id="feature.getName()"
      :modelValue="String(value ?? '')"
      @update:modelValue="onUpdate"
      :disabled="readonly"
      :invalid="!!error"
      class="w-full"
    />

    <!-- Error message -->
    <small v-if="error" class="field-error">{{ error }}</small>
  </div>
</template>

<style scoped>
.attribute-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field-label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.required-indicator {
  color: var(--p-red-500, #ef4444);
  margin-left: 0.25rem;
}

.boolean-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.boolean-label {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  cursor: pointer;
}

.field-error {
  color: var(--p-red-500, #ef4444);
  font-size: 0.75rem;
}

:deep(.p-invalid.p-inputtext),
:deep(.p-invalid.p-select),
:deep(.p-invalid.p-textarea) {
  border-color: var(--p-red-500, #ef4444) !important;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--p-red-500, #ef4444) 40%, transparent);
}

.w-full {
  width: 100%;
}
</style>
