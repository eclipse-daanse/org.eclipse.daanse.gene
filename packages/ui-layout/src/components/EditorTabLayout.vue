<script lang="ts">
/**
 * The surface of one editor tab: three panes with splitters between them.
 *
 * A tab is not a window inside the frame but a surface with its own division.
 * What belongs to the open file - its tree, its properties, its model browser -
 * lives here, inside the tab, and nowhere else. That is what keeps one tab's
 * content from ever showing up in another: there is no shared zone to switch.
 *
 * A side pane can be **docked** into a zone of the frame - the tree to the
 * lower left, the browser to the right. The zone is the frame's; the content
 * stays the tab's: it is rendered there by Teleport, so it keeps the tab's
 * context and leaves with the tab. Whether a pane is docked is remembered per
 * view, like the sizes.
 *
 * Knows neither files nor contexts. It takes three slots and keeps three widths.
 */
import { reactive } from 'tsm:vue'

interface PaneSizes {
  left: number
  right: number
  leftOpen: boolean
  rightOpen: boolean
  leftDocked: boolean
  rightDocked: boolean
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
import { computed, ref, useSlots, watch, onBeforeUnmount } from 'tsm:vue'
import { useLayoutState } from '../composables/useLayoutState'
import type { DockZone } from '../types'

const props = withDefaults(defineProps<{
  /** Which view this is - sizes and docking are remembered per view, not per tab */
  viewId: string
  leftTitle?: string
  leftIcon?: string
  rightTitle?: string
  rightIcon?: string
  defaultLeft?: number
  defaultRight?: number
  /** The frame zone the left pane may dock into; without one it cannot dock */
  leftDock?: DockZone
  /** The frame zone the right pane may dock into */
  rightDock?: DockZone
}>(), {
  leftTitle: '',
  leftIcon: '',
  rightTitle: '',
  rightIcon: '',
  defaultLeft: 280,
  defaultRight: 300,
  leftDock: undefined,
  rightDock: undefined
})

const slots = useSlots()
const hasLeft = computed(() => !!slots.left)
const hasRight = computed(() => !!slots.right)

const layout = useLayoutState()

const sizes = loadSizes(props.viewId, {
  left: props.defaultLeft,
  right: props.defaultRight,
  leftOpen: true,
  rightOpen: true,
  // Docked by default where a zone is offered - the familiar picture
  leftDocked: !!props.leftDock,
  rightDocked: !!props.rightDock
})

function toggleLeft(): void {
  sizes.leftOpen = !sizes.leftOpen
  persistSizes(props.viewId)
}

function toggleRight(): void {
  sizes.rightOpen = !sizes.rightOpen
  persistSizes(props.viewId)
}

// ── Docking ──────────────────────────────────────────────────────────────
const leftDocked = computed(() => hasLeft.value && !!props.leftDock && sizes.leftDocked)
const rightDocked = computed(() => hasRight.value && !!props.rightDock && sizes.rightDocked)

/** Where the frame wants docked content - null while the zone is not shown */
const leftTarget = computed(() => (props.leftDock ? layout.dockHost(props.leftDock) : null))
const rightTarget = computed(() => (props.rightDock ? layout.dockHost(props.rightDock) : null))

/*
 * Docked only counts while the frame offers a host. With the sidebar minimized
 * there is no zone, and a pane that is "docked" would be nowhere at all - so it
 * comes back into the tab until the zone is there again.
 */
const leftTeleported = computed(() => leftDocked.value && !!leftTarget.value)
const rightTeleported = computed(() => rightDocked.value && !!rightTarget.value)
const leftInTab = computed(() => hasLeft.value && !leftTeleported.value)
const rightInTab = computed(() => hasRight.value && !rightTeleported.value)

function dockLeft(docked: boolean): void {
  sizes.leftDocked = docked
  persistSizes(props.viewId)
}

function dockRight(docked: boolean): void {
  sizes.rightDocked = docked
  persistSizes(props.viewId)
}

/*
 * Tell the frame when a pane is docked and when it is taken back. Only the tab
 * in front is mounted, so there is no one else to argue with about the zone.
 */
watch(leftDocked, (docked) => {
  if (!props.leftDock) return
  if (docked) layout.dock(props.leftDock, { title: props.leftTitle, icon: props.leftIcon || undefined, undock: () => dockLeft(false) })
  else layout.undock(props.leftDock)
}, { immediate: true })

watch(rightDocked, (docked) => {
  if (!props.rightDock) return
  if (docked) layout.dock(props.rightDock, { title: props.rightTitle, icon: props.rightIcon || undefined, undock: () => dockRight(false) })
  else layout.undock(props.rightDock)
}, { immediate: true })

onBeforeUnmount(() => {
  if (props.leftDock && leftDocked.value) layout.undock(props.leftDock)
  if (props.rightDock && rightDocked.value) layout.undock(props.rightDock)
})

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
    <!-- Left pane, docked: rendered into the frame's zone, still this tab's -->
    <Teleport v-if="leftTeleported" :to="leftTarget!">
      <slot name="left"></slot>
    </Teleport>

    <aside
      v-if="leftInTab"
      class="pane pane-left"
      :class="{ collapsed: !sizes.leftOpen }"
      :style="sizes.leftOpen ? { width: sizes.left + 'px' } : undefined"
    >
      <header class="pane-header">
        <span v-if="sizes.leftOpen" class="pane-title">{{ leftTitle }}</span>
        <button
          v-if="sizes.leftOpen && leftDock && !leftDocked"
          class="pane-toggle"
          title="Links unten andocken"
          @click="dockLeft(true)"
        >
          <i class="pi pi-arrow-down-left"></i>
        </button>
        <button
          v-if="sizes.leftOpen && leftDocked"
          class="pane-toggle"
          title="Im Tab behalten"
          @click="dockLeft(false)"
        >
          <i class="pi pi-thumbtack"></i>
        </button>
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
      v-if="leftInTab && sizes.leftOpen"
      class="splitter"
      @mousedown="startDrag('left', $event)"
    ></div>

    <section class="pane pane-center">
      <div class="pane-body">
        <slot name="center"></slot>
      </div>
    </section>

    <div
      v-if="rightInTab && sizes.rightOpen"
      class="splitter"
      @mousedown="startDrag('right', $event)"
    ></div>

    <aside
      v-if="rightInTab"
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
        <button
          v-if="sizes.rightOpen && rightDock && !rightDocked"
          class="pane-toggle"
          title="Rechts andocken"
          @click="dockRight(true)"
        >
          <i class="pi pi-arrow-up-right"></i>
        </button>
        <button
          v-if="sizes.rightOpen && rightDocked"
          class="pane-toggle"
          title="Im Tab behalten"
          @click="dockRight(false)"
        >
          <i class="pi pi-thumbtack"></i>
        </button>
        <span v-if="sizes.rightOpen" class="pane-title">{{ rightTitle }}</span>
      </header>
      <div v-if="sizes.rightOpen" class="pane-body">
        <slot name="right"></slot>
      </div>
      <span v-else class="pane-title-vertical">{{ rightTitle }}</span>
    </aside>

    <!-- Right pane, docked -->
    <Teleport v-if="rightTeleported" :to="rightTarget!">
      <slot name="right"></slot>
    </Teleport>
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
