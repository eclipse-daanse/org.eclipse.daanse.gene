<script setup lang="ts">
/**
 * PickerDialog — Unified configurable picker dialog
 *
 * Supports flat and grouped display modes, keyboard navigation,
 * search with debounce, and data-source adapters.
 */

import { ref, computed, watch, nextTick, onUnmounted } from 'tsm:vue'
import type { PickerItem, PickerDataSource, PickerGroup } from '../types'

const props = withDefaults(defineProps<{
  visible: boolean
  header?: string
  placeholder?: string
  displayMode?: 'flat' | 'grouped'
  dataSource: PickerDataSource
  showSearch?: boolean
  showKeyboardHints?: boolean
}>(), {
  header: 'Select',
  placeholder: 'Search...',
  displayMode: 'flat',
  showSearch: true,
  showKeyboardHints: true
})

const emit = defineEmits<{
  'close': []
  'select': [item: PickerItem]
}>()

// ── State ────────────────────────────────────────────────────────────────────

const searchQuery = ref('')
const allItems = ref<PickerItem[]>([])
const isLoading = ref(false)
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const resultsRef = ref<HTMLDivElement | null>(null)

let debounceTimer: ReturnType<typeof setTimeout> | null = null

onUnmounted(() => { if (debounceTimer) clearTimeout(debounceTimer) })

// ── Computed: flat items for navigation ──────────────────────────────────────

const groups = computed<PickerGroup[]>(() => {
  if (props.displayMode !== 'grouped') return []
  const map = new Map<string, PickerGroup>()
  for (const item of allItems.value) {
    const gk = item.groupKey || ''
    let g = map.get(gk)
    if (!g) {
      g = {
        key: gk,
        label: item.groupLabel || gk,
        icon: item.groupIcon,
        items: [],
        expanded: true
      }
      map.set(gk, g)
    }
    g.items.push(item)
  }
  return Array.from(map.values())
})

/** Flat list of selectable items (respecting group expansion). */
const selectableItems = computed<PickerItem[]>(() => {
  if (props.displayMode === 'flat') return allItems.value
  const result: PickerItem[] = []
  for (const g of groups.value) {
    if (g.expanded) {
      result.push(...g.items)
    }
  }
  return result
})

const minQueryLength = computed(() => props.dataSource.minQueryLength ?? 0)

// ── Data loading ─────────────────────────────────────────────────────────────

async function loadInitial() {
  isLoading.value = true
  try {
    allItems.value = await props.dataSource.loadInitial()
  } catch (e) {
    console.error('[PickerDialog] loadInitial error:', e)
    allItems.value = []
  } finally {
    isLoading.value = false
  }
}

function onSearchInput() {
  if (debounceTimer) clearTimeout(debounceTimer)

  const query = searchQuery.value.trim()
  if (query.length < minQueryLength.value) {
    // Below threshold — reload initial
    loadInitial()
    return
  }

  debounceTimer = setTimeout(async () => {
    isLoading.value = true
    selectedIndex.value = 0
    try {
      allItems.value = await props.dataSource.search(query)
    } catch (e) {
      console.error('[PickerDialog] search error:', e)
      allItems.value = []
    } finally {
      isLoading.value = false
    }
  }, 150)
}

// ── Keyboard navigation ──────────────────────────────────────────────────────

function handleKeydown(event: KeyboardEvent) {
  const items = selectableItems.value
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      if (items.length > 0) {
        selectedIndex.value = Math.min(selectedIndex.value + 1, items.length - 1)
        scrollToSelected()
      }
      break
    case 'ArrowUp':
      event.preventDefault()
      if (items.length > 0) {
        selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
        scrollToSelected()
      }
      break
    case 'Enter':
      event.preventDefault()
      if (items.length > 0 && selectedIndex.value < items.length) {
        const item = items[selectedIndex.value]
        if (!item.disabled) selectItem(item)
      }
      break
    case 'Escape':
      event.preventDefault()
      close()
      break
  }
}

function scrollToSelected() {
  nextTick(() => {
    const el = resultsRef.value?.querySelector('.picker-item.selected')
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

// ── Selection / close ────────────────────────────────────────────────────────

function selectItem(item: PickerItem) {
  if (item.disabled) return
  emit('select', item)
  close()
}

function close() {
  searchQuery.value = ''
  allItems.value = []
  selectedIndex.value = 0
  emit('close')
}

function toggleGroup(group: PickerGroup) {
  group.expanded = !group.expanded
  // Re-clamp selected index
  selectedIndex.value = Math.min(selectedIndex.value, selectableItems.value.length - 1)
}

/** Map a PickerItem to its index within selectableItems. */
function flatIndex(item: PickerItem): number {
  return selectableItems.value.indexOf(item)
}

// ── Visibility watcher ───────────────────────────────────────────────────────

watch(() => props.visible, async (visible) => {
  if (visible) {
    await loadInitial()
    nextTick(() => inputRef.value?.focus())
  } else {
    searchQuery.value = ''
    allItems.value = []
    selectedIndex.value = 0
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="picker-overlay" @click.self="close">
      <div class="picker-dialog" @keydown="handleKeydown">

        <!-- Header -->
        <div class="picker-header">
          <template v-if="showSearch">
            <i class="pi pi-search picker-search-icon" />
            <input
              ref="inputRef"
              v-model="searchQuery"
              type="text"
              class="picker-input"
              :placeholder="placeholder"
              @input="onSearchInput"
            />
          </template>
          <span v-else class="picker-title">{{ header }}</span>
          <button class="picker-close-btn" @click="close" title="Close (Escape)">
            <i class="pi pi-times" />
          </button>
        </div>

        <!-- Toolbar slot -->
        <div v-if="$slots.toolbar" class="picker-toolbar">
          <slot name="toolbar" />
        </div>

        <!-- Results -->
        <div ref="resultsRef" class="picker-results">
          <!-- Loading -->
          <div v-if="isLoading" class="picker-state">
            <i class="pi pi-spin pi-spinner" />
            <span>Searching...</span>
          </div>

          <!-- Empty -->
          <div v-else-if="selectableItems.length === 0" class="picker-state">
            <i class="pi pi-inbox" />
            <span>No results</span>
          </div>

          <!-- Grouped mode -->
          <template v-else-if="displayMode === 'grouped'">
            <div v-for="group in groups" :key="group.key" class="picker-group">
              <div class="picker-group-header" @click="toggleGroup(group)">
                <i :class="group.expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="picker-group-toggle" />
                <i v-if="group.icon" :class="group.icon" class="picker-group-icon" />
                <span class="picker-group-label">{{ group.label }}</span>
                <span class="picker-group-count">{{ group.items.length }}</span>
              </div>
              <template v-if="group.expanded">
                <div
                  v-for="item in group.items"
                  :key="item.key"
                  class="picker-item"
                  :class="{
                    selected: selectedIndex === flatIndex(item),
                    disabled: item.disabled,
                    italic: item.styleHints?.italic
                  }"
                  @click="selectItem(item)"
                  @mouseenter="selectedIndex = flatIndex(item)"
                >
                  <slot name="item" :item="item">
                    <i :class="item.icon" class="picker-item-icon" />
                    <span class="picker-item-label">{{ item.label }}</span>
                    <span v-if="item.styleHints?.tag" class="picker-item-tag">{{ item.styleHints.tag }}</span>
                    <span v-if="item.secondaryLabel" class="picker-item-secondary">{{ item.secondaryLabel }}</span>
                  </slot>
                </div>
              </template>
            </div>
          </template>

          <!-- Flat mode -->
          <template v-else>
            <div class="picker-flat-list">
              <div
                v-for="(item, index) in allItems"
                :key="item.key"
                class="picker-item"
                :class="{
                  selected: selectedIndex === index,
                  disabled: item.disabled,
                  italic: item.styleHints?.italic
                }"
                @click="selectItem(item)"
                @mouseenter="selectedIndex = index"
              >
                <slot name="item" :item="item">
                  <div class="picker-item-main">
                    <i :class="item.icon" class="picker-item-icon" />
                    <span class="picker-item-label">{{ item.label }}</span>
                    <span v-if="item.styleHints?.tag" class="picker-item-tag">{{ item.styleHints.tag }}</span>
                    <span v-if="item.secondaryLabel" class="picker-item-secondary">{{ item.secondaryLabel }}</span>
                  </div>
                  <div v-if="item.snippetHtml" class="picker-item-snippet" v-html="item.snippetHtml" />
                  <div v-if="item.breadcrumb" class="picker-item-breadcrumb">
                    <i class="pi pi-sitemap" />
                    {{ item.breadcrumb }}
                  </div>
                  <div v-if="item.disabled && item.disabledReason" class="picker-item-warning">
                    <i class="pi pi-exclamation-triangle" />
                    {{ item.disabledReason }}
                  </div>
                </slot>
              </div>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div v-if="showKeyboardHints" class="picker-footer">
          <span class="picker-hint"><kbd>&uarr;&darr;</kbd> Navigate</span>
          <span class="picker-hint"><kbd>Enter</kbd> Select</span>
          <span class="picker-hint"><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
  z-index: 2200;
}

.picker-dialog {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  width: 600px;
  max-width: 90vw;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

/* ── Header ─────────────────────────────────────────────────────────────── */

.picker-header {
  display: flex;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--surface-border);
  gap: 12px;
}

.picker-search-icon {
  color: var(--text-color-secondary);
  font-size: 1.1rem;
}

.picker-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 1rem;
  color: var(--text-color);
}

.picker-input::placeholder {
  color: var(--text-color-secondary);
}

.picker-title {
  flex: 1;
  font-weight: 600;
  color: var(--text-color);
}

.picker-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.picker-close-btn:hover {
  color: var(--text-color);
  background: var(--surface-hover);
}

/* ── Toolbar ────────────────────────────────────────────────────────────── */

.picker-toolbar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--surface-border);
}

/* ── Results ────────────────────────────────────────────────────────────── */

.picker-results {
  flex: 1;
  overflow-y: auto;
  min-height: 200px;
}

.picker-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--text-color-secondary);
}

.picker-state i {
  font-size: 2rem;
  opacity: 0.5;
}

.picker-flat-list {
  padding: 8px;
}

/* ── Group headers ──────────────────────────────────────────────────────── */

.picker-group {
  margin-bottom: 2px;
}

.picker-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  cursor: pointer;
  user-select: none;
  color: var(--text-color-secondary);
  font-weight: 600;
  font-size: 0.8125rem;
  transition: background 0.12s;
}

.picker-group-header:hover {
  background: var(--surface-hover);
}

.picker-group-toggle {
  font-size: 0.625rem;
  width: 16px;
  text-align: center;
}

.picker-group-icon {
  font-size: 0.75rem;
}

.picker-group-label {
  flex: 1;
}

.picker-group-count {
  font-size: 0.6875rem;
  opacity: 0.6;
}

/* ── Items ──────────────────────────────────────────────────────────────── */

.picker-item {
  padding: 8px 12px;
  margin: 2px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.1s ease;
}

.picker-item:hover,
.picker-item.selected {
  background: var(--surface-hover);
}

.picker-item.selected {
  background: color-mix(in srgb, var(--primary-color) 15%, var(--surface-ground));
}

.picker-item.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.picker-item.italic {
  font-style: italic;
}

.picker-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.picker-item-icon {
  color: var(--text-color-secondary);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.picker-item-label {
  flex: 1;
  font-size: 0.8125rem;
  color: var(--text-color);
}

.picker-item-secondary {
  font-size: 0.6875rem;
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.picker-item-tag {
  font-size: 0.5625rem;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--surface-hover);
  color: var(--text-color-secondary);
}

.picker-item-snippet {
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
  margin: 4px 0 4px 22px;
  word-break: break-word;
}

.picker-item-snippet :deep(mark) {
  background: color-mix(in srgb, var(--primary-color) 30%, transparent);
  color: var(--text-color);
  padding: 0 2px;
  border-radius: 2px;
}

.picker-item-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.6875rem;
  color: var(--text-color-secondary);
  opacity: 0.7;
  margin-left: 22px;
}

.picker-item-breadcrumb i {
  font-size: 0.625rem;
}

.picker-item-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--orange-500) 15%, transparent);
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--orange-500);
}

/* ── Footer ─────────────────────────────────────────────────────────────── */

.picker-footer {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  border-top: 1px solid var(--surface-border);
  background: var(--surface-ground);
}

.picker-hint {
  font-size: 0.6875rem;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.picker-hint kbd {
  display: inline-block;
  padding: 2px 6px;
  background: var(--surface-hover);
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  font-family: inherit;
  font-size: 0.625rem;
  color: var(--text-color-secondary);
}
</style>
