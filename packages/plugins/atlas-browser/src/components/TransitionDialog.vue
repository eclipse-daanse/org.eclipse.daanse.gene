<script setup lang="ts">
/**
 * TransitionDialog Component
 *
 * Dialog to confirm and execute a stage transition on an Atlas object.
 */

import { ref, computed, watch } from 'tsm:vue'
import { Dialog, Button, Dropdown, Textarea, Tag } from 'tsm:primevue'
import { useSharedAtlasBrowser } from '../composables/useAtlasBrowser'
import type { ObjectMetadata, StageTransition } from 'storage-model-atlas'

const props = defineProps<{
  visible: boolean
  /** The object to transition */
  metadata: ObjectMetadata | null
  /** Connection ID */
  connectionId: string
  /** Registry name */
  registryName: string
  /** Allowed transitions from the current stage */
  allowedTargets: string[]
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'transitioned': [fromStage: string, toStage: string]
}>()

const browser = useSharedAtlasBrowser()

const selectedTarget = ref<string | null>(null)
const comment = ref('')
const executing = ref(false)
const error = ref<string | null>(null)
const success = ref(false)

const targetOptions = computed(() =>
  props.allowedTargets.map(s => ({ label: s, value: s }))
)

// Auto-select if only one target
watch(() => props.allowedTargets, (targets) => {
  if (targets.length === 1) {
    selectedTarget.value = targets[0]
  } else {
    selectedTarget.value = null
  }
}, { immediate: true })

// Reset on open
watch(() => props.visible, (v) => {
  if (v) {
    error.value = null
    success.value = false
    executing.value = false
    comment.value = ''
    if (props.allowedTargets.length === 1) {
      selectedTarget.value = props.allowedTargets[0]
    } else {
      selectedTarget.value = null
    }
  }
})

const canExecute = computed(() =>
  !!selectedTarget.value &&
  !!props.metadata &&
  !executing.value &&
  !success.value
)

async function handleTransition() {
  if (!canExecute.value || !props.metadata || !selectedTarget.value) return

  executing.value = true
  error.value = null

  const result = await browser.performTransition(
    props.connectionId,
    props.metadata.scope,
    props.registryName,
    props.metadata.stage,
    props.metadata.objectId,
    selectedTarget.value
  )

  executing.value = false

  if (result.success) {
    success.value = true
    const fromStage = props.metadata.stage
    const toStage = selectedTarget.value
    // Auto-close after short delay
    setTimeout(() => {
      emit('update:visible', false)
      emit('transitioned', fromStage, toStage)
    }, 800)
  } else {
    error.value = result.error || 'Transition failed'
  }
}

function handleClose() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="(v: boolean) => emit('update:visible', v)"
    header="Stage Transition"
    :modal="true"
    :style="{ width: '450px' }"
  >
    <div class="transition-form" v-if="metadata">
      <!-- Object Info -->
      <div class="object-info">
        <div class="info-row">
          <span class="info-label">Object:</span>
          <span class="info-value">{{ metadata.objectName || metadata.objectId }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Current Stage:</span>
          <Tag :value="metadata.stage" severity="info" />
        </div>
        <div class="info-row">
          <span class="info-label">Registry:</span>
          <span class="info-value">{{ registryName }}</span>
        </div>
      </div>

      <!-- Arrow -->
      <div class="transition-arrow">
        <Tag :value="metadata.stage" severity="info" />
        <i class="pi pi-arrow-right"></i>
        <Tag
          :value="selectedTarget || '...'"
          :severity="selectedTarget ? 'success' : 'secondary'"
        />
      </div>

      <!-- Target Stage -->
      <div class="form-field">
        <label for="target-stage">Target Stage</label>
        <Dropdown
          id="target-stage"
          v-model="selectedTarget"
          :options="targetOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Select target stage..."
          class="w-full"
        />
      </div>

      <!-- Comment -->
      <div class="form-field">
        <label for="transition-comment">Comment (optional)</label>
        <Textarea
          id="transition-comment"
          v-model="comment"
          rows="2"
          placeholder="Reason for transition..."
          class="w-full"
          autoResize
        />
      </div>

      <!-- Error -->
      <div v-if="error" class="transition-error">
        <i class="pi pi-exclamation-triangle"></i>
        {{ error }}
      </div>

      <!-- Success -->
      <div v-if="success" class="transition-success">
        <i class="pi pi-check-circle"></i>
        Transition successful!
      </div>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        severity="secondary"
        @click="handleClose"
      />
      <Button
        label="Execute Transition"
        icon="pi pi-arrow-right"
        :loading="executing"
        :disabled="!canExecute"
        @click="handleTransition"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.transition-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.object-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  background: var(--p-surface-100);
  border-radius: 6px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-label {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  min-width: 100px;
}

.info-value {
  font-size: 0.85rem;
  font-weight: 500;
}

.transition-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 10px;
}

.transition-arrow .pi {
  font-size: 1.2rem;
  color: var(--p-primary-color);
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-field label {
  font-size: 0.85rem;
  font-weight: 500;
}

.w-full {
  width: 100%;
}

.transition-error {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--p-red-500);
  font-size: 0.85rem;
  padding: 8px;
  background: var(--p-red-50);
  border-radius: 4px;
}

.transition-success {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--p-green-700);
  font-size: 0.85rem;
  padding: 8px;
  background: var(--p-green-50);
  border-radius: 4px;
}
</style>
