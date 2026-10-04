<script setup lang="ts">
/**
 * One file as a text tab. Fetches the tab's document and hands it to the
 * editor - the editor reads no service and nothing of another tab.
 */
import { computed } from 'tsm:vue'
import XmlEditor from './XmlEditor.vue'
import { tabDocument } from '../composables/tabDocuments'

const props = defineProps<{ tabId: string }>()
const document = computed(() => tabDocument(props.tabId))
</script>

<template>
  <XmlEditor v-if="document" :tab-id="tabId" :document="document" />
  <div v-else class="missing">Keine Datei für diesen Tab</div>
</template>

<style scoped>
.missing { padding: 1rem; color: var(--text-color-secondary); }
</style>
