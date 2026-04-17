<script setup lang="ts">
/**
 * FileExplorer Component
 *
 * Unified file explorer supporting multiple sources:
 * - Local filesystem (File System Access API)
 * - Git repositories
 * - IndexedDB storage
 *
 * Workspace files (.wsp, .xmi) are highlighted and can be opened.
 */

import { ref, computed, inject } from 'tsm:vue'
import { Tree } from 'tsm:primevue'
import { Button } from 'tsm:primevue'
import { Menu } from 'tsm:primevue'
import { Dialog } from 'tsm:primevue'
import { InputText } from 'tsm:primevue'
import { Message } from 'tsm:primevue'
import { useSharedFileSystem } from '../composables/useFileSystem'
import type { FileEntry, FileTreeNode, FileSource } from '../types'
import { isWorkspaceFile } from '../types'

const fileSystem = useSharedFileSystem()

// TSM for service access
const tsm = inject<any>('tsm')

// WorkspaceActionService for direct App-level actions (replaces props/emits)
function getActions() {
  return tsm?.getService('gene.workspace.actions')
}

// Tree state
const selectedKey = ref<Record<string, boolean>>({})
const expandedKeys = ref<Record<string, boolean>>({})

// Add source menu
const addMenu = ref<InstanceType<typeof Menu> | null>(null)
const addMenuItems = [
  {
    label: 'Local Folder',
    icon: 'pi pi-folder',
    command: () => handleAddLocalSource()
  },
  {
    label: 'IndexedDB Storage',
    icon: 'pi pi-database',
    command: () => showAddIndexedDBDialog.value = true
  },
  {
    label: 'Git Repository',
    icon: 'pi pi-github',
    command: () => showAddGitDialog.value = true
  }
]

// TSM DI services via Vue inject
const _atlasUpload = inject<any>('gene.atlas.upload', null)

// Dialog state
const showAddIndexedDBDialog = ref(false)
const showAddGitDialog = ref(false)
const newSourceName = ref('')
const newDbName = ref('')
const newGitUrl = ref('')
const newGitToken = ref('')

// Context menu for sources
const contextMenu = ref<InstanceType<typeof Menu> | null>(null)
const contextMenuSource = ref<FileSource | null>(null)
const contextMenuNode = ref<FileTreeNode | null>(null)

// Check if file is an .ecore file
function isEcoreFile(entry: FileEntry): boolean {
  return entry.extension?.toLowerCase() === '.ecore'
}

// Check if file is an .xmi file (instance data, not .wsp workspace)
function isXmiFile(entry: FileEntry): boolean {
  const ext = entry.extension?.toLowerCase()
  // .xmi files are instance data, .wsp files are workspaces
  return ext === '.xmi'
}

// Check if file is a .wsp workspace file
function isWspFile(entry: FileEntry): boolean {
  const ext = entry.extension?.toLowerCase()
  return ext === '.wsp' || ext === '.workspace'
}

// Check if file is a .c-ocl file (Custom OCL constraints)
function isCoclFile(entry: FileEntry): boolean {
  return entry.extension?.toLowerCase() === '.c-ocl'
}

// Check if file is a .qvtr file (QVT-R transformation)
function isQvtrFile(entry: FileEntry): boolean {
  return entry.extension?.toLowerCase() === '.qvtr'
}

// Check if file is a .datagen file (Data Generator config)
function isDatagenFile(entry: FileEntry): boolean {
  return entry.extension?.toLowerCase() === '.datagen'
}

// Check if file is a .dmn file (DMN Decision Table)
function isDmnFile(entry: FileEntry): boolean {
  return entry.extension?.toLowerCase() === '.dmn'
}

// Context menu items - dynamic based on clicked node type
const contextMenuItems = computed(() => {
  const items: any[] = []

  console.log('[FileExplorer] contextMenuItems - workspaceOpen:', getActions()?.isWorkspaceOpen?.value)

  // For .ecore files, show "Add Model to Workspace" and "Edit Metamodel"
  // For .xmi files (not .wsp), show "Add Instances to Workspace"
  if (contextMenuNode.value?.type === 'file' || contextMenuNode.value?.type === 'workspace') {
    const entry = contextMenuNode.value.data as FileEntry
    if (isEcoreFile(entry)) {
      items.push({
        label: 'Edit Metamodel',
        icon: 'pi pi-sitemap',
        disabled: !getActions()?.isWorkspaceOpen?.value,
        command: () => handleEditMetamodel()
      })
      items.push({
        label: 'Add Model to Workspace',
        icon: 'pi pi-plus-circle',
        disabled: !getActions()?.isWorkspaceOpen?.value,
        command: () => handleAddModelToWorkspace()
      })
      items.push({
        label: 'Publish to Atlas...',
        icon: 'pi pi-cloud-upload',
        disabled: !_atlasUpload,
        command: () => handlePublishToAtlas()
      })
      items.push({ separator: true })
    }
    if (isXmiFile(entry) && !isWspFile(entry)) {
      items.push({
        label: 'Add Instances to Workspace',
        icon: 'pi pi-database',
        disabled: !getActions()?.isWorkspaceOpen?.value,
        command: () => handleAddInstancesToWorkspace()
      })
      items.push({ separator: true })
    }
    if (isCoclFile(entry)) {
      items.push({
        label: 'Add C-OCL Constraints to Workspace',
        icon: 'pi pi-check-square',
        disabled: !getActions()?.isWorkspaceOpen?.value,
        command: () => handleAddCoclToWorkspace()
      })
      items.push({ separator: true })
    }
    if (isQvtrFile(entry)) {
      items.push({
        label: 'Load Transformation',
        icon: 'pi pi-arrows-h',
        disabled: !getActions()?.isWorkspaceOpen?.value,
        command: () => handleLoadTransformation()
      })
      items.push({ separator: true })
    }
    if (isDatagenFile(entry)) {
      items.push({
        label: 'Open in Data Generator',
        icon: 'pi pi-bolt',
        disabled: !getActions()?.isWorkspaceOpen?.value,
        command: () => handleLoadDatagen()
      })
      items.push({ separator: true })
    }
    if (isDmnFile(entry)) {
      items.push({
        label: 'Open in DMN Editor',
        icon: 'pi pi-table',
        command: () => handleLoadDmn()
      })
      items.push({ separator: true })
    }
  }

  // For directories and sources, show create options
  if (contextMenuNode.value?.type === 'source' || contextMenuNode.value?.type === 'directory') {
    items.push(
      {
        label: 'New Workspace',
        icon: 'pi pi-box',
        command: () => showNewWorkspaceDialog.value = true
      },
      {
        label: 'New Folder',
        icon: 'pi pi-folder-plus',
        command: () => showNewFolderDialog.value = true
      },
      {
        label: 'New File',
        icon: 'pi pi-file-plus',
        command: () => showNewFileDialog.value = true
      },
      {
        label: 'New Constraint File (.c-ocl)',
        icon: 'pi pi-check-square',
        command: () => showNewCoclDialog.value = true
      }
    )
  }

  // Only add Refresh and Remove for source nodes
  if (contextMenuNode.value?.type === 'source') {
    items.push(
      { separator: true },
      {
        label: 'Refresh',
        icon: 'pi pi-refresh',
        command: () => {
          if (contextMenuSource.value) {
            fileSystem.refreshSource(contextMenuSource.value.id)
          }
        }
      },
      {
        label: 'Remove',
        icon: 'pi pi-trash',
        command: () => {
          if (contextMenuSource.value) {
            fileSystem.removeSource(contextMenuSource.value.id)
          }
        }
      }
    )
  }

  return items
})

// New folder/file/workspace dialog state
const showNewFolderDialog = ref(false)
const showNewFileDialog = ref(false)
const showNewWorkspaceDialog = ref(false)
const showNewCoclDialog = ref(false)
const newItemName = ref('')
const newCoclName = ref('')

// Has any sources?
const hasSources = computed(() => fileSystem.sources.value.length > 0)

// Handle node selection (PrimeVue passes node directly in v4)
function handleNodeSelect(node: FileTreeNode) {
  console.log('handleNodeSelect called with:', node)

  // Handle both direct node and event object formats
  const treeNode = (node as any).node ?? node

  if (treeNode.type === 'source') {
    // Source selected, expand it
    expandedKeys.value[treeNode.key] = true
    return
  }

  const entry = treeNode.data as FileEntry
  console.log('File selected:', entry)
  // Update shared state so WorkspacePreview can react
  fileSystem.selectedFile.value = entry
  getActions()?.selectFile(entry)

  // Auto-expand directories on select
  if (entry.isDirectory) {
    expandedKeys.value[treeNode.key] = true
  }
}

// Handle double-click to open files
async function handleNodeDoubleClick(node: FileTreeNode) {
  // Handle both direct node and event object formats
  const treeNode = (node as any).node ?? node

  if (treeNode.type === 'source') return

  const entry = treeNode.data as FileEntry
  if (entry.isDirectory) return

  if (isWorkspaceFile(entry)) {
    // Read content and open workspace via service
    try {
      const content = await fileSystem.readTextFile(entry)
      if (content) {
        getActions()?.openWorkspace(entry, content)
      }
    } catch (e) {
      console.error('[FileExplorer] Failed to read workspace file:', e)
    }
  }
}

// Handle context menu for all node types
function handleContextMenu(event: MouseEvent, node: FileTreeNode) {
  contextMenuNode.value = node

  if (node.type === 'source') {
    contextMenuSource.value = node.data as FileSource
  } else {
    // Find the source for this node (from the key: "sourceId:path")
    const sourceId = node.key.split(':')[0]
    contextMenuSource.value = fileSystem.getSource(sourceId) ?? null
  }

  // Show context menu for sources, directories, .ecore files, and .xmi files (not .wsp)
  if (node.type === 'source' || node.type === 'directory') {
    contextMenu.value?.show(event)
  } else if (node.type === 'file' || node.type === 'workspace') {
    const entry = node.data as FileEntry
    // Show for .ecore files, .xmi files (but not .wsp workspace files), .c-ocl files, .qvtr files, or .dmn files
    if (isEcoreFile(entry) || (isXmiFile(entry) && !isWspFile(entry)) || isCoclFile(entry) || isQvtrFile(entry) || isDmnFile(entry)) {
      contextMenu.value?.show(event)
    }
  }
}

// Add source handlers
async function handleAddLocalSource() {
  await fileSystem.addLocalSource()
}

function handleAddIndexedDB() {
  if (!newSourceName.value || !newDbName.value) return
  fileSystem.addIndexedDBSource(newSourceName.value, newDbName.value)
  showAddIndexedDBDialog.value = false
  newSourceName.value = ''
  newDbName.value = ''
}

function handleAddGit() {
  if (!newSourceName.value || !newGitUrl.value) return
  fileSystem.addGitSource(newSourceName.value, newGitUrl.value, newGitToken.value || undefined)
  showAddGitDialog.value = false
  newSourceName.value = ''
  newGitUrl.value = ''
  newGitToken.value = ''
}

// Handle refresh all
async function handleRefreshAll() {
  await fileSystem.refreshAll()
}

// Handle create folder
async function handleCreateFolder() {
  if (!newItemName.value || !contextMenuSource.value) return

  // Determine the parent path
  let parentPath = ''
  if (contextMenuNode.value?.type === 'directory') {
    const entry = contextMenuNode.value.data as FileEntry
    parentPath = entry.path
  }

  try {
    await fileSystem.createFolder(contextMenuSource.value.id, parentPath, newItemName.value)
    showNewFolderDialog.value = false
    newItemName.value = ''
    // Expand the parent node
    if (contextMenuNode.value) {
      expandedKeys.value[contextMenuNode.value.key] = true
    }
  } catch (e: any) {
    console.error('Failed to create folder:', e)
  }
}

// Handle create file
async function handleCreateFile() {
  if (!newItemName.value || !contextMenuSource.value) return

  // Determine the parent path
  let parentPath = ''
  if (contextMenuNode.value?.type === 'directory') {
    const entry = contextMenuNode.value.data as FileEntry
    parentPath = entry.path
  }

  try {
    await fileSystem.createFile(contextMenuSource.value.id, parentPath, newItemName.value)
    showNewFileDialog.value = false
    newItemName.value = ''
    // Expand the parent node
    if (contextMenuNode.value) {
      expandedKeys.value[contextMenuNode.value.key] = true
    }
  } catch (e: any) {
    console.error('Failed to create file:', e)
  }
}

// Handle create C-OCL constraint file
async function handleCreateCoclFile() {
  if (!newCoclName.value || !contextMenuSource.value) return

  let parentPath = ''
  if (contextMenuNode.value?.type === 'directory') {
    const entry = contextMenuNode.value.data as FileEntry
    parentPath = entry.path
  }

  // Ensure .c-ocl extension
  let fileName = newCoclName.value
  if (!fileName.endsWith('.c-ocl')) {
    fileName += '.c-ocl'
  }

  const setName = newCoclName.value.replace(/\.c-ocl$/, '')
  const template = `<?xml version="1.0" encoding="UTF-8"?>
<cocl:OclConstraintSet xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:cocl="http://www.gme.org/cocl/1.0"
    name="${setName}"
    version="1.0"
    description="">

</cocl:OclConstraintSet>
`

  try {
    await fileSystem.createFile(contextMenuSource.value.id, parentPath, fileName)
    await fileSystem.refreshSource(contextMenuSource.value.id)
    // Write the template content
    const filePath = parentPath ? `${parentPath}/${fileName}` : fileName
    const fileEntry = fileSystem.getFileByPath(contextMenuSource.value.id, filePath)
    if (fileEntry) {
      await fileSystem.writeTextFile(fileEntry, template)
    }
    showNewCoclDialog.value = false
    newCoclName.value = ''
    if (contextMenuNode.value) {
      expandedKeys.value[contextMenuNode.value.key] = true
    }
  } catch (e: any) {
    console.error('Failed to create C-OCL file:', e)
  }
}

// Handle create workspace
async function handleCreateWorkspace() {
  if (!newItemName.value || !contextMenuSource.value) return

  // Determine the parent path
  let parentPath = ''
  if (contextMenuNode.value?.type === 'directory') {
    const entry = contextMenuNode.value.data as FileEntry
    parentPath = entry.path
  }

  // Ensure .wsp extension
  let fileName = newItemName.value
  if (!fileName.endsWith('.wsp') && !fileName.endsWith('.xmi')) {
    fileName += '.wsp'
  }

  try {
    await fileSystem.createWorkspace(contextMenuSource.value.id, parentPath, fileName, newItemName.value.replace(/\.(wsp|xmi)$/, ''))
    showNewWorkspaceDialog.value = false
    newItemName.value = ''
    // Expand the parent node
    if (contextMenuNode.value) {
      expandedKeys.value[contextMenuNode.value.key] = true
    }
  } catch (e: any) {
    console.error('Failed to create workspace:', e)
  }
}

// Handle adding model (.ecore) to workspace
async function handleAddModelToWorkspace() {
  console.log('[FileExplorer] handleAddModelToWorkspace called')
  console.log('[FileExplorer] contextMenuNode:', contextMenuNode.value?.type, contextMenuNode.value?.data?.name)

  if (!contextMenuNode.value || contextMenuNode.value.type !== 'file') {
    console.log('[FileExplorer] Skipping - not a file node')
    return
  }

  const entry = contextMenuNode.value.data as FileEntry
  console.log('[FileExplorer] entry:', entry.name, 'isEcore:', isEcoreFile(entry))

  if (!isEcoreFile(entry)) {
    console.log('[FileExplorer] Skipping - not an ecore file')
    return
  }

  try {
    // Read the .ecore file content
    const content = await fileSystem.readTextFile(entry)
    console.log('[FileExplorer] Read content length:', content?.length)

    if (content) {
      console.log('[FileExplorer] Emitting model-add:', entry.name)
      getActions()?.loadModel(entry, content)
    }
  } catch (e: any) {
    console.error('[FileExplorer] Failed to read .ecore file:', e)
  }
}

// Handle editing metamodel (.ecore) in Metamodeler
async function handleEditMetamodel() {
  if (!contextMenuNode.value || contextMenuNode.value.type !== 'file') return

  const entry = contextMenuNode.value.data as FileEntry
  if (!isEcoreFile(entry)) return

  try {
    // Read the .ecore file content
    const content = await fileSystem.readTextFile(entry)

    if (content) {
      console.log('Opening metamodel in editor:', entry.name)
      getActions()?.openMetamodelInEditor(entry, content)
    }
  } catch (e: any) {
    console.error('Failed to read .ecore file:', e)
  }
}

// Handle publishing .ecore to Atlas
async function handlePublishToAtlas() {
  if (!contextMenuNode.value || contextMenuNode.value.type !== 'file') return

  const entry = contextMenuNode.value.data as FileEntry
  if (!isEcoreFile(entry)) return

  try {
    const content = await fileSystem.readTextFile(entry)
    if (content) {
      getActions()?.publishToAtlas(entry, content)
    }
  } catch (e: any) {
    console.error('[FileExplorer] Failed to read .ecore file for Atlas publish:', e)
  }
}

// Handle adding instances (.xmi) to workspace
async function handleAddInstancesToWorkspace() {
  // Note: .xmi files have type 'workspace' not 'file'
  if (!contextMenuNode.value || (contextMenuNode.value.type !== 'file' && contextMenuNode.value.type !== 'workspace')) return

  const entry = contextMenuNode.value.data as FileEntry
  if (!isXmiFile(entry) || isWspFile(entry)) return

  try {
    // Read the .xmi file content
    const content = await fileSystem.readTextFile(entry)

    if (content) {
      console.log('[FileExplorer] Adding instances to workspace:', entry.name, 'content length:', content.length)
      getActions()?.loadInstances(entry, content)
      console.log('[FileExplorer] instance-add event emitted')
    } else {
      console.warn('[FileExplorer] No content read from file:', entry.name)
    }
  } catch (e: any) {
    console.error('[FileExplorer] Failed to read .xmi file:', e)
  }
}

// Handle adding C-OCL constraints (.c-ocl) to workspace
async function handleAddCoclToWorkspace() {
  if (!contextMenuNode.value || contextMenuNode.value.type !== 'file') return

  const entry = contextMenuNode.value.data as FileEntry
  if (!isCoclFile(entry)) return

  try {
    // Read the .c-ocl file content
    const content = await fileSystem.readTextFile(entry)

    if (content) {
      console.log('[FileExplorer] Adding C-OCL constraints to workspace:', entry.name, 'content length:', content.length)
      getActions()?.loadCoclFile(entry, content)
      console.log('[FileExplorer] cocl-add event emitted')
    } else {
      console.warn('[FileExplorer] No content read from file:', entry.name)
    }
  } catch (e: any) {
    console.error('[FileExplorer] Failed to read .c-ocl file:', e)
  }
}

// Handle loading a QVT-R transformation (.qvtr) into the Transformation Editor
async function handleLoadTransformation() {
  if (!contextMenuNode.value || contextMenuNode.value.type !== 'file') return

  const entry = contextMenuNode.value.data as FileEntry
  if (!isQvtrFile(entry)) return

  try {
    const content = await fileSystem.readTextFile(entry)

    if (content) {
      console.log('[FileExplorer] Loading transformation:', entry.name, 'content length:', content.length)
      getActions()?.loadTransformation(entry, content)
    }
  } catch (e: any) {
    console.error('[FileExplorer] Failed to read .qvtr file:', e)
  }
}

// Handle loading a .datagen file into the Data Generator
async function handleLoadDatagen() {
  if (!contextMenuNode.value || contextMenuNode.value.type !== 'file') return

  const entry = contextMenuNode.value.data as FileEntry
  if (!isDatagenFile(entry)) return

  try {
    const content = await fileSystem.readTextFile(entry)
    if (content) {
      console.log('[FileExplorer] Loading datagen:', entry.name, 'content length:', content.length)
      // TODO: datagen files are not yet handled via WorkspaceActionService
      console.warn('[FileExplorer] Datagen file loading not yet implemented via service')
    }
  } catch (e: any) {
    console.error('[FileExplorer] Failed to read .datagen file:', e)
  }
}

// Handle loading a .dmn file into the DMN Editor
async function handleLoadDmn() {
  if (!contextMenuNode.value || contextMenuNode.value.type !== 'file') return

  const entry = contextMenuNode.value.data as FileEntry
  if (!isDmnFile(entry)) return

  try {
    const content = await fileSystem.readTextFile(entry)
    if (content) {
      console.log('[FileExplorer] Loading DMN:', entry.name, 'content length:', content.length)
      getActions()?.loadDmnFile(entry, content)
    }
  } catch (e: any) {
    console.error('[FileExplorer] Failed to read .dmn file:', e)
  }
}

// Toggle add menu
function toggleAddMenu(event: Event) {
  addMenu.value?.toggle(event)
}
</script>

<template>
  <div class="file-explorer">
    <!-- Header -->
    <div class="explorer-header">
      <span class="header-title">Explorer</span>
      <div class="header-actions">
        <Button
          icon="pi pi-plus"
          text
          rounded
          size="small"
          @click="toggleAddMenu"
          v-tooltip.bottom="'Add Source'"
          aria-haspopup="true"
        />
        <Button
          v-if="hasSources"
          icon="pi pi-refresh"
          text
          rounded
          size="small"
          @click="handleRefreshAll"
          v-tooltip.bottom="'Refresh All'"
        />
      </div>
    </div>

    <!-- API not supported message -->
    <Message v-if="!fileSystem.isSupported()" severity="warn" :closable="false" class="api-warning">
      File System Access API is not supported in this browser.
      Please use Chrome, Edge, or Opera.
    </Message>

    <!-- Loading indicator -->
    <div v-else-if="fileSystem.loading.value" class="loading-state">
      <i class="pi pi-spin pi-spinner"></i>
      <span>Loading files...</span>
    </div>

    <!-- Error message -->
    <Message v-else-if="fileSystem.error.value" severity="error" :closable="false" class="error-message">
      {{ fileSystem.error.value }}
    </Message>

    <!-- Empty state - no sources -->
    <div v-else-if="!hasSources" class="empty-state">
      <i class="pi pi-inbox"></i>
      <p>No sources added</p>
      <p class="hint">Add a folder, IndexedDB storage, or Git repository</p>
      <Button
        label="Add Source"
        icon="pi pi-plus"
        size="small"
        @click="toggleAddMenu"
      />
    </div>

    <!-- File tree with sources -->
    <div v-else class="tree-container">
      <Tree
        :value="fileSystem.treeNodes.value"
        v-model:selectionKeys="selectedKey"
        v-model:expandedKeys="expandedKeys"
        selectionMode="single"
        @node-select="handleNodeSelect"
        @node-dblclick="handleNodeDoubleClick"
        class="file-tree"
      >
        <template #default="{ node }">
          <div
            class="tree-node"
            :class="{
              'is-source': node.type === 'source',
              'is-workspace': node.type === 'workspace',
              'is-directory': node.type === 'directory',
              'is-loading': node.loading
            }"
            @contextmenu.prevent="handleContextMenu($event, node)"
          >
            <span class="node-label">{{ node.label }}</span>
            <i v-if="node.loading" class="pi pi-spin pi-spinner loading-spinner"></i>
            <span v-if="node.type === 'workspace'" class="workspace-badge">WS</span>
          </div>
        </template>
      </Tree>
    </div>

    <!-- Add Source Menu -->
    <Menu ref="addMenu" :model="addMenuItems" :popup="true" />

    <!-- Context Menu (for sources and folders) -->
    <Menu ref="contextMenu" :model="contextMenuItems" :popup="true" />

    <!-- New Folder Dialog -->
    <Dialog
      v-model:visible="showNewFolderDialog"
      header="New Folder"
      :modal="true"
      :style="{ width: '350px' }"
      @hide="newItemName = ''"
    >
      <div class="dialog-content">
        <div class="field">
          <label for="folder-name">Folder Name</label>
          <InputText
            id="folder-name"
            v-model="newItemName"
            placeholder="New Folder"
            class="w-full"
            @keyup.enter="handleCreateFolder"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewFolderDialog = false" />
        <Button label="Create" @click="handleCreateFolder" :disabled="!newItemName" />
      </template>
    </Dialog>

    <!-- New File Dialog -->
    <Dialog
      v-model:visible="showNewFileDialog"
      header="New File"
      :modal="true"
      :style="{ width: '350px' }"
      @hide="newItemName = ''"
    >
      <div class="dialog-content">
        <div class="field">
          <label for="file-name">File Name</label>
          <InputText
            id="file-name"
            v-model="newItemName"
            placeholder="newfile.txt"
            class="w-full"
            @keyup.enter="handleCreateFile"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewFileDialog = false" />
        <Button label="Create" @click="handleCreateFile" :disabled="!newItemName" />
      </template>
    </Dialog>

    <!-- New C-OCL Constraint File Dialog -->
    <Dialog
      v-model:visible="showNewCoclDialog"
      header="New Constraint File"
      :modal="true"
      :style="{ width: '350px' }"
      @hide="newCoclName = ''"
    >
      <div class="dialog-content">
        <div class="field">
          <label for="cocl-name">Constraint Set Name</label>
          <InputText
            id="cocl-name"
            v-model="newCoclName"
            placeholder="MyConstraints"
            class="w-full"
            @keyup.enter="handleCreateCoclFile"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewCoclDialog = false" />
        <Button label="Create" @click="handleCreateCoclFile" :disabled="!newCoclName" />
      </template>
    </Dialog>

    <!-- New Workspace Dialog -->
    <Dialog
      v-model:visible="showNewWorkspaceDialog"
      header="New Workspace"
      :modal="true"
      :style="{ width: '350px' }"
      @hide="newItemName = ''"
    >
      <div class="dialog-content">
        <div class="field">
          <label for="workspace-name">Workspace Name</label>
          <InputText
            id="workspace-name"
            v-model="newItemName"
            placeholder="My Workspace"
            class="w-full"
            @keyup.enter="handleCreateWorkspace"
          />
        </div>
        <p class="hint">Creates a .wsp file with an empty workspace definition.</p>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewWorkspaceDialog = false" />
        <Button label="Create" @click="handleCreateWorkspace" :disabled="!newItemName" />
      </template>
    </Dialog>

    <!-- Add IndexedDB Dialog -->
    <Dialog
      v-model:visible="showAddIndexedDBDialog"
      header="Add IndexedDB Storage"
      :modal="true"
      :style="{ width: '400px' }"
    >
      <div class="dialog-content">
        <div class="field">
          <label for="idb-name">Display Name</label>
          <InputText
            id="idb-name"
            v-model="newSourceName"
            placeholder="My Storage"
            class="w-full"
          />
        </div>
        <div class="field">
          <label for="idb-db">Database Name</label>
          <InputText
            id="idb-db"
            v-model="newDbName"
            placeholder="gene-storage"
            class="w-full"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showAddIndexedDBDialog = false" />
        <Button label="Add" @click="handleAddIndexedDB" :disabled="!newSourceName || !newDbName" />
      </template>
    </Dialog>

    <!-- Add Git Dialog -->
    <Dialog
      v-model:visible="showAddGitDialog"
      header="Add Git Repository"
      :modal="true"
      :style="{ width: '400px' }"
    >
      <div class="dialog-content">
        <div class="field">
          <label for="git-name">Display Name</label>
          <InputText
            id="git-name"
            v-model="newSourceName"
            placeholder="My Repo"
            class="w-full"
          />
        </div>
        <div class="field">
          <label for="git-url">Repository URL</label>
          <InputText
            id="git-url"
            v-model="newGitUrl"
            placeholder="https://github.com/user/repo"
            class="w-full"
          />
        </div>
        <div class="field">
          <label for="git-token">Access Token (optional)</label>
          <InputText
            id="git-token"
            v-model="newGitToken"
            type="password"
            placeholder="ghp_..."
            class="w-full"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showAddGitDialog = false" />
        <Button label="Add" @click="handleAddGit" :disabled="!newSourceName || !newGitUrl" />
      </template>
    </Dialog>

  </div>
</template>

<style scoped>
.file-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-ground);
}

.explorer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-section);
}

.header-title {
  font-weight: 600;
  font-size: 0.875rem;
  text-transform: uppercase;
  color: var(--text-color-secondary);
}

.header-actions {
  display: flex;
  gap: 0.25rem;
}

.header-actions :deep(.p-button) {
  width: 28px;
  height: 28px;
  padding: 0;
}

.header-actions :deep(.p-button-icon) {
  font-size: 0.875rem;
}

.api-warning,
.error-message {
  margin: 1rem;
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  color: var(--text-color-secondary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  color: var(--text-color-secondary);
  flex: 1;
}

.empty-state i {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state .hint {
  font-size: 0.875rem;
  margin-bottom: 1rem;
  opacity: 0.7;
}

.tree-container {
  flex: 1;
  overflow: auto;
}

.file-tree {
  padding: 0.5rem;
  background: transparent;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tree-node.is-source {
  font-weight: 600;
}

.tree-node.is-workspace .node-label {
  color: var(--primary-color);
  font-weight: 500;
}

.node-label {
  font-size: 0.875rem;
}

.loading-spinner {
  font-size: 0.75rem;
  margin-left: auto;
}

.workspace-badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  background: var(--primary-100);
  color: var(--primary-700);
  font-weight: 600;
  margin-left: auto;
}

.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field label {
  font-weight: 500;
  font-size: 0.875rem;
}

.dialog-content .hint {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  margin: 0;
}

.w-full {
  width: 100%;
}

/* PrimeVue 4 Tree Styles */
:deep(.p-tree) {
  background: transparent;
  border: none;
  padding: 0;
}

:deep(.p-tree-root-children) {
  display: flex;
  flex-direction: column;
  gap: 0;
}

:deep(.p-tree-node) {
  padding: 0;
}

:deep(.p-tree-node-children) {
  padding-left: 1rem;
}

:deep(.p-tree-node-content) {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--border-radius);
  cursor: pointer;
}

:deep(.p-tree-node-content:hover) {
  background: var(--surface-hover);
}

:deep(.p-tree-node-content.p-tree-node-selected) {
  background: var(--primary-100);
}

:deep(.p-tree-node-toggle-button) {
  width: 1.5rem;
  height: 1.5rem;
  margin-right: 0;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.p-tree-node-toggle-button:hover) {
  background: var(--surface-hover);
  border-radius: var(--border-radius);
}

:deep(.p-tree-node-icon) {
  color: var(--text-color-secondary);
  margin-right: 0.5rem;
}

:deep(.p-tree-node-label) {
  font-size: 0.875rem;
}
</style>
