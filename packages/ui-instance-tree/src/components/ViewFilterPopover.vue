<script setup lang="ts">
import { useSharedViews } from '../composables/useViews'

const views = useSharedViews()

function select(id: string | null) {
  views.setActiveView(id)
}
</script>

<template>
  <div class="view-filter-menu">
    <button
      class="vfm-item"
      :class="{ active: !views.activeViewId.value }"
      @click="select(null)"
    >
      <i v-if="!views.activeViewId.value" class="pi pi-check vfm-check"></i>
      <span class="vfm-label">Kein Filter</span>
    </button>
    <div class="vfm-separator"></div>
    <template v-if="views.views.value.filter(v => v.enabled).length === 0">
      <div class="vfm-empty">Keine Views vorhanden</div>
    </template>
    <button
      v-for="v in views.views.value.filter(v => v.enabled)"
      :key="v.id"
      class="vfm-item"
      :class="{ active: views.activeViewId.value === v.id }"
      @click="select(v.id)"
    >
      <i v-if="views.activeViewId.value === v.id" class="pi pi-check vfm-check"></i>
      <span class="vfm-label">{{ v.name }}</span>
    </button>
  </div>
</template>

<style scoped>
.view-filter-menu {
  padding: 4px 0;
  min-width: 180px;
}

.vfm-separator {
  height: 1px;
  background: var(--surface-border);
  margin: 4px 0;
}

.vfm-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  background: none;
  border: none;
  text-align: left;
  font-size: 0.875rem;
  color: var(--text-color);
  cursor: pointer;
  border-radius: 0;
  transition: background 0.12s;
}

.vfm-item:hover {
  background: var(--surface-hover);
}

.vfm-item.active {
  color: var(--primary-color);
}

.vfm-check {
  font-size: 0.75rem;
  flex-shrink: 0;
}

.vfm-label {
  flex: 1;
}

.vfm-empty {
  padding: 6px 12px;
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
  font-style: italic;
}
</style>
