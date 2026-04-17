<script setup lang="ts">
/**
 * AtlasDetailPanel Component
 *
 * Shows metadata for the selected Atlas schema/object.
 * Provides "Add to Workspace" and "View Raw Content" actions.
 */

import { ref, computed, inject } from 'tsm:vue'
import { Button, ProgressSpinner, Tag } from 'tsm:primevue'
import { useSharedAtlasBrowser } from '../composables/useAtlasBrowser'

// TSM for service access
const tsm = inject<any>('tsm')

// WorkspaceActionService for direct App-level actions (replaces emits/props)
function getActions() {
  return tsm?.getService('gene.workspace.actions')
}

const browser = useSharedAtlasBrowser()
const addingToWorkspace = ref(false)

const detail = computed(() => browser.selectedDetail.value)
const nodeData = computed(() => browser.selectedNodeData.value)
const isSchema = computed(() => nodeData.value?.isSchemaRegistry ?? false)

const hasSelection = computed(() => !!detail.value)

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

// Error display
const actionError = ref<string | null>(null)

// Add to workspace
async function handleAddToWorkspace() {
  console.log('[AtlasDetailPanel] handleAddToWorkspace called')
  actionError.value = null
  const data = nodeData.value
  console.log('[AtlasDetailPanel] nodeData:', data)
  if (!data) {
    actionError.value = 'No node selected'
    return
  }

  addingToWorkspace.value = true
  try {
    const result = await browser.getContentForWorkspace(data)
    console.log('[AtlasDetailPanel] getContentForWorkspace result:', !!result, result?.filename)
    if (!result) {
      actionError.value = 'Failed to load content from Atlas server'
      return
    }

    const actions = getActions()
    const entry = { name: result.filename, path: `atlas://${result.filename}`, sourceId: 'atlas' }
    if (isSchema.value) {
      actions?.loadModel(entry, result.content)
    } else {
      actions?.loadInstances(entry, result.content)
    }
  } catch (e: any) {
    console.error('[AtlasDetailPanel] handleAddToWorkspace error:', e)
    actionError.value = e.message || 'Failed to add to workspace'
  } finally {
    addingToWorkspace.value = false
  }
}

// Open schema in Metamodeler for editing
async function handleOpenInModeler() {
  console.log('[AtlasDetailPanel] handleOpenInModeler called')
  actionError.value = null
  const data = nodeData.value
  if (!data || !isSchema.value) {
    console.log('[AtlasDetailPanel] no data or not schema, data:', data, 'isSchema:', isSchema.value)
    return
  }

  try {
    const result = await browser.getContentForWorkspace(data)
    console.log('[AtlasDetailPanel] content loaded:', !!result)
    if (!result) {
      actionError.value = 'Failed to load schema content'
      return
    }

    const openFn = tsm?.getService('gene.metamodel.preview')
    console.log('[AtlasDetailPanel] gene.metamodel.preview available:', !!openFn)
    if (openFn) {
      openFn(result.content, detail.value?.objectName || 'Schema')
    } else {
      actionError.value = 'Metamodeler not available'
    }
  } catch (e: any) {
    console.error('[AtlasDetailPanel] handleOpenInModeler error:', e)
    actionError.value = e.message || 'Failed to open in modeler'
  }
}

</script>

<template>
  <div class="atlas-detail-panel">
    <!-- Welcome state -->
    <div v-if="!hasSelection" class="atlas-welcome">
      <i class="pi pi-globe" style="font-size: 3rem; opacity: 0.2"></i>
      <h3>Model Atlas Browser</h3>
      <p>Select a schema or object in the tree to view its details.</p>
    </div>

    <!-- Detail view -->
    <div v-else class="atlas-detail">
      <div class="detail-header">
        <i :class="isSchema ? 'pi pi-file' : 'pi pi-file-edit'" class="detail-icon"></i>
        <div class="detail-title">
          <h3>{{ detail!.objectName || detail!.objectId }}</h3>
          <span class="detail-type">{{ isSchema ? 'Schema' : 'Object' }}</span>
        </div>
      </div>

      <!-- Metadata table -->
      <div class="detail-metadata">
        <table>
          <tbody>
            <tr>
              <td class="meta-label">ID</td>
              <td class="meta-value">{{ detail!.objectId }}</td>
            </tr>
            <tr v-if="detail!.objectName">
              <td class="meta-label">Name</td>
              <td class="meta-value">{{ detail!.objectName }}</td>
            </tr>
            <tr>
              <td class="meta-label">Type</td>
              <td class="meta-value">{{ detail!.objectType }}</td>
            </tr>
            <tr>
              <td class="meta-label">Stage</td>
              <td class="meta-value">{{ detail!.stage }}</td>
            </tr>
            <tr>
              <td class="meta-label">Scope</td>
              <td class="meta-value">{{ detail!.scope }}</td>
            </tr>
            <tr>
              <td class="meta-label">Registry</td>
              <td class="meta-value">{{ detail!.registry }}</td>
            </tr>
            <tr>
              <td class="meta-label">Status</td>
              <td class="meta-value">
                <Tag :value="detail!.status || 'Unknown'" :severity="statusSeverity(detail!.status)" />
              </td>
            </tr>
            <tr v-if="detail!.version">
              <td class="meta-label">Version</td>
              <td class="meta-value">{{ detail!.version }}</td>
            </tr>
            <tr>
              <td class="meta-label">Read Only</td>
              <td class="meta-value">{{ detail!.isReadOnly ? 'Yes' : 'No' }}</td>
            </tr>
            <tr>
              <td class="meta-label">Upload User</td>
              <td class="meta-value">{{ detail!.uploadUser || '-' }}</td>
            </tr>
            <tr>
              <td class="meta-label">Upload Time</td>
              <td class="meta-value">{{ formatDate(detail!.uploadTime) }}</td>
            </tr>
            <tr v-if="detail!.lastChangeUser">
              <td class="meta-label">Last Change</td>
              <td class="meta-value">{{ detail!.lastChangeUser }} — {{ formatDate(detail!.lastChangeTime) }}</td>
            </tr>
            <tr v-if="detail!.contentHash">
              <td class="meta-label">Content Hash</td>
              <td class="meta-value mono">{{ detail!.contentHash }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Actions -->
      <div class="detail-actions">
        <Button
          :label="isSchema ? 'Add Model to Workspace' : 'Add Instances to Workspace'"
          icon="pi pi-plus"
          :disabled="!getActions()?.isWorkspaceOpen?.value"
          :loading="addingToWorkspace"
          size="small"
          @click="handleAddToWorkspace"
        />
        <Button
          v-if="isSchema"
          label="Open in Modeler"
          icon="pi pi-pencil"
          severity="secondary"
          size="small"
          @click="handleOpenInModeler"
        />
      </div>

      <p v-if="!getActions()?.isWorkspaceOpen?.value" class="workspace-hint">
        <i class="pi pi-info-circle"></i>
        Open a workspace to add content.
      </p>

      <!-- Error display -->
      <div v-if="actionError" class="action-error">
        <i class="pi pi-exclamation-triangle"></i>
        {{ actionError }}
      </div>

    </div>
  </div>
</template>

<style scoped>
.atlas-detail-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
  background: var(--p-content-background);
  color: var(--p-text-color);
}

.atlas-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 24px;
  color: var(--p-text-muted-color);
  text-align: center;
  flex: 1;
}

.atlas-welcome h3 {
  margin: 8px 0 0;
  font-weight: 500;
}

.atlas-welcome p {
  font-size: 0.85rem;
  max-width: 300px;
}

.atlas-detail {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.detail-icon {
  font-size: 1.5rem;
  color: var(--p-primary-color);
}

.detail-title h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.detail-type {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.detail-metadata table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.detail-metadata tr {
  border-bottom: 1px solid var(--p-content-border-color);
}

.meta-label {
  padding: 6px 12px 6px 0;
  font-weight: 500;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  width: 120px;
}

.meta-value {
  padding: 6px 0;
  word-break: break-all;
}

.meta-value.mono {
  font-family: monospace;
  font-size: 0.8rem;
}

.detail-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.workspace-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  margin: 0;
}

.action-error {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--p-red-500);
  font-size: 0.85rem;
  padding: 8px;
  background: color-mix(in srgb, var(--p-red-500) 10%, transparent);
  border-radius: 4px;
}
</style>
