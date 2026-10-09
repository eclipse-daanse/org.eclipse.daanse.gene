<script setup lang="ts">
/**
 * CwmTableView - relational:Table with its columns
 *
 * Shown by the properties panel above the generic sections (ui.instance.views).
 * Read-only overview; editing stays in the generic sections or on the column.
 */

import { computed } from 'tsm:vue'
import type { EObject } from '@emfts/core'
import { summarizeTable, nameOf } from '../cwmModel'

const props = defineProps<{
  eObject: EObject
  version?: number
  navigate?: (obj: EObject) => void
}>()

const summary = computed(() => {
  void props.version // re-read when the model changes
  return summarizeTable(props.eObject)
})

function open(obj: EObject | null | undefined) {
  if (obj && props.navigate) props.navigate(obj)
}

function sizeText(row: { length: string; precision: string; scale: string }): string {
  if (row.length) return row.length
  if (row.precision) return row.scale ? `${row.precision},${row.scale}` : row.precision
  return ''
}
</script>

<template>
  <div class="cwm-table-view">
    <div class="section-heading">Table</div>

    <div v-if="summary.path.length" class="cwm-path">
      {{ [...summary.path, summary.name].join('.') }}
    </div>

    <p v-for="(text, i) in summary.descriptions" :key="i" class="cwm-description">{{ text }}</p>

    <div class="cwm-columns">
      <table v-if="summary.rows.length">
        <thead>
          <tr>
            <th class="col-key"></th>
            <th>Column</th>
            <th>Type</th>
            <th class="col-num">Size</th>
            <th class="col-null">Null</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in summary.rows" :key="row.name + row.typeName">
            <td class="col-key">
              <i v-if="row.primaryKey" class="pi pi-key key-pk" title="Primary key"></i>
              <i v-else-if="row.foreignKeyTargets.length" class="pi pi-link key-fk" title="Foreign key"></i>
            </td>
            <td>
              <a class="cwm-link" @click="open(row.column)">{{ row.name || '(unnamed)' }}</a>
              <span v-for="target in row.foreignKeyTargets" :key="nameOf(target)" class="fk-target">
                → <a class="cwm-link" @click="open(target)">{{ nameOf(target) }}</a>
              </span>
            </td>
            <td class="col-type">{{ row.typeName }}</td>
            <td class="col-num">{{ sizeText(row) }}</td>
            <td class="col-null">{{ row.nullable === null ? '' : row.nullable ? 'yes' : 'no' }}</td>
            <td class="col-desc">{{ row.description }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="cwm-empty">No columns</div>
    </div>
  </div>
</template>

<style scoped>
.cwm-table-view {
  margin-bottom: 0.75rem;
}

.section-heading {
  font-size: 0.75rem;
  text-align: center;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--primary-color, #6366f1);
  padding: 0.5rem 0.75rem 0.35rem;
  margin-bottom: 0.4rem;
  background: color-mix(in srgb, var(--primary-color, #6366f1) 6%, transparent);
  border-radius: 4px;
}

.cwm-path {
  font-family: var(--font-family-monospace, monospace);
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  margin: 0 0.25rem 0.4rem;
}

.cwm-description {
  margin: 0 0.25rem 0.5rem;
  font-size: 0.85rem;
  white-space: pre-wrap;
}

.cwm-columns {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

th {
  text-align: left;
  font-weight: 600;
  color: var(--text-color-secondary);
  border-bottom: 1px solid var(--surface-border);
  padding: 0.3rem 0.4rem;
  white-space: nowrap;
}

td {
  border-bottom: 1px solid var(--surface-border);
  padding: 0.3rem 0.4rem;
  vertical-align: top;
}

tbody tr:hover {
  background: var(--surface-hover);
}

.col-key {
  width: 1.5rem;
  text-align: center;
}

.col-num,
.col-null {
  white-space: nowrap;
}

.col-num {
  text-align: right;
}

.col-type {
  font-family: var(--font-family-monospace, monospace);
  white-space: nowrap;
}

.col-desc {
  color: var(--text-color-secondary);
  min-width: 12rem;
}

.key-pk {
  color: var(--orange-500, #f97316);
  font-size: 0.75rem;
}

.key-fk {
  color: var(--primary-color, #6366f1);
  font-size: 0.75rem;
}

.cwm-link {
  cursor: pointer;
  color: var(--primary-color, #6366f1);
}

.cwm-link:hover {
  text-decoration: underline;
}

.fk-target {
  margin-left: 0.35rem;
  color: var(--text-color-secondary);
  white-space: nowrap;
}

.cwm-empty {
  color: var(--text-color-secondary);
  font-size: 0.85rem;
  padding: 0.25rem;
}
</style>
