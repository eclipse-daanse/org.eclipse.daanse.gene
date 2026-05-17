<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Import XMI Result"
    :style="{ width: '480px' }"
    @hide="onCancel"
  >
    <div class="xmi-import-dialog">
      <div class="xmi-import-info">
        <i class="pi pi-file-import xmi-import-icon" />
        <div class="xmi-import-details">
          <div class="xmi-import-name">{{ artifactName }}</div>
          <div class="xmi-import-size">{{ objectCount }}</div>
        </div>
      </div>

      <div class="xmi-import-mode">
        <div class="xmi-import-mode-label">Import mode:</div>

        <div
          class="xmi-import-option"
          :class="{ 'xmi-import-option--selected': mode === 'REPLACE' }"
          @click="mode = 'REPLACE'"
        >
          <RadioButton v-model="mode" value="REPLACE" inputId="mode-replace" />
          <label for="mode-replace" class="xmi-import-option-content">
            <span class="xmi-import-option-title">Replace</span>
            <span class="xmi-import-option-desc">Replace existing instances with the imported data</span>
          </label>
        </div>

        <div
          class="xmi-import-option"
          :class="{ 'xmi-import-option--selected': mode === 'MERGE' }"
          @click="mode = 'MERGE'"
        >
          <RadioButton v-model="mode" value="MERGE" inputId="mode-merge" />
          <label for="mode-merge" class="xmi-import-option-content">
            <span class="xmi-import-option-title">Merge</span>
            <span class="xmi-import-option-desc">Add imported objects to the existing instance tree</span>
          </label>
        </div>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" severity="secondary" @click="onCancel" />
      <Button label="Import" icon="pi pi-file-import" @click="onImport" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'tsm:vue'
import { Dialog, Button, RadioButton } from 'tsm:primevue'

const props = defineProps<{
  xmiContent: string
  name?: string
}>()

const tsm = inject<any>('tsm')
function getEventBus() {
  return tsm?.getService?.('gene.eventbus') || tsm?.service?.('gene.eventbus')
}

const visible = ref(false)
const mode = ref<'REPLACE' | 'MERGE'>('REPLACE')

const artifactName = computed(() => props.name || 'Action Result')

const objectCount = computed(() => {
  if (!props.xmiContent) return ''
  // Rough count of top-level elements
  const matches = props.xmiContent.match(/<[a-zA-Z]+:/g)
  const count = matches ? matches.length : 0
  return count > 0 ? `~${count} element(s)` : 'XMI data'
})

function open() {
  mode.value = 'REPLACE'
  visible.value = true
}

function onImport() {
  visible.value = false
  getEventBus()?.emit('xmiImport:execute', { mode: mode.value, xmiContent: props.xmiContent })
}

function onCancel() {
  visible.value = false
}

defineExpose({ open, close: onCancel, visible })
</script>

<style scoped>
.xmi-import-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.xmi-import-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 6px;
  background: rgba(96, 165, 250, 0.1);
  border: 1px solid rgba(96, 165, 250, 0.25);
}

.xmi-import-icon {
  font-size: 1.5rem;
  color: #60a5fa;
  flex-shrink: 0;
}

.xmi-import-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.xmi-import-name {
  font-size: 0.875rem;
  font-weight: 600;
}

.xmi-import-size {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.xmi-import-mode {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.xmi-import-mode-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.xmi-import-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--p-content-border-color, rgba(255,255,255,0.08));
  cursor: pointer;
  transition: all 0.15s;
}

.xmi-import-option:hover {
  background: rgba(255, 255, 255, 0.04);
}

.xmi-import-option--selected {
  border-color: var(--p-primary-color, #818cf8);
  background: rgba(129, 140, 248, 0.08);
}

.xmi-import-option-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
  padding-top: 1px;
}

.xmi-import-option-title {
  font-size: 0.8125rem;
  font-weight: 500;
}

.xmi-import-option-desc {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  line-height: 1.4;
}
</style>
