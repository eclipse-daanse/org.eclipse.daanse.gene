<script setup lang="ts">
/**
 * EventMappingEditor Component
 *
 * Visual editor for configuring event-action mappings in Gene.
 * Allows creating, editing and deleting EventActionMapping entries
 * on the EditorConfig.
 */

import { ref, computed, inject, watch, onMounted } from 'tsm:vue'
import { DataTable, Column, Button, Dialog, InputText, Dropdown, Checkbox, InputNumber } from 'tsm:primevue'
import type { RegisteredAction } from '../types'

// -------------------------------------------------------------------
// Injections & service access
// -------------------------------------------------------------------

const tsm = inject<any>('tsm')
const editorConfig = inject<any>('gene.editor.config')

const emit = defineEmits<{
  'dirty': []
}>()

// -------------------------------------------------------------------
// Local types mirroring EMF EventActionMapping structure
// -------------------------------------------------------------------

interface ParameterOverride {
  parameterName: string
  valueExpression: string
}

interface EventActionMapping {
  name: string
  description: string
  enabled: boolean
  eventType: 'LIFECYCLE' | 'DOMAIN' | 'CUSTOM'
  // Lifecycle fields
  lifecycleEventType: string
  // Domain fields
  changeType: string
  featureName: string
  targetTypeUri: string
  targetScope: string
  // Custom fields
  eventId: string
  sourceModuleId: string
  // Common
  conditionOcl: string
  actionRefs: string[]
  debounceMs: number
  executeMode: string
  parameterOverrides: ParameterOverride[]
}

// -------------------------------------------------------------------
// State
// -------------------------------------------------------------------

const mappings = ref<EventActionMapping[]>([])
const selectedMapping = ref<EventActionMapping | null>(null)
const editDialogVisible = ref(false)
const editingMapping = ref<EventActionMapping>(createEmptyMapping())
const isNewMapping = ref(false)

// Action ref being added
const newActionRef = ref('')

// Parameter override being added
const newParamName = ref('')
const newParamExpr = ref('')

// -------------------------------------------------------------------
// Dropdown options
// -------------------------------------------------------------------

const eventTypeOptions = [
  { label: 'Lifecycle', value: 'LIFECYCLE' },
  { label: 'Domain', value: 'DOMAIN' },
  { label: 'Custom', value: 'CUSTOM' }
]

const lifecycleEventOptions = [
  { label: 'Workspace Opened', value: 'WORKSPACE_OPENED' },
  { label: 'Workspace Closed', value: 'WORKSPACE_CLOSED' },
  { label: 'Perspective Changed', value: 'PERSPECTIVE_CHANGED' },
  { label: 'File Saved', value: 'FILE_SAVED' },
  { label: 'File Loaded', value: 'FILE_LOADED' },
  { label: 'Selection Changed', value: 'SELECTION_CHANGED' },
  { label: 'Timer Tick', value: 'TIMER_TICK' }
]

const changeTypeOptions = [
  { label: 'Created', value: 'CREATED' },
  { label: 'Deleted', value: 'DELETED' },
  { label: 'Changed', value: 'CHANGED' },
  { label: 'Any', value: 'ANY' }
]

const targetScopeOptions = [
  { label: 'Type Only', value: 'TYPE_ONLY' },
  { label: 'Type and Subtypes', value: 'TYPE_AND_SUBTYPES' }
]

const executeModeOptions = [
  { label: 'All', value: 'ALL' },
  { label: 'First Match', value: 'FIRST_MATCH' },
  { label: 'Sequential', value: 'SEQUENTIAL' }
]

// -------------------------------------------------------------------
// Available actions from registry
// -------------------------------------------------------------------

const availableActions = computed<{ label: string; value: string }[]>(() => {
  try {
    const registry = tsm?.services?.get?.('gene.action.registry')
    if (!registry) return []
    const all: RegisteredAction[] = registry.getAllActions()
    return all.map((a: RegisteredAction) => ({
      label: `${a.definition.actionId} (${a.source})`,
      value: a.definition.actionId
    }))
  } catch {
    return []
  }
})

// -------------------------------------------------------------------
// Load mappings from EditorConfig
// -------------------------------------------------------------------

function loadMappings() {
  const config = editorConfig?.editorConfig?.value
  if (!config) {
    mappings.value = []
    return
  }

  const emfMappings = config.eventMappings || []
  mappings.value = emfMappings.map((m: any) => ({
    name: m.name || '',
    description: m.description || '',
    enabled: m.enabled !== false,
    eventType: m.eventType || 'LIFECYCLE',
    lifecycleEventType: m.lifecycleEventType || '',
    changeType: m.changeType || '',
    featureName: m.featureName || '',
    targetTypeUri: m.targetTypeUri || '',
    targetScope: m.targetScope || 'TYPE_AND_SUBTYPES',
    eventId: m.eventId || '',
    sourceModuleId: m.sourceModuleId || '',
    conditionOcl: m.conditionOcl || '',
    actionRefs: [...(m.actionRefs || [])],
    debounceMs: m.debounceMs ?? 0,
    executeMode: m.executeMode || 'ALL',
    parameterOverrides: (m.parameterOverrides || []).map((po: any) => ({
      parameterName: po.parameterName || '',
      valueExpression: po.valueExpression || ''
    }))
  }))
}

onMounted(() => loadMappings())

watch(() => editorConfig?.editorConfig?.value, () => loadMappings(), { deep: true })

// -------------------------------------------------------------------
// Persist mappings back to EditorConfig
// -------------------------------------------------------------------

function persistMappings() {
  const config = editorConfig?.editorConfig?.value
  if (!config) return

  config.eventMappings = mappings.value.map((m) => ({
    name: m.name,
    description: m.description,
    enabled: m.enabled,
    eventType: m.eventType,
    lifecycleEventType: m.lifecycleEventType || undefined,
    changeType: m.changeType || undefined,
    featureName: m.featureName || undefined,
    targetTypeUri: m.targetTypeUri || undefined,
    targetScope: m.targetScope || undefined,
    eventId: m.eventId || undefined,
    sourceModuleId: m.sourceModuleId || undefined,
    conditionOcl: m.conditionOcl || undefined,
    actionRefs: [...m.actionRefs],
    debounceMs: m.debounceMs || undefined,
    executeMode: m.executeMode,
    parameterOverrides: m.parameterOverrides.map((po) => ({
      parameterName: po.parameterName,
      valueExpression: po.valueExpression
    }))
  }))

  if (editorConfig?.markDirty) editorConfig.markDirty()
  emit('dirty')
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function createEmptyMapping(): EventActionMapping {
  return {
    name: '',
    description: '',
    enabled: true,
    eventType: 'LIFECYCLE',
    lifecycleEventType: '',
    changeType: '',
    featureName: '',
    targetTypeUri: '',
    targetScope: 'TYPE_AND_SUBTYPES',
    eventId: '',
    sourceModuleId: '',
    conditionOcl: '',
    actionRefs: [],
    debounceMs: 0,
    executeMode: 'ALL',
    parameterOverrides: []
  }
}

function cloneMapping(m: EventActionMapping): EventActionMapping {
  return {
    ...m,
    actionRefs: [...m.actionRefs],
    parameterOverrides: m.parameterOverrides.map((po) => ({ ...po }))
  }
}

function eventSummary(m: EventActionMapping): string {
  switch (m.eventType) {
    case 'LIFECYCLE':
      return m.lifecycleEventType || '(none)'
    case 'DOMAIN':
      return `${m.changeType || '?'} on ${m.featureName || m.targetTypeUri || '?'}`
    case 'CUSTOM':
      return m.eventId || '(none)'
    default:
      return '?'
  }
}

// -------------------------------------------------------------------
// Actions
// -------------------------------------------------------------------

function onAddMapping() {
  editingMapping.value = createEmptyMapping()
  isNewMapping.value = true
  editDialogVisible.value = true
}

function onEditMapping(mapping: EventActionMapping) {
  selectedMapping.value = mapping
  editingMapping.value = cloneMapping(mapping)
  isNewMapping.value = false
  editDialogVisible.value = true
}

function onDeleteSelected() {
  if (!selectedMapping.value) return
  const idx = mappings.value.indexOf(selectedMapping.value)
  if (idx >= 0) {
    mappings.value.splice(idx, 1)
    selectedMapping.value = null
    persistMappings()
  }
}

function onSaveMapping() {
  if (isNewMapping.value) {
    mappings.value.push(cloneMapping(editingMapping.value))
  } else if (selectedMapping.value) {
    const idx = mappings.value.indexOf(selectedMapping.value)
    if (idx >= 0) {
      mappings.value.splice(idx, 1, cloneMapping(editingMapping.value))
    }
  }
  editDialogVisible.value = false
  selectedMapping.value = null
  persistMappings()
}

function onCancelEdit() {
  editDialogVisible.value = false
}

function onToggleEnabled(mapping: EventActionMapping) {
  mapping.enabled = !mapping.enabled
  persistMappings()
}

// -------------------------------------------------------------------
// Action refs management
// -------------------------------------------------------------------

function addActionRef() {
  const val = newActionRef.value?.trim()
  if (val && !editingMapping.value.actionRefs.includes(val)) {
    editingMapping.value.actionRefs.push(val)
  }
  newActionRef.value = ''
}

function removeActionRef(index: number) {
  editingMapping.value.actionRefs.splice(index, 1)
}

// -------------------------------------------------------------------
// Parameter overrides management
// -------------------------------------------------------------------

function addParameterOverride() {
  const name = newParamName.value?.trim()
  const expr = newParamExpr.value?.trim()
  if (name && expr) {
    editingMapping.value.parameterOverrides.push({
      parameterName: name,
      valueExpression: expr
    })
    newParamName.value = ''
    newParamExpr.value = ''
  }
}

function removeParameterOverride(index: number) {
  editingMapping.value.parameterOverrides.splice(index, 1)
}

// -------------------------------------------------------------------
// Row selection handler
// -------------------------------------------------------------------

function onRowSelect(event: any) {
  selectedMapping.value = event.data
}

function onRowDblClick(event: any) {
  onEditMapping(event.data)
}
</script>

<template>
  <div class="mapping-list">
    <!-- Existing mappings -->
    <div v-for="(mapping, idx) in mappings" :key="mapping.name || idx" class="mapping-item">
      <div class="mapping-info">
        <div class="mapping-header">
          <Checkbox :modelValue="mapping.enabled" :binary="true" @update:modelValue="() => onToggleEnabled(mapping)" />
          <span class="mapping-label">{{ mapping.name || '(unnamed)' }}</span>
          <span class="mapping-badge" :class="'badge-' + mapping.eventType.toLowerCase()">{{ mapping.eventType }}</span>
        </div>
        <div class="mapping-detail">
          <span class="mapping-event">{{ eventSummary(mapping) }}</span>
          <span class="mapping-actions">{{ mapping.actionRefs.join(', ') || '(none)' }}</span>
        </div>
      </div>
      <div class="mapping-buttons">
        <button class="icon-btn" @click="onEditMapping(mapping)" title="Edit"><i class="pi pi-pencil"></i></button>
        <button class="icon-btn danger" @click="selectedMapping = mapping; onDeleteSelected()" title="Delete"><i class="pi pi-trash"></i></button>
      </div>
    </div>

    <div v-if="mappings.length === 0" class="empty-hint">No event mappings configured.</div>

    <button class="add-btn" @click="onAddMapping">
      <i class="pi pi-plus"></i>
      <span>Add Mapping</span>
    </button>

    <!-- Edit / Create dialog -->
    <Dialog
      v-model:visible="editDialogVisible"
      :header="isNewMapping ? 'New Event-Action Mapping' : 'Edit Mapping'"
      modal
      :style="{ width: '48rem' }"
      :closable="true"
      class="mapping-dialog"
    >
      <div class="dialog-form">
        <!-- Basic fields -->
        <div class="form-section">
          <h4>General</h4>
          <div class="form-row">
            <label>Name</label>
            <InputText v-model="editingMapping.name" class="form-input" placeholder="Mapping name" />
          </div>
          <div class="form-row">
            <label>Description</label>
            <InputText v-model="editingMapping.description" class="form-input" placeholder="Optional description" />
          </div>
          <div class="form-row">
            <label>Enabled</label>
            <Checkbox v-model="editingMapping.enabled" :binary="true" />
          </div>
        </div>

        <!-- Event configuration -->
        <div class="form-section">
          <h4>Event</h4>
          <div class="form-row">
            <label>Event Type</label>
            <Dropdown
              v-model="editingMapping.eventType"
              :options="eventTypeOptions"
              optionLabel="label"
              optionValue="value"
              class="form-input"
            />
          </div>

          <!-- Lifecycle sub-fields -->
          <template v-if="editingMapping.eventType === 'LIFECYCLE'">
            <div class="form-row">
              <label>Lifecycle Event</label>
              <Dropdown
                v-model="editingMapping.lifecycleEventType"
                :options="lifecycleEventOptions"
                optionLabel="label"
                optionValue="value"
                class="form-input"
                placeholder="Select event..."
              />
            </div>
          </template>

          <!-- Domain sub-fields -->
          <template v-if="editingMapping.eventType === 'DOMAIN'">
            <div class="form-row">
              <label>Change Type</label>
              <Dropdown
                v-model="editingMapping.changeType"
                :options="changeTypeOptions"
                optionLabel="label"
                optionValue="value"
                class="form-input"
              />
            </div>
            <div class="form-row">
              <label>Feature Name</label>
              <InputText v-model="editingMapping.featureName" class="form-input" placeholder="e.g. name" />
            </div>
            <div class="form-row">
              <label>Target Type URI</label>
              <InputText v-model="editingMapping.targetTypeUri" class="form-input" placeholder="e.g. http://example.org/model#//MyClass" />
            </div>
            <div class="form-row">
              <label>Target Scope</label>
              <Dropdown
                v-model="editingMapping.targetScope"
                :options="targetScopeOptions"
                optionLabel="label"
                optionValue="value"
                class="form-input"
              />
            </div>
          </template>

          <!-- Custom sub-fields -->
          <template v-if="editingMapping.eventType === 'CUSTOM'">
            <div class="form-row">
              <label>Event ID</label>
              <InputText v-model="editingMapping.eventId" class="form-input" placeholder="Custom event identifier" />
            </div>
            <div class="form-row">
              <label>Source Module ID</label>
              <InputText v-model="editingMapping.sourceModuleId" class="form-input" placeholder="Optional source module" />
            </div>
          </template>

          <div class="form-row">
            <label>Condition (OCL)</label>
            <InputText v-model="editingMapping.conditionOcl" class="form-input" placeholder="Optional OCL guard expression" />
          </div>
        </div>

        <!-- Action Refs -->
        <div class="form-section">
          <h4>Actions</h4>
          <div class="action-refs-list">
            <div v-for="(actionId, idx) in editingMapping.actionRefs" :key="idx" class="action-ref-item">
              <span class="action-ref-label">{{ actionId }}</span>
              <Button icon="pi pi-times" severity="danger" text size="small" @click="removeActionRef(idx)" />
            </div>
            <div v-if="editingMapping.actionRefs.length === 0" class="empty-hint">No actions assigned</div>
          </div>
          <div class="form-row add-row">
            <Dropdown
              v-model="newActionRef"
              :options="availableActions"
              optionLabel="label"
              optionValue="value"
              class="form-input"
              placeholder="Select action..."
              :filter="true"
              editable
            />
            <Button icon="pi pi-plus" severity="secondary" size="small" @click="addActionRef" :disabled="!newActionRef" />
          </div>
        </div>

        <!-- Execution settings -->
        <div class="form-section">
          <h4>Execution</h4>
          <div class="form-row">
            <label>Debounce (ms)</label>
            <InputNumber v-model="editingMapping.debounceMs" :min="0" :step="100" class="form-input" />
          </div>
          <div class="form-row">
            <label>Execute Mode</label>
            <Dropdown
              v-model="editingMapping.executeMode"
              :options="executeModeOptions"
              optionLabel="label"
              optionValue="value"
              class="form-input"
            />
          </div>
        </div>

        <!-- Parameter Overrides -->
        <div class="form-section">
          <h4>Parameter Overrides</h4>
          <DataTable :value="editingMapping.parameterOverrides" size="small" class="param-table">
            <Column field="parameterName" header="Parameter" />
            <Column field="valueExpression" header="Value Expression" />
            <Column header="" style="width: 3rem">
              <template #body="{ index }">
                <Button icon="pi pi-times" severity="danger" text size="small" @click="removeParameterOverride(index)" />
              </template>
            </Column>
          </DataTable>
          <div class="form-row add-row">
            <InputText v-model="newParamName" placeholder="Parameter name" class="form-input-half" />
            <InputText v-model="newParamExpr" placeholder="Value expression" class="form-input-half" />
            <Button icon="pi pi-plus" severity="secondary" size="small" @click="addParameterOverride" :disabled="!newParamName || !newParamExpr" />
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Cancel" severity="secondary" @click="onCancelEdit" />
        <Button label="Save" severity="primary" @click="onSaveMapping" :disabled="!editingMapping.name" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.mapping-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mapping-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--surface-ground);
  border-radius: 8px;
  border: 1px solid var(--surface-border);
}

.mapping-info { flex: 1; min-width: 0; }

.mapping-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mapping-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-color);
}

.mapping-badge {
  font-size: 0.625rem;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.badge-lifecycle { background: color-mix(in srgb, var(--primary-color) 15%, transparent); color: var(--primary-color); }
.badge-domain { background: color-mix(in srgb, var(--green-500) 15%, transparent); color: var(--green-500); }
.badge-custom { background: color-mix(in srgb, var(--orange-500) 15%, transparent); color: var(--orange-500); }

.mapping-detail {
  display: flex;
  gap: 12px;
  margin-top: 2px;
  padding-left: 28px;
}

.mapping-event, .mapping-actions {
  font-size: 0.6875rem;
  font-family: monospace;
  color: var(--text-color-secondary);
}

.mapping-buttons { display: flex; gap: 2px; flex-shrink: 0; }

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

/* Dialog form styles */
.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 0.5rem;
}

.form-section h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.85rem;
  color: var(--text-color-secondary);
  border-bottom: 1px solid var(--surface-border);
  padding-bottom: 0.25rem;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.form-row label {
  min-width: 9rem;
  font-size: 0.85rem;
  color: var(--text-color-secondary);
}

.form-input {
  flex: 1;
}

.form-input-half {
  flex: 1;
}

.add-row {
  margin-top: 0.25rem;
}

.action-refs-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.action-ref-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0.5rem;
  background: var(--surface-hover);
  border-radius: 4px;
}

.action-ref-label {
  font-family: monospace;
  font-size: 0.85rem;
}

.empty-hint {
  font-size: 0.8rem;
  color: var(--text-color-secondary);
  font-style: italic;
  padding: 0.25rem 0;
}

.param-table {
  margin-bottom: 0.5rem;
}

.mapping-dialog :deep(.p-dialog-content) {
  padding: 1rem;
}
</style>
