<script setup lang="ts">
/**
 * MetamodelerTree Component
 *
 * Tree view for the Ecore metamodel structure.
 * Displays EPackage, EClass, EAttribute, EReference, and OCL constraints.
 */

import { ref, computed, watch, inject } from 'tsm:vue'
import { Tree } from 'tsm:primevue'
import type { TreeNode } from 'tsm:primevue'
import { Button } from 'tsm:primevue'
import { ContextMenu } from 'tsm:primevue'
import { Dialog } from 'tsm:primevue'
import { InputText } from 'tsm:primevue'
import { Checkbox } from 'tsm:primevue'
import type { EPackage, EClass, ENamedElement, EClassifier, EDataType, EEnum } from '@emfts/core'
import { getEcorePackage } from '@emfts/core'
import { Select } from 'tsm:primevue'
import { useSharedMetamodeler } from '../composables/useMetamodeler'
import { EPackageToJsonSchemaConverter } from '@emfts/codec.jsonschema'
import type { MetaTreeNode } from '../types'

const emit = defineEmits<{
  'element-select': [element: ENamedElement]
}>()

const tsm = inject<any>('tsm')

function getIconDataUrl(iconClass: string | undefined): string | undefined {
  if (!iconClass || !iconClass.startsWith('custom-icon custom-icon--')) return undefined
  const id = iconClass.replace('custom-icon custom-icon--', '')
  const registry = tsm?.getService('gene.icons.registry')
  const provider = registry?.get?.('custom-icons') as any
  return provider?.getDataUrl?.(id)
}

const metamodeler = useSharedMetamodeler()

// Tree state
const selectedKey = ref<Record<string, boolean>>({})
const expandedKeys = ref<Record<string, boolean>>({})

// Context menu
const contextMenu = ref<InstanceType<typeof ContextMenu> | null>(null)
const selectedNode = ref<MetaTreeNode | null>(null)

// Dialog state
const showNewPackageDialog = ref(false)
const showNewClassDialog = ref(false)
const showNewAttributeDialog = ref(false)
const showNewReferenceDialog = ref(false)
const showNewLiteralDialog = ref(false)

// New element form data
const newPackageName = ref('')
const newPackageNsURI = ref('')
const newPackageNsPrefix = ref('')

const newClassName = ref('')
const newClassAbstract = ref(false)
const newClassInterface = ref(false)

const newAttributeName = ref('')
const newAttributeType = ref<EDataType | null>(null)

// Available data types for attribute type (from Ecore package)
const availableDataTypes = computed<EDataType[]>(() => {
  const ecorePkg = getEcorePackage()
  const dataTypes: EDataType[] = []
  const classifiers = ecorePkg.getEClassifiers()
  for (const classifier of classifiers) {
    // Check if it's an EDataType (has getInstanceClassName but not isAbstract for classes)
    if ('getInstanceClassName' in classifier && !('isAbstract' in classifier && 'isInterface' in classifier)) {
      dataTypes.push(classifier as EDataType)
    }
  }
  // Sort by name for easier selection
  dataTypes.sort((a, b) => (a.getName() || '').localeCompare(b.getName() || ''))
  return dataTypes
})

const newLiteralName = ref('')
const newLiteralValue = ref(0)
const literalTargetEnum = ref<EEnum | null>(null)

const newReferenceName = ref('')
const newReferenceContainment = ref(false)
const newReferenceTargetType = ref<EClass | null>(null)

// Available classes for reference target type
const availableClasses = computed<EClass[]>(() => {
  const pkg = metamodeler.rootPackage.value
  if (!pkg) return []

  const classes: EClass[] = []
  const classifiers = pkg.getEClassifiers()
  for (const classifier of classifiers) {
    if ('isAbstract' in classifier && 'isInterface' in classifier) {
      classes.push(classifier as EClass)
    }
  }
  return classes
})

// Context menu items based on selected node type
const contextMenuItems = computed(() => {
  if (!selectedNode.value) return []

  const node = selectedNode.value

  if (node.type === 'package') {
    return [
      {
        label: 'Add Class',
        icon: 'pi pi-plus',
        command: () => openNewClassDialog()
      },
      {
        label: 'Add Subpackage',
        icon: 'pi pi-folder-plus',
        command: () => openNewPackageDialog()
      },
      { separator: true },
      {
        label: 'Delete Package',
        icon: 'pi pi-trash',
        disabled: true, // Can't delete root package
        command: () => {}
      }
    ]
  }

  if (node.type === 'class') {
    return [
      {
        label: 'Add Attribute',
        icon: 'pi pi-plus',
        command: () => openNewAttributeDialog()
      },
      {
        label: 'Add Reference',
        icon: 'pi pi-plus',
        command: () => openNewReferenceDialog()
      },
      {
        label: 'Add Constraint',
        icon: 'pi pi-check-circle',
        command: () => handleAddConstraint()
      },
      { separator: true },
      {
        label: 'Delete Class',
        icon: 'pi pi-trash',
        command: () => handleDelete()
      }
    ]
  }

  if (node.type === 'datatype') {
    // Check if it's an EEnum (has getELiterals)
    const isEnum = typeof (node.data as any).getELiterals === 'function'
      || (node.data as any).eClass?.()?.getName?.() === 'EEnum'
    if (isEnum) {
      return [
        {
          label: 'Add Literal',
          icon: 'pi pi-plus',
          command: () => openNewLiteralDialog()
        },
        { separator: true },
        {
          label: 'Delete Enum',
          icon: 'pi pi-trash',
          command: () => handleDelete()
        }
      ]
    }
    return [
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        command: () => handleDelete()
      }
    ]
  }

  if (node.type === 'attribute' || node.type === 'reference' || node.type === 'constraint' || node.type === 'literal') {
    return [
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        command: () => handleDelete()
      }
    ]
  }

  return []
})

// Handlers
function handleNodeSelect(node: TreeNode) {
  const metaNode = node as unknown as MetaTreeNode
  selectedNode.value = metaNode
  emit('element-select', metaNode.data as ENamedElement)
  metamodeler.selectElement(metaNode.data as ENamedElement)
}

function handleContextMenu(event: MouseEvent, node: TreeNode) {
  selectedNode.value = node as unknown as MetaTreeNode
  contextMenu.value?.show(event)
}

// New Package Dialog
function openNewPackageDialog() {
  newPackageName.value = ''
  newPackageNsURI.value = ''
  newPackageNsPrefix.value = ''
  showNewPackageDialog.value = true
}

function createNewPackage() {
  if (!newPackageName.value || !newPackageNsURI.value) return

  // If a package node is selected, add as subpackage
  if (selectedNode.value && selectedNode.value.type === 'package' && metamodeler.rootPackage.value) {
    const parentPkg = selectedNode.value.data as EPackage
    metamodeler.addSubpackage(
      parentPkg,
      newPackageName.value,
      newPackageNsURI.value,
      newPackageNsPrefix.value || newPackageName.value.toLowerCase()
    )
  } else {
    // Create new root package
    metamodeler.createNewPackage(
      newPackageName.value,
      newPackageNsURI.value,
      newPackageNsPrefix.value || newPackageName.value.toLowerCase()
    )
  }

  showNewPackageDialog.value = false
}

// New Class Dialog
function openNewClassDialog() {
  newClassName.value = ''
  newClassAbstract.value = false
  newClassInterface.value = false
  showNewClassDialog.value = true
}

function createNewClass() {
  if (!newClassName.value || !selectedNode.value) return

  const pkg = selectedNode.value.data as EPackage
  metamodeler.addClass(pkg, newClassName.value, {
    isAbstract: newClassAbstract.value,
    isInterface: newClassInterface.value
  })

  showNewClassDialog.value = false
}

// New Attribute Dialog
function openNewAttributeDialog() {
  newAttributeName.value = ''
  // Default to EString if available
  const eStringType = availableDataTypes.value.find(dt => dt.getName() === 'EString')
  newAttributeType.value = eStringType || null
  showNewAttributeDialog.value = true
}

function createNewAttribute() {
  if (!newAttributeName.value || !selectedNode.value || !newAttributeType.value) return

  const eClass = selectedNode.value.data as EClass
  const typeName = newAttributeType.value.getName() || 'EString'
  const attr = metamodeler.addAttribute(eClass, newAttributeName.value, typeName)

  // Set the actual EType on the attribute
  if (attr && newAttributeType.value) {
    attr.setEType(newAttributeType.value)
  }

  showNewAttributeDialog.value = false
}

// New Reference Dialog
function openNewReferenceDialog() {
  newReferenceName.value = ''
  newReferenceContainment.value = false
  newReferenceTargetType.value = null
  showNewReferenceDialog.value = true
}

function createNewReference() {
  if (!newReferenceName.value || !selectedNode.value || !newReferenceTargetType.value) return

  const eClass = selectedNode.value.data as EClass
  const ref = metamodeler.addReference(eClass, newReferenceName.value, {
    isContainment: newReferenceContainment.value
  })

  // Set the target type
  if (ref && newReferenceTargetType.value) {
    ref.setEType(newReferenceTargetType.value)
  }

  showNewReferenceDialog.value = false
}

// New Literal Dialog
function openNewLiteralDialog(targetEnum?: EEnum) {
  newLiteralName.value = ''
  const eEnum = targetEnum || (selectedNode.value?.type === 'datatype' ? selectedNode.value.data as EEnum : null)
  literalTargetEnum.value = eEnum
  // Auto-calculate next value from existing literals
  if (eEnum && typeof eEnum.getELiterals === 'function') {
    const literals = eEnum.getELiterals()
    newLiteralValue.value = literals.length
  } else {
    newLiteralValue.value = 0
  }
  showNewLiteralDialog.value = true
}

function createNewLiteral() {
  if (!newLiteralName.value || !literalTargetEnum.value) return

  metamodeler.addEnumLiteral(literalTargetEnum.value, newLiteralName.value, newLiteralValue.value)

  showNewLiteralDialog.value = false
  literalTargetEnum.value = null
  metamodeler.clearPendingLiteralDialog()
}

// Watch for pending literal dialog requests (from Properties Panel "Add" button)
watch(() => metamodeler.pendingLiteralDialog.value, (pending) => {
  if (pending) {
    openNewLiteralDialog(pending.eEnum)
  }
})

// Add Constraint
function handleAddConstraint() {
  if (!selectedNode.value || selectedNode.value.type !== 'class') return

  const eClass = selectedNode.value.data as EClass
  const constraintName = `constraint${Date.now()}`
  metamodeler.addOclConstraint(eClass, constraintName, 'self.name.size() > 0')
}

// Delete
function handleDelete() {
  if (!selectedNode.value) return

  const element = selectedNode.value.data as ENamedElement
  metamodeler.deleteElement(element)
}

// Create initial package if none exists
function handleCreateInitialPackage() {
  openNewPackageDialog()
}

// Save metamodel
async function handleSave() {
  const success = await metamodeler.saveToFile()
  if (success) {
    console.log('[MetamodelerTree] Metamodel saved')
  }
}

async function handleSaveAs() {
  const success = await metamodeler.saveAsFile()
  if (success) {
    console.log('[MetamodelerTree] Metamodel saved as new file')
  }
}

async function exportJsonSchema() {
  const ePackage = metamodeler.rootPackage.value
  if (!ePackage) return

  const converter = new EPackageToJsonSchemaConverter()
  const schema = converter.convert(ePackage)
  const jsonStr = JSON.stringify(schema, null, 2)

  const name = ePackage.getName() || 'schema'
  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: `${name}.schema.json`,
      types: [{
        description: 'JSON Schema',
        accept: { 'application/json': ['.json', '.schema.json'] }
      }]
    })
    const writable = await handle.createWritable()
    await writable.write(jsonStr)
    await writable.close()
    console.log('[MetamodelerTree] JSON Schema exported successfully')
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      console.error('[MetamodelerTree] Failed to export JSON Schema:', e)
    }
  }
}
</script>

<template>
  <div class="metamodeler-tree">
    <!-- Header -->
    <div class="tree-header">
      <span class="header-title">
        Metamodel
        <span v-if="metamodeler.dirty.value" class="dirty-indicator">*</span>
      </span>
      <div class="header-actions">
        <Button
          v-if="!metamodeler.rootPackage.value"
          icon="pi pi-plus"
          text
          rounded
          size="small"
          @click="handleCreateInitialPackage"
          v-tooltip.bottom="'New Package'"
        />
        <Button
          icon="pi pi-sitemap"
          text
          rounded
          size="small"
          :class="{ 'toggle-active': metamodeler.showSuperTypes.value }"
          @click="metamodeler.showSuperTypes.value = !metamodeler.showSuperTypes.value"
          v-tooltip.bottom="'Show Supertypes'"
        />
        <Button
          icon="pi pi-save"
          text
          rounded
          size="small"
          :disabled="!metamodeler.rootPackage.value || !metamodeler.dirty.value"
          @click="handleSave"
          v-tooltip.bottom="'Save Metamodel'"
        />
        <Button
          icon="pi pi-file-export"
          text
          rounded
          size="small"
          :disabled="!metamodeler.rootPackage.value"
          @click="handleSaveAs"
          v-tooltip.bottom="'Save As...'"
        />
        <Button
          icon="pi pi-download"
          text
          rounded
          size="small"
          :disabled="!metamodeler.rootPackage.value"
          @click="exportJsonSchema"
          v-tooltip.bottom="'Export JSON Schema'"
        />
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!metamodeler.rootPackage.value" class="empty-state">
      <i class="pi pi-box"></i>
      <p>No metamodel loaded</p>
      <Button
        label="Create Package"
        icon="pi pi-plus"
        size="small"
        @click="handleCreateInitialPackage"
      />
    </div>

    <!-- Tree -->
    <div v-else class="tree-container">
      <Tree
        :value="metamodeler.treeNodes.value"
        v-model:selectionKeys="selectedKey"
        v-model:expandedKeys="expandedKeys"
        selectionMode="single"
        @node-select="handleNodeSelect"
        class="meta-tree"
      >
        <template #default="{ node }">
          <div
            class="tree-node"
            :class="{
              'is-abstract': node.type === 'class' && (node.data as any).isAbstract?.(),
              'is-interface': node.type === 'class' && (node.data as any).isInterface?.(),
              'is-attribute': node.type === 'attribute',
              'is-reference': node.type === 'reference',
              'is-containment': node.type === 'reference' && (node.data as any).isContainment?.(),
              'is-constraint': node.type === 'constraint',
              'is-literal': node.type === 'literal',
              'is-enum': node.type === 'datatype' && (typeof (node.data as any).getELiterals === 'function' || (node.data as any).eClass?.()?.getName?.() === 'EEnum')
            }"
            @contextmenu.prevent="handleContextMenu($event, node)"
          >
            <img v-if="getIconDataUrl(node.icon)" :src="getIconDataUrl(node.icon)" class="node-icon node-icon--img" alt="" />
            <span class="node-label">{{ node.label }}</span>
            <span v-if="node.type === 'class' && (node.data as any).isInterface?.()" class="badge interface">I</span>
            <span v-else-if="node.type === 'class' && (node.data as any).isAbstract?.()" class="badge abstract">A</span>
            <span v-if="node.type === 'reference' && (node.data as any).isContainment?.()" class="badge containment">C</span>
            <span v-if="node.type === 'datatype' && (typeof (node.data as any).getELiterals === 'function' || (node.data as any).eClass?.()?.getName?.() === 'EEnum')" class="badge enum">E</span>
          </div>
        </template>
      </Tree>
    </div>

    <!-- Context Menu -->
    <ContextMenu ref="contextMenu" :model="contextMenuItems" />

    <!-- New Package Dialog -->
    <Dialog
      v-model:visible="showNewPackageDialog"
      header="New Package"
      :modal="true"
      :style="{ width: '400px' }"
    >
      <div class="dialog-content">
        <div class="field">
          <label for="pkgName">Name</label>
          <InputText id="pkgName" v-model="newPackageName" class="w-full" placeholder="MyPackage" />
        </div>
        <div class="field">
          <label for="pkgNsURI">Namespace URI</label>
          <InputText id="pkgNsURI" v-model="newPackageNsURI" class="w-full" placeholder="http://example.org/mypackage" />
        </div>
        <div class="field">
          <label for="pkgNsPrefix">Namespace Prefix</label>
          <InputText id="pkgNsPrefix" v-model="newPackageNsPrefix" class="w-full" placeholder="mypackage" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewPackageDialog = false" />
        <Button label="Create" @click="createNewPackage" :disabled="!newPackageName || !newPackageNsURI" />
      </template>
    </Dialog>

    <!-- New Class Dialog -->
    <Dialog
      v-model:visible="showNewClassDialog"
      header="New Class"
      :modal="true"
      :style="{ width: '400px' }"
    >
      <div class="dialog-content">
        <div class="field">
          <label for="className">Name</label>
          <InputText id="className" v-model="newClassName" class="w-full" placeholder="MyClass" />
        </div>
        <div class="field-checkbox">
          <Checkbox v-model="newClassAbstract" inputId="classAbstract" :binary="true" />
          <label for="classAbstract">Abstract</label>
        </div>
        <div class="field-checkbox">
          <Checkbox v-model="newClassInterface" inputId="classInterface" :binary="true" />
          <label for="classInterface">Interface</label>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewClassDialog = false" />
        <Button label="Create" @click="createNewClass" :disabled="!newClassName" />
      </template>
    </Dialog>

    <!-- New Attribute Dialog -->
    <Dialog
      v-model:visible="showNewAttributeDialog"
      header="New Attribute"
      :modal="true"
      :style="{ width: '400px' }"
    >
      <div class="dialog-content">
        <div class="field">
          <label for="attrName">Name</label>
          <InputText id="attrName" v-model="newAttributeName" class="w-full" placeholder="myAttribute" />
        </div>
        <div class="field">
          <label for="attrType">Type</label>
          <Select
            id="attrType"
            v-model="newAttributeType"
            :options="availableDataTypes"
            optionLabel="getName"
            placeholder="Select type"
            class="w-full"
          >
            <template #value="slotProps">
              <span v-if="slotProps.value">{{ slotProps.value.getName() }}</span>
              <span v-else>{{ slotProps.placeholder }}</span>
            </template>
            <template #option="slotProps">
              {{ slotProps.option.getName() }}
            </template>
          </Select>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewAttributeDialog = false" />
        <Button label="Create" @click="createNewAttribute" :disabled="!newAttributeName || !newAttributeType" />
      </template>
    </Dialog>

    <!-- New Reference Dialog -->
    <Dialog
      v-model:visible="showNewReferenceDialog"
      header="New Reference"
      :modal="true"
      :style="{ width: '400px' }"
    >
      <div class="dialog-content">
        <div class="field">
          <label for="refName">Name</label>
          <InputText id="refName" v-model="newReferenceName" class="w-full" placeholder="myReference" />
        </div>
        <div class="field">
          <label for="refTargetType">Target Type</label>
          <Select
            id="refTargetType"
            v-model="newReferenceTargetType"
            :options="availableClasses"
            optionLabel="getName"
            placeholder="Select target class"
            class="w-full"
          >
            <template #value="slotProps">
              <span v-if="slotProps.value">{{ slotProps.value.getName() }}</span>
              <span v-else>{{ slotProps.placeholder }}</span>
            </template>
            <template #option="slotProps">
              {{ slotProps.option.getName() }}
            </template>
          </Select>
        </div>
        <div class="field-checkbox">
          <Checkbox v-model="newReferenceContainment" inputId="refContainment" :binary="true" />
          <label for="refContainment">Containment</label>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewReferenceDialog = false" />
        <Button label="Create" @click="createNewReference" :disabled="!newReferenceName || !newReferenceTargetType" />
      </template>
    </Dialog>

    <!-- New Enum Literal Dialog -->
    <Dialog
      v-model:visible="showNewLiteralDialog"
      header="New Enum Literal"
      :modal="true"
      :style="{ width: '400px' }"
    >
      <div class="dialog-content">
        <div class="field">
          <label for="litName">Name</label>
          <InputText id="litName" v-model="newLiteralName" class="w-full" placeholder="MY_LITERAL" />
        </div>
        <div class="field">
          <label for="litValue">Value</label>
          <InputText id="litValue" :model-value="String(newLiteralValue)" @update:model-value="v => newLiteralValue = parseInt(v) || 0" class="w-full" type="number" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewLiteralDialog = false; metamodeler.clearPendingLiteralDialog()" />
        <Button label="Create" @click="createNewLiteral" :disabled="!newLiteralName" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.metamodeler-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-ground);
}

.tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-section);
}

.header-title {
  font-weight: 600;
  font-size: 0.875rem;
  text-transform: uppercase;
  color: var(--text-color-secondary);
}

.dirty-indicator {
  color: var(--primary-color);
  font-weight: bold;
}

.header-actions {
  display: flex;
  gap: 2px;
}

.header-actions :deep(.toggle-active) {
  color: var(--primary-color);
  background: var(--primary-50);
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
  padding: 0.5rem;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
}

.tree-node.is-abstract .node-label,
.tree-node.is-interface .node-label {
  font-style: italic;
  opacity: 0.7;
}

.tree-node.is-attribute .node-label {
  color: var(--text-color-secondary);
  font-size: 0.85rem;
}

.tree-node.is-reference .node-label {
  color: var(--primary-color);
  font-size: 0.85rem;
}

.tree-node.is-containment .node-label {
  color: #10b981;
}

.tree-node.is-constraint .node-label {
  color: #8b5cf6;
  font-weight: 600;
}

.tree-node.is-literal .node-label {
  color: #f59e0b;
  font-size: 0.85rem;
}

.tree-node.is-enum .node-label {
  color: #f59e0b;
  font-size: 0.85rem;
}

.badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  text-transform: uppercase;
  font-weight: 600;
}

.badge.interface {
  background: transparent;
  color: #8b5cf6;
}

.badge.abstract {
  background: transparent;
  color: #f59e0b;
}

.badge.containment {
  background: transparent;
  color: #10b981;
}

.badge.enum {
  background: transparent;
  color: #f59e0b;
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
  color: var(--text-color);
}

.field-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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

:deep(.p-tree-node-icon.custom-icon) {
  display: none;
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

:deep(.p-tree-node-label) {
  font-size: 0.875rem;
}
</style>
