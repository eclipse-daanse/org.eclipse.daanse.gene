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
import { computed, nextTick, reactive, ref, shallowRef, toRaw, watch } from 'tsm:vue'
import ContextObjectRow from './ContextObjectRow.vue'
import { contextRows, displayName, isInside, parentOf, pathTo, siblingOf, visibleRows } from '../composables/contextView'
import { className } from '../composables/documentation'

const props = defineProps<{ context: any }>()

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
const shownRows = computed(() => visibleRows(rows.value, collapsed))
/** Context line plus one slot per level, plus one for the deepest row's toggle */
const gutter = computed(() => rows.value.reduce((m, r) => Math.max(m, r.depth), 0) + 2)

const hierarchy = computed(() => (contextObject.value ? [...pathTo(contextObject.value), contextObject.value] : []))
const up = computed(() => (contextObject.value ? parentOf(contextObject.value) : null))
const back = computed(() => (contextObject.value ? siblingOf(contextObject.value, -1) : null))
const forward = computed(() => (contextObject.value ? siblingOf(contextObject.value, 1) : null))
const canSetContext = computed(() => !!selected.value && selected.value !== contextObject.value)

function label(o: any): string {
  return `${className(o)} ${displayName(o)}`
}

function setContext(o: any): void {
  if (!o) return
  contextObject.value = toRaw(o)
  collapsed.clear()
}

function select(o: any): void {
  if (o) props.context.selectObject?.(toRaw(o))
}

function toggle(o: any): void {
  if (collapsed.has(o)) collapsed.delete(o)
  else collapsed.add(o)
}

/** The row that shows o: its own, or the nearest ancestor's (a column shows in its table) */
function rowObjectFor(o: any): any | null {
  const own = new Set(rows.value.map(r => r.object))
  for (let p = o; p; p = parentOf(p)) if (own.has(p)) return p
  return null
}

const selectedRowObject = computed(() => (selected.value ? rowObjectFor(selected.value) : null))

watch(selected, async (o) => {
  if (!o) return
  // Flow breadcrumb: most recent last, no duplicates
  visited.value = [...visited.value.filter(v => v !== o), o].slice(-FLOW_LENGTH)
  if (!contextObject.value || (o !== contextObject.value && !isInside(o, contextObject.value))) {
    setContext(parentOf(o) ?? o)
  }
  // Rows of collapsed ancestors would hide the selection
  for (const a of pathTo(o)) collapsed.delete(a)
  await nextTick()
  const target = selectedRowObject.value
  const index = target ? shownRows.value.findIndex(r => r.object === target) : -1
  if (index >= 0) {
    const el = rootEl.value?.querySelector(`[data-testid="cwm.Editor.ContextView.ObjectRow@${shownRows.value[index]!.slug}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }
}, { immediate: true })
</script>

<template>
  <div ref="rootEl" class="context-view" data-testid="cwm.Editor.ContextView">
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
    </div>

    <div v-if="!contextObject" class="empty">
      <i class="pi pi-sitemap"></i>
      <p>Ein Element im Baum wählen — die Ansicht zeigt dann alles in seiner Umgebung.</p>
    </div>
    <div v-else-if="rows.length === 0" class="empty">
      <i class="pi pi-info-circle"></i>
      <p>Unter {{ label(contextObject) }} liegt nichts.</p>
    </div>
    <div v-else class="rows">
      <ContextObjectRow
        v-for="row in shownRows"
        :key="row.key"
        :row="row"
        :context="contextObject"
        :gutter="gutter"
        :expanded="!collapsed.has(row.object)"
        :selected="row.object === selectedRowObject"
        :version="version"
        @toggle="toggle(row.object)"
        @select="select"
      />
    </div>
  </div>
</template>

<style scoped>
.context-view {
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
  padding: 0 0.75rem 2rem 0.25rem;
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
</style>
