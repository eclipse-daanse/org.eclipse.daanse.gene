<script setup lang="ts">
/**
 * FeelCell - FEEL expression cell with Monaco editor integration
 *
 * Two modes:
 * 1. Compact (default): Click-to-edit, shows value as text. Click opens single-line Monaco.
 * 2. Expand: Double-click opens full Monaco editor for complex expressions.
 */

import { ref, computed, watch, nextTick } from 'tsm:vue'
import { validateCell, validateUnaryTest } from '../composables/useFeelEngine'
import FeelMonacoEditor from './FeelMonacoEditor.vue'

const props = defineProps<{
  modelValue: string
  isUnaryTest?: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editing = ref(false)
const expanded = ref(false)
const editValue = ref(props.modelValue)
const validationError = ref<string | null>(null)
const monacoRef = ref<InstanceType<typeof FeelMonacoEditor> | null>(null)

watch(() => props.modelValue, (v) => {
  editValue.value = v
  validate(v)
})

// Validate on initialization
validate(props.modelValue)

function validate(value: string) {
  if (!value || value === '-' || value === '') {
    validationError.value = null
    return
  }

  const result = props.isUnaryTest
    ? validateUnaryTest(value)
    : validateCell(value)

  validationError.value = result.valid ? null : (result.error || 'Invalid FEEL expression')
}

function startEdit() {
  editing.value = true
  editValue.value = props.modelValue
  nextTick(() => {
    monacoRef.value?.focus()
  })
}

function startExpandedEdit() {
  expanded.value = true
  editing.value = true
  editValue.value = props.modelValue
  nextTick(() => {
    monacoRef.value?.focus()
  })
}

function handleMonacoUpdate(value: string) {
  editValue.value = value
}

function commitEdit() {
  editing.value = false
  expanded.value = false
  const newValue = editValue.value
  validate(newValue)
  if (newValue !== props.modelValue) {
    emit('update:modelValue', newValue)
  }
}

function cancelEdit() {
  editing.value = false
  expanded.value = false
  editValue.value = props.modelValue
}

const displayValue = computed(() => {
  return props.modelValue || (props.isUnaryTest ? '-' : '')
})

const hasError = computed(() => !!validationError.value)

const editorHeight = computed(() => expanded.value ? 120 : 28)
</script>

<template>
  <div
    class="feel-cell"
    :class="{ 'has-error': hasError, 'is-editing': editing, 'is-expanded': expanded }"
    :title="validationError || undefined"
  >
    <template v-if="editing">
      <FeelMonacoEditor
        ref="monacoRef"
        :modelValue="editValue"
        :height="editorHeight"
        :singleLine="!expanded"
        :isUnaryTest="isUnaryTest"
        @update:modelValue="handleMonacoUpdate"
        @commit="commitEdit"
        @cancel="cancelEdit"
      />
      <div v-if="expanded" class="expand-actions">
        <button class="expand-btn" title="Commit" @click="commitEdit">
          <i class="pi pi-check"></i>
        </button>
        <button class="expand-btn" title="Cancel" @click="cancelEdit">
          <i class="pi pi-times"></i>
        </button>
      </div>
    </template>
    <span
      v-else
      class="feel-display"
      :class="{ 'feel-placeholder': !modelValue }"
      @click="startEdit"
      @dblclick.stop="startExpandedEdit"
    >
      <span v-if="hasError" class="error-indicator" title="FEEL syntax error">!</span>
      {{ displayValue }}
    </span>
  </div>
</template>

<style scoped>
.feel-cell {
  cursor: text;
  min-height: 28px;
  position: relative;
}

.feel-display {
  display: block;
  padding: 6px 8px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.82rem;
  white-space: nowrap;
  min-height: 28px;
}

.feel-placeholder {
  color: var(--text-color-secondary, #64748b);
}

.has-error .feel-display {
  color: #dc2626;
}

.has-error {
  background-color: #fef2f2 !important;
  border-color: #fca5a5;
}

.is-expanded {
  position: absolute;
  z-index: 10;
  left: 0;
  right: 0;
  top: 0;
  background: var(--surface-card, #fff);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-radius: 4px;
}

.expand-actions {
  display: flex;
  gap: 4px;
  padding: 4px;
  justify-content: flex-end;
  border-top: 1px solid var(--surface-border, #e2e8f0);
}

.expand-btn {
  background: none;
  border: 1px solid var(--surface-border, #e2e8f0);
  border-radius: 3px;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 0.75rem;
  color: var(--text-color, #1e293b);
}

.expand-btn:hover {
  background: var(--surface-hover, #f1f5f9);
}

.error-indicator {
  display: inline-block;
  width: 14px;
  height: 14px;
  line-height: 14px;
  text-align: center;
  background: #ef4444;
  color: white;
  border-radius: 50%;
  font-size: 0.65rem;
  font-weight: 700;
  margin-right: 4px;
  vertical-align: middle;
}
</style>
