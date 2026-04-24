<script setup lang="ts">
/**
 * FeelMonacoEditor - Monaco editor with FEEL language support via LSP worker.
 *
 * Features:
 * - FEEL syntax highlighting (Monarch tokenizer)
 * - Autocompletion (FEEL builtins, keywords, context variables)
 * - Hover tooltips
 * - Real-time diagnostics
 *
 * Usage:
 *   <FeelMonacoEditor v-model="expression" :height="28" singleLine />
 */

import { ref, onMounted, onUnmounted, watch, shallowRef } from 'tsm:vue'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { getSharedFeelClient } from '../composables/useFeelLanguageClient'
import type { LspCompletionItem, LspDiagnostic } from '../composables/useFeelLanguageClient'

// Configure Monaco's built-in editor worker
if (!(self as any).MonacoEnvironment) {
  ;(self as any).MonacoEnvironment = {
    getWorker() {
      return new editorWorker()
    }
  }
}

const props = withDefaults(defineProps<{
  modelValue?: string
  height?: number
  readOnly?: boolean
  singleLine?: boolean
  isUnaryTest?: boolean
}>(), {
  modelValue: '',
  height: 28,
  readOnly: false,
  singleLine: true,
  isUnaryTest: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'commit': []
  'cancel': []
}>()

const editorContainer = ref<HTMLDivElement | null>(null)
const editorInstance = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark-theme')
}

// Unique URI for this editor instance
const documentUri = `inmemory://feel/${Date.now()}-${Math.random().toString(36).slice(2)}.feel`
let documentVersion = 1

// LSP client
const lspClient = getSharedFeelClient()
let lspInitialized = false
let disposeDiagnostics: (() => void) | null = null

// --- Register FEEL language (once) ---

let feelLanguageRegistered = false

function registerFeelLanguage() {
  if (feelLanguageRegistered) return
  feelLanguageRegistered = true

  monaco.languages.register({ id: 'feel', extensions: ['.feel'] })

  // Monarch tokenizer for FEEL syntax highlighting
  monaco.languages.setMonarchTokensProvider('feel', {
    keywords: [
      'if', 'then', 'else',
      'for', 'in', 'return',
      'some', 'every', 'satisfies',
      'function', 'instance', 'of',
      'between', 'and', 'or', 'not',
      'true', 'false', 'null',
    ],
    builtins: [
      'date', 'time', 'duration', 'number', 'string',
      'sum', 'count', 'min', 'max', 'mean',
      'abs', 'floor', 'ceiling', 'sqrt', 'log', 'exp',
      'even', 'odd', 'modulo', 'decimal',
      'contains', 'matches', 'replace', 'split',
      'append', 'concatenate', 'reverse', 'flatten', 'sort',
      'now', 'today', 'not',
    ],
    operators: [
      '**', '!=', '<=', '>=', '..', '+', '-', '*', '/', '=', '<', '>',
    ],
    tokenizer: {
      root: [
        [/\/\/[^\n\r]*/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/"[^"]*"/, 'string'],
        [/\d+(\.\d+)?/, 'number'],
        [/\.\./, 'operator'],
        [/\*\*/, 'operator'],
        [/!=/, 'operator'],
        [/<=|>=/, 'operator'],
        [/[+\-*/=<>]/, 'operator'],
        [/[(){}[\],;:|]/, 'delimiter'],
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@builtins': 'type.identifier',
            '@default': 'identifier',
          }
        }],
        [/\s+/, 'white'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
    }
  })

  // Completion provider
  monaco.languages.registerCompletionItemProvider('feel', {
    triggerCharacters: ['.'],
    provideCompletionItems: async (model, position) => {
      if (!lspInitialized) return { suggestions: [] }

      try {
        const items = await lspClient.completion(documentUri, {
          line: position.lineNumber - 1,
          character: position.column - 1
        })
        return {
          suggestions: items.map(item => mapCompletionItem(item, position))
        }
      } catch (e) {
        console.warn('[FeelEditor] Completion error:', e)
        return { suggestions: [] }
      }
    }
  })

  // Hover provider
  monaco.languages.registerHoverProvider('feel', {
    provideHover: async (_model, position) => {
      if (!lspInitialized) return null

      try {
        const hover = await lspClient.hover(documentUri, {
          line: position.lineNumber - 1,
          character: position.column - 1
        })
        if (!hover) return null

        let contents: string
        if (typeof hover.contents === 'string') {
          contents = hover.contents
        } else if ('kind' in hover.contents) {
          contents = hover.contents.value
        } else if (Array.isArray(hover.contents)) {
          contents = hover.contents.map(c =>
            typeof c === 'string' ? c : c.value
          ).join('\n\n')
        } else {
          contents = String(hover.contents)
        }

        return {
          contents: [{ value: contents }]
        }
      } catch {
        return null
      }
    }
  })
}

function mapCompletionItem(item: LspCompletionItem, position: monaco.Position): monaco.languages.CompletionItem {
  const kindMap: Record<number, monaco.languages.CompletionItemKind> = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    14: monaco.languages.CompletionItemKind.Keyword,
  }

  const word = editorInstance.value?.getModel()?.getWordUntilPosition(position)

  return {
    label: item.label,
    kind: kindMap[item.kind ?? 1] ?? monaco.languages.CompletionItemKind.Text,
    detail: item.detail,
    documentation: typeof item.documentation === 'string'
      ? item.documentation
      : item.documentation
        ? (item.documentation as { value: string }).value
        : undefined,
    insertText: item.insertText ?? item.label,
    sortText: item.sortText,
    range: {
      startLineNumber: position.lineNumber,
      startColumn: word?.startColumn ?? position.column,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    }
  }
}

// --- LSP Diagnostics -> Monaco markers ---

function applyDiagnostics(uri: string, diagnostics: LspDiagnostic[]) {
  if (uri !== documentUri || !editorInstance.value) return

  const model = editorInstance.value.getModel()
  if (!model) return

  const severityMap: Record<number, monaco.MarkerSeverity> = {
    1: monaco.MarkerSeverity.Error,
    2: monaco.MarkerSeverity.Warning,
    3: monaco.MarkerSeverity.Info,
    4: monaco.MarkerSeverity.Hint,
  }

  const markers: monaco.editor.IMarkerData[] = diagnostics.map(d => ({
    severity: severityMap[d.severity ?? 1] ?? monaco.MarkerSeverity.Error,
    message: d.message,
    startLineNumber: d.range.start.line + 1,
    startColumn: d.range.start.character + 1,
    endLineNumber: d.range.end.line + 1,
    endColumn: d.range.end.character + 1,
    source: d.source ?? 'feel',
  }))

  monaco.editor.setModelMarkers(model, 'feel', markers)
}

// --- Lifecycle ---

onMounted(async () => {
  if (!editorContainer.value) return

  registerFeelLanguage()

  const editor = monaco.editor.create(editorContainer.value, {
    value: props.modelValue,
    language: 'feel',
    theme: isDarkMode() ? 'vs-dark' : 'vs',
    minimap: { enabled: false },
    lineNumbers: 'off',
    glyphMargin: false,
    folding: false,
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 0,
    scrollBeyondLastLine: false,
    overviewRulerLanes: 0,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    renderLineHighlight: 'none',
    scrollbar: {
      vertical: props.singleLine ? 'hidden' : 'auto',
      horizontal: 'hidden',
      handleMouseWheel: !props.singleLine,
    },
    wordWrap: props.singleLine ? 'off' : 'on',
    readOnly: props.readOnly,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    padding: { top: 2, bottom: 2 },
    automaticLayout: true,
    fixedOverflowWidgets: true,
  })

  editorInstance.value = editor

  // Sync content changes
  editor.onDidChangeModelContent(() => {
    const text = editor.getValue()
    emit('update:modelValue', text)

    if (lspInitialized) {
      documentVersion++
      lspClient.didChange(documentUri, documentVersion, text)
    }
  })

  // Enter -> commit in single-line mode
  if (props.singleLine) {
    editor.addCommand(monaco.KeyCode.Enter, () => {
      emit('commit')
    })
    editor.addCommand(monaco.KeyCode.Escape, () => {
      emit('cancel')
    })
  }

  // Initialize LSP
  try {
    await lspClient.initialize()
    lspInitialized = true
    lspClient.didOpen(documentUri, props.modelValue)

    disposeDiagnostics = lspClient.onDiagnostics(applyDiagnostics)
  } catch (e) {
    console.warn('[FeelEditor] LSP init failed:', e)
  }

  // Watch for theme changes
  themeObserver = new MutationObserver(() => {
    const newTheme = isDarkMode() ? 'vs-dark' : 'vs'
    monaco.editor.setTheme(newTheme)
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  })
})

let themeObserver: MutationObserver | null = null

onUnmounted(() => {
  themeObserver?.disconnect()
  if (lspInitialized) {
    lspClient.didClose(documentUri)
  }
  disposeDiagnostics?.()
  editorInstance.value?.dispose()
})

// Watch external modelValue changes
watch(() => props.modelValue, (newVal) => {
  const editor = editorInstance.value
  if (!editor) return

  if (editor.getValue() !== newVal) {
    editor.setValue(newVal)

    if (lspInitialized) {
      documentVersion++
      lspClient.didChange(documentUri, documentVersion, newVal)
    }
  }
})

/** Focus the editor programmatically */
function focus() {
  editorInstance.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <div
    ref="editorContainer"
    class="feel-monaco-editor"
    :style="{ height: `${height}px` }"
  />
</template>

<style scoped>
.feel-monaco-editor {
  width: 100%;
  border: 1px solid var(--surface-border, #e2e8f0);
  border-radius: 3px;
  overflow: hidden;
}

.feel-monaco-editor:focus-within {
  border-color: var(--primary-color, #6366f1);
}
</style>
