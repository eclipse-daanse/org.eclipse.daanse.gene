<script setup lang="ts">
/**
 * ViewsEditorDialog Component
 *
 * Modal dialog wrapper for ViewsEditorPanel.
 * Shows all loaded EPackages and EClasses to toggle type visibility.
 */

import { computed } from 'tsm:vue'
import { Dialog } from 'tsm:primevue'
import { Button } from 'tsm:primevue'
import ViewsEditorPanel from './ViewsEditorPanel.vue'
import type { PackageInfo } from '../context/editorContext'

const props = defineProps<{
  visible: boolean
  packages: PackageInfo[]
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const dialogVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v)
})
</script>

<template>
  <Dialog
    v-model:visible="dialogVisible"
    header="Edit Views"
    :modal="true"
    :style="{ width: '700px', height: '80vh' }"
    :contentStyle="{ display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }"
  >
    <ViewsEditorPanel :packages="packages" />

    <template #footer>
      <Button label="Close" @click="dialogVisible = false" />
    </template>
  </Dialog>
</template>
