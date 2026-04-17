<script setup lang="ts">
/**
 * WorkspaceExplorer - Main workspace navigation component
 *
 * Displays repositories and their file trees in a sidebar explorer.
 */

import { computed, ref } from 'tsm:vue';
import { Tree, Button, ContextMenu } from 'tsm:primevue';
import type { TreeNode } from '../composables/useFileTree';
import { useFileTree } from '../composables/useFileTree';
import { useSharedWorkspace } from '../composables/useWorkspace';
import type { Repository, Folder, File, FileSystemEntry } from 'storage-core';
import { RepositoryState } from 'storage-core';

// Get shared workspace state
const workspace = useSharedWorkspace();

// File tree transformation
const { treeNodes, expandedKeys } = useFileTree(
  workspace.repositories,
  workspace.expandedFolders,
  workspace.updateTrigger
);

// Local state
const selectedKey = ref<string | null>(null);
const contextMenuRef = ref<InstanceType<typeof ContextMenu> | null>(null);
const contextMenuTarget = ref<TreeNode | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const uploadTarget = ref<TreeNode | null>(null);

// Context menu items (dynamic based on target)
const contextMenuItems = computed(() => {
  const target = contextMenuTarget.value;
  if (!target) return [];

  const items: any[] = [];

  switch (target.data.type) {
    case 'repository':
      items.push(
        {
          label: 'New File',
          icon: 'pi pi-file-plus',
          command: () => handleNewFile(target)
        },
        {
          label: 'New Folder',
          icon: 'pi pi-folder-plus',
          command: () => handleNewFolder(target)
        },
        {
          label: 'Upload Files',
          icon: 'pi pi-upload',
          command: () => handleUpload(target)
        },
        { separator: true },
        {
          label: 'Edit',
          icon: 'pi pi-pencil',
          command: () => handleEditInstance(target)
        },
        {
          label: 'Refresh',
          icon: 'pi pi-refresh',
          command: () => handleRefresh(target)
        },
        {
          label: 'Disconnect',
          icon: 'pi pi-power-off',
          command: () => handleDisconnect(target)
        }
      );

      // Add sync for Git repositories
      if ('provider' in (target.data.entry as Repository)) {
        items.splice(3, 0, {
          label: 'Sync',
          icon: 'pi pi-sync',
          command: () => handleSync(target)
        });
      }
      break;

    case 'folder':
      items.push(
        {
          label: 'New File',
          icon: 'pi pi-file-plus',
          command: () => handleNewFile(target)
        },
        {
          label: 'New Folder',
          icon: 'pi pi-folder-plus',
          command: () => handleNewFolder(target)
        },
        {
          label: 'Upload Files',
          icon: 'pi pi-upload',
          command: () => handleUpload(target)
        },
        { separator: true },
        {
          label: 'Delete',
          icon: 'pi pi-trash',
          command: () => handleDelete(target)
        }
      );
      break;

    case 'file':
      items.push(
        {
          label: 'Open',
          icon: 'pi pi-external-link',
          command: () => handleOpen(target)
        },
        { separator: true },
        {
          label: 'Delete',
          icon: 'pi pi-trash',
          command: () => handleDelete(target)
        }
      );
      break;
  }

  return items;
});

// Event handlers
function handleNodeSelect(node: TreeNode) {
  selectedKey.value = node.key;
  workspace.selectEntry(node.data.entry as FileSystemEntry);

  if (node.data.type === 'file') {
    emit('file-select', {
      file: node.data.entry as File,
      repository: node.data.repository!
    });
  }
}

function handleNodeExpand(node: TreeNode) {
  if (node.data.type === 'folder') {
    workspace.expandFolder(node.data.entry as Folder);
  }
}

function handleNodeCollapse(node: TreeNode) {
  if (node.data.type === 'folder') {
    workspace.collapseFolder(node.data.entry as Folder);
  }
}

function handleNodeContextMenu(event: MouseEvent, node: TreeNode) {
  contextMenuTarget.value = node;
  contextMenuRef.value?.show(event);
}

async function handleNewFile(node: TreeNode) {
  const name = prompt('Enter file name:');
  if (!name) return;

  const repo = node.data.repository!;
  const parent = node.data.type === 'repository'
    ? repo.root!
    : node.data.entry as Folder;

  await workspace.createFile(repo, parent, name);
}

async function handleNewFolder(node: TreeNode) {
  const name = prompt('Enter folder name:');
  if (!name) return;

  const repo = node.data.repository!;
  const parent = node.data.type === 'repository'
    ? repo.root!
    : node.data.entry as Folder;

  await workspace.createFolder(repo, parent, name);
}

async function handleDelete(node: TreeNode) {
  const entry = node.data.entry as FileSystemEntry;
  const confirmed = confirm(`Delete "${entry.name}"?`);
  if (!confirmed) return;

  await workspace.deleteEntry(node.data.repository!, entry);
}

function handleOpen(node: TreeNode) {
  emit('file-open', {
    file: node.data.entry as File,
    repository: node.data.repository!
  });
}

async function handleRefresh(node: TreeNode) {
  const repo = node.data.repository!;
  await workspace.disconnectRepository(repo);
  await workspace.connectRepository(repo);
}

async function handleDisconnect(node: TreeNode) {
  const repo = node.data.repository!;
  await workspace.disconnectRepository(repo);
}

async function handleSync(node: TreeNode) {
  const repo = node.data.repository!;
  await workspace.syncRepository(repo);
}

function handleUpload(node: TreeNode) {
  uploadTarget.value = node;
  fileInputRef.value?.click();
}

async function handleFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0 || !uploadTarget.value) return;

  const node = uploadTarget.value;
  const repo = node.data.repository!;
  const parent = node.data.type === 'repository'
    ? repo.root!
    : node.data.entry as Folder;

  for (const file of files) {
    const content = await readFileAsText(file);
    await workspace.createFile(repo, parent, file.name, content);
  }

  // Reset input
  input.value = '';
  uploadTarget.value = null;
}

function readFileAsText(file: globalThis.File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// Helper to get status icon for repository
function getStatusIcon(repo: Repository): string {
  switch (repo.state) {
    case RepositoryState.CONNECTED:
      return 'pi pi-check-circle text-green-500';
    case RepositoryState.CONNECTING:
    case RepositoryState.SYNCING:
      return 'pi pi-spin pi-spinner';
    case RepositoryState.ERROR:
      return 'pi pi-exclamation-circle text-red-500';
    default:
      return 'pi pi-circle text-gray-400';
  }
}

// Emits
const emit = defineEmits<{
  'file-select': [payload: { file: File; repository: Repository }];
  'file-open': [payload: { file: File; repository: Repository }];
  'edit-instance': [eObject: any];
  'add-repository': [];
}>();

// Handler for editing EObject instances
function handleEditInstance(node: TreeNode) {
  const entry = node.data.entry;
  emit('edit-instance', entry);
}
</script>

<template>
  <div class="workspace-explorer">
    <!-- Header -->
    <div class="explorer-header">
      <span class="header-title">Explorer</span>
      <div class="header-actions">
        <Button
          icon="pi pi-plus"
          text
          rounded
          size="small"
          @click="$emit('add-repository')"
          v-tooltip.bottom="'Add Repository'"
        />
        <Button
          icon="pi pi-refresh"
          text
          rounded
          size="small"
          @click="workspace.triggerUpdate()"
          v-tooltip.bottom="'Refresh'"
        />
      </div>
    </div>

    <!-- Loading indicator -->
    <div v-if="workspace.loading.value" class="loading-indicator">
      <i class="pi pi-spin pi-spinner"></i>
      <span>Loading...</span>
    </div>

    <!-- Error message -->
    <div v-if="workspace.error.value" class="error-message">
      <i class="pi pi-exclamation-triangle"></i>
      <span>{{ workspace.error.value }}</span>
    </div>

    <!-- Empty state -->
    <div v-if="treeNodes.length === 0" class="empty-state">
      <i class="pi pi-folder-open"></i>
      <p>No repositories</p>
      <Button
        label="Add Repository"
        icon="pi pi-plus"
        size="small"
        @click="$emit('add-repository')"
      />
    </div>

    <!-- File Tree -->
    <Tree
      v-else
      :value="treeNodes"
      :expandedKeys="expandedKeys"
      selectionMode="single"
      v-model:selectionKeys="selectedKey"
      @node-select="handleNodeSelect"
      @node-expand="handleNodeExpand"
      @node-collapse="handleNodeCollapse"
      class="file-tree"
    >
      <template #default="{ node }">
        <div
          class="tree-node-content"
          @contextmenu.prevent="handleNodeContextMenu($event, node)"
        >
          <span class="node-label">{{ node.label }}</span>
          <i
            v-if="node.data.type === 'repository'"
            :class="getStatusIcon(node.data.entry)"
            class="status-icon"
          ></i>
        </div>
      </template>
    </Tree>

    <!-- Context Menu -->
    <ContextMenu ref="contextMenuRef" :model="contextMenuItems" />

    <!-- Hidden file input for uploads -->
    <input
      ref="fileInputRef"
      type="file"
      multiple
      style="display: none"
      @change="handleFileInputChange"
    />
  </div>
</template>

<style scoped>
.workspace-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-ground);
  border-right: 1px solid var(--surface-border);
}

.explorer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
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

.loading-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  color: var(--red-500);
  font-size: 0.875rem;
  background: var(--red-50);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  color: var(--text-color-secondary);
}

.empty-state i {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.file-tree {
  flex: 1;
  overflow: auto;
  padding: 0.5rem;
}

.tree-node-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.node-label {
  flex: 1;
}

.status-icon {
  font-size: 0.75rem;
  margin-left: auto;
}

/* File state classes */
:deep(.file-state-new) {
  color: var(--green-500);
}

:deep(.file-state-modified) {
  color: var(--yellow-600);
}

:deep(.file-state-deleted) {
  color: var(--red-500);
  text-decoration: line-through;
}
</style>
