<script setup lang="ts">
/**
 * DataGenEditor - Right-panel form for editing a ClassGenConfig.
 * Shows attribute generators table and reference generators table.
 */

import { ref, computed, watch } from 'tsm:vue'
import { InputText, InputNumber, Button, ToggleSwitch, Select } from 'tsm:primevue'
import type { ClassGenConfig, AttributeGenConfig, ReferenceGenConfig, ReferenceStrategy } from '../types'
import GeneratorPicker from './GeneratorPicker.vue'

const props = defineProps<{
  classConfig: ClassGenConfig | null
  classIndex: number
}>()

const emit = defineEmits<{
  'update': [index: number, updates: Partial<ClassGenConfig>]
  'update-attr': [classIndex: number, attrIndex: number, updates: Partial<AttributeGenConfig>]
  'remove-attr': [classIndex: number, attrIndex: number]
  'add-attr': [classIndex: number]
  'update-ref': [classIndex: number, refIndex: number, updates: Partial<ReferenceGenConfig>]
  'remove-ref': [classIndex: number, refIndex: number]
  'add-ref': [classIndex: number]
}>()

const referenceStrategies: { label: string, value: ReferenceStrategy }[] = [
  { label: 'Random', value: 'RANDOM' },
  { label: 'Round Robin', value: 'ROUND_ROBIN' },
  { label: 'First', value: 'FIRST' },
  { label: 'None', value: 'NONE' }
]

// Generator picker state
const showPicker = ref(false)
const pickerAttrIndex = ref(-1)
const pickerFilterType = ref<string | undefined>(undefined)

function openPicker(attrIndex: number, filterType?: string) {
  pickerAttrIndex.value = attrIndex
  pickerFilterType.value = filterType
  showPicker.value = true
}

function handlePickerSelect(key: string) {
  if (pickerAttrIndex.value >= 0 && props.classConfig) {
    emit('update-attr', props.classIndex, pickerAttrIndex.value, { generatorKey: key })
  }
  showPicker.value = false
}

function updateInstanceCount(val: number | null) {
  if (val != null) {
    emit('update', props.classIndex, { instanceCount: val })
  }
}

function updateEnabled(val: boolean) {
  emit('update', props.classIndex, { enabled: val })
}

const containmentRefs = computed(() => {
  if (!props.classConfig) return []
  return props.classConfig.referenceGens
    .map((rg, i) => ({ rg, originalIndex: i }))
    .filter(({ rg }) => rg.isContainment)
})

const crossRefs = computed(() => {
  if (!props.classConfig) return []
  return props.classConfig.referenceGens
    .map((rg, i) => ({ rg, originalIndex: i }))
    .filter(({ rg }) => !rg.isContainment)
})
</script>

<template>
  <div class="datagen-editor" v-if="classConfig">
    <!-- Class header -->
    <div class="editor-section class-header">
      <div class="field-row">
        <div class="field">
          <label>Context Class</label>
          <InputText :modelValue="classConfig.contextClass" size="small" readonly class="field-input mono" />
        </div>
        <div class="field" style="width: 120px">
          <label>Count</label>
          <InputNumber
            :modelValue="classConfig.instanceCount"
            @update:modelValue="updateInstanceCount"
            size="small"
            :min="1"
            :max="100000"
            class="field-input"
          />
        </div>
        <div class="field" style="width: 80px">
          <label>Enabled</label>
          <ToggleSwitch
            :modelValue="classConfig.enabled"
            @update:modelValue="updateEnabled"
          />
        </div>
      </div>
    </div>

    <!-- Attributes section -->
    <div class="editor-section">
      <div class="section-header">
        <span class="section-title">Attributes</span>
        <Button
          icon="pi pi-plus"
          text rounded size="small"
          @click="emit('add-attr', classIndex)"
          title="Add attribute"
        />
      </div>

      <div v-if="classConfig.attributeGens.length === 0" class="empty-hint">
        No attribute generators configured
      </div>

      <div v-else class="attr-table">
        <div class="attr-row attr-header-row">
          <span class="attr-cell name-cell">Attribute</span>
          <span class="attr-cell gen-cell">Generator</span>
          <span class="attr-cell args-cell">Args</span>
          <span class="attr-cell action-cell"></span>
        </div>
        <div v-for="(ag, i) in classConfig.attributeGens" :key="ag.featureName" class="attr-row">
          <span class="attr-cell name-cell mono">{{ ag.featureName }}</span>
          <div class="attr-cell gen-cell">
            <Button
              :label="ag.generatorKey || 'Select...'"
              size="small"
              text
              class="gen-picker-btn"
              :class="{ 'no-gen': !ag.generatorKey }"
              @click="openPicker(i)"
            />
          </div>
          <div class="attr-cell args-cell">
            <InputText
              :modelValue="ag.generatorArgs"
              @update:modelValue="emit('update-attr', classIndex, i, { generatorArgs: $event })"
              size="small"
              placeholder="{}"
              class="args-input"
            />
          </div>
          <div class="attr-cell action-cell">
            <Button
              icon="pi pi-trash"
              text rounded size="small"
              severity="danger"
              @click="emit('remove-attr', classIndex, i)"
              class="row-btn"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Containment References section -->
    <div class="editor-section" v-if="containmentRefs.length > 0">
      <div class="section-header">
        <span class="section-title"><i class="pi pi-sitemap section-icon"></i> Containment</span>
      </div>

      <div class="ref-table">
        <div class="ref-row ref-header-row">
          <span class="ref-cell name-cell">Reference</span>
          <span class="ref-cell count-cell">Children</span>
          <span class="ref-cell count-cell">Depth</span>
          <span class="ref-cell action-cell"></span>
        </div>
        <div v-for="{ rg, originalIndex } in containmentRefs" :key="rg.featureName" class="ref-row containment-row">
          <span class="ref-cell name-cell mono">{{ rg.featureName }}</span>
          <div class="ref-cell count-cell">
            <InputNumber
              :modelValue="rg.childCount"
              @update:modelValue="emit('update-ref', classIndex, originalIndex, { childCount: $event || 1 })"
              size="small"
              :min="0"
              :max="100"
              class="count-input"
            />
          </div>
          <div class="ref-cell count-cell">
            <InputNumber
              :modelValue="rg.maxDepth"
              @update:modelValue="emit('update-ref', classIndex, originalIndex, { maxDepth: $event || 1 })"
              size="small"
              :min="1"
              :max="10"
              class="count-input"
            />
          </div>
          <div class="ref-cell action-cell">
            <Button
              icon="pi pi-trash"
              text rounded size="small"
              severity="danger"
              @click="emit('remove-ref', classIndex, originalIndex)"
              class="row-btn"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Cross-References section -->
    <div class="editor-section">
      <div class="section-header">
        <span class="section-title">References</span>
        <Button
          icon="pi pi-plus"
          text rounded size="small"
          @click="emit('add-ref', classIndex)"
          title="Add reference"
        />
      </div>

      <div v-if="crossRefs.length === 0" class="empty-hint">
        No cross-reference generators configured
      </div>

      <div v-else class="ref-table">
        <div class="ref-row ref-header-row">
          <span class="ref-cell name-cell">Reference</span>
          <span class="ref-cell strategy-cell">Strategy</span>
          <span class="ref-cell count-cell">Min</span>
          <span class="ref-cell count-cell">Max</span>
          <span class="ref-cell action-cell"></span>
        </div>
        <div v-for="{ rg, originalIndex } in crossRefs" :key="rg.featureName" class="ref-row">
          <span class="ref-cell name-cell mono">{{ rg.featureName }}</span>
          <div class="ref-cell strategy-cell">
            <Select
              :modelValue="rg.strategy"
              @update:modelValue="emit('update-ref', classIndex, originalIndex, { strategy: $event })"
              :options="referenceStrategies"
              optionLabel="label"
              optionValue="value"
              size="small"
              class="strategy-select"
            />
          </div>
          <div class="ref-cell count-cell">
            <InputNumber
              :modelValue="rg.minCount"
              @update:modelValue="emit('update-ref', classIndex, originalIndex, { minCount: $event || 0 })"
              size="small"
              :min="0"
              class="count-input"
            />
          </div>
          <div class="ref-cell count-cell">
            <InputNumber
              :modelValue="rg.maxCount"
              @update:modelValue="emit('update-ref', classIndex, originalIndex, { maxCount: $event || 1 })"
              size="small"
              :min="0"
              class="count-input"
            />
          </div>
          <div class="ref-cell action-cell">
            <Button
              icon="pi pi-trash"
              text rounded size="small"
              severity="danger"
              @click="emit('remove-ref', classIndex, originalIndex)"
              class="row-btn"
            />
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Empty state -->
  <div v-else class="editor-empty">
    <i class="pi pi-arrow-left"></i>
    <span>Select a class from the tree</span>
  </div>

  <!-- Generator picker dialog -->
  <GeneratorPicker
    v-model:visible="showPicker"
    :filterType="pickerFilterType"
    @select="handlePickerSelect"
  />
</template>

<style scoped>
.datagen-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 0;
}

.editor-section {
  border-bottom: 1px solid var(--surface-border);
  padding: 10px 14px;
}

.class-header {
  background: var(--surface-ground);
}

.field-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}

.field label {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-transform: uppercase;
}

.field-input { width: 100%; }
.mono { font-family: monospace; font-size: 0.8125rem; }

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.section-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-color-secondary);
}

.section-header :deep(.p-button) { width: 22px; height: 22px; padding: 0; }

.empty-hint {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  padding: 8px 0;
}

/* Attribute table */
.attr-table, .ref-table {
  display: flex;
  flex-direction: column;
  gap: 0;
  font-size: 0.8125rem;
}

.attr-row, .ref-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px solid var(--surface-border);
}

.attr-header-row, .ref-header-row {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  border-bottom: 1px solid var(--surface-border);
  padding-bottom: 4px;
}

.attr-cell, .ref-cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name-cell { width: 140px; flex-shrink: 0; }
.gen-cell { flex: 1; min-width: 0; }
.args-cell { width: 120px; flex-shrink: 0; }
.strategy-cell { width: 140px; flex-shrink: 0; }
.count-cell { width: 60px; flex-shrink: 0; }
.action-cell { width: 28px; flex-shrink: 0; }

.gen-picker-btn {
  font-family: monospace;
  font-size: 0.75rem;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 2px 6px;
}

.gen-picker-btn.no-gen {
  color: var(--text-color-secondary);
  font-style: italic;
  font-family: inherit;
}

.args-input { width: 100%; font-family: monospace; font-size: 0.75rem; }
.strategy-select { width: 100%; }
.count-input { width: 100%; }

.row-btn { width: 22px !important; height: 22px !important; padding: 0 !important; }
.row-btn :deep(.p-button-icon) { font-size: 0.6875rem; }

.editor-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.editor-empty i { font-size: 1.5rem; opacity: 0.3; }

.section-icon { font-size: 0.6875rem; margin-right: 4px; }
.containment-row { background: rgba(var(--primary-500-rgb, 59, 130, 246), 0.04); }
</style>
