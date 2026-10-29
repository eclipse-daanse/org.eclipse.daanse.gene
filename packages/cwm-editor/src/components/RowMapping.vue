<script setup lang="ts">
/**
 * The O/R mapping set (orm EntityMappings, e.g. "library") as a board in
 * three columns: the classes of its object package, the managed types
 * (Entity, MappedSuperclass, Embeddable) with all their attribute mappings,
 * and the tables and views of its schema. Lines lead from a class to its
 * entity and from the entity's table rows to the tables;
 * from an attribute or association end to its mapping and from the mapping to
 * its columns - coloured by the kind of mapping (Id, Basic, Version, n:1 ...).
 *
 * Editing - every drag works both ways:
 * - class onto table or view: its entity (made if missing) is stored there,
 *   a second one becomes a secondary table; class onto entity: the entity maps it;
 *   entity onto table or view: stored there.
 * - attribute onto column: the entity (made if missing) maps it there - an Id
 *   for a primary key column, n:1 / 1:n with a join column for an association end;
 *   attribute onto mapping: the mapping maps that attribute; mapping onto
 *   column: the mapping holds the column. A column belongs to one mapping.
 * - In a mapping row: its kind (Id, Basic, Version, Transient or n:1, 1:1,
 *   1:n, n:m), open it in the context view, remove it.
 * - A click on a line picks it; Entf (or ×) removes that link only.
 * - "+ Tabelle", "+ Klasse", "+ Spalte", "+ Attribut" make the other side,
 *   named and typed after it, and connect it.
 * - "Automatisch zuordnen" links classes and tables, attributes and columns of the same name.
 *
 * Test ids: `<testId>`, `.Auto`, `.Class@<name>`, `.Class@<name>.AddTable`,
 * `.Class@<name>.Member@<name>`, `.Class@<name>.Member@<name>.AddColumn`,
 * `.Type@<name>`, `.Type@<name>.Table@<name>`, `.Type@<name>.Mapping@<name>`,
 * `.Type@<name>.Mapping@<name>.Kind`, `.Type@<name>.Mapping@<name>.Remove`,
 * `.Set@<name>`, `.Set@<name>.AddClass`, `.Set@<name>.Column@<name>`,
 * `.Set@<name>.Column@<name>.AddAttribute`, `.Line@<key>`, `.Popover`.
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'tsm:vue'
import { attr, slug } from '../composables/documentation'
import { CWM_EDITING } from '../composables/editing'
import {
  bindMember,
  boardMatches,
  boardModel,
  changeKind,
  connect,
  connectMapping,
  connectOnBoard,
  createAttributeFor,
  createClassFor,
  createColumnFor,
  createTableFor,
  disconnect,
  KIND_COLORS,
  KIND_LABELS,
  kindChoices,
  linkClass,
  linkType,
  removeMapping,
  removeType,
  setTypeClass,
  unlinkClass,
  type ClassCard,
  type ClassMember,
  type ColumnEntry,
  type ColumnSetEntry,
  type MappedColumn,
  type MappingEntry,
  type MappingKind,
  type TypeCard,
  type TypeLink
} from '../composables/ormMapping'

const props = defineProps<{
  object: any
  testId: string
  version?: number
}>()

const editing = inject(CWM_EDITING)!

const board = computed(() => {
  void props.version
  return boardModel(props.object, editing.objects.value)
})

function change(write: () => void): void {
  editing.change(write)
  editing.validate(props.object)
}

function nameOf(o: any): string {
  return String(attr(o, 'name') ?? '?')
}

/* ── lookups ─────────────────────────────────────────────────────── */

/** member feature -> its mapping (and the type holding it) */
const entryByMember = computed(() => {
  const map = new Map<any, { entry: MappingEntry; tcard: TypeCard }>()
  for (const tcard of board.value.types) for (const e of tcard.model.mappings) if (e.feature) map.set(e.feature, { entry: e, tcard })
  return map
})

/** column -> the mapping holding it */
const entryByColumn = computed(() => {
  const map = new Map<any, MappingEntry>()
  for (const tcard of board.value.types) for (const e of tcard.model.mappings) for (const c of e.columns) map.set(c.column, e)
  return map
})

const linksBySet = computed(() => {
  const map = new Map<any, TypeLink[]>()
  for (const l of board.value.links) map.set(l.set, [...(map.get(l.set) ?? []), l])
  return map
})

const linksByType = computed(() => {
  const map = new Map<any, TypeLink[]>()
  for (const l of board.value.links) map.set(l.tcard.type, [...(map.get(l.tcard.type) ?? []), l])
  return map
})

const shownColumns = computed(() => new Set(board.value.sets.flatMap(s => s.columns.map(c => c.column))))

/** Columns of a mapping outside every column set shown here (e.g. the target's FK of a 1:n) */
function elsewhere(entry: MappingEntry): string[] {
  return entry.columns.filter(c => !shownColumns.value.has(c.column)).map(c => `${nameOf(c.column.eContainer?.())}.${nameOf(c.column)}`)
}

function colorOf(kind: MappingKind | undefined): string {
  return kind ? KIND_COLORS[kind] : 'var(--text-color-secondary)'
}

const presentKinds = computed(() => [...new Set(board.value.types.flatMap(t => t.model.mappings.map(e => e.kind)))])

const matches = computed(() => boardMatches(board.value))
const matchCount = computed(() => matches.value.classes.length + matches.value.members.length)
const matchTitle = computed(() => [
  ...matches.value.classes.map(m => `${m.card.name} → ${m.set.name}`),
  ...matches.value.members.map(m => `${m.card.name}.${m.member.name} → ${m.column.name}`)
].join('\n'))

const hasSchema = computed(() => !!attr(props.object, 'cwmSchema'))
const hasPackage = computed(() => !!attr(props.object, 'cwmObjectPackage'))

interface MappingGroup {
  /** The table the mappings' columns lie in; null for those in none of its tables */
  link: TypeLink | null
  mappings: MappingEntry[]
}

/** A type's tables, each with the mappings whose (first) column lies there - then the mappings in none of them */
function groupsOf(tcard: TypeCard): MappingGroup[] {
  const links = linksByType.value.get(tcard.type) ?? []
  const groups: MappingGroup[] = links.map(link => ({ link, mappings: [] }))
  const rest: MappingGroup = { link: null, mappings: [] }
  for (const e of tcard.model.mappings) {
    const home = e.columns.map(c => c.column.eContainer?.()).find(set => links.some(l => l.set === set))
    ;(groups.find(g => g.link!.set === home) ?? rest).mappings.push(e)
  }
  return rest.mappings.length ? [...groups, rest] : groups
}

/** The member a mapping maps, on the board */
function memberOfEntry(tcard: TypeCard, entry: MappingEntry): ClassMember | null {
  return tcard.card?.members.find(m => m.feature === entry.feature) ?? null
}

/* ── the rows and heads the lines and drags attach to ────────────── */

type Part = 'class' | 'member' | 'type' | 'link' | 'mapping' | 'set' | 'column'

interface Target {
  part: Part
  /** ClassCard, ClassMember, TypeCard, TypeLink, MappingEntry, ColumnSetEntry, ColumnEntry */
  item: any
  /** For a member: its class card; for a mapping: its type card */
  owner?: any
}

/** part -> model object -> element */
const els: Record<Part, Map<any, Element>> = {
  class: new Map(), member: new Map(), type: new Map(), link: new Map(), mapping: new Map(), set: new Map(), column: new Map()
}
const targets = new Map<Element, Target>()

/** The model object a part is known by */
function keyOf(t: Target): any {
  switch (t.part) {
    case 'class': return t.item.cls
    case 'member': return t.item.feature
    case 'type': return t.item.type
    case 'link': return t.item.holder ?? t.item.tcard.type
    case 'mapping': return t.item.mapping
    case 'set': return t.item.set
    case 'column': return t.item.column
  }
}

function reg(part: Part, item: any, owner?: any) {
  const target: Target = { part, item, owner }
  const key = keyOf(target)
  let mine: Element | null = null
  return (el: any) => {
    if (el) {
      mine = el
      els[part].set(key, el)
      targets.set(el, target)
    } else if (mine) {
      targets.delete(mine)
      // A newer element of the same object may have taken the place already
      if (els[part].get(key) === mine) els[part].delete(key)
      mine = null
    }
  }
}

/* ── geometry of the lines ───────────────────────────────────────── */

const boardEl = ref<HTMLElement | null>(null)

interface Line {
  key: string
  d: string
  mid: { x: number; y: number }
  color: string
  /** Thick: class - type - table */
  heavy: boolean
  /** Objects whose hover lights the line */
  touches: any[]
  /** The mapping it belongs to, if any - picking a mapping lights all its lines */
  mapping: any | null
  /** What removing the line does, and how the popover names it */
  remove: (() => void) | null
  label: string
  /** Ends drawn on the line: the inheritance triangle, the embedding diamond */
  shapes?: { points: string; filled: boolean }[]
  /** Dashed: a reference (association end) to another class */
  dashed?: boolean
}

const lines = shallowRef<Line[]>([])
const boardSize = ref({ w: 0, h: 0 })

function anchor(el: Element | null | undefined, side: 'l' | 'r'): { x: number; y: number } | null {
  const b = boardEl.value
  const dot = el?.querySelector(`:scope > .dot.${side}`)
  if (!dot || !b) return null
  const r = dot.getBoundingClientRect()
  const o = b.getBoundingClientRect()
  return { x: r.left + r.width / 2 - o.left, y: r.top + r.height / 2 - o.top }
}

function curve(a: { x: number; y: number }, z: { x: number; y: number }): string {
  const dx = Math.max(30, (z.x - a.x) / 2)
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${z.x - dx},${z.y} ${z.x},${z.y}`
}

const ENTITY_COLOR = '#475569'

function layout(): void {
  const b = boardEl.value
  if (!b) return
  boardSize.value = { w: b.scrollWidth, h: b.scrollHeight }
  const out: Line[] = []
  const add = (key: string, from: Element | undefined, to: Element | undefined, line: Omit<Line, 'key' | 'd' | 'mid'>) => {
    const a = anchor(from, 'r')
    const z = anchor(to, 'l')
    if (a && z) out.push({ key, d: curve(a, z), mid: { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 }, ...line })
  }
  for (const t of board.value.types) {
    const tk = slug(t.name)
    // A line lights for the class, the entity and its tables - hovering any of them shows the whole chain
    const own = [t.card?.cls, t.type, ...(linksByType.value.get(t.type) ?? []).map(l => l.set)].filter(Boolean)
    if (t.card) {
      add(`${tk}.class`, els.class.get(t.card.cls), els.type.get(t.type), {
        color: ENTITY_COLOR, heavy: true, touches: own, mapping: null,
        remove: () => setTypeClass(t.type, null), label: `${t.card.name} → ${t.name}`
      })
    }
    for (const l of linksByType.value.get(t.type) ?? []) {
      add(`${tk}.table.${slug(nameOf(l.set))}`, els.link.get(l.holder ?? t.type), els.set.get(l.set), {
        color: ENTITY_COLOR, heavy: true, touches: [t.card?.cls, t.type, l.set].filter(Boolean), mapping: null,
        remove: () => unlinkClass(l), label: `${t.name} → ${nameOf(l.set)}${l.role === 'secondary' ? ' (sekundär)' : ''}`
      })
    }
    for (const e of t.model.mappings) {
      const color = colorOf(e.kind)
      const mk = `${tk}.${slug(nameOf(e.mapping))}`
      // The chain member - mapping - columns lights as one, also for the class, the entity and the columns' tables
      const chain = [
        t.card?.cls, t.type, e.feature, e.mapping,
        ...e.columns.flatMap(c => [c.column, c.column.eContainer?.()])
      ].filter(Boolean)
      if (e.feature) {
        add(`${mk}.member`, els.member.get(e.feature), els.mapping.get(e.mapping), {
          color, heavy: false, touches: chain, mapping: e.mapping, remove: null, label: ''
        })
      }
      for (const c of e.columns) {
        add(`${mk}.${slug(nameOf(c.column))}`, els.mapping.get(e.mapping), els.column.get(c.column), {
          color, heavy: false, touches: [t.card?.cls, t.type, e.feature, e.mapping, c.column, c.column.eContainer?.()].filter(Boolean), mapping: e.mapping,
          remove: () => disconnect(c as MappedColumn), label: `${nameOf(e.mapping)} → ${nameOf(c.column)}`
        })
      }
    }
  }
  layoutClassSide(out)
  lines.value = out
}

const EMBED_KINDS = new Set(['Embedded', 'EmbeddedId', 'ElementCollection'])

/** Lanes left of the class column, 5px apart; beyond them lines share one */
const LANES = 6

/**
 * Lines within the class column, in lanes left of it: a subclass's head to its
 * superclass's head (the hollow triangle there); an attribute typed with a
 * class on the board to that class (a diamond at the owner) - green when it is
 * mapped as an embedding; an association end to the class it leads to
 * (dashed) - in the colour of its mapping.
 */
function layoutClassSide(out: Line[]): void {
  const b = boardEl.value
  if (!b) return
  const o = b.getBoundingClientRect()
  const box = (el: Element | undefined) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { left: r.left - o.left, right: r.right - o.left, top: r.top - o.top, bottom: r.bottom - o.top, mid: r.top + r.height / 2 - o.top }
  }
  const cards = board.value.classes
  let lane = 0
  /** The next lane: a few px apart, from the column's edge outwards */
  const nextLane = (left: number) => left - 14 - (lane++ % LANES) * 5
  for (const card of cards) {
    if (!card.parent) continue
    const parent = box(els.class.get(card.parent.cls))
    const head = box(els.class.get(card.cls))
    if (!parent || !head) continue
    const x = nextLane(Math.min(parent.left, head.left))
    const tip = parent.left
    out.push({
      key: `${slug(card.name)}.extends`,
      d: `M${head.left},${head.mid} H${x} V${parent.mid} H${tip - 9}`,
      mid: { x, y: (parent.mid + head.mid) / 2 },
      color: 'var(--text-color-secondary)',
      heavy: false,
      touches: [card.cls, card.parent.cls, card.type, card.parent.type].filter(Boolean),
      mapping: null,
      remove: null,
      label: '',
      shapes: [{ points: `${tip},${parent.mid} ${tip - 9},${parent.mid - 6} ${tip - 9},${parent.mid + 6}`, filled: false }]
    })
  }
  const byCls = new Map(cards.map(c => [c.cls, c]))
  for (const card of cards) {
    for (const m of card.members) {
      const target = byCls.get(m.typeObject)
      if (!target) continue
      const from = box(els.member.get(m.feature))
      const to = box(els.class.get(target.cls))
      if (!from || !to) continue
      const kind = entryByMember.value.get(m.feature)?.entry.kind
      const x = nextLane(Math.min(from.left, to.left))
      const y = from.mid
      if (m.isEnd) {
        out.push({
          key: `${slug(card.name)}.${slug(m.name)}.leads`,
          d: `M${from.left},${y} H${x} V${to.mid} H${to.left}`,
          mid: { x, y: (y + to.mid) / 2 },
          color: kind ? KIND_COLORS[kind] : ENTITY_COLOR,
          heavy: false,
          touches: [m.feature, card.cls, card.type, target.cls, target.type].filter(Boolean),
          mapping: null,
          remove: null,
          label: '',
          dashed: true
        })
        continue
      }
      out.push({
        key: `${slug(card.name)}.${slug(m.name)}.embeds`,
        d: `M${from.left - 10},${y} H${x} V${to.mid} H${to.left - 1}`,
        mid: { x, y: (y + to.mid) / 2 },
        color: kind && EMBED_KINDS.has(kind) ? KIND_COLORS[kind] : ENTITY_COLOR,
        heavy: false,
        touches: [m.feature, card.cls, card.type, target.cls, target.type].filter(Boolean),
        mapping: null,
        remove: null,
        label: '',
        shapes: [{ points: `${from.left},${y} ${from.left - 5},${y - 3.5} ${from.left - 10},${y} ${from.left - 5},${y + 3.5}`, filled: true }]
      })
    }
  }
}

let observer: ResizeObserver | null = null
onMounted(() => {
  nextTick(layout)
  if (boardEl.value && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => layout())
    observer.observe(boardEl.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
watch(board, () => nextTick(layout))

/* ── picking ─────────────────────────────────────────────────────── */

/** The picked line (key) or mapping */
const pickedLine = shallowRef<string | null>(null)
const pickedMapping = shallowRef<any>(null)
const hovered = shallowRef<any>(null)

const picked = computed(() => lines.value.find(l => l.key === pickedLine.value) ?? null)

function pickLine(line: Line): void {
  pickedMapping.value = null
  pickedLine.value = pickedLine.value === line.key || !line.remove ? null : line.key
  if (!line.remove && line.mapping) pickedMapping.value = line.mapping
  boardEl.value?.focus()
}

function pickMapping(entry: MappingEntry): void {
  pickedLine.value = null
  pickedMapping.value = pickedMapping.value === entry.mapping ? null : entry.mapping
  boardEl.value?.focus()
}

function clearPick(): void {
  pickedLine.value = null
  pickedMapping.value = null
}

/** Whether a line stays bright: the picked one's, or those touching what is under the pointer */
function lit(line: Line): boolean {
  if (pickedLine.value) return line.key === pickedLine.value
  if (pickedMapping.value) return line.mapping === pickedMapping.value
  const h = hovered.value
  return !h || line.touches.includes(h)
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') { clearPick(); return }
  if (event.key !== 'Delete' && event.key !== 'Backspace') return
  const line = picked.value
  if (line?.remove) {
    event.preventDefault()
    unlinkLine(line)
    return
  }
  const entry = pickedMapping.value ? board.value.types.flatMap(t => t.model.mappings).find(e => e.mapping === pickedMapping.value) : null
  if (entry) {
    event.preventDefault()
    dropMapping(entry)
  }
}

function unlinkLine(line: Line): void {
  const remove = line.remove
  clearPick()
  if (remove) change(remove)
}

function dropMapping(entry: MappingEntry): void {
  clearPick()
  change(() => removeMapping(entry))
}

function setKind(tcard: TypeCard, entry: MappingEntry, event: Event): void {
  const kind = (event.target as HTMLSelectElement).value as MappingKind
  change(() => {
    const created = changeKind(tcard.model, entry, kind)
    if (created && pickedMapping.value === entry.mapping) pickedMapping.value = created
  })
}

/* ── dragging onto another column of the board ───────────────────── */

/** What each part can be dropped on */
const DROPS: Record<Part, Part[]> = {
  class: ['set', 'type'],
  set: ['class', 'type'],
  type: ['set', 'class'],
  link: [],
  member: ['column', 'mapping'],
  column: ['member', 'mapping'],
  mapping: ['column', 'member']
}

/** Which side its line leaves on: right for the left columns, left for the tables */
function sideOf(t: Target, towards: Part | null): 'l' | 'r' {
  if (t.part === 'class' || t.part === 'member') return 'r'
  if (t.part === 'set' || t.part === 'column') return 'l'
  // Middle column: towards the classes left, towards the tables right
  return towards === 'class' || towards === 'member' ? 'l' : 'r'
}

interface Drag {
  grip: Target
  start: { x: number; y: number }
  at: { x: number; y: number }
  moved: boolean
}

const drag = shallowRef<Drag | null>(null)
const dropTarget = shallowRef<Target | null>(null)

function begin(event: PointerEvent, part: Part, item: any, owner?: any): void {
  if (event.button !== 0 || (event.target as HTMLElement).closest('button, select, input')) return
  event.stopPropagation()
  const grip: Target = { part, item, owner }
  const el = els[part].get(keyOf(grip))
  const start = anchor(el, sideOf(grip, null)) ?? anchor(el, 'r') ?? anchor(el, 'l')
  if (!start) return
  drag.value = { grip, start, at: start, moved: false }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('keydown', onDragKey)
}

function hitAt(x: number, y: number): Target | null {
  const d = drag.value
  if (!d) return null
  let el: Element | null = document.elementFromPoint(x, y)
  for (; el && el !== boardEl.value; el = el.parentElement) {
    const t = targets.get(el)
    if (t && DROPS[d.grip.part].includes(t.part)) return t
  }
  return null
}

function onMove(event: PointerEvent): void {
  const d = drag.value
  const b = boardEl.value
  if (!d || !b) return
  const o = b.getBoundingClientRect()
  const at = { x: event.clientX - o.left, y: event.clientY - o.top }
  const target = hitAt(event.clientX, event.clientY)
  dropTarget.value = target
  // From the middle column the line leaves towards where it goes
  const el = els[d.grip.part].get(keyOf(d.grip))
  const start = d.grip.part === 'type' || d.grip.part === 'mapping'
    ? anchor(el, at.x < d.start.x ? 'l' : 'r') ?? d.start
    : d.start
  drag.value = { ...d, start, at, moved: d.moved || Math.hypot(at.x - d.start.x, at.y - d.start.y) > 4 }
}

function endDrag(): void {
  drag.value = null
  dropTarget.value = null
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('keydown', onDragKey)
}

function onUp(event: PointerEvent): void {
  const d = drag.value
  const target = d?.moved ? hitAt(event.clientX, event.clientY) : null
  endDrag()
  if (!d || !target) return
  const pair = new Map<Part, Target>([[d.grip.part, d.grip], [target.part, target]])
  const get = (p: Part) => pair.get(p)
  const objects = editing.objects.value
  const cls = get('class'), set = get('set'), type = get('type')
  const member = get('member'), column = get('column'), mapping = get('mapping')
  if (cls && set) change(() => linkClass(board.value, cls.item as ClassCard, (set.item as ColumnSetEntry).set))
  else if (cls && type) change(() => setTypeClass((type.item as TypeCard).type, (cls.item as ClassCard).cls))
  else if (type && set) change(() => linkType((type.item as TypeCard).type, (set.item as ColumnSetEntry).set))
  else if (member && column) {
    const card = member.owner as ClassCard
    change(() => connectOnBoard(board.value, card, member.item as ClassMember, (column.item as ColumnEntry).column, objects))
  } else if (member && mapping) change(() => bindMember(mapping.item as MappingEntry, member.item as ClassMember))
  else if (mapping && column) {
    const tcard = mapping.owner as TypeCard
    change(() => connectMapping(tcard.model, mapping.item as MappingEntry, (column.item as ColumnEntry).column))
  }
}

function onDragKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') endDrag()
}

onBeforeUnmount(endDrag)

const dragPath = computed(() => {
  const d = drag.value
  if (!d?.moved) return ''
  return d.at.x >= d.start.x ? curve(d.start, d.at) : curve(d.at, d.start)
})

const dragColor = computed(() => {
  const d = drag.value
  if (!d) return ''
  const g = d.grip
  if (g.part === 'class' || g.part === 'set' || g.part === 'type') return ENTITY_COLOR
  const kind = g.part === 'mapping' ? (g.item as MappingEntry).kind
    : g.part === 'member' ? entryByMember.value.get((g.item as ClassMember).feature)?.entry.kind
    : entryByColumn.value.get((g.item as ColumnEntry).column)?.kind
  return kind && kind !== 'Transient' ? KIND_COLORS[kind] : 'var(--primary-color)'
})

function isTarget(part: Part, key: any): boolean {
  const t = dropTarget.value
  return !!t && t.part === part && keyOf(t) === key
}

/* ── creating the other side ─────────────────────────────────────── */

function addTable(card: ClassCard): void {
  change(() => { createTableFor(board.value, card, editing.dataTypes.value, editing.objects.value) })
}

function addClass(set: ColumnSetEntry): void {
  change(() => { createClassFor(board.value, set, editing.objects.value) })
}

function addColumn(card: ClassCard, member: ClassMember): void {
  const model = card.model
  const set = model?.sets[0]?.set
  if (set && model) change(() => { createColumnFor(model, member, set, editing.dataTypes.value) })
}

/** The type an unmapped column of the set would get its attribute through: the one stored there, with a class */
function typeForSet(set: ColumnSetEntry): TypeCard | null {
  return linksBySet.value.get(set.set)?.find(l => l.tcard.card)?.tcard ?? null
}

function addAttribute(set: ColumnSetEntry, column: ColumnEntry): void {
  const t = typeForSet(set)
  if (t?.card) change(() => { createAttributeFor(t.model, t.card!.cls, column, editing.objects.value) })
}

function autoMap(): void {
  const m = matches.value
  change(() => {
    for (const x of m.classes) linkClass(board.value, x.card, x.set.set)
    for (const x of m.members) if (x.card.model) connect(x.card.model, x.member, x.column.column)
  })
}

function setLabel(kind: string): string {
  return kind === 'View' ? 'View' : kind === 'Table' ? 'Tabelle' : kind
}

const KIND_OF_TYPE: Record<string, string> = { Entity: 'Entity', MappedSuperclass: 'Mapped Superclass', Embeddable: 'Embeddable' }

const popoverStyle = computed(() => {
  const p = picked.value
  return p ? { left: `${p.mid.x}px`, top: `${p.mid.y}px` } : {}
})
</script>

<template>
  <section class="mapping" :data-testid="testId">
    <header class="bar">
      <span class="heading">Mapping</span>
      <span class="legend">
        <span v-for="k in presentKinds" :key="k" class="chip" :style="{ '--c': KIND_COLORS[k] }">{{ KIND_LABELS[k] }}</span>
      </span>
      <button v-if="matchCount" class="auto" type="button" :data-testid="`${testId}.Auto`" :title="matchTitle" @click="autoMap">
        <i class="pi pi-bolt"></i> Automatisch zuordnen ({{ matchCount }})
      </button>
    </header>
    <div v-if="!hasPackage || !hasSchema" class="hint">
      <i class="pi pi-info-circle"></i>
      <template v-if="!hasPackage">Ohne <b>cwmObjectPackage</b> zeigt die Tafel alle Klassen und kann keine neuen anlegen. </template>
      <template v-if="!hasSchema">Ohne <b>cwmSchema</b> zeigt sie alle Tabellen und kann keine neuen anlegen.</template>
    </div>

    <div
      ref="boardEl"
      class="board"
      tabindex="0"
      :class="{ dragging: drag?.moved }"
      @keydown="onKey"
      @click.self="clearPick"
    >
      <!-- the classes -->
      <div class="side">
        <div class="column-title">Klassen</div>
        <div v-if="!board.classes.length" class="card"><div class="empty">Keine Klassen.</div></div>
        <div
          v-for="card in board.classes"
          :key="card.name + '@' + board.classes.indexOf(card)"
          class="card class-card"
          :class="{ unmapped: !card.type }"
          :data-testid="`${testId}.Class@${slug(card.name)}`"
        >
          <div
            :ref="reg('class', card)"
            class="card-head grip"
            :class="{ target: isTarget('class', card.cls) }"
            @pointerdown="begin($event, 'class', card)"
            @pointerenter="hovered = card.cls"
            @pointerleave="hovered = null"
          >
            <span class="badge">{{ card.kind === 'Embeddable' || card.kind === 'MappedSuperclass' ? KIND_OF_TYPE[card.kind] : 'Klasse' }}</span>
            <span class="head-name">{{ card.name }}</span>
            <span v-if="card.parent" class="extends" :title="`Spezialisiert ${card.parent.name}`">▷ {{ card.parent.name }}</span>
            <button
              v-if="!card.model?.sets.length && card.kind !== 'Embeddable' && card.kind !== 'MappedSuperclass' && hasSchema"
              class="add"
              type="button"
              :data-testid="`${testId}.Class@${slug(card.name)}.AddTable`"
              title="Neue Tabelle mit einer Spalte je Attribut anlegen und verbinden"
              @click="addTable(card)"
            >+ Tabelle</button>
            <span class="dot r"></span>
          </div>
          <div v-if="!card.members.length" class="empty">Keine Attribute.</div>
          <div
            v-for="m in card.members"
            :key="m.name + (m.isEnd ? '#end' : '')"
            :ref="reg('member', m, card)"
            class="item member"
            :class="{
              mapped: entryByMember.get(m.feature) && entryByMember.get(m.feature)!.entry.kind !== 'Transient',
              transient: entryByMember.get(m.feature)?.entry.kind === 'Transient',
              target: isTarget('member', m.feature)
            }"
            :style="{ '--c': colorOf(entryByMember.get(m.feature)?.entry.kind) }"
            :data-testid="`${testId}.Class@${slug(card.name)}.Member@${slug(m.name)}`"
            @pointerdown="begin($event, 'member', m, card)"
            @pointerenter="hovered = m.feature"
            @pointerleave="hovered = null"
          >
            <i v-if="m.isEnd" class="pi pi-arrow-right-arrow-left end-icon" title="Assoziationsende"></i>
            <span class="name">{{ m.name }}</span>
            <span class="type">{{ m.typeName }}{{ m.toMany ? '[*]' : '' }}</span>
            <button
              v-if="!entryByMember.get(m.feature) && card.model?.sets.length"
              class="add"
              type="button"
              :data-testid="`${testId}.Class@${slug(card.name)}.Member@${slug(m.name)}.AddColumn`"
              :title="`Neue Spalte in ${card.model.sets[0].name} anlegen und verbinden`"
              @click="addColumn(card, m)"
            >+ Spalte</button>
            <span class="dot r"></span>
          </div>
        </div>
      </div>

      <div class="gutter"></div>

      <!-- the managed types with their mappings -->
      <div class="side">
        <div class="column-title">Mapping</div>
        <div v-if="!board.types.length" class="card"><div class="empty">Noch keine Entity – eine Klasse auf eine Tabelle ziehen.</div></div>
        <div
          v-for="t in board.types"
          :key="t.name + '@' + board.types.indexOf(t)"
          class="card type-card"
          :class="t.kind"
          :data-testid="`${testId}.Type@${slug(t.name)}`"
        >
          <div
            :ref="reg('type', t)"
            class="card-head grip"
            :class="{ target: isTarget('type', t.type) }"
            @pointerdown="begin($event, 'type', t)"
            @pointerenter="hovered = t.type"
            @pointerleave="hovered = null"
          >
            <span class="dot l"></span>
            <span class="badge">{{ KIND_OF_TYPE[t.kind] ?? t.kind }}</span>
            <span class="head-name">{{ t.name }}</span>
            <button class="icon" type="button" title="In der Kontextansicht öffnen" @click="editing.setContext(t.type)"><i class="pi pi-external-link"></i></button>
            <button class="icon danger" type="button" :title="`${KIND_OF_TYPE[t.kind] ?? t.kind} mit allen Mappings entfernen`" @click="change(() => removeType(t.type))"><i class="pi pi-trash"></i></button>
            <span v-if="!linksByType.get(t.type)" class="dot r"></span>
          </div>
          <!-- each table it is stored in, with the mappings whose columns lie there; then those without -->
          <div v-if="!t.model.mappings.length && !linksByType.get(t.type)" class="empty">Keine Mappings – ein Attribut auf eine Spalte ziehen.</div>
          <template v-for="g in groupsOf(t)" :key="g.link ? nameOf(g.link.set) + g.link.role : '-'">
            <div
              v-if="g.link"
              :ref="reg('link', g.link)"
              class="item link-row"
              :class="g.link.role"
              :data-testid="`${testId}.Type@${slug(t.name)}.Table@${slug(nameOf(g.link.set))}`"
              @pointerenter="hovered = g.link.set"
              @pointerleave="hovered = null"
            >
              <i class="pi pi-table link-icon"></i>
              <span class="name mono">{{ nameOf(g.link.set) }}</span>
              <span class="type">{{ g.link.role === 'secondary' ? 'sekundär' : 'primär' }}</span>
              <button class="icon danger row-action" type="button" title="Tabelle lösen" @click="change(() => unlinkClass(g.link!))"><i class="pi pi-times"></i></button>
              <span class="dot r"></span>
            </div>
            <div v-else-if="g.mappings.length && linksByType.get(t.type)" class="item link-row none">
              <span class="type">ohne Tabelle</span>
            </div>
            <div
              v-for="e in g.mappings"
              :key="nameOf(e.mapping) + e.kind"
              :ref="reg('mapping', e, t)"
              class="item mapping-row"
              :class="{ picked: pickedMapping === e.mapping, target: isTarget('mapping', e.mapping), orphan: !memberOfEntry(t, e) }"
              :style="{ '--c': colorOf(e.kind) }"
              :data-testid="`${testId}.Type@${slug(t.name)}.Mapping@${slug(nameOf(e.mapping))}`"
              @pointerdown="begin($event, 'mapping', e, t)"
              @click="pickMapping(e)"
              @pointerenter="hovered = e.mapping"
              @pointerleave="hovered = null"
            >
              <span class="dot l"></span>
              <select
                class="kind"
                :value="e.kind"
                :disabled="kindChoices(e).length < 2"
                :data-testid="`${testId}.Type@${slug(t.name)}.Mapping@${slug(nameOf(e.mapping))}.Kind`"
                title="Art des Mappings"
                @click.stop
                @change="setKind(t, e, $event)"
              >
                <option v-for="k in kindChoices(e)" :key="k" :value="k">{{ KIND_LABELS[k] }}</option>
              </select>
              <span class="name">{{ nameOf(e.mapping) }}</span>
              <span v-for="x in elsewhere(e)" :key="x" class="elsewhere" title="Spalte in einer anderen Tabelle">→ {{ x }}</span>
              <span class="row-actions">
                <button class="icon" type="button" title="In der Kontextansicht öffnen" @click.stop="editing.setContext(e.mapping)"><i class="pi pi-external-link"></i></button>
                <button
                  class="icon danger"
                  type="button"
                  title="Mapping entfernen"
                  :data-testid="`${testId}.Type@${slug(t.name)}.Mapping@${slug(nameOf(e.mapping))}.Remove`"
                  @click.stop="dropMapping(e)"
                ><i class="pi pi-times"></i></button>
              </span>
              <span class="dot r"></span>
            </div>
          </template>
        </div>
      </div>

      <div class="gutter"></div>

      <!-- the tables and views -->
      <div class="side">
        <div class="column-title">Tabellen und Views</div>
        <div v-if="!board.sets.length" class="card"><div class="empty">Keine Tabellen oder Views.</div></div>
        <div
          v-for="s in board.sets"
          :key="s.name + '@' + board.sets.indexOf(s)"
          class="card set-card"
          :class="[s.kind === 'View' ? 'view' : 'table', { unmapped: !linksBySet.get(s.set) }]"
          :data-testid="`${testId}.Set@${slug(s.name)}`"
        >
          <div
            :ref="reg('set', s)"
            class="card-head grip"
            :class="{ target: isTarget('set', s.set) }"
            @pointerdown="begin($event, 'set', s)"
            @pointerenter="hovered = s.set"
            @pointerleave="hovered = null"
          >
            <span class="dot l"></span>
            <span class="badge">{{ setLabel(s.kind) }}</span>
            <span class="head-name mono">{{ s.name }}</span>
            <button
              v-if="!linksBySet.get(s.set) && hasPackage"
              class="add"
              type="button"
              :data-testid="`${testId}.Set@${slug(s.name)}.AddClass`"
              title="Neue Klasse mit einem Attribut je Spalte anlegen und verbinden"
              @click="addClass(s)"
            >+ Klasse</button>
          </div>
          <div v-if="!s.columns.length" class="empty">Keine Spalten.</div>
          <div
            v-for="c in s.columns"
            :key="c.name"
            :ref="reg('column', c)"
            class="item column"
            :class="{ mapped: entryByColumn.has(c.column), target: isTarget('column', c.column) }"
            :style="{ '--c': colorOf(entryByColumn.get(c.column)?.kind) }"
            :data-testid="`${testId}.Set@${slug(s.name)}.Column@${slug(c.name)}`"
            @pointerdown="begin($event, 'column', c)"
            @pointerenter="hovered = c.column"
            @pointerleave="hovered = null"
          >
            <span class="dot l"></span>
            <i v-if="c.primaryKey" class="pi pi-key key" title="Primärschlüssel"></i>
            <i v-else-if="c.foreignKey" class="pi pi-link fk" title="Fremdschlüssel"></i>
            <span class="name mono">{{ c.name }}</span>
            <span class="type mono">{{ c.typeName }}</span>
            <button
              v-if="!entryByColumn.has(c.column) && typeForSet(s)"
              class="add"
              type="button"
              :data-testid="`${testId}.Set@${slug(s.name)}.Column@${slug(c.name)}.AddAttribute`"
              :title="`Neues Attribut in ${typeForSet(s)!.card!.name} anlegen und verbinden`"
              @click="addAttribute(s, c)"
            >+ Attribut</button>
          </div>
        </div>
      </div>

      <!-- the lines -->
      <svg class="lines" :width="boardSize.w" :height="boardSize.h">
        <g v-for="l in lines" :key="l.key" :class="{ dim: !lit(l), picked: pickedLine === l.key, heavy: l.heavy, dashed: l.dashed }">
          <path class="hit" :d="l.d" :data-testid="`${testId}.Line@${l.key}`" @click.stop="pickLine(l)" />
          <path class="line" :d="l.d" :stroke="l.color" />
          <polygon v-for="(sh, i) in l.shapes ?? []" :key="i" class="shape" :points="sh.points" :stroke="l.color" :fill="sh.filled ? l.color : 'var(--surface-card)'" />
        </g>
        <path v-if="dragPath" class="line drag" :d="dragPath" :stroke="dragColor" />
      </svg>

      <!-- the picked line -->
      <div v-if="picked?.remove" class="popover" :style="popoverStyle" :data-testid="`${testId}.Popover`" @click.stop>
        <span class="popover-label">{{ picked.label }}</span>
        <span class="sep"></span>
        <button type="button" class="icon danger" title="Verbindung lösen (Entf)" @click="unlinkLine(picked)"><i class="pi pi-times"></i></button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mapping {
  margin: 0.4rem 0 0.6rem;
}

.bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.heading {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
}

.legend {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.chip {
  font: inherit;
  font-size: 0.7rem;
  line-height: 1.2;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
  background: color-mix(in srgb, var(--c) 14%, transparent);
  color: var(--c);
  font-weight: 600;
}

button.chip {
  cursor: pointer;
}

button.chip.on {
  background: var(--c);
  color: #fff;
}

.auto {
  margin-left: auto;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  background: var(--surface-card);
  color: var(--primary-color);
  padding: 0.15rem 0.5rem;
}

.auto:hover {
  background: var(--surface-hover);
}

.board {
  position: relative;
  display: grid;
  grid-template-columns: minmax(12rem, 1fr) minmax(2.5rem, 5rem) minmax(13rem, 1fr) minmax(2.5rem, 5rem) minmax(12rem, 1fr);
  align-items: start;
  outline: none;
  user-select: none;
  /* Lanes for the lines from a subclass to its superclass and from an attribute to the class it embeds */
  padding-left: 3rem;
}

.extends {
  font-size: 0.7rem;
  color: var(--text-color-secondary);
  white-space: nowrap;
}

.shape {
  stroke-width: 1.5;
}

.dim .shape {
  opacity: 0.1;
}

.board.dragging {
  cursor: grabbing;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.card {
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  background: var(--surface-card);
  --head: #1e40af;
}

.class-card {
  --head: #b45309;
}

.type-card {
  --head: #4f46e5;
}

.type-card.Embeddable {
  --head: #16a34a;
}

.type-card.MappedSuperclass {
  --head: #9333ea;
}

.column-title {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-color-secondary);
  text-align: center;
}

.set-card.table {
  --head: #334155;
}

.set-card.view {
  --head: #0f766e;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.5rem;
  background: color-mix(in srgb, var(--head) 12%, var(--surface-card));
  border-bottom: 2px solid var(--head);
  border-radius: 5px 5px 0 0;
}

/* A head is grabbed to link the class with a table or view */
.card-head.grip {
  position: relative;
  cursor: grab;
}

.card-head.target {
  outline: 2px dashed var(--primary-color);
  outline-offset: -2px;
}

.card-head .dot {
  --c: #475569;
  width: 11px;
  height: 11px;
  margin-top: -6px;
}

.head-name {
  font-weight: 600;
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-head .add {
  margin-left: 0;
}

.card-head:hover .add {
  opacity: 1;
}

/* Neither stored nor storing: dimmed until linked */
.card.unmapped {
  border-style: dashed;
}

.card.unmapped .card-head {
  --head: #94a3b8;
}

.hint {
  font-size: 0.8rem;
  color: var(--text-color-secondary);
  margin-bottom: 0.35rem;
}

.badge {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
  color: var(--head);
  white-space: nowrap;
}

.empty {
  padding: 0.5rem;
  font-size: 0.8rem;
  color: var(--text-color-secondary);
}

.item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.22rem 0.6rem;
  min-height: 1.7rem;
  border-left: 3px solid transparent;
  cursor: grab;
  font-size: 0.85rem;
}

.item + .item {
  border-top: 1px solid color-mix(in srgb, var(--surface-border) 60%, transparent);
}

.item:hover {
  background: var(--surface-hover);
}

.item.mapped {
  border-left-color: var(--c);
}

.column.mapped {
  border-left-color: transparent;
  border-right: 3px solid var(--c);
}

.item.target {
  background: color-mix(in srgb, var(--primary-color) 16%, transparent);
  outline: 2px dashed var(--primary-color);
  outline-offset: -2px;
}

.item.transient .name {
  text-decoration: line-through;
  color: var(--text-color-secondary);
}

.name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.type {
  color: var(--text-color-secondary);
  font-size: 0.75rem;
  white-space: nowrap;
}

.mono {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
}

.kind {
  font: inherit;
  font-size: 0.65rem;
  font-weight: 700;
  min-width: 2.6rem;
  text-align: center;
  padding: 0.05rem 0.3rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
  background: color-mix(in srgb, var(--c) 14%, transparent);
  color: var(--c);
  cursor: pointer;
}

.end-icon {
  font-size: 0.7rem;
  color: var(--text-color-secondary);
}

.key {
  font-size: 0.75rem;
  color: #d97706;
}

.fk {
  font-size: 0.75rem;
  color: #7c3aed;
}

.elsewhere {
  font-size: 0.7rem;
  color: var(--text-color-secondary);
  white-space: nowrap;
}

.add {
  margin-left: auto;
  font: inherit;
  font-size: 0.7rem;
  cursor: pointer;
  border: 1px dashed var(--surface-border);
  border-radius: 4px;
  background: transparent;
  color: var(--primary-color);
  padding: 0 0.35rem;
  opacity: 0;
}

.item:hover .add {
  opacity: 1;
}

/* The ends of the lines: right on a member, left on a column */
.dot {
  position: absolute;
  top: 50%;
  width: 9px;
  height: 9px;
  margin-top: -5px;
  border-radius: 50%;
  border: 2px solid var(--c);
  background: var(--surface-card);
}

.dot.r {
  right: -6px;
}

.dot.l {
  left: -6px;
}

.mapped .dot,
.mapping-row .dot,
.card:not(.unmapped) > .card-head .dot,
.link-row .dot {
  background: var(--c);
}

/* The rows of a managed type: its tables, then its mappings */
.link-row {
  --c: #475569;
  cursor: default;
  font-size: 0.8rem;
  background: color-mix(in srgb, var(--head) 5%, transparent);
}

.link-row.none {
  padding-top: 0.1rem;
  padding-bottom: 0.1rem;
  min-height: 0;
}

.link-row.secondary .name {
  font-style: italic;
}

.link-icon {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.mapping-row {
  border-left-color: var(--c);
  /* Below its table's row */
  padding-left: 1.2rem;
}

.mapping-row.picked {
  background: color-mix(in srgb, var(--c) 14%, transparent);
}

.mapping-row.orphan .name {
  color: var(--red-500, #dc2626);
}

.row-actions,
.row-action {
  margin-left: auto;
  display: flex;
  opacity: 0;
}

.item:hover .row-actions,
.item:hover .row-action,
.mapping-row.picked .row-actions {
  opacity: 1;
}

select.kind {
  appearance: none;
  -webkit-appearance: none;
}

select.kind:disabled {
  opacity: 1;
  cursor: default;
}

.item:not(.mapped) .dot {
  border-color: var(--surface-border);
}

.item:hover .dot {
  border-color: var(--primary-color);
}

.icon {
  font: inherit;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  padding: 0.1rem 0.25rem;
  border-radius: 3px;
}

.icon:hover {
  background: var(--surface-hover);
  color: var(--text-color);
}

.icon.danger:hover {
  color: var(--red-500, #dc2626);
}

.lines {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  overflow: visible;
  z-index: 2;
}

.line {
  fill: none;
  stroke-width: 2;
  transition: opacity 0.12s;
}

.hit {
  fill: none;
  stroke: transparent;
  stroke-width: 12;
  pointer-events: stroke;
  cursor: pointer;
}

.dim .line {
  opacity: 0.1;
}

.picked .line {
  stroke-width: 3.5;
}

/* Class - type - table: thick */
.heavy .line {
  stroke-width: 3;
  stroke-linecap: round;
}

.dashed .line {
  stroke-dasharray: 4 3;
  stroke-width: 1.2;
}

.heavy.picked .line {
  stroke-width: 5;
}


.popover-label {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0 0.25rem;
}

.line.drag {
  stroke-dasharray: 6 4;
  stroke-width: 2.5;
}

.popover {
  position: absolute;
  z-index: 3;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.35rem;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  background: var(--surface-overlay, var(--surface-card));
  box-shadow: 0 4px 14px rgb(0 0 0 / 0.15);
  white-space: nowrap;
}

.sep {
  width: 1px;
  align-self: stretch;
  background: var(--surface-border);
}
</style>
