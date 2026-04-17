<script setup lang="ts">
/**
 * AtlasWorkflowPanel Component
 *
 * DataTable showing all loaded objects with metadata, status badges,
 * and actions (View, View Graph, Add to Workspace).
 */

import { computed, ref, watch, inject } from 'tsm:vue'
import { DataTable, Column, Tag, Button, Dropdown } from 'tsm:primevue'
import { useSharedAtlasBrowser } from '../composables/useAtlasBrowser'
import type { AtlasTreeNodeData } from '../types'

const emit = defineEmits<{
  'select-node': [nodeKey: string]
}>()

const browser = useSharedAtlasBrowser()
const tsm = inject<any>('tsm')

// Reactive list of all loaded objects
const allObjects = computed(() => {
  // Force reactivity via treeNodes
  const _nodes = browser.treeNodes.value
  return browser.getAllLoadedMetadata()
})

// Table rows
const rows = computed(() =>
  allObjects.value.map(({ metadata, nodeData }) => ({
    objectId: metadata.objectId,
    objectName: metadata.objectName || metadata.objectId,
    objectType: nodeData.isSchemaRegistry ? 'Schema' : 'Object',
    status: metadata.status || 'UNKNOWN',
    stage: metadata.stage,
    scope: metadata.scope,
    registry: metadata.registry,
    uploadUser: metadata.uploadUser || '-',
    uploadTime: metadata.uploadTime,
    lastChangeUser: metadata.lastChangeUser,
    lastChangeTime: metadata.lastChangeTime,
    sourceChannel: metadata.sourceChannel || '-',
    version: metadata.version,
    isSchema: !!nodeData.isSchemaRegistry,
    nodeData,
    _nodeKey: `${nodeData.connectionId}/${nodeData.scopeName}/${nodeData.registryName}/${nodeData.stageName}/${metadata.objectId}`
  }))
)

// Format date string in de-DE format
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

// Get PrimeVue Tag severity for status
function statusSeverity(status: string | undefined): string {
  switch (status?.toUpperCase()) {
    case 'DRAFT': return 'warn'
    case 'APPROVED': return 'success'
    case 'RELEASED': return 'info'
    case 'REJECTED': return 'danger'
    case 'DEPLOYED': return 'success'
    default: return 'secondary'
  }
}

// Select object in tree
function handleView(row: any) {
  browser.selectNode(row._nodeKey)
  emit('select-node', row._nodeKey)
}

// View as graph (schemas only)
async function handleViewGraph(row: any) {
  if (!row.isSchema) return
  const result = await browser.getContentForWorkspace(row.nodeData)
  if (!result) return
  browser.showGraph(result.content, row.objectName)
}

// Add to workspace
async function handleAddToWorkspace(row: any) {
  const result = await browser.getContentForWorkspace(row.nodeData)
  if (!result) return

  if (row.isSchema) {
    const openFn = tsm?.getService('gene.metamodel.preview')
    if (openFn) {
      openFn(result.content, row.objectName)
    }
  }
}
</script>

<template>
  <div class="atlas-workflow-panel">
    <div v-if="rows.length === 0" class="workflow-empty">
      <i class="pi pi-list" style="font-size: 1.5rem; opacity: 0.3"></i>
      <p>No objects loaded. Expand a stage in the tree to see objects here.</p>
    </div>

    <DataTable
      v-else
      :value="rows"
      size="small"
      scrollable
      scrollHeight="flex"
      :paginator="rows.length > 25"
      :rows="25"
      sortMode="multiple"
      removableSort
      class="workflow-table"
    >
      <Column field="objectName" header="Name" sortable style="min-width: 150px">
        <template #body="{ data }">
          <div class="name-cell">
            <i :class="data.isSchema ? 'pi pi-file' : 'pi pi-file-edit'" class="name-icon"></i>
            <span>{{ data.objectName }}</span>
          </div>
        </template>
      </Column>

      <Column field="objectType" header="Type" sortable style="width: 90px" />

      <Column field="status" header="Status" sortable style="width: 110px">
        <template #body="{ data }">
          <Tag :value="data.status" :severity="statusSeverity(data.status)" />
        </template>
      </Column>

      <Column field="stage" header="Stage" sortable style="width: 100px" />

      <Column field="uploadUser" header="Upload User" sortable style="width: 120px" />

      <Column field="uploadTime" header="Upload Time" sortable style="width: 140px">
        <template #body="{ data }">
          {{ formatDate(data.uploadTime) }}
        </template>
      </Column>

      <Column field="lastChangeTime" header="Last Change" sortable style="width: 140px">
        <template #body="{ data }">
          <template v-if="data.lastChangeUser">
            {{ data.lastChangeUser }} — {{ formatDate(data.lastChangeTime) }}
          </template>
          <template v-else>-</template>
        </template>
      </Column>

      <Column field="sourceChannel" header="Channel" sortable style="width: 100px" />

      <Column header="Actions" style="width: 130px" :exportable="false">
        <template #body="{ data }">
          <div class="action-buttons">
            <Button
              icon="pi pi-eye"
              text
              rounded
              size="small"
              severity="secondary"
              title="View Details"
              @click="handleView(data)"
            />
            <Button
              v-if="data.isSchema"
              icon="pi pi-sitemap"
              text
              rounded
              size="small"
              severity="secondary"
              title="View as Graph"
              @click="handleViewGraph(data)"
            />
            <Button
              v-if="data.isSchema"
              icon="pi pi-pencil"
              text
              rounded
              size="small"
              severity="secondary"
              title="Open in Modeler"
              @click="handleAddToWorkspace(data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<style scoped>
.atlas-workflow-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.workflow-empty {
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

.workflow-empty p {
  margin: 0;
  font-size: 0.85rem;
}

.workflow-table {
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
</style>
