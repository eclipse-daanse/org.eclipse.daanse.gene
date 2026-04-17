<script setup lang="ts">
/**
 * OCL Panel Component
 *
 * Displays OCL validation issues in a table view.
 * Supports filtering, sorting, and selection.
 */

import { ref, computed } from 'tsm:vue'
import { DataTable } from 'tsm:primevue'
import { Column } from 'tsm:primevue'
import { Button } from 'tsm:primevue'
import { InputText } from 'tsm:primevue'
import { Select } from 'tsm:primevue'
import { Tag } from 'tsm:primevue'
import { useSharedProblemsService } from '../composables/useProblemsService'
import type { OclValidationIssue, IssueSeverity, OclPanelFilter, IssueSource } from '../types'

const emit = defineEmits<{
  'select-object': [obj: any]
}>()

const problemsService = useSharedProblemsService()

// Filter state
const filter = ref<OclPanelFilter>({
  severity: undefined as any,
  eClassName: undefined as any,
  searchText: ''
})

// Severity options for dropdown
const severityOptions = [
  { label: 'All', value: undefined },
  { label: 'Errors', value: 'error' },
  { label: 'Warnings', value: 'warning' },
  { label: 'Info', value: 'info' }
]

// Filtered issues
const filteredIssues = computed(() => {
  let result = problemsService.issues.value

  // Filter by severity
  if (filter.value.severity) {
    result = result.filter(i => i.severity === filter.value.severity)
  }

  // Filter by class name
  if (filter.value.eClassName) {
    result = result.filter(i => i.eClassName === filter.value.eClassName)
  }

  // Filter by search text
  if (filter.value.searchText) {
    const search = filter.value.searchText.toLowerCase()
    result = result.filter(i =>
      i.message.toLowerCase().includes(search) ||
      i.objectLabel.toLowerCase().includes(search) ||
      i.eClassName.toLowerCase().includes(search) ||
      (i.constraintName?.toLowerCase().includes(search) ?? false)
    )
  }

  return result
})

// Unique class names for filter dropdown
const classNameOptions = computed(() => {
  const names = new Set<string>()
  for (const issue of problemsService.issues.value) {
    names.add(issue.eClassName)
  }
  return [
    { label: 'All Classes', value: undefined },
    ...Array.from(names).sort().map(name => ({ label: name, value: name }))
  ]
})

// Handle row selection
function onRowSelect(event: { data: OclValidationIssue }) {
  if (event.data.object) {
    emit('select-object', event.data.object)
  }
}

// Get severity tag type
function getSeverityType(severity: IssueSeverity): 'danger' | 'warn' | 'info' {
  switch (severity) {
    case 'error': return 'danger'
    case 'warning': return 'warn'
    case 'info': return 'info'
  }
}

// Get severity icon
function getSeverityIcon(severity: IssueSeverity): string {
  switch (severity) {
    case 'error': return 'pi pi-times-circle'
    case 'warning': return 'pi pi-exclamation-triangle'
    case 'info': return 'pi pi-info-circle'
  }
}

// Format timestamp
function formatTime(date: Date): string {
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Get file name from path
function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath
}

// Clear search
function clearSearch() {
  filter.value.searchText = ''
}
</script>

<template>
  <div class="ocl-panel">
    <!-- Toolbar -->
    <div class="ocl-toolbar">
      <div class="toolbar-left">
        <!-- Severity filter -->
        <Select
          v-model="filter.severity"
          :options="severityOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Severity"
          class="filter-dropdown"
        />

        <!-- Class filter -->
        <Select
          v-model="filter.eClassName"
          :options="classNameOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Class"
          class="filter-dropdown"
        />

        <!-- Search -->
        <span class="p-input-icon-left p-input-icon-right search-wrapper">
          <i class="pi pi-search"></i>
          <InputText
            v-model="filter.searchText"
            placeholder="Search..."
            class="search-input"
          />
          <i
            v-if="filter.searchText"
            class="pi pi-times clear-icon"
            @click="clearSearch"
          ></i>
        </span>
      </div>

      <div class="toolbar-right">
        <!-- Stats -->
        <div class="stats">
          <Tag v-if="problemsService.errorCount.value > 0" severity="danger" class="stat-tag">
            {{ problemsService.errorCount.value }} Error{{ problemsService.errorCount.value !== 1 ? 's' : '' }}
          </Tag>
          <Tag v-if="problemsService.warningCount.value > 0" severity="warn" class="stat-tag">
            {{ problemsService.warningCount.value }} Warning{{ problemsService.warningCount.value !== 1 ? 's' : '' }}
          </Tag>
          <span v-if="!problemsService.hasIssues.value" class="no-issues">
            <i class="pi pi-check-circle"></i>
            No issues
          </span>
        </div>

        <!-- Refresh button -->
        <Button
          icon="pi pi-refresh"
          text
          rounded
          :loading="problemsService.isValidating.value"
          title="Refresh validation"
          @click="problemsService.clearIssues()"
        />
      </div>
    </div>

    <!-- Issues table -->
    <DataTable
      :value="filteredIssues"
      selectionMode="single"
      dataKey="id"
      scrollable
      scrollHeight="flex"
      class="issues-table"
      :loading="problemsService.isValidating.value"
      @row-select="onRowSelect"
    >
      <template #empty>
        <div class="empty-state">
          <i class="pi pi-check-circle"></i>
          <span>No validation issues</span>
        </div>
      </template>

      <!-- Severity column -->
      <Column field="severity" header="" style="width: 3rem" class="severity-column">
        <template #body="{ data }">
          <i :class="getSeverityIcon(data.severity)" :style="{ color: `var(--${getSeverityType(data.severity)}-color)` }"></i>
        </template>
      </Column>

      <!-- Message column -->
      <Column field="message" header="Message" style="min-width: 200px">
        <template #body="{ data }">
          <div class="message-cell">
            <span class="message-text">{{ data.message }}</span>
            <span v-if="data.constraintName" class="constraint-name">[{{ data.constraintName }}]</span>
          </div>
        </template>
      </Column>

      <!-- Object/Location column -->
      <Column field="objectLabel" header="Location" style="width: 180px">
        <template #body="{ data }">
          <template v-if="data.object">
            <span class="object-label">{{ data.objectLabel }}</span>
          </template>
          <template v-else-if="data.filePath">
            <span class="file-location">
              <span class="file-name">{{ getFileName(data.filePath) }}</span>
              <span v-if="data.line" class="line-info">:{{ data.line }}<span v-if="data.column">:{{ data.column }}</span></span>
            </span>
          </template>
          <template v-else>
            <span class="object-label">{{ data.objectLabel }}</span>
          </template>
        </template>
      </Column>

      <!-- Class column -->
      <Column field="eClassName" header="Class" style="width: 120px">
        <template #body="{ data }">
          <Tag severity="secondary" class="class-tag">{{ data.eClassName }}</Tag>
        </template>
      </Column>

      <!-- Time column -->
      <Column field="timestamp" header="Time" style="width: 80px">
        <template #body="{ data }">
          <span class="time-text">{{ formatTime(data.timestamp) }}</span>
        </template>
      </Column>
    </DataTable>

    <!-- Status bar -->
    <div class="ocl-statusbar">
      <span v-if="problemsService.lastValidation.value" class="last-validation">
        Last validated: {{ formatTime(problemsService.lastValidation.value) }}
      </span>
      <span class="constraint-info">
        {{ problemsService.constraintCount.value }} constraints from {{ problemsService.packageCount.value }} package(s)
      </span>
    </div>
  </div>
</template>

<style scoped>
.ocl-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-ground);
}

.ocl-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--surface-section);
  border-bottom: 1px solid var(--surface-border);
  gap: 0.5rem;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.filter-dropdown {
  width: 120px;
}

/* PrimeVue 4 Dropdown Styles */
.filter-dropdown :deep(.p-select) {
  height: 2rem;
}

.filter-dropdown :deep(.p-select-label) {
  padding: 0.25rem 0.5rem;
  font-size: 0.8125rem;
}

/* Legacy selectors for compatibility */
.filter-dropdown :deep(.p-dropdown) {
  height: 2rem;
}

.filter-dropdown :deep(.p-dropdown-label) {
  padding: 0.25rem 0.5rem;
  font-size: 0.8125rem;
}

.search-wrapper {
  position: relative;
}

.search-input {
  width: 180px;
  height: 2rem;
  padding-left: 2rem;
  padding-right: 1.5rem;
  font-size: 0.8125rem;
}

.search-wrapper .pi-search {
  position: absolute;
  left: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.clear-icon {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  cursor: pointer;
  color: var(--text-color-secondary);
  font-size: 0.75rem;
}

.clear-icon:hover {
  color: var(--text-color);
}

.stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.stat-tag {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
}

.no-issues {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--green-500);
  font-size: 0.8125rem;
  font-weight: 500;
}

.no-issues i {
  font-size: 0.875rem;
}

.issues-table {
  flex: 1;
  min-height: 0;
}

/* PrimeVue 4 DataTable Styles */
.issues-table :deep(.p-datatable-thead > tr > th),
.issues-table :deep(.p-datatable-column-header-content) {
  background: var(--surface-section);
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--text-color-secondary);
  border-color: var(--surface-border) !important;
}

.issues-table :deep(.p-datatable-tbody > tr > td) {
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
  border-color: var(--surface-border) !important;
  color: var(--text-color) !important;
}

.issues-table :deep(.p-datatable-table) {
  background: transparent;
}

.issues-table :deep(.p-datatable-table-container) {
  border: none;
}

.issues-table :deep(.p-datatable-tbody > tr) {
  cursor: pointer;
  background: transparent;
}

.issues-table :deep(.p-datatable-tbody > tr:hover) {
  background: var(--surface-hover) !important;
}

.issues-table :deep(.p-datatable-header),
.issues-table :deep(.p-datatable-wrapper) {
  border: none;
}

.severity-column {
  text-align: center;
}

.severity-column i {
  font-size: 1rem;
}

.message-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.message-text {
  flex: 1;
}

.constraint-name {
  font-size: 0.6875rem;
  color: var(--text-color-secondary);
  font-family: monospace;
}

.object-label {
  font-weight: 500;
}

.file-location {
  font-family: monospace;
  font-size: 0.75rem;
}

.file-name {
  color: var(--text-color);
}

.line-info {
  color: var(--text-color-secondary);
}

.class-tag {
  font-size: 0.6875rem;
  padding: 0.125rem 0.375rem;
  font-family: monospace;
}

.time-text {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  font-family: monospace;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--text-color-secondary);
  gap: 0.5rem;
}

.empty-state i {
  font-size: 2rem;
  color: var(--green-500);
  opacity: 0.5;
}

.ocl-statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0.75rem;
  background: var(--surface-section);
  border-top: 1px solid var(--surface-border);
  font-size: 0.6875rem;
  color: var(--text-color-secondary);
}

.last-validation {
  font-style: italic;
}

.constraint-info {
  font-family: monospace;
}
</style>
