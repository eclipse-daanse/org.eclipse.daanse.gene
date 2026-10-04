<script setup lang="ts">
/**
 * EditorTabs - Tab bar for the editor area
 *
 * Displays tabs for open editors with close buttons.
 *
 * A tab is a surface of its own, not a panel: it can be reordered within the
 * strip, and that is all dragging does. It used to go through the panel drag
 * and drop, which made the sidebars drop targets - a tab could be dropped
 * into the tree, where it has no place.
 */

import { computed, ref } from 'tsm:vue'
import { useLayoutState } from '../composables/useLayoutState'
import type { EditorTab } from '../types'

const layout = useLayoutState()

const tabs = computed(() => layout.state.editorTabs)
const activeId = computed(() => layout.state.activeEditorTabId)

function handleTabClick(tab: EditorTab) {
  layout.selectEditor(tab.id)
}

function handleClose(event: Event, tab: EditorTab) {
  event.stopPropagation()
  layout.closeEditor(tab.id)
}

function handleMiddleClick(event: MouseEvent, tab: EditorTab) {
  if (event.button === 1) {
    event.preventDefault()
    layout.closeEditor(tab.id)
  }
}

// ── Reordering by drag ───────────────────────────────────────────────────
const draggedId = ref<string | null>(null)
/** Where the dragged tab would land: the index of the tab it is held over, and which side */
const dropAt = ref<{ index: number; after: boolean } | null>(null)

function onDragStart(event: DragEvent, tabId: string) {
  draggedId.value = tabId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    // Its own type: the sidebars only take panels and ignore this
    event.dataTransfer.setData('application/x-editor-tab', tabId)
  }
}

function onDragOver(event: DragEvent, index: number) {
  if (!draggedId.value) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  dropAt.value = { index, after: event.clientX > rect.left + rect.width / 2 }
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  const id = draggedId.value
  const at = dropAt.value
  if (id && at) {
    const from = tabs.value.findIndex(t => t.id === id)
    let to = at.after ? at.index + 1 : at.index
    // The strip without the dragged tab
    if (from < to) to -= 1
    if (to !== from) layout.moveEditorTab(id, to)
  }
  onDragEnd()
}

function onDragEnd() {
  draggedId.value = null
  dropAt.value = null
}

function dropClass(index: number): Record<string, boolean> {
  const at = dropAt.value
  const hit = !!at && at.index === index && draggedId.value !== tabs.value[index]?.id
  return { 'drop-before': hit && !at!.after, 'drop-after': hit && at!.after }
}

/** The wheel scrolls the strip sideways - there is no vertical overflow to take it. */
function scrollSideways(event: WheelEvent): void {
  const strip = event.currentTarget as HTMLElement | null
  if (!strip || event.shiftKey || !event.deltaY) return
  strip.scrollLeft += event.deltaY
}
</script>

<template>
  <div class="editor-tabs" v-if="tabs.length > 0">
    <!-- Multiple tabs: show tab bar -->
    <div
      v-if="tabs.length > 1"
      class="tabs-container"
      @wheel.passive="scrollSideways"
      @dragover.prevent
      @drop="onDrop"
      @dragleave.self="dropAt = null"
    >
      <div
        v-for="(tab, index) in tabs"
        :key="tab.id"
        class="editor-tab"
        :class="{
          active: activeId === tab.id,
          dirty: tab.dirty,
          pinned: tab.pinned,
          dragging: draggedId === tab.id,
          ...dropClass(index)
        }"
        draggable="true"
        @click="handleTabClick(tab)"
        @mousedown="handleMiddleClick($event, tab)"
        @dragstart="onDragStart($event, tab.id)"
        @dragover="onDragOver($event, index)"
        @dragend="onDragEnd"
      >
        <i v-if="tab.icon" :class="tab.icon" class="tab-icon"></i>
        <span class="tab-title">{{ tab.title }}</span>
        <span v-if="tab.badge" class="badge">{{ tab.badge }}</span>
        <span v-if="tab.dirty" class="dirty-indicator">●</span>
        <button
          v-if="tab.closable !== false && !tab.pinned"
          class="close-btn"
          title="Close"
          @click="handleClose($event, tab)"
        >
          <i class="pi pi-times"></i>
        </button>
      </div>
    </div>

    <!-- Single tab: show header style - nothing to reorder, so not draggable -->
    <div v-else class="editor-header">
      <i v-if="tabs[0].icon" :class="tabs[0].icon" class="header-icon"></i>
      <span class="editor-title">{{ tabs[0].title }}</span>
      <span v-if="tabs[0].badge" class="badge">{{ tabs[0].badge }}</span>
      <span v-if="tabs[0].dirty" class="dirty-indicator">●</span>
      <button
        v-if="tabs[0].closable !== false"
        class="close-btn visible"
        title="Close"
        @click="handleClose($event, tabs[0])"
      >
        <i class="pi pi-times"></i>
      </button>
    </div>
  </div>
</template>

<style scoped>
.editor-tabs {
  display: flex;
  align-items: center;
  height: 40px;
  min-height: 40px;
  padding: 0 8px;
  background: var(--surface-section);
  border-bottom: 1px solid var(--surface-border);
}

/*
 * The strip scrolls sideways, never up and down.
 *
 * `height: 100%` plus padding made it taller than its 40px row, and
 * `overflow-x: auto` alone lets the browser scroll the overflow vertically -
 * the tabs wobbled on the wheel. And as a flex child without `min-width: 0`
 * it grew with its tabs instead of scrolling, pushing everything to the right.
 */
.tabs-container {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  /* No vertical padding: with the 4px scrollbar the 32px tabs would be clipped */
  padding: 0;
  overflow-x: auto;
  overflow-y: hidden;
  /*
   * No scrollbar: a 10px bar would leave 29px for 32px tabs and clip them. The
   * strip scrolls sideways with the wheel instead (see scrollSideways).
   */
  scrollbar-width: none;
}

.tabs-container::-webkit-scrollbar {
  display: none;
}

.tabs-container::-webkit-scrollbar-thumb {
  background: var(--surface-border);
  border-radius: 2px;
}

/* Where the dragged tab would land */
.editor-tab.drop-before {
  box-shadow: inset 2px 0 0 var(--primary-color);
}
.editor-tab.drop-after {
  box-shadow: inset -2px 0 0 var(--primary-color);
}
.editor-tab.dragging {
  opacity: 0.4;
}

.editor-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  /* A tab keeps its width; the strip scrolls */
  flex-shrink: 0;
  height: 32px;
  padding: 0 14px;
  background: transparent;
  color: var(--text-color-secondary);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  cursor: grab;
  white-space: nowrap;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.editor-tab:active {
  cursor: grabbing;
}

.editor-tab:hover {
  color: var(--text-color);
  background: var(--surface-hover);
}

.editor-tab.active {
  color: var(--primary-color);
  background: var(--surface-card);
  border-color: var(--surface-border);
}

.tab-icon {
  font-size: 0.875rem;
  opacity: 0.8;
}

.tab-title {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dirty-indicator {
  color: var(--text-color-secondary);
  font-size: 0.625rem;
  margin-left: -4px;
}

.editor-tab.dirty .dirty-indicator {
  color: var(--primary-color);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 4px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.15s ease;
}

.editor-tab:hover .close-btn,
.editor-tab.active .close-btn {
  opacity: 1;
}

.close-btn:hover {
  color: var(--text-color);
  background: var(--surface-hover);
}

.editor-tab.active .close-btn:hover {
  background: var(--surface-hover);
  color: var(--primary-color);
}

.close-btn i {
  font-size: 0.6875rem;
}

/* Single tab header style (like sidebar-header) */
.editor-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  flex: 1;
  cursor: grab;
}

.editor-header:active {
  cursor: grabbing;
}


.header-icon {
  font-size: 0.875rem;
  color: var(--primary-color);
}

.editor-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--primary-color);
  flex: 1;
}

.editor-header .close-btn {
  opacity: 0;
}

.editor-header .close-btn.visible {
  opacity: 0.5;
}

.editor-header:hover .close-btn {
  opacity: 1;
}

/* Badge styles */
.badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  color: white;
  background: var(--red-500);
  border-radius: 9px;
}
</style>
