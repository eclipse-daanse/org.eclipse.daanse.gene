<script setup lang="ts">
/**
 * ClassSelector Component
 *
 * Dropdown for selecting an EClass.
 * Filters out abstract classes.
 */

import { computed } from 'tsm:vue'
import { Dropdown } from 'tsm:primevue'
import type { EClass } from '@emfts/core'

const props = defineProps<{
  classes: EClass[]
  modelValue?: EClass
  label?: string
  placeholder?: string
  /** Beschriftung je Klasse; ohne sie bleibt es beim Klassennamen (#104) */
  labelFor?: (eClass: EClass) => string
}>()

const emit = defineEmits<{
  'update:modelValue': [eClass: EClass | undefined]
}>()

/*
 * Beschriftung kommt optional von aussen (#104): Bei mehreren Modellen im
 * Workspace ist der Klassenname allein nicht unterscheidbar, der Paketpfad
 * gehoert dazu. Die Komponente holt ihn nicht selbst — instance-builder darf
 * ui-model-browser nicht einbinden (__tests__/tsm-module-dependencies).
 */
const options = computed(() => {
  const beschriftung = props.labelFor ?? ((c: EClass) => c.getName() ?? '')
  return props.classes
    .filter(eClass => !eClass.isAbstract())
    .map(eClass => ({
      label: beschriftung(eClass),
      value: eClass
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'))
})

function onUpdate(eClass: EClass | undefined) {
  emit('update:modelValue', eClass)
}
</script>

<template>
  <div class="class-selector">
    <label v-if="label" class="selector-label">{{ label }}</label>
    <Dropdown
      :modelValue="modelValue"
      @update:modelValue="onUpdate"
      :options="options"
      optionLabel="label"
      optionValue="value"
      :placeholder="placeholder || 'Select class...'"
      class="w-full"
      filter
      filterPlaceholder="Search..."
    />
  </div>
</template>

<style scoped>
.class-selector {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.selector-label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.w-full {
  width: 100%;
}
</style>
