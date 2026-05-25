<script setup lang="ts">
/**
 * MenuBar — Perspektiv-spezifische Icon-Toolbar
 *
 * Perspektiven registrieren ihr Menu in der MenuRegistry.
 * Bei Perspektivwechsel wird das zugehoerige Menu gerendert.
 * Items mit `popover`-Komponente öffnen ein Overlay-Panel.
 */
import { ref, computed, watch, inject, onMounted, onUnmounted, type Component } from 'tsm:vue'

const tsm = inject<any>('tsm')

const emit = defineEmits<{
  'show-settings': []
}>()

const workspaceLoaded = ref(false)

interface ToolbarItem {
  id: string
  icon: string
  label: string
  group?: string
  disabled?: boolean | (() => boolean)
  active?: boolean | (() => boolean)
  loading?: boolean | (() => boolean)
  separator?: boolean
  popover?: Component
  action: () => void | Promise<void>
}

const items = ref<ToolbarItem[]>([])
const executingId = ref<string | null>(null)

// Popover-Unterstützung
const activePopoverId = ref<string | null>(null)
const activePopoverComponent = ref<Component | null>(null)
const popoverAnchor = ref<{ top: number; left: number } | null>(null)

function closePopover() {
  activePopoverId.value = null
  activePopoverComponent.value = null
  popoverAnchor.value = null
}

function handleOutsideClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.menu-popover-dropdown') && !target.closest('.menu-btn[data-popover]')) {
    closePopover()
  }
}

onMounted(() => document.addEventListener('mousedown', handleOutsideClick))
onUnmounted(() => document.removeEventListener('mousedown', handleOutsideClick))

function loadMenu() {
  const menuRegistry = tsm?.getService('gene.menu.registry')
  const pm = tsm?.getService('ui.registry.perspectives')
  let perspId = pm?.state?.currentPerspectiveId || ''

  // View-Perspektiven (view-*) nutzen dasselbe Menü wie model-editor
  if (perspId.startsWith('view-')) perspId = 'model-editor'

  workspaceLoaded.value = pm?.state?.workspace != null

  if (!menuRegistry) return
  items.value = menuRegistry.getMenu(perspId) || []
}

const hasItems = computed(() => items.value.length > 0)

function isDisabled(item: ToolbarItem): boolean {
  if (typeof item.disabled === 'function') return item.disabled()
  return !!item.disabled
}

function isActive(item: ToolbarItem): boolean {
  if (typeof item.active === 'function') return item.active()
  return !!item.active
}

function isLoading(item: ToolbarItem): boolean {
  if (executingId.value === item.id) return true
  if (typeof item.loading === 'function') return item.loading()
  return !!item.loading
}

async function executeItem(item: ToolbarItem, event?: MouseEvent) {
  if (isDisabled(item) || isLoading(item)) return

  // Popover-Item: Dropdown togglen
  if (item.popover) {
    if (activePopoverId.value === item.id) {
      closePopover()
    } else {
      const btn = event?.currentTarget as HTMLElement
      const rect = btn?.getBoundingClientRect()
      activePopoverId.value = item.id
      activePopoverComponent.value = item.popover
      popoverAnchor.value = rect ? { top: rect.bottom + 4, left: rect.left } : null
    }
    return
  }

  executingId.value = item.id
  try {
    await item.action()
  } catch (e: any) {
    console.error('[MenuBar] Action failed:', item.id, e)
  } finally {
    executingId.value = null
  }
}

// Listen for menu changes + perspective switches via DOM events (works across modules)
onMounted(() => {
  const eb = tsm?.getService('gene.eventbus')
  if (eb?.on) {
    eb.on('gene:menu-changed', () => loadMenu())
  }

  // Also reload on perspective switch
  const pm = tsm?.getService('ui.registry.perspectives')
  if (pm?.state) {
    watch(() => pm.state.currentPerspectiveId, () => loadMenu())
  }

  loadMenu()
})
</script>

<template>
  <div v-if="hasItems || workspaceLoaded" class="menu-toolbar">
    <template v-for="(item, i) in items" :key="item.id || i">
      <div v-if="item.separator" class="menu-divider"></div>
      <button
        v-else
        class="menu-btn"
        :class="{ active: isActive(item) || activePopoverId === item.id, loading: isLoading(item) }"
        :disabled="isDisabled(item) || isLoading(item)"
        :data-popover="item.popover ? item.id : undefined"
        @click="executeItem(item, $event)"
        v-tooltip.bottom="item.label"
      >
        <i v-if="isLoading(item)" class="pi pi-spin pi-spinner"></i>
        <i v-else :class="item.icon"></i>
      </button>
    </template>

    <div class="menu-spacer"></div>

    <button
      v-if="workspaceLoaded"
      class="menu-btn"
      @click="emit('show-settings')"
      v-tooltip.bottom="'Appearance'"
    >
      <i class="pi pi-palette"></i>
    </button>

  </div>

  <!-- Popover-Dropdown (außerhalb des Toolbars, fixed positioniert) -->
  <Teleport to="body">
    <div
      v-if="activePopoverComponent && popoverAnchor"
      class="menu-popover-dropdown"
      :style="{ top: popoverAnchor.top + 'px', left: popoverAnchor.left + 'px' }"
    >
      <component :is="activePopoverComponent" />
    </div>
  </Teleport>
</template>

<style scoped>
.menu-toolbar {
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 2px;
  height: 32px;
  background: var(--surface-section);
  border-bottom: 1px solid var(--surface-border);
  flex-shrink: 0;
}

.menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-color-secondary);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.menu-btn:hover {
  color: var(--text-color);
  background: var(--surface-hover);
  border-color: var(--surface-border);
}

.menu-btn:active {
  color: var(--primary-color);
  background: var(--surface-card);
  border-color: var(--surface-border);
}

.menu-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.menu-btn.active {
  color: var(--primary-color);
  background: var(--surface-card);
  border-color: var(--surface-border);
}

.menu-btn.loading {
  color: var(--primary-color);
}

.menu-spacer {
  flex: 1;
}

.menu-divider {
  width: 1px;
  height: 18px;
  background: var(--surface-border);
  margin: 0 4px;
  flex-shrink: 0;
}

.menu-popover-dropdown {
  position: fixed;
  z-index: 1000;
  width: 280px;
  max-height: 420px;
  overflow-y: auto;
  background: var(--surface-overlay);
  border: 1px solid var(--surface-border);
  border-radius: var(--border-radius);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}
</style>
