<script setup lang="ts">
/**
 * PrimarySidebar - Left resizable sidebar
 *
 * Contains panels like Explorer, Search, etc.
 * Supports drag & drop for panel repositioning.
 * When minimized, shows a collapsed bar with panel icons.
 */

import { computed } from 'tsm:vue'
import { useLayoutState } from '../composables/useLayoutState'
import { usePanelDragDrop } from '../composables/usePanelDragDrop'

const layout = useLayoutState()
const dragDrop = usePanelDragDrop()

const visible = computed(() => layout.state.visibility.primarySidebar)
const width = computed(() => layout.state.dimensions.primarySidebarWidth)
const activePanel = computed(() => layout.activePrimaryPanel.value)
const panels = computed(() => layout.primaryPanels.value)

// Show minimized bar when sidebar is hidden but has panels
const showMinimized = computed(() => !visible.value && panels.value.length > 0)

// Show empty drop zone when no panels at all
const showEmptyDropZone = computed(() => panels.value.length === 0)

// Drop zone state
const isDropTarget = computed(() => dragDrop.isDropTarget('primary'))
const canDrop = computed(() => dragDrop.canDropOn('primary'))

function handleTabClick(panelId: string) {
  layout.selectPanel(panelId, 'primary')
}

function handleMinimize() {
  layout.setPrimarySidebarVisible(false)
}

function handleExpand(panelId?: string) {
  if (panelId) {
    layout.selectPanel(panelId, 'primary')
  }
  layout.setPrimarySidebarVisible(true)
}

// Drag handlers
function onDragStart(event: DragEvent, panelId: string) {
  dragDrop.startDrag(event, panelId, 'primary')
}

function onDragEnd() {
  dragDrop.endDrag()
}

// Drop zone handlers
function onDragOver(event: DragEvent) {
  dragDrop.handleDragOver(event, 'primary')
}

function onDragEnter(event: DragEvent) {
  dragDrop.handleDragEnter(event, 'primary')
}

function onDragLeave(event: DragEvent) {
  dragDrop.handleDragLeave(event, 'primary')
}

function onDrop(event: DragEvent) {
  dragDrop.handleDrop(event, 'primary')
}
</script>

<template>
  <!-- Minimized sidebar (collapsed tab bar) -->
  <div
    v-if="showMinimized"
    class="primary-sidebar-minimized"
    :class="{ 'drop-target': isDropTarget, 'can-drop': canDrop }"
    @dragover="onDragOver"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <button
      v-for="panel in panels"
      :key="panel.id"
      class="minimized-tab"
      :class="{ active: activePanel?.id === panel.id }"
      :title="panel.title"
      @click="handleExpand(panel.id)"
    >
      <i v-if="panel.icon" :class="panel.icon"></i>
      <span v-else class="tab-letter">{{ panel.title.charAt(0) }}</span>
      <span v-if="panel.badge" class="badge">{{ panel.badge }}</span>
    </button>
  </div>

  <!-- Expanded sidebar -->
  <div
    v-else-if="visible"
    class="primary-sidebar"
    :class="{ 'drop-target': isDropTarget, 'can-drop': canDrop }"
    :style="{ width: `${width}px` }"
    @dragover="onDragOver"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Panel tabs (if multiple panels) -->
    <div v-if="panels.length > 1" class="sidebar-tabs">
      <button
        v-for="panel in panels"
        :key="panel.id"
        class="sidebar-tab"
        :class="{ active: activePanel?.id === panel.id }"
        draggable="true"
        @click="handleTabClick(panel.id)"
        @dragstart="onDragStart($event, panel.id)"
        @dragend="onDragEnd"
      >
        <i v-if="panel.icon" :class="panel.icon"></i>
        <span>{{ panel.title }}</span>
        <span v-if="panel.badge" class="badge">{{ panel.badge }}</span>
      </button>
      <button class="minimize-btn" title="Minimize" @click="handleMinimize">
        <i class="pi pi-chevron-left"></i>
      </button>
    </div>

    <!-- Panel header (if single panel) - also draggable -->
    <div
      v-else-if="activePanel"
      class="sidebar-header"
      draggable="true"
      @dragstart="onDragStart($event, activePanel.id)"
      @dragend="onDragEnd"
    >
      <i class="pi pi-arrows-alt drag-handle" title="Drag to move panel"></i>
      <span class="sidebar-title">{{ activePanel.title }}</span>
      <button class="minimize-btn" title="Minimize" @click.stop="handleMinimize">
        <i class="pi pi-chevron-left"></i>
      </button>
    </div>

    <!-- Panel content -->
    <div class="sidebar-content">
      <component
        v-if="activePanel"
        :is="activePanel.component"
        :key="activePanel.id"
      />
      <div v-else class="empty-sidebar">
        <span>No panels</span>
      </div>
    </div>

    <!-- Drop indicator -->
    <div v-if="isDropTarget" class="drop-indicator">
      <i class="pi pi-arrow-down"></i>
      <span>Drop here</span>
    </div>
  </div>

  <!-- Empty drop zone (when no panels) -->
  <div
    v-else-if="showEmptyDropZone"
    class="primary-sidebar-empty"
    :class="{ 'drop-target': isDropTarget, 'can-drop': canDrop }"
    @dragover="onDragOver"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div v-if="isDropTarget" class="drop-indicator-small">
      <i class="pi pi-plus"></i>
    </div>
  </div>
</template>

<style scoped>
/* Minimized sidebar */
.primary-sidebar-minimized {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 8px 5px;
  height: 100%;
  background: var(--surface-section);
  border-right: 1px solid var(--surface-border);
  transition: border-color 0.2s ease;
}

.primary-sidebar-minimized.can-drop {
  border-color: var(--primary-color);
  border-style: dashed;
}

.primary-sidebar-minimized.drop-target {
  border-color: var(--primary-color);
  border-width: 2px;
  background: color-mix(in srgb, var(--primary-color) 10%, var(--surface-section));
}

.minimized-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.minimized-tab:hover {
  color: var(--text-color);
  background: var(--surface-hover);
}

.minimized-tab.active {
  color: var(--primary-color);
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
}

.minimized-tab i {
  font-size: 1.125rem;
}

.tab-letter {
  font-size: 0.875rem;
  font-weight: 700;
  text-transform: uppercase;
}

/* Expanded sidebar */
.primary-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 170px;
  max-width: 500px;
  background: var(--surface-ground);
  border-right: 1px solid var(--surface-border);
  position: relative;
  transition: border-color 0.2s ease;
}

.primary-sidebar.can-drop {
  border-color: var(--primary-color);
  border-style: dashed;
}

.primary-sidebar.drop-target {
  border-color: var(--primary-color);
  border-width: 2px;
  background: color-mix(in srgb, var(--primary-color) 5%, var(--surface-ground));
}

.sidebar-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-section);
  overflow-x: auto;
  align-items: center;
}

.sidebar-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  cursor: grab;
  white-space: nowrap;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.sidebar-tab:active {
  cursor: grabbing;
}

.sidebar-tab:hover {
  color: var(--text-color);
  background: var(--surface-hover);
}

.sidebar-tab.active {
  color: var(--primary-color);
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
}

.sidebar-tab i {
  font-size: 1rem;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 5px;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-section);
  cursor: grab;
}

.sidebar-header:active {
  cursor: grabbing;
}

.drag-handle {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  opacity: 0.5;
  transition: opacity 0.15s ease;
}

.sidebar-header:hover .drag-handle {
  opacity: 1;
}

.sidebar-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--primary-color);
  flex: 1;
}

.minimize-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
  flex-shrink: 0;
  margin-left: auto;
}

.minimize-btn:hover {
  color: var(--text-color);
  background: var(--surface-hover);
  border-color: var(--surface-border);
}

.sidebar-content {
  flex: 1;
  overflow: auto;
  background: var(--surface-card);
}

.empty-sidebar {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.drop-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 24px;
  background: var(--primary-color);
  color: var(--primary-color-text);
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  pointer-events: none;
  z-index: 100;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.9; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
}

/* Empty drop zone */
.primary-sidebar-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: var(--surface-section);
  border-right: 1px dashed var(--surface-border);
  transition: all 0.2s ease;
}

.primary-sidebar-empty.can-drop {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 5%, var(--surface-section));
}

.primary-sidebar-empty.drop-target {
  border-color: var(--primary-color);
  border-width: 2px;
  background: color-mix(in srgb, var(--primary-color) 15%, var(--surface-section));
}

.drop-indicator-small {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--primary-color);
  color: var(--primary-color-text);
  border-radius: 50%;
  font-size: 0.75rem;
  animation: pulse-small 1s ease-in-out infinite;
}

@keyframes pulse-small {
  0%, 100% { opacity: 0.9; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.1); }
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

.minimized-tab {
  position: relative;
}

.minimized-tab .badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 0.625rem;
  line-height: 16px;
}
</style>
