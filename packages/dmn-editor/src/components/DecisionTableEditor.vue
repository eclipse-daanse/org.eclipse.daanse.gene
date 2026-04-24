<script setup lang="ts">
/**
 * DecisionTableEditor - Custom HTML table for DMN decision tables
 *
 * Features:
 * - Keyboard navigation (arrow keys, Enter/F2 to edit, Escape to exit)
 * - Copy/Paste rules (Ctrl+C/V/X/D)
 * - Drag-reorder rows
 */

import { ref, computed, toRaw } from 'tsm:vue'
import { Button } from 'tsm:primevue'
import { useSharedDmnEditor } from '../composables/useDmnEditor'
import type { HitPolicy, BuiltinAggregator } from '../types'
import HitPolicySelector from './HitPolicySelector.vue'
import ClauseHeader from './ClauseHeader.vue'
import FeelCell from './FeelCell.vue'
import DecisionTableExecutor from './DecisionTableExecutor.vue'
import ModelPickerDialog from './ModelPickerDialog.vue'

const props = defineProps<{
  decision: any
}>()

const dmn = useSharedDmnEditor()

const showModelPicker = ref(false)

// Reactive data from the decision table
const decisionTable = computed(() => {
  const _ = dmn.version.value
  if (!props.decision) return null
  return dmn.getDecisionTable(toRaw(props.decision))
})

const decisionName = computed(() => {
  const _ = dmn.version.value
  if (!props.decision) return ''
  return dmn.eGet(toRaw(props.decision), 'name') || ''
})

const hitPolicy = computed(() => {
  const _ = dmn.version.value
  const dt = decisionTable.value
  if (!dt) return 'UNIQUE'
  return (dmn.eGet(dt, 'hitPolicy') || 'UNIQUE') as string
})

const aggregation = computed(() => {
  const _ = dmn.version.value
  const dt = decisionTable.value
  if (!dt) return undefined
  return dmn.eGet(dt, 'aggregation') as string | undefined
})

const inputClauses = computed(() => {
  const _ = dmn.version.value
  const dt = decisionTable.value
  if (!dt) return []
  return dmn.getList(dt, 'input')
})

const outputClauses = computed(() => {
  const _ = dmn.version.value
  const dt = decisionTable.value
  if (!dt) return []
  return dmn.getList(dt, 'output')
})

const rules = computed(() => {
  const _ = dmn.version.value
  const dt = decisionTable.value
  if (!dt) return []
  return dmn.getList(dt, 'rule')
})

const totalCols = computed(() => inputClauses.value.length + outputClauses.value.length)

function getClauseLabel(clause: any): string {
  return dmn.eGet(clause, 'label') || ''
}

function getClauseTypeRef(clause: any): string {
  const inputExpr = dmn.eGet(clause, 'inputExpression')
  if (inputExpr) {
    return dmn.eGet(inputExpr, 'typeRef') || ''
  }
  return dmn.eGet(clause, 'typeRef') || ''
}

function getEntryText(rule: any, featureName: string, index: number): string {
  const entries = dmn.getList(rule, featureName)
  if (index >= entries.length) return ''
  return dmn.eGet(entries[index], 'text') || ''
}

// Highlighted rules from executor
const highlightedRules = ref<number[]>([])
const showExecutor = ref(false)

function handleHighlightRules(ruleIndices: number[]) {
  highlightedRules.value = ruleIndices
}

function isRuleHighlighted(ruleIdx: number): boolean {
  return highlightedRules.value.includes(ruleIdx)
}

// ============ Focus Tracking ============

const focusedCell = ref<{ ruleIdx: number; type: 'input' | 'output'; colIdx: number } | null>(null)
const editingCell = ref<{ ruleIdx: number; type: 'input' | 'output'; colIdx: number } | null>(null)

function isCellFocused(ruleIdx: number, type: 'input' | 'output', colIdx: number): boolean {
  if (!focusedCell.value) return false
  return focusedCell.value.ruleIdx === ruleIdx &&
    focusedCell.value.type === type &&
    focusedCell.value.colIdx === colIdx
}

function isCellEditing(ruleIdx: number, type: 'input' | 'output', colIdx: number): boolean {
  if (!editingCell.value) return false
  return editingCell.value.ruleIdx === ruleIdx &&
    editingCell.value.type === type &&
    editingCell.value.colIdx === colIdx
}

function focusCell(ruleIdx: number, type: 'input' | 'output', colIdx: number) {
  focusedCell.value = { ruleIdx, type, colIdx }
}

function cellToAbsCol(type: 'input' | 'output', colIdx: number): number {
  return type === 'input' ? colIdx : inputClauses.value.length + colIdx
}

function absColToCell(absCol: number): { type: 'input' | 'output'; colIdx: number } {
  const inputLen = inputClauses.value.length
  if (absCol < inputLen) {
    return { type: 'input', colIdx: absCol }
  }
  return { type: 'output', colIdx: absCol - inputLen }
}

// ============ Keyboard Navigation ============

function handleTableKeydown(e: KeyboardEvent) {
  // Don't navigate when a cell is being edited
  if (editingCell.value) return
  if (!focusedCell.value) return

  const { ruleIdx, type, colIdx } = focusedCell.value
  const absCol = cellToAbsCol(type, colIdx)

  switch (e.key) {
    case 'ArrowUp': {
      e.preventDefault()
      if (ruleIdx > 0) {
        focusCell(ruleIdx - 1, type, colIdx)
      }
      break
    }
    case 'ArrowDown': {
      e.preventDefault()
      if (ruleIdx < rules.value.length - 1) {
        focusCell(ruleIdx + 1, type, colIdx)
      }
      break
    }
    case 'ArrowLeft': {
      e.preventDefault()
      if (absCol > 0) {
        const { type: newType, colIdx: newCol } = absColToCell(absCol - 1)
        focusCell(ruleIdx, newType, newCol)
      }
      break
    }
    case 'ArrowRight': {
      e.preventDefault()
      if (absCol < totalCols.value - 1) {
        const { type: newType, colIdx: newCol } = absColToCell(absCol + 1)
        focusCell(ruleIdx, newType, newCol)
      }
      break
    }
    case 'Enter':
    case 'F2': {
      e.preventDefault()
      editingCell.value = { ruleIdx, type, colIdx }
      break
    }
    case 'Delete':
    case 'Backspace': {
      e.preventDefault()
      clearCellContent(ruleIdx, type, colIdx)
      break
    }
    case 'Tab': {
      e.preventDefault()
      if (e.shiftKey) {
        if (absCol > 0) {
          const { type: newType, colIdx: newCol } = absColToCell(absCol - 1)
          focusCell(ruleIdx, newType, newCol)
        } else if (ruleIdx > 0) {
          const { type: newType, colIdx: newCol } = absColToCell(totalCols.value - 1)
          focusCell(ruleIdx - 1, newType, newCol)
        }
      } else {
        if (absCol < totalCols.value - 1) {
          const { type: newType, colIdx: newCol } = absColToCell(absCol + 1)
          focusCell(ruleIdx, newType, newCol)
        } else if (ruleIdx < rules.value.length - 1) {
          focusCell(ruleIdx + 1, 'input', 0)
        }
      }
      break
    }
    case 'c': {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        copyRule(ruleIdx)
      }
      break
    }
    case 'v': {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        pasteRule(ruleIdx)
      }
      break
    }
    case 'x': {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        cutRule(ruleIdx)
      }
      break
    }
    case 'd': {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        handleDuplicateRule(ruleIdx)
      }
      break
    }
  }
}

function handleCellClick(ruleIdx: number, type: 'input' | 'output', colIdx: number) {
  focusCell(ruleIdx, type, colIdx)
}

function handleCellEditDone() {
  editingCell.value = null
}

function clearCellContent(ruleIdx: number, type: 'input' | 'output', colIdx: number) {
  const rule = rules.value[ruleIdx]
  if (!rule) return
  const featureName = type === 'input' ? 'inputEntry' : 'outputEntry'
  const entries = dmn.getList(rule, featureName)
  if (colIdx < entries.length) {
    dmn.eSet(entries[colIdx], 'text', type === 'input' ? '-' : '')
  }
}

// ============ Copy/Paste Rules ============

function getRuleData(ruleIdx: number): { type: string; inputEntries: string[]; outputEntries: string[] } | null {
  const rule = rules.value[ruleIdx]
  if (!rule) return null
  const inputEntries = dmn.getList(rule, 'inputEntry').map(e => dmn.eGet(e, 'text') || '-')
  const outputEntries = dmn.getList(rule, 'outputEntry').map(e => dmn.eGet(e, 'text') || '')
  return { type: 'dmn-rule', inputEntries, outputEntries }
}

async function copyRule(ruleIdx: number) {
  const data = getRuleData(ruleIdx)
  if (!data) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(data))
  } catch { /* clipboard not available */ }
}

async function pasteRule(afterIdx: number) {
  const dt = decisionTable.value
  if (!dt) return
  try {
    const text = await navigator.clipboard.readText()
    const data = JSON.parse(text)
    if (data.type !== 'dmn-rule') return
    dmn.insertRuleAt(dt, data, afterIdx)
  } catch { /* invalid clipboard data */ }
}

async function cutRule(ruleIdx: number) {
  await copyRule(ruleIdx)
  const dt = decisionTable.value
  const rule = rules.value[ruleIdx]
  if (dt && rule) dmn.removeRule(dt, rule)
}

function handleDuplicateRule(ruleIdx: number) {
  const dt = decisionTable.value
  const rule = rules.value[ruleIdx]
  if (dt && rule) dmn.duplicateRule(dt, rule)
}

// ============ Drag Reorder ============

const draggedRuleIdx = ref<number | null>(null)
const dropTargetIdx = ref<number | null>(null)

function handleDragStart(e: DragEvent, ruleIdx: number) {
  draggedRuleIdx.value = ruleIdx
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(ruleIdx))
  }
}

function handleDragOver(e: DragEvent, ruleIdx: number) {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
  dropTargetIdx.value = ruleIdx
}

function handleDragLeave() {
  dropTargetIdx.value = null
}

function handleDrop(e: DragEvent, targetIdx: number) {
  e.preventDefault()
  const dt = decisionTable.value
  if (dt && draggedRuleIdx.value !== null && draggedRuleIdx.value !== targetIdx) {
    dmn.moveRule(dt, draggedRuleIdx.value, targetIdx)
  }
  draggedRuleIdx.value = null
  dropTargetIdx.value = null
}

function handleDragEnd() {
  draggedRuleIdx.value = null
  dropTargetIdx.value = null
}

// ============ Actions ============

function handleHitPolicyChange(hp: HitPolicy) {
  const dt = decisionTable.value
  if (dt) dmn.eSet(dt, 'hitPolicy', hp)
}

function handleAggregationChange(agg: BuiltinAggregator | null) {
  const dt = decisionTable.value
  if (dt) dmn.eSet(dt, 'aggregation', agg || '')
}

function handleUpdateLabel(clause: any, label: string) {
  dmn.eSet(clause, 'label', label)
}

function handleUpdateTypeRef(clause: any, typeRef: string, isInput: boolean) {
  if (isInput) {
    const inputExpr = dmn.eGet(clause, 'inputExpression')
    if (inputExpr) {
      dmn.eSet(inputExpr, 'typeRef', typeRef)
    }
  } else {
    dmn.eSet(clause, 'typeRef', typeRef)
  }
}

function handleDecisionNameChange(e: Event) {
  const value = (e.target as HTMLInputElement).value
  if (props.decision) {
    dmn.eSet(toRaw(props.decision), 'name', value)
  }
}

function handleAddInput() {
  showModelPicker.value = true
}

function handleAddInputManual() {
  const dt = decisionTable.value
  if (dt) dmn.addInputClause(dt)
}

function handleAttributeSelected(data: { name: string; eAttribute: any; typeRef: string; eClass: any; feelType: string }) {
  const dt = decisionTable.value
  if (dt) {
    dmn.addInputClause(dt, data.name, data.feelType)
  }
}

function handleAddOutput() {
  const dt = decisionTable.value
  if (dt) dmn.addOutputClause(dt)
}

function handleAddRule() {
  const dt = decisionTable.value
  if (dt) dmn.addRule(dt)
}

function handleRemoveInput(clause: any, index: number) {
  const dt = decisionTable.value
  if (dt) dmn.removeInputClause(dt, clause, index)
}

function handleRemoveOutput(clause: any, index: number) {
  const dt = decisionTable.value
  if (dt) dmn.removeOutputClause(dt, clause, index)
}

function handleRemoveRule(rule: any) {
  const dt = decisionTable.value
  if (dt) dmn.removeRule(dt, rule)
}
</script>

<template>
  <div class="decision-table-editor" v-if="decisionTable">
    <!-- Header bar -->
    <div class="dt-header">
      <HitPolicySelector
        :hitPolicy="hitPolicy"
        :aggregation="aggregation"
        @update:hitPolicy="handleHitPolicyChange"
        @update:aggregation="handleAggregationChange"
      />
      <input
        class="decision-name-input"
        :value="decisionName"
        @change="handleDecisionNameChange"
        placeholder="Decision Name"
      />
    </div>

    <!-- Decision Table -->
    <div class="dt-table-container">
      <table class="dt-table" tabindex="0" @keydown="handleTableKeydown">
        <!-- Column group headers -->
        <thead>
          <tr class="group-header-row">
            <th class="rule-number-header" rowspan="2">#</th>
            <th
              v-if="inputClauses.length > 0"
              :colspan="inputClauses.length"
              class="input-group-header"
            >
              Input
            </th>
            <th
              v-if="outputClauses.length > 0"
              :colspan="outputClauses.length"
              class="output-group-header"
            >
              Output
            </th>
            <th class="actions-header" rowspan="2"></th>
          </tr>
          <!-- Clause headers -->
          <tr class="clause-header-row">
            <th
              v-for="(ic, idx) in inputClauses"
              :key="'ih-' + idx"
              class="input-clause-header"
            >
              <ClauseHeader
                :label="getClauseLabel(ic)"
                :typeRef="getClauseTypeRef(ic)"
                @update:label="handleUpdateLabel(ic, $event)"
                @update:typeRef="handleUpdateTypeRef(ic, $event, true)"
                @remove="handleRemoveInput(ic, idx)"
              />
            </th>
            <th
              v-for="(oc, idx) in outputClauses"
              :key="'oh-' + idx"
              class="output-clause-header"
            >
              <ClauseHeader
                :label="getClauseLabel(oc)"
                :typeRef="getClauseTypeRef(oc)"
                @update:label="handleUpdateLabel(oc, $event)"
                @update:typeRef="handleUpdateTypeRef(oc, $event, false)"
                @remove="handleRemoveOutput(oc, idx)"
              />
            </th>
          </tr>
        </thead>

        <!-- Rules -->
        <tbody>
          <tr
            v-for="(rule, ruleIdx) in rules"
            :key="'r-' + ruleIdx"
            class="rule-row"
            :class="{
              'rule-highlighted': isRuleHighlighted(ruleIdx),
              'rule-dragging': draggedRuleIdx === ruleIdx,
              'rule-drop-target': dropTargetIdx === ruleIdx && draggedRuleIdx !== ruleIdx,
            }"
            @dragover="handleDragOver($event, ruleIdx)"
            @dragleave="handleDragLeave"
            @drop="handleDrop($event, ruleIdx)"
          >
            <!-- Rule number + drag handle -->
            <td
              class="rule-number"
              draggable="true"
              @dragstart="handleDragStart($event, ruleIdx)"
              @dragend="handleDragEnd"
            >
              <i class="pi pi-bars drag-handle"></i>
              {{ ruleIdx + 1 }}
            </td>

            <!-- Input entries -->
            <td
              v-for="(ic, colIdx) in inputClauses"
              :key="'ri-' + ruleIdx + '-' + colIdx"
              class="input-cell"
              :class="{ 'cell-focused': isCellFocused(ruleIdx, 'input', colIdx) }"
              @click="handleCellClick(ruleIdx, 'input', colIdx)"
            >
              <FeelCell
                :modelValue="getEntryText(rule, 'inputEntry', colIdx)"
                :isUnaryTest="true"
                @update:modelValue="(v) => { const entries = dmn.getList(rule, 'inputEntry'); if (colIdx < entries.length) dmn.eSet(entries[colIdx], 'text', v) }"
              />
            </td>

            <!-- Output entries -->
            <td
              v-for="(oc, colIdx) in outputClauses"
              :key="'ro-' + ruleIdx + '-' + colIdx"
              class="output-cell"
              :class="{ 'cell-focused': isCellFocused(ruleIdx, 'output', colIdx) }"
              @click="handleCellClick(ruleIdx, 'output', colIdx)"
            >
              <FeelCell
                :modelValue="getEntryText(rule, 'outputEntry', colIdx)"
                :isUnaryTest="false"
                @update:modelValue="(v) => { const entries = dmn.getList(rule, 'outputEntry'); if (colIdx < entries.length) dmn.eSet(entries[colIdx], 'text', v) }"
              />
            </td>

            <!-- Row actions -->
            <td class="rule-actions">
              <button
                class="row-action-btn"
                title="Remove rule"
                @click="handleRemoveRule(rule)"
              >
                <i class="pi pi-trash"></i>
              </button>
            </td>
          </tr>

          <!-- Empty state -->
          <tr v-if="rules.length === 0">
            <td :colspan="1 + inputClauses.length + outputClauses.length + 1" class="empty-row">
              No rules defined. Click "+ Rule" to add one.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Actions bar -->
    <div class="dt-actions">
      <Button
        icon="pi pi-plus"
        label="Rule"
        size="small"
        severity="secondary"
        text
        @click="handleAddRule"
      />
      <Button
        icon="pi pi-plus"
        label="Input"
        size="small"
        severity="secondary"
        text
        title="Add input clause from metamodel"
        @click="handleAddInput"
      />
      <Button
        icon="pi pi-pencil"
        label="Input (manual)"
        size="small"
        severity="secondary"
        text
        title="Add blank input clause"
        @click="handleAddInputManual"
      />
      <Button
        icon="pi pi-plus"
        label="Output"
        size="small"
        severity="secondary"
        text
        @click="handleAddOutput"
      />
      <div style="flex: 1"></div>
      <Button
        :icon="showExecutor ? 'pi pi-chevron-down' : 'pi pi-play'"
        :label="showExecutor ? 'Hide Tester' : 'Test'"
        size="small"
        :severity="showExecutor ? 'secondary' : 'info'"
        text
        @click="showExecutor = !showExecutor"
      />
    </div>

    <!-- Executor panel -->
    <DecisionTableExecutor
      v-if="showExecutor"
      :decision="decision"
      @highlight-rules="handleHighlightRules"
    />

    <!-- Model Picker for Input Clauses -->
    <ModelPickerDialog
      :visible="showModelPicker"
      mode="attribute"
      @update:visible="showModelPicker = $event"
      @select-attribute="handleAttributeSelected"
    />
  </div>

  <!-- Empty state when no decision selected -->
  <div v-else class="empty-state">
    <i class="pi pi-table" style="font-size: 3rem; color: var(--text-color-secondary)"></i>
    <p>Select a decision from the tree to edit its decision table.</p>
  </div>
</template>

<style scoped>
.decision-table-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

.dt-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--surface-border, #e2e8f0);
  background: var(--surface-section, #f1f5f9);
}

.decision-name-input {
  flex: 1;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 0.95rem;
  font-weight: 600;
  background: transparent;
  color: var(--text-color, #1e293b);
}

.decision-name-input:focus {
  border-color: var(--primary-color, #6366f1);
  outline: none;
  background: var(--surface-card, #fff);
}

.dt-table-container {
  flex: 1;
  overflow: auto;
  padding: 12px;
}

.dt-table {
  border-collapse: collapse;
  width: auto;
  min-width: 100%;
  font-size: 0.85rem;
  outline: none;
}

.dt-table th,
.dt-table td {
  border: 1px solid var(--surface-border, #e2e8f0);
  padding: 0;
  text-align: center;
  vertical-align: middle;
}

/* Group headers */
.rule-number-header {
  width: 40px;
  background: var(--surface-section, #f1f5f9);
  font-weight: 600;
  font-size: 0.75rem;
  color: var(--text-color-secondary, #64748b);
}

.input-group-header {
  background: #dbeafe;
  color: #1e40af;
  font-weight: 700;
  font-size: 0.8rem;
  padding: 4px 8px;
  letter-spacing: 0.05em;
}

.output-group-header {
  background: #dcfce7;
  color: #166534;
  font-weight: 700;
  font-size: 0.8rem;
  padding: 4px 8px;
  letter-spacing: 0.05em;
}

.actions-header {
  width: 36px;
  background: var(--surface-section, #f1f5f9);
}

/* Clause headers */
.input-clause-header {
  background: #eff6ff;
  min-width: 100px;
}

.output-clause-header {
  background: #f0fdf4;
  min-width: 100px;
}

/* Rule rows */
.rule-number {
  width: 40px;
  background: var(--surface-section, #f1f5f9);
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--text-color-secondary, #64748b);
  text-align: center;
  padding: 6px 4px;
  cursor: grab;
  user-select: none;
}

.rule-number:active {
  cursor: grabbing;
}

.drag-handle {
  font-size: 0.6rem;
  opacity: 0;
  margin-right: 2px;
  vertical-align: middle;
  transition: opacity 0.15s;
}

.rule-row:hover .drag-handle {
  opacity: 0.5;
}

.input-cell {
  background: #f8fbff;
  cursor: text;
  min-width: 100px;
}

.input-cell:hover {
  background: #eff6ff;
}

.output-cell {
  background: #f8fdf9;
  cursor: text;
  min-width: 100px;
}

.output-cell:hover {
  background: #f0fdf4;
}

/* Focused cell */
.cell-focused {
  outline: 2px solid var(--primary-color, #6366f1);
  outline-offset: -2px;
}

.cell-text {
  display: block;
  padding: 6px 8px;
  min-height: 28px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.82rem;
  white-space: nowrap;
}

.rule-actions {
  width: 36px;
  padding: 2px;
}

.row-action-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-color-secondary, #64748b);
  padding: 4px;
  border-radius: 3px;
  opacity: 0.4;
  transition: opacity 0.15s;
}

.rule-row:hover .row-action-btn {
  opacity: 1;
}

.row-action-btn:hover {
  color: #ef4444;
  background: #fef2f2;
}

/* Highlighted rules (from executor) */
.rule-highlighted .input-cell,
.rule-highlighted .output-cell {
  background: #dcfce7 !important;
}

.rule-highlighted .rule-number {
  background: #bbf7d0 !important;
  color: #166534 !important;
  font-weight: 700;
}

/* Drag reorder */
.rule-dragging {
  opacity: 0.4;
}

.rule-drop-target {
  border-top: 2px solid var(--primary-color, #6366f1) !important;
}

.empty-row {
  padding: 24px;
  color: var(--text-color-secondary, #64748b);
  font-style: italic;
}

/* Actions bar */
.dt-actions {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  border-top: 1px solid var(--surface-border, #e2e8f0);
  background: var(--surface-section, #f1f5f9);
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--text-color-secondary, #64748b);
}
</style>
