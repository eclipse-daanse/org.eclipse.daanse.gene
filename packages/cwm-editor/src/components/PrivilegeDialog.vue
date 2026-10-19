<script setup lang="ts">
/**
 * Grants privileges (daanse privilege.ecore) on a table, view, column or
 * procedure - from one table of responsible parties:
 *
 * every responsible party of the model, with its path (its card on hover),
 * the actions it holds on the object already, the actions to grant (SELECT,
 * INSERT … on a table; EXECUTE on a procedure) and the names of the
 * privileges held and to be made. Responsible parties themselves are kept
 * in their own section only - the dialog makes none.
 *
 * For a table the privileges cover all columns, or only those picked (a
 * column's dialog starts with it); "weitergeben" is WITH GRANT OPTION.
 * Every ticked party gets one privilege per chosen action.
 *
 * Test ids: `cwm.Editor.PrivilegeDialog`, `.Row@<n>`, `.Row@<n>.<ACTION>`,
 * `.Columns`, `.Grantable`, `.Create`.
 */
import { computed, inject, ref, toRaw } from 'tsm:vue'
import RowContactCard from './RowContactCard.vue'
import {
  grantPrivilege,
  isColumnOfSet,
  isProcedure,
  privilegesAvailable,
  privilegeName,
  privilegesOn,
  TABLE_ACTIONS
} from '../composables/privileges'
import { isResponsibleParty, useCardHover } from '../composables/contactCard'
import { attr, className, many } from '../composables/documentation'
import { displayName, pathTo } from '../composables/contextView'
import { CWM_EDITING } from '../composables/editing'

const props = defineProps<{
  /** Table, view, column or procedure */
  target: any
}>()

const emit = defineEmits<{ close: [] }>()

const editing = inject(CWM_EDITING)!

const nameOf = (o: any) => String(attr(o, 'name') ?? '') || '(ohne Namen)'
const pathText = (o: any) => pathTo(o).map(displayName).join(' › ')

const available = computed(() => privilegesAvailable(props.target))

/** A column's privileges are its table's, limited to it */
const column = isColumnOfSet(props.target) ? toRaw(props.target) : null
const object = column ? toRaw(column.eContainer()) : toRaw(props.target)
const procedure = isProcedure(object)
const ACTIONS = procedure ? ['EXECUTE'] : TABLE_ACTIONS

/* ── columns and grant option, for all new privileges ────────────── */

const tableColumns = procedure ? [] : many(attr(object, 'feature')).filter(c => className(c) === 'Column')
const columns = ref<any[]>(column ? [column] : [])
const grantable = ref(false)

function toggleColumn(c: any): void {
  columns.value = columns.value.includes(c) ? columns.value.filter(x => x !== c) : [...columns.value, c]
}

/* ── the lines: responsible parties ──────────────────────────────── */

interface Line {
  party: any
  name: string
  /** Actions it holds on the object already */
  held: string[]
  /** Names of the privileges it holds on the object (all columns or some) */
  heldNames: string[]
  /** Actions to grant */
  actions: string[]
  ticked: boolean
}

const held = (party: any) => privilegesOn(editing.objects.value, object)
  .filter(v => v.grantee === party && (!v.columns.length || v.columns.length === columns.value.length))
  .map(v => v.action)

const heldNames = (party: any) => privilegesOn(editing.objects.value, object)
  .filter(v => v.grantee === party)
  .map(v => String(attr(v.privilege, 'name') ?? '') || privilegeName(v.action, v.target, v.columns))

/** The names the line's new privileges get */
function newNames(l: Line): string[] {
  return l.actions.map(a => privilegeName(a, object, procedure ? [] : columns.value))
}

const existing = ref<Line[]>(
  editing.objects.value
    .filter(isResponsibleParty)
    .map(p => ({ party: p, name: nameOf(p), held: held(p), heldNames: heldNames(p), actions: [], ticked: false }))
    .sort((a, b) => b.held.length - a.held.length || a.name.localeCompare(b.name))
)

const filter = ref('')

const lines = computed(() => {
  const f = filter.value.trim().toLowerCase()
  return existing.value.filter(l => !f || `${l.name} ${pathText(l.party)}`.toLowerCase().includes(f))
})

function toggle(l: Line): void {
  l.ticked = !l.ticked
  // A ticked line grants at least the first action it does not hold yet
  if (l.ticked && !l.actions.length) {
    const first = ACTIONS.find(a => !l.held.includes(a))
    if (first) l.actions = [first]
  }
}

function toggleAction(l: Line, a: string): void {
  if (l.held.includes(a)) return
  l.actions = l.actions.includes(a) ? l.actions.filter(x => x !== a) : [...l.actions, a]
  l.ticked = l.actions.length > 0
}

/* ── creating ────────────────────────────────────────────────────── */

const chosen = computed(() => existing.value.filter(l => l.ticked && l.actions.length))
const count = computed(() => chosen.value.reduce((n, l) => n + l.actions.length, 0))

function create(): void {
  if (!count.value) return
  editing.change(() => {
    for (const l of chosen.value) {
      for (const a of l.actions) grantPrivilege(toRaw(l.party), object, a, procedure ? [] : columns.value, grantable.value)
    }
  })
  emit('close')
}

const hover = useCardHover()
const { card, at } = hover
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-label="Privileges hinzufügen" data-testid="cwm.Editor.PrivilegeDialog">
      <header>
        <div>
          <strong>Privileges hinzufügen</strong>
          <p class="hint">auf <span class="target">{{ className(object) }} {{ displayName(object) }}</span> – je angehakter Responsible Party ein Privileg pro Aktion</p>
        </div>
        <input v-model="filter" class="filter" placeholder="Responsible Party suchen …" aria-label="Responsible Party suchen" />
      </header>

      <p v-if="!available" class="warn">
        <i class="pi pi-exclamation-triangle"></i>
        Das Modell privilege.ecore ist im Workspace nicht registriert – Privileges können nicht angelegt werden.
      </p>

      <div v-if="!procedure" class="options">
        <div class="columns" data-testid="cwm.Editor.PrivilegeDialog.Columns">
          <span class="label">Spalten</span>
          <button type="button" class="col" :class="{ on: !columns.length }" @click="columns = []">ganze Tabelle</button>
          <button
            v-for="(c, i) in tableColumns"
            :key="i"
            type="button"
            class="col"
            :class="{ on: columns.includes(c) }"
            @click="toggleColumn(c)"
          >{{ nameOf(c) }}</button>
        </div>
        <label class="grant-option" data-testid="cwm.Editor.PrivilegeDialog.Grantable" title="WITH GRANT OPTION">
          <input v-model="grantable" type="checkbox" /> darf weitergeben
        </label>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="tick"></th>
              <th>Responsible Party</th>
              <th>Aktionen</th>
              <th>Privileges</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(l, n) in lines"
              :key="n"
              :class="{ ticked: l.ticked }"
              :data-testid="`cwm.Editor.PrivilegeDialog.Row@${n}`"
              @click="toggle(l)"
            >
              <td class="tick">
                <input type="checkbox" :checked="l.ticked" :aria-label="`${l.name} wählen`" @click.stop="toggle(l)" />
              </td>
              <td class="party-cell">
                <span
                  class="party"
                  @mouseenter="hover.show(l.party, $event)"
                  @mouseleave="hover.hide"
                ><i class="pi pi-user"></i>{{ l.name }}</span>
                <span class="path">{{ pathText(l.party) }}</span>
              </td>
              <td @click.stop>
                <span class="actions">
                  <button
                    v-for="a in ACTIONS"
                    :key="a"
                    type="button"
                    :class="{ on: l.actions.includes(a), held: l.held.includes(a) }"
                    :disabled="l.held.includes(a)"
                    :title="l.held.includes(a) ? 'hat das Recht bereits' : undefined"
                    :data-testid="`cwm.Editor.PrivilegeDialog.Row@${n}.${a}`"
                    @click="toggleAction(l, a)"
                  >{{ a }}</button>
                </span>
              </td>
              <td class="names">
                <span v-for="(nm, k) in l.heldNames" :key="`h${k}`" class="pname held" title="vorhanden">{{ nm }}</span>
                <span v-for="(nm, k) in (l.ticked ? newNames(l) : [])" :key="`n${k}`" class="pname new-name" title="wird angelegt">+ {{ nm }}</span>
              </td>
            </tr>
            <tr v-if="!lines.length" class="empty">
              <td colspan="4">Keine Responsible Party gefunden – Responsible Parties werden in ihrer eigenen Sektion gepflegt.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer>
        <span class="count">{{ count }} {{ count === 1 ? 'Privileg' : 'Privileges' }} für {{ chosen.length }} {{ chosen.length === 1 ? 'Responsible Party' : 'Responsible Parties' }}</span>
        <button type="button" @click="emit('close')">Abbrechen</button>
        <button
          type="button"
          class="primary"
          :disabled="!count || !available"
          data-testid="cwm.Editor.PrivilegeDialog.Create"
          @click="create"
        >Anlegen</button>
      </footer>
    </div>

    <div
      v-if="card"
      class="card-popover"
      :style="{ top: `${at.top}px`, left: `${at.left}px` }"
      @mouseenter="hover.keep"
      @mouseleave="hover.hide"
    >
      <RowContactCard :object="card" test-id="cwm.Editor.PrivilegeDialog.ContactCard" readonly />
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.dialog {
  width: min(56rem, 95vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: var(--surface-card, var(--surface-ground));
  border: 1px solid var(--surface-border);
  border-top: 3px solid var(--primary-color);
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  font-size: 0.82rem;
  color: var(--text-color);
}

header {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  padding: 1rem 1.2rem 0.8rem;
}

header strong {
  font-size: 1rem;
}

.hint {
  margin: 0.2rem 0 0;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.target {
  color: var(--text-color);
  font-weight: 600;
}

.warn {
  margin: 0 1.2rem 0.6rem;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  font-size: 0.75rem;
  background: color-mix(in srgb, #f59e0b 16%, transparent);
}

.warn i {
  color: #f59e0b;
}

input:not([type='checkbox']),
select {
  box-sizing: border-box;
  font: inherit;
  color: var(--text-color);
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  padding: 0.3rem 0.55rem;
}

input:not([type='checkbox']):focus,
select:focus {
  outline: none;
  border-color: var(--primary-color);
}

input[type='checkbox'] {
  accent-color: var(--primary-color);
  margin: 0;
}

.filter {
  margin-left: auto;
  width: 18rem;
}

.label {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
  white-space: nowrap;
}

.label i {
  color: var(--primary-color);
}

/* ── columns and grant option ── */
.options {
  display: flex;
  align-items: flex-start;
  gap: 1.5rem;
  padding: 0 1.2rem 0.8rem;
}

.columns {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  flex: 1 1 auto;
}

.columns .label {
  margin-right: 0.3rem;
}

.col {
  font: inherit;
  font-size: 0.72rem;
  padding: 0.1rem 0.55rem;
  border: 1px solid var(--surface-border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
}

.col.on {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 14%, transparent);
  color: var(--text-color);
  font-weight: 600;
}

.grant-option {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
  cursor: pointer;
}

/* ── table ── */
.table-wrap {
  flex: 1 1 auto;
  min-height: 8rem;
  overflow: auto;
  border-top: 1px solid var(--surface-border);
  border-bottom: 1px solid var(--surface-border);
}

table {
  width: 100%;
  border-collapse: collapse;
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface-ground);
  text-align: left;
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid var(--surface-border);
  white-space: nowrap;
}

td {
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border) 60%, transparent);
  vertical-align: middle;
}

th:first-child,
td:first-child {
  padding-left: 1.2rem;
}

th:last-child,
td:last-child {
  padding-right: 1.2rem;
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover {
  background: var(--surface-hover);
}

tbody tr.ticked {
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}

tbody tr.ticked td:first-child {
  box-shadow: inset 3px 0 0 var(--primary-color);
}

.tick {
  width: 1rem;
}

.party {
  font-weight: 600;
  white-space: nowrap;
}

.party i {
  margin-right: 0.4rem;
  font-size: 0.75rem;
  color: var(--primary-color);
}

.party:hover {
  color: var(--primary-color);
}

.path {
  display: block;
  margin-top: 0.1rem;
  font-size: 0.7rem;
  color: var(--text-color-secondary);
}

/* The actions as toggles: chosen ones filled, held ones grey */
.actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.actions button {
  font: inherit;
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.12rem 0.5rem;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
}

.actions button:hover:not(:disabled) {
  border-color: var(--primary-color);
}

.actions button.on {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: var(--primary-color-text, #fff);
}

.actions button.held {
  cursor: default;
  border-style: dashed;
  background: color-mix(in srgb, var(--text-color) 8%, transparent);
}

/* Privilege names: held ones grey, the ones to be made in the primary colour */
.names {
  font-size: 0.72rem;
}

.pname {
  display: block;
  white-space: nowrap;
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
}

.pname.held {
  color: var(--text-color-secondary);
}

.pname.new-name {
  color: var(--primary-color);
  font-weight: 600;
}

.empty td {
  font-style: italic;
  color: var(--text-color-secondary);
  cursor: default;
}

footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.7rem 1.2rem;
  border-top: 1px solid var(--surface-border);
}

.count {
  margin-right: auto;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

footer button {
  font: inherit;
  padding: 0.3rem 0.9rem;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  background: var(--surface-ground);
  color: var(--text-color);
  cursor: pointer;
}

footer button.primary {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: var(--primary-color-text, #fff);
}

footer button:disabled {
  opacity: 0.5;
  cursor: default;
}

.card-popover {
  position: fixed;
  z-index: 1001;
  width: 560px;
  max-width: calc(100vw - 16px);
}

.card-popover :deep(.card) {
  margin: 0;
  max-width: none;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}
</style>
