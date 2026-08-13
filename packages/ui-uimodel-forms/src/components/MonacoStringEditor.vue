<script setup lang="ts">
/**
 * MonacoStringEditor — mehrzeiliger String-Editor mit Syntax-Highlighting
 * fuer CodeWidget/MarkdownWidget (gene-widgets.ecore, Plan Abschnitt 10).
 * Worker-Setup wie FeelMonacoEditor (dmn-editor) / OclMonacoEditor.
 */
import { ref, onMounted, onUnmounted, watch, shallowRef } from 'tsm:vue'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

if (!(self as any).MonacoEnvironment) {
  ;(self as any).MonacoEnvironment = {
    getWorker() {
      return new editorWorker()
    }
  }
}

const props = withDefaults(defineProps<{
  modelValue?: string
  /** Monaco-Sprach-Id ("json", "xml", "markdown", ...); leer = Plaintext */
  language?: string
  rows?: number
  lineNumbers?: boolean
  readOnly?: boolean
  invalid?: boolean
}>(), {
  modelValue: '',
  language: '',
  rows: 10,
  lineNumbers: true,
  readOnly: false,
  invalid: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const container = ref<HTMLDivElement | null>(null)
const editorInstance = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark-theme')
}

const heightPx = () => Math.max(2, props.rows) * 19 + 12

onMounted(() => {
  if (!container.value) return
  const editor = monaco.editor.create(container.value, {
    value: props.modelValue ?? '',
    language: props.language || 'plaintext',
    theme: isDarkMode() ? 'vs-dark' : 'vs',
    readOnly: props.readOnly,
    lineNumbers: props.lineNumbers ? 'on' : 'off',
    minimap: { enabled: false },
    folding: false,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    fontSize: 13,
    lineHeight: 19,
    padding: { top: 6, bottom: 6 },
    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    renderLineHighlight: 'none',
    wordWrap: props.language === 'markdown' ? 'on' : 'off'
  })
  editorInstance.value = editor

  // Zeilenenden auf LF zwingen: Monaco waehlt sonst je nach Ausgangstext
  // CRLF und schreibt \r\n in das EMF-Attribut — ein Textarea (bisheriger
  // Pfad) liefert \n. Ohne das haengt der gespeicherte Wert davon ab,
  // welches Widget zuletzt aktiv war.
  editor.getModel()?.setEOL(monaco.editor.EndOfLineSequence.LF)

  editor.onDidChangeModelContent(() => {
    const text = editor.getValue()
    if (text !== props.modelValue) emit('update:modelValue', text)
  })
})

// Externe Wert-Aenderungen uebernehmen — nicht waehrend der Nutzer tippt,
// sonst springt der Cursor.
watch(() => props.modelValue, (v: string | undefined) => {
  const editor = editorInstance.value
  if (!editor || editor.hasTextFocus()) return
  if ((v ?? '') !== editor.getValue()) {
    editor.setValue(v ?? '')
    editor.getModel()?.setEOL(monaco.editor.EndOfLineSequence.LF)
  }
})

watch(() => props.readOnly, (ro: boolean) => {
  editorInstance.value?.updateOptions({ readOnly: ro })
})

watch(() => props.language, (lang: string | undefined) => {
  const model = editorInstance.value?.getModel()
  if (model) monaco.editor.setModelLanguage(model, lang || 'plaintext')
})

onUnmounted(() => {
  editorInstance.value?.dispose()
  editorInstance.value = null
})

/**
 * Text um die aktuelle Selektion legen (Markdown-Toolbar). Ohne Selektion
 * wird der Platzhalter eingefuegt und markiert, damit direkt weitergetippt
 * werden kann. Laeuft ueber executeEdits, damit Undo/Redo funktioniert.
 */
function wrapSelection(before: string, after = before, placeholder = 'Text') {
  const editor = editorInstance.value
  if (!editor) return
  const selection = editor.getSelection()
  const model = editor.getModel()
  if (!selection || !model) return
  const selected = model.getValueInRange(selection) || placeholder
  editor.executeEdits('markdown-toolbar', [
    { range: selection, text: `${before}${selected}${after}`, forceMoveMarkers: true }
  ])
  editor.focus()
}

/** Zeilenpraefix setzen/entfernen (Ueberschrift, Liste, Zitat). */
function toggleLinePrefix(prefix: string) {
  const editor = editorInstance.value
  const model = editor?.getModel()
  const selection = editor?.getSelection()
  if (!editor || !model || !selection) return
  const edits = []
  for (let line = selection.startLineNumber; line <= selection.endLineNumber; line++) {
    const text = model.getLineContent(line)
    const has = text.startsWith(prefix)
    edits.push({
      range: new monaco.Range(line, 1, line, has ? prefix.length + 1 : 1),
      text: has ? '' : prefix,
      forceMoveMarkers: true
    })
  }
  editor.executeEdits('markdown-toolbar', edits)
  editor.focus()
}

defineExpose({ wrapSelection, toggleLinePrefix })
</script>

<template>
  <div
    class="monaco-string-editor"
    :class="{ 'monaco-string-editor--invalid': invalid }"
    :style="{ height: heightPx() + 'px' }"
  >
    <div ref="container" class="monaco-string-editor__host"></div>
  </div>
</template>

<style scoped>
.monaco-string-editor {
  width: 100%;
  border: 1px solid var(--surface-border, #334155);
  border-radius: 6px;
  overflow: hidden;
}

.monaco-string-editor--invalid {
  border-color: var(--p-red-500, #ef4444);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--p-red-500, #ef4444) 40%, transparent);
}

.monaco-string-editor__host {
  width: 100%;
  height: 100%;
}
</style>
