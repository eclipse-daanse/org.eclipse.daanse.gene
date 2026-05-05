<script setup lang="ts">
/**
 * ModelBrowser Component
 *
 * Tree view of registered EPackages and their EClasses.
 * Allows adding new models from .ecore files and dragging classes
 * to create instances in the Instance Tree.
 *
 * Uses reactive editor mode to switch between:
 * - Instance Editor: shows registered metamodels from model registry
 * - Metamodeler: shows Ecore.ecore + imported packages
 */

import { ref, computed, watch, inject } from 'tsm:vue'
import { Tree } from 'tsm:primevue'
import { Button } from 'tsm:primevue'
import { ContextMenu } from 'tsm:primevue'
import { Dialog } from 'tsm:primevue'
import { Message } from 'tsm:primevue'
import { useSharedModelRegistry } from '../composables/useModelRegistry'
import type { ModelTreeNode, ClassInfo, ModelPackageInfo, ReferenceInfo, ConstraintInfo } from '../types'

// EditorContext interface (simplified for this component's needs)
interface EditorContext {
  mode: 'instance' | 'metamodel'
  modelTreeNodes: { value: any[] }
  unregisterPackage?: (nsURI: string) => boolean
}

// Props - context can be provided by parent (for different perspectives)
const props = defineProps<{
  context?: EditorContext
}>()

const emit = defineEmits<{
  'class-select': [classInfo: ClassInfo]
  'class-drag-start': [classInfo: ClassInfo, event: DragEvent]
  'create-instance': [classInfo: ClassInfo]
}>()

// Fallback to model registry if no context provided
const modelRegistry = useSharedModelRegistry()

// TSM for service access
const tsm = inject<any>('tsm')

// Get context: prop > global current context > null
function getActiveContext(): EditorContext | null {
  if (props.context) return props.context
  const editorMode = tsm?.getService('gene.editor.context')
  return editorMode?.getCurrentContext?.() ?? null
}

// WorkspaceActionService for direct App-level actions
function getActions() {
  return tsm?.getService('gene.workspace.actions')
}

// Resolve custom icon dataUrl from CSS class
function getIconDataUrl(iconClass: string | undefined): string | undefined {
  if (!iconClass || !iconClass.startsWith('custom-icon custom-icon--')) return undefined
  const id = iconClass.replace('custom-icon custom-icon--', '')
  const registry = tsm?.getService('gene.icons.registry')
  const provider = registry?.get?.('custom-icons') as any
  return provider?.getDataUrl?.(id)
}

const activeContext = computed(() => getActiveContext())

console.log('[ModelBrowser.vue] Using context:', props.context?.mode ?? 'fallback', 'from props:', !!props.context)

// Tree nodes - from provided context or fallback to model registry
const treeNodes = computed(() => {
  const ctx = activeContext.value
  if (ctx?.modelTreeNodes) {
    return ctx.modelTreeNodes.value
  }
  return modelRegistry.treeNodes.value
})

// Tree state
const selectedKey = ref<Record<string, boolean>>({})
const expandedKeys = ref<Record<string, boolean>>({})

// Context menu state
const contextMenu = ref<InstanceType<typeof ContextMenu> | null>(null)
const selectedNode = ref<ModelTreeNode | null>(null)

// Add model dialog
const showAddModelDialog = ref(false)
const addModelError = ref<string | null>(null)

// Context menu items
const contextMenuItems = computed(() => {
  if (!selectedNode.value) return []

  if (selectedNode.value.type === 'package' || selectedNode.value.type === 'subpackage') {
    const pkg = selectedNode.value.data as ModelPackageInfo
    return [
      {
        label: 'Remove Package',
        icon: 'pi pi-trash',
        disabled: pkg?.isBuiltIn,
        command: () => handleRemovePackage(pkg)
      }
    ]
  }

  if (selectedNode.value.type === 'class') {
    const classInfo = selectedNode.value.data as ClassInfo
    const isInstantiable = !classInfo.isAbstract && !classInfo.isInterface
    return [
      {
        label: 'Create Instance',
        icon: 'pi pi-plus',
        disabled: !isInstantiable,
        command: () => handleCreateInstance(classInfo)
      }
    ]
  }

  return []
})

/**
 * Handle node selection
 */
function handleNodeSelect(node: ModelTreeNode) {
  if (node.type === 'class') {
    const classInfo = node.data as ClassInfo
    emit('class-select', classInfo)
  }
}

/**
 * Handle context menu
 */
function handleContextMenu(event: MouseEvent, node: ModelTreeNode) {
  selectedNode.value = node
  // Show context menu for packages and classes
  if (node.type === 'package' || node.type === 'subpackage' || node.type === 'class') {
    contextMenu.value?.show(event)
  }
}

/**
 * Handle creating an instance from a class
 */
function handleCreateInstance(classInfo: ClassInfo) {
  if (classInfo.isAbstract || classInfo.isInterface) {
    console.warn('Cannot instantiate abstract class or interface')
    return
  }
  console.log('Creating instance of:', classInfo.name)
  // Use service if available, otherwise emit for backward compatibility
  const actions = getActions()
  if (actions) {
    actions.createInstance(classInfo)
  } else {
    emit('create-instance', classInfo)
  }
}

/**
 * Handle drag start for class nodes
 */
function handleDragStart(event: DragEvent, node: ModelTreeNode) {
  if (node.type === 'class' && node.draggable) {
    const classInfo = node.data as ClassInfo
    event.dataTransfer?.setData('application/x-eclass', classInfo.qualifiedName)
    event.dataTransfer!.effectAllowed = 'copy'
    emit('class-drag-start', classInfo, event)
  }
}

/**
 * Show the add model dialog with instructions
 */
function handleAddModel() {
  addModelError.value = null
  showAddModelDialog.value = true
}

/**
 * Handle removing a package
 */
function handleRemovePackage(pkg: ModelPackageInfo) {
  if (pkg.isBuiltIn) {
    return // Cannot remove built-in packages
  }

  // Use active context if available
  const ctx = activeContext.value
  if (ctx?.unregisterPackage) {
    ctx.unregisterPackage(pkg.nsURI)
    return
  }
  // Fall back to model registry
  modelRegistry.unregisterPackage(pkg.nsURI)
}

/**
 * Close the add model dialog
 */
function closeAddModelDialog() {
  showAddModelDialog.value = false
  addModelError.value = null
}

/**
 * Get supertype names for a class
 */
function getSuperTypes(classInfo: ClassInfo): string[] {
  try {
    const superTypes = typeof classInfo.eClass.getESuperTypes === 'function'
      ? classInfo.eClass.getESuperTypes()
      : []
    if (superTypes && (Array.isArray(superTypes) || (superTypes as any)[Symbol.iterator])) {
      return Array.from(superTypes).map(st => st.getName())
    }
  } catch (e) {
    // Ignore errors
  }
  return []
}
</script>

<template>
  <div class="model-browser">
    <!-- Header -->
    <div class="browser-header">
      <span class="header-title">Models</span>
      <div class="header-actions">
        <Button
          icon="pi pi-plus"
          text
          rounded
          size="small"
          @click="handleAddModel"
          v-tooltip.bottom="'Add Model'"
        />
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="treeNodes.length === 0" class="empty-state">
      <i class="pi pi-box"></i>
      <p>No models registered</p>
      <Button
        label="Add Model"
        icon="pi pi-plus"
        size="small"
        @click="handleAddModel"
      />
    </div>

    <!-- Model tree -->
    <div v-else class="tree-container">
      <Tree
        :value="treeNodes"
        v-model:selectionKeys="selectedKey"
        v-model:expandedKeys="expandedKeys"
        selectionMode="single"
        @node-select="handleNodeSelect"
        class="model-tree"
      >
        <template #default="{ node }">
          <div
            class="tree-node"
            :class="{
              'is-abstract': node.type === 'class' && (node.data as ClassInfo).isAbstract,
              'is-interface': node.type === 'class' && (node.data as ClassInfo).isInterface,
              'is-draggable': node.draggable,
              'is-attribute': node.type === 'attribute',
              'is-reference': node.type === 'reference',
              'is-containment': node.type === 'reference' && (node.data as ReferenceInfo).isContainment,
              'is-constraint': node.type === 'constraint',
              'is-enum': node.type === 'enum'
            }"
            :draggable="node.draggable"
            @dragstart="handleDragStart($event, node)"
            @contextmenu.prevent="handleContextMenu($event, node)"
          >
            <img v-if="getIconDataUrl(node.icon)" :src="getIconDataUrl(node.icon)" class="node-icon node-icon--img" alt="" />
            <span class="node-label">{{ node.label }}</span>
            <span v-if="node.type === 'class' && (node.data as ClassInfo).isInterface" class="badge interface" v-tooltip.top="'Interface'">I</span>
            <span v-else-if="node.type === 'class' && (node.data as ClassInfo).isAbstract" class="badge abstract" v-tooltip.top="'Abstract'">A</span>
            <span v-if="node.type === 'reference' && (node.data as ReferenceInfo).isContainment" class="badge containment" v-tooltip.top="'Containment'">C</span>
            <span v-if="node.type === 'enum'" class="badge enum" v-tooltip.top="'Enumeration'">E</span>
            <span v-if="node.type === 'constraint'" class="constraint-expression" v-tooltip.top="(node.data as ConstraintInfo).expression">
              {{ (node.data as ConstraintInfo).expression }}
            </span>
            <span v-if="node.type === 'class' && getSuperTypes(node.data as ClassInfo).length > 0" class="extends-info">
              → {{ getSuperTypes(node.data as ClassInfo).join(', ') }}
            </span>
            <span v-if="node.type === 'package' && (node.data as ModelPackageInfo).isBuiltIn" class="badge built-in">
              built-in
            </span>
          </div>
        </template>
      </Tree>
    </div>

    <!-- Context Menu -->
    <ContextMenu ref="contextMenu" :model="contextMenuItems" />

    <!-- Add Model Dialog -->
    <Dialog
      v-model:visible="showAddModelDialog"
      header="Add Model"
      :modal="true"
      :style="{ width: '400px' }"
    >
      <Message v-if="addModelError" severity="error" :closable="false">
        {{ addModelError }}
      </Message>

      <div class="add-model-content">
        <p>
          To add a model to your workspace:
        </p>
        <ol>
          <li>Navigate to a <code>.ecore</code> file in the File Explorer</li>
          <li>Right-click on the file</li>
          <li>Select <strong>"Add Model to Workspace"</strong></li>
        </ol>
        <p class="hint">
          The model's EPackage will be registered and its classes will appear here.
          You can then drag classes to create instances.
        </p>
      </div>

      <template #footer>
        <Button
          label="Close"
          @click="closeAddModelDialog"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.model-browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-ground);
  position: relative;
}

.browser-header {
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

.tree-container {
  flex: 1;
  overflow: auto;
}

.model-tree {
  padding: 0.5rem;
  background: transparent;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  cursor: default;
}

.tree-node.is-draggable {
  cursor: grab;
}

.tree-node.is-draggable:active {
  cursor: grabbing;
}

.tree-node.is-abstract .node-label,
.tree-node.is-interface .node-label {
  font-style: italic;
  opacity: 0.7;
}

.tree-node.is-attribute .node-label {
  color: var(--text-color-secondary);
  font-size: 0.8rem;
}

.tree-node.is-reference .node-label {
  color: var(--primary-color);
  font-size: 0.8rem;
}

.tree-node.is-containment .node-label {
  color: #10b981;
}

.tree-node.is-constraint .node-label {
  color: #8b5cf6;
  font-weight: 600;
  font-size: 0.8rem;
}

.tree-node.is-enum .node-label {
  color: #f59e0b;
  font-size: 0.85rem;
}

.constraint-expression {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.8;
}

.node-label {
  font-size: 0.875rem;
}

.node-icon--img {
  width: 1rem;
  height: 1rem;
  object-fit: contain;
  flex-shrink: 0;
}

:root.p-dark .node-icon--img,
.dark-theme .node-icon--img {
  filter: invert(0.85);
}

.extends-info {
  font-size: 0.75rem;
  color: var(--text-color-muted);
  font-style: italic;
}

.badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  text-transform: uppercase;
  font-weight: 600;
}

.badge.built-in {
  background: var(--primary-100);
  color: var(--primary-700);
}

.badge.interface {
  background: transparent;
  color: #8b5cf6;
  font-weight: 500;
  padding: 0;
  font-size: 0.7rem;
}

.badge.abstract {
  background: transparent;
  color: #f59e0b;
  font-weight: 500;
  padding: 0;
  font-size: 0.7rem;
}

.badge.containment {
  background: transparent;
  color: #10b981;
  font-weight: 500;
  padding: 0;
  font-size: 0.7rem;
}

.badge.enum {
  background: transparent;
  color: #f59e0b;
  font-weight: 500;
  padding: 0;
  font-size: 0.7rem;
}

.add-model-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.add-model-content code {
  background: var(--surface-100);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-family: monospace;
}

.add-model-content .hint {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
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

/* Hide PrimeVue's auto-rendered icon for custom icons */
:deep(.p-tree-node-icon.custom-icon) {
  display: none;
}

:deep(.p-tree-node-label) {
  font-size: 0.875rem;
}
</style>
