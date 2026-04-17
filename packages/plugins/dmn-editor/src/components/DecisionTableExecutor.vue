<script setup lang="ts">
/**
 * DecisionTableExecutor - Test panel for executing decision tables
 *
 * Uses type-specific input widgets based on typeRef:
 * - string -> InputText
 * - number -> InputNumber
 * - boolean -> Checkbox
 * - date -> DatePicker
 * - time -> DatePicker (timeOnly)
 * - dateTime -> DatePicker (showTime)
 */

import { ref, computed, toRaw } from 'tsm:vue'
import { Button, InputText, InputNumber, Checkbox, DatePicker } from 'tsm:primevue'
import { useSharedDmnEditor } from '../composables/useDmnEditor'
import { executeDecisionTable } from '../composables/useFeelEngine'
import type { ExecutionResult } from '../composables/useFeelEngine'

const props = defineProps<{
  decision: any
}>()

const emit = defineEmits<{
  'highlight-rules': [ruleIndices: number[]]
}>()

const dmn = useSharedDmnEditor()

const inputValues = ref<Record<string, any>>({})
const executionResult = ref<ExecutionResult | null>(null)
const executionError = ref<string | null>(null)

const decisionTable = computed(() => {
  const _ = dmn.version.value
  if (!props.decision) return null
  return dmn.getDecisionTable(toRaw(props.decision))
})

const inputClauses = computed(() => {
  const _ = dmn.version.value
  const dt = decisionTable.value
  if (!dt) return []
  return dmn.getList(dt, 'input').map(ic => ({
    label: dmn.eGet(ic, 'label') || 'Input',
    typeRef: getInputTypeRef(ic)
  }))
})

const outputClauses = computed(() => {
  const _ = dmn.version.value
  const dt = decisionTable.value
  if (!dt) return []
  return dmn.getList(dt, 'output').map(oc => ({
    label: dmn.eGet(oc, 'label') || 'Output',
    name: dmn.eGet(oc, 'name') || dmn.eGet(oc, 'label') || 'output',
    typeRef: dmn.eGet(oc, 'typeRef') || 'string'
  }))
})

const rules = computed(() => {
  const _ = dmn.version.value
  const dt = decisionTable.value
  if (!dt) return []
  return dmn.getList(dt, 'rule').map(rule => ({
    inputEntries: dmn.getList(rule, 'inputEntry').map(e => dmn.eGet(e, 'text') || '-'),
    outputEntries: dmn.getList(rule, 'outputEntry').map(e => dmn.eGet(e, 'text') || '')
  }))
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

function getInputTypeRef(clause: any): string {
  const inputExpr = dmn.eGet(clause, 'inputExpression')
  if (inputExpr) return dmn.eGet(inputExpr, 'typeRef') || 'string'
  return 'string'
}

function isNumericType(typeRef: string): boolean {
  return ['number', 'integer', 'long', 'double'].includes(typeRef)
}

function coerceInputValue(value: any, typeRef: string): any {
  if (value === null || value === undefined) return null
  if (isNumericType(typeRef)) {
    return typeof value === 'number' ? value : null
  }
  if (typeRef === 'boolean') {
    return typeof value === 'boolean' ? value : false
  }
  if (typeRef === 'date' || typeRef === 'time' || typeRef === 'dateTime') {
    if (value instanceof Date) {
      if (typeRef === 'date') {
        return value.toISOString().split('T')[0]
      }
      if (typeRef === 'time') {
        return value.toTimeString().split(' ')[0]
      }
      return value.toISOString()
    }
    return value
  }
  return String(value)
}

function handleExecute() {
  executionError.value = null
  executionResult.value = null

  try {
    const typedInputs: Record<string, any> = {}
    for (const clause of inputClauses.value) {
      const rawValue = inputValues.value[clause.label]
      typedInputs[clause.label] = coerceInputValue(rawValue, clause.typeRef)
    }

    const result = executeDecisionTable(
      inputClauses.value,
      outputClauses.value,
      rules.value,
      typedInputs,
      hitPolicy.value,
      aggregation.value
    )

    executionResult.value = result
    emit('highlight-rules', result.matchedRules)
  } catch (e: any) {
    executionError.value = e.message || String(e)
  }
}

function handleClear() {
  inputValues.value = {}
  executionResult.value = null
  executionError.value = null
  emit('highlight-rules', [])
}

function formatOutput(output: any): string {
  if (output === null || output === undefined) return '-'
  if (typeof output === 'object') return JSON.stringify(output)
  return String(output)
}
</script>

<template>
  <div class="executor" v-if="decisionTable">
    <div class="executor-header">
      <i class="pi pi-play"></i>
      <span class="executor-title">Test Decision Table</span>
    </div>

    <!-- Input form -->
    <div class="input-form">
      <div
        v-for="clause in inputClauses"
        :key="clause.label"
        class="input-field"
      >
        <label class="input-label">
          {{ clause.label }}
          <span class="type-hint">({{ clause.typeRef }})</span>
        </label>

        <!-- number types -->
        <InputNumber
          v-if="isNumericType(clause.typeRef)"
          v-model="inputValues[clause.label]"
          :placeholder="`Enter ${clause.typeRef} value`"
          size="small"
          class="input-value"
          mode="decimal"
          :minFractionDigits="0"
          :maxFractionDigits="clause.typeRef === 'integer' || clause.typeRef === 'long' ? 0 : 5"
          @keydown.enter="handleExecute"
        />

        <!-- boolean -->
        <div v-else-if="clause.typeRef === 'boolean'" class="bool-field">
          <Checkbox
            v-model="inputValues[clause.label]"
            :binary="true"
            :inputId="'cb-' + clause.label"
          />
          <label :for="'cb-' + clause.label" class="bool-label">
            {{ inputValues[clause.label] ? 'true' : 'false' }}
          </label>
        </div>

        <!-- date -->
        <DatePicker
          v-else-if="clause.typeRef === 'date'"
          v-model="inputValues[clause.label]"
          :placeholder="`Select date`"
          size="small"
          class="input-value"
          dateFormat="yy-mm-dd"
        />

        <!-- time -->
        <DatePicker
          v-else-if="clause.typeRef === 'time'"
          v-model="inputValues[clause.label]"
          :placeholder="`Select time`"
          size="small"
          class="input-value"
          :timeOnly="true"
        />

        <!-- dateTime -->
        <DatePicker
          v-else-if="clause.typeRef === 'dateTime'"
          v-model="inputValues[clause.label]"
          :placeholder="`Select date/time`"
          size="small"
          class="input-value"
          :showTime="true"
        />

        <!-- default: string -->
        <InputText
          v-else
          v-model="inputValues[clause.label]"
          :placeholder="`Enter ${clause.typeRef} value`"
          size="small"
          class="input-value"
          @keydown.enter="handleExecute"
        />
      </div>
    </div>

    <!-- Action buttons -->
    <div class="executor-actions">
      <Button
        icon="pi pi-play"
        label="Execute"
        size="small"
        @click="handleExecute"
        :disabled="inputClauses.length === 0"
      />
      <Button
        icon="pi pi-times"
        label="Clear"
        size="small"
        severity="secondary"
        text
        @click="handleClear"
      />
    </div>

    <!-- Results -->
    <div v-if="executionError" class="execution-error">
      <i class="pi pi-exclamation-triangle"></i>
      {{ executionError }}
    </div>

    <div v-if="executionResult" class="execution-result">
      <div class="result-summary">
        <span class="matched-count">
          {{ executionResult.matchedRules.length }} rule(s) matched
        </span>
        <span v-if="executionResult.matchedRules.length > 0" class="matched-rules">
          (Rules: {{ executionResult.matchedRules.map(i => i + 1).join(', ') }})
        </span>
      </div>

      <!-- Output values -->
      <div v-if="executionResult.appliedOutput" class="output-values">
        <h4>Output:</h4>
        <template v-if="Array.isArray(executionResult.appliedOutput)">
          <div
            v-for="(output, idx) in executionResult.appliedOutput"
            :key="idx"
            class="output-row"
          >
            <span class="output-rule-label">Rule {{ executionResult.matchedRules[idx] + 1 }}:</span>
            <span
              v-for="(value, key) in output"
              :key="String(key)"
              class="output-entry"
            >
              <span class="output-key">{{ key }}</span> = <span class="output-val">{{ formatOutput(value) }}</span>
            </span>
          </div>
        </template>
        <template v-else>
          <div class="output-row">
            <span
              v-for="(value, key) in executionResult.appliedOutput"
              :key="String(key)"
              class="output-entry"
            >
              <span class="output-key">{{ key }}</span> = <span class="output-val">{{ formatOutput(value) }}</span>
            </span>
          </div>
        </template>
      </div>

      <div v-else-if="executionResult.matchedRules.length === 0" class="no-match">
        No rules matched the input values.
      </div>
    </div>
  </div>
</template>

<style scoped>
.executor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-top: 2px solid var(--surface-border, #e2e8f0);
  background: var(--surface-section, #f1f5f9);
}

.executor-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text-color, #1e293b);
}

.input-form {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.input-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 140px;
}

.input-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-color, #1e293b);
}

.type-hint {
  font-weight: 400;
  font-style: italic;
  color: var(--text-color-secondary, #64748b);
}

.input-value {
  width: 100%;
}

.bool-field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.bool-label {
  font-size: 0.85rem;
  color: var(--text-color, #1e293b);
  cursor: pointer;
}

.executor-actions {
  display: flex;
  gap: 8px;
}

.execution-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  color: #dc2626;
  font-size: 0.85rem;
}

.execution-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px;
  background: var(--surface-card, #fff);
  border: 1px solid var(--surface-border, #e2e8f0);
  border-radius: 4px;
}

.result-summary {
  display: flex;
  align-items: center;
  gap: 8px;
}

.matched-count {
  font-weight: 600;
  color: #059669;
  font-size: 0.9rem;
}

.matched-rules {
  font-size: 0.8rem;
  color: var(--text-color-secondary, #64748b);
}

.output-values h4 {
  margin: 4px 0;
  font-size: 0.85rem;
}

.output-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 4px 0;
}

.output-rule-label {
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--text-color-secondary, #64748b);
  min-width: 60px;
}

.output-entry {
  font-size: 0.85rem;
}

.output-key {
  font-weight: 600;
  color: var(--text-color, #1e293b);
}

.output-val {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: #059669;
}

.no-match {
  font-size: 0.85rem;
  color: var(--text-color-secondary, #64748b);
  font-style: italic;
}
</style>
