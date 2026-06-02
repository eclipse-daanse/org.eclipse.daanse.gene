<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="dialogTitle"
    :style="{ width: '500px' }"
    @hide="onDismiss"
  >
    <div class="action-approval">
      <div v-if="resultMessage" class="action-approval-message" :class="statusClass">
        <i :class="statusIcon" class="action-approval-status-icon" />
        <span class="action-approval-message-text">{{ resultMessage }}</span>
      </div>

      <div v-if="proposedActions.length > 0" class="action-approval-actions">
        <div class="action-approval-label">Proposed follow-up actions:</div>
        <label
          v-for="(action, idx) in proposedActions"
          :key="action.commandId"
          :for="'approval-cb-' + idx"
          class="action-approval-item"
          :class="{ 'action-approval-item--selected': isSelected(action.commandId) }"
        >
          <input
            type="checkbox"
            :id="'approval-cb-' + idx"
            :checked="isSelected(action.commandId)"
            class="action-approval-checkbox"
            @change="toggleAction(action.commandId)"
          />
          <div class="action-approval-item-label">
            <span class="action-approval-item-name">{{ action.label }}</span>
            <span v-if="action.description" class="action-approval-item-desc">{{ action.description }}</span>
          </div>
        </label>
      </div>
    </div>

    <template #footer>
      <Button label="Dismiss" severity="secondary" @click="onDismiss" />
      <Button
        label="Execute Selected"
        :disabled="selectedCount === 0"
        @click="onExecute"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject } from 'tsm:vue'
import { Dialog, Button } from 'tsm:primevue'

export interface ProposedAction {
  commandId: string
  label: string
  description?: string
  args?: string
  autoExecute?: boolean
}

const props = defineProps<{
  resultStatus?: string
  resultMessage?: string
  actions: ProposedAction[]
}>()

// Get EventBus via TSM injection
const tsm = inject<any>('tsm')
function getEventBus() {
  return tsm?.getService?.('gene.eventbus') || tsm?.service?.('gene.eventbus')
}

const visible = ref(false)
const selected = ref<string[]>([])
const proposedActions = computed(() => props.actions)
const selectedCount = computed(() => selected.value.length)
let dismissTimeout: ReturnType<typeof setTimeout> | null = null

function isSelected(id: string): boolean {
  return selected.value.includes(id)
}

function toggleAction(id: string) {
  if (selected.value.includes(id)) {
    selected.value = selected.value.filter(s => s !== id)
  } else {
    selected.value = [...selected.value, id]
  }
}

const dialogTitle = computed(() => {
  switch (props.resultStatus) {
    case 'SUCCESS': return 'Action Completed'
    case 'WARNING': return 'Action Completed with Warnings'
    case 'ERROR': return 'Action Failed'
    default: return 'Action Result'
  }
})

const statusIcon = computed(() => {
  switch (props.resultStatus) {
    case 'SUCCESS': return 'pi pi-check-circle'
    case 'WARNING': return 'pi pi-exclamation-triangle'
    case 'ERROR': return 'pi pi-times-circle'
    default: return 'pi pi-info-circle'
  }
})

const statusClass = computed(() => {
  switch (props.resultStatus) {
    case 'SUCCESS': return 'action-approval-message--success'
    case 'WARNING': return 'action-approval-message--warning'
    case 'ERROR': return 'action-approval-message--error'
    default: return 'action-approval-message--info'
  }
})

function open() {
  selected.value = props.actions.filter(a => a.autoExecute).map(a => a.commandId)
  visible.value = true

  // Auto-dismiss after 30s if no interaction
  dismissTimeout = setTimeout(() => {
    if (visible.value) onDismiss()
  }, 30000)
}

function onExecute() {
  if (dismissTimeout) clearTimeout(dismissTimeout)
  const actions = props.actions.filter(a => selected.value.includes(a.commandId))
  visible.value = false
  getEventBus()?.emit('approval:execute', actions)
}

function onDismiss() {
  if (dismissTimeout) clearTimeout(dismissTimeout)
  visible.value = false
}

defineExpose({ open, close: onDismiss, visible })
</script>

<style scoped>
.action-approval {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.action-approval-message {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 0.875rem;
  border: 1px solid;
}

.action-approval-status-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.action-approval-message-text {
  flex: 1;
}

.action-approval-message--success {
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.3);
  color: #4ade80;
}
.action-approval-message--success .action-approval-status-icon {
  color: #4ade80;
}

.action-approval-message--warning {
  background: rgba(234, 179, 8, 0.1);
  border-color: rgba(234, 179, 8, 0.3);
  color: #facc15;
}
.action-approval-message--warning .action-approval-status-icon {
  color: #facc15;
}

.action-approval-message--error {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #f87171;
}
.action-approval-message--error .action-approval-status-icon {
  color: #f87171;
}

.action-approval-message--info {
  background: rgba(96, 165, 250, 0.1);
  border-color: rgba(96, 165, 250, 0.3);
  color: #93c5fd;
}
.action-approval-message--info .action-approval-status-icon {
  color: #93c5fd;
}

.action-approval-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.action-approval-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.action-approval-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--p-content-border-color, rgba(255,255,255,0.08));
  transition: background 0.15s;
}

.action-approval-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.action-approval-item--selected {
  border-color: var(--p-primary-color, #818cf8);
  background: rgba(129, 140, 248, 0.08);
}

.action-approval-checkbox {
  margin-top: 2px;
  cursor: pointer;
  accent-color: var(--p-primary-color, #818cf8);
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.action-approval-item-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
  padding-top: 1px;
}

.action-approval-item-name {
  font-size: 0.8125rem;
  font-weight: 500;
}

.action-approval-item-desc {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  line-height: 1.4;
}
</style>
