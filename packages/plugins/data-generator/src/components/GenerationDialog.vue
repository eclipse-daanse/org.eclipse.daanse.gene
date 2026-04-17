<script setup lang="ts">
/**
 * GenerationDialog - Modal showing generation progress, log, and actions.
 */

import { ref, computed } from 'tsm:vue'
import { Dialog, Button, ProgressBar } from 'tsm:primevue'
import type { GenerationResult } from '../types'

const props = defineProps<{
  visible: boolean
  result: GenerationResult | null
  running: boolean
  progress: number
  progressMessage: string
}>()

const emit = defineEmits<{
  'update:visible': [val: boolean]
  'save-xmi': []
  'load-workspace': []
  'cancel': []
}>()

function handleClose() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="handleClose"
    header="Data Generation"
    :modal="true"
    :closable="!running"
    :style="{ width: '600px' }"
  >
    <!-- Progress bar -->
    <div class="progress-section" v-if="running">
      <ProgressBar :value="progress" :showValue="true" style="height: 20px" />
      <span class="progress-msg">{{ progressMessage }}</span>
    </div>

    <!-- Results -->
    <div v-if="result" class="result-section">
      <div class="result-summary" :class="{ success: result.success, error: !result.success }">
        <i :class="result.success ? 'pi pi-check-circle' : 'pi pi-exclamation-triangle'"></i>
        <span>
          {{ result.success ? 'Generation complete' : 'Generation completed with errors' }}
          — {{ result.instanceCount }} instances
        </span>
      </div>

      <!-- Errors -->
      <div v-if="result.errors.length > 0" class="log-section errors">
        <div class="log-header">Errors ({{ result.errors.length }})</div>
        <div class="log-content">
          <div v-for="(err, i) in result.errors" :key="i" class="log-line error-line">{{ err }}</div>
        </div>
      </div>

      <!-- Log -->
      <div class="log-section">
        <div class="log-header">Log</div>
        <div class="log-content">
          <div v-for="(line, i) in result.log" :key="i" class="log-line">{{ line }}</div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-actions">
        <Button
          v-if="running"
          label="Cancel"
          severity="secondary"
          size="small"
          @click="emit('cancel')"
        />
        <template v-else-if="result">
          <Button
            label="Close"
            severity="secondary"
            size="small"
            @click="handleClose"
          />
          <Button
            label="Save as XMI"
            icon="pi pi-download"
            size="small"
            :disabled="!result.success && result.instanceCount === 0"
            @click="emit('save-xmi')"
          />
          <Button
            label="Load in Workspace"
            icon="pi pi-upload"
            size="small"
            severity="success"
            :disabled="!result.success && result.instanceCount === 0"
            @click="emit('load-workspace')"
          />
        </template>
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.progress-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.progress-msg {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.result-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.result-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
}

.result-summary.success {
  background: color-mix(in srgb, var(--green-500) 15%, transparent);
  color: var(--green-500);
}

.result-summary.error {
  background: color-mix(in srgb, var(--red-500) 15%, transparent);
  color: var(--red-500);
}

.result-summary i { font-size: 1.125rem; }

.log-section {
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  overflow: hidden;
}

.log-section.errors {
  border-color: var(--red-400);
}

.log-header {
  padding: 4px 8px;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  background: var(--surface-ground);
  border-bottom: 1px solid var(--surface-border);
  color: var(--text-color-secondary);
}

.errors .log-header {
  background: color-mix(in srgb, var(--red-500) 15%, transparent);
  color: var(--red-500);
}

.log-content {
  max-height: 200px;
  overflow-y: auto;
  padding: 4px 0;
}

.log-line {
  padding: 2px 8px;
  font-size: 0.75rem;
  font-family: monospace;
  color: var(--text-color);
}

.log-line.error-line { color: var(--red-500); }

.dialog-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
</style>
