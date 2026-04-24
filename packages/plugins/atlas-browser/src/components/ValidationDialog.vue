<script setup lang="ts">
/**
 * ValidationDialog - Select C-OCL ConstraintSet before server validation.
 * Shows available constraint sets from Atlas and lets user choose
 * between EMF-only validation or validation with C-OCL constraints.
 */
import { ref, watch } from 'tsm:vue'
import { Dialog } from 'tsm:primevue'
import { useSharedAtlasBrowser } from '../composables/useAtlasBrowser'
import { parseMetadataListXmi } from 'storage-model-atlas'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [val: boolean]
  'validate': [oclId: string | null]
}>()

const browser = useSharedAtlasBrowser()
const loading = ref(false)
const constraintSets = ref<{ objectId: string; name: string; stage: string; version: string }[]>([])

// Load constraint sets when dialog becomes visible
watch(() => props.visible, async (visible) => {
  if (!visible) return
  constraintSets.value = []
  await loadConstraintSets()
})

async function loadConstraintSets() {
  const conn = browser.connections.value.find((c: any) => c.status === 'connected')
  if (!conn) return

  const client = browser.getClient(conn.id)
  if (!client) return

  loading.value = true
  try {
    const xmi = await client.listAllObjects(conn.scopeName, 'cocl')
    if (xmi) {
      const metadataList = parseMetadataListXmi(xmi)
      constraintSets.value = metadataList.map(m => ({
        objectId: m.objectId,
        name: m.objectName || m.objectId,
        stage: m.stage || '',
        version: m.version || ''
      }))
    }
  } catch (e) {
    console.warn('[ValidationDialog] Failed to load C-OCL sets:', e)
  } finally {
    loading.value = false
  }
}

function handleValidateOnly() {
  emit('validate', null)
  emit('update:visible', false)
}

function handleValidateWithCocl(oclId: string) {
  emit('validate', oclId)
  emit('update:visible', false)
}

function handleClose() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="handleClose"
    header="Server Validierung"
    :modal="true"
    :style="{ width: '480px' }"
  >
    <p class="dialog-hint">
      Wähle eine Validierungsoption. Du kannst nur die EMF-Standardvalidierung durchführen
      oder zusätzlich ein C-OCL Constraint-Set für erweiterte Prüfungen auswählen.
    </p>

    <!-- Validate without C-OCL -->
    <div class="val-option" @click="handleValidateOnly">
      <div class="val-icon emf">
        <i class="pi pi-check-circle"></i>
      </div>
      <div class="val-info">
        <span class="val-label">Nur EMF Validierung</span>
        <span class="val-desc">Standard-Validierung ohne C-OCL Constraints</span>
      </div>
      <i class="pi pi-chevron-right val-arrow"></i>
    </div>

    <!-- Divider -->
    <div v-if="constraintSets.length > 0 || loading" class="val-divider">
      <span>C-OCL Constraint-Sets</span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="val-loading">
      <i class="pi pi-spinner pi-spin"></i>
      <span>Lade Constraint-Sets...</span>
    </div>

    <!-- C-OCL constraint sets -->
    <div
      v-for="cs in constraintSets"
      :key="cs.objectId"
      class="val-option cocl"
      @click="handleValidateWithCocl(cs.objectId)"
    >
      <div class="val-icon cocl-icon">
        <i class="pi pi-shield"></i>
      </div>
      <div class="val-info">
        <span class="val-label">{{ cs.name }}</span>
        <span class="val-desc">
          EMF + C-OCL Constraints
          <span v-if="cs.stage" class="val-stage">{{ cs.stage }}</span>
          <span v-if="cs.version"> · v{{ cs.version }}</span>
        </span>
      </div>
      <i class="pi pi-chevron-right val-arrow"></i>
    </div>

    <div v-if="!loading && constraintSets.length === 0" class="val-empty">
      Keine C-OCL Constraint-Sets auf dem Server gefunden.
    </div>
  </Dialog>
</template>

<style scoped>
.dialog-hint {
  font-size: 0.82rem;
  color: var(--text-color-secondary);
  margin: 0 0 14px 0;
  line-height: 1.4;
}

.val-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 6px;
  transition: background 0.15s;
}

.val-option:hover {
  background: var(--surface-hover);
}

.val-option.cocl {
  border-color: color-mix(in srgb, var(--primary-color) 30%, var(--surface-border));
}

.val-option.cocl:hover {
  border-color: var(--primary-color);
}

.val-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  flex-shrink: 0;
  font-size: 1rem;
}

.val-icon.emf {
  background: color-mix(in srgb, var(--green-500) 15%, transparent);
  color: var(--green-500);
}

.val-icon.cocl-icon {
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  color: var(--primary-color);
}

.val-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.val-label {
  font-size: 0.875rem;
  font-weight: 600;
}

.val-desc {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.val-stage {
  display: inline-block;
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  color: var(--primary-color);
  padding: 0 5px;
  border-radius: 3px;
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
}

.val-arrow {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.val-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 8px 0;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.val-divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--surface-border);
}

.val-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  font-size: 0.82rem;
  color: var(--text-color-secondary);
}

.val-empty {
  font-size: 0.8rem;
  color: var(--text-color-secondary);
  padding: 8px 0;
  font-style: italic;
}
</style>
