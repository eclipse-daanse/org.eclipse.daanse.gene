<script setup lang="ts">
/**
 * The references of an object (PH-9): last block of the row body, with a
 * divider above and a smaller font. One row per Description, Document,
 * Responsible Party, Measurement or Change Request pointing at the object -
 * Name, Pfad, Description, Typ; hovering shows the referenced object's data,
 * a click goes there - a responsible party shows its business card on hover.
 * Access grants on the object have their own section, "Privileges".
 * "+ Siehe auch" opens a window to add one or several.
 */
import { computed, inject, onBeforeUnmount, ref, shallowRef } from 'tsm:vue'
import RowContactCard from './RowContactCard.vue'
import { isResponsibleParty } from '../composables/contactCard'
import { addReferences, referenceRows } from '../composables/references'
import { className, slug } from '../composables/documentation'
import { displayName, pathTo } from '../composables/contextView'
import { CWM_EDITING } from '../composables/editing'

const props = defineProps<{
  object: any
  /** Objects the row already shows elsewhere */
  shown?: Set<any>
  testId: string
  version?: number
}>()

const editing = inject(CWM_EDITING)!

const rows = computed(() => {
  void props.version
  return referenceRows(editing.references.value, props.object, props.shown)
})

/* The business card of the hovered responsible party; it stays while the pointer moves onto it */
const card = shallowRef<any>(null)
const cardAt = ref({ top: 0, left: 0 })
let hideTimer = 0
const CARD_WIDTH = 560

function showCard(o: any, event: MouseEvent): void {
  if (!isResponsibleParty(o)) return
  clearTimeout(hideTimer)
  const r = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const below = r.bottom + 4
  cardAt.value = { top: below, left: Math.max(8, Math.min(r.left + 24, window.innerWidth - CARD_WIDTH - 8)) }
  card.value = o
}

function hideCard(): void {
  clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => { card.value = null }, 200)
}

function keepCard(): void {
  clearTimeout(hideTimer)
}

onBeforeUnmount(() => clearTimeout(hideTimer))

const picking = ref(false)
const filter = ref('')
const chosen = ref(new Set<any>())
const candidates = ref<any[]>([])

const filtered = computed(() => {
  const f = filter.value.trim().toLowerCase()
  return candidates.value.filter(c => !f || `${className(c)} ${displayName(c)}`.toLowerCase().includes(f))
})

function openPicker(): void {
  candidates.value = editing.referenceCandidates(props.object)
  chosen.value = new Set()
  filter.value = ''
  picking.value = true
}

function toggle(c: any): void {
  const next = new Set(chosen.value)
  if (next.has(c)) next.delete(c)
  else next.add(c)
  chosen.value = next
}

function confirm(): void {
  const list = [...chosen.value]
  if (list.length > 0) editing.change(() => addReferences(props.object, list))
  picking.value = false
}
</script>

<template>
  <div class="references" :data-testid="testId" data-wire-kind="TABLE">
    <div v-if="rows.length" class="section-title">Siehe auch</div>
    <table v-if="rows.length">
      <thead>
        <tr>
          <th>Name</th>
          <th>Pfad</th>
          <th>Description</th>
          <th>Typ</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="r in rows"
          :key="r.name + r.type + r.path + r.description"
          :data-testid="`${testId}.Row@${slug(r.name)}`"
          :class="{ party: isResponsibleParty(r.object) }"
          :title="isResponsibleParty(r.object) ? undefined : r.details"
          @click="editing.select(r.object)"
          @mouseenter="showCard(r.object, $event)"
          @mouseleave="hideCard"
        >
          <td class="name">
            <i v-if="isResponsibleParty(r.object)" class="pi pi-user party-icon" title="Responsible Party – Visitenkarte beim Darüberfahren"></i>{{ r.name }}<span v-if="r.via.length" class="via" :title="`Verweist auf ${r.via.join(', ')}`"> → {{ r.via.join(', ') }}</span>
          </td>
          <td class="path"><template v-for="(c, ci) in r.crumbs" :key="ci"><span v-if="ci > 0" class="sep"> › </span><a class="crumb" :title="`${c.name} wählen`" @click.stop="editing.select(c.object)">{{ c.name }}</a></template></td>
          <td class="desc">{{ r.description }}</td>
          <td class="type">{{ r.type }}</td>
        </tr>
      </tbody>
    </table>
    <div
      v-if="card"
      class="card-popover"
      :style="{ top: `${cardAt.top}px`, left: `${cardAt.left}px` }"
      :data-testid="`${testId}.ContactCard`"
      @mouseenter="keepCard"
      @mouseleave="hideCard"
    >
      <RowContactCard :object="card" :test-id="`${testId}.ContactCard.Content`" :version="version" readonly />
    </div>

    <div class="adds">
    <button
      type="button"
      class="add"
      :data-testid="`${testId}.Add`"
      data-wire-kind="CONTROL"
      @click="openPicker"
    >+ Siehe auch</button>
    </div>

    <div v-if="picking" class="picker-backdrop" @click.self="picking = false">
      <div class="picker" role="dialog" aria-label="Siehe auch hinzufügen">
        <header>
          <strong>Siehe auch hinzufügen</strong>
          <input v-model="filter" placeholder="Filtern …" aria-label="Filtern" />
        </header>
        <ul>
          <li v-for="(c, i) in filtered" :key="i">
            <label>
              <input type="checkbox" :checked="chosen.has(c)" @change="toggle(c)" />
              <span class="type">{{ className(c) }}</span>
              <span>{{ displayName(c) }}</span>
              <span class="path">{{ pathTo(c).map(displayName).join(' › ') }}</span>
            </label>
          </li>
          <li v-if="filtered.length === 0" class="none">Nichts gefunden</li>
        </ul>
        <footer>
          <button type="button" @click="picking = false">Abbrechen</button>
          <button type="button" class="primary" :disabled="chosen.size === 0" @click="confirm">
            Hinzufügen ({{ chosen.size }})
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Category heading of the row body: Attribute, Referenzen, Siehe auch - centred between two lines */
.section-title {
  margin: 1rem 0 0.5rem;
  padding: 0.25rem 0;
  border-top: 1px solid var(--surface-border);
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
  color: var(--text-color);
  border-bottom: 1px solid var(--surface-border);
}

.references {
  margin-top: 0.6rem;
  font-size: 0.72rem;
}

table {
  width: 100%;
  border-collapse: collapse;
}

/* Headed like the attribute and reference tables above */
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
  vertical-align: top;
  border-top: 1px solid color-mix(in srgb, var(--surface-border) 60%, transparent);
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover {
  background: var(--surface-hover);
}

.name {
  color: var(--primary-color);
  white-space: nowrap;
}

.path,
.type {
  color: var(--text-color-secondary);
  white-space: nowrap;
}

.desc {
  color: var(--text-color-secondary);
}

.crumb {
  cursor: pointer;
}

.crumb:hover {
  color: var(--primary-color);
  text-decoration: underline;
}

.via {
  color: var(--text-color-secondary);
  font-style: italic;
}

.none {
  color: var(--text-color-secondary);
  padding: 0.15rem 0.3rem;
}

.adds {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
  margin-top: 0.3rem;
}

.add {
  display: block;
  font: inherit;
  padding: 0.1rem 0.4rem;
  border: 1px dashed var(--surface-border);
  border-radius: 3px;
  background: transparent;
  color: var(--primary-color);
  cursor: pointer;
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
  width: min(40rem, 90vw);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--surface-card, var(--surface-ground));
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  font-size: 0.85rem;
}

.picker header,
.picker footer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
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
  padding: 0 0.75rem;
  list-style: none;
  border-top: 1px solid var(--surface-border);
  border-bottom: 1px solid var(--surface-border);
}

.picker li label {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.25rem 0;
  cursor: pointer;
}

.picker footer {
  justify-content: flex-end;
}

.picker footer button {
  font: inherit;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--surface-border);
  border-radius: 3px;
  background: transparent;
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
.party-icon {
  margin-right: 0.3rem;
  font-size: 0.65rem;
  color: var(--primary-color);
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
