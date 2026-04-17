<script setup lang="ts">
/**
 * ETypeField Component
 *
 * Special field for selecting EType (EDataType/EClassifier) for EAttribute/ETypedElement.
 * Shows a dropdown with available EDataTypes from Ecore.
 */

import { ref, computed, watch } from 'tsm:vue'
import { Dropdown } from 'tsm:primevue'
import type { EReference, EClassifier } from '@emfts/core'
import { getEcorePackage } from '@emfts/core'

const props = defineProps<{
  feature: EReference
  value: EClassifier | null
  readonly?: boolean
  error?: string
}>()

const emit = defineEmits<{
  'update:value': [value: EClassifier | null]
}>()

// Get available EDataTypes from Ecore package
const availableTypes = computed(() => {
  const ecorePkg = getEcorePackage()
  const types: { label: string; value: EClassifier }[] = []

  // Get all classifiers from Ecore
  const classifiers = ecorePkg.getEClassifiers?.() || []

  for (const classifier of classifiers) {
    // Check if it's an EDataType (has getInstanceClassName) but not an EClass
    if (typeof (classifier as any).getInstanceClassName === 'function' &&
        typeof (classifier as any).isAbstract !== 'function') {
      types.push({
        label: (classifier as any).getName() || 'Unknown',
        value: classifier as EClassifier
      })
    }
  }

  // Sort alphabetically
  types.sort((a, b) => a.label.localeCompare(b.label))

  return types
})

// Current selected type
const selectedType = ref<EClassifier | null>(props.value)

// Sync with prop changes
watch(() => props.value, (newValue) => {
  selectedType.value = newValue
}, { immediate: true })

// Handle selection change
function onTypeChange(newType: EClassifier | null) {
  selectedType.value = newType
  emit('update:value', newType)
}

// Get display label for current value
const displayLabel = computed(() => {
  if (!selectedType.value) return ''
  if (typeof (selectedType.value as any).getName === 'function') {
    return (selectedType.value as any).getName()
  }
  return 'Unknown'
})
</script>

<template>
  <div class="etype-field">
    <label class="field-label">{{ feature.getName() }}</label>
    <Dropdown
      v-model="selectedType"
      :options="availableTypes"
      optionLabel="label"
      optionValue="value"
      placeholder="Select type..."
      :disabled="readonly"
      :class="{ 'p-invalid': error }"
      class="w-full"
      @change="(e) => onTypeChange(e.value)"
    />
    <small v-if="error" class="p-error">{{ error }}</small>
  </div>
</template>

<style scoped>
.etype-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.w-full {
  width: 100%;
}

.p-error {
  color: var(--red-500);
  font-size: 0.75rem;
}
</style>
