<script setup lang="ts">
/**
 * The Model Atlas as one tab: Transitions, Schemas and the Schema Explorer,
 * side by side behind a small section switch.
 *
 * They were three separate center panels of the atlas perspective, each its
 * own tab. They belong together - all three look at what is selected in the
 * atlas tree - so they share one tab, and the tab bar stays about files.
 *
 * Which section is open lives in `useAtlasSection`: the tree can ask for one
 * (a selected schema shows its details), and the choice survives the tab being
 * rebuilt on a tab switch.
 */
import { computed } from 'tsm:vue'
import AtlasTransitionsEditor from './AtlasTransitionsEditor.vue'
import AtlasDetailPanel from './AtlasDetailPanel.vue'
import AtlasSchemaExplorer from './AtlasSchemaExplorer.vue'
import { useAtlasSection, type AtlasSection } from '../composables/atlasSection'

const sections = [
  { id: 'transitions', label: 'Transitions', icon: 'pi pi-arrow-right-arrow-left', component: AtlasTransitionsEditor },
  { id: 'schemas', label: 'Schemas', icon: 'pi pi-info-circle', component: AtlasDetailPanel },
  { id: 'explorer', label: 'Schema-Explorer', icon: 'pi pi-search', component: AtlasSchemaExplorer }
] as const

const { activeSection: active, show } = useAtlasSection()

function select(id: AtlasSection): void {
  show(id)
}

const current = computed(() => sections.find(s => s.id === active.value)?.component ?? AtlasTransitionsEditor)
</script>

<template>
  <div class="model-atlas-tab">
    <nav class="atlas-sections">
      <button
        v-for="section in sections"
        :key="section.id"
        class="atlas-section-btn"
        :class="{ active: active === section.id }"
        @click="select(section.id)"
      >
        <i :class="section.icon"></i>
        <span>{{ section.label }}</span>
      </button>
    </nav>
    <div class="atlas-section-body">
      <KeepAlive>
        <component :is="current" :key="active" />
      </KeepAlive>
    </div>
  </div>
</template>

<style scoped>
.model-atlas-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--surface-card);
}

.atlas-sections {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-section);
}

.atlas-section-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color-secondary);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
}

.atlas-section-btn:hover {
  color: var(--text-color);
  background: var(--surface-hover);
}

.atlas-section-btn.active {
  color: var(--primary-color);
  background: var(--surface-card);
  border-color: var(--surface-border);
}

.atlas-section-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
