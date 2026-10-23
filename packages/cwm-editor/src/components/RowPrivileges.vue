<script setup lang="ts">
/**
 * "Privileges" (daanse privilege.ecore) in a row body:
 *
 * - on a table, view, column or procedure: who may do what - per privilege
 *   the responsible party holding it (its card on hover) with its path, the
 *   action (chosen in place), the columns it is limited to, WITH GRANT
 *   OPTION; × removes it. "+ Privileg" grants more.
 * - on a responsible party: the privileges it holds, with their objects.
 *   They have no rows of their own.
 *
 * Test ids: `<testId>` on the block, `.Row@<n>`, `.Row@<n>.Action`,
 * `.Row@<n>.Grantable`, `.Row@<n>.Remove`, `.Add`, `.ContactCard`.
 */
import { computed, inject, ref } from 'tsm:vue'
import PrivilegeDialog from './PrivilegeDialog.vue'
import RowContactCard from './RowContactCard.vue'
import {
  isPrivilegeTarget,
  privilegesOf,
  privilegesOn,
  setAction,
  TABLE_ACTIONS,
  type PrivilegeView
} from '../composables/privileges'
import { isResponsibleParty, useCardHover } from '../composables/contactCard'
import { attr, className } from '../composables/documentation'
import { displayName, pathTo } from '../composables/contextView'
import { setByName } from '../composables/creation'
import { CWM_EDITING } from '../composables/editing'

const props = defineProps<{
  object: any
  testId: string
  version?: number
}>()

const editing = inject(CWM_EDITING)!

const forTarget = computed(() => isPrivilegeTarget(props.object))
const forParty = computed(() => isResponsibleParty(props.object))

const rows = computed<PrivilegeView[]>(() => {
  void props.version
  if (forTarget.value) return privilegesOn(editing.objects.value, props.object)
  if (forParty.value) return privilegesOf(props.object)
  return []
})

const nameOf = (o: any) => String(attr(o, 'name') ?? '') || '(ohne Namen)'
const pathText = (o: any) => pathTo(o).map(displayName).join(' › ')

function columnsText(v: PrivilegeView): string {
  if (v.kind !== 'table') return ''
  return v.columns.length ? v.columns.map(nameOf).join(', ') : 'alle'
}

function onAction(v: PrivilegeView, event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  editing.change(() => setAction(v.privilege, value))
}

function onGrantable(v: PrivilegeView, event: Event): void {
  const checked = (event.target as HTMLInputElement).checked
  editing.change(() => setByName(v.privilege, 'grantable', checked))
}

const hover = useCardHover()
const { card, at } = hover
const adding = ref(false)
</script>

<template>
  <div v-if="forTarget || (forParty && rows.length)" class="privileges" :data-testid="testId" data-wire-kind="TABLE">
    <div class="section-title">Privileges</div>
    <table v-if="rows.length">
      <thead>
        <tr>
          <th v-if="forTarget">Responsible Party</th>
          <th v-else>Objekt</th>
          <th>Aktion</th>
          <th>Spalten</th>
          <th title="WITH GRANT OPTION – darf das Privileg weitergeben">weitergeben</th>
          <th class="actions"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(v, n) in rows" :key="n" :data-testid="`${testId}.Row@${n}`">
          <td v-if="forTarget" class="who">
            <template v-if="v.grantee">
              <a
                class="link party"
                @click="editing.select(v.grantee)"
                @mouseenter="hover.show(v.grantee, $event)"
                @mouseleave="hover.hide"
              ><i class="pi pi-user"></i>{{ nameOf(v.grantee) }}</a>
              <span class="path">{{ pathText(v.grantee) }}</span>
            </template>
            <span v-else class="muted">–</span>
          </td>
          <td v-else class="who">
            <template v-if="v.target">
              <a class="link" @click="editing.select(v.target)"><span class="kind">{{ className(v.target) }}</span>{{ nameOf(v.target) }}</a>
              <span class="path">{{ pathText(v.target) }}</span>
            </template>
          </td>
          <td>
            <select
              v-if="v.kind === 'table'"
              :value="v.action"
              class="action"
              :aria-label="`Aktion ${nameOf(v.grantee)}`"
              :data-testid="`${testId}.Row@${n}.Action`"
              @change="onAction(v, $event)"
            >
              <option v-for="a in TABLE_ACTIONS" :key="a" :value="a">{{ a }}</option>
            </select>
            <span v-else class="action fixed">{{ v.action }}</span>
          </td>
          <td class="columns" :class="{ all: v.kind === 'table' && !v.columns.length }">{{ columnsText(v) }}</td>
          <td class="grantable">
            <input
              type="checkbox"
              :checked="!!v.grantable"
              :aria-label="`${v.action} weitergeben`"
              :data-testid="`${testId}.Row@${n}.Grantable`"
              @change="onGrantable(v, $event)"
            />
          </td>
          <td class="actions">
            <button
              type="button"
              class="remove"
              title="Privileg entfernen"
              :data-testid="`${testId}.Row@${n}.Remove`"
              @click="editing.deleteObject(v.privilege)"
            >×</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="none">Noch keine Privileges</p>
    <button
      v-if="forTarget"
      type="button"
      class="add"
      :data-testid="`${testId}.Add`"
      data-wire-kind="CONTROL"
      title="Responsible Parties Rechte auf dieses Objekt geben"
      @click="adding = true"
    >+ Privileg</button>

    <Teleport to="body">
    <div
      v-if="card"
      class="card-popover"
      :style="{ top: `${at.top}px`, left: `${at.left}px` }"
      :data-testid="`${testId}.ContactCard`"
      @mouseenter="hover.keep"
      @mouseleave="hover.hide"
    >
      <RowContactCard :object="card" :test-id="`${testId}.ContactCard.Content`" :version="version" readonly />
    </div>
    </Teleport>

    <Teleport to="body">
      <PrivilegeDialog v-if="adding" :target="object" @close="adding = false" />
    </Teleport>
  </div>
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

.privileges {
  font-size: 0.72rem;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th {
  text-align: left;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
  padding: 0.3rem;
  white-space: nowrap;
}

td {
  padding: 0.2rem 0.3rem;
  vertical-align: middle;
}

.who {
  max-width: 24rem;
}

.link {
  cursor: pointer;
  color: var(--text-color);
}

.link:hover {
  color: var(--primary-color);
  text-decoration: underline;
}

.link i {
  margin-right: 0.3rem;
  font-size: 0.6rem;
  color: var(--primary-color);
}

.kind {
  margin-right: 0.3rem;
  color: var(--text-color-secondary);
}

.path {
  margin-left: 0.5rem;
  font-size: 0.68rem;
  color: var(--text-color-secondary);
}

.muted,
.none {
  color: var(--text-color-secondary);
}

.none {
  margin: 0;
  font-style: italic;
}

.action {
  font: inherit;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0.05rem 0.45rem;
}

select.action {
  cursor: pointer;
}

.columns.all {
  font-style: italic;
  color: var(--text-color-secondary);
}

.grantable {
  width: 4rem;
  text-align: center;
}

.grantable input {
  accent-color: var(--primary-color);
}

.actions {
  width: 1.5rem;
  text-align: right;
}

.remove {
  border: none;
  background: none;
  padding: 0 0.2rem;
  color: var(--text-color-secondary);
  cursor: pointer;
  opacity: 0;
}

tr:hover .remove {
  opacity: 1;
}

.remove:hover {
  color: var(--red-500, #ef4444);
}

.add {
  display: block;
  margin: 0.3rem 0 0;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 0.72rem;
  color: var(--primary-color);
  cursor: pointer;
}

.card-popover {
  position: fixed;
  z-index: 1000;
  width: 560px;
  max-width: calc(100vw - 16px);
}

.card-popover :deep(.card) {
  margin: 0;
  max-width: none;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}
</style>
