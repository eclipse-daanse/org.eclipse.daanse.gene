<script setup lang="ts">
/**
 * EnumField Component
 *
 * Renders a dropdown for EEnum values.
 *
 * Der Modellwert ist ein EEnumLiteral — die XMI-Schicht loest Enum-Attribute
 * beim Laden dorthin auf und serialisiert sie ueber getLiteral(). Das Dropdown
 * arbeitet trotzdem auf dem Literal-*String* als optionValue: PrimeVue
 * vergleicht optionValue strikt, und ein String uebersteht auch ein Reload, das
 * die Literal-Instanzen austauscht. Beim Setzen geht wieder das Literal-Objekt
 * ins Modell, damit Save den korrekten Literal-String schreibt.
 */

import { computed } from 'tsm:vue'
import { Dropdown } from 'tsm:primevue'
import type { EAttribute } from '@emfts/core'
import { enumLiteralInfos, resolveEnumLiteral, type EnumLiteralInfo } from '../composables/enumLiterals'

const props = defineProps<{
  feature: EAttribute
  value: any
  readonly?: boolean
  error?: string
}>()

const emit = defineEmits<{
  'update:value': [value: any]
}>()

const literalInfos = computed(() => enumLiteralInfos(props.feature.getEType()))

const options = computed(() =>
  literalInfos.value.map((info: EnumLiteralInfo) => ({
    label: info.literalString,
    value: info.literalString
  }))
)

const selected = computed(
  () => resolveEnumLiteral(literalInfos.value, props.value)?.literalString ?? null
)

// Handle value change
function onUpdate(newValue: any) {
  const info = resolveEnumLiteral(literalInfos.value, newValue)
  emit('update:value', info ? info.literal : null)
}
</script>

<template>
  <Dropdown
    :id="feature.getName()"
    :modelValue="selected"
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
