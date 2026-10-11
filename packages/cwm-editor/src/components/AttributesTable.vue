<script setup lang="ts">
/**
 * The features of a classifier as a table, edited in place - the class
 * counterpart of the columns table. Attributes: Name, Typ, Multiplizität,
 * Remark. Association ends add Aggregation and Navigierbar.
 *
 * Test ids: the table carries `<testId>`, each row `<testId>.Row@<slug(name)>`.
 */
import { computed, inject } from 'tsm:vue'
import { slug } from '../composables/documentation'
import {
  attributeRows,
  hasAssociationEnds,
  classifierLabel,
  setAttributeType,
  setRangeBound,
  type AttributeRow
} from '../composables/attributes'
import { setColumnDescription, setColumnName } from '../composables/columnsEdit'
import { CWM_EDITING } from '../composables/editing'
import { setAttributeFromText } from '../composables/rowContent'

const props = defineProps<{
  object: any
  testId: string
  version?: number
}>()

const editing = inject(CWM_EDITING)!

const rows = computed(() => {
  void props.version
  return attributeRows(props.object)
})

const ends = computed(() => {
  void props.version
  return hasAssociationEnds(props.object)
})

function setByText(row: AttributeRow, featureName: string, text: string): void {
  const feature = row.attribute.eClass().getEStructuralFeature(featureName)
  if (feature) editing.change(() => setAttributeFromText(row.attribute, feature, text))
}

function value(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value
}

function onName(row: AttributeRow, event: Event): void {
  const name = value(event).trim()
  if (name) editing.change(() => setColumnName(row.attribute, name))
}

function typeIndex(row: AttributeRow): number {
  return editing.classifiers.value.indexOf(row.typeObject)
}

function onType(row: AttributeRow, event: Event): void {
  const index = Number(value(event))
  const type = Number.isNaN(index) || index < 0 ? null : editing.classifiers.value[index]
  editing.change(() => setAttributeType(row.attribute, type))
}

function onBound(row: AttributeRow, bound: 'lower' | 'upper', event: Event): void {
  editing.change(() => setRangeBound(row.attribute, bound, value(event)))
}

function onDescription(row: AttributeRow, event: Event): void {
  const body = value(event)
  editing.change(() => setColumnDescription(props.object, row.attribute, body, editing.descriptionClass.value))
}
</script>

<template>
  <table class="attributes-table" :data-testid="testId" data-wire-kind="TABLE">
    <thead>
      <tr>
        <th>Name</th>
        <th>Typ</th>
        <th>Multiplizität</th>
        <th v-if="ends">Aggregation</th>
        <th v-if="ends" class="col-nav" title="Navigierbar">Navigierbar</th>
        <th>Remark</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.name" :data-testid="`${testId}.Row@${slug(row.name)}`">
        <td class="col-name">
          <span class="name-cell">
            <a class="go" title="Attribut wählen" @click="editing.select(row.attribute)">›</a>
            <input class="mono" :value="row.name" aria-label="Name" @change="onName(row, $event)" />
          </span>
        </td>
        <td class="col-type">
          <select class="mono" :value="typeIndex(row)" aria-label="Typ" @change="onType(row, $event)">
            <option :value="-1">{{ row.typeName || '–' }}{{ typeIndex(row) < 0 && row.typeName ? ' (fremd)' : '' }}</option>
            <option v-for="(t, i) in editing.classifiers.value" :key="i" :value="i">
              {{ classifierLabel(t, editing.classifiers.value) }}
            </option>
          </select>
        </td>
        <td class="col-mult">
          <span class="range" :title="row.multiplicity ? `Multiplizität ${row.multiplicity}` : 'Keine Multiplizität'">
            <input
              class="mono bound"
              :value="row.lower"
              placeholder="0"
              aria-label="lower"
              title="lower"
              @change="onBound(row, 'lower', $event)"
            />
            <span class="dots">..</span>
            <input
              class="mono bound"
              :value="row.upper"
              placeholder="*"
              aria-label="upper"
              title="upper (* = unbeschränkt)"
              @change="onBound(row, 'upper', $event)"
            />
          </span>
        </td>
        <td v-if="ends">
          <select
            v-if="row.isEnd"
            :value="row.aggregation"
            aria-label="Aggregation"
            @change="setByText(row, 'aggregation', value($event))"
          >
            <option v-for="o in row.aggregationOptions" :key="o" :value="o">{{ o }}</option>
          </select>
        </td>
        <td v-if="ends" class="col-nav">
          <input
            v-if="row.isEnd"
            type="checkbox"
            :checked="row.navigable"
            aria-label="Navigierbar"
            @change="setByText(row, 'isNavigable', String(($event.target as HTMLInputElement).checked))"
          />
        </td>
        <td class="col-desc">
          <input :value="row.description" aria-label="Remark" placeholder="–" @change="onDescription(row, $event)" />
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
/* Native checkboxes in the primary colour */
input[type='checkbox'] {
  accent-color: var(--primary-color);
}

.attributes-table {
  margin-top: 0.6rem;
  border-collapse: collapse;
  width: 100%;
  font-size: 0.85rem;
}

.attributes-table th,
.attributes-table td {
  text-align: left;
  vertical-align: top;
  padding: 0.15rem 0.3rem;
  border-bottom: 1px solid var(--surface-border);
}

.attributes-table th {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
  white-space: nowrap;
  padding: 0.3rem;
}

.attributes-table tbody tr:hover {
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

.col-nav {
  text-align: center;
  white-space: nowrap;
}

/* Narrow column; the header ends in an ellipsis, its title says it in full */
th.col-nav {
  max-width: 3.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
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

.col-mult {
  width: 1%;
  white-space: nowrap;
}

.range {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
}

.range input.bound {
  width: 2.6rem;
  text-align: center;
}

.dots {
  color: var(--text-color-secondary);
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
  width: 45%;
}

.col-desc input {
  color: var(--text-color-secondary);
}
</style>
