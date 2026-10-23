<script setup lang="ts">
/**
 * The object's reference fields, right below its attributes: like the
 * attributes, one table row per non-containment reference of its class, set
 * or empty, with what it points at (contained objects are the row's
 * children). A click on a target selects it; "+" picks existing objects of
 * the reference's type; "×" takes a target out again. Some classes show a
 * reference as a block of its own (a Concept's related concepts -
 * `referenceBlockNames`): a heading as their text blocks, the targets'
 * table below it.
 *
 * Test ids: the table carries `<testId>`, each row `<testId>.Row@<feature>`.
 */
import { computed, inject, ref, shallowRef } from 'tsm:vue'
import { Button, Dialog, InputText } from 'tsm:primevue'
import {
  addToReference,
  creatableClasses,
  referenceFields,
  referenceTargetCandidates,
  removeFromReference,
  type ReferenceField
} from '../composables/references'
import { createIn } from '../composables/creation'
import { className } from '../composables/documentation'
import { displayName, pathTo } from '../composables/contextView'
import { CWM_EDITING } from '../composables/editing'
import { setFieldHidden } from '../composables/fieldDefaults'
import { blockHeading, referenceBlockNames } from '../composables/rowContent'

const props = defineProps<{
  object: any
  /** Targets the row already shows elsewhere */
  shown?: Set<any>
  testId: string
  version?: number
  /** Also the fields a field rule hides */
  showAll?: boolean
}>()

const editing = inject(CWM_EDITING)!

/** Targets shown per field before "+n weitere" */
const LIMIT = 8

const allFields = computed(() => {
  void props.version
  return referenceFields(props.object, props.shown, !!props.showAll)
})

/** The reference blocks, in their order, and the rest for the table */
const blocks = computed(() => {
  const names = referenceBlockNames(props.object)
  return names.map(n => allFields.value.find(f => f.name === n)).filter((f): f is ReferenceField => !!f)
})
const fields = computed(() => allFields.value.filter(f => !blocks.value.includes(f)))

const expanded = ref(new Set<string>())

function toggle(name: string): void {
  const next = new Set(expanded.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  expanded.value = next
}

function canAdd(f: ReferenceField): boolean {
  return f.many || f.targets.length === 0
}

/** The block's target whose "×" waits for its "Ja" */
const confirming = shallowRef<any>(null)

function remove(f: ReferenceField, target: any): void {
  if (f.containment) editing.deleteObject(target)
  else editing.change(() => removeFromReference(props.object, f.feature, target))
}

/* ── picker ───────────────────────────────────────────────────────── */

const picking = shallowRef<ReferenceField | null>(null)
const filter = ref('')
const options = shallowRef<any[]>([])
const chosen = ref(new Set<any>())

function label(o: any): string {
  return picking.value?.containment ? String(o.getName?.()) : `${className(o)} ${displayName(o)}`
}

/** What an entry shows as its name: a class's name, or the object's */
function entryName(o: any): string {
  return picking.value?.containment ? String(o.getName?.()) : displayName(o)
}

/** Several targets at once: tick them, then "Hinzufügen" */
const multiPick = computed(() => !!picking.value && !picking.value.containment && picking.value.many)

const pickerTitle = computed(() => {
  const f = picking.value
  if (!f) return ''
  if (f.containment) return `Neues ${f.typeName} in ${f.name}`
  return blocks.value.includes(f) ? `${blockHeading(f.name, f.many)} hinzufügen` : `${f.name}: ${f.typeName} wählen`
})

/** The icon the tree gives the object - or instances of the class */
function iconOf(o: any): { iconClass?: string; iconDataUrl?: string } | null {
  try {
    return editing.iconFor(picking.value?.containment ? { eClass: () => o } : o)
  } catch {
    return null
  }
}

function hint(o: any): string {
  return picking.value?.containment ? String(o.getEPackage?.()?.getName?.() ?? '') : pathTo(o).map(displayName).join(' › ')
}

const filtered = computed(() => {
  const f = filter.value.trim().toLowerCase()
  return options.value.filter(o => !f || `${label(o)} ${hint(o)}`.toLowerCase().includes(f))
})

function openPicker(f: ReferenceField): void {
  options.value = f.containment
    ? creatableClasses(editing.objects.value, f.feature)
    : referenceTargetCandidates(editing.objects.value, props.object, f.feature)
  filter.value = ''
  chosen.value = new Set()
  picking.value = f
}

function pick(o: any): void {
  const f = picking.value
  if (!f) return
  // Creating, or a single reference: one choice is the whole answer
  if (f.containment || !f.many) {
    editing.change(() => {
      if (f.containment) {
        const created = createIn(props.object, f.name, o)
        if (created) editing.select(created)
      } else {
        addToReference(props.object, f.feature, o)
      }
    })
    picking.value = null
    return
  }
  const next = new Set(chosen.value)
  if (next.has(o)) next.delete(o)
  else next.add(o)
  chosen.value = next
}

function confirm(): void {
  const f = picking.value
  const list = [...chosen.value]
  if (f && list.length > 0) editing.change(() => list.forEach(o => addToReference(props.object, f.feature, o)))
  picking.value = null
}

/** The eye: hides the reference for this class and its subclasses (a field rule) - or shows it again */
function toggleHidden(field: { name: string; hidden: boolean }): void {
  setFieldHidden(props.object, field.name, !field.hidden).catch(e => console.warn('[cwm-editor] Feldregel nicht gespeichert:', e))
}
</script>

<template>
  <!-- Reference blocks: a heading, the targets' table below it -->
  <div v-for="f in blocks" :key="f.name" class="ref-block" :data-testid="`${testId}.Block@${f.name}`">
    <div class="block-head">
      <span class="block-label" :title="f.hidden ? 'Durch eine Feldregel ausgeblendet' : f.name">{{ blockHeading(f.name, f.many) }}<span v-if="f.hidden"> ◌</span></span>
      <button type="button" class="rule" title="Feldregel bearbeiten" @click="editing.openFieldRules(object, f.name)">⚙</button>
      <button
        type="button"
        class="rule eye"
        :title="f.hidden ? 'Wieder anzeigen (Feldregel)' : 'Für diese Klasse und erbende ausblenden (Feldregel)'"
        :data-testid="`${testId}.Block@${f.name}.Hide`"
        @click="toggleHidden(f)"
      ><i :class="f.hidden ? 'pi pi-eye' : 'pi pi-eye-slash'"></i></button>
      <!-- As the text blocks' pencil: "+" beside the heading, on hover -->
      <button
        v-if="canAdd(f)"
        type="button"
        class="rule"
        :title="`${f.typeName} hinzufügen`"
        :aria-label="`${f.typeName} hinzufügen`"
        :data-testid="`${testId}.Block@${f.name}.Add`"
        @click="openPicker(f)"
      ><i class="pi pi-plus"></i></button>
    </div>
    <!-- The targets all of one kind here - no type column, no column heads -->
    <table v-if="f.targets.length" class="targets" :data-testid="`${testId}.Block@${f.name}.Targets`">
      <tbody>
        <tr v-for="(t, i) in expanded.has(f.name) ? f.targets : f.targets.slice(0, LIMIT)" :key="i">
          <td class="t-name">
            <a @click="editing.select(t.object)">{{ t.name }}</a>
            <!-- Removing asks first -->
            <span v-if="confirming === t.object" class="confirm-remove">
              entfernen?
              <button type="button" class="confirm-yes" :data-testid="`${testId}.Block@${f.name}.RemoveYes`" @click="remove(f, t.object); confirming = null">Ja</button>
              <button type="button" class="confirm-no" @click="confirming = null">Nein</button>
            </span>
            <button v-else type="button" class="remove" title="Verweis entfernen" @click="confirming = t.object">×</button>
          </td>
          <td class="t-path" :title="t.path"><template v-for="(c, ci) in t.crumbs" :key="ci"><span v-if="ci > 0" class="sep"> › </span><a class="crumb" :title="`${c.name} wählen`" @click.stop="editing.select(c.object)">{{ c.name }}</a></template></td>
        </tr>
      </tbody>
    </table>
    <button
      v-if="f.targets.length > LIMIT"
      type="button"
      class="more"
      @click="toggle(f.name)"
    >{{ expanded.has(f.name) ? 'weniger' : `+${f.targets.length - LIMIT} weitere` }}</button>
  </div>
  <div v-if="fields.length" class="section-title">Referenzen</div>
  <table v-if="fields.length" class="reference-fields" :data-testid="testId" data-wire-kind="TABLE">
    <tbody>
      <tr v-for="f in fields" :key="f.name" class="ref-field" :class="{ empty: f.targets.length === 0 }" :data-testid="`${testId}.Row@${f.name}`">
        <td class="col-name">
          <span :title="f.hidden ? 'Durch eine Feldregel ausgeblendet' : undefined">{{ f.name }}<span v-if="f.hidden"> ◌</span></span>
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
            :data-testid="`${testId}.Row@${f.name}.Hide`"
            @click="toggleHidden(f)"
          ><i :class="f.hidden ? 'pi pi-eye' : 'pi pi-eye-slash'"></i></button>
        </td>
        <td class="col-targets">
          <table v-if="f.targets.length" class="targets" :data-testid="`${testId}.Row@${f.name}.Targets`">
            <thead>
              <tr>
                <th>{{ f.typeName }}</th>
                <th>Typ</th>
                <th>Pfad</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(t, i) in expanded.has(f.name) ? f.targets : f.targets.slice(0, LIMIT)" :key="i">
                <td class="t-name"><a @click="editing.select(t.object)">{{ t.name }}</a></td>
                <td class="t-type">{{ t.type }}</td>
                <td class="t-path" :title="t.path"><template v-for="(c, ci) in t.crumbs" :key="ci"><span v-if="ci > 0" class="sep"> › </span><a class="crumb" :title="`${c.name} wählen`" @click.stop="editing.select(c.object)">{{ c.name }}</a></template></td>
                <td class="t-remove">
                  <button
                    type="button"
                    class="remove"
                    :title="f.containment ? 'Objekt löschen' : 'Verweis entfernen'"
                    @click="remove(f, t.object)"
                  >×</button>
                </td>
              </tr>
            </tbody>
          </table>
          <button
            v-if="f.targets.length > LIMIT"
            type="button"
            class="more"
            @click="toggle(f.name)"
          >{{ expanded.has(f.name) ? 'weniger' : `+${f.targets.length - LIMIT} weitere` }}</button>
          <button
            v-if="canAdd(f)"
            type="button"
            class="add"
            :title="f.containment ? `Neues ${f.typeName} anlegen` : `${f.typeName} wählen`"
            :data-testid="`${testId}.Row@${f.name}.Add`"
            @click="openPicker(f)"
          >+ hinzufügen</button>
        </td>
        <td class="col-type">{{ f.typeName }}{{ f.many ? ' *' : '' }}</td>
      </tr>
    </tbody>
  </table>

  <!-- Choosing targets (or a class to create): a GenE dialog, as the one for new children -->
  <Dialog
    :visible="!!picking"
    modal
    :header="pickerTitle"
    :style="{ width: '36rem' }"
    :pt="{ root: { 'data-testid': `${testId}.Picker` } }"
    @update:visible="(v: boolean) => { if (!v) picking = null }"
  >
    <div v-if="picking" class="ref-picker">
      <InputText
        v-model="filter"
        :placeholder="picking.containment ? 'Klasse suchen…' : `${picking.typeName} suchen…`"
        class="search"
        autofocus
        aria-label="Suchen"
      />
      <div class="list">
        <button
          v-for="(o, i) in filtered"
          :key="i"
          type="button"
          class="entry"
          :class="{ chosen: chosen.has(o) }"
          @click="pick(o)"
        >
          <i v-if="multiPick" class="check pi" :class="chosen.has(o) ? 'pi-check-square' : 'pi-stop'"></i>
          <img v-if="iconOf(o)?.iconDataUrl" :src="iconOf(o)!.iconDataUrl" class="icon" alt="" />
          <i v-else :class="iconOf(o)?.iconClass || 'pi pi-file'" class="icon"></i>
          <span class="text">
            <span class="name">{{ entryName(o) }}</span>
            <span v-if="hint(o)" class="path">{{ hint(o) }}</span>
          </span>
          <span v-if="!picking.containment" class="type">{{ className(o) }}</span>
        </button>
        <div v-if="filtered.length === 0" class="empty">
          {{ filter.trim() ? `Nichts passt zu „${filter.trim()}“` : 'Nichts zur Auswahl' }}
        </div>
      </div>
      <div class="counter">
        {{ filtered.length }} von {{ options.length }}<template v-if="multiPick"> · {{ chosen.size }} ausgewählt</template>
      </div>
    </div>
    <template #footer>
      <Button label="Abbrechen" severity="secondary" text @click="picking = null" />
      <Button
        v-if="multiPick"
        :label="`Hinzufügen (${chosen.size})`"
        :disabled="chosen.size === 0"
        @click="confirm"
      />
    </template>
  </Dialog>
</template>

<style scoped>
/* A reference block: its heading as the attributes' text blocks, the targets' table below */
.ref-block {
  margin: 0 0 0.6rem;
  font-size: 0.8rem;
}

.block-head {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  margin-bottom: 0.2rem;
}

.block-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-color-secondary);
}

.ref-block:hover .block-head .rule {
  visibility: visible;
}

.block-head .rule i {
  font-size: 0.65rem;
}

/* Over the whole width: the name as wide as it needs, the path the rest */
.ref-block .targets {
  table-layout: auto;
}

.ref-block .t-name {
  width: 1%;
  white-space: nowrap;
  padding-left: 0;
  padding-right: 1.2rem;
}

.confirm-remove {
  margin-left: 0.4rem;
  font-size: 0.72rem;
  color: var(--red-500, #ef4444);
}

.confirm-remove button {
  margin-left: 0.3rem;
  padding: 0;
  font: inherit;
  border: none;
  background: none;
  cursor: pointer;
}

.confirm-yes {
  font-weight: 600;
  color: var(--red-500, #ef4444);
}

.confirm-no {
  color: var(--text-color-secondary);
}

/* The whole path, wrapping when it is long */
.ref-block .t-path {
  white-space: normal;
  overflow: visible;
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

.reference-fields {
  width: 100%;
  margin-top: 0.35rem;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.reference-fields th {
  text-align: left;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
  padding: 0.3rem;
}

.reference-fields td {
  padding: 0.15rem 0.3rem;
  vertical-align: top;
}

.reference-fields tbody tr:hover {
  background: var(--surface-hover);
}

.col-name {
  width: 1%;
  white-space: nowrap;
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

.rule.eye i {
  font-size: 0.7rem;
}

.rule:hover {
  color: var(--primary-color);
}

tr:hover .rule {
  visibility: visible;
}

tr.empty .col-name {
  opacity: 0.7;
}

/* The targets as a table of their own: name, class, breadcrumb */
.targets {
  width: 100%;
  border-collapse: collapse;
}

.targets th {
  text-align: left;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
  padding: 0 0.3rem 0.15rem 0;
}

.reference-fields .targets td {
  padding: 0.1rem 0.3rem 0.1rem 0;
  border-bottom: none;
}

.targets {
  table-layout: fixed;
}

/* Name a third, the class as needed, the breadcrumb the rest */
.targets th:nth-child(1) {
  width: 30%;
}

.targets th:nth-child(2) {
  width: 8rem;
}

.targets th:nth-child(4) {
  width: 1.2rem;
}

.t-name,
.t-type {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.t-name a {
  color: var(--primary-color);
  cursor: pointer;
}

.t-name a:hover {
  text-decoration: underline;
}

.t-type {
  color: var(--text-color-secondary);
}

.t-path {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-color-secondary);
}

.crumb {
  cursor: pointer;
}

.crumb:hover {
  color: var(--primary-color);
  text-decoration: underline;
}

.t-remove {
  text-align: right;
}

.remove,
.more,
.add {
  font: inherit;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}

/* × only while the field's row is hovered */
.remove {
  visibility: hidden;
  margin-left: 0.15rem;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

tr:hover .remove {
  visibility: visible;
}

.more {
  font-size: 0.7rem;
  color: var(--text-color-secondary);
}

/* Set apart below the targets, like "+ Referenz" */
.add {
  display: block;
  font-size: 0.75rem;
  color: var(--primary-color);
}

/* A line of its own that keeps its place; "+ hinzufügen" shows while the field is hovered */
.add {
  visibility: hidden;
}

tr.ref-field:hover .add,
.add:focus-visible {
  visibility: visible;
}

.targets ~ .add {
  margin-top: 0.3rem;
}

.col-type {
  width: 1%;
  white-space: nowrap;
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

/* The picker dialog, as the one for new children */
.ref-picker {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.ref-picker .search {
  width: 100%;
}

.ref-picker .list {
  display: flex;
  flex-direction: column;
  max-height: 24rem;
  overflow-y: auto;
  border: 1px solid var(--surface-border, #dee2e6);
  border-radius: 6px;
}

.ref-picker .entry {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.7rem;
  background: none;
  border: none;
  border-bottom: 1px solid var(--surface-border, #dee2e6);
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
}

.ref-picker .entry:last-child {
  border-bottom: none;
}

.ref-picker .entry:hover,
.ref-picker .entry:focus-visible {
  background: var(--surface-hover, rgba(0, 0, 0, 0.04));
  outline: none;
}

.ref-picker .entry.chosen {
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}

.ref-picker .check {
  flex: 0 0 auto;
  font-size: 0.9rem;
  color: var(--text-color-secondary);
}

.ref-picker .entry.chosen .check {
  color: var(--primary-color);
}

.ref-picker .icon {
  flex: 0 0 1rem;
  width: 1rem;
  height: 1rem;
  font-size: 0.9rem;
  object-fit: contain;
  color: var(--text-color-secondary, #6c757d);
}

.ref-picker .text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ref-picker .name {
  font-weight: 600;
}

.ref-picker .path {
  font-size: 0.72rem;
  color: var(--text-color-secondary);
}

.ref-picker .type {
  flex: 0 0 auto;
  font-size: 0.7rem;
  color: var(--text-color-secondary);
}

.ref-picker .empty {
  padding: 1rem;
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-color-secondary);
}

.ref-picker .counter {
  font-size: 0.72rem;
  color: var(--text-color-secondary);
  text-align: right;
}
</style>
