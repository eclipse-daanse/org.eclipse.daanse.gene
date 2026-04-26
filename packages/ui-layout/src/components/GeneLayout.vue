<script setup lang="ts">
/**
 * GeneLayout - Main VS Code-like layout container
 *
 * Provides the overall layout structure with:
 * - Activity Bar (left icons)
 * - Primary Sidebar (left, resizable)
 * - Editor Area (center)
 * - Secondary Sidebar (right, resizable)
 * - Panel Area (bottom, resizable)
 * - Status Bar (bottom)
 */

import '../theme.css'
import { computed, ref, onMounted, onUnmounted, inject } from 'tsm:vue'
import { Button } from 'tsm:primevue'
import { useLayoutState } from '../composables/useLayoutState'
import { usePanelKeyboardShortcuts } from '../composables/usePanelDragDrop'
import { useGlobalSettings } from '../composables/useGlobalSettings'
import { useEventBus } from '../composables/useEventBus'
import ActivityBar from './ActivityBar.vue'
import PrimarySidebar from './PrimarySidebar.vue'
import EditorArea from './EditorArea.vue'
import SecondarySidebar from './SecondarySidebar.vue'
import PanelArea from './PanelArea.vue'
import StatusBar from './StatusBar.vue'
import SettingsDialog from './SettingsDialog.vue'
import SaveInstancesDialog from './SaveInstancesDialog.vue'

const tsm = inject<any>('tsm')
const layout = useLayoutState()
const panelShortcuts = usePanelKeyboardShortcuts()
const workspaceState = tsm?.getService('ui.workspace.composables')?.useSharedWorkspace()
const fileSystem = tsm?.getService('ui.file-explorer.composables')?.useSharedFileSystem()
const perspective = tsm?.getService('ui.perspectives')?.useSharedPerspective()
const eventBus = useEventBus()

// Initialize global settings (theme, language, colors)
useGlobalSettings()

// Workspace settings dialog
const showWorkspaceSettings = ref(false)

// Save instances dialog
const showSaveInstances = ref(false)

// Check if we have a workspace open
const hasWorkspace = computed(() => !!perspective?.state?.workspacePath)

// Workspace name - prefer: workspace file path > active repo name > workspace name > file system root path
const workspaceName = computed(() => {
  // Try workspace file path first (e.g., "sören.wsp")
  if (perspective?.state?.workspacePath) {
    const fileName = perspective.state.workspacePath.split('/').pop()
    if (fileName) {
      return fileName
    }
  }

  // Try active repository name
  const activeRepo = workspaceState?.activeRepository?.value
  if (activeRepo?.name) {
    return activeRepo.name
  }

  // Then workspace name (if not default)
  const wsName = workspaceState?.workspace?.value?.name
  if (wsName && wsName !== 'Default Workspace') {
    return wsName
  }

  // Fallback to file system root path
  if (fileSystem?.rootPath?.value) {
    return fileSystem.rootPath.value
  }

  return 'Gene Workspace'
})

// Resize handling
const isResizingPrimary = ref(false)
const isResizingSecondary = ref(false)
const isResizingPanel = ref(false)

const mainAreaRef = ref<HTMLElement | null>(null)

// Computed styles - sidebars show minimized bar when collapsed or empty
const primarySidebarStyle = computed(() => {
  const hasPanels = layout.primaryPanels.value.length > 0
  if (!layout.state.visibility.primarySidebar || !hasPanels) {
    // Minimized or empty: show icon bar (48px) or drop zone (24px)
    return {
      width: hasPanels ? '48px' : '24px',
      display: 'flex'
    }
  }
  return {
    width: `${layout.state.dimensions.primarySidebarWidth}px`,
    display: 'flex'
  }
})

const secondarySidebarStyle = computed(() => {
  const hasPanels = layout.secondaryPanels.value.length > 0
  if (!layout.state.visibility.secondarySidebar || !hasPanels) {
    // Minimized or empty: show icon bar (48px) or drop zone (24px)
    return {
      width: hasPanels ? '48px' : '24px',
      display: 'flex'
    }
  }
  return {
    width: `${layout.state.dimensions.secondarySidebarWidth}px`,
    display: 'flex'
  }
})

// Panel area - show small drop zone even when empty
const panelAreaStyle = computed(() => {
  const hasTabs = layout.state.panelTabs.length > 0
  if (!layout.state.visibility.panelArea || !hasTabs) {
    // Hidden or empty: show thin drop zone (24px)
    return {
      height: '24px',
      display: 'flex'
    }
  }
  return {
    height: `${layout.state.dimensions.panelAreaHeight}px`,
    display: 'flex'
  }
})

// Resize handlers
function startResizePrimary(e: MouseEvent) {
  isResizingPrimary.value = true
  document.addEventListener('mousemove', handleResizePrimary)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function startResizeSecondary(e: MouseEvent) {
  isResizingSecondary.value = true
  document.addEventListener('mousemove', handleResizeSecondary)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function startResizePanel(e: MouseEvent) {
  isResizingPanel.value = true
  document.addEventListener('mousemove', handleResizePanel)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
}

function handleResizePrimary(e: MouseEvent) {
  if (!isResizingPrimary.value) return
  const activityBarWidth = layout.state.dimensions.activityBarWidth
  const newWidth = e.clientX - activityBarWidth
  layout.setPrimarySidebarWidth(newWidth)
}

function handleResizeSecondary(e: MouseEvent) {
  if (!isResizingSecondary.value) return
  const newWidth = window.innerWidth - e.clientX
  layout.setSecondarySidebarWidth(newWidth)
}

function handleResizePanel(e: MouseEvent) {
  if (!isResizingPanel.value || !mainAreaRef.value) return
  const rect = mainAreaRef.value.getBoundingClientRect()
  const newHeight = rect.bottom - e.clientY
  layout.setPanelAreaHeight(newHeight)
}

function stopResize() {
  isResizingPrimary.value = false
  isResizingSecondary.value = false
  isResizingPanel.value = false
  document.removeEventListener('mousemove', handleResizePrimary)
  document.removeEventListener('mousemove', handleResizeSecondary)
  document.removeEventListener('mousemove', handleResizePanel)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// Keyboard shortcuts
function handleKeydown(e: KeyboardEvent) {
  // First, check panel movement shortcuts (Alt+Shift+Arrow)
  if (panelShortcuts.handleKeyDown(e)) {
    return // Event was handled
  }

  // Ctrl/Cmd + B: Toggle primary sidebar
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    e.preventDefault()
    layout.togglePrimarySidebar()
  }
  // Ctrl/Cmd + J: Toggle panel area
  if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
    e.preventDefault()
    layout.togglePanelArea()
  }
  // Ctrl/Cmd + Shift + B: Toggle secondary sidebar
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
    e.preventDefault()
    layout.toggleSecondarySidebar()
  }
}

// Emit events from child components
const emit = defineEmits<{
  'perspective-change': [perspectiveId: string]
}>()

function handlePerspectiveChange(perspectiveId: string) {
  emit('perspective-change', perspectiveId)
}

// Handle save instances request from other components
function handleSaveInstancesRequest() {
  showSaveInstances.value = true
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  eventBus.on('save-instances-request', handleSaveInstancesRequest)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  eventBus.off('save-instances-request', handleSaveInstancesRequest)
  stopResize()
})
</script>

<template>
  <div class="gene-layout">
    <!-- Title Bar -->
    <div class="title-bar">
      <div class="title-bar-left">
        <span class="workspace-name">{{ workspaceName }}</span>
      </div>
      <div class="title-bar-right">
        <!-- Save Instances button moved to InstanceTree header for context-specific placement -->
        <Button
          icon="pi pi-palette"
          text
          rounded
          size="small"
          @click="showWorkspaceSettings = true"
          v-tooltip.bottom="'Appearance'"
        />
      </div>
    </div>

    <!-- Main area (everything except status bar) -->
    <div class="main-area" ref="mainAreaRef">
      <!-- Horizontal layout: Activity Bar + Sidebars + Editor -->
      <div class="horizontal-layout">
        <!-- Activity Bar -->
        <ActivityBar @perspective-change="handlePerspectiveChange" />

        <!-- Primary Sidebar with resize handle -->
        <div class="primary-sidebar-container" :style="primarySidebarStyle">
          <PrimarySidebar />
          <div
            v-if="layout.state.visibility.primarySidebar"
            class="resize-handle vertical"
            @mousedown="startResizePrimary"
          ></div>
        </div>

        <!-- Center area: Editor + Panel -->
        <div class="center-area">
          <!-- Editor Area -->
          <div class="editor-container">
            <EditorArea>
              <template #welcome-actions>
                <slot name="welcome-actions"></slot>
              </template>
            </EditorArea>
          </div>

          <!-- Panel Area with resize handle -->
          <div class="panel-area-container" :style="panelAreaStyle">
            <div
              v-if="layout.state.visibility.panelArea && layout.state.panelTabs.length > 0"
              class="resize-handle horizontal"
              @mousedown="startResizePanel"
            ></div>
            <PanelArea />
          </div>
        </div>

        <!-- Secondary Sidebar with resize handle -->
        <div class="secondary-sidebar-container" :style="secondarySidebarStyle">
          <div
            v-if="layout.state.visibility.secondarySidebar"
            class="resize-handle vertical"
            @mousedown="startResizeSecondary"
          ></div>
          <SecondarySidebar />
        </div>
      </div>
    </div>

    <!-- Status Bar -->
    <StatusBar v-if="layout.state.visibility.statusBar" />

    <!-- Workspace Settings Dialog -->
    <SettingsDialog
      :visible="showWorkspaceSettings"
      @close="showWorkspaceSettings = false"
    />

    <!-- Save Instances Dialog -->
    <SaveInstancesDialog
      :visible="showSaveInstances"
      @close="showSaveInstances = false"
      @saved="showSaveInstances = false"
    />
  </div>
</template>

<style>
:root {
  --activity-bar-width: 48px;
  --status-bar-height: 24px;
}
</style>

<style scoped>
.gene-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--surface-ground);
}

.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 12px;
  background: var(--surface-section);
  border-bottom: 1px solid var(--surface-border);
  flex-shrink: 0;
}

.title-bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.workspace-name {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-color);
}

.title-bar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.main-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.horizontal-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.primary-sidebar-container {
  position: relative;
  display: flex;
  flex-shrink: 0;
}

.secondary-sidebar-container {
  position: relative;
  display: flex;
  flex-shrink: 0;
}

.center-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 200px;
  overflow: hidden;
}

.editor-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.panel-area-container {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

/* Resize handles */
.resize-handle {
  position: absolute;
  z-index: 100;
  background: var(--surface-border);
  transition: background 0.15s ease;
}

.resize-handle:hover,
.resize-handle:active {
  background: var(--primary-color);
}

.resize-handle.vertical {
  width: 4px;
  height: 100%;
  cursor: col-resize;
}

.resize-handle.horizontal {
  width: 100%;
  height: 4px;
  cursor: row-resize;
}

/* Position resize handles */
.primary-sidebar-container .resize-handle.vertical {
  right: 0;
  top: 0;
}

.secondary-sidebar-container .resize-handle.vertical {
  left: 0;
  top: 0;
}

.panel-area-container .resize-handle.horizontal {
  left: 0;
  top: 0;
}
</style>
