<script setup lang="ts">
/**
 * The glossary beside the context view: the objects of chosen classifiers
 * (optionally with their subclasses) as a table, one column per attribute,
 * sortable by every column. The arrow of a row jumps to its object in the
 * context view. A cell of an attribute the object does not have stays grey.
 *
 * Test ids: `cwm.Editor.Glossary`, `.Classes`, `.Subclasses`, `.Table`,
 * `.Columns` (menu of the columns shown), `.Row@<n>`, `.Row@<n>.Jump`.
 */
import { computed, ref, shallowRef, toRaw } from 'tsm:vue'
import { compareCells, glossaryObjects, glossaryTable, type GlossaryRow } from '../composables/glossary'
import { classKey } from '../composables/references'

const props = defineProps<{
  /** All objects of the resource set */
  objects: any[]
  /** Classes of the loaded objects and their supertypes */
  classes: any[]
  selected: any
  version?: number
  orientation: 'row' | 'column'
}>()

const emit = defineEmits<{
  jump: [object: any]
  close: []
  orientation: [value: 'row' | 'column']
}>()

/* ── classifier filter ───────────────────────────────────────────── */

const chosen = shallowRef<any[]>([])
const withSubclasses = ref(true)
const query = ref('')
const picking = ref(false)

/** Each class once, by name; the package tells same-named ones apart */
const classChoices = computed(() => {
  const seen = new Set<string>()
  const out: any[] = []
  for (const c of props.classes) {
    const k = classKey(c)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(c)
  }
  return out.sort((a, b) => String(a.getName()).localeCompare(String(b.getName())))
})

const chosenKeys = computed(() => new Set(chosen.value.map(classKey)))

const matches = computed(() => {
  const q = query.value.trim().toLowerCase()
  return classChoices.value
    .filter(c => !chosenKeys.value.has(classKey(c)) && (!q || String(c.getName()).toLowerCase().includes(q)))
    .slice(0, 50)
})

function choose(c: any): void {
  chosen.value = [...chosen.value, c]
  query.value = ''
  picking.value = false
}

function unchoose(c: any): void {
  chosen.value = chosen.value.filter(x => x !== c)
}

function onEnter(): void {
  const first = matches.value[0]
  if (first) choose(first)
}

/** Hides the list after a click into it has been handled */
function onBlur(): void {
  setTimeout(() => { picking.value = false }, 150)
}

/* ── table ───────────────────────────────────────────────────────── */

const table = computed(() => {
  void props.version
  return glossaryTable(glossaryObjects(props.objects, chosen.value, withSubclasses.value))
})

/** Column key, "class" for the class column; null = model order */
const sortKey = ref<string | null>(null)
const ascending = ref(true)

function sortBy(key: string): void {
  if (sortKey.value === key) ascending.value = !ascending.value
  else {
    sortKey.value = key
    ascending.value = true
  }
}

function cellOf(row: GlossaryRow, key: string): string | undefined {
  return key === 'class' ? row.className : row.cells[key]
}

const rows = computed(() => {
  const key = sortKey.value
  if (!key) return table.value.rows
  const sign = ascending.value ? 1 : -1
  return [...table.value.rows].sort((a, b) => {
    const x = cellOf(a, key)
    const y = cellOf(b, key)
    // Empty cells stay at the end either way
    const ex = x == null || x === ''
    const ey = y == null || y === ''
    if (ex || ey) return compareCells(x, y)
    return sign * compareCells(x, y)
  })
})

/* ── columns shown ───────────────────────────────────────────────── */

/** Columns switched off in the menu, by key */
const hiddenColumns = ref(new Set<string>())
/** Columns a field rule hides, switched on in the menu anyway */
const shownAnyway = ref(new Set<string>())
const columnMenu = ref(false)

function isShown(c: { key: string; ruleHidden: boolean }): boolean {
  return c.ruleHidden ? shownAnyway.value.has(c.key) : !hiddenColumns.value.has(c.key)
}

const shownColumns = computed(() => table.value.columns.filter(isShown))

/** The menu's entries, grouped by the class defining the attribute */
const columnGroups = computed(() => {
  const groups = new Map<string, typeof table.value.columns>()
  for (const c of table.value.columns) {
    const list = groups.get(c.owner) ?? []
    list.push(c)
    groups.set(c.owner, list)
  }
  return [...groups.entries()].map(([owner, columns]) => ({ owner, columns }))
})

function toggleColumn(c: { key: string; ruleHidden: boolean }): void {
  const set = c.ruleHidden ? shownAnyway : hiddenColumns
  const next = new Set(set.value)
  if (next.has(c.key)) next.delete(c.key)
  else next.add(c.key)
  set.value = next
}

/** "alle": every column not hidden by a rule; "keine": none at all */
function showAllColumns(show: boolean): void {
  hiddenColumns.value = show ? new Set() : new Set(table.value.columns.map(c => c.key))
  shownAnyway.value = new Set()
}

function arrow(key: string): string {
  return sortKey.value === key ? (ascending.value ? ' ▲' : ' ▼') : ''
}

const selectedRaw = computed(() => toRaw(props.selected))
</script>

<template>
  <section class="glossary" data-testid="cwm.Editor.Glossary" data-wire-kind="REGION">
    <header>
      <strong>Glossar</strong>
      <div class="classes" data-testid="cwm.Editor.Glossary.Classes">
        <span v-for="c in chosen" :key="classKey(c)" class="chip" :title="c.getEPackage?.()?.getName?.()">
          {{ c.getName() }}
          <button type="button" title="Entfernen" @click="unchoose(c)">×</button>
        </span>
        <div class="picker">
          <input
            v-model="query"
            placeholder="Classifier hinzufügen …"
            aria-label="Classifier hinzufügen"
            @focus="picking = true"
            @input="picking = true"
            @blur="onBlur"
            @keydown.enter.prevent="onEnter"
            @keydown.escape="picking = false"
          />
          <ul v-if="picking && matches.length" class="matches">
            <li v-for="c in matches" :key="classKey(c)" @mousedown.prevent="choose(c)">
              {{ c.getName() }}<span class="pkg">{{ c.getEPackage?.()?.getName?.() }}</span>
            </li>
          </ul>
        </div>
      </div>
      <label class="subclasses" data-testid="cwm.Editor.Glossary.Subclasses">
        <input v-model="withSubclasses" type="checkbox" /> mit erbenden Klassen
      </label>
      <span class="tools">
        <span v-if="chosen.length" class="column-menu">
          <button
            type="button"
            title="Spalten ein-/ausblenden"
            data-testid="cwm.Editor.Glossary.Columns"
            :class="{ active: columnMenu }"
            @click="columnMenu = !columnMenu"
          ><i class="pi pi-sliders-h"></i> Spalten<span v-if="shownColumns.length < table.columns.length" class="count"> ({{ shownColumns.length }}/{{ table.columns.length }})</span></button>
          <div v-if="columnMenu" class="menu-backdrop" @click="columnMenu = false"></div>
          <div v-if="columnMenu" class="menu" data-testid="cwm.Editor.Glossary.Columns.Menu">
            <div class="menu-actions">
              <button type="button" @click="showAllColumns(true)">alle</button>
              <button type="button" @click="showAllColumns(false)">keine</button>
            </div>
            <template v-for="g in columnGroups" :key="g.owner">
              <div class="menu-group">{{ g.owner }}</div>
              <label
                v-for="c in g.columns"
                :key="c.key"
                class="menu-item"
                :class="{ 'rule-hidden': c.ruleHidden }"
                :title="c.ruleHidden ? 'Durch eine Feldregel ausgeblendet' : undefined"
              >
                <input type="checkbox" :checked="isShown(c)" @change="toggleColumn(c)" />
                {{ c.name }}<span v-if="c.ruleHidden" class="hidden-mark">◌</span>
              </label>
            </template>
          </div>
        </span>
        <button
          type="button"
          :title="orientation === 'row' ? 'Untereinander anordnen' : 'Nebeneinander anordnen'"
          @click="emit('orientation', orientation === 'row' ? 'column' : 'row')"
        ><i :class="orientation === 'row' ? 'pi pi-arrows-v' : 'pi pi-arrows-h'"></i></button>
        <button type="button" title="Glossar ausblenden" @click="emit('close')"><i class="pi pi-times"></i></button>
      </span>
    </header>

    <div v-if="!chosen.length" class="empty">Classifier wählen, z. B. Table oder ModelElement.</div>
    <div v-else-if="!rows.length" class="empty">Keine Objekte dieser Classifier.</div>
    <div v-else class="scroll">
      <table data-testid="cwm.Editor.Glossary.Table">
        <thead>
          <tr>
            <th class="jump-col"></th>
            <th @click="sortBy('class')">Klasse{{ arrow('class') }}</th>
            <th v-for="col in shownColumns" :key="col.key" :title="`${col.owner}.${col.name}`" @click="sortBy(col.key)">
              {{ col.name }}{{ arrow(col.key) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in rows"
            :key="i"
            :class="{ current: row.object === selectedRaw }"
            :data-testid="`cwm.Editor.Glossary.Row@${i}`"
          >
            <td class="jump-col">
              <button
                type="button"
                class="jump"
                title="In der Ansicht zeigen"
                :data-testid="`cwm.Editor.Glossary.Row@${i}.Jump`"
                @click="emit('jump', row.object)"
              ><i class="pi pi-arrow-right"></i></button>
            </td>
            <td class="class">{{ row.className }}</td>
            <td
              v-for="col in shownColumns"
              :key="col.key"
              :class="{ absent: row.cells[col.key] === undefined }"
              :title="row.cells[col.key] ?? `${row.className} hat kein ${col.name}`"
            >{{ row.cells[col.key] ?? '' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <footer v-if="chosen.length">{{ rows.length }} Einträge</footer>
  </section>
</template>

<style scoped>
.glossary {
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  font-size: 0.8rem;
  color: var(--text-color);
}

header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.75rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--surface-border);
}

.classes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  flex: 1 1 12rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.05rem 0.2rem 0.05rem 0.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
}

.chip button,
.tools button,
.jump {
  font: inherit;
  border: none;
  background: none;
  color: var(--text-color-secondary);
  cursor: pointer;
  padding: 0 0.25rem;
}

.chip button:hover,
.tools button:hover,
.jump:hover {
  color: var(--primary-color);
}

.picker {
  position: relative;
  flex: 1 1 8rem;
}

.picker input {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  color: var(--text-color);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 0.1rem 0.3rem;
}

.picker input:hover,
.picker input:focus {
  border-color: var(--surface-border);
  background: var(--surface-ground);
}

.matches {
  position: absolute;
  z-index: 10;
  top: 100%;
  left: 0;
  min-width: 14rem;
  max-height: 16rem;
  overflow: auto;
  margin: 0.1rem 0 0;
  padding: 0.2rem 0;
  list-style: none;
  background: var(--surface-card, var(--surface-ground));
  border: 1px solid var(--surface-border);
  border-radius: 4px;
}

.matches li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.2rem 0.6rem;
  cursor: pointer;
}

.matches li:hover {
  background: var(--surface-hover);
}

.pkg {
  color: var(--text-color-secondary);
  font-size: 0.7rem;
}

.subclasses {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  white-space: nowrap;
}

.subclasses input {
  accent-color: var(--primary-color);
}

.tools {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
}

.column-menu {
  position: relative;
}

.column-menu > button.active {
  color: var(--primary-color);
}

.count {
  font-size: 0.7rem;
}

.menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9;
}

.menu {
  position: absolute;
  z-index: 10;
  top: 100%;
  right: 0;
  min-width: 13rem;
  max-height: 22rem;
  overflow: auto;
  margin-top: 0.2rem;
  padding: 0.3rem 0;
  background: var(--surface-card, var(--surface-ground));
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.menu-actions {
  display: flex;
  gap: 0.5rem;
  padding: 0 0.6rem 0.3rem;
  border-bottom: 1px solid var(--surface-border);
}

.menu-actions button {
  font: inherit;
  font-size: 0.75rem;
  border: none;
  background: none;
  padding: 0;
  color: var(--primary-color);
  cursor: pointer;
}

.menu-group {
  padding: 0.4rem 0.6rem 0.15rem;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-color-secondary);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0.6rem 0.15rem 0.9rem;
  cursor: pointer;
  white-space: nowrap;
}

.menu-item:hover {
  background: var(--surface-hover);
}

.menu-item.rule-hidden {
  color: var(--text-color-secondary);
  opacity: 0.7;
}

.hidden-mark {
  margin-left: auto;
  font-size: 0.7rem;
}

.menu-item input {
  accent-color: var(--primary-color);
}

.empty {
  padding: 1rem 0.75rem;
  color: var(--text-color-secondary);
}

.scroll {
  flex: 1 1 auto;
  overflow: auto;
  min-height: 0;
}

table {
  border-collapse: collapse;
  width: max-content;
  min-width: 100%;
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface-ground);
  text-align: left;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-color-secondary);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

th,
td {
  padding: 0.2rem 0.45rem;
  border-bottom: 1px solid var(--surface-border);
}

/* Cells shortened to a common width, so more columns fit; the title shows the full text */
td {
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jump-col {
  width: 1.5rem;
  padding: 0 0.1rem 0 0.4rem;
  cursor: default;
}

.class {
  color: var(--text-color-secondary);
}

td.absent {
  background: color-mix(in srgb, var(--text-color) 5%, transparent);
}

tr.current td {
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
}

footer {
  padding: 0.25rem 0.75rem;
  font-size: 0.7rem;
  color: var(--text-color-secondary);
  border-top: 1px solid var(--surface-border);
}
</style>
