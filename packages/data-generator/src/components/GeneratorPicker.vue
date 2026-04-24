<script setup lang="ts">
/**
 * GeneratorPicker - Dialog for browsing and selecting FakerJS generators.
 */

import { ref, computed, onMounted } from 'tsm:vue'
import { Dialog, InputText, Button } from 'tsm:primevue'
import type { GeneratorInfo } from '../types'
import { useGeneratorRegistry } from '../composables/useGeneratorRegistry'

const props = defineProps<{
  visible: boolean
  filterType?: string
}>()

const emit = defineEmits<{
  'update:visible': [val: boolean]
  'select': [key: string]
}>()

const registry = useGeneratorRegistry()
const searchQuery = ref('')

const filteredGenerators = computed((): GeneratorInfo[] => {
  let results: GeneratorInfo[]
  if (props.filterType) {
    results = registry.getForType(props.filterType)
  } else {
    results = registry.allGenerators.value
  }

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    results = results.filter(g =>
      g.key.toLowerCase().includes(q) ||
      g.label.toLowerCase().includes(q) ||
      g.category.toLowerCase().includes(q)
    )
  }

  return results
})

const groupedGenerators = computed((): Record<string, GeneratorInfo[]> => {
  const groups: Record<string, GeneratorInfo[]> = {}
  for (const gen of filteredGenerators.value) {
    if (!groups[gen.category]) groups[gen.category] = []
    groups[gen.category].push(gen)
  }
  return groups
})

function handleSelect(key: string) {
  emit('select', key)
  emit('update:visible', false)
}

function handleClose() {
  emit('update:visible', false)
  searchQuery.value = ''
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="handleClose"
    header="Select Generator"
    :modal="true"
    :style="{ width: '520px' }"
    :contentStyle="{ padding: 0 }"
  >
    <div class="picker-container">
      <div class="search-bar">
        <InputText
          v-model="searchQuery"
          placeholder="Search generators..."
          size="small"
          class="search-input"
          autofocus
        />
        <span v-if="filterType" class="type-badge">{{ filterType }}</span>
      </div>

      <div class="generator-list">
        <div v-if="Object.keys(groupedGenerators).length === 0" class="empty-state">
          No generators found
        </div>

        <div v-for="(generators, category) in groupedGenerators" :key="category" class="category-group">
          <div class="category-header">{{ category }}</div>
          <div
            v-for="gen in generators"
            :key="gen.key"
            class="generator-item"
            @click="handleSelect(gen.key)"
          >
            <div class="gen-info">
              <span class="gen-label">{{ gen.label }}</span>
              <span class="gen-key">{{ gen.key }}</span>
            </div>
            <div class="gen-types">
              <span
                v-for="t in gen.compatibleTypes.slice(0, 3)"
                :key="t"
                class="type-tag"
              >{{ t }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.picker-container {
  display: flex;
  flex-direction: column;
  max-height: 480px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--surface-border);
}

.search-input { flex: 1; }

.type-badge {
  font-size: 0.625rem;
  padding: 2px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--primary-color) 20%, transparent);
  color: var(--primary-color);
  font-weight: 600;
  white-space: nowrap;
}

.generator-list {
  overflow-y: auto;
  flex: 1;
}

.category-group {
  margin-bottom: 4px;
}

.category-header {
  padding: 6px 12px;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-color-secondary);
  background: var(--surface-ground);
  border-bottom: 1px solid var(--surface-border);
  position: sticky;
  top: 0;
  z-index: 1;
}

.generator-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  cursor: pointer;
  transition: background 0.1s;
}

.generator-item:hover {
  background: var(--surface-hover);
}

.gen-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.gen-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-color);
}

.gen-key {
  font-size: 0.6875rem;
  color: var(--text-color-secondary);
  font-family: monospace;
}

.gen-types {
  display: flex;
  gap: 3px;
}

.type-tag {
  font-size: 0.5625rem;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--surface-hover);
  color: var(--text-color-secondary);
  font-weight: 500;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 0.8125rem;
}
</style>
