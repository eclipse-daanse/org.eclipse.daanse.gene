<script setup lang="ts">
/**
 * DmnTree - Tree view of DMN Definitions
 *
 * Shows Definitions → Decisions → InputData hierarchy.
 * Context menu for adding/removing elements.
 * InputData nodes show the referenced type (e.g. "customer : Customer").
 */

import { ref, computed, toRaw } from 'tsm:vue'
import { Tree, Button, Menu, Dialog, InputText } from 'tsm:primevue'
import { useSharedDmnEditor } from '../composables/useDmnEditor'
import ModelPickerDialog from './ModelPickerDialog.vue'

const dmn = useSharedDmnEditor()

const selectedKey = ref<Record<string, boolean>>({})

// Context menu
const contextMenu = ref<InstanceType<typeof Menu> | null>(null)
const contextNode = ref<any>(null)

// New Decision dialog
const showNewDecisionDialog = ref(false)
const newDecisionName = ref('')

// Model Picker for InputData
const showModelPicker = ref(false)

const contextMenuItems = computed(() => {
  const items: any[] = []
  const node = contextNode.value

  if (!node) return items

  if (node.type === 'definitions') {
    items.push(
      {
        label: 'Add Decision',
        icon: 'pi pi-check-circle',
        command: () => {
          newDecisionName.value = 'NewDecision'
          showNewDecisionDialog.value = true
        }
      },
      {
        label: 'Add Input Data',
        icon: 'pi pi-sign-in',
        command: () => {
          showModelPicker.value = true
        }
      }
    )
  }

  if (node.type === 'decision') {
    items.push({
      label: 'Remove Decision',
      icon: 'pi pi-trash',
      command: () => {
        if (node.data) {
          dmn.removeDecision(toRaw(node.data))
        }
      }
    })
  }

  return items
})

function handleNodeSelect(node: any) {
  const treeNode = node?.node ?? node
  if (treeNode.type === 'decision') {
    dmn.selectDecision(treeNode.data)
  }
}

function handleNodeRightClick(event: any) {
  const node = event?.node ?? event
  contextNode.value = node
  contextMenu.value?.show(event.originalEvent || event)
}

function handleCreateDecision() {
  if (!newDecisionName.value) return
  const dec = dmn.addDecision(newDecisionName.value)
  if (dec) dmn.selectDecision(dec)
  showNewDecisionDialog.value = false
  newDecisionName.value = ''
}

function handleClassSelected(data: { name: string; eClass: any; nsURI: string }) {
  // Create InputData with the selected class name
  const inputData = dmn.addInputData(data.name.toLowerCase())
  if (inputData) {
    // Store the type reference info on the InputData
    dmn.eSet(inputData, 'name', data.name.toLowerCase())
  }
}
</script>

<template>
  <div class="dmn-tree">
    <div class="tree-toolbar">
      <span class="tree-title">DMN Model</span>
      <div class="tree-toolbar-actions">
        <Button
          icon="pi pi-plus"
          size="small"
          text
          severity="secondary"
          title="Add Decision"
          @click="() => { newDecisionName = 'NewDecision'; showNewDecisionDialog = true }"
        />
        <Button
          icon="pi pi-sign-in"
          size="small"
          text
          severity="secondary"
          title="Add Input Data"
          @click="showModelPicker = true"
        />
      </div>
    </div>

    <Tree
      v-if="dmn.treeNodes.value.length > 0"
      :value="dmn.treeNodes.value"
      v-model:selectionKeys="selectedKey"
      v-model:expandedKeys="dmn.expandedKeys.value"
      selectionMode="single"
      class="dmn-tree-component"
      @node-select="handleNodeSelect"
      @node-contextmenu="handleNodeRightClick"
    />

    <div v-else class="empty-tree">
      <p>No DMN model loaded.</p>
      <p>Click "New" in the toolbar to create one.</p>
    </div>

    <!-- Context Menu -->
    <Menu ref="contextMenu" :model="contextMenuItems" :popup="true" />

    <!-- New Decision Dialog -->
    <Dialog
      v-model:visible="showNewDecisionDialog"
      header="New Decision"
      :modal="true"
      :style="{ width: '350px' }"
    >
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label>Name</label>
        <InputText
          v-model="newDecisionName"
          placeholder="Decision name"
          @keydown.enter="handleCreateDecision"
          autofocus
        />
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewDecisionDialog = false" />
        <Button label="Create" @click="handleCreateDecision" />
      </template>
    </Dialog>

    <!-- Model Picker for InputData -->
    <ModelPickerDialog
      :visible="showModelPicker"
      mode="class"
      @update:visible="showModelPicker = $event"
      @select-class="handleClassSelected"
    />
  </div>
</template>

<style scoped>
.dmn-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tree-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--surface-border, #e2e8f0);
}

.tree-toolbar-actions {
  display: flex;
  gap: 2px;
}

.tree-title {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text-color, #1e293b);
}

.dmn-tree-component {
  flex: 1;
  overflow: auto;
  border: none;
  padding: 0;
}

.dmn-tree-component :deep(.p-tree) {
  border: none;
  padding: 0;
}

.empty-tree {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-color-secondary, #64748b);
  font-size: 0.85rem;
  padding: 20px;
  text-align: center;
}
</style>
