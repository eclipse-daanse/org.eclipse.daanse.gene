<script setup lang="ts">
/**
 * The columns of a relational table as a table (PH-8): Name, Typ, PK, Null,
 * Description, edited in place. Columns are rows here, not ObjectRows.
 *
 * Test ids follow PH-C1: the table carries `<testId>`, each row
 * `<testId>.Row@<slug(column name)>`.
 */
import { inject } from 'tsm:vue'
import type { TableColumnView, TableView } from '../composables/documentation'
import { attr, slug } from '../composables/documentation'
import {
  nullableLiterals,
  setColumnDescription,
  setColumnName,
  setColumnNullable,
  setColumnType,
  setPrimaryKey
} from '../composables/columnsEdit'
import { CWM_EDITING } from '../composables/editing'

const props = defineProps<{
  table: TableView
  /** data-testid of the table, e.g. cwm.Editor.ContextView.ObjectRow@Table-customer.Row.Body.Columns */
  testId?: string
}>()

const editing = inject(CWM_EDITING)!

const NULL_LABELS: Record<string, string> = {
  columnNoNulls: 'nein',
  columnNullable: 'ja',
  columnNullableUnknown: 'unbekannt'
}

function value(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value
}

function typeName(t: any): string {
  return String(attr(t, 'name') ?? '')
}

/** Name, and where it is defined when another type has the same name */
function typeLabel(t: any): string {
  const name = typeName(t)
  const twins = editing.dataTypes.value.filter(o => typeName(o) === name).length
  const owner = t.eContainer?.()
  return twins > 1 && owner ? `${name} · ${attr(owner, 'name') ?? ''}` : name
}

function onName(col: TableColumnView, event: Event): void {
  const name = value(event).trim()
  if (name) editing.change(() => setColumnName(col.column, name))
}

function onType(col: TableColumnView, event: Event): void {
  const index = Number(value(event))
  const type = Number.isNaN(index) || index < 0 ? null : editing.dataTypes.value[index]
  editing.change(() => setColumnType(col.column, type))
}

function typeIndex(col: TableColumnView): number {
  return editing.dataTypes.value.indexOf(col.typeObject)
}

function onPrimaryKey(col: TableColumnView, event: Event): void {
  const member = (event.target as HTMLInputElement).checked
  editing.change(() => setPrimaryKey(props.table.object, col.column, member))
}

function onNullable(col: TableColumnView, event: Event): void {
  editing.change(() => setColumnNullable(col.column, value(event)))
}

function onDescription(col: TableColumnView, event: Event): void {
  const body = value(event)
  editing.change(() => setColumnDescription(props.table.object, col.column, body, editing.descriptionClass.value))
}
</script>

<template>
  <table class="columns-table" :data-testid="testId" data-wire-kind="TABLE">
    <thead>
      <tr>
        <th>Name</th>
        <th>Typ</th>
        <th class="col-pk">PK</th>
        <th class="col-null">Null</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="col in table.columns"
        :key="col.name"
        :data-testid="testId ? `${testId}.Row@${slug(col.name)}` : undefined"
      >
        <td class="col-name">
          <span class="name-cell">
            <a class="go" title="Spalte wählen" @click="editing.select(col.column)">›</a>
            <input class="mono" :value="col.name" aria-label="Name" @change="onName(col, $event)" />
          </span>
          <span v-if="col.foreignKey" class="fk" :title="'Fremdschlüssel → ' + col.foreignKey">
            → <a class="link" @click="editing.select(col.foreignKeyTable)">{{ col.foreignKey }}</a>
          </span>
        </td>
        <td class="col-type">
          <select class="mono" :value="typeIndex(col)" aria-label="Typ" @change="onType(col, $event)">
            <option :value="-1">{{ col.type || '–' }}{{ typeIndex(col) < 0 && col.type ? ' (fremd)' : '' }}</option>
            <option v-for="(t, i) in editing.dataTypes.value" :key="i" :value="i">{{ typeLabel(t) }}</option>
          </select>
        </td>
        <td class="col-pk">
          <input type="checkbox" :checked="col.primaryKey" aria-label="Primärschlüssel" @change="onPrimaryKey(col, $event)" />
        </td>
        <td class="col-null">
          <select :value="col.nullable" aria-label="Null" @change="onNullable(col, $event)">
            <option v-for="l in nullableLiterals(col.column)" :key="l" :value="l">{{ NULL_LABELS[l] ?? l }}</option>
          </select>
        </td>
        <td class="col-desc">
          <input :value="col.description" aria-label="Description" placeholder="–" @change="onDescription(col, $event)" />
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.columns-table {
  margin-top: 0.6rem;
  border-collapse: collapse;
  width: 100%;
  font-size: 0.85rem;
}

.columns-table th,
.columns-table td {
  text-align: left;
  vertical-align: top;
  padding: 0.15rem 0.3rem;
  border-bottom: 1px solid var(--surface-border);
}

.columns-table th {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
  white-space: nowrap;
  padding: 0.3rem;
}

.columns-table tbody tr:hover {
  background: var(--surface-hover);
}

input,
select {
  font: inherit;
  color: var(--text-color);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 0.1rem 0.25rem;
  max-width: 100%;
}

input:not([type='checkbox']) {
  width: 100%;
  box-sizing: border-box;
}

input:hover,
select:hover,
input:focus,
select:focus {
  border-color: var(--surface-border);
  background: var(--surface-ground);
}

.mono {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
}

.col-name {
  width: 22%;
  min-width: 12rem;
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.go {
  cursor: pointer;
  color: var(--primary-color);
  padding: 0 0.15rem;
}

.col-pk,
.col-null {
  white-space: nowrap;
  text-align: center;
}

/* The type takes what its name needs, the description gets the rest */
.col-type {
  width: 1%;
  white-space: nowrap;
}

.col-type select {
  max-width: 11rem;
}

.col-desc {
  width: 50%;
}

.col-desc input {
  color: var(--text-color-secondary);
}

.link {
  cursor: pointer;
  color: var(--primary-color);
}

.link:hover {
  text-decoration: underline;
}

.fk {
  display: block;
  margin-left: 0.9rem;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}
</style>
