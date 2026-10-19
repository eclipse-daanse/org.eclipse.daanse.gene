<script setup lang="ts">
/**
 * The glossary beside the context view: the objects of chosen classifiers
 * (optionally with their subclasses) as a table, one column per attribute,
 * sortable by every column. The arrow of a row jumps to its object in the
 * context view. A cell of an attribute the object does not have stays grey.
 *
 * Test ids: `cwm.Editor.Glossary`, `.Classes`, `.Subclasses`, `.Table`,
 * `.Columns` (menu of the columns shown), `.Filter` (a column's value
 * filter), `.Row@<n>`, `.Row@<n>.Jump`.
 *
 * The "Pfad" column shows the containers of an object; each one jumps there.
 * Cells work like a spreadsheet's: a click picks one (arrow keys move on),
 * Dragging, Shift+click or Shift+arrows pick a range, Ctrl+click adds single cells,
 * Ctrl+A the whole column; a double click or Enter/F2 edits it - text, number, yes/no or a choice of
 * literals, as in the context view's rows - Ctrl+C copies it and Ctrl+V
 * overwrites it. What cannot take the pasted value says so.
 *
 * A click on a column head opens its filter, as in a spreadsheet: sorting,
 * the values of the column to tick off, and a free text the cells must contain.
 */
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, toRaw } from 'tsm:vue'
import { compareCells, glossaryObjects, glossaryTable, type GlossaryRow } from '../composables/glossary'
import { classKey } from '../composables/references'
import { displayName } from '../composables/contextView'
import { checkAttributeText, fieldFor, setAttributeFromText, setField, type RowField } from '../composables/rowContent'

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
  /** A model change: the tab writes it and marks the document dirty */
  edit: [write: () => void]
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

function cellOf(row: GlossaryRow, key: string): string | undefined {
  return key === 'class' ? row.className : key === 'path' ? row.pathText : row.cells[key]
}

/* ── value filters per column ────────────────────────────────────── */

interface ColumnFilter {
  /** Values ticked off; '' stands for empty cells */
  excluded: Set<string>
  /** Text the cell must contain, ignoring case */
  text: string
}

const filters = ref(new Map<string, ColumnFilter>())

function valueOf(row: GlossaryRow, key: string): string {
  return cellOf(row, key) ?? ''
}

/** A free text decides on its own, whatever is ticked; without one the ticks do */
function passes(row: GlossaryRow, key: string, f: ColumnFilter): boolean {
  const v = valueOf(row, key)
  const t = f.text.trim().toLowerCase()
  return t ? v.toLowerCase().includes(t) : !f.excluded.has(v)
}

/** Keys of the columns on screen; filters of switched-off columns do not count */
const shownKeys = computed(() => new Set(['class', ...(showPath.value ? ['path'] : []), ...shownColumns.value.map(c => c.key)]))

/** Rows passing every filter - except the one of `skip`, for its list of values */
function filteredRows(skip?: string): GlossaryRow[] {
  const active = [...filters.value.entries()].filter(([k]) => k !== skip && shownKeys.value.has(k))
  if (!active.length) return table.value.rows
  return table.value.rows.filter(r => active.every(([k, f]) => passes(r, k, f)))
}

function isFiltered(key: string): boolean {
  const f = filters.value.get(key)
  return !!f && (f.excluded.size > 0 || f.text.trim() !== '')
}

function updateFilter(key: string, change: (f: ColumnFilter) => void): void {
  const next = new Map(filters.value)
  const f = next.get(key) ?? { excluded: new Set<string>(), text: '' }
  const copy = { excluded: new Set(f.excluded), text: f.text }
  change(copy)
  if (copy.excluded.size || copy.text.trim()) next.set(key, copy)
  else next.delete(key)
  filters.value = next
}

/* The open filter dropdown: fixed to the screen, so the table's scrolling does not cut it */
const openFilter = ref<{ key: string; label: string; top: number; left: number } | null>(null)

function openFilterFor(key: string, label: string, event: MouseEvent): void {
  const th = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const width = 240
  openFilter.value = {
    key,
    label,
    top: th.bottom + 2,
    left: Math.max(4, Math.min(th.left, window.innerWidth - width - 4))
  }
}

/** The distinct values of the open column, among the rows the other filters leave */
const filterValues = computed(() => {
  const o = openFilter.value
  if (!o) return []
  const counts = new Map<string, number>()
  for (const r of filteredRows(o.key)) {
    const v = valueOf(r, o.key)
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => compareCells(a, b))
    .map(([value, count]) => ({ value, count }))
})

const openState = computed(() => (openFilter.value ? filters.value.get(openFilter.value.key) : undefined))

function toggleValue(value: string): void {
  const key = openFilter.value?.key
  if (!key) return
  updateFilter(key, f => { if (f.excluded.has(value)) f.excluded.delete(value); else f.excluded.add(value) })
}

function tickAll(on: boolean): void {
  const key = openFilter.value?.key
  if (!key) return
  updateFilter(key, f => { f.excluded = on ? new Set() : new Set(filterValues.value.map(v => v.value)) })
}

function setFilterText(text: string): void {
  const key = openFilter.value?.key
  if (key) updateFilter(key, f => { f.text = text })
}

function clearFilter(): void {
  const key = openFilter.value?.key
  if (!key) return
  const next = new Map(filters.value)
  next.delete(key)
  filters.value = next
}

function sortOpen(asc: boolean): void {
  const key = openFilter.value?.key
  if (!key) return
  sortKey.value = key
  ascending.value = asc
}

const rows = computed(() => {
  const base = filteredRows()
  const key = sortKey.value
  if (!key) return base
  const sign = ascending.value ? 1 : -1
  return [...base].sort((a, b) => {
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

/** The path column: on unless switched off in the menu */
const showPath = computed(() => !hiddenColumns.value.has('path'))

/* ── editing ─────────────────────────────────────────────────────── */

/** A cell: its object and column key ('class', 'path' or an attribute's) */
interface Cell { object: any; key: string }

/** The cell with the keyboard focus */
const active = shallowRef<Cell | null>(null)
/** Where a Shift range starts */
const anchor = shallowRef<Cell | null>(null)
/** All cells picked: a range (Shift) and single cells added (Ctrl) */
const selection = shallowRef<Cell[]>([])
/** The cell being edited */
const editing = shallowRef<Cell | null>(null)
const scrollEl = ref<HTMLElement | null>(null)

/** Column keys in screen order */
const columnKeys = computed(() => ['class', ...(showPath.value ? ['path'] : []), ...shownColumns.value.map(c => c.key)])

const objectIds = new WeakMap<object, number>()
let nextObjectId = 1
function cellId(object: any, key: string): string {
  let id = objectIds.get(object)
  if (!id) objectIds.set(object, (id = nextObjectId++))
  return `${id}|${key}`
}

const selectedIds = computed(() => new Set(selection.value.map(c => cellId(c.object, c.key))))

function isSelected(row: GlossaryRow, key: string): boolean {
  return selectedIds.value.has(cellId(row.object, key))
}

/**
 * The frame around the picked cells, as in a spreadsheet: each picked cell
 * draws the sides that have no picked neighbour, so a range gets one frame.
 */
function frameOf(i: number, key: string): Record<string, boolean> {
  const row = rows.value[i]
  if (!row || !isSelected(row, key)) return {}
  const keys = columnKeys.value
  const c = keys.indexOf(key)
  const at = (r: number, k: string | undefined) => !!k && !!rows.value[r] && isSelected(rows.value[r]!, k)
  return {
    selected: true,
    'frame-top': !at(i - 1, key),
    'frame-bottom': !at(i + 1, key),
    'frame-left': !at(i, keys[c - 1]),
    'frame-right': !at(i, keys[c + 1])
  }
}

function isActive(row: GlossaryRow, key: string): boolean {
  return active.value?.object === row.object && active.value.key === key
}

function isEditing(row: GlossaryRow, key: string): boolean {
  return editing.value?.object === row.object && editing.value.key === key
}

/** The cells between two, in the order on screen */
function range(from: Cell, to: Cell): Cell[] {
  const list = rows.value
  const keys = columnKeys.value
  const r1 = list.findIndex(r => r.object === from.object)
  const r2 = list.findIndex(r => r.object === to.object)
  const c1 = keys.indexOf(from.key)
  const c2 = keys.indexOf(to.key)
  if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return [to]
  const out: Cell[] = []
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) out.push({ object: list[r]!.object, key: keys[c]! })
  }
  return out
}

/** Click: one cell; Shift+click: the range from the last one; Ctrl+click: add or drop a cell */
function pick(row: GlossaryRow, key: string, event?: MouseEvent): void {
  const cell = { object: row.object, key }
  if (event?.shiftKey && anchor.value) {
    selection.value = range(anchor.value, cell)
  } else if (event && (event.ctrlKey || event.metaKey)) {
    const id = cellId(row.object, key)
    selection.value = selectedIds.value.has(id)
      ? selection.value.filter(c => cellId(c.object, c.key) !== id)
      : [...selection.value, cell]
    anchor.value = cell
  } else {
    selection.value = [cell]
    anchor.value = cell
  }
  active.value = cell
  scrollEl.value?.focus({ preventScroll: true })
}

/* Dragging with the mouse pressed picks the range it passes over */
let dragging = false

function endDrag(): void {
  dragging = false
  window.removeEventListener('mouseup', endDrag)
}

function startPick(row: GlossaryRow, key: string, event: MouseEvent): void {
  if (event.button !== 0 || isEditing(row, key)) return
  // No text selection while picking; the table keeps the focus for the keys
  event.preventDefault()
  pick(row, key, event)
  dragging = true
  window.addEventListener('mouseup', endDrag)
}

function dragTo(row: GlossaryRow, key: string): void {
  if (!dragging || !anchor.value) return
  const cell = { object: row.object, key }
  selection.value = range(anchor.value, cell)
  active.value = cell
}

onBeforeUnmount(endDrag)

const columnOf = (key: string) => table.value.columns.find(c => c.key === key) ?? null

const rowOf = (object: any) => rows.value.find(r => r.object === object) ?? null

/** Why a cell cannot be written, or null */
function readOnlyReason(row: GlossaryRow, key: string): string | null {
  if (key === 'class') return 'Die Klasse ist nicht überschreibbar'
  if (key === 'path') return 'Der Pfad ist nicht überschreibbar'
  const col = columnOf(key)
  if (!col) return 'Unbekannte Spalte'
  if (row.cells[key] === undefined) return `${row.className} hat kein ${col.name}`
  if (col.feature.isChangeable?.() === false) return `${col.name} ist nicht änderbar`
  return null
}

function startEdit(row: GlossaryRow, key: string): void {
  pick(row, key)
  const reason = readOnlyReason(row, key)
  if (reason) {
    warn(reason)
    return
  }
  editing.value = { object: row.object, key }
}

/**
 * Enter ends the input: leaving the field writes it (its change event) and
 * closes it. Stopped here, so the table does not take the same Enter as
 * "edit again".
 */
function finishEdit(event: KeyboardEvent): void {
  const el = event.target as HTMLElement
  if (el.blur) el.blur()
  else stopEdit()
}

/** Leaves the field; the table takes the keys again */
function stopEdit(): void {
  editing.value = null
  void nextTick(() => scrollEl.value?.focus({ preventScroll: true }))
}

function fieldOf(row: GlossaryRow, col: { feature: any }): RowField {
  return fieldFor(row.object, col.feature)
}

/** Focuses a field when it appears */
const vFocus = { mounted: (el: HTMLElement) => el.focus() }

/* ── warnings ────────────────────────────────────────────────────── */

const warning = ref<string | null>(null)
let warningTimer = 0

function warn(message: string): void {
  warning.value = message
  clearTimeout(warningTimer)
  warningTimer = window.setTimeout(() => { warning.value = null }, 6000)
}

onBeforeUnmount(() => clearTimeout(warningTimer))

/* ── keys, copy and paste ────────────────────────────────────────── */

/** Arrow keys move the focus; with Shift they stretch the range from the anchor */
function move(dRow: number, dCol: number, extend: boolean): void {
  const a = active.value
  const list = rows.value
  if (!list.length) return
  const keys = columnKeys.value
  const r = a ? list.findIndex(x => x.object === a.object) : -1
  const c = a ? keys.indexOf(a.key) : -1
  const nr = Math.min(list.length - 1, Math.max(0, (r < 0 ? 0 : r) + dRow))
  const nc = Math.min(keys.length - 1, Math.max(0, (c < 0 ? 0 : c) + dCol))
  const cell = { object: list[nr]!.object, key: keys[nc]! }
  active.value = cell
  if (extend && anchor.value) selection.value = range(anchor.value, cell)
  else {
    selection.value = [cell]
    anchor.value = cell
  }
  void nextTick(() => scrollEl.value?.querySelector('td.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
}

function onKeydown(event: KeyboardEvent): void {
  if (editing.value) return
  const steps: Record<string, [number, number]> = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]
  }
  const step = steps[event.key]
  if (step) {
    event.preventDefault()
    move(step[0], step[1], event.shiftKey)
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    // The whole column of the focused cell
    const key = active.value?.key
    if (!key) return
    event.preventDefault()
    selection.value = rows.value.map(r => ({ object: r.object, key }))
    return
  }
  const row = active.value ? rowOf(active.value.object) : null
  if (row && (event.key === 'Enter' || event.key === 'F2')) {
    event.preventDefault()
    startEdit(row, active.value!.key)
  } else if (event.key === 'Escape') {
    active.value = null
    selection.value = []
  }
}

/** The picked cells as a block on screen: rows and columns that hold one */
function selectionBlock(): { rowList: GlossaryRow[]; keys: string[] } {
  const ids = selectedIds.value
  const keys = columnKeys.value.filter(k => selection.value.some(c => c.key === k))
  const rowList = rows.value.filter(r => keys.some(k => ids.has(cellId(r.object, k))))
  return { rowList, keys }
}

/** Ctrl+C: the picked cells, tab between columns and a line per row - as spreadsheets take them */
function onCopy(event: ClipboardEvent): void {
  if (editing.value || !selection.value.length) return
  event.preventDefault()
  const ids = selectedIds.value
  const { rowList, keys } = selectionBlock()
  const text = rowList
    .map(r => keys.map(k => (ids.has(cellId(r.object, k)) ? valueOf(r, k).replace(/[\t\r\n]+/g, ' ') : '')).join('\t'))
    .join('\n')
  event.clipboardData?.setData('text/plain', text)
}

/**
 * Ctrl+V: one copied value goes into every picked cell; a copied block is
 * laid down from the picked block's top left cell. Cells that cannot take
 * their value are skipped and named in a warning.
 */
function onPaste(event: ClipboardEvent): void {
  if (editing.value || !selection.value.length) return
  event.preventDefault()
  const raw = (event.clipboardData?.getData('text/plain') ?? '').replace(/\r?\n$/, '')
  const grid = raw.split(/\r?\n/).map(line => line.split('\t'))

  const targets: { row: GlossaryRow; key: string; text: string }[] = []
  if (grid.length === 1 && grid[0]!.length === 1) {
    for (const c of selection.value) {
      const row = rowOf(c.object)
      if (row) targets.push({ row, key: c.key, text: grid[0]![0]! })
    }
  } else {
    const { rowList, keys } = selectionBlock()
    const list = rows.value
    const allKeys = columnKeys.value
    const r0 = list.indexOf(rowList[0]!)
    const c0 = allKeys.indexOf(keys[0]!)
    grid.forEach((line, dr) => line.forEach((text, dc) => {
      const row = list[r0 + dr]
      const key = allKeys[c0 + dc]
      if (row && key) targets.push({ row, key, text })
    }))
  }

  const writes: (() => void)[] = []
  const problems: string[] = []
  for (const t of targets) {
    const reason = readOnlyReason(t.row, t.key)
    if (reason) {
      problems.push(reason)
      continue
    }
    const feature = columnOf(t.key)!.feature
    const checked = checkAttributeText(feature, t.text)
    if ('error' in checked) problems.push(checked.error)
    else writes.push(() => setAttributeFromText(t.row.object, feature, checked.text))
  }
  if (writes.length) emit('edit', () => writes.forEach(w => w()))
  if (problems.length) {
    const distinct = [...new Set(problems)]
    const lead = writes.length
      ? `${problems.length} von ${targets.length} Zellen nicht eingefügt`
      : 'Einfügen nicht möglich'
    warn(`${lead}: ${distinct.slice(0, 3).join('; ')}${distinct.length > 3 ? ' …' : ''}`)
  }
}

/** Suggested values a column's field rules offer, over the objects shown */
function suggestionsOf(col: { key: string; feature: any }): string[] {
  const out = new Set<string>()
  for (const r of rows.value) {
    if (r.cells[col.key] === undefined) continue
    for (const v of fieldFor(r.object, col.feature).suggestions) out.add(v)
  }
  return [...out]
}

function writeCell(row: GlossaryRow, field: RowField, event: Event): void {
  const el = event.target as HTMLInputElement | HTMLSelectElement
  const value = el.type === 'checkbox' ? (el as HTMLInputElement).checked : el.value
  if (field.kind === 'number' && value !== '' && Number.isNaN(Number(value))) {
    warn(`„${value}“ ist keine Zahl`)
    return
  }
  emit('edit', () => setField(row.object, field, value))
  if (el.type !== 'text' && el.type !== 'number') stopEdit()
}

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
  hiddenColumns.value = show ? new Set() : new Set(['path', ...table.value.columns.map(c => c.key)])
  shownAnyway.value = new Set()
}

/* ── CSV export ──────────────────────────────────────────────────── */

function csvField(text: string): string {
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * The table as shown - filtered, sorted, the columns switched on - as CSV:
 * semicolons and a byte order mark, so spreadsheets open it with umlauts.
 */
function exportCsv(): void {
  const keys = columnKeys.value
  const heads = keys.map(k => (k === 'class' ? 'Klasse' : k === 'path' ? 'Pfad' : columnOf(k)?.name ?? k))
  const lines = [heads, ...rows.value.map(r => keys.map(k => valueOf(r, k)))]
    .map(line => line.map(csvField).join(';'))
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `overview-${chosen.value.map(c => c.getName()).join('-') || 'export'}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function arrow(key: string): string {
  return sortKey.value === key ? (ascending.value ? ' ▲' : ' ▼') : ''
}

const selectedRaw = computed(() => toRaw(props.selected))
</script>

<template>
  <section class="glossary" data-testid="cwm.Editor.Glossary" data-wire-kind="REGION">
    <header>
      <strong>Overview</strong>
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
            <label class="menu-item">
              <input type="checkbox" :checked="showPath" @change="toggleColumn({ key: 'path', ruleHidden: false })" />
              Pfad
            </label>
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
          v-if="chosen.length"
          type="button"
          class="csv"
          title="Tabelle wie angezeigt als CSV exportieren"
          data-testid="cwm.Editor.Glossary.ExportCsv"
          :disabled="!rows.length"
          @click="exportCsv"
        ><i class="pi pi-download"></i> CSV</button>
        <button
          type="button"
          :title="orientation === 'row' ? 'Untereinander anordnen' : 'Nebeneinander anordnen'"
          @click="emit('orientation', orientation === 'row' ? 'column' : 'row')"
        ><i :class="orientation === 'row' ? 'pi pi-arrows-v' : 'pi pi-arrows-h'"></i></button>
        <button type="button" title="Overview ausblenden" @click="emit('close')"><i class="pi pi-times"></i></button>
      </span>
    </header>

    <div v-if="!chosen.length" class="empty">Classifier wählen, z. B. Table oder ModelElement.</div>
    <div v-else-if="!table.rows.length" class="empty">Keine Objekte dieser Classifier.</div>
    <div
      v-else
      ref="scrollEl"
      class="scroll"
      tabindex="0"
      title="Doppelklick oder Enter bearbeitet; Umschalt/Strg+Klick wählt mehrere; Strg+C kopiert, Strg+V überschreibt"
      @keydown="onKeydown"
      @copy="onCopy"
      @paste="onPaste"
    >
      <table :class="{ multi: selection.length > 1 }" data-testid="cwm.Editor.Glossary.Table">
        <thead>
          <tr>
            <th class="jump-col"></th>
            <th :class="{ filtered: isFiltered('class') }" @click="openFilterFor('class', 'Klasse', $event)">
              Klasse{{ arrow('class') }}<i class="pi pi-filter head-filter"></i>
            </th>
            <th v-if="showPath" :class="{ filtered: isFiltered('path') }" @click="openFilterFor('path', 'Pfad', $event)">
              Pfad{{ arrow('path') }}<i class="pi pi-filter head-filter"></i>
            </th>
            <th
              v-for="col in shownColumns"
              :key="col.key"
              :class="{ filtered: isFiltered(col.key) }"
              :title="`${col.owner}.${col.name}`"
              @click="openFilterFor(col.key, col.name, $event)"
            >
              {{ col.name }}{{ arrow(col.key) }}<i class="pi pi-filter head-filter"></i>
            </th>
          </tr>
        </thead>
        <tbody>
          <!-- Filtered to nothing: the heads stay, so the filters can be changed -->
          <tr v-if="!rows.length" class="no-rows">
            <td :colspan="shownColumns.length + (showPath ? 3 : 2)">Kein Eintrag passt zu den Filtern.</td>
          </tr>
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
            <td
              class="class"
              :class="[{ active: isActive(row, 'class') }, frameOf(i, 'class')]"
              @mousedown="startPick(row, 'class', $event)"
                @mouseenter="dragTo(row, 'class')"
              @dblclick="startEdit(row, 'class')"
            >{{ row.className }}</td>
            <td
              v-if="showPath"
              class="path"
              :class="[{ active: isActive(row, 'path') }, frameOf(i, 'path')]"
              :title="row.pathText"
              @mousedown="startPick(row, 'path', $event)"
                @mouseenter="dragTo(row, 'path')"
              @dblclick="startEdit(row, 'path')"
            >
              <template v-for="(p, j) in row.path" :key="j">
                <span v-if="j > 0" class="sep">›</span>
                <a class="crumb" @click.stop="emit('jump', p)" @dblclick.stop>{{ displayName(p) }}</a>
              </template>
            </td>
            <template v-for="col in shownColumns" :key="col.key">
              <!-- One field per cell; the one-element loop names it -->
              <td
                v-for="f in (isEditing(row, col.key) ? [fieldOf(row, col)] : [])"
                :key="`edit-${col.key}`"
                class="editing active"
                @keydown.escape.stop="stopEdit"
                @keydown.enter.stop.prevent="finishEdit"
              >
                <input
                  v-if="f.kind === 'boolean'"
                  v-focus
                  type="checkbox"
                  :checked="f.isSet ? !!f.value : f.uiDefault === 'true'"
                  :aria-label="col.name"
                  @change="writeCell(row, f, $event)"
                  @blur="stopEdit"
                />
                <select
                  v-else-if="f.kind === 'enum'"
                  v-focus
                  :value="f.value ?? ''"
                  :aria-label="col.name"
                  @change="writeCell(row, f, $event)"
                  @blur="stopEdit"
                >
                  <option v-if="!f.isSet" value="" disabled>{{ f.uiDefault ?? '–' }}</option>
                  <option v-for="o in f.options" :key="o" :value="o">{{ o }}</option>
                </select>
                <input
                  v-else
                  v-focus
                  :type="f.kind === 'number' ? 'number' : 'text'"
                  :value="f.value ?? ''"
                  :placeholder="f.uiDefault ?? undefined"
                  :aria-label="col.name"
                  :list="f.suggestions.length ? `glossary.${col.key}.suggestions` : undefined"
                  @change="writeCell(row, f, $event)"
                  @blur="stopEdit"
                />
              </td>
              <td
                v-if="!isEditing(row, col.key)"
                :class="[{ absent: row.cells[col.key] === undefined, active: isActive(row, col.key) }, frameOf(i, col.key)]"
                :title="row.cells[col.key] ?? `${row.className} hat kein ${col.name}`"
                @mousedown="startPick(row, col.key, $event)"
                @mouseenter="dragTo(row, col.key)"
                @dblclick="startEdit(row, col.key)"
              >{{ row.cells[col.key] ?? '' }}</td>
            </template>
          </tr>
        </tbody>
      </table>
      <!-- Suggested values of the field rules, one list per column -->
      <template v-if="editing">
        <datalist v-for="col in shownColumns" :id="`glossary.${col.key}.suggestions`" :key="col.key">
          <option v-for="v in suggestionsOf(col)" :key="v" :value="v"></option>
        </datalist>
      </template>
    </div>
    <div v-if="warning" class="warning" role="alert" data-testid="cwm.Editor.Glossary.Warning">
      <i class="pi pi-exclamation-triangle"></i>
      <span>{{ warning }}</span>
      <button type="button" title="Schließen" @click="warning = null">×</button>
    </div>
    <footer v-if="chosen.length">
      {{ rows.length === table.rows.length ? `${rows.length} Einträge` : `${rows.length} von ${table.rows.length} Einträgen` }}
      <button v-if="filters.size" type="button" class="clear-all" @click="filters = new Map()">Filter aufheben</button>
    </footer>

    <template v-if="openFilter">
      <div class="menu-backdrop" @click="openFilter = null"></div>
      <div
        class="filter"
        :style="{ top: `${openFilter.top}px`, left: `${openFilter.left}px` }"
        data-testid="cwm.Editor.Glossary.Filter"
        @keydown.escape="openFilter = null"
      >
        <div class="filter-sort">
          <button type="button" :class="{ active: sortKey === openFilter.key && ascending }" @click="sortOpen(true)">▲ aufsteigend</button>
          <button type="button" :class="{ active: sortKey === openFilter.key && !ascending }" @click="sortOpen(false)">▼ absteigend</button>
        </div>
        <div class="menu-actions">
          <button type="button" @click="tickAll(true)">alle</button>
          <button type="button" @click="tickAll(false)">keine</button>
          <button v-if="isFiltered(openFilter.key)" type="button" class="reset" @click="clearFilter()">Filter aufheben</button>
        </div>
        <div class="filter-values" :class="{ overridden: !!openState?.text.trim() }" :title="openState?.text.trim() ? 'Der Freitext filtert unabhängig von den Haken' : undefined">
          <label v-for="v in filterValues" :key="v.value" class="menu-item">
            <input type="checkbox" :checked="!openState?.excluded.has(v.value)" @change="toggleValue(v.value)" />
            <span class="value" :class="{ empty: v.value === '' }">{{ v.value === '' ? '(leer)' : v.value }}</span>
            <span class="n">{{ v.count }}</span>
          </label>
        </div>
        <input
          class="filter-text"
          :value="openState?.text ?? ''"
          :placeholder="`${openFilter.label} enthält …`"
          :aria-label="`${openFilter.label} filtern`"
          @input="setFilterText(($event.target as HTMLInputElement).value)"
        />
      </div>
    </template>
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

.csv {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.csv:disabled {
  opacity: 0.45;
  cursor: default;
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

.head-filter {
  margin-left: 0.3rem;
  font-size: 0.6rem;
  opacity: 0;
}

th:hover .head-filter,
th.filtered .head-filter {
  opacity: 1;
}

th.filtered {
  color: var(--primary-color);
}

.filter {
  position: fixed;
  z-index: 1001;
  width: 240px;
  display: flex;
  flex-direction: column;
  padding: 0.3rem 0;
  font-size: 0.8rem;
  text-transform: none;
  background: var(--surface-card, var(--surface-ground));
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.filter-sort {
  display: flex;
  flex-direction: column;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--surface-border);
}

.filter-sort button {
  font: inherit;
  text-align: left;
  padding: 0.2rem 0.6rem;
  border: none;
  background: none;
  color: var(--text-color);
  cursor: pointer;
}

.filter-sort button:hover {
  background: var(--surface-hover);
}

.filter-sort button.active {
  color: var(--primary-color);
}

.filter .menu-actions {
  padding: 0.3rem 0.6rem;
}

.menu-actions .reset {
  margin-left: auto;
}

.filter-values {
  max-height: 14rem;
  overflow: auto;
  padding: 0.2rem 0;
}

.filter .menu-item .value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.filter-values.overridden {
  opacity: 0.45;
}

tr.no-rows td {
  max-width: none;
  padding: 0.75rem 0.6rem;
  font-style: italic;
  color: var(--text-color-secondary);
}

.value.empty {
  font-style: italic;
  color: var(--text-color-secondary);
}

.n {
  font-size: 0.7rem;
  color: var(--text-color-secondary);
}

.filter-text {
  margin: 0.3rem 0.6rem 0.1rem;
  font: inherit;
  color: var(--text-color);
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 3px;
  padding: 0.2rem 0.4rem;
}

.filter-text:focus {
  outline: none;
  border-color: var(--primary-color);
}

.clear-all {
  margin-left: 0.5rem;
  font: inherit;
  border: none;
  background: none;
  padding: 0;
  color: var(--primary-color);
  cursor: pointer;
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

.path {
  max-width: 16rem;
  color: var(--text-color-secondary);
}

.path .sep {
  margin: 0 0.2rem;
  opacity: 0.6;
}

.crumb {
  cursor: pointer;
}

.crumb:hover {
  color: var(--primary-color);
  text-decoration: underline;
}

.scroll:focus {
  outline: none;
}

tbody td {
  position: relative;
}

tbody td.selected {
  background: color-mix(in srgb, var(--primary-color) 6%, transparent);
}

/* Several cells picked: a dashed frame around them - only the outer sides of the range */
table.multi tbody td.selected::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border: 0 dashed var(--primary-color);
}

table.multi tbody td.selected.frame-top::after { border-top-width: 2px; }
table.multi tbody td.selected.frame-bottom::after { border-bottom-width: 2px; }
table.multi tbody td.selected.frame-left::after { border-left-width: 2px; }
table.multi tbody td.selected.frame-right::after { border-right-width: 2px; }

/* The focused cell: a solid frame, alone or inside a range */
td.active {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}

tbody td {
  cursor: cell;
}

.warning {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  color: var(--text-color);
  background: color-mix(in srgb, #f59e0b 18%, transparent);
  border-top: 1px solid color-mix(in srgb, #f59e0b 50%, transparent);
}

.warning i {
  color: #f59e0b;
}

.warning button {
  margin-left: auto;
  font: inherit;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text-color-secondary);
}

td.editing {
  padding: 0.05rem 0.2rem;
}

td.editing input:not([type='checkbox']),
td.editing select {
  width: 100%;
  min-width: 5rem;
  box-sizing: border-box;
  font: inherit;
  color: var(--text-color);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 0.1rem 0.25rem;
}

td.editing input:not([type='checkbox']):hover,
td.editing input:not([type='checkbox']):focus,
td.editing select:hover,
td.editing select:focus {
  border-color: var(--surface-border);
  background: var(--surface-ground);
  outline: none;
}

td.editing input[type='checkbox'] {
  accent-color: var(--primary-color);
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
