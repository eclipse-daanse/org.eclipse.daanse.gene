<script setup lang="ts">
/**
 * EditorTabs - Tab bar for the editor area
 *
 * Displays tabs for open editors with close buttons.
 * Tabs are draggable and can be moved to sidebars or bottom panel.
 */

import { computed } from 'tsm:vue'
import { useLayoutState } from '../composables/useLayoutState'
import { usePanelDragDrop } from '../composables/usePanelDragDrop'
import type { EditorTab } from '../types'

const layout = useLayoutState()
const dragDrop = usePanelDragDrop()

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

// Drag handlers
function onDragStart(event: DragEvent, tabId: string) {
  dragDrop.startDrag(event, tabId, 'editor')
}

function onDragEnd() {
  dragDrop.endDrag()
}
</script>

<template>
  <div class="editor-tabs" v-if="tabs.length > 0">
    <!-- Multiple tabs: show tab bar -->
    <div v-if="tabs.length > 1" class="tabs-container">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="editor-tab"
        :class="{
          active: activeId === tab.id,
          dirty: tab.dirty,
          pinned: tab.pinned
        }"
        draggable="true"
        @click="handleTabClick(tab)"
        @mousedown="handleMiddleClick($event, tab)"
        @dragstart="onDragStart($event, tab.id)"
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

    <!-- Single tab: show header style -->
    <div
      v-else
      class="editor-header"
      draggable="true"
      @dragstart="onDragStart($event, tabs[0].id)"
      @dragend="onDragEnd"
    >
      <i class="pi pi-arrows-alt drag-handle" title="Drag to move"></i>
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

.tabs-container {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 100%;
  overflow-x: auto;
  scrollbar-width: thin;
  padding: 4px 0;
}

.tabs-container::-webkit-scrollbar {
  height: 4px;
}

.tabs-container::-webkit-scrollbar-thumb {
  background: var(--surface-border);
  border-radius: 2px;
}

.editor-tab {
  display: flex;
  align-items: center;
  gap: 8px;
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

.drag-handle {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  opacity: 0.5;
  transition: opacity 0.15s ease;
}

.editor-header:hover .drag-handle {
  opacity: 1;
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
