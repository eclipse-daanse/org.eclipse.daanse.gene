<script setup lang="ts">
/**
 * HitPolicySelector - DMN Hit Policy dropdown with aggregator support
 */

import { computed } from 'tsm:vue'
import { Select } from 'tsm:primevue'
import type { HitPolicy, BuiltinAggregator } from '../types'
import { HIT_POLICY_LABELS, HIT_POLICY_DESCRIPTIONS, AGGREGATOR_LABELS } from '../types'

const props = defineProps<{
  hitPolicy: string
  aggregation?: string
}>()

const emit = defineEmits<{
  'update:hitPolicy': [value: HitPolicy]
  'update:aggregation': [value: BuiltinAggregator | null]
}>()

const hitPolicyOptions = Object.entries(HIT_POLICY_LABELS).map(([value, label]) => ({
  label: `${label} - ${HIT_POLICY_DESCRIPTIONS[value as HitPolicy]}`,
  value,
  abbrev: label
}))

const aggregatorOptions = Object.entries(AGGREGATOR_LABELS).map(([value, label]) => ({
  label: `${label} - ${value}`,
  value
}))

const showAggregator = computed(() => props.hitPolicy === 'COLLECT')

const displayLabel = computed(() => {
  const hp = HIT_POLICY_LABELS[props.hitPolicy as HitPolicy] || 'U'
  if (props.hitPolicy === 'COLLECT' && props.aggregation) {
    return AGGREGATOR_LABELS[props.aggregation as BuiltinAggregator] || hp
  }
  return hp
})
</script>

<template>
  <div class="hit-policy-selector">
    <Select
      :modelValue="hitPolicy"
      :options="hitPolicyOptions"
      optionLabel="label"
      optionValue="value"
      class="hp-select"
      :pt="{ root: { style: 'min-width: 60px; max-width: 180px' } }"
      @update:modelValue="emit('update:hitPolicy', $event)"
    >
      <template #value="{ value }">
        <span class="hp-badge" :title="HIT_POLICY_DESCRIPTIONS[value as HitPolicy]">
          {{ displayLabel }}
        </span>
      </template>
    </Select>

    <Select
      v-if="showAggregator"
      :modelValue="aggregation || ''"
      :options="aggregatorOptions"
      optionLabel="label"
      optionValue="value"
      placeholder="Agg"
      class="agg-select"
      :pt="{ root: { style: 'min-width: 50px; max-width: 100px' } }"
      @update:modelValue="emit('update:aggregation', $event || null)"
    />
  </div>
</template>

<style scoped>
.hit-policy-selector {
  display: flex;
  align-items: center;
  gap: 4px;
}

.hp-badge {
  font-weight: 700;
  font-size: 1rem;
}

.hp-select :deep(.p-select-label) {
  padding: 4px 8px;
}

.agg-select :deep(.p-select-label) {
  padding: 4px 8px;
}
</style>
