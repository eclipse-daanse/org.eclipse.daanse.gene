<script setup lang="ts">
/**
 * InstanceTree Component
 *
 * Tree view of EMF model instances (or Ecore elements in Metamodeler mode).
 * Supports drag-drop from Model Browser to create new instances.
 *
 * Uses EditorContext via inject() to support both:
 * - Instance Editor: shows .xmi instances
 * - Metamodeler: shows .ecore elements as instances of Ecore.ecore
 */

import { ref, computed, watch, inject } from 'tsm:vue'
import { Tree } from 'tsm:primevue'
import { Button } from 'tsm:primevue'
import { ContextMenu } from 'tsm:primevue'
import { Dialog } from 'tsm:primevue'
import { Dropdown } from 'tsm:primevue'
import type { EditorContext } from '../context/editorContext'
import { createInstanceContext } from '../context/instanceContext'
import { useSharedInstanceTree } from '../composables/useInstanceTree'
import { useSharedViews, getTypeUri, getElementUri } from '../composables/useViews'
import type { InstanceTreeNode } from '../types'
import type { EObject, EClass, EReference } from '@emfts/core'
import IconSettings from './IconSettings.vue'
import ViewsEditorDialog from './ViewsEditorDialog.vue'

// Props - context can be provided by parent (for different perspectives)
const props = defineProps<{
  context?: EditorContext
}>()

const emit = defineEmits<{
  'object-select': [object: EObject | null]
  'object-create': [object: EObject]
  'object-delete': [object: EObject]
}>()

// TSM for service access
const tsm = inject<any>('tsm')

// Use provided context, or global context (mode-aware), or create default
const ctx = props.context
  || tsm?.getService('gene.editor.context')?.getCurrentContext?.()
  || createInstanceContext()
const eventBus = tsm?.getService('gene.eventbus') as any
const sharedTree = useSharedInstanceTree()


// Helper to get name from ENamedElement - handles both native and DynamicEObject
function getElementName(element: any): string {
  if (!element) return 'unknown'
  // Try native getName first
  if (typeof element.getName === 'function') {
    return element.getName() ?? 'unknown'
  }
  // DynamicEObject - try eGet
  try {
    const eClass = element.eClass?.()
    if (eClass) {
      const nameFeature = eClass.getEStructuralFeature?.('name')
      if (nameFeature) {
        return element.eGet?.(nameFeature) ?? 'unknown'
      }
    }
  } catch { /* ignore */ }
  return 'unknown'
}

// Create reactive computed properties from the context
const ctxTreeNodes = computed(() => ctx.treeNodes.value)
const ctxSelectedKeys = computed({
  get: () => ctx.selectedKeys.value,
  set: (v) => { ctx.selectedKeys.value = v }
})
const ctxExpandedKeys = computed({
  get: () => ctx.expandedKeys.value,
  set: (v) => { ctx.expandedKeys.value = v }
})
const ctxSelectedObject = computed(() => ctx.selectedObject.value)
const ctxSelectedNode = computed(() => ctx.selectedNode.value)
const ctxAllPackages = computed(() => ctx.allPackages.value)

// Context menu ref
const contextMenu = ref<InstanceType<typeof ContextMenu> | null>(null)

// Drag state
const isDragOver = ref(false)

// New root instance dialog
const showNewInstanceDialog = ref(false)
const selectedClass = ref<any>(null)

// Icon settings dialog
const showIconSettings = ref(false)

// Views editor dialog
const showViewsEditor = ref(false)

// Available classes for creating instances (filtered by active view)
const views = useSharedViews()
const availableClasses = computed(() => {
  const classes: any[] = []
  for (const pkg of ctxAllPackages.value) {
    const concreteClasses = ctx.getConcreteClasses(pkg)
    classes.push(...concreteClasses)
  }
  // Apply view filter if active
  if (views.activeView.value) {
    return classes.filter(cls => !views.isTypeHidden(cls.eClass))
  }
  return classes
})

// Check if we have any models loaded
const hasModels = computed(() => ctxAllPackages.value.length > 0)

// Check if we have any instances
const hasInstances = computed(() => ctxTreeNodes.value.length > 0)

// Check if we're in instance mode (not metamodel mode)
const isInstanceMode = computed(() => ctx.mode === 'instance')

// OCL Validation state
const isValidating = ref(false)
const hasValidationErrors = ref(false)

// Toolbar actions from ActionRegistry (contributed by plugins)
const toolbarActions = ref<any[]>([])
const executingActions = ref<Record<string, boolean>>({})

function loadToolbarActions() {
  const actionRegistry = tsm?.getService('gene.action.registry')
  if (!actionRegistry) return
  const perspectiveManager = tsm?.getService('ui.registry.perspectives')
  const perspectiveId = perspectiveManager?.state?.currentPerspectiveId || ''
  toolbarActions.value = actionRegistry.getActionsForPerspective(perspectiveId)
}

// Reload when registry changes — retry until registry is available
function initToolbarActions() {
  const actionRegistry = tsm?.getService('gene.action.registry')
  if (actionRegistry?.onChange) {
    actionRegistry.onChange(() => loadToolbarActions())
    loadToolbarActions()
  } else {
    // Registry not yet available, retry on next tick
    setTimeout(initToolbarActions, 500)
  }
}
initToolbarActions()

async function executeToolbarAction(action: any) {
  const actionManager = tsm?.getService('gene.action.manager')
  if (!actionManager) return

  const actionId = action.definition.actionId
  executingActions.value = { ...executingActions.value, [actionId]: true }
  try {
    const context = {
      selectedObject: ctxSelectedObject.value,
      selectedObjects: [],
      perspectiveId: '',
      timestamp: new Date()
    }
    await actionManager.execute(actionId, context)
  } finally {
    const { [actionId]: _, ...rest } = executingActions.value
    executingActions.value = rest
  }
}

async function handleValidateOcl() {
  const ps = tsm?.getService('gene.problems')
  if (!ps) {
    console.warn('[InstanceTree] Problems service not available (gene.problems)')
    return
  }

  const { getSharedResource } = await import('../composables/useInstanceTree')
  const resource = getSharedResource()
  if (!resource) {
    console.warn('[InstanceTree] No resource available for validation')
    return
  }

  isValidating.value = true
  try {
    await ps.validateResource(resource)
    hasValidationErrors.value = ps.hasErrors?.value ?? false

    const stats = ps.stats?.value
    console.log(`[InstanceTree] Validation complete: ${stats?.errorCount ?? 0} errors, ${stats?.warningCount ?? 0} warnings`)

    // Show problems panel if errors found
    if (ps.hasErrors?.value) {
      eventBus.emit('show-problems')
    }
  } catch (e) {
    console.error('[InstanceTree] Validation failed:', e)
  } finally {
    isValidating.value = false
  }
}


/**
 * Check if a class is a subtype of another
 */
function isSubtypeOf(subClass: EClass, superClass: EClass): boolean {
  if (subClass === superClass) return true
  try {
    const superTypes = typeof subClass.getESuperTypes === 'function' ? subClass.getESuperTypes() : []
    if (superTypes && (Array.isArray(superTypes) || (superTypes as any)[Symbol.iterator])) {
      for (const superType of superTypes) {
        if (isSubtypeOf(superType, superClass)) return true
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return false
}

/**
 * Resolve the EClass type of a reference, handling unresolved proxies
 */
function resolveReferenceType(ref: EReference): EClass | null {
  // Try native getEReferenceType first (may auto-resolve proxies)
  if (typeof ref.getEReferenceType === 'function') {
    try {
      const resolved = ref.getEReferenceType()
      if (resolved && typeof resolved.getEAllStructuralFeatures === 'function') {
        return resolved
      }
    } catch { /* fall through */ }
  }

  // Fallback: use getEType
  const eType = ref.getEType() as EClass
  if (!eType) return null

  // Check if it's a proper EClass (not a proxy)
  if (typeof eType.getEAllStructuralFeatures === 'function') {
    return eType
  }

  // Handle unresolved proxy: parse URI and look up in loaded packages
  if (typeof (eType as any).eIsProxy === 'function' && (eType as any).eIsProxy()) {
    const proxyURI = (eType as any).eProxyURI?.()?.toString?.() || ''
    const hashIdx = proxyURI.indexOf('#//')
    if (hashIdx >= 0) {
      const nsURI = proxyURI.substring(0, hashIdx)
      const className = proxyURI.substring(hashIdx + 3)
      for (const pkg of ctxAllPackages.value) {
        if (pkg.nsURI === nsURI) {
          const concreteClasses = ctx.getConcreteClasses(pkg)
          const found = concreteClasses.find(c => c.name === className)
          if (found) return found.eClass
          // Also check abstract classes via ePackage.getEClassifier
          const classifier = pkg.ePackage.getEClassifier?.(className)
          if (classifier && typeof (classifier as any).getEAllStructuralFeatures === 'function') {
            return classifier as EClass
          }
        }
      }
    }
  }

  return null
}

/**
 * Get all valid concrete classes for a containment reference
 */
function getValidClassesForRef(ref: EReference): EClass[] {
  const refType = resolveReferenceType(ref)
  if (!refType) return []

  const result: EClass[] = []

  // If the reference type itself is concrete, include it
  if (typeof refType.isAbstract === 'function' && !refType.isAbstract() &&
      typeof refType.isInterface === 'function' && !refType.isInterface()) {
    result.push(refType)
  }

  // Find all concrete subclasses from loaded packages
  for (const pkg of ctxAllPackages.value) {
    const concreteClasses = ctx.getConcreteClasses(pkg)
    for (const classInfo of concreteClasses) {
      if (classInfo.eClass !== refType && isSubtypeOf(classInfo.eClass, refType)) {
        if (!result.includes(classInfo.eClass)) {
          result.push(classInfo.eClass)
        }
      }
    }
  }

  // Apply view filter if active
  if (views.activeView.value) {
    return result.filter(cls => !views.isTypeHidden(cls))
  }
  return result
}

// Context menu items
const contextMenuItems = computed(() => {
  if (!ctxSelectedNode.value) return []

  const items = []

  // Add child submenu
  const containmentRefs = ctx.getAvailableContainmentRefs()

  if (containmentRefs.length > 0) {
    items.push({
      label: 'Add Child',
      icon: 'pi pi-plus',
      items: containmentRefs.map(ref => {
        const validClasses = getValidClassesForRef(ref)

        // If only one class, create directly on click
        if (validClasses.length === 1) {
          return {
            label: getElementName(ref),
            icon: 'pi pi-arrow-right',
            command: () => handleAddChild(validClasses[0], ref)
          }
        }

        // Multiple classes - create nested submenu
        return {
          label: getElementName(ref),
          icon: 'pi pi-arrow-right',
          items: validClasses.map(eClass => ({
            label: getElementName(eClass),
            icon: 'pi pi-file',
            command: () => handleAddChild(eClass, ref)
          }))
        }
      })
    })
  }

  items.push({ separator: true })

  // Delete
  items.push({
    label: 'Delete',
    icon: 'pi pi-trash',
    disabled: false,
    command: handleDelete
  })

  // Quick Actions from ActionRegistry
  const selectedData = ctxSelectedNode.value?.data
  if (selectedData && tsm) {
    const actionRegistry = tsm.getService('gene.action.registry')
    const actionManager = tsm.getService('gene.action.manager')
    if (actionRegistry && actionManager) {
      const perspectiveManager = tsm.getService('ui.registry.perspectives')
      const perspectiveId = perspectiveManager?.state?.currentPerspectiveId || ''
      const availableActions = actionRegistry.getActionsForObject(selectedData, perspectiveId)

      if (availableActions.length > 0) {
        items.push({ separator: true })
        items.push({
          label: 'Actions',
          icon: 'pi pi-bolt',
          items: availableActions.map((ra: any) => ({
            label: ra.definition.label || ra.definition.actionId,
            icon: ra.definition.icon?.cssClass || 'pi pi-play',
            disabled: !actionManager.canExecute(ra.definition.actionId, {
              selectedObject: selectedData,
              selectedObjects: [selectedData],
              perspectiveId,
              timestamp: new Date()
            }),
            command: async () => {
              const result = await actionManager.execute(ra.definition.actionId, {
                selectedObject: selectedData,
                selectedObjects: [selectedData],
                perspectiveId,
                timestamp: new Date()
              })
              // Handle result (toast notification)
              if (result.status === 'SUCCESS') {
                console.log(`[Action] ${ra.definition.label}: Success`, result.logs)
              } else if (result.status === 'ERROR') {
                console.error(`[Action] ${ra.definition.label}: Error`, result.logs)
              }
              // Handle artifacts
              for (const artifact of result.artifacts || []) {
                handleActionArtifact(artifact)
              }
            }
          }))
        })
      }
    }
  }

  // View/Filter options
  const views = useSharedViews()
  if (views.activeView.value) {
    items.push({ separator: true })

    const selectedData = ctxSelectedNode.value?.data
    if (selectedData) {
      const eClass = typeof selectedData.eClass === 'function' ? selectedData.eClass() : null

      if (eClass) {
        items.push({
          label: `Hide "${getElementName(eClass)}" Type`,
          icon: 'pi pi-eye-slash',
          command: () => {
            views.hideTypeByClass(eClass, 'TYPE_ONLY')
          }
        })

        items.push({
          label: `Hide "${getElementName(eClass)}" & Subtypes`,
          icon: 'pi pi-eye-slash',
          command: () => {
            views.hideTypeByClass(eClass, 'TYPE_AND_SUBTYPES')
          }
        })
      }

      items.push({
        label: 'Hide This Element',
        icon: 'pi pi-eye-slash',
        command: () => {
          views.hideElementByObject(selectedData)
        }
      })
    }
  }

  return items
})


/**
 * Handle action result artifacts
 */
function handleActionArtifact(artifact: any) {
  switch (artifact.type) {
    case 'FILE':
      if (artifact.handling === 'DOWNLOAD' && artifact.content) {
        const blob = artifact.content instanceof Blob ? artifact.content : new Blob([artifact.content])
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = artifact.fileName || 'download'
        a.click()
        URL.revokeObjectURL(url)
      }
      break
    case 'VALIDATION_MESSAGES':
      // Route to problems panel via eventbus
      if (artifact.messages) {
        const problemsService = tsm?.getService('gene.problems')
        if (problemsService?.addIssues) {
          problemsService.addIssues(artifact.messages)
        }
      }
      break
    case 'MARKDOWN':
      console.log('[Action] Markdown result:', artifact.content)
      break
    case 'XMI':
      console.log('[Action] XMI result:', artifact.xmiContent?.substring(0, 200))
      break
    default:
      console.log('[Action] Artifact:', artifact.type, artifact)
  }
}

/**
 * Handle tree node selection
 */
function handleNodeSelect(node: InstanceTreeNode) {
  ctx.selectNode(node as any)
  emit('object-select', node.data)
}

/**
 * Handle context menu
 */
function handleContextMenu(event: MouseEvent) {
  contextMenu.value?.show(event)
}

/**
 * Handle adding a child
 */
function handleAddChild(eClass: EClass, ref: EReference) {
  const newObj = ctx.createChildInSelected(eClass, ref)
  if (newObj) {
    emit('object-create', newObj)
  }
}

/**
 * Handle delete
 */
function handleDelete() {
  const obj = ctxSelectedObject.value
  if (obj && ctx.deleteSelected()) {
    emit('object-delete', obj)
    emit('object-select', null)
  }
}

/**
 * Handle drag over (for dropping EClasses from model browser)
 */
function handleDragOver(event: DragEvent) {
  if (event.dataTransfer?.types.includes('application/x-eclass')) {
    event.preventDefault()
    isDragOver.value = true
  }
}

/**
 * Handle drag leave
 */
function handleDragLeave() {
  isDragOver.value = false
}

/**
 * Handle drop (create instance from dropped EClass)
 */
function handleDrop(event: DragEvent) {
  isDragOver.value = false

  const qualifiedName = event.dataTransfer?.getData('application/x-eclass')
  if (!qualifiedName) return

  const classInfo = ctx.findClass(qualifiedName)
  if (!classInfo) {
    console.warn(`Class not found: ${qualifiedName}`)
    return
  }

  // Find a valid containment reference
  const containmentRefs = ctx.getAvailableContainmentRefs()
  for (const ref of containmentRefs) {
    const refType = ref.getEType() as EClass
    if (refType && isSubtypeOf(classInfo.eClass, refType)) {
      handleAddChild(classInfo.eClass, ref)
      return
    }
  }

  console.warn(`No valid containment reference found for ${qualifiedName}`)
}

/**
 * Create a new root instance from selected class
 */
function handleCreateRootInstance() {
  if (!selectedClass.value) return

  const classInfo = selectedClass.value
  const eClass = classInfo.eClass

  // Create instance using factory
  const factory = eClass.getEPackage().getEFactoryInstance()
  const newObj = factory.create(eClass)

  // Add to resource (create resource if needed)
  ctx.addRootObject(newObj)

  showNewInstanceDialog.value = false
  selectedClass.value = null

  emit('object-create', newObj)
}

// Watch for selection changes to emit events
watch(ctxSelectedObject, (obj) => {
  emit('object-select', obj)
})
</script>

<template>
  <div
    class="instance-tree"
    :class="{ 'drag-over': isDragOver }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <!-- Header -->
    <div class="tree-header">
      <span class="header-title">Instances</span>
      <div class="header-actions">
        <Button
          icon="pi pi-search"
          text
          rounded
          size="small"
          :disabled="!hasInstances"
          @click="eventBus.emit('open-search-dialog')"
          v-tooltip.bottom="'Search (Ctrl+Shift+F)'"
        />
        <Button
          v-if="isInstanceMode"
          icon="pi pi-save"
          text
          rounded
          size="small"
          :disabled="!hasInstances"
          @click="eventBus.emit('save-instances-request')"
          v-tooltip.bottom="'Save Instances'"
        />
        <Button
          v-if="isInstanceMode"
          icon="pi pi-check-circle"
          text
          rounded
          size="small"
          :disabled="!hasInstances || isValidating"
          :class="{ 'validate-error': hasValidationErrors }"
          @click="handleValidateOcl"
          v-tooltip.bottom="'Validate OCL (local)'"
        />
        <Button
          v-for="action in toolbarActions"
          :key="action.definition.actionId"
          :icon="action.definition.icon || 'pi pi-play'"
          text
          rounded
          size="small"
          :disabled="!hasInstances || executingActions[action.definition.actionId]"
          :loading="executingActions[action.definition.actionId]"
          @click="executeToolbarAction(action)"
          v-tooltip.bottom="action.definition.label"
        />
        <Button
          icon="pi pi-sitemap"
          text
          rounded
          size="small"
          :class="{ 'toggle-active': sharedTree.showSuperTypes.value }"
          @click="sharedTree.showSuperTypes.value = !sharedTree.showSuperTypes.value"
          v-tooltip.bottom="'Show Supertypes'"
        />
        <Button
          icon="pi pi-filter"
          text
          rounded
          size="small"
          @click="showViewsEditor = true"
          v-tooltip.bottom="'Edit Views'"
        />
        <Button
          icon="pi pi-cog"
          text
          rounded
          size="small"
          @click="showIconSettings = true"
          v-tooltip.bottom="'Icon Settings'"
        />
        <Button
          v-if="hasModels"
          icon="pi pi-plus"
          text
          rounded
          size="small"
          @click="showNewInstanceDialog = true"
          v-tooltip.bottom="'New Instance'"
        />
      </div>
    </div>

    <!-- No models loaded -->
    <div v-if="!hasModels" class="empty-state">
      <i class="pi pi-box"></i>
      <p>No models loaded</p>
      <p class="hint">Add a .ecore model from the File Explorer first</p>
    </div>

    <!-- Empty tree (no instances) -->
    <div v-else-if="ctxTreeNodes.length === 0" class="empty-state">
      <i class="pi pi-plus-circle"></i>
      <p>No instances</p>
      <p class="hint">Click + to create an instance, or drag a class from the Model Browser</p>
      <Button
        label="New Instance"
        icon="pi pi-plus"
        size="small"
        @click="showNewInstanceDialog = true"
      />
    </div>

    <!-- Instance tree -->
    <div v-else class="tree-container">
      <Tree
        :value="ctxTreeNodes"
        v-model:selectionKeys="ctxSelectedKeys"
        v-model:expandedKeys="ctxExpandedKeys"
        selectionMode="single"
        @node-select="handleNodeSelect"
        class="emf-tree"
      >
        <template #default="{ node }">
          <div
            class="tree-node"
            @contextmenu.prevent="(event) => { ctx.selectNode(node); handleContextMenu(event) }"
          >
            <span class="node-label">{{ node.label }}</span>
          </div>
        </template>
      </Tree>
    </div>

    <!-- Drag overlay -->
    <div v-if="isDragOver" class="drag-overlay">
      <i class="pi pi-download"></i>
      <span>Drop to create instance</span>
    </div>

    <!-- Context Menu -->
    <ContextMenu ref="contextMenu" :model="contextMenuItems" />

    <!-- New Instance Dialog -->
    <Dialog
      v-model:visible="showNewInstanceDialog"
      header="Create New Instance"
      :modal="true"
      :style="{ width: '400px' }"
    >
      <div class="dialog-content">
        <div class="field">
          <label>Select Class</label>
          <Dropdown
            v-model="selectedClass"
            :options="availableClasses"
            optionLabel="name"
            placeholder="Select a class"
            filter
            :filterFields="['name', 'qualifiedName', 'packageInfo.name', 'packageInfo.nsURI']"
            class="w-full"
          >
            <template #option="{ option }">
              <div class="class-option">
                <span class="class-name">{{ option.name }}</span>
                <span class="class-uri">{{ option.packageInfo?.nsURI }}</span>
              </div>
            </template>
            <template #value="{ value }">
              <div v-if="value" class="class-option">
                <span class="class-name">{{ value.name }}</span>
                <span class="class-uri">{{ value.packageInfo?.nsURI }}</span>
              </div>
              <span v-else>Select a class</span>
            </template>
          </Dropdown>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewInstanceDialog = false" />
        <Button label="Create" @click="handleCreateRootInstance" :disabled="!selectedClass" />
      </template>
    </Dialog>

    <!-- Icon Settings Dialog -->
    <IconSettings v-model:visible="showIconSettings" />

    <!-- Views Editor Dialog -->
    <ViewsEditorDialog
      v-model:visible="showViewsEditor"
      :packages="ctxAllPackages"
    />
  </div>
</template>

<style scoped>
.instance-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-ground);
  position: relative;
}

.instance-tree.drag-over {
  background: var(--primary-50);
}

.tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-section);
}

.validate-error {
  color: var(--red-500) !important;
}

.header-title {
  font-weight: 600;
  font-size: 0.875rem;
  text-transform: uppercase;
  color: var(--text-color-secondary);
}

.workspace-name {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  font-family: monospace;
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
  opacity: 0.7;
}

.tree-container {
  flex: 1;
  overflow: auto;
}

.emf-tree {
  padding: 0.5rem;
  background: transparent;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.node-label {
  font-size: 0.875rem;
}

.drag-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--primary-100);
  opacity: 0.9;
  pointer-events: none;
}

.drag-overlay i {
  font-size: 3rem;
  color: var(--primary-500);
  margin-bottom: 1rem;
}

.drag-overlay span {
  font-size: 1rem;
  font-weight: 600;
  color: var(--primary-700);
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

/* Dialog styles */
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

.w-full {
  width: 100%;
}

.class-option {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
}

.class-name {
  font-weight: 500;
  font-size: 0.875rem;
}

.class-uri {
  font-size: 0.7rem;
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
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

.header-actions :deep(.toggle-active) {
  color: var(--primary-color);
  background: var(--primary-50);
}
</style>
