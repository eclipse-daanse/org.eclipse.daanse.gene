<script setup lang="ts">
/**
 * RichTextEditor — HTML-String-Editor fuer RichTextWidget
 * (gene-widgets.ecore, Plan Abschnitt 10). Nutzt den PrimeVue-Editor
 * (Quill); ist er nicht registriert (oder quill nicht installiert),
 * degradiert die Komponente zu einer Textarea auf dem HTML-Quelltext —
 * kein Datenverlust.
 *
 * SICHERHEIT: Der Wert ist HTML aus einer Modelldatei — also nicht
 * vertrauenswuerdig (Instanzen kommen aus Git, Atlas-Servern, fremden
 * Workspaces). Quill rendert ihn in ein contenteditable; ein
 * `<img src=x onerror=...>` wuerde dabei ausgefuehrt. Deshalb wird in
 * BEIDE Richtungen mit DOMPurify bereinigt: beim Anzeigen und bevor der
 * Editor-Inhalt zurueck ins Modell geht.
 *
 * Das deckt zugleich GHSA-v3m3-f69x-jf25 ab (fehlende Validierung im
 * HTML-Export von Quill 2.0.3). Ein Downgrade auf 2.0.2 waere die
 * schlechtere Antwort: 2.0.3 ist die neueste Version, und das Grundproblem
 * — ungeprueftes HTML aus Modelldateien — bliebe unabhaengig davon bestehen.
 */
import { computed } from 'tsm:vue'
import * as primevue from 'tsm:primevue'
import { sanitizeHtml } from '../sanitizeHtml'

const props = withDefaults(defineProps<{
  modelValue?: string
  rows?: number
  readOnly?: boolean
  invalid?: boolean
}>(), {
  modelValue: '',
  rows: 10,
  readOnly: false,
  invalid: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const Editor = (primevue as Record<string, unknown>).Editor as object | undefined
const Textarea = (primevue as Record<string, unknown>).Textarea as object | undefined

const editorStyle = computed(() => ({ height: `${Math.max(4, props.rows) * 19}px` }))

/** Was der Editor zu sehen bekommt (Modell → Ansicht). */
const safeValue = computed(() => sanitizeHtml(props.modelValue))

/** Was ins Modell zurueckgeht (Ansicht → Modell). */
function onEditorChange(value: string | undefined) {
  const cleaned = sanitizeHtml(value)
  // Nur melden, wenn sich der bereinigte Wert wirklich unterscheidet —
  // sonst loest das Zurueckschreiben des sanitisierten Werts eine Schleife
  // aus, sobald der Editor beim Laden erneut emittiert.
  if (cleaned !== sanitizeHtml(props.modelValue)) emit('update:modelValue', cleaned)
}
</script>

<template>
  <component
    :is="Editor"
    v-if="Editor"
    class="richtext-editor"
    :class="{ 'richtext-editor--invalid': invalid }"
    :modelValue="safeValue"
    :readonly="readOnly"
    :editorStyle="editorStyle"
    @update:modelValue="onEditorChange"
  />
  <component
    :is="Textarea"
    v-else-if="Textarea"
    :modelValue="modelValue ?? ''"
    :disabled="readOnly"
    :invalid="invalid"
    :rows="Math.max(4, rows)"
    class="richtext-editor-fallback"
    @update:modelValue="onEditorChange"
  />
  <textarea
    v-else
    class="richtext-editor-fallback"
    :value="modelValue ?? ''"
    :disabled="readOnly"
    :rows="Math.max(4, rows)"
    @input="onEditorChange(($event.target as HTMLTextAreaElement).value)"
  ></textarea>
</template>

<style scoped>
.richtext-editor {
  width: 100%;
}

.richtext-editor--invalid :deep(.p-editor-content) {
  border-color: var(--p-red-500, #ef4444) !important;
}

.richtext-editor-fallback {
  width: 100%;
}
</style>
