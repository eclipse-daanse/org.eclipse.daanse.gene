<script setup lang="ts">
/**
 * AtlasBrowserTree Component
 *
 * Tree view for browsing Model Atlas servers.
 * Supports connect dialog, lazy-loading of stages, and context menu actions.
 */

import { ref, computed, inject, onMounted } from 'tsm:vue'
import { Tree, Button, Dialog, InputText, ContextMenu, ProgressSpinner } from 'tsm:primevue'
import { useSharedAtlasBrowser } from '../composables/useAtlasBrowser'
import type { AtlasTreeNodeData, ConnectFormData } from '../types'

/** PrimeVue-compatible tree node */
interface TreeNode {
  key?: string
  label?: string
  icon?: string
  leaf?: boolean
  data?: any
  children?: TreeNode[]
}

const browser = useSharedAtlasBrowser()

// TSM for service access
const tsm = inject<any>('tsm')

// WorkspaceActionService for direct App-level actions (replaces emits)
function getActions() {
  return tsm?.getService('gene.workspace.actions')
}

// Connect dialog state
const showConnectDialog = ref(false)
const connectForm = ref<ConnectFormData>({
  baseUrl: 'http://localhost:8185/rest',
  scopeName: 'main',
  token: ''
})
const connectError = ref<string | null>(null)
const connecting = ref(false)

// Refresh all expanded stages
const refreshingAll = ref(false)

async function handleRefreshAll() {
  refreshingAll.value = true
  try {
    // Find all stage nodes that have been expanded (have children loaded)
    function collectStageNodes(nodes: TreeNode[]): TreeNode[] {
      const result: TreeNode[] = []
      for (const node of nodes) {
        const data = node.data as AtlasTreeNodeData
        if (data?.type === 'stage' && node.children && node.children.length > 0) {
          result.push(node)
        }
        if (node.children) result.push(...collectStageNodes(node.children))
      }
      return result
    }
    const stageNodes = collectStageNodes(browser.treeNodes.value)
    await Promise.all(stageNodes.map(n => browser.loadStageChildren(n)))
  } finally {
    refreshingAll.value = false
  }
}

// Tree state
const selectedKey = ref<Record<string, boolean>>({})
const expandedKeys = ref<Record<string, boolean>>({})

// Context menu
const contextMenu = ref()
const contextMenuItems = ref<any[]>([])
const contextMenuNode = ref<TreeNode | null>(null)

// Connect to Atlas server
async function handleConnect() {
  connectError.value = null
  connecting.value = true

  try {
    await browser.connect({ ...connectForm.value })
    showConnectDialog.value = false
    connectForm.value = { baseUrl: 'http://localhost:8185/rest', scopeName: 'main', token: '' }
  } catch (e: any) {
    connectError.value = e.message || 'Connection failed'
  } finally {
    connecting.value = false
  }
}

const saveFeedback = ref<'saving' | 'saved' | 'error' | null>(null)

// Save current connection to workspace EditorConfig
function handleSaveToWorkspace() {
  const editorConfig = tsm?.getService('gene.editor.config')
  console.log('[AtlasBrowser] Save to workspace, editorConfig:', !!editorConfig, 'value:', !!editorConfig?.editorConfig?.value)
  if (!editorConfig?.editorConfig?.value) {
    console.warn('[AtlasBrowser] No EditorConfig available')
    return
  }

  const config = editorConfig.editorConfig.value
  const eClass = config.eClass?.()
  const atlasFeature = eClass?.getEStructuralFeature?.('atlasConnections')
  if (!atlasFeature) {
    console.warn('[AtlasBrowser] EditorConfig has no atlasConnections feature')
    return
  }

  // Get or create the factory
  const pkg = eClass.getEPackage?.()
  const factory = pkg?.getEFactoryInstance?.()
  if (!factory) return

  // Clear existing and re-add all current connections
  const connections: any[] = []
  for (const conn of browser.connections.value) {
    if (conn.status !== 'connected') continue
    const atlasConn = factory.create(eClass.getEPackage().getEClassifier('AtlasConnection'))
    const acClass = atlasConn.eClass()
    const set = (name: string, value: any) => {
      const f = acClass.getEStructuralFeature(name)
      if (f && value !== undefined && value !== null) atlasConn.eSet(f, value)
    }
    set('name', conn.label || `${conn.scopeName}@${conn.baseUrl}`)
    set('baseUrl', conn.baseUrl)
    set('scopeName', conn.scopeName)
    set('token', conn.token || '')
    set('autoConnect', true)
    set('enabled', true)
    connections.push(atlasConn)
  }

  config.atlasConnections = connections

  // Save directly to file
  const geneFS = tsm?.getService('gene.filesystem')
  if (editorConfig.saveToFileSystem && geneFS?.writeTextFile) {
    saveFeedback.value = 'saving'
    editorConfig.saveToFileSystem(geneFS.writeTextFile).then(() => {
      saveFeedback.value = 'saved'
      setTimeout(() => { saveFeedback.value = null }, 2000)
    }).catch((e: any) => {
      saveFeedback.value = 'error'
      console.error('[AtlasBrowser] Failed to save workspace:', e)
      setTimeout(() => { saveFeedback.value = null }, 3000)
    })
  }
}

// Check if workspace is open
const isWorkspaceOpen = computed(() => {
  const editorConfig = tsm?.getService('gene.editor.config')
  return !!editorConfig?.editorConfig?.value
})

// Auto-connect from workspace EditorConfig on mount
onMounted(async () => {
  const editorConfig = tsm?.getService('gene.editor.config')
  const config = editorConfig?.editorConfig?.value
  if (!config) return

  const eClass = config.eClass?.()
  const atlasFeature = eClass?.getEStructuralFeature?.('atlasConnections')
  if (!atlasFeature) return

  const atlasConnections = config.eGet(atlasFeature) || []
  for (const conn of atlasConnections) {
    const acClass = conn.eClass()
    const get = (name: string) => {
      const f = acClass.getEStructuralFeature(name)
      return f ? conn.eGet(f) : undefined
    }

    const enabled = get('enabled')
    const autoConnect = get('autoConnect')
    if (enabled === false || autoConnect === false) continue

    const baseUrl = get('baseUrl')
    const scopeName = get('scopeName')
    const token = get('token')

    if (baseUrl && scopeName) {
      // Skip if already connected to this scope+url
      const alreadyConnected = browser.connections.value.some(
        (c: any) => c.baseUrl === baseUrl && c.scopeName === scopeName && c.status === 'connected'
      )
      if (alreadyConnected) continue

      try {
        console.log(`[AtlasBrowser] Auto-connecting: ${scopeName}@${baseUrl}`)
        await browser.connect({ baseUrl, scopeName, token: token || '' })
      } catch (e: any) {
        console.warn(`[AtlasBrowser] Auto-connect failed for ${scopeName}:`, e.message)
      }
    }
  }
})

// Handle node expand (lazy loading for stage nodes)
async function handleNodeExpand(node: TreeNode) {
  const data = node.data as AtlasTreeNodeData
  if (!data) return

  if (data.type === 'stage' && (!node.children || node.children.length === 0)) {
    await browser.loadStageChildren(node)
  }
}

// Layout helper — open content tabs when a schema/object is selected
function openContentTabs() {
  const panelRegistry = tsm?.getService('ui.registry.panels')
  // Get layoutState via TSM service (set by App.vue polling)
  const layoutService = tsm?.getService('gene.layout.service')
  const ls = layoutService?.useLayoutState?.()
  if (!ls || !panelRegistry) return

  const tabIds = ['atlas-detail', 'atlas-graph', 'atlas-xml', 'atlas-explorer']
  for (const id of tabIds) {
    const panel = panelRegistry.get?.(id)
    if (panel) {
      ls.openEditor({
        id: panel.id,
        title: panel.title,
        icon: panel.icon,
        component: panel.component,
        closable: false
      })
    }
  }
  ls.selectEditor('atlas-detail')
}

// Handle node selection
function handleNodeSelect(node: TreeNode) {
  const data = node.data as AtlasTreeNodeData
  if (!data) return

  browser.selectNode(node.key as string)

  // Open content tabs when a schema or object is selected
  if (data.type === 'schema' || data.type === 'object') {
    openContentTabs()
  }
}

// Handle node unselect
function handleNodeUnselect() {
  browser.selectNode(null)
}

// Context menu on right click
function handleContextMenu(event: MouseEvent, node: TreeNode) {
  const data = node.data as AtlasTreeNodeData
  if (!data) return

  contextMenuNode.value = node
  const items: any[] = []

  if (data.type === 'schema') {
    items.push({
      label: 'Add Model to Workspace',
      icon: 'pi pi-plus',
      command: () => addToWorkspace(data, true)
    })
    items.push({
      label: 'Open in Modeler',
      icon: 'pi pi-pencil',
      command: () => openInModeler(data)
    })
    if (!isStageWritable(node)) {
      // Final stage — no delete
    } else {
      items.push({ separator: true })
      items.push({
        label: 'Delete from Atlas',
        icon: 'pi pi-trash',
        command: () => handleDeleteFromAtlas(data)
      })
    }
  } else if (data.type === 'object') {
    items.push({
      label: 'Add Instances to Workspace',
      icon: 'pi pi-plus',
      command: () => addToWorkspace(data, false)
    })
    if (isStageWritable(node)) {
      items.push({ separator: true })
      items.push({
        label: 'Delete from Atlas',
        icon: 'pi pi-trash',
        command: () => handleDeleteFromAtlas(data)
      })
    }
  } else if (data.type === 'scope') {
    items.push({
      label: 'Disconnect',
      icon: 'pi pi-power-off',
      command: () => browser.disconnect(data.connectionId)
    })
  } else if (data.type === 'stage') {
    if (data.isSchemaRegistry) {
      items.push({
        label: 'Upload Schema...',
        icon: 'pi pi-cloud-upload',
        command: () => handleUploadToStage(data)
      })
      items.push({ separator: true })
    }
    items.push({
      label: 'Refresh',
      icon: 'pi pi-refresh',
      command: () => refreshStage(node)
    })
  }

  if (items.length > 0) {
    contextMenuItems.value = items
    contextMenu.value?.show(event)
  }
}

// Add schema or object to workspace
async function addToWorkspace(data: AtlasTreeNodeData, isSchema: boolean) {
  const result = await browser.getContentForWorkspace(data)
  if (!result) return

  const actions = getActions()
  const entry = { name: result.filename, path: `atlas://${result.filename}`, sourceId: 'atlas' }
  if (isSchema) {
    actions?.loadModel(entry, result.content)
  } else {
    actions?.loadInstances(entry, result.content)
  }
}

// Check if a node's stage is writable (not final)
function isStageWritable(node: TreeNode): boolean {
  const data = node.data as AtlasTreeNodeData
  if (!data) return false
  // Schema/object nodes: check parent stage node's icon (pi-lock = final)
  if (data.type === 'schema' || data.type === 'object') {
    // Find stage info from registry info
    const info = browser.getRegistryInfo(data.connectionId, data.registryName || (data.isSchemaRegistry ? 'schema' : ''))
    if (info) {
      const stage = info.stages.find((s: any) => s.name === data.stageName)
      if (stage) return !stage.final
    }
    return true // default: writable
  }
  return false
}

// Delete schema or object from Atlas
async function handleDeleteFromAtlas(data: AtlasTreeNodeData) {
  const client = browser.getClient(data.connectionId)
  if (!client) return

  // Decode Base64 object ID (Atlas uses Base64-encoded nsUri/objectId)
  let decodedId = data.objectId || ''
  try { decodedId = atob(decodedId) } catch { /* not encoded */ }

  try {
    let success = false
    if (data.isSchemaRegistry) {
      // Delete schema by nsUri (objectId is the nsUri)
      success = await client.deleteSchema(data.scopeName!, data.stageName!, decodedId)
    } else {
      success = await client.deleteObject(data.scopeName!, data.registryName!, data.stageName!, decodedId)
    }

    if (success) {
      console.log(`[AtlasBrowser] Deleted ${data.isSchemaRegistry ? 'schema' : 'object'}: ${decodedId}`)
      // Refresh the parent stage
      await browser.refreshStage(data.connectionId, data.scopeName!, data.registryName!, data.stageName!)
    } else {
      console.error('[AtlasBrowser] Delete failed')
    }
  } catch (e: any) {
    console.error('[AtlasBrowser] Delete error:', e.message)
  }
}

// Open schema in Metamodeler for editing
async function openInModeler(data: AtlasTreeNodeData) {
  const result = await browser.getContentForWorkspace(data)
  if (!result) return

  const openFn = tsm?.getService('gene.metamodel.preview')
  if (openFn) {
    openFn(result.content, data.metadata?.objectName || 'Schema')
  }
}

// View schema as graph

// Refresh a stage node
async function refreshStage(node: TreeNode) {
  node.children = []
  await browser.loadStageChildren(node)
}

// Upload schema to a stage via native file picker
async function handleUploadToStage(data: AtlasTreeNodeData) {
  try {
    // Open native file picker for .ecore files
    const [fileHandle] = await (window as any).showOpenFilePicker({
      types: [{
        description: 'Ecore Metamodel',
        accept: { 'application/xml': ['.ecore'] }
      }],
      multiple: false
    })

    const file = await fileHandle.getFile()
    const content = await file.text()

    const result = await browser.uploadSchema(
      data.connectionId,
      data.stageName!,
      content,
      { name: file.name.replace(/\.ecore$/, '') }
    )

    if (result.success) {
      console.log('[AtlasBrowserTree] Schema uploaded successfully')
      // Refresh the stage to show the new schema
      const stageNode = findNodeByKey(browser.treeNodes.value, `${data.connectionId}/${data.scopeName}/${data.registryName}/${data.stageName}`)
      if (stageNode) {
        await refreshStage(stageNode)
      }
    } else {
      console.error('[AtlasBrowserTree] Upload failed:', result.error)
      alert('Upload failed: ' + (result.error || 'Unknown error'))
    }
  } catch (e: any) {
    // User cancelled file picker
    if (e.name === 'AbortError') return
    console.error('[AtlasBrowserTree] Upload error:', e)
    alert('Upload error: ' + e.message)
  }
}

// Find a tree node by key (recursive)
function findNodeByKey(nodes: TreeNode[], key: string): TreeNode | null {
  for (const node of nodes) {
    if (node.key === key) return node
    if (node.children) {
      const found = findNodeByKey(node.children, key)
      if (found) return found
    }
  }
  return null
}

// Check if tree is empty
const isEmpty = computed(() => browser.treeNodes.value.length === 0)
</script>

<template>
  <div class="atlas-browser-tree">
    <!-- Toolbar -->
    <div class="atlas-toolbar">
      <Button
        icon="pi pi-plus"
        label="Add Server"
        size="small"
        severity="secondary"
        @click="showConnectDialog = true"
      />
      <Button
        icon="pi pi-refresh"
        severity="secondary"
        text
        rounded
        size="small"
        :loading="refreshingAll"
        :disabled="isEmpty"
        tooltip="Refresh all stages"
        @click="handleRefreshAll"
      />
      <Button
        v-if="isWorkspaceOpen && !isEmpty"
        icon="pi pi-save"
        severity="secondary"
        text
        rounded
        size="small"
        :loading="saveFeedback === 'saving'"
        tooltip="Save connections to workspace"
        @click="handleSaveToWorkspace"
      />
      <span v-if="saveFeedback === 'saved'" class="save-feedback saved"><i class="pi pi-check"></i> Saved</span>
      <span v-if="saveFeedback === 'error'" class="save-feedback error"><i class="pi pi-times"></i> Error</span>
    </div>

    <!-- Loading indicator -->
    <div v-if="browser.loading.value" class="atlas-loading">
      <ProgressSpinner style="width: 24px; height: 24px" strokeWidth="3" />
    </div>

    <!-- Empty state -->
    <div v-if="isEmpty && !browser.loading.value" class="atlas-empty">
      <i class="pi pi-globe" style="font-size: 2rem; opacity: 0.3"></i>
      <p>No Atlas connections</p>
      <Button
        icon="pi pi-plus"
        label="Add Server"
        size="small"
        @click="showConnectDialog = true"
      />
    </div>

    <!-- Tree -->
    <Tree
      v-if="!isEmpty"
      :value="browser.treeNodes.value"
      v-model:selectionKeys="selectedKey"
      selectionMode="single"
      :expandedKeys="expandedKeys"
      @node-expand="handleNodeExpand"
      @node-select="handleNodeSelect"
      @node-unselect="handleNodeUnselect"
      @update:expandedKeys="(keys: Record<string, boolean>) => expandedKeys = keys"
      class="atlas-tree"
      @contextmenu.stop
    >
      <template #default="{ node }">
        <span
          class="atlas-tree-label"
          @contextmenu.prevent="handleContextMenu($event, node)"
        >
          {{ node.label }}
          <span v-if="node.data?.metadata?.version" class="atlas-version">
            v{{ node.data.metadata.version }}
          </span>
        </span>
      </template>
    </Tree>

    <!-- Context Menu -->
    <ContextMenu ref="contextMenu" :model="contextMenuItems" />

    <!-- Connect Dialog -->
    <Dialog
      v-model:visible="showConnectDialog"
      header="Connect to Model Atlas"
      :modal="true"
      :style="{ width: '450px' }"
    >
      <div class="connect-form">
        <div class="form-field">
          <label for="atlas-url">Server URL</label>
          <InputText
            id="atlas-url"
            v-model="connectForm.baseUrl"
            placeholder="http://localhost:8185/rest"
            class="w-full"
          />
        </div>
        <div class="form-field">
          <label for="atlas-scope">Scope</label>
          <InputText
            id="atlas-scope"
            v-model="connectForm.scopeName"
            placeholder="main"
            class="w-full"
          />
        </div>
        <div class="form-field">
          <label for="atlas-token">Token (optional)</label>
          <InputText
            id="atlas-token"
            v-model="connectForm.token"
            type="password"
            placeholder="Authentication token"
            class="w-full"
          />
        </div>
        <div v-if="connectError" class="connect-error">
          <i class="pi pi-exclamation-triangle"></i>
          {{ connectError }}
        </div>
      </div>
      <template #footer>
        <Button
          label="Cancel"
          severity="secondary"
          @click="showConnectDialog = false"
        />
        <Button
          label="Connect"
          icon="pi pi-link"
          :loading="connecting"
          @click="handleConnect"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.atlas-browser-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--p-content-background);
  color: var(--p-text-color);
}

.atlas-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--p-content-border-color);
}

.save-feedback {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 3px;
}

.save-feedback.saved {
  color: var(--green-500);
  background: color-mix(in srgb, var(--green-500) 12%, transparent);
}

.save-feedback.error {
  color: var(--red-500);
  background: color-mix(in srgb, var(--red-500) 12%, transparent);
}

.atlas-loading {
  display: flex;
  justify-content: center;
  padding: 12px;
}

.atlas-empty {
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

.atlas-empty p {
  margin: 4px 0;
  font-size: 0.85rem;
}

.atlas-tree {
  flex: 1;
  overflow: auto;
  padding: 0;
  border: none;
  background: transparent;
}

:deep(.atlas-tree .p-tree-node-content) {
  padding: 2px 4px;
}

.atlas-tree-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
}

.atlas-version {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.atlas-status {
  font-size: 0.65rem;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
  text-transform: uppercase;
}

.connect-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-field label {
  font-size: 0.85rem;
  font-weight: 500;
}

.w-full {
  width: 100%;
}

.connect-error {
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
