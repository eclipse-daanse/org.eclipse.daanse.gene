<script setup lang="ts">
/**
 * AtlasUploadDialog Component
 *
 * Dialog for uploading .ecore schemas to a Model Atlas server.
 * Allows selecting a connection and stage, then uploads the content.
 */

import { ref, computed, watch, inject } from 'tsm:vue'
import { Dialog, Button, Dropdown, InputText, Checkbox } from 'tsm:primevue'

const props = defineProps<{
  visible: boolean
  content: string
  filename: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'uploaded': [connectionId: string, stageName: string]
}>()

// Form state
const selectedConnectionId = ref<string | null>(null)
const selectedStage = ref<string | null>(null)
const schemaName = ref('')
const overwrite = ref(false)
const uploading = ref(false)
const uploadError = ref<string | null>(null)
const uploadSuccess = ref(false)

// Get upload service via Vue inject or TSM fallback
const tsm = inject<any>('tsm')
const _injectedUploadService = inject<any>('gene.atlas.upload', null)
function getUploadService(): any {
  return _injectedUploadService || tsm?.getService('gene.atlas.upload')
}

// Available connections
const connections = computed(() => {
  const service = getUploadService()
  if (!service) return []
  return service.getConnections().filter((c: any) => c.status === 'connected')
})

// Available stages for selected connection
const stages = computed(() => {
  if (!selectedConnectionId.value) return []
  const service = getUploadService()
  if (!service) return []
  const allStages = service.getSchemaStages(selectedConnectionId.value)
  // Only show writable (non-final) stages
  return allStages.filter((s: any) => !s.final)
})

// Connection options for dropdown
const connectionOptions = computed(() =>
  connections.value.map((c: any) => ({ label: c.label, value: c.id }))
)

// Stage options for dropdown
const stageOptions = computed(() =>
  stages.value.map((s: any) => ({ label: s.name, value: s.name }))
)

// Auto-select when only one option
watch(connections, (conns) => {
  if (conns.length === 1 && !selectedConnectionId.value) {
    selectedConnectionId.value = conns[0].id
  }
}, { immediate: true })

watch(stages, (stgs) => {
  if (stgs.length === 1 && !selectedStage.value) {
    selectedStage.value = stgs[0].name
  }
}, { immediate: true })

// Extract name from filename
watch(() => props.filename, (fn) => {
  if (fn) {
    schemaName.value = fn.replace(/\.ecore$/, '')
  }
}, { immediate: true })

// Reset state when dialog opens
watch(() => props.visible, (visible) => {
  if (visible) {
    uploadError.value = null
    uploadSuccess.value = false
    uploading.value = false
    // Re-trigger auto-select
    const conns = connections.value
    if (conns.length === 1) {
      selectedConnectionId.value = conns[0].id
    }
  }
})

// Can upload?
const canUpload = computed(() =>
  !!selectedConnectionId.value &&
  !!selectedStage.value &&
  !!props.content &&
  !uploading.value &&
  !uploadSuccess.value
)

// Handle upload
async function handleUpload() {
  if (!canUpload.value) return

  const service = getUploadService()
  if (!service) {
    uploadError.value = 'Atlas upload service not available'
    return
  }

  uploading.value = true
  uploadError.value = null

  const result = await service.uploadSchema(
    selectedConnectionId.value!,
    selectedStage.value!,
    props.content,
    {
      name: schemaName.value || undefined,
      overwrite: overwrite.value
    }
  )

  uploading.value = false

  if (result.success) {
    uploadSuccess.value = true
    emit('uploaded', selectedConnectionId.value!, selectedStage.value!)
    // Auto-close after short delay
    setTimeout(() => {
      emit('update:visible', false)
    }, 1000)
  } else {
    uploadError.value = result.error || 'Upload failed'
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
    header="Publish Schema to Atlas"
    :modal="true"
    :style="{ width: '450px' }"
  >
    <div class="upload-form">
      <!-- No connections warning -->
      <div v-if="connections.length === 0" class="upload-warning">
        <i class="pi pi-info-circle"></i>
        No active Atlas connections. Connect to a server first.
      </div>

      <template v-else>
        <!-- Connection -->
        <div class="form-field">
          <label for="upload-connection">Connection</label>
          <Dropdown
            id="upload-connection"
            v-model="selectedConnectionId"
            :options="connectionOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Select connection..."
            class="w-full"
          />
        </div>

        <!-- Stage -->
        <div class="form-field">
          <label for="upload-stage">Stage</label>
          <Dropdown
            id="upload-stage"
            v-model="selectedStage"
            :options="stageOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Select stage..."
            class="w-full"
            :disabled="!selectedConnectionId"
          />
          <small v-if="selectedConnectionId && stages.length === 0" class="field-hint">
            No writable stages available
          </small>
        </div>

        <!-- Schema name -->
        <div class="form-field">
          <label for="upload-name">Schema Name</label>
          <InputText
            id="upload-name"
            v-model="schemaName"
            placeholder="e.g. MyModel"
            class="w-full"
          />
        </div>

        <!-- Overwrite -->
        <div class="form-field-row">
          <Checkbox
            v-model="overwrite"
            inputId="upload-overwrite"
            :binary="true"
          />
          <label for="upload-overwrite">Overwrite if exists</label>
        </div>
      </template>

      <!-- Error -->
      <div v-if="uploadError" class="upload-error">
        <i class="pi pi-exclamation-triangle"></i>
        {{ uploadError }}
      </div>

      <!-- Success -->
      <div v-if="uploadSuccess" class="upload-success">
        <i class="pi pi-check-circle"></i>
        Schema uploaded successfully!
      </div>
    </div>

    <template #footer>
      <Button
        label="Cancel"
        severity="secondary"
        @click="handleClose"
      />
      <Button
        label="Upload"
        icon="pi pi-cloud-upload"
        :loading="uploading"
        :disabled="!canUpload"
        @click="handleUpload"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.upload-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.form-field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-field-row label {
  font-size: 0.85rem;
}

.field-hint {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.w-full {
  width: 100%;
}

.upload-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--p-yellow-700);
  font-size: 0.85rem;
  padding: 10px;
  background: var(--p-yellow-50);
  border-radius: 4px;
}

.upload-error {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--p-red-500);
  font-size: 0.85rem;
  padding: 8px;
  background: var(--p-red-50);
  border-radius: 4px;
}

.upload-success {
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
