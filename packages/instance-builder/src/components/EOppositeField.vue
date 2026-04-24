<script setup lang="ts">
/**
 * EOppositeField Component
 *
 * Special field for selecting EOpposite for an EReference.
 * Shows a dropdown with available EReferences from the target EClass
 * that can serve as the opposite reference.
 */

import { computed } from 'tsm:vue'
import { Dropdown } from 'tsm:primevue'
import type { EReference, EClass, EObject } from '@emfts/core'

const props = defineProps<{
  feature: EReference
  value: EReference | null
  readonly?: boolean
  error?: string
  /** The EReference being edited */
  eObject?: EObject
}>()

const emit = defineEmits<{
  'update:value': [value: EReference | null]
}>()

// Get the target EClass of the current reference
const targetEClass = computed<EClass | null>(() => {
  if (!props.eObject) return null
  // The eObject is an EReference, get its eType (which is the target EClass)
  try {
    const eRef = props.eObject as EReference
    return eRef.getEReferenceType?.() || null
  } catch {
    return null
  }
})

// Get the containing EClass of the current reference
const containingEClass = computed<EClass | null>(() => {
  if (!props.eObject) {
    console.log('[EOppositeField] No eObject')
    return null
  }
  try {
    const container = props.eObject.eContainer?.()
    console.log('[EOppositeField] eContainer:', container, 'eObject:', props.eObject)
    if (container && typeof (container as any).isAbstract === 'function') {
      return container as EClass
    }
  } catch (e) {
    console.log('[EOppositeField] Error getting container:', e)
  }
  return null
})

// Get available opposite references from the target EClass
const availableOpposites = computed(() => {
  const opposites: { label: string; value: EReference }[] = []

  const target = targetEClass.value
  const containing = containingEClass.value

  if (!target) {
    console.log('[EOppositeField] No target EClass')
    return opposites
  }

  console.log('[EOppositeField] Target EClass:', target.getName())
  console.log('[EOppositeField] Containing EClass:', containing?.getName())

  // Get all references from the target EClass
  try {
    const allRefs = target.getEAllReferences?.() || []
    console.log('[EOppositeField] Target has refs:', allRefs.length)

    for (const ref of allRefs) {
      // The opposite must point back to our containing class (or a supertype)
      try {
        const refTarget = ref.getEReferenceType?.()
        if (refTarget && containing) {
          // Check if refTarget is the same as containing or a supertype
          const refTargetName = refTarget.getName()
          const containingName = containing.getName()

          console.log('[EOppositeField] Checking ref:', ref.getName(), 'target:', refTargetName, 'vs containing:', containingName)

          // Simple check: names match (could be enhanced with supertype checking)
          if (refTargetName === containingName || isSuperTypeOf(refTarget, containing)) {
            opposites.push({
              label: ref.getName() || 'Unknown',
              value: ref
            })
          }
        }
      } catch (e) {
        // Reference type not set, skip
      }
    }
  } catch (e) {
    console.warn('[EOppositeField] Failed to get references:', e)
  }

  console.log('[EOppositeField] Available opposites:', opposites.map(o => o.label))
  return opposites
})

// Check if a class is a supertype of another
function isSuperTypeOf(potentialSuper: EClass, sub: EClass): boolean {
  if (potentialSuper === sub) return true
  try {
    const superTypes = sub.getESuperTypes?.() || []
    for (const st of superTypes) {
      if (st === potentialSuper || isSuperTypeOf(potentialSuper, st)) {
        return true
      }
    }
  } catch {
    // Ignore
  }
  return false
}

// Find matching option for current value
const selectedOption = computed({
  get() {
    if (!props.value) return null
    const found = availableOpposites.value.find(opt => {
      if (opt.value === props.value) return true
      // Fallback: match by name
      const optName = opt.value.getName?.()
      const valName = (props.value as any)?.getName?.()
      return optName && valName && optName === valName
    })
    return found || null
  },
  set(option: { label: string; value: EReference } | null) {
    emit('update:value', option?.value ?? null)
  }
})
</script>

<template>
  <div class="eopposite-field">
    <label class="field-label">{{ feature.getName() }}</label>
    <Dropdown
      v-model="selectedOption"
      :options="availableOpposites"
      optionLabel="label"
      dataKey="label"
      placeholder="Select opposite..."
      :disabled="readonly || availableOpposites.length === 0"
      :class="{ 'p-invalid': error }"
      class="w-full"
      showClear
    />
    <small v-if="!targetEClass" class="hint">Set eType first to see available opposites</small>
    <small v-else-if="availableOpposites.length === 0" class="hint">No matching references in {{ targetEClass.getName() }}</small>
    <small v-if="error" class="p-error">{{ error }}</small>
  </div>
</template>

<style scoped>
.eopposite-field {
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

.hint {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.p-error {
  color: var(--red-500);
  font-size: 0.75rem;
}
</style>
