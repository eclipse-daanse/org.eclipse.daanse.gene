<script setup lang="ts">
/**
 * ConstraintList - Left sidebar showing all constraints in the set.
 * Supports selection, add/remove, and reorder operations.
 */

import type { CoclConstraint } from 'ui-problems-panel'
import { Button } from 'tsm:primevue'

const props = defineProps<{
  constraints: CoclConstraint[]
  selectedId: string | null
}>()

const emit = defineEmits<{
  select: [name: string]
  add: []
  remove: [name: string]
  'move-up': [name: string]
  'move-down': [name: string]
}>()

function getRoleBadgeClass(role: string): string {
  switch (role) {
    case 'VALIDATION': return 'badge-validation'
    case 'DERIVED': return 'badge-derived'
    case 'REFERENCE_FILTER': return 'badge-reffilter'
    default: return ''
  }
}

function getRoleLabel(role: string): string {
  switch (role) {
    case 'VALIDATION': return 'VAL'
    case 'DERIVED': return 'DER'
    case 'REFERENCE_FILTER': return 'REF'
    default: return role
  }
}

function getSeverityClass(severity: string): string {
  switch (severity) {
    case 'ERROR':
    case 'FATAL': return 'severity-error'
    case 'WARN': return 'severity-warn'
    case 'INFO': return 'severity-info'
    case 'TRACE': return 'severity-trace'
    default: return ''
  }
}
</script>

<template>
  <div class="constraint-list">
    <div class="list-toolbar">
      <Button
        icon="pi pi-plus"
        severity="secondary"
        text
        size="small"
        @click="emit('add')"
        title="Add constraint"
      />
      <Button
        icon="pi pi-minus"
        severity="secondary"
        text
        size="small"
        :disabled="!selectedId"
        @click="selectedId && emit('remove', selectedId)"
        title="Remove constraint"
      />
      <Button
        icon="pi pi-arrow-up"
        severity="secondary"
        text
        size="small"
        :disabled="!selectedId"
        @click="selectedId && emit('move-up', selectedId)"
        title="Move up"
      />
      <Button
        icon="pi pi-arrow-down"
        severity="secondary"
        text
        size="small"
        :disabled="!selectedId"
        @click="selectedId && emit('move-down', selectedId)"
        title="Move down"
      />
    </div>

    <div class="list-items">
      <div
        v-for="constraint in constraints"
        :key="constraint.name"
        class="constraint-item"
        :class="{
          selected: constraint.name === selectedId,
          inactive: !constraint.active
        }"
        @click="emit('select', constraint.name)"
      >
        <div class="item-header">
          <span class="item-name">{{ constraint.name }}</span>
          <span
            class="severity-dot"
            :class="getSeverityClass(constraint.severity)"
            :title="constraint.severity"
          />
        </div>
        <div class="item-meta">
          <span class="role-badge" :class="getRoleBadgeClass(constraint.role)">
            {{ getRoleLabel(constraint.role) }}
          </span>
          <span class="context-class">{{ constraint.contextClass }}</span>
        </div>
      </div>

      <div v-if="constraints.length === 0" class="empty-state">
        No constraints defined.
      </div>
    </div>
  </div>
</template>

<style scoped>
.constraint-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-right: 1px solid var(--surface-border, #e2e8f0);
}

.list-toolbar {
  display: flex;
  gap: 2px;
  padding: 4px;
  border-bottom: 1px solid var(--surface-border, #e2e8f0);
  background: var(--surface-section, #f1f5f9);
}

.list-items {
  flex: 1;
  overflow-y: auto;
}

.constraint-item {
  padding: 8px 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--surface-border, #e2e8f0);
  transition: background 0.15s;
}

.constraint-item:hover {
  background: var(--surface-hover, rgba(0,0,0,0.04));
}

.constraint-item.selected {
  background: rgba(99, 102, 241, 0.1);
  border-left: 3px solid var(--primary-color, #6366f1);
  padding-left: 7px;
}

.constraint-item.inactive {
  opacity: 0.5;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.item-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-color, #1e293b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.severity-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.severity-error { background: #ef4444; }
.severity-warn { background: #f59e0b; }
.severity-info { background: #3b82f6; }
.severity-trace { background: #94a3b8; }

.item-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
}

.role-badge {
  font-size: 0.625rem;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.badge-validation {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}

.badge-derived {
  background: rgba(59, 130, 246, 0.15);
  color: #2563eb;
}

.badge-reffilter {
  background: rgba(16, 185, 129, 0.15);
  color: #059669;
}

.context-class {
  font-size: 0.6875rem;
  color: var(--text-color-secondary, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  padding: 20px;
  text-align: center;
  color: var(--text-color-secondary, #64748b);
  font-size: 0.8125rem;
}
</style>
