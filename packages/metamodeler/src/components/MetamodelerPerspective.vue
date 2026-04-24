<script setup lang="ts">
/**
 * MetamodelerPerspective Component
 *
 * Container component for the Metamodeler that combines
 * the tree view (left) with the property editor (right).
 */

import { ref, computed, inject } from 'tsm:vue'
import { Button } from 'tsm:primevue'
import { Toolbar } from 'tsm:primevue'
import MetamodelerTree from './MetamodelerTree.vue'
import MetamodelerEditor from './MetamodelerEditor.vue'
import { useSharedMetamodeler } from '../composables/useMetamodeler'
// Constant from @emfts/core xmi internals (not re-exported from main entry)
const OPTION_FEATURE_NAME_MAP = 'FEATURE_NAME_MAP'

const metamodeler = useSharedMetamodeler()

// Panel sizes
const treePanelWidth = ref(300)

// Computed state
const hasUnsavedChanges = computed(() => metamodeler.dirty.value)
const packageName = computed(() => metamodeler.rootPackage.value?.getName() || 'New Metamodel')

// Toolbar actions
function handleNew() {
  if (hasUnsavedChanges.value) {
    // TODO: Confirm dialog
    console.log('Unsaved changes!')
  }
  metamodeler.reset()
}

async function handleSave() {
  console.log('Saving metamodel...')
  const success = await metamodeler.saveToFile()
  if (success) {
    console.log('Metamodel saved successfully')
  } else {
    console.warn('Failed to save metamodel or save was cancelled')
  }
}

async function handleSaveAs() {
  console.log('Save metamodel as...')
  const success = await metamodeler.saveAsFile()
  if (success) {
    console.log('Metamodel saved successfully')
  } else {
    console.warn('Failed to save metamodel or save was cancelled')
  }
}

function handleUndo() {
  // TODO: Implement undo
  console.log('Undo')
}

function handleRedo() {
  // TODO: Implement redo
  console.log('Redo')
}

// Atlas upload — use TSM DI via Vue inject bridge
const atlasUploadService = inject<any>('gene.atlas.upload', null)
const atlasAvailable = computed(() => !!atlasUploadService)

const ATLAS_SAVE_OPTIONS = new Map<string, any>([
  [OPTION_FEATURE_NAME_MAP, new Map([['eType', '_type']])]
])

// Get open upload dialog function from TSM (injected via tsm provider)
const tsm = inject<any>('tsm')
async function handlePublishToAtlas() {
  const content = await metamodeler.saveToEcoreString(ATLAS_SAVE_OPTIONS)
  if (!content) return
  const name = (metamodeler.rootPackage.value?.getName?.() || 'Metamodel') + '.ecore'
  const openUploadFn = tsm?.getService?.('gene.atlas.openUpload')
  if (openUploadFn) {
    openUploadFn(content, name)
  }
}
</script>

<template>
  <div class="metamodeler-perspective">
    <!-- Toolbar -->
    <Toolbar class="perspective-toolbar">
      <template #start>
        <div class="toolbar-title">
          <i class="pi pi-sitemap"></i>
          <span>{{ packageName }}</span>
          <span v-if="hasUnsavedChanges" class="unsaved-indicator">*</span>
        </div>
      </template>

      <template #center>
        <div class="toolbar-actions">
          <Button
            icon="pi pi-file"
            text
            rounded
            size="small"
            v-tooltip.bottom="'New Metamodel'"
            @click="handleNew"
          />
          <Button
            icon="pi pi-save"
            text
            rounded
            size="small"
            v-tooltip.bottom="'Save (Ctrl+S)'"
            :disabled="!hasUnsavedChanges && !!metamodeler.fileHandle.value"
            @click="handleSave"
          />
          <Button
            icon="pi pi-file-export"
            text
            rounded
            size="small"
            v-tooltip.bottom="'Save As...'"
            :disabled="!metamodeler.rootPackage.value"
            @click="handleSaveAs"
          />
          <span class="toolbar-separator"></span>
          <Button
            icon="pi pi-undo"
            text
            rounded
            size="small"
            v-tooltip.bottom="'Undo (Ctrl+Z)'"
            disabled
            @click="handleUndo"
          />
          <Button
            icon="pi pi-refresh"
            text
            rounded
            size="small"
            v-tooltip.bottom="'Redo (Ctrl+Y)'"
            disabled
            @click="handleRedo"
          />
          <span class="toolbar-separator"></span>
          <Button
            icon="pi pi-cloud-upload"
            text
            rounded
            size="small"
            v-tooltip.bottom="'Publish to Atlas'"
            :disabled="!metamodeler.rootPackage.value || !atlasAvailable"
            @click="handlePublishToAtlas"
          />
        </div>
      </template>

      <template #end>
        <div class="toolbar-info">
          <span v-if="metamodeler.rootPackage.value" class="info-text">
            {{ metamodeler.rootPackage.value.getEClassifiers?.()?.length || 0 }} classes
          </span>
        </div>
      </template>
    </Toolbar>

    <!-- Main Content -->
    <div class="perspective-content">
      <!-- Tree Panel -->
      <div class="tree-panel" :style="{ width: treePanelWidth + 'px' }">
        <MetamodelerTree />
      </div>

      <!-- Resizer -->
      <div class="panel-resizer"></div>

      <!-- Editor Panel -->
      <div class="editor-panel">
        <MetamodelerEditor />
      </div>
    </div>
  </div>
</template>

<style scoped>
.metamodeler-perspective {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-ground);
}

.perspective-toolbar {
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-section);
}

.toolbar-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: var(--text-color);
}

.toolbar-title i {
  color: var(--primary-color);
}

.unsaved-indicator {
  color: var(--primary-color);
  font-size: 1.2rem;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.toolbar-separator {
  width: 1px;
  height: 24px;
  background: var(--surface-border);
  margin: 0 0.5rem;
}

.toolbar-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.info-text {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.perspective-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.tree-panel {
  flex-shrink: 0;
  border-right: 1px solid var(--surface-border);
  overflow: hidden;
}

.panel-resizer {
  width: 4px;
  background: transparent;
  cursor: col-resize;
  transition: background 0.15s ease;
}

.panel-resizer:hover {
  background: var(--primary-color);
}

.editor-panel {
  flex: 1;
  overflow: hidden;
}

:deep(.p-toolbar) {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0;
  background: transparent;
}
</style>
