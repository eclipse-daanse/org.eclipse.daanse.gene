<script setup lang="ts">
/**
 * AtlasTransitionsEditor Component
 *
 * Editor tab showing stages as a pipeline with object tables per stage.
 * Allows triggering transitions via a confirmation dialog.
 */

import { computed, ref, watch } from 'tsm:vue'
import { DataTable, Column, Tag, Button, Dropdown } from 'tsm:primevue'
import { useSharedAtlasBrowser } from '../composables/useAtlasBrowser'
import TransitionDialog from './TransitionDialog.vue'
import type { AtlasTreeNodeData } from '../types'
import type { ObjectMetadata, Stage, StageTransition } from 'storage-model-atlas'

const browser = useSharedAtlasBrowser()

// Currently selected registry context (derived from tree selection)
const activeRegistry = computed(() => {
  // Find the currently selected node's registry context
  const nodeData = browser.selectedNodeData.value
  if (!nodeData?.connectionId || !nodeData?.registryName) return null

  const info = browser.getRegistryInfo(nodeData.connectionId, nodeData.registryName)
  if (!info) return null

  return {
    connectionId: nodeData.connectionId,
    scopeName: nodeData.scopeName!,
    registryName: nodeData.registryName!,
    isSchema: nodeData.isSchemaRegistry || false,
    stages: info.stages,
    transitions: info.transitions
  }
})

// Get all loaded objects grouped by stage for the active registry
const objectsByStage = computed(() => {
  const reg = activeRegistry.value
  if (!reg) return new Map<string, Array<{ metadata: ObjectMetadata; nodeData: AtlasTreeNodeData }>>()

  // Access treeNodes.value to ensure reactivity when nodes change (stage expansion)
  const _nodes = browser.treeNodes.value
  const all = browser.getAllLoadedMetadata()
  const map = new Map<string, Array<{ metadata: ObjectMetadata; nodeData: AtlasTreeNodeData }>>()

  // Initialize all stages (even empty ones)
  for (const stage of reg.stages) {
    if (stage.name) map.set(stage.name, [])
  }

  // Group objects into stages
  for (const item of all) {
    if (item.nodeData.connectionId === reg.connectionId &&
        item.nodeData.registryName === reg.registryName) {
      const stage = item.metadata.stage
      if (!map.has(stage)) map.set(stage, [])
      map.get(stage)!.push(item)
    }
  }

  return map
})

// Selected stage tab
const selectedStage = ref<string | null>(null)

// Auto-select first stage when registry changes
watch(activeRegistry, (reg) => {
  if (reg && reg.stages.length > 0) {
    selectedStage.value = reg.stages[0].name || null
  } else {
    selectedStage.value = null
  }
}, { immediate: true })

// Objects for the selected stage
const currentStageObjects = computed(() => {
  if (!selectedStage.value) return []
  return objectsByStage.value.get(selectedStage.value) || []
})

// Table rows for the selected stage
const rows = computed(() =>
  currentStageObjects.value.map(({ metadata, nodeData }) => ({
    objectId: metadata.objectId,
    objectName: metadata.objectName || metadata.objectId,
    version: metadata.version || '-',
    status: metadata.status || 'UNKNOWN',
    stage: metadata.stage,
    uploadUser: metadata.uploadUser || '-',
    lastChangeTime: metadata.lastChangeTime,
    lastChangeUser: metadata.lastChangeUser,
    isReadOnly: metadata.isReadOnly || false,
    metadata,
    nodeData
  }))
)

// Get allowed target stages for an object in a given stage
function getAllowedTargets(fromStage: string): string[] {
  if (!activeRegistry.value) return []
  return activeRegistry.value.transitions
    .filter(t => t.fromStage === fromStage)
    .map(t => t.toStage!)
    .filter(Boolean)
}

// Stage info helper
function getStageInfo(stageName: string): Stage | undefined {
  return activeRegistry.value?.stages.find(s => s.name === stageName)
}

function stageSeverity(stageName: string): string {
  const stage = getStageInfo(stageName)
  if (stage?.final) return 'success'
  if (stageName === selectedStage.value) return 'info'
  return 'secondary'
}

// Transition dialog state
const transitionDialogVisible = ref(false)
const transitionTarget = ref<{
  metadata: ObjectMetadata
  connectionId: string
  registryName: string
  allowedTargets: string[]
} | null>(null)

function openTransitionDialog(row: any) {
  if (!activeRegistry.value) return
  const targets = getAllowedTargets(row.stage)
  if (targets.length === 0) return

  transitionTarget.value = {
    metadata: row.metadata,
    connectionId: activeRegistry.value.connectionId,
    registryName: activeRegistry.value.registryName,
    allowedTargets: targets
  }
  transitionDialogVisible.value = true
}

const refreshing = ref(false)

async function onTransitioned(fromStage: string, toStage: string) {
  await refreshAllStages()
  browser.reselectCurrentObject()
}

async function refreshAllStages() {
  const reg = activeRegistry.value
  if (!reg) return
  refreshing.value = true
  try {
    await Promise.all(
      reg.stages
        .filter(s => s.name)
        .map(s => browser.refreshStage(reg.connectionId, reg.scopeName, reg.registryName, s.name!))
    )
  } finally {
    refreshing.value = false
  }
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return dateStr
  }
}

function statusSeverity(status: string | undefined): string {
  switch (status?.toUpperCase()) {
    case 'DRAFT': return 'warn'
    case 'APPROVED': return 'success'
    case 'RELEASED': return 'info'
    case 'REJECTED': return 'danger'
    default: return 'secondary'
  }
}
</script>

<template>
  <div class="transitions-editor">
    <!-- No registry selected -->
    <div v-if="!activeRegistry" class="transitions-empty">
      <i class="pi pi-arrow-right-arrow-left" style="font-size: 1.5rem; opacity: 0.3"></i>
      <p>Select a registry, stage or object in the tree to see transitions.</p>
    </div>

    <template v-else>
      <!-- Stage Pipeline -->
      <div class="stage-pipeline">
        <div class="pipeline-header">
          <span class="pipeline-title">
            <i class="pi pi-arrow-right-arrow-left"></i>
            {{ activeRegistry.registryName }}
          </span>
          <span class="pipeline-scope">{{ activeRegistry.scopeName }}</span>
        </div>

        <div class="pipeline-stages">
          <template v-for="(stage, idx) in activeRegistry.stages" :key="stage.name">
            <div
              class="stage-card"
              :class="{
                'stage-selected': selectedStage === stage.name,
                'stage-final': stage.final
              }"
              @click="selectedStage = stage.name || null"
            >
              <div class="stage-name">
                <i :class="stage.final ? 'pi pi-lock' : 'pi pi-folder'" class="stage-icon"></i>
                {{ stage.name }}
              </div>
              <div class="stage-count">
                {{ (objectsByStage.get(stage.name!) || []).length }} objects
              </div>
              <Tag
                v-if="stage.final"
                value="Final"
                severity="success"
                class="stage-badge"
              />
              <Tag
                v-else-if="!stage.writable"
                value="Read-Only"
                severity="warn"
                class="stage-badge"
              />
            </div>

            <!-- Transition arrows between stages -->
            <div
              v-if="idx < activeRegistry.stages.length - 1"
              class="stage-arrow"
            >
              <template v-for="t in activeRegistry.transitions.filter(tr => tr.fromStage === stage.name)" :key="`${t.fromStage}-${t.toStage}`">
                <i class="pi pi-arrow-right arrow-icon"></i>
              </template>
              <i v-if="activeRegistry.transitions.filter(tr => tr.fromStage === stage.name).length === 0" class="pi pi-minus arrow-icon arrow-disabled"></i>
            </div>
          </template>
        </div>

        <!-- Transition rules summary -->
        <div class="transition-rules" v-if="activeRegistry.transitions.length > 0">
          <span class="rules-label">Transitions:</span>
          <Tag
            v-for="t in activeRegistry.transitions"
            :key="`${t.fromStage}-${t.toStage}`"
            :value="`${t.fromStage} → ${t.toStage}`"
            severity="info"
            class="rule-tag"
          />
        </div>
      </div>

      <!-- Objects Table for selected stage -->
      <div class="stage-objects">
        <div v-if="!selectedStage" class="transitions-empty">
          <p>Select a stage above to see objects.</p>
        </div>

        <div v-else-if="currentStageObjects.length === 0" class="transitions-empty">
          <i class="pi pi-inbox" style="font-size: 1.2rem; opacity: 0.3"></i>
          <p>No objects loaded in stage "{{ selectedStage }}". Expand the stage in the tree first.</p>
        </div>

        <DataTable
          v-else
          :value="rows"
          size="small"
          scrollable
          scrollHeight="flex"
          :paginator="rows.length > 20"
          :rows="20"
          sortMode="multiple"
          removableSort
          class="transitions-table"
        >
          <Column field="objectName" header="Name" sortable style="min-width: 150px">
            <template #body="{ data }">
              <div class="name-cell">
                <i :class="activeRegistry.isSchema ? 'pi pi-file' : 'pi pi-file-edit'" class="name-icon"></i>
                <span>{{ data.objectName }}</span>
              </div>
            </template>
          </Column>

          <Column field="version" header="Version" sortable style="width: 90px" />

          <Column field="status" header="Status" sortable style="width: 110px">
            <template #body="{ data }">
              <Tag :value="data.status" :severity="statusSeverity(data.status)" />
            </template>
          </Column>

          <Column field="uploadUser" header="User" sortable style="width: 120px" />

          <Column field="lastChangeTime" header="Last Change" sortable style="width: 150px">
            <template #body="{ data }">
              <template v-if="data.lastChangeUser">
                {{ data.lastChangeUser }} — {{ formatDate(data.lastChangeTime) }}
              </template>
              <template v-else>{{ formatDate(data.lastChangeTime) }}</template>
            </template>
          </Column>

          <Column header="Transition" style="width: 140px" :exportable="false">
            <template #body="{ data }">
              <div class="action-buttons">
                <Button
                  v-if="getAllowedTargets(data.stage).length > 0 && !data.isReadOnly"
                  icon="pi pi-arrow-right"
                  label="Transition"
                  text
                  size="small"
                  severity="primary"
                  @click="openTransitionDialog(data)"
                />
                <Tag
                  v-else-if="data.isReadOnly"
                  value="Read-Only"
                  severity="warn"
                />
                <span v-else class="no-transition">—</span>
              </div>
            </template>
          </Column>
        </DataTable>
      </div>
    </template>

    <!-- Transition Dialog -->
    <TransitionDialog
      v-if="transitionTarget"
      :visible="transitionDialogVisible"
      @update:visible="transitionDialogVisible = $event"
      :metadata="transitionTarget.metadata"
      :connection-id="transitionTarget.connectionId"
      :registry-name="transitionTarget.registryName"
      :allowed-targets="transitionTarget.allowedTargets"
      @transitioned="onTransitioned"
    />
  </div>
</template>

<style scoped>
.transitions-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--p-content-background);
  color: var(--p-text-color);
}

.transitions-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--p-text-muted-color);
  text-align: center;
  flex: 1;
}

.transitions-empty p {
  margin: 0;
  font-size: 0.85rem;
}

/* Stage Pipeline */
.stage-pipeline {
  padding: 12px;
  border-bottom: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
}

.pipeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.pipeline-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 0.9rem;
}

.pipeline-scope {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.pipeline-stages {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  padding: 4px 0;
}

.stage-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  border: 2px solid var(--p-content-border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  min-width: 100px;
  background: var(--p-content-background);
}

.stage-card:hover {
  border-color: var(--p-primary-color);
  background: var(--p-highlight-background);
}

.stage-card.stage-selected {
  border-color: var(--p-primary-color);
  background: var(--p-highlight-background);
}

.stage-card.stage-final {
  border-style: double;
  border-width: 3px;
}

.stage-name {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
  font-size: 0.85rem;
}

.stage-icon {
  font-size: 0.8rem;
  color: var(--p-primary-color);
}

.stage-count {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.stage-badge {
  font-size: 0.65rem;
}

.stage-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
}

.arrow-icon {
  font-size: 0.9rem;
  color: var(--p-primary-color);
}

.arrow-disabled {
  color: var(--p-text-muted-color);
  opacity: 0.4;
}

.transition-rules {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.rules-label {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.rule-tag {
  font-size: 0.7rem;
}

/* Objects Table */
.stage-objects {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.transitions-table {
  flex: 1;
}

:deep(.p-datatable) {
  font-size: 0.8125rem;
}

:deep(.p-datatable-thead > tr > th) {
  padding: 6px 10px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
}

:deep(.p-datatable-tbody > tr > td) {
  padding: 4px 10px;
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.name-icon {
  font-size: 0.875rem;
  color: var(--p-primary-color);
}

.action-buttons {
  display: flex;
  gap: 2px;
}

.no-transition {
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
}
</style>
