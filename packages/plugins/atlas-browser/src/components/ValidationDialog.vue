<script setup lang="ts">
/**
 * ValidationDialog - Select C-OCL ConstraintSet before server validation
 */
import { ref, inject, onMounted } from 'tsm:vue'
import { Dialog, Button } from 'tsm:primevue'
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
const constraintSets = ref<{ objectId: string; name: string; version: string }[]>([])

onMounted(async () => {
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
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    header="Server Validierung"
    :modal="true"
    :style="{ width: '450px' }"
  >
    <p style="font-size: 0.85rem; color: var(--text-color-secondary); margin: 0 0 12px 0;">
      Wähle optional ein C-OCL Constraint-Set für erweiterte Validierung.
    </p>

    <!-- Validate without C-OCL -->
    <div class="val-option" @click="handleValidateOnly">
      <div class="val-info">
        <span class="val-label">Nur EMF Validierung</span>
        <span class="val-desc">Standard-Validierung ohne C-OCL Constraints</span>
      </div>
      <i class="pi pi-chevron-right"></i>
    </div>

    <!-- Loading -->
    <div v-if="loading" style="text-align: center; padding: 12px;">
      <i class="pi pi-spinner pi-spin"></i>
    </div>

    <!-- C-OCL constraint sets -->
    <div v-for="cs in constraintSets" :key="cs.objectId" class="val-option cocl" @click="handleValidateWithCocl(cs.objectId)">
      <div class="val-info">
        <span class="val-label">{{ cs.name }}</span>
        <span class="val-desc">EMF + C-OCL Constraints <span v-if="cs.version">v{{ cs.version }}</span></span>
      </div>
      <i class="pi pi-chevron-right"></i>
    </div>

    <div v-if="!loading && constraintSets.length === 0" style="font-size: 0.8rem; color: var(--text-color-secondary); padding: 8px 0; font-style: italic;">
      Keine C-OCL Constraint-Sets auf dem Server gefunden.
    </div>
  </Dialog>
</template>

<style scoped>
.val-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 6px;
}

.val-option:hover {
  background: var(--surface-hover);
}

.val-option.cocl {
  border-color: color-mix(in srgb, var(--primary-color) 30%, var(--surface-border));
}

.val-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.val-label {
  font-size: 0.875rem;
  font-weight: 600;
}

.val-desc {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.pi-chevron-right {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}
</style>
