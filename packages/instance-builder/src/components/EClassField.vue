<script setup lang="ts">
/**
 * EClassField Component
 *
 * Special field for selecting EClass type for EReference.eType.
 * Shows a dropdown with available EClasses from Ecore (like EObject)
 * and from the current package being edited.
 */

import { ref, computed, watch } from 'tsm:vue'
import { Dropdown } from 'tsm:primevue'
import type { EReference, EClass, EPackage, EObject } from '@emfts/core'
import { getEcorePackage } from '@emfts/core'

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

// Get available EClasses as flat list with group info in label
const availableClasses = computed(() => {
  const classes: { label: string; value: EClass }[] = []

  // 1. Add EClasses from the root package (user-defined)
  if (props.rootPackage) {
    const pkgName = props.rootPackage.getName() || 'Package'
    const pkgClassifiers = props.rootPackage.getEClassifiers?.() || []
    for (const classifier of pkgClassifiers) {
      if (typeof (classifier as any).isAbstract === 'function') {
        const eClass = classifier as EClass
        const name = eClass.getName() || 'Unknown'
        classes.push({
          label: `${name} (${pkgName})`,
          value: eClass
        })
      }
    }
  }

  // 2. Add EClasses from Ecore package (EObject, etc.)
  const ecorePkg = getEcorePackage()
  const ecoreClassifiers = ecorePkg.getEClassifiers?.() || []

  for (const classifier of ecoreClassifiers) {
    // Check if it's an EClass (has isAbstract method)
    if (typeof (classifier as any).isAbstract === 'function') {
      const eClass = classifier as EClass
      const name = eClass.getName() || 'Unknown'
      classes.push({
        label: `${name} (Ecore)`,
        value: eClass
      })
    }
  }

  console.log('[EClassField] availableClasses:', classes.length, classes.map(c => c.label))
  return classes
})

// Find matching option for current value
const selectedOption = computed({
  get() {
    if (!props.value) return null
    // Find by object reference or by name match
    const found = availableClasses.value.find(opt => {
      if (opt.value === props.value) return true
      // Fallback: match by name
      const optName = opt.value.getName?.()
      const valName = (props.value as any)?.getName?.()
      return optName && valName && optName === valName
    })
    console.log('[EClassField] selectedOption get:', found?.label, 'for value:', props.value)
    return found || null
  },
  set(option: { label: string; value: EClass } | null) {
    console.log('[EClassField] selectedOption set:', option?.label)
    emit('update:value', option?.value ?? null)
  }
})
</script>

<template>
  <div class="eclass-field">
    <label class="field-label">{{ feature.getName() }}</label>
    <Dropdown
      v-model="selectedOption"
      :options="availableClasses"
      optionLabel="label"
      dataKey="label"
      placeholder="Select class..."
      :disabled="readonly"
      :class="{ 'p-invalid': error }"
      class="w-full"
      showClear
    />
    <small v-if="error" class="p-error">{{ error }}</small>
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

.w-full {
  width: 100%;
}

.p-error {
  color: var(--red-500);
  font-size: 0.75rem;
}

.class-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.class-group {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}
</style>
