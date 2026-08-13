<script setup lang="ts">
/**
 * RichTextEditor — HTML-String-Editor fuer RichTextWidget
 * (gene-widgets.ecore, Plan Abschnitt 10). Nutzt den PrimeVue-Editor
 * (Quill); ist er nicht registriert (oder quill nicht installiert),
 * degradiert die Komponente zu einer Textarea auf dem HTML-Quelltext —
 * kein Datenverlust.
 */
import { computed } from 'tsm:vue'
import * as primevue from 'tsm:primevue'

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

function onEditorChange(value: string | undefined) {
  emit('update:modelValue', value ?? '')
}
</script>

<template>
  <component
    :is="Editor"
    v-if="Editor"
    class="richtext-editor"
    :class="{ 'richtext-editor--invalid': invalid }"
    :modelValue="modelValue ?? ''"
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
