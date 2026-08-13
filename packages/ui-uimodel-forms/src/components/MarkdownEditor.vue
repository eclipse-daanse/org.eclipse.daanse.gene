<script setup lang="ts">
/**
 * MarkdownEditor — echter Markdown-Editor fuer MarkdownWidget
 * (gene-widgets.ecore, Plan Abschnitt 10): Formatierungsleiste,
 * Quelltext-Editor (Monaco) und gerenderte Vorschau.
 *
 * Der Wert bleibt der Markdown-QUELLTEXT — die Vorschau ist reine
 * Darstellung. Gerendertes HTML wird mit DOMPurify bereinigt, bevor es
 * ins DOM geht (Modelldaten koennen beliebiges HTML enthalten).
 */
import { computed, ref } from 'tsm:vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import MonacoStringEditor from './MonacoStringEditor.vue'

const props = withDefaults(defineProps<{
  modelValue?: string
  rows?: number
  preview?: boolean
  toolbar?: boolean
  readOnly?: boolean
  invalid?: boolean
}>(), {
  modelValue: '',
  rows: 10,
  preview: true,
  toolbar: true,
  readOnly: false,
  invalid: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const mode = ref<'edit' | 'preview'>('edit')
const editorRef = ref<InstanceType<typeof MonacoStringEditor> | null>(null)

marked.setOptions({ gfm: true, breaks: false })

const renderedHtml = computed(() => {
  const source = props.modelValue ?? ''
  if (!source.trim()) return '<p class="markdown-empty">Keine Inhalte</p>'
  try {
    const html = marked.parse(source, { async: false }) as string
    return DOMPurify.sanitize(html)
  } catch (e) {
    return `<p class="markdown-empty">Vorschau nicht moeglich: ${String(e)}</p>`
  }
})

interface ToolbarAction {
  title: string
  /** PrimeIcons-Klasse; fehlt sie, wird `glyph` als Buchstabe gerendert */
  icon?: string
  /** Textzeichen fuer Aktionen ohne PrimeIcon (kein pi-bold/pi-italic) */
  glyph?: string
  glyphStyle?: 'bold' | 'italic'
  run: () => void
}

const actions = computed<ToolbarAction[]>(() => {
  const editor = () => editorRef.value as unknown as {
    wrapSelection: (b: string, a?: string, p?: string) => void
    toggleLinePrefix: (p: string) => void
  } | null
  return [
    { glyph: 'B', glyphStyle: 'bold', title: 'Fett', run: () => editor()?.wrapSelection('**') },
    { glyph: 'I', glyphStyle: 'italic', title: 'Kursiv', run: () => editor()?.wrapSelection('*') },
    { icon: 'pi pi-hashtag', title: 'Ueberschrift', run: () => editor()?.toggleLinePrefix('## ') },
    { icon: 'pi pi-list', title: 'Liste', run: () => editor()?.toggleLinePrefix('- ') },
    { icon: 'pi pi-link', title: 'Link', run: () => editor()?.wrapSelection('[', '](url)', 'Titel') },
    { icon: 'pi pi-code', title: 'Code', run: () => editor()?.wrapSelection('`') }
  ]
})

function onUpdate(v: string) {
  emit('update:modelValue', v)
}
</script>

<template>
  <div class="markdown-editor" :class="{ 'markdown-editor--invalid': invalid }">
    <div v-if="toolbar || preview" class="markdown-editor__bar">
      <div v-if="toolbar && mode === 'edit'" class="markdown-editor__actions">
        <button
          v-for="action in actions"
          :key="action.title"
          type="button"
          class="markdown-editor__btn"
          :title="action.title"
          :disabled="readOnly"
          @click="action.run()"
        >
          <i v-if="action.icon" :class="action.icon"></i>
          <span
            v-else
            class="markdown-editor__glyph"
            :class="`markdown-editor__glyph--${action.glyphStyle}`"
          >{{ action.glyph }}</span>
        </button>
      </div>
      <div v-else class="markdown-editor__actions"></div>

      <div v-if="preview" class="markdown-editor__modes">
        <button
          type="button"
          class="markdown-editor__btn"
          :class="{ 'markdown-editor__btn--active': mode === 'edit' }"
          @click="mode = 'edit'"
        >Bearbeiten</button>
        <button
          type="button"
          class="markdown-editor__btn"
          :class="{ 'markdown-editor__btn--active': mode === 'preview' }"
          @click="mode = 'preview'"
        >Vorschau</button>
      </div>
    </div>

    <MonacoStringEditor
      v-show="mode === 'edit'"
      ref="editorRef"
      :modelValue="modelValue ?? ''"
      language="markdown"
      :rows="rows"
      :lineNumbers="false"
      :readOnly="readOnly"
      :invalid="invalid"
      @update:modelValue="onUpdate"
    />

    <!-- Vorschau: mit DOMPurify bereinigtes Markdown-HTML -->
    <div
      v-if="preview && mode === 'preview'"
      class="markdown-editor__preview"
      :style="{ minHeight: Math.max(2, rows) * 19 + 12 + 'px' }"
      v-html="renderedHtml"
    ></div>
  </div>
</template>

<style scoped>
.markdown-editor {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  width: 100%;
}

.markdown-editor__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.markdown-editor__actions,
.markdown-editor__modes {
  display: flex;
  gap: 0.15rem;
}

.markdown-editor__btn {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--text-color-secondary);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.2rem 0.4rem;
  line-height: 1.2;
}

/* Icons auf Glyph-Groesse bringen (PrimeIcons default 1rem) */
.markdown-editor__btn .pi {
  font-size: 0.875rem;
  width: 1rem;
  text-align: center;
}

.markdown-editor__btn:hover:not(:disabled) {
  background: var(--surface-hover, rgba(127, 127, 127, 0.15));
  color: var(--text-color);
}

.markdown-editor__btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* Buchstaben-Glyphen (B/I): PrimeIcons hat kein pi-bold/pi-italic.
   Breite an die 1rem-Icons angepasst, damit die Leiste gleichmaessig wirkt. */
.markdown-editor__glyph {
  display: inline-block;
  width: 1rem;
  text-align: center;
  font-size: 0.875rem;
  line-height: 1;
  font-family: Georgia, 'Times New Roman', serif;
}

.markdown-editor__glyph--bold { font-weight: 800; }
.markdown-editor__glyph--italic { font-style: italic; font-weight: 600; }

.markdown-editor__btn--active {
  background: color-mix(in srgb, var(--primary-color, #6366f1) 18%, transparent);
  border-color: color-mix(in srgb, var(--primary-color, #6366f1) 40%, transparent);
  color: var(--text-color);
}

.markdown-editor__preview {
  border: 1px solid var(--surface-border, #334155);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  overflow: auto;
  font-size: 0.875rem;
  line-height: 1.5;
}

.markdown-editor--invalid .markdown-editor__preview {
  border-color: var(--p-red-500, #ef4444);
}

/* Gerendertes Markdown (v-html → nicht scoped, deshalb :deep) */
.markdown-editor__preview :deep(h1),
.markdown-editor__preview :deep(h2),
.markdown-editor__preview :deep(h3) {
  margin: 0.4em 0 0.3em;
  line-height: 1.25;
}
.markdown-editor__preview :deep(h1) { font-size: 1.35em; }
.markdown-editor__preview :deep(h2) { font-size: 1.2em; }
.markdown-editor__preview :deep(h3) { font-size: 1.05em; }
.markdown-editor__preview :deep(p) { margin: 0.4em 0; }
.markdown-editor__preview :deep(ul),
.markdown-editor__preview :deep(ol) { margin: 0.4em 0; padding-left: 1.4em; }
.markdown-editor__preview :deep(code) {
  background: var(--surface-hover, rgba(127, 127, 127, 0.15));
  border-radius: 3px;
  padding: 0.1em 0.3em;
  font-size: 0.9em;
}
.markdown-editor__preview :deep(pre) {
  background: var(--surface-hover, rgba(127, 127, 127, 0.15));
  border-radius: 4px;
  padding: 0.5em 0.7em;
  overflow-x: auto;
}
.markdown-editor__preview :deep(pre code) { background: none; padding: 0; }
.markdown-editor__preview :deep(table) {
  border-collapse: collapse;
  margin: 0.4em 0;
}
.markdown-editor__preview :deep(th),
.markdown-editor__preview :deep(td) {
  border: 1px solid var(--surface-border, #334155);
  padding: 0.25em 0.5em;
  text-align: left;
}
.markdown-editor__preview :deep(blockquote) {
  border-left: 3px solid var(--surface-border, #334155);
  margin: 0.4em 0;
  padding-left: 0.7em;
  color: var(--text-color-secondary);
}
.markdown-editor__preview :deep(a) { color: var(--primary-color, #6366f1); }
.markdown-editor__preview :deep(img) { max-width: 100%; }
.markdown-editor__preview :deep(.markdown-empty) {
  color: var(--text-color-secondary);
  font-style: italic;
}
</style>
