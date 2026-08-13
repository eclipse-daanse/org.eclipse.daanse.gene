<script setup lang="ts">
/**
 * StringEditorField — Feld-Wrapper fuer die gene String-Editor-Widgets
 * (CodeWidget/MarkdownWidget/RichTextWidget aus gene-widgets.ecore).
 * Optik (Label, Pflicht-Stern, Fehlertext) analog AttributeField des
 * instance-builder; der eigentliche Editor haengt am Widget-Typ.
 */
import { computed } from 'tsm:vue'
import type { EStructuralFeature } from '@emfts/core'
import MonacoStringEditor from './MonacoStringEditor.vue'
import MarkdownEditor from './MarkdownEditor.vue'
import RichTextEditor from './RichTextEditor.vue'
import type { GeneStringWidgetClass } from '../geneWidgetsPackage'

const props = defineProps<{
  feature: EStructuralFeature
  value: unknown
  widgetKind: GeneStringWidgetClass
  label?: string
  readonly?: boolean
  error?: string
  /** Widget-Attribute aus dem genew-Prototyp */
  language?: string
  rows?: number
  lineNumbers?: boolean
  preview?: boolean
  toolbar?: boolean
}>()

const emit = defineEmits<{
  'update:value': [value: string]
}>()

const featureName = computed(() => props.feature.getName() ?? '')

const displayName = computed(() => {
  if (props.label) return props.label
  return featureName.value.replace(/([A-Z])/g, ' $1').replace(/^./, (str: string) => str.toUpperCase())
})

const isRequired = computed(() => (props.feature.getLowerBound?.() ?? 0) > 0)

const effectiveLanguage = computed(() => props.language ?? '')

function onUpdate(v: string) {
  emit('update:value', v)
}
</script>

<template>
  <div class="attribute-field string-editor-field" :data-widget-kind="widgetKind">
    <label :for="featureName" class="field-label">
      {{ displayName }}
      <span v-if="isRequired" class="required-indicator">*</span>
    </label>

    <RichTextEditor
      v-if="widgetKind === 'RichTextWidget'"
      :modelValue="(value as string) ?? ''"
      :rows="rows"
      :readOnly="readonly"
      :invalid="!!error"
      @update:modelValue="onUpdate"
    />
    <MarkdownEditor
      v-else-if="widgetKind === 'MarkdownWidget'"
      :modelValue="(value as string) ?? ''"
      :rows="rows"
      :preview="preview ?? true"
      :toolbar="toolbar ?? true"
      :readOnly="readonly"
      :invalid="!!error"
      @update:modelValue="onUpdate"
    />
    <MonacoStringEditor
      v-else
      :modelValue="(value as string) ?? ''"
      :language="effectiveLanguage"
      :rows="rows"
      :lineNumbers="lineNumbers ?? true"
      :readOnly="readonly"
      :invalid="!!error"
      @update:modelValue="onUpdate"
    />

    <small v-if="error" class="field-error">{{ error }}</small>
  </div>
</template>

<style scoped>
/* Paritaet mit AttributeField (instance-builder) */
.attribute-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field-label {
  font-weight: 600;
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.required-indicator {
  color: var(--p-red-500, #ef4444);
}

.field-error {
  color: var(--p-red-500, #ef4444);
  font-size: 0.75rem;
}
</style>
