<script setup lang="ts">
/**
 * The text of an ObjectRow (FR-2.5, CON-2.5): rendered by its type, with a
 * switch to the editor and back.
 *
 * Markdown is rendered and sanitized; README shows as paragraphs; Mermaid
 * shows its source until a Mermaid renderer is part of GenE. Saving stores
 * the type in the model next to the text.
 */
import { computed, inject, ref } from 'tsm:vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { setText, textOf, TEXT_TYPES, type TextType } from '../composables/textContent'
import { CWM_EDITING } from '../composables/editing'

const props = defineProps<{
  object: any
  testId: string
  version?: number
}>()

const editing = inject(CWM_EDITING)!

const text = computed(() => {
  void props.version
  return textOf(props.object)
})

const editMode = ref(false)
const draft = ref('')
const draftType = ref<TextType>('readme')

const html = computed(() => {
  const t = text.value
  if (!t || t.type !== 'markdown') return ''
  return DOMPurify.sanitize(marked.parse(t.body, { async: false }) as string, { USE_PROFILES: { html: true } })
})

const paragraphs = computed(() => (text.value?.body ?? '').split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean))

function startEdit(): void {
  if (!text.value) return
  draft.value = text.value.body
  draftType.value = text.value.type
  editMode.value = true
}

function save(): void {
  const t = text.value
  if (t) editing.change(() => setText(t.owner, draft.value, draftType.value))
  editMode.value = false
}

function typeLabel(type: TextType): string {
  return TEXT_TYPES.find(t => t.value === type)?.label ?? type
}
</script>

<template>
  <div class="text-view" :data-testid="testId" data-wire-kind="TEXT">
    <template v-if="text">
      <div v-if="!editMode" class="rendered">
        <div class="text-bar">
          <span class="type" :title="text.stored ? 'Texttyp im Modell gespeichert' : 'Texttyp erkannt, noch nicht gespeichert'">
            {{ typeLabel(text.type) }}{{ text.stored ? '' : ' (erkannt)' }}
          </span>
          <button type="button" class="link" @click="startEdit">Bearbeiten</button>
        </div>
        <div v-if="text.type === 'markdown'" class="markdown" v-html="html"></div>
        <pre v-else-if="text.type === 'mermaid'" class="mermaid-source">{{ text.body }}</pre>
        <template v-else>
          <p v-for="(p, i) in paragraphs" :key="i">{{ p }}</p>
        </template>
      </div>
      <div v-else class="editor">
        <div class="text-bar">
          <select v-model="draftType" aria-label="Texttyp">
            <option v-for="t in TEXT_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
          <button type="button" class="link" @click="save">Fertig</button>
          <button type="button" class="link muted" @click="editMode = false">Abbrechen</button>
        </div>
        <textarea v-model="draft" rows="8" placeholder="Text"></textarea>
      </div>
    </template>
  </div>
</template>

<style scoped>
.text-view {
  margin-top: 0.35rem;
}

.text-bar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.7rem;
}

.type {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
}

.link {
  font: inherit;
  padding: 0;
  border: none;
  background: none;
  color: var(--primary-color);
  cursor: pointer;
}

.link.muted {
  color: var(--text-color-secondary);
}

.rendered p {
  margin: 0.3rem 0 0;
  line-height: 1.5;
  white-space: pre-wrap;
}

.markdown {
  line-height: 1.5;
}

.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3) {
  font-size: 1rem;
  margin: 0.5rem 0 0.2rem;
}

.markdown :deep(p) {
  margin: 0.3rem 0 0;
}

.mermaid-source {
  margin: 0.3rem 0 0;
  padding: 0.4rem 0.5rem;
  font-size: 0.8rem;
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 3px;
  overflow-x: auto;
}

.editor select,
.editor textarea {
  font: inherit;
  color: var(--text-color);
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 3px;
}

.editor textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-top: 0.3rem;
  padding: 0.35rem 0.5rem;
  line-height: 1.5;
  resize: vertical;
}
</style>
