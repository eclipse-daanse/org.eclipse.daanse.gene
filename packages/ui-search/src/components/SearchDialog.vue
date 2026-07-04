<script setup lang="ts">
/**
 * SearchDialog - Command Palette style full-text search
 *
 * Wrapper around PickerDialog that delegates to a search data source.
 * Preserves the original API surface so callers don't need to change.
 */

import { ref, computed, watch } from 'tsm:vue'
import type { Resource, EClass, EObject } from '@emfts/core'
import type { SearchHit, ReferenceSelectionOptions, PickerItem, PickerDataSource } from '../types'
import { createSearchDataSource } from '../dataSources/searchDataSource'
import PickerDialog from './PickerDialog.vue'

const props = defineProps<{
  visible: boolean
  resource: Resource
  referenceOptions?: ReferenceSelectionOptions
  availableClasses?: EClass[]
  problemsService?: {
    query: (obj: any, expression: string) => Promise<unknown>
  }
  browseMode?: boolean
  candidates?: EObject[]
}>()

const emit = defineEmits<{
  'close': []
  'select': [hit: SearchHit]
  'navigate': [object: EObject]
}>()

const isReferenceMode = computed(() => !!props.referenceOptions)

const placeholder = computed(() => {
  if (isReferenceMode.value) {
    return `Search ${props.referenceOptions?.reference.getName()}...`
  }
  return 'Search instances...'
})

const dataSource = computed<PickerDataSource>(() =>
  createSearchDataSource({
    resource: props.resource,
    referenceOptions: props.referenceOptions,
    problemsService: props.problemsService,
    browseMode: props.browseMode,
    candidates: props.candidates
  })
)

function onSelect(item: PickerItem) {
  const hit = item.payload as SearchHit
  if (hit.isFilteredByOcl) return
  emit('select', hit)
  if (!isReferenceMode.value) {
    emit('navigate', hit.object)
  }
}

function onClose() {
  emit('close')
}
</script>

<template>
  <PickerDialog
    :visible="visible"
    header="Search"
    :placeholder="placeholder"
    display-mode="flat"
    :data-source="dataSource"
    :show-search="true"
    :show-keyboard-hints="true"
    @close="onClose"
    @select="onSelect"
  />
</template>
