<script setup lang="ts">
/**
 * Jobs Panel — Tracks all action executions (sync + async)
 * Displayed as a bottom panel tab.
 */

import { ref, computed, onUnmounted } from 'tsm:vue'
import { DataTable } from 'tsm:primevue'
import { Column } from 'tsm:primevue'
import { Button } from 'tsm:primevue'
import { ProgressBar } from 'tsm:primevue'
import { Tag } from 'tsm:primevue'
import { Select } from 'tsm:primevue'
import { useJobStore } from '../composables/useJobStore'
import type { Job, JobState } from '../types'

const store = useJobStore()

// Filter
const statusFilter = ref<string>('all')
const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Completed', value: 'completed' }
]

const filteredJobs = computed(() => {
  if (statusFilter.value === 'running') {
    return store.jobs.value.filter(j => j.status === 'QUEUED' || j.status === 'RUNNING')
  }
  if (statusFilter.value === 'completed') {
    return store.jobs.value.filter(j => j.status === 'COMPLETED' || j.status === 'FAILED' || j.status === 'CANCELED')
  }
  return store.jobs.value
})

// Expanded rows
const expandedRows = ref<Record<string, boolean>>({})

// Live timer — update every second
const now = ref(Date.now())
const timerId = setInterval(() => { now.value = Date.now() }, 1000)
onUnmounted(() => clearInterval(timerId))

function formatDuration(job: Job): string {
  const start = job.startedAt.getTime()
  const end = job.completedAt ? job.completedAt.getTime() : now.value
  const ms = end - start
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainSec = seconds % 60
  return `${minutes}m ${remainSec}s`
}

function statusSeverity(status: JobState): string {
  switch (status) {
    case 'COMPLETED': return 'success'
    case 'FAILED': return 'danger'
    case 'CANCELED': return 'warn'
    case 'RUNNING': return 'info'
    case 'QUEUED': return 'secondary'
    default: return 'secondary'
  }
}

function statusIcon(status: JobState): string {
  switch (status) {
    case 'COMPLETED': return 'pi pi-check-circle'
    case 'FAILED': return 'pi pi-times-circle'
    case 'CANCELED': return 'pi pi-ban'
    case 'RUNNING': return 'pi pi-spin pi-spinner'
    case 'QUEUED': return 'pi pi-clock'
    default: return 'pi pi-question'
  }
}

function canCancel(job: Job): boolean {
  return job.status === 'QUEUED' || job.status === 'RUNNING'
}

function handleCancel(job: Job): void {
  if (job.cancelFn) {
    job.cancelFn()
  } else {
    store.cancelJob(job.id)
  }
}

function logLevelSeverity(level: string): string {
  switch (level) {
    case 'ERROR': return 'danger'
    case 'WARN': return 'warn'
    default: return 'info'
  }
}
</script>

<template>
  <div class="jobs-panel">
    <!-- Toolbar -->
    <div class="jobs-toolbar">
      <Select
        v-model="statusFilter"
        :options="statusOptions"
        optionLabel="label"
        optionValue="value"
        class="jobs-filter"
        size="small"
      />
      <span class="jobs-count">{{ filteredJobs.length }} job(s)</span>
      <div class="jobs-toolbar-spacer" />
      <Button
        icon="pi pi-trash"
        label="Clear Completed"
        severity="secondary"
        size="small"
        text
        :disabled="store.completedJobs.value.length === 0"
        @click="store.clearCompleted()"
      />
    </div>

    <!-- Empty state -->
    <div v-if="filteredJobs.length === 0" class="jobs-empty">
      <i class="pi pi-bolt jobs-empty-icon" />
      <span>No jobs yet</span>
      <small>Actions executed via the context menu will appear here</small>
    </div>

    <!-- Jobs Table -->
    <DataTable
      v-else
      :value="filteredJobs"
      v-model:expandedRows="expandedRows"
      dataKey="id"
      size="small"
      scrollable
      scrollHeight="flex"
      class="jobs-table"
      stripedRows
    >
      <!-- Expand Toggle -->
      <Column expander style="width: 2.5rem" />

      <!-- Status Icon -->
      <Column header="Status" style="width: 7rem">
        <template #body="{ data }">
          <Tag :severity="statusSeverity((data as Job).status)" :value="(data as Job).status">
            <template #icon>
              <i :class="statusIcon((data as Job).status)" style="margin-right: 0.25rem" />
            </template>
          </Tag>
        </template>
      </Column>

      <!-- Action Name -->
      <Column header="Action" field="actionLabel" style="min-width: 12rem" />

      <!-- Progress -->
      <Column header="Progress" style="min-width: 12rem">
        <template #body="{ data }">
          <div v-if="canCancel(data as Job)" class="progress-cell">
            <ProgressBar
              :value="(data as Job).progress"
              :showValue="true"
              style="height: 1.25rem"
            />
            <small v-if="(data as Job).progressMessage" class="progress-msg">
              {{ (data as Job).progressMessage }}
            </small>
          </div>
          <Tag v-else-if="(data as Job).status === 'COMPLETED'" severity="success" value="Done" />
          <Tag v-else-if="(data as Job).status === 'FAILED'" severity="danger" value="Failed" />
          <Tag v-else-if="(data as Job).status === 'CANCELED'" severity="warn" value="Canceled" />
          <span v-else class="jobs-muted">{{ (data as Job).status }}</span>
        </template>
      </Column>

      <!-- Duration -->
      <Column header="Duration" style="width: 6rem">
        <template #body="{ data }">
          <span class="jobs-muted">{{ formatDuration(data as Job) }}</span>
        </template>
      </Column>

      <!-- Actions -->
      <Column header="" style="width: 3.5rem">
        <template #body="{ data }">
          <Button
            v-if="canCancel(data as Job)"
            icon="pi pi-times"
            severity="danger"
            size="small"
            text
            rounded
            @click="handleCancel(data as Job)"
            v-tooltip.top="'Cancel'"
          />
        </template>
      </Column>

      <!-- Expanded Row: Logs -->
      <template #expansion="{ data }">
        <div class="job-logs">
          <div v-if="(data as Job).logs.length === 0" class="job-logs-empty">No log entries</div>
          <div
            v-for="(log, idx) in (data as Job).logs"
            :key="idx"
            class="job-log-entry"
          >
            <Tag :severity="logLevelSeverity(log.level)" :value="log.level" class="log-level-tag" />
            <span class="log-timestamp" v-if="log.timestamp">{{ log.timestamp }}</span>
            <span class="log-message">{{ log.message }}</span>
          </div>
        </div>
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
.jobs-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--p-content-background);
}

.jobs-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
  background: var(--p-content-background);
}

.jobs-filter {
  width: 8rem;
}

.jobs-count {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.jobs-toolbar-spacer {
  flex: 1;
}

.jobs-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--p-text-muted-color);
  padding: 2rem;
}

.jobs-empty-icon {
  font-size: 2rem;
  opacity: 0.3;
}

.jobs-empty span {
  font-size: 0.9rem;
}

.jobs-empty small {
  font-size: 0.75rem;
  opacity: 0.6;
}

.jobs-muted {
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
}

.jobs-table {
  flex: 1;
  overflow: auto;
}

.progress-cell {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.progress-msg {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}

.job-logs {
  padding: 0.5rem 1rem;
  max-height: 12rem;
  overflow-y: auto;
  background: var(--p-content-background);
}

.job-logs-empty {
  color: var(--p-text-muted-color);
  font-style: italic;
  font-size: 0.85rem;
}

.job-log-entry {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.2rem 0;
  font-size: 0.8rem;
  font-family: monospace;
}

.log-level-tag {
  font-size: 0.65rem;
  padding: 0.1rem 0.3rem;
}

.log-timestamp {
  color: var(--p-text-muted-color);
  min-width: 5rem;
}

.log-message {
  flex: 1;
}
</style>
