<script setup lang="ts">
/**
 * The text of an ObjectRow (FR-2.5, CON-2.5): rendered by its type, with a
 * switch to the editor and back.
 *
 * Markdown and HTML are rendered and sanitized; plain text shows as paragraphs; Mermaid
 * is drawn as a diagram, or - with an error in the text - shows its source
 * and the error. Saving stores the type in the model next to the text.
 */
import { computed, inject, ref, watch } from 'tsm:vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { canCreateText, createTextOwner, detectTextType, setText, textOf, TEXT_TYPES, type TextType } from '../composables/textContent'
import { CWM_EDITING } from '../composables/editing'
import { renderMermaid } from '../composables/mermaid'

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
const draftType = ref<TextType>('plaintext')
/** The user picked the type; until then it follows the text (CON-2.5) */
const typeChosen = ref(false)

watch(draft, body => {
  if (editMode.value && !typeChosen.value) draftType.value = detectTextType(body)
})

const html = computed(() => {
  const t = text.value
  if (!t || (t.type !== 'markdown' && t.type !== 'html')) return ''
  const source = t.type === 'html' ? t.body : (marked.parse(t.body, { async: false }) as string)
  return DOMPurify.sanitize(source, { USE_PROFILES: { html: true } })
})

/* Mermaid renders asynchronously; a newer text wins over a slower older one */
const mermaidSvg = ref('')
const mermaidError = ref('')
let renderRun = 0

watch(
  () => (text.value?.type === 'mermaid' ? text.value.body : null),
  async (body) => {
    const run = ++renderRun
    mermaidSvg.value = ''
    mermaidError.value = ''
    if (body == null || body.trim() === '') return
    try {
      const svg = await renderMermaid(body)
      if (run === renderRun) mermaidSvg.value = svg
    } catch (e) {
      if (run === renderRun) mermaidError.value = e instanceof Error ? e.message : String(e)
    }
  },
  { immediate: true }
)

const paragraphs = computed(() => (text.value?.body ?? '').split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean))

/** A table without its own description offers to write one */
const canCreate = computed(() => {
  void props.version
  return canCreateText(props.object)
})

/** A remark - the table's description field - is plain text; no type to pick */
const isRemarkText = computed(() => !text.value || text.value.remark)

function startEdit(): void {
  if (!text.value) {
    if (!canCreate.value) return
    draft.value = ''
    draftType.value = 'plaintext'
    typeChosen.value = false
    editMode.value = true
    return
  }
  draft.value = text.value.body
  draftType.value = text.value.type
  // A stored type that differs from the detected one was picked on purpose;
  // otherwise the type keeps following the text
  typeChosen.value = text.value.stored && text.value.type !== detectTextType(text.value.body)
  editMode.value = true
}

/* Copy button over the editor, shown on hover */
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copyDraft(): Promise<void> {
  try {
    await navigator.clipboard.writeText(draft.value)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 1500)
  } catch (e) {
    console.warn('[RowTextView] Copy failed:', e)
  }
}

function save(): void {
  const t = text.value
  if (t) {
    editing.change(() => setText(t.owner, draft.value, draftType.value))
  } else if (draft.value.trim() !== '') {
    // The table's description is created with its first text
    editing.change(() => {
      const owner = createTextOwner(props.object, editing.descriptionClass.value)
      if (owner) setText(owner, draft.value, draftType.value)
    })
  }
  editMode.value = false
}

/** The attribute that holds the text, as the label above it */
const fieldName = computed(() => (isRemarkText.value ? 'Remark' : 'body'))

function typeLabel(type: TextType): string {
  return TEXT_TYPES.find(t => t.value === type)?.label ?? type
}
</script>

<template>
  <div class="text-view" :data-testid="testId" data-wire-kind="TEXT">
    <button
      v-if="!text && canCreate && !editMode"
      type="button"
      class="create"
      :data-testid="`${testId}.Create`"
      @click="startEdit"
    >+ Beschreibung</button>
    <template v-if="text || editMode">
      <div v-if="!editMode && text" class="rendered" :class="{ remark: text.remark }">
        <div class="text-bar">
          <span class="type" :title="`Texttyp: ${typeLabel(text.type)}${text.stored ? '' : ' (erkannt, noch nicht gespeichert)'}`">
            {{ fieldName }}
          </span>
          <button type="button" class="edit" title="Text bearbeiten" aria-label="Text bearbeiten" @click="startEdit">
            <i class="pi pi-pencil"></i>
          </button>
        </div>
        <div v-if="text.type === 'markdown' || text.type === 'html'" class="markdown" v-html="html"></div>
        <template v-else-if="text.type === 'mermaid'">
          <div v-if="mermaidSvg" class="mermaid-diagram" v-html="mermaidSvg"></div>
          <template v-else>
            <p v-if="mermaidError" class="mermaid-error">Mermaid-Fehler: {{ mermaidError }}</p>
            <pre class="mermaid-source">{{ text.body }}</pre>
          </template>
        </template>
        <template v-else>
          <p v-for="(p, i) in paragraphs" :key="i">{{ p }}</p>
        </template>
      </div>
      <div v-else class="editor">
        <div class="text-bar">
          <span v-if="isRemarkText" class="type" title="Beschreibungsfeld: Description vom Typ remark, nur Plain Text">remark</span>
          <select v-else v-model="draftType" aria-label="Texttyp" @change="typeChosen = true">
            <option v-for="t in TEXT_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
          <button type="button" class="link" @click="save">Fertig</button>
          <button type="button" class="link muted" @click="editMode = false">Abbrechen</button>
        </div>
        <div class="text-area">
          <textarea v-model="draft" rows="8" placeholder="Text"></textarea>
          <button
            type="button"
            class="copy"
            :title="copied ? 'Kopiert' : 'Text kopieren'"
            :aria-label="copied ? 'Kopiert' : 'Text kopieren'"
            @click="copyDraft"
          ><i :class="copied ? 'pi pi-check' : 'pi pi-copy'"></i></button>
        </div>
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
  font-size: 0.8rem;
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

/* Like "+ Referenz": a quiet link to start the table's description */
.create {
  font: inherit;
  font-size: 0.75rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--primary-color);
  cursor: pointer;
}

/* Grey pencil, primary on hover, only while the text is hovered (or the pencil has the keyboard focus) */
.edit {
  visibility: hidden;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-color-secondary);
  cursor: pointer;
}

.edit .pi {
  font-size: 0.6rem;
}

.edit:hover {
  color: var(--primary-color);
}

.text-view:hover .edit,
.edit:focus-visible {
  visibility: visible;
}

.link.muted {
  color: var(--text-color-secondary);
}

/* A remark is a short plain note - set like the tables below it */
.rendered.remark p {
  font-size: 0.85rem;
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

.mermaid-diagram {
  margin-top: 0.3rem;
  overflow-x: auto;
}

.mermaid-diagram :deep(svg) {
  max-width: 100%;
  height: auto;
}

.mermaid-error {
  margin: 0.3rem 0 0;
  font-size: 0.75rem;
  color: var(--red-500, #ef4444);
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

.text-area {
  position: relative;
}

.copy {
  position: absolute;
  top: 0.55rem;
  right: 0.4rem;
  padding: 0.15rem 0.3rem;
  font-size: 0.75rem;
  line-height: 1;
  border: 1px solid var(--surface-border);
  border-radius: 3px;
  background: var(--surface-card, var(--surface-ground));
  color: var(--text-color-secondary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s;
}

.text-area:hover .copy,
.copy:focus-visible {
  opacity: 1;
}

.copy:hover {
  color: var(--primary-color);
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
