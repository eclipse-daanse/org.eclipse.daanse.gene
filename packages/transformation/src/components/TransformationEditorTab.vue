<script setup lang="ts">
/**
 * One .qvtr file as a tab. Fetches the tab's document and hands it to the
 * editor as a prop - no service per file type, no polling for it.
 */
import { computed } from 'tsm:vue'
import TransformationEditor from './TransformationEditor.vue'
import { tabDocument } from '../composables/tabDocuments'

const props = defineProps<{ tabId: string }>()
const document = computed(() => tabDocument(props.tabId))
</script>

<template>
  <TransformationEditor v-if="document" :document="document" />
  <div v-else class="missing">Keine Datei für diesen Tab</div>
</template>

<style scoped>
.missing { padding: 1rem; color: var(--text-color-secondary); }
</style>
