<script setup lang="ts">
/**
 * OclMonacoEditor - Monaco editor with OCL language support via LSP worker.
 *
 * Features:
 * - OCL syntax highlighting
 * - Autocompletion (classes, features, OCL keywords, collection operations)
 * - Hover tooltips
 * - Real-time diagnostics
 *
 * Usage:
 *   <OclMonacoEditor v-model="expression" :height="80" />
 */

import { ref, onMounted, onUnmounted, watch, shallowRef } from 'tsm:vue'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { getSharedOclClient } from '../composables/useOclLanguageClient'
import type { LspCompletionItem, LspDiagnostic } from '../composables/useOclLanguageClient'

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
  language?: string
  contextClass?: string
  readOnly?: boolean
  singleLine?: boolean
}>(), {
  modelValue: '',
  height: 60,
  language: 'ocl',
  contextClass: '',
  readOnly: false,
  singleLine: true
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorContainer = ref<HTMLDivElement | null>(null)
const editorInstance = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)

// Detect dark mode from document class
function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark-theme')
}

// Unique URI for this editor instance
const documentUri = `inmemory://ocl/${Date.now()}-${Math.random().toString(36).slice(2)}.ocl`
let documentVersion = 1

// LSP client
const lspClient = getSharedOclClient()
let lspInitialized = false
let disposeDiagnostics: (() => void) | null = null

// --- Register OCL language (once) ---

let oclLanguageRegistered = false

function registerOclLanguage() {
  if (oclLanguageRegistered) return
  oclLanguageRegistered = true

  monaco.languages.register({ id: 'ocl', extensions: ['.ocl'] })

  // Monarch tokenizer for OCL syntax highlighting
  monaco.languages.setMonarchTokensProvider('ocl', {
    keywords: [
      'context', 'inv', 'pre', 'post', 'body', 'derive', 'init',
      'let', 'in', 'if', 'then', 'else', 'endif',
      'and', 'or', 'not', 'implies', 'xor',
      'div', 'mod', 'self', 'null', 'invalid',
      'true', 'false',
      'Set', 'OrderedSet', 'Bag', 'Sequence', 'Collection', 'Tuple',
      'OclAny', 'OclVoid', 'OclInvalid',
      'VALIDATION', 'DERIVED', 'REFERENCE_FILTER',
    ],
    operators: [
      '->', '.', '::', '=', '<>', '<', '>', '<=', '>=', '+', '-', '*', '/', '@'
    ],
    tokenizer: {
      root: [
        [/--.*$/, 'comment'],
        [/'[^']*'/, 'string'],
        [/"[^"]*"/, 'string'],
        [/\d+(\.\d+)?/, 'number'],
        [/->/, 'operator'],
        [/::/, 'operator'],
        [/<>/, 'operator'],
        [/<=|>=/, 'operator'],
        [/[+\-*/=<>@.]/, 'operator'],
        [/[(){}[\],;:|]/, 'delimiter'],
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@default': 'identifier'
          }
        }],
        [/\s+/, 'white'],
      ]
    }
  })

  // Completion provider
  monaco.languages.registerCompletionItemProvider('ocl', {
    triggerCharacters: ['.', '>', ':'],
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
        console.warn('[OclEditor] Completion error:', e)
        return { suggestions: [] }
      }
    }
  })

  // Hover provider
  monaco.languages.registerHoverProvider('ocl', {
    provideHover: async (model, position) => {
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
      } catch (e) {
        return null
      }
    }
  })
}

function mapCompletionItem(item: LspCompletionItem, position: monaco.Position): monaco.languages.CompletionItem {
  // Map LSP CompletionItemKind to Monaco
  const kindMap: Record<number, monaco.languages.CompletionItemKind> = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    13: monaco.languages.CompletionItemKind.Enum,
    14: monaco.languages.CompletionItemKind.Keyword,
    18: monaco.languages.CompletionItemKind.Reference,
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

// --- LSP Diagnostics → Monaco markers ---

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
    source: d.source ?? 'ocl',
  }))

  monaco.editor.setModelMarkers(model, 'ocl', markers)
}

// --- Lifecycle ---

onMounted(async () => {
  if (!editorContainer.value) return

  registerOclLanguage()

  // Build the document content: wrap expression in context if contextClass is set
  const fullText = buildDocumentText(props.modelValue)

  const editor = monaco.editor.create(editorContainer.value, {
    value: fullText,
    language: 'ocl',
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
    padding: { top: 4, bottom: 4 },
    automaticLayout: true,
    fixedOverflowWidgets: true,
  })

  editorInstance.value = editor

  // Sync content changes → emit modelValue
  editor.onDidChangeModelContent(() => {
    const text = editor.getValue()
    const expression = extractExpression(text)
    emit('update:modelValue', expression)

    // Update LSP
    if (lspInitialized) {
      documentVersion++
      lspClient.didChange(documentUri, documentVersion, text)
    }
  })

  // Prevent Enter in single-line mode
  if (props.singleLine) {
    editor.addCommand(monaco.KeyCode.Enter, () => {
      // no-op: prevent newlines
    })
  }

  // Initialize LSP
  try {
    await lspClient.initialize()
    lspInitialized = true
    lspClient.didOpen(documentUri, fullText)

    disposeDiagnostics = lspClient.onDiagnostics(applyDiagnostics)
  } catch (e) {
    console.warn('[OclEditor] LSP init failed:', e)
  }

  // Watch for theme changes (dark-theme class on <html>)
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

  const currentExpression = extractExpression(editor.getValue())
  if (currentExpression !== newVal) {
    const fullText = buildDocumentText(newVal)
    editor.setValue(fullText)

    if (lspInitialized) {
      documentVersion++
      lspClient.didChange(documentUri, documentVersion, fullText)
    }
  }
})

// Watch contextClass changes to re-wrap the document
watch(() => props.contextClass, () => {
  const editor = editorInstance.value
  if (!editor) return

  const expression = extractExpression(editor.getValue())
  const fullText = buildDocumentText(expression)
  editor.setValue(fullText)

  if (lspInitialized) {
    documentVersion++
    lspClient.didChange(documentUri, documentVersion, fullText)
  }
})

// --- Helpers ---

function buildDocumentText(expression: string): string {
  if (props.contextClass) {
    // Wrap as valid OCL: ClassifierContext with an invariant constraint
    // Grammar: 'context' type=QualifiedName 'inv' (name=ID)? ':' expression=Expression
    return `context ${props.contextClass} inv _: ${expression}`
  }
  return expression
}

function extractExpression(text: string): string {
  if (props.contextClass) {
    const prefix = `context ${props.contextClass} inv _: `
    if (text.startsWith(prefix)) {
      return text.slice(prefix.length)
    }
    // Fallback: find 'inv _: ' marker
    const marker = 'inv _: '
    const idx = text.indexOf(marker)
    if (idx >= 0) return text.slice(idx + marker.length)
  }
  return text
}
</script>

<template>
  <div
    ref="editorContainer"
    class="ocl-monaco-editor"
    :style="{ height: `${height}px` }"
  />
</template>

<style scoped>
.ocl-monaco-editor {
  width: 100%;
  border: 1px solid var(--surface-border, #e2e8f0);
  border-radius: 4px;
  overflow: hidden;
}
</style>
