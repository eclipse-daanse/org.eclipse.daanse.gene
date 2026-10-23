<script setup lang="ts">
/**
 * The attributes of an ObjectRow, edited in place (PH-7 after CR-2).
 *
 * Set attributes show by default, unset ones with a UI default too;
 * `showAll` reveals the rest, including those a field rule hides - the
 * row offers that switch in its title line.
 * Text fields offer the rule's suggested values; a UI default shows as
 * placeholder and is never written. Some classes show text attributes as
 * blocks of their own above the table (a Concept's definition, example and
 * usage - `textBlockNames`): plain text, as the name - the pencil (on hover)
 * opens a multi-line editor over the whole width, "Fertig" (or Ctrl+Enter)
 * writes it, "Abbrechen" (or Escape) drops it.
 */
import { computed, inject, nextTick, ref } from 'tsm:vue'
import { blockHeading, fieldsOf, setField, textBlockNames, type RowField } from '../composables/rowContent'
import { CWM_EDITING } from '../composables/editing'
import { setFieldHidden } from '../composables/fieldDefaults'

const props = defineProps<{
  object: any
  testId: string
  version?: number
  showAll?: boolean
}>()

const editing = inject(CWM_EDITING)!
const allFields = computed(() => {
  void props.version
  return fieldsOf(props.object, !!props.showAll)
})

/** The text block being edited, by attribute name, and its draft */
const editingBlock = ref<string | null>(null)
const blockDraft = ref('')
const blockEditor = ref<HTMLTextAreaElement[] | HTMLTextAreaElement | null>(null)

async function editBlock(f: RowField): Promise<void> {
  blockDraft.value = f.value == null ? '' : String(f.value)
  editingBlock.value = f.name
  await nextTick()
  const el = Array.isArray(blockEditor.value) ? blockEditor.value[0] : blockEditor.value
  el?.focus()
}

/** "Fertig": writes the draft (if changed) and shows the text again */
function finishBlock(f: RowField): void {
  if (editingBlock.value !== f.name) return
  editingBlock.value = null
  if ((f.value == null ? '' : String(f.value)) !== blockDraft.value) write(f, blockDraft.value)
}

function cancelBlock(): void {
  editingBlock.value = null
}

/** A text block's heading: "Definition", "Example", "Usage" */
const capitalized = (text: string) => blockHeading(text)

/** The text blocks, in their order, and the rest for the table */
const blocks = computed(() => {
  const names = textBlockNames(props.object)
  return names.map(n => allFields.value.find(f => f.name === n && f.kind === 'text')).filter((f): f is RowField => !!f)
})
const fields = computed(() => allFields.value.filter(f => !blocks.value.includes(f)))

function write(field: RowField, value: string | boolean): void {
  editing.change(() => setField(props.object, field, value))
}

/** The eye: hides the field for this class and its subclasses (a field rule) - or shows it again */
function toggleHidden(field: RowField): void {
  setFieldHidden(props.object, field.name, !field.hidden).catch(e => console.warn('[cwm-editor] Feldregel nicht gespeichert:', e))
}

function onInput(field: RowField, event: Event): void {
  const el = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  write(field, el.type === 'checkbox' ? (el as HTMLInputElement).checked : el.value)
}
</script>

<template>
  <div class="fields" :data-testid="testId" data-wire-kind="INPUT">
    <!-- Text blocks: a label, then an editor over the whole width that grows with its text -->
    <div v-for="f in blocks" :key="f.name" class="text-block" :class="{ unset: !f.isSet }">
      <div class="block-head">
        <label :for="`${testId}.${f.name}`" :title="f.hidden ? 'Durch eine Feldregel ausgeblendet' : undefined"
        >{{ capitalized(f.label) }}<span v-if="f.hidden" class="hidden-mark"> ◌</span></label>
        <button type="button" class="rule" title="Feldregel bearbeiten" @click="editing.openFieldRules(object, f.name)">⚙</button>
        <button
          type="button"
          class="rule eye"
          :title="f.hidden ? 'Wieder anzeigen (Feldregel)' : 'Für diese Klasse und erbende ausblenden (Feldregel)'"
          :data-testid="`${testId}.${f.name}.Hide`"
          @click="toggleHidden(f)"
        ><i :class="f.hidden ? 'pi pi-eye' : 'pi pi-eye-slash'"></i></button>
        <button
          v-if="editingBlock !== f.name"
          type="button"
          class="rule edit"
          title="Bearbeiten"
          :aria-label="`${capitalized(f.label)} bearbeiten`"
          :data-testid="`${testId}.${f.name}.Edit`"
          @click="editBlock(f)"
        ><i class="pi pi-pencil"></i></button>
        <template v-else>
          <button type="button" class="block-action" :data-testid="`${testId}.${f.name}.Done`" @click="finishBlock(f)">Fertig</button>
          <button type="button" class="block-action muted" :data-testid="`${testId}.${f.name}.Cancel`" @click="cancelBlock">Abbrechen</button>
        </template>
      </div>
      <textarea
        v-if="editingBlock === f.name"
        :id="`${testId}.${f.name}`"
        ref="blockEditor"
        v-model="blockDraft"
        class="block-editor"
        :data-testid="`${testId}.${f.name}`"
        :placeholder="f.uiDefault ?? `${capitalized(f.label)} …`"
        rows="2"
        @keydown.esc.prevent="cancelBlock"
        @keydown.ctrl.enter.prevent="finishBlock(f)"
        @keydown.meta.enter.prevent="finishBlock(f)"
      ></textarea>
      <p
        v-else
        class="block-text"
        :class="{ empty: f.value == null || f.value === '' }"
        :data-testid="`${testId}.${f.name}.Text`"
      >{{ f.value == null || f.value === '' ? (f.uiDefault ?? '–') : f.value }}</p>
    </div>
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

.fields {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
}

/* A text block: its label above, the editor over the whole width, growing with its text */
.text-block {
  margin: 0 0 0.6rem;
}

.block-head {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  margin-bottom: 0.2rem;
}

.block-head label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-color-secondary);
}

.text-block:hover .rule {
  visibility: visible;
}

.block-editor {
  display: block;
  /* Its text in line with the heading and the text as read: the padding reaches out to the left */
  width: calc(100% + 0.5rem);
  margin-left: -0.5rem;
  box-sizing: border-box;
  min-height: 3.2em;
  field-sizing: content;
  resize: vertical;
  padding: 0.4rem 0.5rem;
  font: inherit;
  line-height: 1.45;
  color: var(--text-color);
  background: transparent;
  border: none;
  border-radius: 6px;
}

/* No frame - only a light ground while edited */
.block-editor:focus {
  outline: none;
  background: var(--surface-hover);
}

/* The text as read: its line breaks kept, aligned with the editor's text */
.block-text {
  margin: 0;
  padding: 0.1rem 0;
  line-height: 1.45;
  white-space: pre-wrap;
  color: var(--text-color);
}

.block-text.empty {
  font-style: italic;
  color: var(--text-color-secondary);
}

.rule.edit i {
  font-size: 0.65rem;
}

/* "Fertig" and "Abbrechen" beside the heading, as at the name */
.block-action {
  margin-left: 0.5rem;
  padding: 0;
  font: inherit;
  font-size: 0.7rem;
  border: none;
  background: none;
  color: var(--primary-color);
  cursor: pointer;
}

.block-action.muted {
  color: var(--text-color-secondary);
}

.block-editor::placeholder {
  font-style: italic;
  color: var(--text-color-secondary);
}

.fields-table {
  width: 100%;
  border-collapse: collapse;
  /* Room before what follows (Related Concepts, references) */
  margin-bottom: 1rem;
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

/* The attribute names start at the same edge as the text blocks' headings and the name above */
.fields-table th:first-child,
.fields-table td:first-child {
  padding-left: 0;
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
