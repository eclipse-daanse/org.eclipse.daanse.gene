<script setup lang="ts">
/**
 * SaveInstancesDialog - Dialog for saving instances to XMI files
 *
 * Supports both storage strategies:
 * - single-file: All instances in one XMI file
 * - file-per-entity: Each root object in a separate file
 *
 * Files are saved relative to the workspace file location using Gene's file system.
 */

import { computed, ref, watch, inject } from 'tsm:vue'
import { DataTable } from 'tsm:primevue'
import { Column } from 'tsm:primevue'
import { InputText } from 'tsm:primevue'
import { Button } from 'tsm:primevue'
import { Dropdown } from 'tsm:primevue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'close': []
  'saved': []
}>()

const tsm = inject<any>('tsm')
const fileSystem = tsm?.getService('ui.file-explorer.composables')?.useSharedFileSystem?.()
const _injectedEditorConfig = inject<any>('gene.editor.config', null)
// Fallback: get from TSM if inject didn't work (timing issue)
const editorConfigService = computed(() => _injectedEditorConfig || tsm?.getService('gene.editor.config'))

const saving = ref(false)
const subfolder = ref<string>('instances') // Subfolder relative to workspace

// Instance tree composable (exposes resources + serializeResource + isResourceDirty)
function getInstanceTreeService(): any {
  const state = tsm?.getService('gene.instance.tree.state')
  return state?.instance || null
}

// One row per managed resource
interface ResourceRow {
  resource: any
  filename: string // editable target filename (resource name → file)
  dirty: boolean
}

const resourceRows = ref<ResourceRow[]>([])

// Load resources when dialog opens
watch(() => props.visible, (isVisible) => {
  if (isVisible) {
    loadResources()
  }
}, { immediate: true })

function loadResources() {
  const service: any = getInstanceTreeService()
  if (!service) {
    console.warn('[SaveInstancesDialog] Instance tree service not available')
    resourceRows.value = []
    return
  }

  // Restore the target subfolder from existing instance sources (if any)
  const editorConfig = editorConfigService.value
  const existingSources = editorConfig?.instanceSources?.value || []
  if (existingSources.length > 0) {
    const loc = existingSources[0].location || existingSources[0].path || ''
    if (loc.includes('/')) subfolder.value = loc.substring(0, loc.lastIndexOf('/'))
  }

  // One row per managed resource; filename = resource name (→ target file)
  const resources = service.resources?.value || (service.listResources ? service.listResources() : [])
  resourceRows.value = (resources || []).map((r: any) => {
    const uri = r.getURI?.()?.toString?.() || ''
    return {
      resource: r,
      filename: uri.split('/').pop() || 'instances.xmi',
      dirty: !!r.isModified?.()
    }
  })
}

// Get workspace info from EditorConfig
const workspaceInfo = computed(() => {
  const editorConfig = editorConfigService.value
  if (!editorConfig) return null

  const entry = editorConfig.workspaceFileEntry?.value
  const path = editorConfig.workspaceFilePath?.value

  if (!entry || !path) return null

  // Get parent directory path (everything before the last /)
  const lastSlash = path.lastIndexOf('/')
  const parentPath = lastSlash > 0 ? path.substring(0, lastSlash) : ''

  return {
    entry,
    path,
    parentPath,
    sourceId: entry.sourceId
  }
})

// Folder options for dropdown (scan workspace directory)
const folderOptions = computed(() => {
  const options: { label: string; value: string; icon: string }[] = []

  // Root option
  options.push({ label: '/ (workspace root)', value: '', icon: 'pi pi-home' })

  // Default option
  if (!options.some(o => o.value === 'instances')) {
    options.push({ label: 'instances', value: 'instances', icon: 'pi pi-folder' })
  }

  // Scan existing folders from FileSystem
  const geneFS = tsm?.getService('gene.filesystem')
  if (geneFS && workspaceInfo.value) {
    const sourceId = workspaceInfo.value.sourceId
    const parentPath = workspaceInfo.value.parentPath

    // Get entries from the workspace source
    const source = geneFS.sources?.value?.find((s: any) => s.id === sourceId)
    if (source?.data?.entries) {
      collectFolders(source.data.entries, parentPath, '', options)
    }
  }

  // Add subfolder value if not already in options (user may have typed a custom one)
  if (subfolder.value && !options.some(o => o.value === subfolder.value)) {
    options.push({ label: `${subfolder.value} (new)`, value: subfolder.value, icon: 'pi pi-folder-plus' })
  }

  return options
})

function collectFolders(entries: any[], basePath: string, prefix: string, options: { label: string; value: string; icon: string }[]) {
  if (!entries) return
  for (const entry of entries) {
    if (!entry.isDirectory) continue
    // Only include folders under the workspace parent
    const entryPath = entry.path || ''
    if (basePath && !entryPath.startsWith(basePath)) continue

    const relativePath = basePath ? entryPath.substring(basePath.length + 1) : entryPath
    if (!relativePath || relativePath.startsWith('.')) continue

    const indent = prefix ? `${prefix}/${entry.name}` : entry.name
    if (!options.some(o => o.value === relativePath)) {
      options.push({
        label: indent,
        value: relativePath,
        icon: 'pi pi-folder'
      })
    }

    // Recurse into children
    if (entry.children) {
      collectFolders(entry.children, basePath, indent, options)
    }
  }
}

// Full save path display
const savePathDisplay = computed(() => {
  if (!workspaceInfo.value) return 'Workspace not loaded'
  const parent = workspaceInfo.value.parentPath
  return parent ? `${parent}/${subfolder.value}/` : `${subfolder.value}/`
})

// Check if we can save (workspace loaded)
const canSaveToWorkspace = computed(() => !!workspaceInfo.value)

// Save instances
async function handleSave() {
  const service: any = getInstanceTreeService()
  if (!service || !workspaceInfo.value) return

  saving.value = true
  try {
    const { sourceId, parentPath } = workspaceInfo.value
    const geneFS = tsm?.getService('gene.filesystem')
    if (!geneFS) {
      console.error('[SaveInstancesDialog] Gene file system not available')
      return
    }

    // Determine target folder path
    const useSubfolder = subfolder.value.trim().length > 0
    let targetFolderPath: string
    if (useSubfolder) {
      targetFolderPath = parentPath ? `${parentPath}/${subfolder.value}` : subfolder.value
      await ensureFolder(geneFS, sourceId, targetFolderPath, parentPath)
    } else {
      targetFolderPath = parentPath || ''
    }

    // Save each managed resource to its own file (filename = resource name)
    const sources: { path: string; name: string }[] = []
    for (const row of resourceRows.value) {
      const filename = (row.filename || 'instances.xmi').trim() || 'instances.xmi'
      const content = await service.serializeResource(row.resource)
      await createAndWriteFile(geneFS, sourceId, targetFolderPath, filename, content)
      try { row.resource.setModified?.(false); row.dirty = false } catch { /* ignore */ }
      const relativePath = useSubfolder ? `${subfolder.value}/${filename}` : filename
      sources.push({ path: relativePath, name: filename.replace(/\.[^.]+$/, '') || filename })
    }

    await updateEditorConfig(sources)

    // Refresh file system to show new files
    await geneFS.refreshSource(sourceId)
    service.triggerUpdate?.()

    emit('saved')
    emit('close')
  } catch (e) {
    console.error('[SaveInstancesDialog] Failed to save:', e)
  } finally {
    saving.value = false
  }
}

// Ensure folder exists
async function ensureFolder(geneFS: any, sourceId: string, folderPath: string, parentPath: string) {
  console.log('[SaveInstancesDialog] ensureFolder called:', { sourceId, folderPath, parentPath, subfolder: subfolder.value })

  try {
    // Check if folder already exists
    const existing = geneFS.getFileByPath(sourceId, folderPath)
    if (existing) {
      console.log('[SaveInstancesDialog] Folder already exists:', folderPath)
      return
    }

    // Create the subfolder using sourceId and paths
    console.log('[SaveInstancesDialog] Creating folder with:', { sourceId, parentPath, subfolderName: subfolder.value })
    await geneFS.createFolder(sourceId, parentPath, subfolder.value)
    console.log('[SaveInstancesDialog] Created folder:', folderPath)

    // Refresh to update the file tree
    await geneFS.refreshSource(sourceId)

    // Verify folder was created
    const created = geneFS.getFileByPath(sourceId, folderPath)
    console.log('[SaveInstancesDialog] Folder verification after create:', created ? 'SUCCESS' : 'FAILED')
  } catch (e) {
    console.error('[SaveInstancesDialog] Failed to create folder:', e)
    throw e // Re-throw to stop the save process
  }
}

// Create and write file through Gene file system
async function createAndWriteFile(geneFS: any, sourceId: string, folderPath: string, filename: string, content: string) {
  // Build file path (handle empty folderPath for root level)
  const filePath = folderPath ? `${folderPath}/${filename}` : filename
  console.log('[SaveInstancesDialog] createAndWriteFile:', { sourceId, folderPath, filename, filePath })

  // Check if file already exists
  let fileEntry = geneFS.getFileByPath(sourceId, filePath)
  console.log('[SaveInstancesDialog] Existing file entry:', fileEntry)

  if (!fileEntry) {
    // Create new file
    console.log('[SaveInstancesDialog] Creating file with:', { sourceId, folderPath: folderPath || '(root)', filename })
    await geneFS.createFile(sourceId, folderPath, filename)
    console.log('[SaveInstancesDialog] Created file:', filePath)

    // Refresh to update the file tree and get the entry
    await geneFS.refreshSource(sourceId)
    fileEntry = geneFS.getFileByPath(sourceId, filePath)
    console.log('[SaveInstancesDialog] File entry after refresh:', fileEntry)
  }

  if (!fileEntry) {
    throw new Error(`Could not find or create file: ${filePath}`)
  }

  // Write content
  await geneFS.writeTextFile(fileEntry, content)
  console.log('[SaveInstancesDialog] Wrote file:', filePath, '- content length:', content.length)
}

// Update EditorConfig with instance sources and save workspace
async function updateEditorConfig(sources: { path: string; name: string }[]) {
  const editorConfig = editorConfigService.value
  if (!editorConfig) {
    console.warn('[SaveInstancesDialog] EditorConfig not available')
    return
  }

  // Clear existing instance sources first
  if (editorConfig.clearInstanceSources) {
    editorConfig.clearInstanceSources()
  }

  // Add instance sources to EditorConfig
  for (const source of sources) {
    if (editorConfig.addInstanceSource) {
      editorConfig.addInstanceSource(source.path, source.name, {
        enabled: true
      })
      console.log('[SaveInstancesDialog] Added instance source:', source.path)
    }
  }

  // Save workspace file
  try {
    const geneFS = tsm?.getService('gene.filesystem')
    if (geneFS && editorConfig.workspaceFileEntry?.value) {
      await editorConfig.saveToFileSystem(async (entry: any, content: string) => {
        await geneFS.writeTextFile(entry, content)
      })
      console.log('[SaveInstancesDialog] Workspace saved successfully')
    } else {
      console.warn('[SaveInstancesDialog] Cannot save workspace - file system or entry not available')
    }
  } catch (e) {
    console.error('[SaveInstancesDialog] Failed to save workspace:', e)
  }
}

const hasInstances = computed(() => resourceRows.value.length > 0)
const canSave = computed(() => hasInstances.value && canSaveToWorkspace.value)
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click.self="emit('close')">
      <div class="dialog-container">
        <!-- Header -->
        <div class="dialog-header">
          <span class="dialog-title">Save Instances</span>
          <button class="close-btn" @click="emit('close')">
            <i class="pi pi-times"></i>
          </button>
        </div>

        <div class="dialog-body">
          <!-- No instances message -->
          <div v-if="!hasInstances" class="empty-message">
            <i class="pi pi-info-circle"></i>
            <span>No instances to save. Create some instances first.</span>
          </div>

          <template v-else>
            <!-- Managed resources: one file per resource -->
            <div class="file-per-entity-section">
              <p class="section-label">Each resource is saved to its own file:</p>
              <div class="instances-table">
                <DataTable :value="resourceRows" size="small" scrollable scrollHeight="280px">
                  <Column header="" style="width: 28px">
                    <template #body="{ data }">
                      <span v-if="data.dirty" class="source-path" title="Unsaved changes">●</span>
                    </template>
                  </Column>
                  <Column header="Filename">
                    <template #body="{ data }">
                      <InputText v-model="data.filename" size="small" class="target-file-input" />
                    </template>
                  </Column>
                </DataTable>
              </div>
            </div>

            <!-- Save Location -->
            <div class="location-section">
              <div class="field">
                <label>Folder (relative to workspace)</label>
                <Dropdown
                  v-model="subfolder"
                  :options="folderOptions"
                  optionLabel="label"
                  optionValue="value"
                  placeholder="Select folder..."
                  editable
                  class="folder-dropdown"
                >
                  <template #option="{ option }">
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <i :class="option.icon" style="font-size: 0.85rem;"></i>
                      <span>{{ option.label }}</span>
                    </div>
                  </template>
                </Dropdown>
              </div>
              <div class="save-path-preview">
                <i class="pi pi-folder"></i>
                <span class="location-path">{{ savePathDisplay }}</span>
              </div>
            </div>

            <div v-if="!canSaveToWorkspace" class="warning-message">
              <i class="pi pi-exclamation-triangle"></i>
              <span>No workspace loaded. Open a workspace first.</span>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div class="dialog-footer">
          <Button label="Cancel" text size="small" @click="emit('close')" />
          <Button
            :label="saving ? 'Saving...' : 'Save'"
            icon="pi pi-save"
            size="small"
            :disabled="!canSave || saving"
            :loading="saving"
            @click="handleSave"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-container {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  width: 600px;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--surface-border);
  flex-shrink: 0;
}

.dialog-title {
  font-size: 0.875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-color);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.close-btn:hover {
  color: var(--text-color);
  background: var(--surface-hover);
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-message {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px;
  background: var(--surface-ground);
  border-radius: 8px;
  color: var(--text-color-secondary);
}

.empty-message i {
  font-size: 1.25rem;
}

.strategy-section {
  margin-bottom: 8px;
}

.strategy-dropdown {
  width: 100%;
}

.single-file-section,
.file-per-entity-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field label {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
}

.section-label {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-color);
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-label i {
  color: var(--primary-color);
}

.source-files-info {
  padding: 12px;
  background: color-mix(in srgb, var(--green-500) 10%, var(--surface-ground));
  border: 1px solid color-mix(in srgb, var(--green-500) 30%, transparent);
  border-radius: 8px;
}

.source-file-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.source-file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--surface-card);
  border-radius: 4px;
  font-size: 0.8125rem;
}

.source-file-item i {
  color: var(--primary-color);
}

.source-filename {
  font-family: monospace;
  font-weight: 500;
}

.object-count {
  color: var(--text-color-secondary);
  font-size: 0.75rem;
}

.target-file-input {
  width: 100%;
  font-family: monospace;
  font-size: 0.8125rem;
}

.source-path {
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--primary-color);
  cursor: help;
}

.no-source {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  font-style: italic;
}

.instances-table {
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  overflow: hidden;
}

:deep(.p-datatable) {
  font-size: 0.8125rem;
  background: var(--surface-card);
}

:deep(.p-datatable .p-datatable-thead > tr > th) {
  padding: 0.5rem;
  font-size: 0.75rem;
  background: #e8e8e8;
  color: var(--text-color);
  border-color: var(--surface-border);
}

:deep(.p-datatable .p-datatable-tbody > tr) {
  background: var(--surface-card);
  color: var(--text-color);
}

:deep(.p-datatable .p-datatable-tbody > tr:hover) {
  background: var(--surface-hover);
}

:deep(.p-datatable .p-datatable-tbody > tr > td) {
  padding: 0.4rem 0.5rem;
  border-color: var(--surface-border);
}

.class-name {
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--primary-color);
}

.location-section {
  padding-top: 8px;
  border-top: 1px solid var(--surface-border);
}

.location-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.location-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.location-info label {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.location-path {
  font-size: 0.875rem;
  color: var(--text-color);
  font-family: monospace;
}

.save-path-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--surface-ground);
  border-radius: 6px;
  margin-top: 8px;
}

.save-path-preview i {
  color: var(--primary-color);
}

.warning-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--yellow-500) 15%, var(--surface-ground));
  border: 1px solid var(--yellow-500);
  border-radius: 6px;
  margin-top: 8px;
  color: var(--yellow-700);
  font-size: 0.8125rem;
}

.warning-message i {
  color: var(--yellow-600);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--surface-border);
  background: #e8e8e8;
  flex-shrink: 0;
}
</style>

<style>
/* Dark mode overrides (unscoped for Teleport) */
.dark-theme .dialog-container .p-datatable .p-datatable-thead > tr > th {
  background: #535353 !important;
}

.dark-theme .dialog-container .p-datatable .p-datatable-tbody > tr {
  background: #2a2a2a !important;
  color: #e0e0e0 !important;
}

.dark-theme .dialog-container .p-datatable .p-datatable-tbody > tr:hover {
  background: #3a3a3a !important;
}

.dark-theme .dialog-container .p-datatable .p-datatable-tbody > tr > td {
  border-color: #404040 !important;
}

.dark-theme .dialog-container .dialog-footer {
  background: #323232 !important;
}
</style>
