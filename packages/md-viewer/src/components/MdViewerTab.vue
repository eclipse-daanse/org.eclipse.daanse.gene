<script setup lang="ts">
/**
 * One Markdown file as a tab: rendered by marked, sanitized by DOMPurify.
 * Read-only; links open in a new tab.
 */
import { computed } from 'tsm:vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { tabDocument } from '../composables/tabDocuments'

const props = defineProps<{ tabId: string }>()
const document = computed(() => tabDocument(props.tabId))

const html = computed(() => {
  const source = document.value?.content ?? ''
  const rendered = DOMPurify.sanitize(marked.parse(source, { async: false }) as string, { USE_PROFILES: { html: true } })
  // Links leave the editor: a new tab instead of replacing the app
  return rendered.replace(/<a href=/g, '<a target="_blank" rel="noopener" href=')
})
</script>

<template>
  <div class="md-viewer">
    <div v-if="!document" class="message">Keine Datei für diesen Tab</div>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitized above -->
    <article v-else class="markdown" v-html="html"></article>
  </div>
</template>

<style scoped>
.md-viewer {
  height: 100%;
  overflow: auto;
  background: var(--surface-ground);
}

.message {
  padding: 1rem;
  color: var(--text-color-secondary);
}

.markdown {
  max-width: 52rem;
  margin: 0 auto;
  padding: 1.5rem 2rem 3rem;
  color: var(--text-color);
  line-height: 1.6;
  font-size: 0.9rem;
}

.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3),
.markdown :deep(h4) {
  margin: 1.4em 0 0.5em;
  line-height: 1.25;
}

.markdown :deep(h1) {
  font-size: 1.6rem;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--surface-border);
}

.markdown :deep(h2) {
  font-size: 1.3rem;
  padding-bottom: 0.2em;
  border-bottom: 1px solid var(--surface-border);
}

.markdown :deep(h3) {
  font-size: 1.1rem;
}

.markdown :deep(a) {
  color: var(--primary-color);
}

.markdown :deep(code) {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 0.85em;
  padding: 0.1em 0.3em;
  border-radius: 3px;
  background: var(--surface-hover);
}

.markdown :deep(pre) {
  padding: 0.75rem 1rem;
  overflow: auto;
  border-radius: 4px;
  background: var(--surface-hover);
}

.markdown :deep(pre code) {
  padding: 0;
  background: none;
}

.markdown :deep(blockquote) {
  margin: 0.8em 0;
  padding: 0 1em;
  color: var(--text-color-secondary);
  border-left: 3px solid var(--surface-border);
}

.markdown :deep(table) {
  border-collapse: collapse;
  margin: 0.8em 0;
}

.markdown :deep(th),
.markdown :deep(td) {
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--surface-border);
}

.markdown :deep(th) {
  background: var(--surface-hover);
}

.markdown :deep(img) {
  max-width: 100%;
}

.markdown :deep(hr) {
  border: none;
  border-top: 1px solid var(--surface-border);
}
</style>
