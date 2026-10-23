<script setup lang="ts">
/**
 * The attributes of an ObjectRow, edited in place (PH-7 after CR-2).
 *
 * Set attributes show by default, unset ones with a UI default too;
 * `showAll` reveals the rest, including those a field rule hides - the
 * row offers that switch in its title line.
 * Text fields offer the rule's suggested values; a UI default shows as
 * placeholder and is never written.
 */
import { computed, inject } from 'tsm:vue'
import { fieldsOf, setField, type RowField } from '../composables/rowContent'
import { CWM_EDITING } from '../composables/editing'
import { setFieldHidden } from '../composables/fieldDefaults'

const props = defineProps<{
  object: any
  testId: string
  version?: number
  showAll?: boolean
}>()

const editing = inject(CWM_EDITING)!
const fields = computed(() => {
  void props.version
  return fieldsOf(props.object, !!props.showAll)
})

function write(field: RowField, value: string | boolean): void {
  editing.change(() => setField(props.object, field, value))
}

/** The eye: hides the field for this class and its subclasses (a field rule) - or shows it again */
function toggleHidden(field: RowField): void {
  setFieldHidden(props.object, field.name, !field.hidden).catch(e => console.warn('[cwm-editor] Feldregel nicht gespeichert:', e))
}

function onInput(field: RowField, event: Event): void {
  const el = event.target as HTMLInputElement | HTMLSelectElement
  write(field, el.type === 'checkbox' ? (el as HTMLInputElement).checked : el.value)
}
</script>

<template>
  <div class="fields" :data-testid="testId" data-wire-kind="INPUT">
    <div v-if="fields.length" class="section-title">Attribute</div>
    <table v-if="fields.length" class="fields-table">
      <thead>
        <tr>
          <th>Attribut</th>
          <th>Wert</th>
          <th>Typ</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="f in fields" :key="f.name" :class="{ unset: !f.isSet }">
          <td class="col-name">
            <label
              :for="`${testId}.${f.name}`"
              :title="f.hidden ? 'Durch eine Feldregel ausgeblendet' : undefined"
            >{{ f.label }}<span v-if="f.hidden" class="hidden-mark"> ◌</span></label>
            <button
              type="button"
              class="rule"
              title="Feldregel bearbeiten"
              @click="editing.openFieldRules(object, f.name)"
            >⚙</button>
            <button
              type="button"
              class="rule eye"
              :title="f.hidden ? 'Wieder anzeigen (Feldregel)' : 'Für diese Klasse und erbende ausblenden (Feldregel)'"
              :data-testid="`${testId}.${f.name}.Hide`"
              @click="toggleHidden(f)"
            ><i :class="f.hidden ? 'pi pi-eye' : 'pi pi-eye-slash'"></i></button>
          </td>
          <td class="col-value">
            <input
              v-if="f.kind === 'boolean'"
              :id="`${testId}.${f.name}`"
              type="checkbox"
              :class="{ 'ui-default': !f.isSet && f.uiDefault != null }"
              :checked="f.isSet ? !!f.value : f.uiDefault === 'true'"
              :title="!f.isSet && f.uiDefault != null ? 'UI-Default, nicht im Modell' : undefined"
              @change="onInput(f, $event)"
            />
            <select
              v-else-if="f.kind === 'enum'"
              :id="`${testId}.${f.name}`"
              :value="f.value ?? ''"
              @change="onInput(f, $event)"
            >
              <option v-if="!f.isSet" value="" disabled>{{ f.uiDefault ?? '–' }}</option>
              <option v-for="o in f.options" :key="o" :value="o">{{ o }}</option>
            </select>
            <input
              v-else
              :id="`${testId}.${f.name}`"
              :type="f.kind === 'number' ? 'number' : 'text'"
              :value="f.value ?? ''"
              :placeholder="f.uiDefault ?? undefined"
              :title="!f.isSet && f.uiDefault != null ? 'UI-Default, nicht im Modell' : undefined"
              :list="f.suggestions.length ? `${testId}.${f.name}.suggestions` : undefined"
              @change="onInput(f, $event)"
            />
            <datalist v-if="f.suggestions.length" :id="`${testId}.${f.name}.suggestions`">
              <option v-for="s in f.suggestions" :key="s" :value="s"></option>
            </datalist>
          </td>
          <td class="col-type">{{ f.typeName }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
/* Native checkboxes in the primary colour */
input[type='checkbox'] {
  accent-color: var(--primary-color);
}

/* Category heading of the row body (Attribute, Referenzen, Siehe auch …) - left, between two lines */
.section-title {
  margin: 1rem 0 0.5rem;
  padding: 0.25rem 0;
  border-top: 1px solid var(--surface-border);
  border-bottom: 1px solid var(--surface-border);
  font-size: 0.75rem;
  font-weight: 600;
  text-align: left;
  color: var(--text-color);
}

.fields {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
}

.fields-table {
  width: 100%;
  border-collapse: collapse;
}

.fields-table th {
  text-align: left;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
  padding: 0.3rem;
}

.fields-table td {
  padding: 0.1rem 0.3rem;
  vertical-align: middle;
}

.fields-table tbody tr:hover {
  background: var(--surface-hover);
}

.col-name {
  width: 1%;
  white-space: nowrap;
}

.col-name label {
  color: var(--text-color-secondary);
}

tr.unset .col-name label {
  opacity: 0.7;
}

.col-value input:not([type='checkbox']),
.col-value select {
  width: 100%;
  box-sizing: border-box;
}

.col-type {
  width: 1%;
  white-space: nowrap;
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.rule {
  visibility: hidden;
  margin-left: 0.2rem;
  padding: 0;
  border: none;
  background: none;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  cursor: pointer;
}

tr:hover .rule {
  visibility: visible;
}

.rule.eye i {
  font-size: 0.7rem;
}

.rule:hover {
  color: var(--primary-color);
}

.hidden-mark {
  color: var(--text-color-secondary);
}

input::placeholder,
select:invalid {
  font-style: italic;
  color: var(--text-color-secondary);
}

input.ui-default {
  opacity: 0.6;
}

input[type='text'],
input[type='number'],
select {
  font: inherit;
  color: var(--text-color);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 0.1rem 0.3rem;
}

input[type='text']:hover,
input[type='number']:hover,
select:hover,
input:focus,
select:focus {
  border-color: var(--surface-border);
  background: var(--surface-ground);
}

input[type='checkbox'] {
  justify-self: start;
}
</style>
