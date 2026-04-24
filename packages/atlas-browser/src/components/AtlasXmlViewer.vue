<script setup lang="ts">
/**
 * AtlasXmlViewer Component
 *
 * Displays raw XML/XMI content with line numbers and a copy button.
 */

import { ref, computed, watch, onMounted } from 'tsm:vue'
import { Button } from 'tsm:primevue'
import { useSharedAtlasBrowser } from '../composables/useAtlasBrowser'

const browser = useSharedAtlasBrowser()
const content = computed(() => browser.rawContent.value)
const copied = ref(false)

// Auto-load content for current selection
watch(() => browser.selectedNodeData.value, () => {
  browser.ensureContentForSelection()
}, { immediate: true })

const lines = computed(() => {
  if (!content.value) return []
  return content.value.split('\n')
})

async function copyToClipboard() {
  if (!content.value) return
  try {
    await navigator.clipboard.writeText(content.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // fallback
    const ta = document.createElement('textarea')
    ta.value = content.value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}
</script>

<template>
  <div class="atlas-xml-viewer">
    <!-- Empty state -->
    <div v-if="!content" class="xml-empty">
      <i class="pi pi-code" style="font-size: 2.5rem; opacity: 0.2"></i>
      <p>Select a schema or object in the tree to see its XML content.</p>
    </div>

    <!-- XML content -->
    <div v-else class="xml-content">
      <div class="xml-toolbar">
        <span class="xml-info">{{ lines.length }} lines</span>
        <Button
          :label="copied ? 'Copied!' : 'Copy'"
          :icon="copied ? 'pi pi-check' : 'pi pi-copy'"
          size="small"
          severity="secondary"
          text
          @click="copyToClipboard"
        />
      </div>
      <div class="xml-code-container">
        <table class="xml-code-table">
          <tbody>
            <tr v-for="(line, idx) in lines" :key="idx" class="xml-line">
              <td class="line-number">{{ idx + 1 }}</td>
              <td class="line-content">{{ line }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.atlas-xml-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--p-content-background);
  color: var(--p-text-color);
}

.xml-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
  color: var(--p-text-muted-color);
  text-align: center;
  flex: 1;
}

.xml-empty p {
  margin: 0;
  font-size: 0.85rem;
  max-width: 300px;
}

.xml-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.xml-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  background: var(--p-content-background);
  border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
}

.xml-info {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.xml-code-container {
  flex: 1;
  overflow: auto;
  background: var(--p-content-background);
}

.xml-code-table {
  border-collapse: collapse;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 0.78rem;
  line-height: 1.5;
  width: 100%;
}

.xml-line:hover {
  background: var(--p-highlight-background);
}

.line-number {
  padding: 0 12px;
  text-align: right;
  color: var(--p-text-muted-color);
  user-select: none;
  white-space: nowrap;
  border-right: 1px solid var(--p-content-border-color);
  width: 1px;
  opacity: 0.6;
}

.line-content {
  padding: 0 12px;
  white-space: pre;
}
</style>
