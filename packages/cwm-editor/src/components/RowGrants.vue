<script setup lang="ts">
/**
 * Access grants in a row body - there is no row of their own for a grant.
 *
 * - A responsible party shows "Zugriffe": the grants of the access roles it
 *   contains. "+ Zugriff" opens the assistant, which always puts the new
 *   grant under this party (design decision, Stefan, 2026-10-19 10:45).
 * - An access role elsewhere (e.g. in a catalog) shows its grants the same
 *   way.
 *
 * Indented by level (catalog, cube, dimension, hierarchy, schema, table,
 * column); the access is chosen in place. As everywhere in the view, the +
 * of a row adds what it can hold (a table grant to a schema grant …), × removes.
 * Objects pointed at show the party under "Siehe auch".
 *
 * Test ids: `<testId>` on the block, `.Row@<n>`, `.Row@<n>.Access`,
 * `.Row@<n>.Add.<level>`, `.Row@<n>.Remove`, `.AddCatalog`, `.Assistant`.
 */
import { computed, inject, ref, shallowRef } from 'tsm:vue'
import GrantDialog from './GrantDialog.vue'
import {
  accessOptions,
  addGrant,
  grantChildKinds,
  isAccessRole,
  partyGrantRows,
  rolesOfParty,
  roleGrantRows,
  type GrantChildKind,
  type GrantRow
} from '../composables/grants'
import { className } from '../composables/documentation'
import { setAttributeFromText } from '../composables/rowContent'
import { CWM_EDITING } from '../composables/editing'

const props = defineProps<{
  object: any
  testId: string
  version?: number
}>()

const editing = inject(CWM_EDITING)!

const forParty = computed(() => className(props.object) === 'ResponsibleParty')
const forRole = computed(() => isAccessRole(props.object))

const rows = computed<GrantRow[]>(() => {
  void props.version
  if (forParty.value) return partyGrantRows(props.object)
  if (forRole.value) return roleGrantRows(props.object)
  return []
})

/** Roles that can take a catalog grant: the role itself, or the party's roles */
const roles = computed(() => {
  void props.version
  return forRole.value ? [props.object] : forParty.value ? rolesOfParty(props.object) : []
})

function setAccess(row: GrantRow, event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  editing.change(() => setAttributeFromText(row.grant, row.accessFeature, value))
}

/* ── adding and removing ─────────────────────────────────────────── */

const dialog = shallowRef<{ parent?: any; kind?: GrantChildKind; party?: any } | null>(null)

function addChild(parent: any, kind: GrantChildKind): void {
  // A level without an object (catalog, member) needs no choice
  if (kind.targets(parent, editing.objects.value).length === 0) {
    editing.change(() => { addGrant(parent, kind.feature, null, kind.feature === 'accessCatalogGrants' ? 'custom' : 'all') })
    return
  }
  dialog.value = { parent, kind }
}

function addCatalog(): void {
  const role = roles.value[0]
  const kind = role ? grantChildKinds(role)[0] : null
  if (role && kind) addChild(role, kind)
}

function remove(row: GrantRow): void {
  editing.deleteObject(row.grant)
}

const assistant = ref(false)
</script>

<template>
  <div v-if="forParty || forRole" class="grants" :data-testid="testId" data-wire-kind="TABLE">
    <div v-if="rows.length" class="section-title">Zugriffe</div>
    <table v-if="rows.length">
      <thead>
        <tr>
          <th>Ebene</th>
          <th>Objekt</th>
          <th>Zugriff</th>
          <th class="actions"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, n) in rows" :key="n" :data-testid="`${testId}.Row@${n}`">
          <td class="level" :style="{ paddingLeft: `${0.3 + r.depth * 1.1}rem` }">{{ r.level }}</td>
          <td class="target">
            <a v-if="r.target" class="link" @click="editing.select(r.target)">{{ r.targetName }}</a>
          </td>
          <td>
            <select
              :value="r.access"
              class="access"
              :class="`access-${r.access}`"
              :aria-label="`Zugriff ${r.level} ${r.targetName}`"
              :data-testid="`${testId}.Row@${n}.Access`"
              @change="setAccess(r, $event)"
            >
              <option v-for="o in accessOptions(r)" :key="o" :value="o">{{ o }}</option>
            </select>
          </td>
          <td class="actions">
            <button
              v-for="k in grantChildKinds(r.grant)"
              :key="k.feature"
              type="button"
              class="add"
              :title="`${k.level}-Grant hinzufügen`"
              :data-testid="`${testId}.Row@${n}.Add.${k.level}`"
              @click="addChild(r.grant, k)"
            >+ {{ k.level }}</button>
            <button
              type="button"
              class="remove"
              title="Grant entfernen"
              :data-testid="`${testId}.Row@${n}.Remove`"
              @click="remove(r)"
            >×</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <button
        v-if="forParty"
        type="button"
        class="assist"
        :data-testid="`${testId}.Assistant`"
        @click="assistant = true"
      >+ Zugriff</button>
      <button
        v-if="roles.length"
        type="button"
        class="assist muted"
        :data-testid="`${testId}.AddCatalog`"
        @click="addCatalog"
      >+ Katalog-Grant</button>
    </div>

    <Teleport to="body">
      <GrantDialog v-if="assistant" :party="object" @close="assistant = false" />
      <GrantDialog v-if="dialog" :parent="dialog.parent" :kind="dialog.kind" @close="dialog = null" />
    </Teleport>
  </div>
</template>

<style scoped>
/* Category heading of the row body (Attribute, Referenzen, Siehe auch …) - centred between two lines */
.section-title {
  margin: 1rem 0 0.5rem;
  padding: 0.25rem 0;
  border-top: 1px solid var(--surface-border);
  border-bottom: 1px solid var(--surface-border);
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
  color: var(--text-color);
}

.grants {
  margin-top: 0.6rem;
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
  padding: 0.15rem 0.3rem;
  vertical-align: middle;
}

.level {
  color: var(--text-color-secondary);
  white-space: nowrap;
}

.link {
  color: var(--primary-color);
  cursor: pointer;
}

.link:hover {
  text-decoration: underline;
}

.access {
  font: inherit;
  font-weight: 600;
  padding: 0.05rem 0.4rem;
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
}

.access:hover,
.access:focus {
  outline: none;
  border-color: var(--surface-border);
}

.access-all {
  color: #16a34a;
  background: color-mix(in srgb, #16a34a 14%, transparent);
}

.access-none {
  color: #dc2626;
  background: color-mix(in srgb, #dc2626 14%, transparent);
}

.access-custom,
.access-all_dimensions {
  color: #d97706;
  background: color-mix(in srgb, #d97706 14%, transparent);
}

.access option {
  color: var(--text-color);
  background: var(--surface-card, var(--surface-ground));
  font-weight: 400;
}

/* The + and × of a row show on hover, as elsewhere in the view */
.actions {
  text-align: right;
  white-space: nowrap;
}

.actions button {
  opacity: 0;
  border: none;
  background: none;
  padding: 0 0.3rem;
  font: inherit;
  cursor: pointer;
}

tr:hover .actions button {
  opacity: 1;
}

.add {
  color: var(--primary-color);
}

.remove {
  color: var(--text-color-secondary);
}

.remove:hover {
  color: var(--red-500, #ef4444);
}

.footer {
  display: flex;
  gap: 0.9rem;
  margin-top: 0.3rem;
}

.assist {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 0.75rem;
  color: var(--primary-color);
  cursor: pointer;
}

.assist.muted {
  opacity: 0;
}

.grants:hover .assist.muted {
  opacity: 1;
}
</style>
