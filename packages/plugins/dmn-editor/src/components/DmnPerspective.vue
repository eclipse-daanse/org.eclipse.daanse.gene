<script setup lang="ts">
/**
 * DmnPerspective - Main container for the DMN Editor plugin
 * Toolbar (New/Save/SaveAs) + Splitter (left: Tree, right: DecisionTableEditor)
 */

import { ref, computed, onMounted, inject } from 'tsm:vue'
import { Button, Splitter, SplitterPanel } from 'tsm:primevue'
import { useSharedDmnEditor } from '../composables/useDmnEditor'
import DmnTree from './DmnTree.vue'
import DecisionTableEditor from './DecisionTableEditor.vue'

const dmn = useSharedDmnEditor()
const tsm = inject<any>('tsm')

// Toolbar state
const saving = ref(false)

onMounted(() => {
  // Load from TSM service if available (set by App.vue on .dmn file open)
  const data = tsm?.getService('gene.dmn.data')
  if (data?.content) {
    dmn.loadFromString(data.content, data.filePath, data.fileEntry?.handle)
    console.log('[DmnPerspective] Loaded DMN from file:', data.filePath)
    // Clear the service to prevent re-loading on re-mount
    tsm?.registerService('gene.dmn.data', null)
  }
})

const hasModel = computed(() => {
  const _ = dmn.version.value
  return dmn.rootDefinitions.value !== null
})

const titleText = computed(() => {
  const _ = dmn.version.value
  const name = dmn.rootDefinitions.value
    ? dmn.eGet(dmn.rootDefinitions.value, 'name') || 'Untitled'
    : 'DMN Editor'
  const dirtyMark = dmn.dirty.value ? ' *' : ''
  return `${name}${dirtyMark}`
})

async function handleNew() {
  dmn.createNewDefinitions()
}

async function handleSave() {
  saving.value = true
  try {
    await dmn.saveToFile()
  } finally {
    saving.value = false
  }
}

async function handleSaveAs() {
  saving.value = true
  try {
    await dmn.saveAsFile()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="dmn-perspective">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <Button
          icon="pi pi-file"
          label="New"
          size="small"
          severity="secondary"
          text
          @click="handleNew"
        />
        <Button
          icon="pi pi-save"
          label="Save"
          size="small"
          severity="secondary"
          text
          :disabled="!hasModel || !dmn.dirty.value"
          :loading="saving"
          @click="handleSave"
        />
        <Button
          icon="pi pi-save"
          label="Save As"
          size="small"
          severity="secondary"
          text
          :disabled="!hasModel"
          @click="handleSaveAs"
        />
      </div>
      <div class="toolbar-center">
        <span class="title-text">{{ titleText }}</span>
      </div>
      <div class="toolbar-right">
        <span v-if="dmn.filePath.value" class="file-path" :title="dmn.filePath.value">
          {{ dmn.filePath.value }}
        </span>
      </div>
    </div>

    <!-- Main content -->
    <template v-if="hasModel">
      <Splitter class="main-splitter" style="flex: 1; overflow: hidden;">
        <SplitterPanel :size="25" :minSize="15" class="tree-panel">
          <DmnTree />
        </SplitterPanel>
        <SplitterPanel :size="75" :minSize="40" class="editor-panel">
          <DecisionTableEditor :decision="dmn.selectedDecision.value" />
        </SplitterPanel>
      </Splitter>
    </template>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <i class="pi pi-table" style="font-size: 4rem; color: var(--text-color-secondary)"></i>
      <h3>DMN Decision Table Editor</h3>
      <p>Create a new DMN model or open an existing .dmn file.</p>
      <div class="empty-actions">
        <Button
          icon="pi pi-file"
          label="New DMN Model"
          @click="handleNew"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dmn-perspective {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-ground, #f8fafc);
}

.toolbar {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  border-bottom: 1px solid var(--surface-border, #e2e8f0);
  background: var(--surface-card, #ffffff);
  min-height: 40px;
}

.toolbar-left {
  display: flex;
  gap: 2px;
}

.toolbar-center {
  flex: 1;
  text-align: center;
}

.title-text {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-color, #1e293b);
}

.toolbar-right {
  display: flex;
  align-items: center;
}

.file-path {
  font-size: 0.75rem;
  color: var(--text-color-secondary, #64748b);
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
}

.main-splitter {
  flex: 1;
  overflow: hidden;
}

.tree-panel {
  overflow: auto;
  border-right: 1px solid var(--surface-border, #e2e8f0);
}

.editor-panel {
  overflow: auto;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-color-secondary, #64748b);
}

.empty-state h3 {
  margin: 0;
  color: var(--text-color, #1e293b);
}

.empty-state p {
  margin: 0;
  font-size: 0.9rem;
}

.empty-actions {
  margin-top: 8px;
}
</style>
