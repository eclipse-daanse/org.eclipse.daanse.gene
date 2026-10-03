<script setup lang="ts">
/**
 * One .dmn file as a tab. Fetches the tab's document and hands it to the
 * editor as a prop.
 *
 * The DMN model itself is still the shared one (`useSharedDmnEditor`), which
 * the tree, the table and the executor all use - so two DMN tabs show the same
 * model, loaded from whichever tab came forward last. Making that per tab means
 * threading an editor instance through those components; it is not done here.
 */
import { computed } from 'tsm:vue'
import DmnPerspective from './DmnPerspective.vue'
import { tabDocument } from '../composables/tabDocuments'

const props = defineProps<{ tabId: string }>()
const document = computed(() => tabDocument(props.tabId))
</script>

<template>
  <DmnPerspective v-if="document" :document="document" />
  <div v-else class="missing">Keine Datei für diesen Tab</div>
</template>

<style scoped>
.missing { padding: 1rem; color: var(--text-color-secondary); }
</style>
