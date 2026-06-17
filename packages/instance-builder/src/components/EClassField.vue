<script setup lang="ts">
/**
 * EClassField Component
 *
 * Field for selecting the EClass type of an EReference.eType.
 *
 * Uses the shared ClassPickerDialog (resolved via the TSM service registry) so
 * class selection, subpackage recursion, icons and EObject handling stay
 * consistent with the rest of the app instead of being re-implemented here.
 */

import { ref, computed, inject, shallowRef } from 'tsm:vue'
import { Button } from 'tsm:primevue'
import type { EReference, EClass, EPackage, EObject } from '@emfts/core'

const props = defineProps<{
  feature: EReference
  value: EClass | null
  readonly?: boolean
  error?: string
  /** The EObject being edited (to find the containing package) */
  eObject?: EObject
  /** Root package from context (user's created classes) */
  rootPackage?: EPackage | null
}>()

const emit = defineEmits<{
  'update:value': [value: EClass | null]
}>()

const tsm = inject<any>('tsm')
// Resolve the shared class picker via the service registry (no static
// ui-model-browser import → keeps plugin modularity intact).
const ClassPickerDialog = shallowRef<any>(
  tsm?.getService?.('ui.model-browser.components')?.ClassPickerDialog ?? null
)

const showPicker = ref(false)

// Feed the picker the live model so newly added / nested classes are selectable;
// falls back to the shared registry when no root package is in context.
const sourcePackages = computed(() => (props.rootPackage ? [props.rootPackage] : []))
const currentName = computed(() => (props.value as any)?.getName?.() ?? null)

function handleSelect(selection: { eClass: any }) {
  emit('update:value', selection?.eClass ?? null)
  showPicker.value = false
}

function clear() {
  emit('update:value', null)
}
</script>

<template>
  <div class="eclass-field">
    <label class="field-label">{{ feature.getName() }}</label>
    <div class="eclass-field-value" :class="{ 'p-invalid': error }">
      <span class="eclass-name" :class="{ placeholder: !currentName }">
        {{ currentName || 'Select class…' }}
      </span>
      <div class="eclass-actions">
        <Button
          v-if="!readonly && currentName"
          icon="pi pi-times"
          text
          rounded
          size="small"
          v-tooltip.bottom="'Clear'"
          @click="clear"
        />
        <Button
          v-if="!readonly"
          label="Select…"
          size="small"
          severity="secondary"
          @click="showPicker = true"
        />
      </div>
    </div>
    <small v-if="error" class="p-error">{{ error }}</small>

    <!-- Shared class picker (via TSM service) -->
    <component
      :is="ClassPickerDialog"
      v-if="ClassPickerDialog"
      v-model:visible="showPicker"
      header="Select Type"
      :source-packages="sourcePackages"
      :include-ecore-classes="true"
      @select="handleSelect"
    />
  </div>
</template>

<style scoped>
.eclass-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.eclass-field-value {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--p-inputtext-border-color, var(--surface-border));
  border-radius: var(--p-inputtext-border-radius, 4px);
}

.eclass-field-value.p-invalid {
  border-color: var(--red-500);
}

.eclass-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.eclass-name.placeholder {
  color: var(--text-color-secondary);
}

.eclass-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.p-error {
  color: var(--red-500);
  font-size: 0.75rem;
}
</style>
