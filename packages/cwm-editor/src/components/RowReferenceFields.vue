<script setup lang="ts">
/**
 * The object's reference fields, right below its attributes: like the
 * attributes, one table row per non-containment reference of its class, set
 * or empty, with what it points at (contained objects are the row's
 * children). A click on a target selects it; "+" picks existing objects of
 * the reference's type; "×" takes a target out again.
 *
 * Test ids: the table carries `<testId>`, each row `<testId>.Row@<feature>`.
 */
import { computed, inject, ref, shallowRef } from 'tsm:vue'
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

const fields = computed(() => {
  void props.version
  return referenceFields(props.object, props.shown, !!props.showAll)
})

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

  <!-- On the page, not in the row: rows clip what reaches outside them -->
  <Teleport to="body">
  <div v-if="picking" class="picker-backdrop" @click.self="picking = null">
    <div class="picker" role="dialog" :aria-label="picking.containment ? 'Objekt anlegen' : 'Referenz wählen'">
      <header>
        <strong>{{ picking.name }}: {{ picking.containment ? `neues ${picking.typeName}` : picking.typeName }}</strong>
        <input v-model="filter" placeholder="Filtern …" aria-label="Filtern" />
      </header>
      <ul>
        <li
          v-for="(o, i) in filtered"
          :key="i"
          :class="{ chosen: chosen.has(o) }"
          @click="pick(o)"
        >
          <span>{{ label(o) }}</span>
          <span class="hint">{{ hint(o) }}</span>
        </li>
        <li v-if="filtered.length === 0" class="none">Nichts gefunden</li>
      </ul>
      <footer>
        <button type="button" @click="picking = null">Abbrechen</button>
        <button
          v-if="!picking.containment && picking.many"
          type="button"
          class="primary"
          :disabled="chosen.size === 0"
          @click="confirm"
        >Hinzufügen ({{ chosen.size }})</button>
      </footer>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
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

.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.picker {
  width: min(32rem, 92vw);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--surface-card, var(--surface-ground));
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  font-size: 0.85rem;
  color: var(--text-color);
}

.picker header,
.picker footer {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
}

.picker header {
  border-bottom: 1px solid var(--surface-border);
}

.picker header input {
  flex: 1 1 auto;
  font: inherit;
  color: var(--text-color);
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 3px;
  padding: 0.2rem 0.4rem;
}

.picker ul {
  flex: 1 1 auto;
  overflow: auto;
  margin: 0;
  padding: 0.3rem 0;
  list-style: none;
}

.picker li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.25rem 0.75rem;
  cursor: pointer;
}

.picker li:hover {
  background: var(--surface-hover);
}

.picker li.chosen {
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
}

.picker li.none {
  cursor: default;
  color: var(--text-color-secondary);
}

.hint {
  color: var(--text-color-secondary);
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.picker footer {
  justify-content: flex-end;
  border-top: 1px solid var(--surface-border);
}

.picker footer button {
  font: inherit;
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  background: var(--surface-ground);
  color: var(--text-color);
  cursor: pointer;
}

.picker footer button.primary {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: var(--primary-color-text, #fff);
}

.picker footer button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
