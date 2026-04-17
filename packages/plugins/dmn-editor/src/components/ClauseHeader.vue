<script setup lang="ts">
/**
 * ClauseHeader - Editable column header for input/output clauses
 */

import { ref, watch } from 'tsm:vue'

const props = defineProps<{
  label: string
  typeRef?: string
  editable?: boolean
}>()

const emit = defineEmits<{
  'update:label': [value: string]
  'update:typeRef': [value: string]
  'remove': []
}>()

const editing = ref(false)
const editLabel = ref(props.label)
const editTypeRef = ref(props.typeRef || '')

watch(() => props.label, (v) => { editLabel.value = v })
watch(() => props.typeRef, (v) => { editTypeRef.value = v || '' })

function startEdit() {
  if (props.editable === false) return
  editLabel.value = props.label
  editTypeRef.value = props.typeRef || ''
  editing.value = true
}

function commitEdit() {
  editing.value = false
  if (editLabel.value !== props.label) {
    emit('update:label', editLabel.value)
  }
  if (editTypeRef.value !== (props.typeRef || '')) {
    emit('update:typeRef', editTypeRef.value)
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') commitEdit()
  if (e.key === 'Escape') { editing.value = false }
}
</script>

<template>
  <div class="clause-header" @dblclick="startEdit">
    <template v-if="editing">
      <input
        v-model="editLabel"
        class="edit-input label-input"
        placeholder="Label"
        @blur="commitEdit"
        @keydown="handleKeydown"
        ref="labelInput"
      />
      <input
        v-model="editTypeRef"
        class="edit-input type-input"
        placeholder="type"
        @blur="commitEdit"
        @keydown="handleKeydown"
      />
    </template>
    <template v-else>
      <span class="header-label">{{ label }}</span>
      <span v-if="typeRef" class="header-type">{{ typeRef }}</span>
    </template>
    <button
      v-if="editable !== false"
      class="remove-btn"
      title="Remove column"
      @click.stop="emit('remove')"
    >
      <i class="pi pi-times"></i>
    </button>
  </div>
</template>

<style scoped>
.clause-header {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  cursor: default;
  min-width: 80px;
}

.clause-header:hover .remove-btn {
  opacity: 1;
}

.header-label {
  font-weight: 600;
  font-size: 0.85rem;
}

.header-type {
  font-size: 0.75rem;
  color: var(--text-color-secondary, #64748b);
  font-style: italic;
}

.edit-input {
  width: 100%;
  border: 1px solid var(--primary-color, #6366f1);
  border-radius: 3px;
  padding: 2px 4px;
  font-size: 0.8rem;
  outline: none;
  text-align: center;
}

.label-input {
  font-weight: 600;
}

.type-input {
  font-style: italic;
  color: var(--text-color-secondary, #64748b);
}

.remove-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  color: var(--text-color-secondary, #64748b);
  font-size: 0.7rem;
  padding: 2px;
  line-height: 1;
}

.remove-btn:hover {
  color: #ef4444;
}
</style>
