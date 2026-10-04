<script setup lang="ts">
/**
 * ActivityBar - VS Code-like left icon bar
 *
 * Displays perspective switchers.
 */

import { inject, shallowRef, ref, computed, onMounted, watch } from 'tsm:vue'
import WorkspaceSettingsDialog from './WorkspaceSettingsDialog.vue'

// Perspective service (injected from TSM)
const tsm = inject<any>('tsm')

// Resolve custom icon dataUrl from CSS class
function getIconDataUrl(iconClass: string): string | undefined {
  if (!iconClass || !iconClass.startsWith('custom-icon custom-icon--')) return undefined
  const id = iconClass.replace('custom-icon custom-icon--', '')
  const registry = tsm?.getService('gene.icons.registry')
  const provider = registry?.get?.('custom-icons') as any
  return provider?.getDataUrl?.(id)
}
const perspectiveService = shallowRef<any>(null)

// Perspective manager (new registry-based)
const perspectiveManager = shallowRef<any>(null)

// Local tracking of current perspective (updated via polling)
const currentPerspective = ref<string>('explorer')

// Track if workspace is open
const hasWorkspace = ref(false)

// Settings dialog
const showSettings = ref(false)
const settingsSection = ref<string | undefined>(undefined)
const settingsTargetType = ref<string | undefined>(undefined)

function openSettings(section?: string, targetType?: string) {
  settingsSection.value = section
  settingsTargetType.value = targetType
  showSettings.value = true
}

function closeSettings() {
  showSettings.value = false
  settingsSection.value = undefined
  settingsTargetType.value = undefined
}

// Other modules (e.g. the instance tree's "Set Icon") request the settings
// dialog via the event bus, optionally targeting a section and class.
onMounted(() => {
  const eventBus = tsm?.getService('gene.eventbus')
  eventBus?.on?.('show-workspace-settings', (payload: any) => {
    openSettings(payload?.section, payload?.targetType)
  })
})

/*
 * Die Perspektiven, wie die Registry sie fuehrt.
 *
 * Leer, bis sie geantwortet hat — keine vorlaeufige Liste mehr. Die beiden
 * Eintraege, die hier als Vorgabe standen, blitzten beim Start auf und
 * verschwanden wieder, sobald die wirklichen bekannt waren.
 */
const allPerspectives = ref<Array<{
  id: string
  icon: string
  label: string
  tooltip: string
  requiresWorkspace: boolean
  isView?: boolean
  /** The editor a view belongs to - shown only while its tab is in front */
  editorId?: string
}>>([])

/*
 * Which editor is in front. The view filters of the instance editor have no
 * business in the bar while a metamodel or a transformation is being edited;
 * they appear with an instance tab and go with it.
 */
const frontEditorId = ref<string | null>(null)
tsm?.whenService?.('ui.layout.state', (svc: any) => {
  const layout = svc.useLayoutState()
  watch(() => layout.state.activeEditorTabId, (tabId: string | null) => {
    const front = tsm?.getService('gene.editor.front')
    frontEditorId.value = tabId ? (front?.editorIdOf?.(tabId) ?? null) : null
  }, { immediate: true })
})

/*
 * Perspektiven, die eine Datei bearbeiten, gehoeren nicht mehr hierher: Was
 * offen ist, steht in den Tabs, und der vordere bestimmt die Ansicht. Links
 * bleiben die Navigatoren — Explorer, Model Atlas. Die Ansichten sagen selbst,
 * welche Perspektive sie abloesen.
 *
 * Zugehoert statt nachgesehen: Der Dienst kommt aus ui-instance-tree und kann
 * spaeter da sein als diese Leiste. Einmal in der Sekunde nachzusehen hiess,
 * dass bis zu einer Sekunde lang Icons standen, die gleich wieder verschwanden.
 */
const editorKontext = shallowRef<any>(null)
tsm?.whenService?.('gene.editor.context', (dienst: any) => { editorKontext.value = dienst })

const abgeloest = computed<string[]>(() => editorKontext.value?.abgeloestePerspektiven?.() ?? [])

/*
 * Erst zeigen, wenn feststeht, was zu zeigen ist.
 *
 * Ohne den Kontext-Dienst ist nicht bekannt, welche Perspektive von einer
 * Ansicht abgeloest ist — und eine, die gleich wieder verschwindet, soll gar
 * nicht erst erscheinen.
 */
const bereit = computed(() => editorKontext.value !== null)

const corePerspectives = computed(() => {
  if (!bereit.value) return []
  return allPerspectives.value.filter(
    p => (!p.requiresWorkspace || hasWorkspace.value) && !(p as any).isView && !abgeloest.value.includes(p.id)
  )
})

const viewPerspectives = computed(() => {
  if (!bereit.value) return []
  return allPerspectives.value.filter(
    p => (!p.requiresWorkspace || hasWorkspace.value)
      && (p as any).isView
      && !abgeloest.value.includes(p.id)
      // Editor-specific: only while a tab of that editor is in front
      && (!p.editorId || p.editorId === frontEditorId.value)
  )
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
        // Update if IDs or icons changed
        const newFingerprint = registeredPerspectives.map((p: any) => `${p.id}:${p.icon}`).sort().join(',')
        const currentFingerprint = allPerspectives.value.map(p => `${p.id}:${p.icon}`).sort().join(',')
        if (newFingerprint !== currentFingerprint) {
          allPerspectives.value = registeredPerspectives
            .sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999))
            .map((p: any) => ({
              id: p.id,
              icon: p.icon,
              label: p.name,
              tooltip: p.name,
              requiresWorkspace: p.requiresWorkspace ?? false,
              isView: p.id.startsWith('view-'),
              editorId: p.editorId
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

    /*
     * Markiert wird nur, was hier auch steht.
     *
     * Eine abgeloeste Perspektive — model-editor, metamodeler — ist aus der
     * Leiste verschwunden, kann aber anderswo noch als aktuelle gesetzt werden.
     * Wurde sie uebernommen, passte sie zu keinem Knopf, und es war gar nichts
     * blau. Dann bleibt lieber der letzte, der hier wirklich steht.
     */
    const inDerLeiste = (id: string): boolean =>
      corePerspectives.value.some(p => p.id === id) || viewPerspectives.value.some(p => p.id === id)

    if (perspectiveManager.value) {
      const currentId = perspectiveManager.value.state.currentPerspectiveId
      if (currentId && currentId !== currentPerspective.value && inDerLeiste(currentId)) {
        currentPerspective.value = currentId
      }
    } else if (perspectiveService.value) {
      const persp = perspectiveService.value.useSharedPerspective()
      const id = persp?.state?.currentPerspective
      if (id && id !== currentPerspective.value && inDerLeiste(id)) {
        currentPerspective.value = id
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
    <!-- Core Perspectives -->
    <div class="activity-bar-perspectives">
      <button
        v-for="persp in corePerspectives"
        :key="persp.id"
        class="activity-item"
        :class="{ active: currentPerspective === persp.id }"
        :title="persp.tooltip"
        :data-perspective="persp.id"
        @click="handlePerspectiveClick(persp.id)"
      >
        <img v-if="getIconDataUrl(persp.icon)" :src="getIconDataUrl(persp.icon)" class="activity-icon activity-icon--img" alt="" />
        <i v-else :class="persp.icon"></i>
      </button>
    </div>

    <!-- View Perspectives (from workspace treeViews) -->
    <div v-if="viewPerspectives.length > 0" class="activity-bar-views">
      <div class="activity-divider"></div>
      <button
        v-for="persp in viewPerspectives"
        :key="persp.id"
        class="activity-item"
        :class="{ active: currentPerspective === persp.id }"
        :title="persp.tooltip"
        :data-perspective="persp.id"
        @click="handlePerspectiveClick(persp.id)"
      >
        <img v-if="getIconDataUrl(persp.icon)" :src="getIconDataUrl(persp.icon)" class="activity-icon activity-icon--img" alt="" />
        <i v-else :class="persp.icon"></i>
      </button>
    </div>

    <div v-if="hasWorkspace" class="activity-bar-bottom">
      <button
        v-tid="'open-workspace-settings'"
        class="activity-item"
        title="Workspace Settings"
        @click="openSettings()"
      >
        <i class="pi pi-cog"></i>
      </button>
    </div>

    <WorkspaceSettingsDialog
      v-if="showSettings"
      :visible="showSettings"
      :initial-section="settingsSection"
      :initial-target-type="settingsTargetType"
      @close="closeSettings"
    />
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
}

.activity-bar-views {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 0 0 10px 0;
  flex: 1;
  overflow-y: auto;
}

.activity-divider {
  width: 24px;
  height: 1px;
  background: var(--surface-border);
  margin: 4px 0;
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

.activity-icon--img {
  width: 1.25rem;
  height: 1.25rem;
  object-fit: contain;
}

:root.p-dark .activity-icon--img,
.dark-theme .activity-icon--img {
  filter: invert(0.85);
}
</style>
