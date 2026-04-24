<script setup lang="ts">
/**
 * StatusBar - Bottom status bar
 *
 * Displays status items from registered components.
 */

import { computed, type Component } from 'tsm:vue'
import { useLayoutState } from '../composables/useLayoutState'

const layout = useLayoutState()

const leftItems = computed(() =>
  layout.state.statusBarItems
    .filter(item => item.alignment === 'left')
    .sort((a, b) => (a.priority || 0) - (b.priority || 0))
)

const rightItems = computed(() =>
  layout.state.statusBarItems
    .filter(item => item.alignment === 'right')
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
)

function isComponent(content: string | Component): content is Component {
  return typeof content !== 'string'
}
</script>

<template>
  <div class="status-bar">
    <div class="status-bar-left">
      <div
        v-for="item in leftItems"
        :key="item.id"
        class="status-item"
        :class="{ clickable: !!item.onClick }"
        :title="item.tooltip"
        @click="item.onClick?.()"
      >
        <component v-if="isComponent(item.content)" :is="item.content" />
        <span v-else>{{ item.content }}</span>
      </div>
    </div>

    <div class="status-bar-right">
      <div
        v-for="item in rightItems"
        :key="item.id"
        class="status-item"
        :class="{ clickable: !!item.onClick }"
        :title="item.tooltip"
        @click="item.onClick?.()"
      >
        <component v-if="isComponent(item.content)" :is="item.content" />
        <span v-else>{{ item.content }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--status-bar-height, 26px);
  min-height: var(--status-bar-height, 26px);
  padding: 0 12px;
  background: var(--primary-color);
  color: white;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-bar-left,
.status-bar-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  height: 20px;
  border-radius: 4px;
  transition: background 0.15s ease;
}

.status-item.clickable {
  cursor: pointer;
}

.status-item.clickable:hover {
  background: rgba(255, 255, 255, 0.15);
}

.status-item i {
  font-size: 0.8125rem;
  opacity: 0.9;
}
</style>
