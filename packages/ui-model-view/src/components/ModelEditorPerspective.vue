<script setup lang="ts">
/**
 * DepthToolbar Component
 *
 * Simple toolbar that adds Model View depth control.
 * To be used together with the existing Instance Editor layout.
 */

import { computed } from 'tsm:vue'
import { InputNumber } from 'tsm:primevue'
import { useSharedModelView } from '../composables/useModelView'

const modelView = useSharedModelView()

// Current depth
const depth = computed({
  get: () => modelView.currentView.value?.depth ?? 1,
  set: (value: number) => modelView.setDepth(value)
})

// Focus resource name
const focusName = computed(() => {
  const uri = modelView.focusResource.value?.getURI()?.toString()
  if (!uri) return 'No focus'
  const parts = uri.split('/')
  return parts[parts.length - 1] || uri
})

// Visible levels info
const levelInfo = computed(() => {
  const levels = modelView.visibleLevels.value
  if (levels.length === 0) return ''
  return levels.map(l => l.uri.split('/').pop()).join(' → ')
})

</script>

<template>
  <div class="depth-toolbar">
    <!-- Depth Control -->
    <div class="toolbar-section">
      <label class="toolbar-label">Depth</label>
      <InputNumber
        v-model="depth"
        :min="0"
        :max="10"
        showButtons
        buttonLayout="horizontal"
        :step="1"
        class="depth-input"
        decrementButtonClass="p-button-text"
        incrementButtonClass="p-button-text"
        incrementButtonIcon="pi pi-plus"
        decrementButtonIcon="pi pi-minus"
      />
    </div>

    <!-- Focus Display -->
    <div class="toolbar-section">
      <label class="toolbar-label">Focus</label>
      <span class="focus-name">{{ focusName }}</span>
    </div>

    <!-- Level chain info -->
    <div v-if="levelInfo" class="toolbar-section level-info">
      <span class="level-chain">{{ levelInfo }}</span>
    </div>
  </div>
</template>

<style scoped>
.depth-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  background: var(--surface-section);
  border-bottom: 1px solid var(--surface-border);
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toolbar-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-color-secondary);
}

.depth-input {
  width: 100px;
}

:deep(.depth-input .p-inputnumber-input) {
  width: 40px;
  text-align: center;
}

.focus-name {
  font-family: monospace;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.level-info {
  flex: 1;
  justify-content: flex-end;
}

.level-chain {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  font-family: monospace;
}
</style>
