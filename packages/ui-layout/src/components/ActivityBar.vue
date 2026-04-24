<script setup lang="ts">
/**
 * ActivityBar - VS Code-like left icon bar
 *
 * Displays perspective switchers.
 */

import { inject, shallowRef, ref, computed, onMounted } from 'tsm:vue'
import SettingsDialog from './SettingsDialog.vue'

// Perspective service (injected from TSM)
const tsm = inject<any>('tsm')
const perspectiveService = shallowRef<any>(null)

// Perspective manager (new registry-based)
const perspectiveManager = shallowRef<any>(null)

// Local tracking of current perspective (updated via polling)
const currentPerspective = ref<string>('explorer')

// Track if workspace is open
const hasWorkspace = ref(false)

// Settings dialog
const showSettings = ref(false)

// All perspective definitions from registry
const allPerspectives = ref<Array<{
  id: string
  icon: string
  label: string
  tooltip: string
  requiresWorkspace: boolean
}>>([
  { id: 'explorer', icon: 'pi pi-folder', label: 'Explorer', tooltip: 'File Explorer (Ctrl+1)', requiresWorkspace: false },
  { id: 'model-editor', icon: 'pi pi-box', label: 'Model Editor', tooltip: 'Model Editor (Ctrl+2)', requiresWorkspace: true }
])

// Filtered perspectives based on workspace state
const perspectives = computed(() => {
  return allPerspectives.value.filter(p => !p.requiresWorkspace || hasWorkspace.value)
})

// Poll for perspective service and state
onMounted(() => {
  setInterval(() => {
    // Check for new perspective manager
    if (!perspectiveManager.value && tsm) {
      const pm = tsm.getService('ui.registry.perspectives')
      if (pm) {
        perspectiveManager.value = pm
      }
    }

    // Always refresh perspectives from registry (to pick up dynamically registered ones)
    if (perspectiveManager.value) {
      const registeredPerspectives = perspectiveManager.value.registry.getAll()
      if (registeredPerspectives.length > 0) {
        // Only update if the list changed
        const newIds = registeredPerspectives.map((p: any) => p.id).sort().join(',')
        const currentIds = allPerspectives.value.map(p => p.id).sort().join(',')
        if (newIds !== currentIds) {
          allPerspectives.value = registeredPerspectives.map((p: any) => ({
            id: p.id,
            icon: p.icon,
            label: p.name,
            tooltip: p.name,
            requiresWorkspace: p.requiresWorkspace ?? false
          }))
        }
      }
    }

    // Check for legacy perspective service
    if (!perspectiveService.value && tsm) {
      const service = tsm.getService('ui.perspectives')
      if (service) {
        perspectiveService.value = service
      }
    }

    // Update workspace state from perspective manager
    if (perspectiveManager.value) {
      hasWorkspace.value = !!perspectiveManager.value.state.workspace
    } else if (perspectiveService.value) {
      const persp = perspectiveService.value.useSharedPerspective()
      hasWorkspace.value = !!persp?.state?.openWorkspace
    }

    // Update current perspective from perspective manager (preferred) or legacy service
    if (perspectiveManager.value) {
      const currentId = perspectiveManager.value.state.currentPerspectiveId
      if (currentId && currentId !== currentPerspective.value) {
        currentPerspective.value = currentId
      }
    } else if (perspectiveService.value) {
      const persp = perspectiveService.value.useSharedPerspective()
      if (persp?.state?.currentPerspective !== currentPerspective.value) {
        currentPerspective.value = persp.state.currentPerspective
      }
    }
  }, 100)
})

const emit = defineEmits<{
  'settings': []
  'perspective-change': [perspectiveId: string]
}>()

async function handlePerspectiveClick(perspectiveId: string) {
  console.log('[ActivityBar] handlePerspectiveClick:', perspectiveId)

  // Update local state immediately for responsive UI
  currentPerspective.value = perspectiveId

  const isViewPerspective = perspectiveId.startsWith('view-')
  console.log('[ActivityBar] isViewPerspective:', isViewPerspective)

  if (isViewPerspective && perspectiveManager.value) {
    // View perspectives: just call onActivate to set the active view
    // Don't change layout - view filters work within the current perspective
    const perspective = perspectiveManager.value.registry.get(perspectiveId)
    console.log('[ActivityBar] Got perspective from registry:', perspective?.id, 'has onActivate:', !!perspective?.onActivate)

    if (perspective?.onActivate) {
      try {
        console.log('[ActivityBar] Calling onActivate...')
        await perspective.onActivate({
          workspace: perspectiveManager.value.state.workspace,
          layout: null,
          panelRegistry: null,
          activityRegistry: null
        })
        console.log('[ActivityBar] onActivate completed')
      } catch (e) {
        console.error('[ActivityBar] Error activating view perspective:', e)
      }
    } else {
      console.warn('[ActivityBar] No onActivate callback found for perspective')
    }
    // Update the perspective ID for tracking
    perspectiveManager.value.setCurrentPerspectiveId(perspectiveId)
  } else {
    // Built-in perspectives: set ID and emit event for App.vue to handle layout
    if (perspectiveManager.value) {
      perspectiveManager.value.setCurrentPerspectiveId(perspectiveId)
    }

    // Suspend view filtering when switching to non-view perspective
    // This doesn't persist, so the view can be resumed later
    try {
      const viewsService = tsm?.getService('gene.views')
      if (viewsService?.suspendViewFiltering) {
        console.log('[ActivityBar] Suspending view filtering for non-view perspective')
        viewsService.suspendViewFiltering()
      }
    } catch (e) {
      console.warn('[ActivityBar] Could not suspend view filtering:', e)
    }

    // Update perspective state in legacy service
    if (perspectiveService.value) {
      const persp = perspectiveService.value.useSharedPerspective()
      persp.switchTo(perspectiveId)
    }

    // Emit event for parent to handle layout changes
    emit('perspective-change', perspectiveId)
  }
}
</script>

<template>
  <div class="activity-bar">
    <!-- Perspectives -->
    <div class="activity-bar-perspectives">
      <button
        v-for="persp in perspectives"
        :key="persp.id"
        class="activity-item"
        :class="{ active: currentPerspective === persp.id }"
        :title="persp.tooltip"
        @click="handlePerspectiveClick(persp.id)"
      >
        <i :class="persp.icon"></i>
      </button>
    </div>

    <div class="activity-bar-bottom">
      <button
        class="activity-item"
        title="Settings"
        @click="showSettings = true"
      >
        <i class="pi pi-cog"></i>
      </button>
    </div>

    <SettingsDialog :visible="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.activity-bar {
  display: flex;
  flex-direction: column;
  width: var(--activity-bar-width, 48px);
  min-width: var(--activity-bar-width, 48px);
  background: var(--surface-section);
  border-right: 1px solid var(--surface-border);
}

.activity-bar-perspectives {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 0;
  flex: 1;
}

.activity-bar-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 0;
  border-top: 1px solid var(--surface-border);
}

.activity-item {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 40px;
  height: 40px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s ease;
}

.activity-item:hover {
  color: var(--text-color);
  background: var(--surface-hover);
  border-color: var(--surface-border);
}

.activity-item.active {
  color: var(--primary-color);
  background: var(--surface-card);
  border-color: var(--surface-border);
}

.activity-item i {
  font-size: 1.25rem;
}
</style>
