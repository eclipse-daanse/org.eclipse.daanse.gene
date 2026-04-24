<script setup lang="ts">
/**
 * XMI Viewer Component
 *
 * Displays XMI/XML files with syntax highlighting and metadata.
 * Supports light and dark themes.
 */

import { computed, watch, ref, onMounted, onUnmounted } from 'tsm:vue'
import { useXmlHighlighter } from '../composables/useXmlHighlighter'
import type { XmiFileInfo } from '../types'

const props = defineProps<{
  /** File content to display */
  content: string
  /** File name */
  fileName: string
}>()

// Detect theme from document class (set by global settings)
const isDark = ref(true)

function updateTheme() {
  isDark.value = document.documentElement.classList.contains('dark-theme')
}

onMounted(() => {
  updateTheme()
  // Watch for theme changes from global settings
  const observer = new MutationObserver(updateTheme)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  })
  onUnmounted(() => observer.disconnect())
})

const { highlightXml, parseXmiInfo, formatFileSize, theme, getThemeCssVars } = useXmlHighlighter({
  maxLength: 8000,
  isDark: isDark.value
})

// Re-create highlighter when theme changes
const highlighterOptions = computed(() => ({
  maxLength: 8000,
  isDark: isDark.value
}))

const currentHighlighter = computed(() => useXmlHighlighter(highlighterOptions.value))

// Parse file info
const fileInfo = computed<XmiFileInfo | null>(() => {
  if (!props.content) return null
  return currentHighlighter.value.parseXmiInfo(props.content, props.fileName)
})

// Highlighted content
const highlightedContent = computed(() => {
  if (!props.content) return ''
  return currentHighlighter.value.highlightXml(props.content)
})

// Theme CSS variables
const themeVars = computed(() => {
  return currentHighlighter.value.getThemeCssVars(currentHighlighter.value.theme.value)
})
</script>

<template>
  <div class="xmi-viewer" :style="themeVars">
    <!-- Header with file info -->
    <div class="xmi-header">
      <div class="xmi-title">
        <i class="pi pi-database"></i>
        <span>{{ fileInfo?.name || fileName }}</span>
      </div>
      <div class="xmi-subtitle">{{ fileName }}</div>
      <div class="xmi-meta">
        <span class="meta-item">
          <i class="pi pi-tag"></i>
          {{ fileInfo?.rootElement || 'Unknown' }}
        </span>
        <span class="meta-item">
          <i class="pi pi-list"></i>
          ~{{ fileInfo?.elementCount || 0 }} elements
        </span>
        <span v-if="fileInfo?.namespaces.length" class="meta-item">
          <i class="pi pi-link"></i>
          {{ fileInfo.namespaces.length }} namespace(s)
        </span>
      </div>
    </div>

    <!-- Code container -->
    <div class="xmi-code-container">
      <div class="code-header">
        <span>XMI Content</span>
        <span class="file-size">{{ formatFileSize(content?.length || 0) }}</span>
      </div>
      <pre class="xmi-code" v-html="highlightedContent"></pre>
    </div>
  </div>
</template>

<style scoped>
.xmi-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 1rem;
}

.xmi-header {
  background: var(--surface-card, var(--xml-header-bg));
  border: 1px solid var(--surface-border, #3c3c3c);
  border-radius: 8px;
  padding: 1rem;
}

.xmi-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-color, var(--xml-foreground));
}

.xmi-title i {
  color: var(--primary-color, #569cd6);
}

.xmi-subtitle {
  margin-top: 0.25rem;
  font-size: 0.8125rem;
  color: var(--text-color-secondary, var(--xml-header-text));
  font-family: monospace;
}

.xmi-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--surface-border, #3c3c3c);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--text-color-secondary, var(--xml-header-text));
}

.meta-item i {
  font-size: 0.75rem;
  opacity: 0.7;
}

.xmi-code-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--xml-background);
  border-radius: 8px;
  overflow: hidden;
  min-height: 0;
}

.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background: var(--xml-header-bg);
  color: var(--xml-header-text);
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.file-size {
  font-family: monospace;
  text-transform: none;
}

.xmi-code {
  flex: 1;
  margin: 0;
  padding: 1rem;
  font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
  font-size: 0.8125rem;
  line-height: 1.6;
  white-space: pre;
  overflow: auto;
  color: var(--xml-foreground);
  tab-size: 2;
}

/* XML Syntax Highlighting - using CSS variables */
:deep(.xml-declaration) {
  color: var(--xml-declaration);
}

:deep(.xml-comment) {
  color: var(--xml-comment);
  font-style: italic;
}

:deep(.xml-tag) {
  color: var(--xml-tag);
}

:deep(.xml-bracket) {
  color: var(--xml-bracket);
}

:deep(.xml-attr-name) {
  color: var(--xml-attr-name);
}

:deep(.xml-attr-value) {
  color: var(--xml-attr-value);
}

:deep(.xml-namespace) {
  color: var(--xml-namespace);
}

:deep(.xml-ns-value) {
  color: var(--xml-ns-value);
}

:deep(.xml-xsi-type) {
  color: var(--xml-xsi-type);
}

:deep(.xml-type-value) {
  color: var(--xml-type-value);
}

:deep(.xml-truncated) {
  color: var(--xml-truncated);
  font-style: italic;
}
</style>
