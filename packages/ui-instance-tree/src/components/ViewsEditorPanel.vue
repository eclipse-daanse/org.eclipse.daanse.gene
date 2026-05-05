<script setup lang="ts">
/**
 * ViewsEditorPanel Component
 *
 * Views as draggable cards with reordering.
 * Type visibility assignment via a separate dialog with checkbox tree.
 */

import { ref, computed, inject, watch } from 'tsm:vue'
import { Button } from 'tsm:primevue'
import { InputText } from 'tsm:primevue'
import { Checkbox } from 'tsm:primevue'
import { Dialog } from 'tsm:primevue'
import IconPicker from './IconPicker.vue'
import type { SelectedIcon } from '../services/iconProviders'
import { resolveCustomIconDataUrl } from '../services/iconProviderRegistry'
import { Tree } from 'tsm:primevue'
import { useSharedViews, getTypeUri } from '../composables/useViews'

// Icon picker for perspective icons
const showIconPicker = ref(false)
const iconPickerValue = ref<SelectedIcon | null>(null)

function openViewIconPicker() {
  showIconPicker.value = true
}

function handleViewIconSelect(selected: SelectedIcon) {
  if (!typeDialogView.value) return
  typeDialogView.value.perspectiveIcon = selected.cssClass
  handleIconChange(typeDialogView.value)
  showIconPicker.value = false
}

function getViewIconDataUrl(iconClass: string | undefined): string | undefined {
  if (!iconClass) return undefined
  return resolveCustomIconDataUrl(iconClass)
}

import type { PackageInfo } from '../context/editorContext'
import type { EPackage, EClass, EClassifier } from '@emfts/core'

const props = defineProps<{
  packages: PackageInfo[]
}>()

const tsm = inject<any>('tsm')
const editorConfigService = computed(() => tsm?.getService('gene.editor.config') as any)
const views = useSharedViews()

// === New View Dialog ===
const showNewViewDialog = ref(false)
const newViewName = ref('')

function handleCreateView() {
  if (!newViewName.value.trim()) return
  const view = views.createView(newViewName.value.trim())
  views.setActiveView(view.id)
  showNewViewDialog.value = false
  newViewName.value = ''
}

function handleDeleteView(id: string) {
  const view = views.views.value.find(v => v.id === id)
  if (view && confirm(`Delete view "${view.name}"?`)) {
    views.deleteView(id)
  }
}

// === Drag & Drop reorder ===
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function onDragStart(index: number, e: DragEvent) {
  dragIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
}

function onDragOver(index: number, e: DragEvent) {
  e.preventDefault()
  dragOverIndex.value = index
}

function onDragLeave() {
  dragOverIndex.value = null
}

function onDrop(toIndex: number) {
  const fromIndex = dragIndex.value
  if (fromIndex === null || fromIndex === toIndex) {
    dragIndex.value = null
    dragOverIndex.value = null
    return
  }
  const arr = views.views.value
  const [item] = arr.splice(fromIndex, 1)
  arr.splice(toIndex, 0, item)
  views.version.value++
  dragIndex.value = null
  dragOverIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
}

function moveView(index: number, direction: -1 | 1) {
  const arr = views.views.value
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= arr.length) return
  const [item] = arr.splice(index, 1)
  arr.splice(newIndex, 0, item)
  views.version.value++
}

// === Perspective toggle ===
function handlePerspectiveToggle(view: any) {
  if (view.showInActivityBar) {
    views.enableAsPerspective(view.id, view.perspectiveIcon || 'pi pi-filter')
  } else {
    views.disableAsPerspective(view.id)
  }
}

function handleIconChange(view: any) {
  if (!view.showInActivityBar) return
  views.updatePerspectiveIcon(view.id, view.perspectiveIcon || 'pi pi-filter')
}

// === Type Assignment Dialog ===
const showTypeDialog = ref(false)
const typeDialogViewId = ref<string | null>(null)

const typeDialogView = computed(() => {
  if (!typeDialogViewId.value) return null
  return views.views.value.find(v => v.id === typeDialogViewId.value) || null
})

function openTypeDialog(viewId: string) {
  typeDialogViewId.value = viewId
  views.setActiveView(viewId)
  typeSearchQuery.value = ''
  expandToDepth(2)
  showTypeDialog.value = true
}

// Tree
const expandedKeys = ref<Record<string, boolean>>({})
const typeSearchQuery = ref('')

const resolvedPackages = computed(() => {
  if (props.packages && props.packages.length > 0) return props.packages
  const modelRegistry = tsm?.getService('ui.model-browser.composables')?.useSharedModelRegistry()
  return modelRegistry?.allPackages?.value || []
})

const modelTreeNodes = computed(() => {
  const nodes: any[] = []
  // Only show root packages (no eSuperPackage) — subpackages appear as children
  for (const pkgInfo of resolvedPackages.value) {
    const eSuperPackage = pkgInfo.ePackage.getESuperPackage?.()
    if (eSuperPackage) continue
    const pkgNode = packageInfoToTreeNode(pkgInfo)
    if (pkgNode) nodes.push(pkgNode)
  }
  return nodes
})

function packageInfoToTreeNode(pkgInfo: PackageInfo): any {
  const pkg = pkgInfo.ePackage
  const nsURI = pkgInfo.nsURI
  const name = pkgInfo.name
  const children: any[] = []

  const classifiers = pkg.getEClassifiers()
  if (classifiers) {
    const list = typeof classifiers.toArray === 'function'
      ? classifiers.toArray()
      : Array.from(classifiers as Iterable<EClassifier>)
    for (const classifier of list) {
      if (classifier.eClass().getName() === 'EClass') {
        const eClass = classifier as EClass
        children.push({
          key: `class-${nsURI}-${eClass.getName()}`,
          label: eClass.getName(),
          icon: eClass.isAbstract() ? 'pi pi-code' : 'pi pi-box',
          data: { type: 'class', eClass, pkgInfo },
          leaf: true
        })
      }
    }
  }

  const subPackages = pkg.getESubpackages()
  if (subPackages) {
    const subList = typeof subPackages.toArray === 'function'
      ? subPackages.toArray()
      : Array.from(subPackages as Iterable<EPackage>)
    for (const subPkg of subList) {
      const subNode = ePackageToTreeNode(subPkg)
      if (subNode) children.push(subNode)
    }
  }

  return {
    key: `pkg-${nsURI}`, label: name, icon: 'pi pi-folder',
    data: { type: 'package', pkgInfo },
    children: children.length > 0 ? children : undefined,
    leaf: children.length === 0
  }
}

function ePackageToTreeNode(pkg: EPackage): any {
  const nsURI = pkg.getNsURI?.() || 'unknown'
  const name = pkg.getName?.() || 'Unknown'
  const children: any[] = []

  const classifiers = pkg.getEClassifiers()
  if (classifiers) {
    const list = typeof classifiers.toArray === 'function'
      ? classifiers.toArray()
      : Array.from(classifiers as Iterable<EClassifier>)
    for (const classifier of list) {
      if (classifier.eClass().getName() === 'EClass') {
        const eClass = classifier as EClass
        children.push({
          key: `class-${nsURI}-${eClass.getName()}`,
          label: eClass.getName(),
          icon: eClass.isAbstract() ? 'pi pi-code' : 'pi pi-box',
          data: { type: 'class', eClass },
          leaf: true
        })
      }
    }
  }

  const subPackages = pkg.getESubpackages()
  if (subPackages) {
    const subList = typeof subPackages.toArray === 'function'
      ? subPackages.toArray()
      : Array.from(subPackages as Iterable<EPackage>)
    for (const subPkg of subList) {
      const subNode = ePackageToTreeNode(subPkg)
      if (subNode) children.push(subNode)
    }
  }

  return {
    key: `pkg-${nsURI}`, label: name, icon: 'pi pi-folder',
    data: { type: 'package', pkg },
    children: children.length > 0 ? children : undefined,
    leaf: children.length === 0
  }
}

function isClassHidden(viewId: string, eClass: EClass): boolean {
  const view = views.views.value.find(v => v.id === viewId)
  if (!view || !view.enabled) return false
  const typeUri = getTypeUri(eClass)
  return view.filters.some(f => f.filterType === 'ECLASS_TYPE' && f.hidden && f.targetTypeUri === typeUri)
}

function isPackageAllHidden(viewId: string, node: any): boolean {
  const classes = getClassesFromNode(node)
  if (classes.length === 0) return false
  return classes.every(c => isClassHidden(viewId, c))
}

function getClassesFromNode(node: any): EClass[] {
  const classes: EClass[] = []
  function traverse(n: any) {
    if (n.data?.type === 'class' && n.data.eClass) classes.push(n.data.eClass)
    if (n.children) for (const child of n.children) traverse(child)
  }
  if (node.children) for (const child of node.children) traverse(child)
  return classes
}

function toggleClassInView(viewId: string, eClass: EClass) {
  const view = views.views.value.find(v => v.id === viewId)
  if (!view) return

  const typeUri = getTypeUri(eClass)
  const existing = view.filters.find(f => f.filterType === 'ECLASS_TYPE' && f.targetTypeUri === typeUri)

  if (existing) {
    existing.hidden = !existing.hidden
  } else {
    views.setActiveView(viewId)
    views.hideType(typeUri, 'TYPE_ONLY')
  }
  views.version.value++
}

function togglePackageInView(viewId: string, node: any) {
  const view = views.views.value.find(v => v.id === viewId)
  if (!view) return

  const classes = getClassesFromNode(node)
  const allHidden = isPackageAllHidden(viewId, node)

  for (const eClass of classes) {
    const typeUri = getTypeUri(eClass)
    const existing = view.filters.find(f => f.filterType === 'ECLASS_TYPE' && f.targetTypeUri === typeUri)

    if (allHidden) {
      if (existing) existing.hidden = false
    } else {
      if (existing) {
        existing.hidden = true
      } else {
        views.setActiveView(viewId)
        views.hideType(typeUri, 'TYPE_ONLY')
      }
    }
  }
  views.version.value++
}

function expandAll() {
  const keys: Record<string, boolean> = {}
  function traverse(nodes: any[]) {
    for (const n of nodes) {
      if (n.key) keys[n.key] = true
      if (n.children) traverse(n.children)
    }
  }
  traverse(modelTreeNodes.value)
  expandedKeys.value = keys
}

function collapseAll() {
  expandedKeys.value = {}
}

function expandToDepth(maxDepth: number) {
  const keys: Record<string, boolean> = {}
  function traverse(nodes: any[], depth: number) {
    if (depth >= maxDepth) return
    for (const n of nodes) {
      if (n.children && n.children.length > 0) {
        keys[n.key] = true
        traverse(n.children, depth + 1)
      }
    }
  }
  traverse(modelTreeNodes.value, 0)
  expandedKeys.value = keys
}

// Filtered tree nodes for search
const filteredTreeNodes = computed(() => {
  const q = typeSearchQuery.value.trim().toLowerCase()
  if (!q) return modelTreeNodes.value
  return filterTree(modelTreeNodes.value, q)
})

function filterTree(nodes: any[], query: string): any[] {
  const result: any[] = []
  for (const node of nodes) {
    if (node.data?.type === 'class') {
      if (node.label.toLowerCase().includes(query)) {
        result.push(node)
      }
    } else if (node.children) {
      const filteredChildren = filterTree(node.children, query)
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren })
      }
    }
  }
  return result
}

// Auto-expand all when searching
watch(typeSearchQuery, (q) => {
  if (q.trim()) {
    expandAll()
  }
})

function hiddenCount(viewId: string): number {
  const view = views.views.value.find(v => v.id === viewId)
  if (!view) return 0
  return view.filters.filter(f => f.hidden).length
}
</script>

<template>
  <div class="views-editor-panel">
    <!-- Header -->
    <div class="panel-header">
      <span class="panel-title">Views</span>
      <Button
        icon="pi pi-plus"
        label="New View"
        text
        size="small"
        @click="showNewViewDialog = true"
      />
    </div>

    <!-- View Cards -->
    <div class="views-list" v-if="views.views.value.length > 0">
      <div
        v-for="(view, index) in views.views.value"
        :key="view.id"
        class="view-card"
        :class="{
          active: views.activeViewId.value === view.id,
          'drag-over': dragOverIndex === index,
          dragging: dragIndex === index
        }"
        draggable="true"
        @dragstart="onDragStart(index, $event)"
        @dragover="onDragOver(index, $event)"
        @dragleave="onDragLeave"
        @drop="onDrop(index)"
        @dragend="onDragEnd"
        @click="views.setActiveView(view.id)"
      >
        <i class="pi pi-bars drag-handle"></i>
        <img v-if="getViewIconDataUrl(view.perspectiveIcon)" :src="getViewIconDataUrl(view.perspectiveIcon)" class="view-icon view-icon--img" alt="" />
        <i v-else-if="view.perspectiveIcon" :class="view.perspectiveIcon" class="view-icon"></i>
        <span class="view-name" :class="{ disabled: !view.enabled }">{{ view.name }}</span>
        <span v-if="hiddenCount(view.id) > 0" class="badge">{{ hiddenCount(view.id) }}</span>
        <div class="card-actions">
          <Button icon="pi pi-arrow-up" text rounded size="small" :disabled="index === 0" @click.stop="moveView(index, -1)" />
          <Button icon="pi pi-arrow-down" text rounded size="small" :disabled="index === views.views.value.length - 1" @click.stop="moveView(index, 1)" />
          <Button icon="pi pi-sliders-h" text rounded size="small" @click.stop="openTypeDialog(view.id)" v-tooltip.left="'Type filters'" />
          <Button icon="pi pi-trash" text rounded size="small" severity="danger" @click.stop="handleDeleteView(view.id)" />
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <p class="hint">No views yet. Create one to hide parts of your model.</p>
    </div>

    <!-- New View Dialog -->
    <Dialog
      v-model:visible="showNewViewDialog"
      header="Create New View"
      :modal="true"
      :style="{ width: '350px' }"
    >
      <div class="dialog-form">
        <label for="new-view-name">View Name</label>
        <InputText
          id="new-view-name"
          v-model="newViewName"
          placeholder="My View"
          class="w-full"
          @keyup.enter="handleCreateView"
        />
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewViewDialog = false" />
        <Button label="Create" @click="handleCreateView" :disabled="!newViewName.trim()" />
      </template>
    </Dialog>

    <!-- Type Assignment Dialog -->
    <Dialog
      v-model:visible="showTypeDialog"
      :header="`Type Filters: ${typeDialogView?.name || ''}`"
      :modal="true"
      :style="{ width: '600px', height: '70vh' }"
      :contentStyle="{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }"
    >
      <div v-if="typeDialogView" class="type-dialog-content">
        <!-- View settings -->
        <div class="type-settings">
          <Checkbox
            :modelValue="typeDialogView.enabled"
            @update:modelValue="views.updateView(typeDialogView!.id, { enabled: $event })"
            binary
            inputId="td-enabled"
          />
          <label for="td-enabled" class="meta-label">Enabled</label>
          <span class="settings-sep"></span>
          <Checkbox
            v-model="typeDialogView.showInActivityBar"
            binary
            inputId="td-activity-bar"
            @update:modelValue="handlePerspectiveToggle(typeDialogView)"
          />
          <label for="td-activity-bar" class="meta-label">Activity Bar</label>
          <Button
            v-if="typeDialogView.showInActivityBar"
            severity="secondary"
            outlined
            size="small"
            class="icon-picker-btn"
            @click="openViewIconPicker"
          >
            <img v-if="getViewIconDataUrl(typeDialogView.perspectiveIcon)" :src="getViewIconDataUrl(typeDialogView.perspectiveIcon)" class="btn-icon-img" alt="" />
            <i v-else-if="typeDialogView.perspectiveIcon" :class="typeDialogView.perspectiveIcon"></i>
            <span v-else>Icon</span>
          </Button>
        </div>
        <div class="type-toolbar">
          <div class="type-search">
            <i class="pi pi-search type-search-icon" />
            <InputText
              v-model="typeSearchQuery"
              placeholder="Klasse suchen..."
              class="type-search-input"
            />
          </div>
          <Button icon="pi pi-angle-double-down" text rounded size="small" @click="expandAll" v-tooltip.bottom="'Expand All'" />
          <Button icon="pi pi-angle-double-up" text rounded size="small" @click="collapseAll" v-tooltip.bottom="'Collapse All'" />
          <span class="filter-summary">{{ hiddenCount(typeDialogView.id) }} types hidden</span>
        </div>
        <div class="type-tree-container">
          <Tree
            :value="filteredTreeNodes"
            v-model:expandedKeys="expandedKeys"
            class="type-tree"
            scrollHeight="flex"
          >
            <template #default="{ node }">
              <div class="type-node">
                <template v-if="node.data?.type === 'class'">
                  <Checkbox
                    :modelValue="!isClassHidden(typeDialogView!.id, node.data.eClass)"
                    @update:modelValue="toggleClassInView(typeDialogView!.id, node.data.eClass)"
                    binary
                  />
                  <span class="type-label" :class="{ hidden: isClassHidden(typeDialogView!.id, node.data.eClass) }">
                    {{ node.label }}
                  </span>
                  <span v-if="node.data.eClass?.isAbstract?.()" class="abstract-tag">abstract</span>
                </template>
                <template v-else-if="node.data?.type === 'package'">
                  <Checkbox
                    :modelValue="!isPackageAllHidden(typeDialogView!.id, node)"
                    @update:modelValue="togglePackageInView(typeDialogView!.id, node)"
                    binary
                  />
                  <span class="type-label pkg-label">{{ node.label }}</span>
                </template>
              </div>
            </template>
          </Tree>
        </div>
      </div>
      <template #footer>
        <Button label="Close" @click="showTypeDialog = false" />
      </template>
    </Dialog>

    <!-- Icon Picker Dialog -->
    <Dialog
      v-model:visible="showIconPicker"
      header="Icon auswählen"
      :modal="true"
      :style="{ width: '520px' }"
    >
      <IconPicker
        v-model="iconPickerValue"
        :add-custom-icon="editorConfigService?.addCustomIcon"
        @select="handleViewIconSelect"
      />
    </Dialog>
  </div>
</template>

<style scoped>
.views-editor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--surface-border);
  flex-shrink: 0;
}

.panel-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-color-secondary);
}

/* View Cards */
.views-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.view-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  background: var(--surface-card);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.view-card:hover {
  border-color: color-mix(in srgb, var(--primary-color) 40%, var(--surface-border));
}

.view-card.active {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 6%, var(--surface-card));
}

.view-card.dragging { opacity: 0.4; }

.view-card.drag-over {
  border-color: var(--primary-color);
  box-shadow: 0 -2px 0 0 var(--primary-color);
}

.drag-handle {
  color: var(--text-color-secondary);
  opacity: 0.3;
  cursor: grab;
  font-size: 0.625rem;
  flex-shrink: 0;
}

.view-card:hover .drag-handle { opacity: 0.7; }

.view-icon {
  font-size: 0.8rem;
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.view-icon--img {
  width: 0.9rem;
  height: 0.9rem;
  object-fit: contain;
}

:root.p-dark .view-icon--img,
.dark-theme .view-icon--img {
  filter: invert(0.85);
}

.icon-picker-btn {
  min-width: 36px;
  padding: 0.25rem 0.5rem;
}

.btn-icon-img {
  width: 1rem;
  height: 1rem;
  object-fit: contain;
}

:root.p-dark .btn-icon-img,
.dark-theme .btn-icon-img {
  filter: invert(0.85);
}

.view-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-color);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.view-name.disabled {
  opacity: 0.4;
  font-style: italic;
}

.badge {
  font-size: 0.6rem;
  padding: 1px 5px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--orange-500) 15%, transparent);
  color: var(--orange-600);
  white-space: nowrap;
  flex-shrink: 0;
}

.card-actions {
  display: flex;
  gap: 0;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.view-card:hover .card-actions { opacity: 1; }

.card-actions :deep(.p-button) {
  width: 22px;
  height: 22px;
  padding: 0;
}

/* Empty state */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  color: var(--text-color-secondary);
  flex: 1;
}

.empty-state .hint {
  font-size: 0.8125rem;
  opacity: 0.7;
}

/* Dialogs */
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.dialog-form label {
  font-weight: 500;
  font-size: 0.875rem;
}

.w-full {
  width: 100%;
}

/* Type Dialog */
.type-settings {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--surface-border);
  flex-shrink: 0;
  font-size: 0.8125rem;
}

.meta-label {
  color: var(--text-color-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
}

.settings-sep {
  width: 1px;
  height: 16px;
  background: var(--surface-border);
  margin: 0 4px;
}


.type-dialog-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.type-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-bottom: 1px solid var(--surface-border);
  flex-shrink: 0;
}

.type-search {
  position: relative;
  flex: 1;
  min-width: 0;
}

.type-search-icon {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-color-secondary);
  font-size: 0.8rem;
  pointer-events: none;
}

.type-search-input {
  width: 100%;
  padding-left: 28px !important;
  font-size: 0.8125rem;
}

.type-search-input :deep(.p-inputtext) {
  padding: 0.35rem 0.5rem 0.35rem 28px;
  font-size: 0.8125rem;
}

.filter-summary {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.type-tree-container {
  flex: 1;
  overflow: auto;
  padding: 0.25rem;
}

.type-tree {
  background: transparent;
}

.type-tree :deep(.p-tree-node-content) {
  padding: 0.2rem 0.5rem;
}

.type-node {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.type-label {
  font-size: 0.8125rem;
}

.type-label.hidden {
  text-decoration: line-through;
  opacity: 0.5;
}

.type-label.pkg-label {
  font-weight: 600;
}

.abstract-tag {
  font-size: 0.6rem;
  color: var(--text-color-secondary);
  background: var(--surface-200);
  padding: 1px 4px;
  border-radius: 3px;
  font-style: italic;
}
</style>
