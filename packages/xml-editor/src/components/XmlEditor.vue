<script setup lang="ts">
/**
 * XmlEditor - the text of one XMI/Ecore/XML file in Monaco.
 *
 * Plain text editing with XML highlighting, line numbers and folding. Every
 * change goes straight into the tab's document, so nothing is lost when the
 * tab steps back; saving writes the text to the file it came from.
 *
 * Saving: Ctrl+S in the editor, or the save entry of the menu bar, which
 * arrives as 'xml:save' on the event bus - only the tab in front is mounted,
 * so only it answers.
 */
import { inject, onMounted, onUnmounted, ref, shallowRef } from 'tsm:vue'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import type { XmlDocument } from '../composables/tabDocuments'

// Configure Monaco's built-in editor worker (shared with the other Monaco editors)
if (!(self as any).MonacoEnvironment) {
  ;(self as any).MonacoEnvironment = {
    getWorker() {
      return new editorWorker()
    }
  }
}

const props = defineProps<{
  tabId: string
  document: XmlDocument
}>()

const tsm = inject<any>('tsm')
const layout = tsm?.getService('ui.layout.state')?.useLayoutState?.()
const eventBus = tsm?.getService('gene.eventbus')

const editorContainer = ref<HTMLDivElement | null>(null)
const editorInstance = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveError = ref<string | null>(null)

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark-theme')
}

function markDirty(dirty: boolean): void {
  props.document.dirty = dirty
  layout?.setEditorDirty?.(props.tabId, dirty)
}

async function save(): Promise<void> {
  const editor = editorInstance.value
  if (!editor) return
  const text = editor.getValue()
  const fs = tsm?.getService('gene.filesystem')
  if (!fs?.writeTextFile || !props.document.fileEntry) {
    saveStatus.value = 'error'
    saveError.value = 'Keine Datei zum Schreiben - die Datei kam nicht aus dem Explorer.'
    return
  }
  saveStatus.value = 'saving'
  saveError.value = null
  try {
    await fs.writeTextFile(props.document.fileEntry, text)
    props.document.content = text
    markDirty(false)
    saveStatus.value = 'saved'
    setTimeout(() => { if (saveStatus.value === 'saved') saveStatus.value = 'idle' }, 2000)
  } catch (e: any) {
    saveStatus.value = 'error'
    saveError.value = e?.message ?? String(e)
    console.error('[XmlEditor] Speichern fehlgeschlagen:', props.document.filePath, e)
  }
}

function onSaveRequest(): void {
  void save()
}

let themeObserver: MutationObserver | null = null

onMounted(() => {
  if (!editorContainer.value) return

  const editor = monaco.editor.create(editorContainer.value, {
    value: props.document.content,
    language: 'xml',
    theme: isDarkMode() ? 'vs-dark' : 'vs',
    lineNumbers: 'on',
    minimap: { enabled: false },
    folding: true,
    wordWrap: 'off',
    scrollBeyondLastLine: false,
    renderWhitespace: 'selection',
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    tabSize: 2,
    automaticLayout: true,
    fixedOverflowWidgets: true
  })
  editorInstance.value = editor

  editor.onDidChangeModelContent(() => {
    const text = editor.getValue()
    props.document.content = text
    if (!props.document.dirty) markDirty(true)
  })

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { void save() })

  eventBus?.on?.('xml:save', onSaveRequest)

  themeObserver = new MutationObserver(() => {
    monaco.editor.setTheme(isDarkMode() ? 'vs-dark' : 'vs')
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

  // Reopened with unsaved text: the tab shows it as dirty again
  if (props.document.dirty) layout?.setEditorDirty?.(props.tabId, true)
})

onUnmounted(() => {
  eventBus?.off?.('xml:save', onSaveRequest)
  themeObserver?.disconnect()
  editorInstance.value?.dispose()
})

defineExpose({ save })
</script>

<template>
  <div class="xml-editor">
    <div class="xml-editor-status" :class="saveStatus">
      <span class="path" :title="document.filePath">{{ document.filePath }}</span>
      <span v-if="document.dirty" class="dirty" title="Ungespeicherte Änderungen">● geändert</span>
      <span v-if="saveStatus === 'saving'">Speichern…</span>
      <span v-else-if="saveStatus === 'saved'">Gespeichert</span>
      <span v-else-if="saveStatus === 'error'" class="error" :title="saveError ?? ''">Speichern fehlgeschlagen: {{ saveError }}</span>
      <span class="hint">Strg+S speichert</span>
    </div>
    <div ref="editorContainer" class="xml-editor-monaco"></div>
  </div>
</template>

<style scoped>
.xml-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.xml-editor-status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-section);
}

.xml-editor-status .path {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.xml-editor-status .dirty {
  color: var(--primary-color);
}

.xml-editor-status .error {
  color: var(--red-500, #ef4444);
}

.xml-editor-status .hint {
  opacity: 0.7;
}

.xml-editor-monaco {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
