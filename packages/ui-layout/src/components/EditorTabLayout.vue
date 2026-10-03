<script lang="ts">
/**
 * The surface of one editor tab: three panes with splitters between them.
 *
 * A tab is not a window inside the frame but a surface with its own division.
 * What belongs to the open file - its tree, its properties, its model browser -
 * lives here, inside the tab, and nowhere else. That is what keeps one tab's
 * content from ever showing up in another: there is no shared zone to switch.
 *
 * Sizes are remembered per **view** (all instance tabs share one division, all
 * metamodel tabs another), not per tab. A tab is opened and closed often; the
 * way somebody likes a view divided is not.
 *
 * Knows neither files nor contexts. It takes three slots and keeps three widths.
 */
import { reactive } from 'tsm:vue'

interface PaneSizes {
  left: number
  right: number
  leftOpen: boolean
  rightOpen: boolean
}

const STORAGE_PREFIX = 'gene.editorTabLayout.'
const MIN_PANE = 160

/** One division per view, shared by every tab of that view */
const sizesByView = reactive<Record<string, PaneSizes>>({})

function loadSizes(viewId: string, defaults: PaneSizes): PaneSizes {
  if (!sizesByView[viewId]) {
    let stored: Partial<PaneSizes> = {}
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + viewId)
      if (raw) stored = JSON.parse(raw)
    } catch {
      // Storage may be unavailable or blocked; the defaults do fine
    }
    sizesByView[viewId] = { ...defaults, ...stored }
  }
  return sizesByView[viewId]!
}

function persistSizes(viewId: string): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + viewId, JSON.stringify(sizesByView[viewId]))
  } catch {
    // Not being able to remember the division is no reason to fail
  }
}
</script>

<script setup lang="ts">
import { computed, ref, useSlots, onBeforeUnmount } from 'tsm:vue'

const props = withDefaults(defineProps<{
  /** Which view this is - sizes are remembered per view, not per tab */
  viewId: string
  leftTitle?: string
  rightTitle?: string
  defaultLeft?: number
  defaultRight?: number
}>(), {
  leftTitle: '',
  rightTitle: '',
  defaultLeft: 280,
  defaultRight: 300
})

const slots = useSlots()
const hasLeft = computed(() => !!slots.left)
const hasRight = computed(() => !!slots.right)

const sizes = loadSizes(props.viewId, {
  left: props.defaultLeft,
  right: props.defaultRight,
  leftOpen: true,
  rightOpen: true
})

function toggleLeft(): void {
  sizes.leftOpen = !sizes.leftOpen
  persistSizes(props.viewId)
}

function toggleRight(): void {
  sizes.rightOpen = !sizes.rightOpen
  persistSizes(props.viewId)
}

// ── Splitters ────────────────────────────────────────────────────────────
const dragging = ref(false)
let dragSide: 'left' | 'right' = 'left'
let dragStartX = 0
let dragStartSize = 0

function startDrag(side: 'left' | 'right', event: MouseEvent): void {
  dragging.value = true
  dragSide = side
  dragStartX = event.clientX
  dragStartSize = side === 'left' ? sizes.left : sizes.right
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', endDrag)
  event.preventDefault()
}

function onDrag(event: MouseEvent): void {
  if (!dragging.value) return
  const dx = event.clientX - dragStartX
  // The right pane grows when the splitter moves left
  const next = dragSide === 'left' ? dragStartSize + dx : dragStartSize - dx
  const clamped = Math.max(MIN_PANE, next)
  if (dragSide === 'left') sizes.left = clamped
  else sizes.right = clamped
}

function endDrag(): void {
  if (!dragging.value) return
  dragging.value = false
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', endDrag)
  persistSizes(props.viewId)
}

onBeforeUnmount(endDrag)
</script>

<template>
  <div class="editor-tab-layout" :class="{ dragging }">
    <aside
      v-if="hasLeft"
      class="pane pane-left"
      :class="{ collapsed: !sizes.leftOpen }"
      :style="sizes.leftOpen ? { width: sizes.left + 'px' } : undefined"
    >
      <header class="pane-header">
        <span v-if="sizes.leftOpen" class="pane-title">{{ leftTitle }}</span>
        <button
          class="pane-toggle"
          :title="sizes.leftOpen ? 'Einklappen' : leftTitle || 'Ausklappen'"
          @click="toggleLeft"
        >
          <i :class="sizes.leftOpen ? 'pi pi-angle-left' : 'pi pi-angle-right'"></i>
        </button>
      </header>
      <div v-if="sizes.leftOpen" class="pane-body">
        <slot name="left"></slot>
      </div>
      <span v-else class="pane-title-vertical">{{ leftTitle }}</span>
    </aside>

    <div
      v-if="hasLeft && sizes.leftOpen"
      class="splitter"
      @mousedown="startDrag('left', $event)"
    ></div>

    <section class="pane pane-center">
      <div class="pane-body">
        <slot name="center"></slot>
      </div>
    </section>

    <div
      v-if="hasRight && sizes.rightOpen"
      class="splitter"
      @mousedown="startDrag('right', $event)"
    ></div>

    <aside
      v-if="hasRight"
      class="pane pane-right"
      :class="{ collapsed: !sizes.rightOpen }"
      :style="sizes.rightOpen ? { width: sizes.right + 'px' } : undefined"
    >
      <header class="pane-header">
        <button
          class="pane-toggle"
          :title="sizes.rightOpen ? 'Einklappen' : rightTitle || 'Ausklappen'"
          @click="toggleRight"
        >
          <i :class="sizes.rightOpen ? 'pi pi-angle-right' : 'pi pi-angle-left'"></i>
        </button>
        <span v-if="sizes.rightOpen" class="pane-title">{{ rightTitle }}</span>
      </header>
      <div v-if="sizes.rightOpen" class="pane-body">
        <slot name="right"></slot>
      </div>
      <span v-else class="pane-title-vertical">{{ rightTitle }}</span>
    </aside>
  </div>
</template>

<style scoped>
.editor-tab-layout {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-ground);
}

.editor-tab-layout.dragging {
  user-select: none;
  cursor: col-resize;
}

.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-card);
}

.pane-left,
.pane-right {
  flex-shrink: 0;
}

.pane-center {
  flex: 1;
  min-width: 200px;
}

.pane.collapsed {
  width: 28px;
  align-items: center;
}

.pane-header {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 4px 0 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-section);
}

.pane.collapsed .pane-header {
  padding: 0;
  justify-content: center;
  width: 100%;
}

.pane-title {
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--primary-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pane-right .pane-title {
  text-align: right;
}

.pane-title-vertical {
  margin-top: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-color-secondary);
  writing-mode: vertical-rl;
  white-space: nowrap;
}

.pane-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
}

.pane-toggle:hover {
  background: var(--surface-hover);
  color: var(--text-color);
}

.pane-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.splitter {
  width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  background: var(--surface-border);
  transition: background 0.15s ease;
}

.splitter:hover,
.dragging .splitter {
  background: var(--primary-color);
}
</style>
