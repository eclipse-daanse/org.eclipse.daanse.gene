<script setup lang="ts">
/**
 * PanelArea - Bottom resizable panel area
 *
 * Contains tabs for Terminal, Output, Problems, etc.
 * Supports drag & drop for moving panels into/out of the bottom panel.
 */

import { computed } from 'tsm:vue'
import { useLayoutState } from '../composables/useLayoutState'
import { usePanelDragDrop } from '../composables/usePanelDragDrop'
import type { PanelTab } from '../types'

const layout = useLayoutState()
const dragDrop = usePanelDragDrop()

const visible = computed(() => layout.state.visibility.panelArea)
const height = computed(() => layout.state.dimensions.panelAreaHeight)
const tabs = computed(() => layout.state.panelTabs)
const activeTab = computed(() => layout.activePanelTab.value)

// Drop zone state
const isDropTarget = computed(() => dragDrop.isDropTarget('bottom'))
const canDrop = computed(() => dragDrop.canDropOn('bottom'))

// Show empty drop zone when minimized or no tabs
const showEmptyDropZone = computed(() => !visible.value || tabs.value.length === 0)

function handleTabClick(tab: PanelTab) {
  layout.selectPanelTab(tab.id)
}

function handleClose() {
  layout.setPanelAreaVisible(false)
}

function handleMaximize() {
  // Toggle between normal and maximized
  const maxHeight = layout.state.dimensions.panelAreaMaxHeight
  const currentHeight = layout.state.dimensions.panelAreaHeight
  if (currentHeight >= maxHeight - 10) {
    layout.setPanelAreaHeight(200)
  } else {
    layout.setPanelAreaHeight(maxHeight)
  }
}

// Drag handlers
function onDragStart(event: DragEvent, tabId: string) {
  dragDrop.startDrag(event, tabId, 'bottom')
}

function onDragEnd() {
  dragDrop.endDrag()
}

// Drop zone handlers
function onDragOver(event: DragEvent) {
  dragDrop.handleDragOver(event, 'bottom')
}

function onDragEnter(event: DragEvent) {
  dragDrop.handleDragEnter(event, 'bottom')
}

function onDragLeave(event: DragEvent) {
  dragDrop.handleDragLeave(event, 'bottom')
}

function onDrop(event: DragEvent) {
  dragDrop.handleDrop(event, 'bottom')
}
</script>

<template>
  <div
    v-if="visible && tabs.length > 0"
    class="panel-area"
    :class="{ 'drop-target': isDropTarget, 'can-drop': canDrop }"
    :style="{ height: `${height}px` }"
    @dragover="onDragOver"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Header with tabs -->
    <div class="panel-header">
      <div class="panel-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="panel-tab"
          :class="{ active: activeTab?.id === tab.id }"
          draggable="true"
          @click="handleTabClick(tab)"
          @dragstart="onDragStart($event, tab.id)"
          @dragend="onDragEnd"
        >
          <i v-if="tab.icon" :class="tab.icon"></i>
          <span>{{ tab.title }}</span>
          <span v-if="tab.badge" class="badge">{{ tab.badge }}</span>
        </button>
      </div>

      <div class="panel-actions">
        <button class="action-btn" title="Maximize" @click="handleMaximize">
          <i class="pi pi-window-maximize"></i>
        </button>
        <button class="action-btn" title="Close" @click="handleClose">
          <i class="pi pi-times"></i>
        </button>
      </div>
    </div>

    <!-- Panel content -->
    <div class="panel-content">
      <component
        v-if="activeTab"
        :is="activeTab.component"
        v-bind="activeTab.props"
        :key="activeTab.id"
      />
    </div>

    <!-- Drop indicator -->
    <div v-if="isDropTarget" class="drop-indicator">
      <i class="pi pi-arrow-down"></i>
      <span>Drop here</span>
    </div>
  </div>

  <!-- Empty/minimized drop zone -->
  <div
    v-else-if="showEmptyDropZone"
    class="panel-area-empty"
    :class="{ 'drop-target': isDropTarget, 'can-drop': canDrop }"
    @dragover="onDragOver"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <span class="empty-label">Panel</span>
    <div v-if="isDropTarget" class="drop-indicator-inline">
      <i class="pi pi-plus"></i>
      <span>Drop here</span>
    </div>
  </div>
</template>

<style scoped>
.panel-area {
  display: flex;
  flex-direction: column;
  min-height: 100px;
  max-height: 600px;
  background: var(--surface-ground);
  border-top: 2px solid var(--primary-color);
  position: relative;
  transition: border-color 0.2s ease;
}

.panel-area.can-drop {
  border-color: var(--primary-color);
  border-style: dashed;
}

.panel-area.drop-target {
  border-width: 3px;
  background: color-mix(in srgb, var(--primary-color) 5%, var(--surface-ground));
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  min-height: 40px;
  padding: 0 12px;
  background: var(--surface-section);
  border-bottom: 1px solid var(--surface-border);
}

.panel-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 100%;
  overflow-x: auto;
}

.panel-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 14px;
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

.panel-tab:active {
  cursor: grabbing;
}

.panel-tab:hover {
  color: var(--text-color);
  background: var(--surface-hover);
}

.panel-tab.active {
  color: var(--primary-color);
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
}

.panel-tab i {
  font-size: 1rem;
}

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

.panel-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-btn {
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
}

.action-btn:hover {
  color: var(--text-color);
  background: var(--surface-hover);
  border-color: var(--surface-border);
}

.action-btn i {
  font-size: 0.875rem;
}

.panel-content {
  flex: 1;
  overflow: auto;
  background: var(--surface-card);
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

/* Empty/minimized drop zone */
.panel-area-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  background: var(--surface-section);
  border-top: 1px dashed var(--surface-border);
  transition: all 0.2s ease;
}

.panel-area-empty .empty-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-color-secondary);
  opacity: 0.5;
}

.panel-area-empty.can-drop {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 5%, var(--surface-section));
}

.panel-area-empty.can-drop .empty-label {
  opacity: 0;
}

.panel-area-empty.drop-target {
  border-color: var(--primary-color);
  border-width: 2px;
  background: color-mix(in srgb, var(--primary-color) 15%, var(--surface-section));
}

.drop-indicator-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: var(--primary-color);
  color: var(--primary-color-text);
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  animation: pulse-inline 1s ease-in-out infinite;
}

@keyframes pulse-inline {
  0%, 100% { opacity: 0.9; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}
</style>
