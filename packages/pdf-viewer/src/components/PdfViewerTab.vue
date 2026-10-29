<script setup lang="ts">
/**
 * One PDF file as a tab: read from the workspace as a blob and shown by the
 * browser's PDF viewer in a frame filling the tab.
 *
 * Only files with a browser file handle (local folders) can be read as bytes
 * for now; for other sources the tab says so.
 */
import { computed, onBeforeUnmount, ref, watch } from 'tsm:vue'
import { tabDocument } from '../composables/tabDocuments'

const props = defineProps<{ tabId: string }>()
const document = computed(() => tabDocument(props.tabId))

const url = ref<string | null>(null)
const error = ref<string | null>(null)

function release(): void {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = null
}

watch(document, async doc => {
  release()
  error.value = null
  if (!doc) return
  try {
    const handle = (doc.fileEntry as { handle?: { getFile?: () => Promise<File> } } | undefined)?.handle
    const file = await handle?.getFile?.()
    if (!file) {
      error.value = 'Die Datei lässt sich aus dieser Quelle nicht als PDF lesen (nur lokale Ordner).'
      return
    }
    // Without its type the browser offers the blob for download instead of showing it
    const blob = file.type === 'application/pdf' ? file : new Blob([await file.arrayBuffer()], { type: 'application/pdf' })
    url.value = URL.createObjectURL(blob)
  } catch (e) {
    error.value = `Die Datei konnte nicht gelesen werden: ${e instanceof Error ? e.message : String(e)}`
  }
}, { immediate: true })

onBeforeUnmount(release)

const fileName = computed(() => document.value?.filePath.split('/').pop() ?? '')
</script>

<template>
  <div class="pdf-viewer">
    <div v-if="!document" class="message">Keine Datei für diesen Tab</div>
    <div v-else-if="error" class="message">{{ error }}</div>
    <iframe v-else-if="url" :src="url" :title="fileName"></iframe>
    <div v-else class="message">Lade {{ fileName }} …</div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--surface-ground);
}

iframe {
  flex: 1 1 auto;
  width: 100%;
  border: none;
}

.message {
  padding: 1rem;
  color: var(--text-color-secondary);
}
</style>
