<script setup lang="ts">
/**
 * The references of an object (PH-9): last block of the row body, with a
 * divider above and a smaller font. One row per Description, Document,
 * Responsible Party, Measurement or Change Request pointing at the object -
 * Name, Pfad, Description, Typ; hovering shows the referenced object's data,
 * a click goes there. "+ Referenz" opens a window to add one or several.
 */
import { computed, inject, ref } from 'tsm:vue'
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
          :key="r.name + r.type + r.path"
          :data-testid="`${testId}.Row@${slug(r.name)}`"
          :title="r.details"
          @click="editing.select(r.object)"
        >
          <td class="name">{{ r.name }}</td>
          <td class="path">{{ r.path }}</td>
          <td class="desc">{{ r.description }}</td>
          <td class="type">{{ r.type }}</td>
        </tr>
      </tbody>
    </table>
    <div v-else class="none">Keine Referenzen</div>

    <button
      type="button"
      class="add"
      :data-testid="`${testId}.Add`"
      data-wire-kind="CONTROL"
      @click="openPicker"
    >+ Referenz</button>

    <div v-if="picking" class="picker-backdrop" @click.self="picking = false">
      <div class="picker" role="dialog" aria-label="Referenzen hinzufügen">
        <header>
          <strong>Referenzen hinzufügen</strong>
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
.references {
  margin-top: 0.6rem;
  padding-top: 0.4rem;
  border-top: 1px solid var(--surface-border);
  font-size: 0.72rem;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th {
  text-align: left;
  font-weight: 600;
  color: var(--text-color-secondary);
  padding: 0.15rem 0.3rem;
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

.none {
  color: var(--text-color-secondary);
  padding: 0.15rem 0.3rem;
}

.add {
  display: block;
  margin: 0.3rem 0 0 auto;
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
</style>
