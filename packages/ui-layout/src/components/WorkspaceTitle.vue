<script setup lang="ts">
/**
 * The loaded workspace in the title bar: a square with its first letter, its
 * name - and, while it has unsaved changes, a dot that saves it when clicked.
 *
 * Changes to a workspace (instance files added, editor choices, layout) live
 * in memory until something writes the .wsp. Only the settings dialog showed
 * that; here it is in sight all the time.
 */
import type { WorkspaceBadge } from '../composables/workspaceBadge'

defineProps<{
  badge: WorkspaceBadge | null
  /** Shown when no workspace is loaded */
  fallbackName: string
  /** The loaded workspace has unsaved changes */
  dirty?: boolean
  /** It is being written right now */
  saving?: boolean
}>()

const emit = defineEmits<{ save: [] }>()
</script>

<template>
  <template v-if="badge">
    <span
      class="workspace-initial"
      :style="{ background: badge.color }"
      :title="badge.path"
      aria-hidden="true"
    >{{ badge.initial }}</span>
    <span class="workspace-name" :title="badge.path">{{ badge.name }}</span>
    <button
      v-if="dirty || saving"
      type="button"
      class="workspace-dirty"
      :class="{ 'workspace-dirty--saving': saving }"
      :disabled="saving"
      :title="saving ? 'Workspace wird gespeichert …' : 'Ungespeicherte Änderungen – klicken zum Speichern'"
      :aria-label="saving ? 'Workspace wird gespeichert' : 'Workspace speichern'"
      data-testid="gene.WorkspaceTitle.Dirty"
      @click="emit('save')"
    >●</button>
  </template>
  <span v-else class="workspace-name">{{ fallbackName }}</span>
</template>

<style scoped>
.workspace-initial {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
  user-select: none;
}

.workspace-name {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-color);
}

/* Like the dot on a changed tab - but a button: clicking it saves */
.workspace-dirty {
  border: none;
  background: transparent;
  padding: 0 2px;
  margin-left: -2px;
  font-size: 0.8rem;
  line-height: 1;
  color: var(--primary-color);
  cursor: pointer;
}

.workspace-dirty:hover:not(:disabled) {
  transform: scale(1.25);
}

.workspace-dirty--saving {
  opacity: 0.5;
  cursor: progress;
}
</style>
