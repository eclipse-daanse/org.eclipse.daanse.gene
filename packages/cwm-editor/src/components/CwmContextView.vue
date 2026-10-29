<script setup lang="ts">
/**
 * The context view - main area of the CWM editor (PH-1, PH-2, PH-6).
 *
 * A header with the hierarchy breadcrumb to the context object, the flow
 * breadcrumb of visited objects, the jumps up/back/forward and "set as
 * context object". Below it one ObjectRow per object under the context
 * object, depth first.
 *
 * The context object starts as the container of the object selected in the
 * tree. Selecting an object outside of it moves the context to that object's
 * container, so the selection always has its row.
 */
import { computed, inject, nextTick, onBeforeUnmount, provide, reactive, ref, shallowReactive, shallowRef, toRaw, watch } from 'tsm:vue'
import ContextObjectRow from './ContextObjectRow.vue'
import RowSkeleton from './RowSkeleton.vue'
import FieldRulesHost from './FieldRulesHost.vue'
import { type ContextRow, children, contextPath, contextRows, contextUp, displayName, isInside, isResource, parentOf, pathTo, rowMode, siblingOf, visibleRows } from '../composables/contextView'
import { attr, className, isDescription, slug } from '../composables/documentation'
import { CWM_EDITING } from '../composables/editing'
import { allObjects, buildReferenceIndex, referenceCandidates } from '../composables/references'
import { dataTypes } from '../composables/columnsEdit'
import { classifiers } from '../composables/attributes'
import { setCreatedHook } from '../composables/creation'
import { childrenDefault, outlineNumbers } from '../composables/taggedValues'
import { numbering } from '../composables/toolbar'
import { backendDefaults } from '../composables/fieldDefaults'
import { applyBackendDefaults } from '../composables/rowContent'
import { buildGrantIndex } from '../composables/grants'

const props = defineProps<{ context: any }>()

const emit = defineEmits<{
  /** The object of the topmost visible row, for the tree to mark (PH-3) */
  'top-object': [object: any]
}>()

/** How many visited objects the flow breadcrumb keeps */
const FLOW_LENGTH = 8

const version = computed<number>(() => props.context.version?.value ?? 0)
const selected = computed(() => toRaw(props.context.selectedObject?.value ?? null))

const contextObject = shallowRef<any>(null)
const visited = ref<any[]>([])
const collapsed = reactive(new Set<any>())
const rootEl = ref<HTMLElement | null>(null)

const rows = computed(() => {
  void version.value
  return contextObject.value ? contextRows(contextObject.value) : []
})
/** Children of a folded element opened one by one - they show in full, the others as heads */
const opened = reactive(new Set<any>())
/** Elements closed with their "−": only their name shows, their children not at all - "+" shows them again */
const shut = reactive(new Set<any>())
const shownRows = computed(() =>
  visibleRows(rows.value, collapsed, opened).filter(r => shut.size === 0 || !r.ancestors.some(a => shut.has(a)))
)
const headRows = computed(() => new Set(shownRows.value.filter(r => shut.has(r.object) || rowMode(r, collapsed, opened) === 'head').map(r => r.object)))

function toggleShut(o: any): void {
  if (shut.has(o)) shut.delete(o)
  else shut.add(o)
}

/*
 * Children folded at first: the tag gene.children = collapsed. Applied when a
 * row is first seen and whenever its tag changes; folding by hand in between
 * stays as it is.
 */
let appliedDefaults = new WeakMap<object, string>()
watch(rows, list => {
  for (const r of list) {
    if (!r.hasChildren) continue
    const wanted = childrenDefault(r.object)
    if (appliedDefaults.get(r.object) === wanted) continue
    const first = !appliedDefaults.has(r.object)
    appliedDefaults.set(r.object, wanted)
    if (wanted === 'collapsed') collapsed.add(r.object)
    else if (!first) collapsed.delete(r.object)
  }
}, { immediate: true })

/* Outline numbers on the rows - switched on in the toolbar, kept per browser */
const numbers = computed(() => (numbering.value ? outlineNumbers(rows.value) : new Map<any, string>()))

/**
 * Width of the widest type name on the page, in px (as the tags set it:
 * 0.68rem, semibold). All type tags take it, so the numbers before them
 * stand in one column.
 */
let measure: CanvasRenderingContext2D | null = null
const kindWidth = computed(() => {
  measure ??= document.createElement('canvas').getContext('2d')
  if (!measure) return 0
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  measure.font = `600 ${0.68 * rem}px ${getComputedStyle(document.body).fontFamily}`
  const kinds = new Set(rows.value.map(r => r.kind))
  return Math.ceil(Math.max(0, ...[...kinds].map(k => measure!.measureText(k).width)))
})

/*
 * Rendering many rows blocks the page for a moment. Before that the view
 * shows a loading animation for a frame: when the editor opens, and when the
 * context moves to an object with many descendants.
 */
const BIG_CONTEXT = 60
const rowsReady = ref(false)
let firstContext = true

function descendantsExceed(o: any, limit: number): boolean {
  let n = 0
  const stack = [toRaw(o)]
  while (stack.length) {
    const x = stack.pop()
    for (const c of children(x)) {
      if (++n > limit) return true
      stack.push(c)
    }
  }
  return false
}

watch(contextObject, o => {
  if (!o) return
  if (!firstContext && !descendantsExceed(o, BIG_CONTEXT)) {
    rowsReady.value = true
    return
  }
  firstContext = false
  rowsReady.value = false
  // Two frames: the animation gets painted before the rows block the page
  requestAnimationFrame(() => requestAnimationFrame(() => { rowsReady.value = true }))
}, { immediate: true })

/*
 * The rows are drawn in batches, a few per frame: the first ones show at
 * once, the rest follow while a progress line at the end says how far it got.
 * A new context starts again with the first batch.
 */
/** Indentation of the placeholders while the view loads - like a small tree */
const SKELETON_DEPTHS = [0, 1, 2, 2, 1, 2, 3, 1]

const FIRST_BATCH = 12
const BATCH = 10
const renderCount = ref(FIRST_BATCH)
const renderedRows = computed(() => shownRows.value.slice(0, renderCount.value))
const stillRendering = computed(() => rowsReady.value && renderCount.value < shownRows.value.length)
let growTimer = 0

function growRows(): void {
  if (growTimer) return
  // A frame to paint what is there, then the next batch
  growTimer = requestAnimationFrame(() => {
    growTimer = window.setTimeout(() => {
      growTimer = 0
      if (renderCount.value >= shownRows.value.length) return
      renderCount.value = Math.min(shownRows.value.length, renderCount.value + BATCH)
      growRows()
    }, 0)
  })
}

/** Draws at least up to the row of o, so it can be scrolled to */
function ensureRendered(o: any): void {
  const target = o ? rowObjectFor(o) : null
  const index = target ? shownRows.value.findIndex(r => r.object === target) : -1
  if (index >= renderCount.value) renderCount.value = index + BATCH
}

watch(contextObject, () => { renderCount.value = FIRST_BATCH })
watch([rowsReady, shownRows], () => { if (rowsReady.value) growRows() })

/** A jump asked for before the rows were there; done once they are */
let pendingJump: { object: any; gently: boolean } | null = null

watch(rowsReady, async ready => {
  if (!ready || !pendingJump) return
  const { object, gently } = pendingJump
  pendingJump = null
  ensureRendered(object)
  await nextTick()
  jumpTo(object, gently)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(growTimer)
  clearTimeout(growTimer)
})
/** Context line plus one slot per level, plus one for the deepest row's toggle */
const gutter = computed(() => rows.value.reduce((m, r) => Math.max(m, r.depth), 0) + 2)

const tsm = inject<any>('tsm', null)
const treeComposables = tsm?.getService?.('ui.instance-tree.composables')
// New objects get their xmi:id by the instance tree's rules and the backend
// defaults of the field rules (FR-1.2)
setCreatedHook(o => {
  treeComposables?.assignXmiId?.(o)
  applyBackendDefaults(o, backendDefaults(o))
})

// OCL results (PH-4): the problems service's issues per object; a fresh
// validation of one object replaces them for that object
const problems = tsm?.getService?.('gene.problems') ?? null
const revalidated = shallowReactive(new Map<any, any[]>())
const issuesByObject = computed(() => {
  const map = new Map<any, any[]>()
  for (const issue of problems?.issues?.value ?? []) {
    const o = issue.object ? toRaw(issue.object) : null
    if (!o) continue
    const list = map.get(o) ?? []
    list.push(issue)
    map.set(o, list)
  }
  return map
})

async function validate(o: any): Promise<void> {
  if (!problems?.validateObject) return
  const raw = toRaw(o)
  try {
    revalidated.set(raw, await problems.validateObject(raw))
  } catch (e) {
    revalidated.set(raw, [{ severity: 'error', message: `Validierung fehlgeschlagen: ${e}` }])
  }
}

/* ── field rule editor ─────────────────────────────────────────── */

/** The field rule dialog lives in a component of its own - opening it does not re-render the rows */
const fieldRulesHost = ref<{ open: (o?: any, attributeName?: string) => void } | null>(null)

/*
 * Timing of an edit (temporary, to find what makes edits slow): the write
 * itself, and from there until the view has updated and painted. In the
 * console as "[cwm-perf]" and in DevTools' Performance panel as measures.
 */
function reportTiming(what: string, t0: number, t1: number): void {
  void nextTick(() => requestAnimationFrame(() => {
    const t2 = performance.now()
    try { performance.measure(`cwm ${what}`, { start: t0, end: t2 }) } catch { /* older browsers */ }
    console.info(`[cwm-perf] ${what}: Schreiben ${(t1 - t0).toFixed(0)} ms, Aktualisieren und Zeichnen ${(t2 - t1).toFixed(0)} ms, ${rows.value.length} Zeilen`)
  }))
}

function openFieldRules(o?: any, attributeName?: string): void {
  fieldRulesHost.value?.open(o, attributeName)
}

/** Classes of the loaded objects and their supertypes - what a rule can name */
const modelClasses = computed(() => {
  const classes = new Set<any>()
  for (const o of everything.value) {
    const c = o.eClass?.()
    if (!c || classes.has(c)) continue
    classes.add(c)
    for (const s of c.getEAllSuperTypes?.() ?? []) classes.add(s)
  }
  return [...classes]
})

function deleteObject(o: any): void {
  const raw = toRaw(o)
  // Deleting the context object, or what holds it, moves the context up
  if (contextObject.value && isInside(contextObject.value, raw)) setContext(contextUp(raw))
  props.context.deleteObject?.(raw)
  props.context.markDirty?.()
  props.context.triggerUpdate?.()
}

// Indexes over the whole resource set, once per model version - not once per row
const everything = computed(() => {
  void version.value
  return contextObject.value ? allObjects(contextObject.value) : []
})

/** The row under the pointer, for its bracket */
const hovered = shallowRef<any>(null)

provide(CWM_EDITING, {
  change(write: () => void) {
    const t0 = performance.now()
    write()
    const t1 = performance.now()
    props.context.markDirty?.()
    props.context.triggerUpdate?.()
    reportTiming('Änderung', t0, t1)
  },
  select: (o: any) => select(o),
  selected,
  hovered,
  setContext: (o: any) => setContext(o),
  validate: (o: any) => { void validate(o) },
  issuesFor: (o: any) => {
    const raw = toRaw(o)
    return revalidated.get(raw) ?? issuesByObject.value.get(raw) ?? []
  },
  deleteObject,
  openFieldRules,
  iconFor: (o: any) => treeComposables?.getObjectIconInfo?.(toRaw(o)) ?? null,
  objects: everything,
  dataTypes: computed(() => dataTypes(everything.value)),
  classifiers: computed(() => classifiers(everything.value)),
  descriptionClass: computed(() => everything.value.find(isDescription)?.eClass?.() ?? null),
  references: computed(() => {
    void version.value
    return contextObject.value ? buildReferenceIndex(contextObject.value) : new Map()
  }),
  grants: computed(() => buildGrantIndex(everything.value)),
  referenceCandidates: (target: any) => (contextObject.value ? referenceCandidates(contextObject.value, target) : [])
})

const hierarchy = computed(() => (contextObject.value ? [...contextPath(contextObject.value), contextObject.value] : []))
const up = computed(() => contextUp(contextObject.value))
const back = computed(() => (contextObject.value ? siblingOf(contextObject.value, -1) : null))
const forward = computed(() => (contextObject.value ? siblingOf(contextObject.value, 1) : null))
const canSetContext = computed(() => !!selected.value && selected.value !== contextObject.value)

function label(o: any): string {
  return isResource(o) ? `Datei ${displayName(o)}: alle Wurzelelemente` : `${className(o)} ${displayName(o)}`
}

function setContext(o: any): void {
  if (!o) return
  contextObject.value = toRaw(o)
  collapsed.clear()
  opened.clear()
  shut.clear()
  appliedDefaults = new WeakMap()
}

/** A selection made inside this view: keep the view where it is, only bring the row into sight */
let selectingFromView = false

function select(o: any): void {
  if (!o) return
  selectingFromView = true
  props.context.selectObject?.(toRaw(o))
}

function toggle(o: any): void {
  if (collapsed.has(o)) collapsed.delete(o)
  else foldAll(o)
}

/** All children of o to heads - also those opened one by one */
function foldAll(o: any): void {
  collapsed.add(o)
  for (const r of rows.value) if (r.ancestors[r.ancestors.length - 1] === o) opened.delete(r.object)
}

/** One child of a folded element: in full, or back to its head */
function toggleOpened(o: any): void {
  if (opened.has(o)) opened.delete(o)
  else opened.add(o)
}

/** The row that shows o: its own, or the nearest ancestor's (a column shows in its table) */
function rowObjectFor(o: any): any | null {
  const own = new Set(rows.value.map(r => r.object))
  for (let p = o; p; p = parentOf(p)) if (own.has(p)) return p
  return null
}

const selectedRowObject = computed(() => (selected.value ? rowObjectFor(selected.value) : null))

/* ── topmost visible row (PH-3) ─────────────────────────────────── */

let frame = 0
let lastTop: any = null

/** The first row whose bottom lies below the sticky header */
let settle = 0

/** The first row whose bottom lies below the sticky header - rows are in order, so a binary search */
function reportTopRow(): void {
  frame = 0
  const root = rootEl.value
  if (!root) return
  const headerBottom = root.querySelector('.header')?.getBoundingClientRect().bottom ?? root.getBoundingClientRect().top
  const els = root.querySelectorAll<HTMLElement>('.rows > [data-wire-kind="LIST"]')
  let lo = 0
  let hi = els.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (els[mid]!.getBoundingClientRect().bottom > headerBottom + 1) {
      found = mid
      hi = mid - 1
    } else {
      lo = mid + 1
    }
  }
  if (found < 0) return
  const top = shownRows.value[found]?.object ?? null
  if (top === lastTop) return
  lastTop = top
  // The tree follows once scrolling rests - marking it on every frame makes scrolling heavy
  clearTimeout(settle)
  settle = window.setTimeout(() => emit('top-object', top), 150)
}

function onScroll(): void {
  if (!frame) frame = requestAnimationFrame(reportTopRow)
}

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
  clearTimeout(settle)
})

// A new context or other rows change what is on top
watch(shownRows, () => { lastTop = null; void nextTick(reportTopRow) })

watch(selected, async (o) => {
  if (!o) return
  // Flow breadcrumb: most recent last, no duplicates
  visited.value = [...visited.value.filter(v => v !== o), o].slice(-FLOW_LENGTH)
  if (!contextObject.value || (o !== contextObject.value && !isInside(o, contextObject.value))) {
    // A root object shows with its siblings: the file is the context
    setContext(contextUp(o) ?? o)
  }
  const fromView = selectingFromView
  selectingFromView = false
  // Rows of collapsed ancestors would hide the selection
  for (const a of pathTo(o)) collapsed.delete(a)
  await nextTick()
  if (!rowsReady.value) {
    pendingJump = { object: o, gently: fromView }
    return
  }
  ensureRendered(o)
  await nextTick()
  jumpTo(o, fromView)
}, { immediate: true })

/**
 * Brings the object into view. Picked in the tree, its row moves to the top;
 * a column or attribute shown inside its table's or class's row is scrolled
 * to and flashed. Picked inside the view, the row only comes into sight.
 */
function jumpTo(o: any, gently: boolean): void {
  const target = selectedRowObject.value
  const row = target ? shownRows.value.find(r => r.object === target) : null
  if (!row) {
    if (!gently && o === contextObject.value) rootEl.value?.scrollTo({ top: 0 })
    return
  }
  const rowId = `cwm.Editor.ContextView.ObjectRow@${row.slug}`
  // By its key: objects of the same class and name share the test id (e.g. one "library" per model)
  const rowEl = rootEl.value?.querySelector<HTMLElement>(`[data-row-key="${row.key}"]`)
  if (!rowEl) return
  // A column or attribute inside the row's table
  const name = slug(String(attr(o, 'name') ?? ''))
  const inner = target !== o && parentOf(o) === target
    ? rowEl.querySelector<HTMLElement>(`[data-testid="${rowId}.Row.Body.Columns.Row@${name}"], [data-testid="${rowId}.Row.Body.Attributes.Row@${name}"], [data-testid="${rowId}.Row.Body.Ends.Row@${name}"]`)
    : null
  if (gently) {
    (inner ?? rowEl).scrollIntoView({ block: 'nearest' })
    return
  }
  if (inner) {
    inner.scrollIntoView({ block: 'center' })
    inner.classList.remove('cwm-flash')
    void inner.offsetWidth // restart the animation
    inner.classList.add('cwm-flash')
  } else {
    rowEl.scrollIntoView({ block: 'start' })
  }
}

/** For the tab: make an object the context and start at the top */
function showAsContext(o: any): void {
  setContext(o)
  void nextTick(() => rootEl.value?.scrollTo({ top: 0 }))
}

defineExpose({ setContext: showAsContext, openFieldRules: () => openFieldRules(), objects: everything, modelClasses })
</script>

<template>
  <div ref="rootEl" class="cwm-context-view" data-testid="cwm.Editor.ContextView" @scroll.passive="onScroll">
    <div class="header" data-testid="cwm.Editor.ContextView.Header">
      <nav class="crumbs" data-testid="cwm.Editor.ContextView.Header.HierarchyBreadcrumb" data-wire-kind="NAV">
        <template v-for="(o, i) in hierarchy" :key="i">
          <span v-if="i > 0" class="sep">›</span>
          <a class="crumb" :class="{ current: o === contextObject }" :title="label(o)" @click="setContext(o)">{{ displayName(o) }}</a>
        </template>
      </nav>
      <nav class="crumbs flow" data-testid="cwm.Editor.ContextView.Header.FlowBreadcrumb" data-wire-kind="NAV">
        <span class="muted">zuletzt:</span>
        <template v-for="(o, i) in visited" :key="i">
          <span v-if="i > 0" class="sep">›</span>
          <a class="crumb" :class="{ current: o === selected }" :title="label(o)" @click="select(o)">{{ displayName(o) }}</a>
        </template>
      </nav>
      <div class="jumps" data-testid="cwm.Editor.ContextView.Header.Jumps" data-wire-kind="CONTROL">
        <button type="button" :disabled="!up" :title="up ? label(up) : ''" @click="setContext(up)">▲ oben</button>
        <button type="button" :disabled="!back" :title="back ? label(back) : ''" @click="setContext(back)">◀ zurück</button>
        <button type="button" :disabled="!forward" :title="forward ? label(forward) : ''" @click="setContext(forward)">▶ vor</button>
      </div>
      <button
        type="button"
        class="set-context"
        data-testid="cwm.Editor.ContextView.Header.SetContext"
        data-wire-kind="CONTROL"
        :disabled="!canSetContext"
        @click="setContext(selected)"
      >Als Kontextobjekt setzen</button>
      <!-- Switches the tab adds, such as the glossary -->
      <slot name="tools" />
    </div>

    <FieldRulesHost ref="fieldRulesHost" :classes="() => modelClasses" />

    <div v-if="!contextObject" class="empty">
      <i class="pi pi-sitemap"></i>
      <p>Ein Element im Baum wählen — die Ansicht zeigt dann alles in seiner Umgebung.</p>
    </div>
    <!-- Loading: placeholders shaped like the rows to come -->
    <div v-else-if="!rowsReady" class="rows skeletons" data-testid="cwm.Editor.ContextView.Loading" role="status" aria-label="Ansicht wird aufgebaut">
      <RowSkeleton v-for="(d, n) in SKELETON_DEPTHS" :key="n" :depth="d" :lines="n % 3 === 0 ? 3 : 2" />
    </div>
    <div v-else class="rows" :style="{ '--cwm-kind-width': `${kindWidth}px` }">
      <ContextObjectRow
        v-for="(row, i) in renderedRows"
        :key="row.key"
        :row="row"
        :prev-depth="shownRows[i - 1]?.depth ?? -1"
        :next-depth="shownRows[i + 1]?.depth ?? -1"
        :context="contextObject"
        :gutter="gutter"
        :expanded="!collapsed.has(row.object)"
        :selected="row.object === selectedRowObject"
        :number="numbers.get(row.object)"
        :head="headRows.has(row.object)"
        :opened="opened.has(row.object)"
        :parent-folded="collapsed.has(row.ancestors[row.ancestors.length - 1])"
        :numbering="numbering"
        :version="version"
        @toggle="toggle(row.object)"
        @toggle-opened="toggleOpened(row.object)"
        :shut="shut.has(row.object)"
        @toggle-shut="toggleShut(row.object)"
        @select="select"
      />
      <!-- The next rows, while they are still being drawn -->
      <template v-if="stillRendering">
        <RowSkeleton
          v-for="n in 3"
          :key="`s${n}`"
          :depth="shownRows[renderCount + n - 1]?.depth ?? 1"
          :lines="2"
        />
      </template>
      <div v-if="stillRendering" class="rendering" data-testid="cwm.Editor.ContextView.Rendering" role="status">
        <span>Lade Einträge … {{ renderCount }} von {{ shownRows.length }}</span>
        <span class="bar"><span :style="{ width: `${(renderCount / shownRows.length) * 100}%` }"></span></span>
      </div>
    </div>
  </div>
</template>

<style>
/* A column or attribute row jumped to from the tree; not scoped - it lives in a child table */
@keyframes cwm-flash {
  from { background: color-mix(in srgb, var(--primary-color) 30%, transparent); }
  to { background: transparent; }
}

.cwm-flash {
  animation: cwm-flash 1.5s ease-out;
}
</style>

<style scoped>
/* Not "context-view": Monaco styles that class globally (position: absolute) */
.cwm-context-view {
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  padding: 0.5rem 0.75rem;
  background: var(--surface-ground);
  border-bottom: 1px solid var(--surface-border);
  font-size: 0.8rem;
}

.crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.3rem;
  min-width: 0;
}

.crumbs.flow {
  flex: 1 1 auto;
}

.crumb {
  cursor: pointer;
  color: var(--primary-color);
}

.crumb:hover {
  text-decoration: underline;
}

.crumb.current {
  color: var(--text-color);
  font-weight: 600;
}

.sep,
.muted {
  color: var(--text-color-secondary);
}

.jumps {
  display: flex;
  gap: 0.25rem;
}

.header button {
  font: inherit;
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--surface-border);
  border-radius: 3px;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
}

.header button:disabled {
  opacity: 0.45;
  cursor: default;
}

.rows {
  /* A little room to the document's top and left edge */
  padding: 5px 0.75rem 2rem calc(0.25rem + 5px);
}

/* Rows out of sight are neither laid out nor painted - with thousands of rows
   every change of the page would otherwise lay out all of them. Their last
   height is kept. Menus, dialogs and popups of a row are teleported to the
   page, since a row clips what reaches outside it. */
.rows > :deep(.object-row) {
  content-visibility: auto;
  contain-intrinsic-size: auto 120px;
}

.empty {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--text-color-secondary);
  text-align: center;
}

.empty i {
  font-size: 2rem;
}

/* Progress while the rows are still being drawn */
.rendering {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0.5rem 0 0;
  padding: 0.45rem 0.75rem;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  background: var(--surface-card, var(--surface-ground));
  border: 1px solid var(--surface-border);
  border-top: 2px solid var(--primary-color);
  border-radius: 6px;
}

.rendering .bar {
  flex: 1 1 auto;
  height: 4px;
  border-radius: 2px;
  background: var(--surface-border);
  overflow: hidden;
}

.rendering .bar span {
  display: block;
  height: 100%;
  background: var(--primary-color);
  transition: width 0.2s ease-out;
}
</style>
