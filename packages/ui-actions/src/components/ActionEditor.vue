<script setup lang="ts">
/**
 * ActionEditor Component
 *
 * Visual editor for configuring actions in the workspace.
 * Actions map handlers to object types and appear in context menus.
 */

import { ref, computed, inject, watch, onMounted } from 'tsm:vue'
import { DataTable, Column, Button, Dialog, InputText, Dropdown, Checkbox, InputNumber } from 'tsm:primevue'

const tsm = inject<any>('tsm')
const editorConfig = inject<any>('gene.editor.config')

const emit = defineEmits<{
  'dirty': []
}>()

// Local action type
interface ActionDef {
  actionId: string
  label: string
  description: string
  actionType: string
  actionScope: string
  targetTypeUri: string
  targetScope: string
  handlerId: string
  perspectiveIds: string[]
  enabled: boolean
  order: number
  type: 'internal' | 'remote'
  // Remote fields
  endpointUrl: string
  httpMethod: string
}

// State
const actions = ref<ActionDef[]>([])
const selectedAction = ref<ActionDef | null>(null)
const editDialogVisible = ref(false)
const editingAction = ref<ActionDef>(createEmpty())
const isNew = ref(false)

// Dropdown options
const actionTypeOptions = [
  { label: 'Query', value: 'QUERY' },
  { label: 'Validation', value: 'VALIDATION' },
  { label: 'Transformation', value: 'TRANSFORMATION' },
  { label: 'Documentation', value: 'DOCUMENTATION' },
  { label: 'Custom', value: 'CUSTOM' }
]

const actionScopeOptions = [
  { label: 'Object (Context Menu)', value: 'OBJECT' },
  { label: 'Editor (Toolbar)', value: 'EDITOR' },
  { label: 'Both', value: 'BOTH' }
]

const targetScopeOptions = [
  { label: 'Exact Type Only', value: 'TYPE_ONLY' },
  { label: 'Type and Subtypes', value: 'TYPE_AND_SUBTYPES' }
]

const typeOptions = [
  { label: 'Internal (TypeScript Handler)', value: 'internal' },
  { label: 'Remote (HTTP Endpoint)', value: 'remote' }
]

const httpMethodOptions = [
  { label: 'POST', value: 'POST' },
  { label: 'GET', value: 'GET' },
  { label: 'PUT', value: 'PUT' }
]

// Available handlers from InternalExecutor
const availableHandlers = computed<{ label: string; value: string }[]>(() => {
  try {
    const executor = tsm?.getService('gene.action.executor.internal')
    if (!executor?.getRegisteredHandlerIds) return []
    return executor.getRegisteredHandlerIds().map((id: string) => ({
      label: id,
      value: id
    }))
  } catch {
    return []
  }
})

// Load from EditorConfig
function loadActions() {
  const config = editorConfig?.editorConfig?.value
  if (!config) {
    actions.value = []
    return
  }

  const emfActions = config.actions || []
  actions.value = emfActions.map((a: any) => ({
    actionId: a.actionId || '',
    label: a.label || '',
    description: a.description || '',
    actionType: a.actionType || 'CUSTOM',
    actionScope: a.actionScope || 'OBJECT',
    targetTypeUri: a.targetTypeUri || '',
    targetScope: a.targetScope || 'TYPE_AND_SUBTYPES',
    handlerId: a.handlerId || '',
    perspectiveIds: [...(a.perspectiveIds || [])],
    enabled: a.enabled !== false,
    order: a.order ?? 0,
    type: a.endpointUrl ? 'remote' : 'internal',
    endpointUrl: a.endpointUrl || '',
    httpMethod: a.httpMethod || 'POST'
  }))
}

onMounted(() => loadActions())
watch(() => editorConfig?.editorConfig?.value, () => loadActions(), { deep: true })

/**
 * Get the FennecuiFactory from the EditorConfig's EPackage
 */
function getFactory(): any {
  const config = editorConfig?.editorConfig?.value
  if (!config) return null
  const eClass = config.eClass?.()
  const ePackage = eClass?.getEPackage?.()
  return ePackage?.getEFactoryInstance?.() || null
}

// Persist to EditorConfig
function persistActions() {
  const config = editorConfig?.editorConfig?.value
  if (!config) return

  const factory = getFactory()
  if (!factory) {
    console.warn('[ActionEditor] Cannot persist: no factory available')
    return
  }

  // Create EMF instances
  const emfActions = actions.value.map(a => {
    const action = a.type === 'remote'
      ? factory.createRemoteAction()
      : factory.createInternalAction()

    // Set common fields via eSet
    const eClass = action.eClass()
    const setField = (name: string, value: any) => {
      if (value === undefined || value === null || value === '') return
      const feature = eClass.getEStructuralFeature(name)
      if (feature) action.eSet(feature, value)
    }

    setField('actionId', a.actionId)
    setField('label', a.label)
    setField('description', a.description)
    setField('actionType', a.actionType)
    setField('actionScope', a.actionScope)
    setField('targetTypeUri', a.targetTypeUri)
    setField('targetScope', a.targetScope)
    setField('enabled', a.enabled)
    setField('order', a.order)

    if (a.type === 'internal') {
      setField('handlerId', a.handlerId)
    } else {
      setField('endpointUrl', a.endpointUrl)
      setField('httpMethod', a.httpMethod)
    }

    return action
  })

  config.actions = emfActions

  if (editorConfig?.markDirty) editorConfig.markDirty()
  emit('dirty')

  // Re-register with ActionRegistry
  try {
    const registry = tsm?.getService('gene.action.registry')
    if (registry) {
      registry.unregisterBySource('workspace')
      for (const action of config.actions) {
        if (action.actionId) {
          registry.register({ definition: action, source: 'workspace' })
        }
      }
    }
  } catch { /* optional */ }
}

// Helpers
function createEmpty(): ActionDef {
  return {
    actionId: '',
    label: '',
    description: '',
    actionType: 'CUSTOM',
    actionScope: 'OBJECT',
    targetTypeUri: '',
    targetScope: 'TYPE_AND_SUBTYPES',
    handlerId: '',
    perspectiveIds: [],
    enabled: true,
    order: 0,
    type: 'internal',
    endpointUrl: '',
    httpMethod: 'POST'
  }
}

function clone(a: ActionDef): ActionDef {
  return { ...a, perspectiveIds: [...a.perspectiveIds] }
}

// CRUD
function onAdd() {
  editingAction.value = createEmpty()
  isNew.value = true
  editDialogVisible.value = true
}

function onEdit(action: ActionDef) {
  selectedAction.value = action
  editingAction.value = clone(action)
  isNew.value = false
  editDialogVisible.value = true
}

function onDelete() {
  if (!selectedAction.value) return
  const idx = actions.value.indexOf(selectedAction.value)
  if (idx >= 0) {
    actions.value.splice(idx, 1)
    selectedAction.value = null
    persistActions()
  }
}

function onSave() {
  if (isNew.value) {
    actions.value.push(clone(editingAction.value))
  } else if (selectedAction.value) {
    const idx = actions.value.indexOf(selectedAction.value)
    if (idx >= 0) {
      actions.value.splice(idx, 1, clone(editingAction.value))
    }
  }
  editDialogVisible.value = false
  selectedAction.value = null
  persistActions()
}

function onCancel() {
  editDialogVisible.value = false
}

function onToggle(action: ActionDef) {
  action.enabled = !action.enabled
  persistActions()
}

function onRowSelect(event: any) {
  selectedAction.value = event.data
}

function onRowDblClick(event: any) {
  onEdit(event.data)
}
</script>

<template>
  <div class="action-list">
    <!-- Existing actions -->
    <div v-for="(action, idx) in actions" :key="action.actionId || idx" class="action-item">
      <div class="action-info">
        <div class="action-header">
          <Checkbox :modelValue="action.enabled" :binary="true" @update:modelValue="() => onToggle(action)" />
          <span class="action-label">{{ action.label || action.actionId }}</span>
          <span class="action-badge" :class="'badge-' + action.type">{{ action.type }}</span>
          <span class="action-scope">{{ action.actionScope }}</span>
        </div>
        <div class="action-detail">
          <span class="action-id">{{ action.actionId }}</span>
          <span class="action-handler">{{ action.type === 'internal' ? action.handlerId : action.endpointUrl }}</span>
        </div>
      </div>
      <div class="action-buttons">
        <button class="icon-btn" @click="onEdit(action)" title="Edit"><i class="pi pi-pencil"></i></button>
        <button class="icon-btn danger" @click="selectedAction = action; onDelete()" title="Delete"><i class="pi pi-trash"></i></button>
      </div>
    </div>

    <div v-if="actions.length === 0" class="empty-hint">No actions configured.</div>

    <!-- Add button -->
    <button class="add-btn" @click="onAdd">
      <i class="pi pi-plus"></i>
      <span>Add Action</span>
    </button>
  </div>

  <!-- Edit dialog -->
  <Dialog
    v-model:visible="editDialogVisible"
    :header="isNew ? 'New Action' : 'Edit Action'"
    modal
    :style="{ width: '36rem' }"
    :closable="true"
    class="action-dialog"
  >
    <div class="dialog-form">
      <div class="field-grid">
        <div class="field">
          <label>Action ID</label>
          <InputText v-model="editingAction.actionId" placeholder="e.g. my.export-csv" />
        </div>
        <div class="field">
          <label>Label</label>
          <InputText v-model="editingAction.label" placeholder="Display name in menu" />
        </div>
        <div class="field">
          <label>Description</label>
          <InputText v-model="editingAction.description" placeholder="Optional" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Scope</label>
            <Dropdown v-model="editingAction.actionScope" :options="actionScopeOptions" optionLabel="label" optionValue="value" />
          </div>
          <div class="field">
            <label>Type</label>
            <Dropdown v-model="editingAction.actionType" :options="actionTypeOptions" optionLabel="label" optionValue="value" />
          </div>
        </div>
        <div class="field">
          <label>Target Type URI</label>
          <InputText v-model="editingAction.targetTypeUri" placeholder="leer = alle Typen" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Target Scope</label>
            <Dropdown v-model="editingAction.targetScope" :options="targetScopeOptions" optionLabel="label" optionValue="value" />
          </div>
          <div class="field">
            <label>Order</label>
            <InputNumber v-model="editingAction.order" :min="0" />
          </div>
        </div>

        <div class="field-separator"></div>

        <div class="field">
          <label>Handler Type</label>
          <Dropdown v-model="editingAction.type" :options="typeOptions" optionLabel="label" optionValue="value" />
        </div>
        <div v-if="editingAction.type === 'internal'" class="field">
          <label>Handler</label>
          <Dropdown v-model="editingAction.handlerId" :options="availableHandlers" optionLabel="label" optionValue="value" placeholder="Select handler..." editable />
        </div>
        <template v-if="editingAction.type === 'remote'">
          <div class="field">
            <label>Endpoint URL</label>
            <InputText v-model="editingAction.endpointUrl" placeholder="https://..." />
          </div>
          <div class="field">
            <label>HTTP Method</label>
            <Dropdown v-model="editingAction.httpMethod" :options="httpMethodOptions" optionLabel="label" optionValue="value" />
          </div>
        </template>
      </div>
    </div>

    <template #footer>
      <button class="dialog-btn" @click="onCancel">Cancel</button>
      <button class="dialog-btn primary" @click="onSave" :disabled="!editingAction.actionId || !editingAction.label">Save</button>
    </template>
  </Dialog>
</template>

<style scoped>
.action-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.action-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--surface-ground);
  border-radius: 8px;
  border: 1px solid var(--surface-border);
}

.action-info {
  flex: 1;
  min-width: 0;
}

.action-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-color);
}

.action-badge {
  font-size: 0.625rem;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.badge-internal { background: color-mix(in srgb, var(--primary-color) 15%, transparent); color: var(--primary-color); }
.badge-remote { background: color-mix(in srgb, var(--green-500) 15%, transparent); color: var(--green-500); }

.action-scope {
  font-size: 0.6875rem;
  color: var(--text-color-secondary);
}

.action-detail {
  display: flex;
  gap: 12px;
  margin-top: 2px;
  padding-left: 28px;
}

.action-id, .action-handler {
  font-size: 0.6875rem;
  font-family: monospace;
  color: var(--text-color-secondary);
}

.action-buttons {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 6px;
  font-size: 0.75rem;
}

.icon-btn:hover { background: var(--surface-hover); color: var(--text-color); }
.icon-btn.danger:hover { color: var(--red-500); }

.empty-hint {
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
  font-style: italic;
  padding: 8px 0;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px dashed var(--surface-border);
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 8px;
  font-size: 0.8125rem;
  transition: all 0.15s ease;
}

.add-btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 5%, transparent);
}

/* Dialog */
.dialog-form {
  padding: 4px 0;
}

.field-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field label {
  font-size: 0.7rem;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.field :deep(input), .field :deep(.p-dropdown), .field :deep(.p-inputnumber) {
  width: 100%;
}

.field-row {
  display: flex;
  gap: 10px;
}

.field-row .field { flex: 1; }

.field-separator {
  height: 1px;
  background: var(--surface-border);
  margin: 4px 0;
}

.dialog-btn {
  padding: 6px 16px;
  border: 1px solid var(--surface-border);
  background: var(--surface-card);
  color: var(--text-color);
  cursor: pointer;
  border-radius: 6px;
  font-size: 0.8125rem;
}

.dialog-btn:hover { background: var(--surface-hover); }

.dialog-btn.primary {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.dialog-btn.primary:hover { opacity: 0.9; }
.dialog-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
