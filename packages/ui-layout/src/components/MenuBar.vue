<script setup lang="ts">
/**
 * MenuBar — Perspektiv-spezifische Icon-Toolbar
 *
 * Perspektiven registrieren ihr Menu in der MenuRegistry.
 * Bei Perspektivwechsel wird das zugehoerige Menu gerendert.
 */
import { ref, computed, watch, inject, onMounted } from 'tsm:vue'

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
  action: () => void | Promise<void>
}

const items = ref<ToolbarItem[]>([])
const executingId = ref<string | null>(null)

function loadMenu() {
  const menuRegistry = tsm?.getService('gene.menu.registry')
  const pm = tsm?.getService('ui.registry.perspectives')
  const perspId = pm?.state?.currentPerspectiveId || ''

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

async function executeItem(item: ToolbarItem) {
  if (isDisabled(item) || isLoading(item)) return
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
        :class="{ active: isActive(item), loading: isLoading(item) }"
        :disabled="isDisabled(item) || isLoading(item)"
        @click="executeItem(item)"
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
</style>
