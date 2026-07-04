<script setup lang="ts">
/**
 * ClassPickerDialog - EClass selection from package tree/list
 *
 * Wrapper around PickerDialog that delegates to a class picker data source.
 * Preserves the original API surface so callers don't need to change.
 */

import { computed } from 'tsm:vue'
import { PickerDialog } from 'ui-search'
import type { PickerItem, PickerDataSource } from 'ui-search'
import { useSharedModelRegistry } from '../composables/useModelRegistry'
import { createClassPickerDataSource } from '../composables/classPickerDataSource'

interface ClassSelection {
  eClass: any
  qualifiedName: string
  className: string
  packageNsURI: string
}

const props = withDefaults(defineProps<{
  visible: boolean
  header?: string
  viewMode?: 'list' | 'tree'
  includeAbstract?: boolean
  sourcePackages?: any[]
  includeEcoreClasses?: boolean
}>(), {
  header: 'Select Class',
  viewMode: 'tree',
  includeAbstract: true
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'select': [selection: ClassSelection]
}>()

const modelRegistry = useSharedModelRegistry()

const displayMode = computed(() => props.viewMode === 'list' ? 'flat' as const : 'grouped' as const)

const dataSource = computed<PickerDataSource>(() =>
  createClassPickerDataSource({
    registryPackages: () => modelRegistry.userPackages?.value,
    sourcePackages: () => props.sourcePackages,
    includeAbstract: props.includeAbstract,
    includeEcoreClasses: props.includeEcoreClasses,
    grouped: displayMode.value === 'grouped'
  })
)

function onSelect(item: PickerItem) {
  const selection = item.payload as ClassSelection
  emit('select', selection)
  emit('update:visible', false)
}

function onClose() {
  emit('update:visible', false)
}
</script>

<template>
  <PickerDialog
    :visible="visible"
    :header="header"
    placeholder="Search classes..."
    :display-mode="displayMode"
    :data-source="dataSource"
    :show-search="true"
    :show-keyboard-hints="true"
    @close="onClose"
    @select="onSelect"
  />
</template>
