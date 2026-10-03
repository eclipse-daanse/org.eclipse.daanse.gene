<script setup lang="ts">
/**
 * One .c-ocl file as a tab. Fetches the tab's document and hands it to the
 * editor as a prop - the editor reads no service and nothing of another tab.
 */
import { computed } from 'tsm:vue'
import CoclEditor from './CoclEditor.vue'
import { tabDocument } from '../composables/tabDocuments'

const props = defineProps<{ tabId: string }>()
const document = computed(() => tabDocument(props.tabId))
</script>

<template>
  <CoclEditor v-if="document" :document="document" />
  <div v-else class="missing">Keine Datei für diesen Tab</div>
</template>

<style scoped>
.missing { padding: 1rem; color: var(--text-color-secondary); }
</style>
