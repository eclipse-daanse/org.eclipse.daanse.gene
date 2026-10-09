<script setup lang="ts">
/**
 * One section of the documentation: title, text, columns table.
 *
 * All sections stand in one column - every text starts at the same left edge.
 * How deep a section sits is said by the stripes in the gutter to its left:
 * one per level, side by side, not by an indent.
 */
import type { DocSection } from '../composables/documentation'
import { objectSlug } from '../composables/documentation'
import ColumnsTable from './ColumnsTable.vue'

const props = defineProps<{
  section: DocSection
  /** How many stripe slots the gutter holds - the deepest section on the page */
  gutter: number
  /** Only the selected description is edited in place */
  editable?: boolean
}>()

/** Width of one stripe slot in the gutter */
const SLOT = 7

const emit = defineEmits<{
  edit: [field: 'name' | 'body', value: string]
  navigate: [object: any]
}>()

function paragraphs(body: string): string[] {
  return body.split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean)
}

function onInput(field: 'name' | 'body', event: Event): void {
  emit('edit', field, (event.target as HTMLInputElement | HTMLTextAreaElement).value)
}
</script>

<template>
  <section class="doc-section" :class="{ nested: section.depth > 0 }">
    <!-- One stripe per level, side by side; the text column starts after the gutter -->
    <div class="doc-gutter" :style="{ width: `${Math.max(gutter, 1) * SLOT}px` }">
      <span
        v-for="level in section.depth"
        :key="level"
        class="doc-stripe"
        :style="{ left: `${(level - 1) * SLOT}px`, opacity: 1 - (level - 1) * 0.12 }"
      ></span>
    </div>
    <div class="doc-body">
      <header class="doc-header">
        <input
          v-if="editable && section.isDescription"
          class="doc-title-input"
          :value="section.title"
          placeholder="Titel"
          @change="onInput('name', $event)"
        />
        <component :is="section.depth === 0 ? 'h2' : section.depth === 1 ? 'h3' : 'h4'" v-else class="doc-title">
          {{ section.title || '(ohne Namen)' }}
        </component>
        <span class="doc-kind">{{ section.kind }}</span>
      </header>

      <textarea
        v-if="editable && section.isDescription"
        class="doc-text-input"
        :value="section.body"
        rows="6"
        placeholder="Text der Beschreibung"
        @change="onInput('body', $event)"
      ></textarea>
      <template v-else>
        <p v-for="(p, i) in paragraphs(section.body)" :key="i" class="doc-paragraph">{{ p }}</p>
      </template>

      <ColumnsTable
        v-if="section.table && section.table.columns.length > 0"
        :table="section.table"
        :test-id="`cwm.Editor.ContextView.ObjectRow@${objectSlug(section.table.object)}.Row.Body.Columns`"
        @navigate="emit('navigate', $event)"
      />

    </div>
  </section>
</template>

<style scoped>
.doc-section {
  display: flex;
  align-items: stretch;
  gap: 0.75rem;
}

.doc-section.nested {
  margin-top: 0.75rem;
}

.doc-gutter {
  position: relative;
  flex: 0 0 auto;
  align-self: stretch;
}

/* A stripe per level; deeper ones a little lighter */
.doc-stripe {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 2px;
  background: var(--primary-color);
}

.doc-body {
  flex: 1 1 auto;
  min-width: 0;
}

.doc-header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.doc-title {
  margin: 0;
  color: var(--text-color);
}

h2.doc-title { font-size: 1.25rem; }
h3.doc-title { font-size: 1.05rem; }
h4.doc-title { font-size: 0.95rem; }

.doc-kind {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
}

.doc-paragraph {
  margin: 0.35rem 0 0;
  line-height: 1.5;
  white-space: pre-wrap;
}

.doc-title-input,
.doc-text-input {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  color: var(--text-color);
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  padding: 0.35rem 0.5rem;
}

.doc-title-input {
  font-size: 1.2rem;
  font-weight: 600;
}

.doc-text-input {
  margin-top: 0.5rem;
  line-height: 1.5;
  resize: vertical;
}
</style>
