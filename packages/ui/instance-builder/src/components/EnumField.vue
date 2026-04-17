<script setup lang="ts">
/**
 * EnumField Component
 *
 * Renders a dropdown for EEnum values.
 */

import { computed } from 'tsm:vue'
import { Dropdown } from 'tsm:primevue'
import type { EAttribute, EEnum, EEnumLiteral } from '@emfts/core'

const props = defineProps<{
  feature: EAttribute
  value: any
  readonly?: boolean
  error?: string
}>()

const emit = defineEmits<{
  'update:value': [value: any]
}>()

// Get enum type
const enumType = computed(() => {
  return props.feature.getEType()
})

// Get enum options
const options = computed(() => {
  const eType = enumType.value
  if (!eType) return []

  // Method 1: Direct getELiterals method
  if ('getELiterals' in eType) {
    const literals = (eType as EEnum).getELiterals()
    return literals.map((literal: EEnumLiteral) => ({
      label: literal.getLiteral?.() ?? literal.getName?.() ?? String(literal),
      value: literal.getValue?.() ?? literal.getName?.() ?? String(literal)
    }))
  }

  // Method 2: DynamicEObject - use eGet to access eLiterals
  try {
    const eClass = (eType as any).eClass?.()
    if (eClass) {
      const literalsFeature = eClass.getEStructuralFeature?.('eLiterals')
      if (literalsFeature) {
        const literals = (eType as any).eGet?.(literalsFeature)
        const literalsArray = literals?.data ?? literals ?? []

        if (Array.isArray(literalsArray)) {
          return literalsArray.map((literal: any) => {
            // For DynamicEObject literals, access via eGet or direct properties
            const litClass = literal.eClass?.()
            let name: string
            let value: any

            if (litClass) {
              const nameFeature = litClass.getEStructuralFeature?.('name')
              const literalFeature = litClass.getEStructuralFeature?.('literal')
              const valueFeature = litClass.getEStructuralFeature?.('value')

              name = literal.eGet?.(nameFeature) ?? literal.getName?.() ?? 'unknown'
              const litStr = literal.eGet?.(literalFeature) ?? literal.getLiteral?.()
              value = literal.eGet?.(valueFeature) ?? literal.getValue?.() ?? name

              return {
                label: litStr ?? name,
                value: value
              }
            }

            // Fallback for regular literals
            name = literal.getName?.() ?? literal.name ?? 'unknown'
            return {
              label: literal.getLiteral?.() ?? literal.literal ?? name,
              value: literal.getValue?.() ?? literal.value ?? name
            }
          })
        }
      }
    }
  } catch (e) {
    console.warn('[EnumField] Error getting enum literals via eGet:', e)
  }

  return []
})

// Handle value change
function onUpdate(newValue: any) {
  emit('update:value', newValue)
}
</script>

<template>
  <Dropdown
    :id="feature.getName()"
    :modelValue="value"
    @update:modelValue="onUpdate"
    :options="options"
    optionLabel="label"
    optionValue="value"
    :disabled="readonly"
    :invalid="!!error"
    placeholder="Select..."
    class="w-full"
  />
</template>

<style scoped>
.w-full {
  width: 100%;
}
</style>
