<script setup lang="ts">
/**
 * ViewsPanel Component
 *
 * Panel for managing tree views (saved filters).
 * Allows users to create, delete, and switch between views,
 * and manage filters within the active view.
 */

import { ref, computed } from 'tsm:vue'
import { Dropdown } from 'tsm:primevue'
import { Button } from 'tsm:primevue'
import { Checkbox } from 'tsm:primevue'
import { InputText } from 'tsm:primevue'
import { Dialog } from 'tsm:primevue'
import { useSharedViews } from '../composables/useViews'
import type { TreeViewState, TreeFilterState } from '../composables/useViews'

const views = useSharedViews()

// New view dialog
const showNewViewDialog = ref(false)
const newViewName = ref('')

// Edit view dialog
const showEditViewDialog = ref(false)
const editViewName = ref('')

// Available icons for perspective
const availableIcons = [
  { label: 'Filter', value: 'pi pi-filter' },
  { label: 'Eye', value: 'pi pi-eye' },
  { label: 'Star', value: 'pi pi-star' },
  { label: 'Bookmark', value: 'pi pi-bookmark' },
  { label: 'Tag', value: 'pi pi-tag' },
  { label: 'Heart', value: 'pi pi-heart' },
  { label: 'Flag', value: 'pi pi-flag' },
  { label: 'Circle', value: 'pi pi-circle' },
  { label: 'Check', value: 'pi pi-check-circle' },
  { label: 'Box', value: 'pi pi-box' },
  { label: 'List', value: 'pi pi-list' },
  { label: 'Table', value: 'pi pi-table' }
]

// Computed for dropdown
const viewOptions = computed(() => {
  return [
    { id: null, name: '(No View)' },
    ...views.views.value.map(v => ({ id: v.id, name: v.name }))
  ]
})

const selectedViewId = computed({
  get: () => views.activeViewId.value,
  set: (id) => views.setActiveView(id)
})

/**
 * Create a new view
 */
function handleCreateView() {
  if (!newViewName.value.trim()) return

  const view = views.createView(newViewName.value.trim())
  views.setActiveView(view.id)

  showNewViewDialog.value = false
  newViewName.value = ''
}

/**
 * Delete the active view
 */
function handleDeleteView() {
  if (!views.activeView.value) return

  if (confirm(`Delete view "${views.activeView.value.name}"?`)) {
    views.deleteView(views.activeView.value.id)
  }
}

/**
 * Toggle view enabled state
 */
function handleToggleEnabled() {
  if (!views.activeView.value) return
  views.updateView(views.activeView.value.id, {
    enabled: !views.activeView.value.enabled
  })
}

/**
 * Start editing view name
 */
function handleStartEditName() {
  if (!views.activeView.value) return
  editViewName.value = views.activeView.value.name
  showEditViewDialog.value = true
}

/**
 * Save edited view name
 */
function handleSaveEditName() {
  if (!views.activeView.value || !editViewName.value.trim()) return

  views.updateView(views.activeView.value.id, {
    name: editViewName.value.trim()
  })

  showEditViewDialog.value = false
}

/**
 * Get display text for a filter
 */
function getFilterLabel(filter: TreeFilterState): string {
  if (filter.filterType === 'ECLASS_TYPE') {
    const uri = filter.targetTypeUri || ''
    // Extract class name from URI (e.g., "http://example.org#//EAttribute" -> "EAttribute")
    const hashIndex = uri.lastIndexOf('#//')
    const className = hashIndex !== -1 ? uri.substring(hashIndex + 3) : uri
    const scopeSuffix = filter.scope === 'TYPE_AND_SUBTYPES' ? ' (+subtypes)' : ''
    return `Type: ${className}${scopeSuffix}`
  } else {
    // Element filter - show abbreviated path
    const uri = filter.elementUri || ''
    // Shorten long paths
    if (uri.length > 40) {
      return `Element: ...${uri.substring(uri.length - 37)}`
    }
    return `Element: ${uri}`
  }
}

/**
 * Get icon for filter type
 */
function getFilterIcon(filter: TreeFilterState): string {
  return filter.filterType === 'ECLASS_TYPE' ? 'pi pi-box' : 'pi pi-file'
}

/**
 * Handle perspective toggle
 */
function handlePerspectiveToggle() {
  if (!views.activeView.value) return

  if (views.activeView.value.showInActivityBar) {
    views.enableAsPerspective(
      views.activeView.value.id,
      views.activeView.value.perspectiveIcon || 'pi pi-filter'
    )
  } else {
    views.disableAsPerspective(views.activeView.value.id)
  }
}

/**
 * Handle icon change
 */
function handleIconChange() {
  if (!views.activeView.value || !views.activeView.value.showInActivityBar) return

  views.updatePerspectiveIcon(
    views.activeView.value.id,
    views.activeView.value.perspectiveIcon || 'pi pi-filter'
  )
}
</script>

<template>
  <div class="views-panel">
    <!-- Compact header with view selector -->
    <div class="panel-header">
      <Dropdown
        v-model="selectedViewId"
        :options="viewOptions"
        optionLabel="name"
        optionValue="id"
        placeholder="No View"
        class="view-dropdown"
      />
      <div class="header-actions">
        <Button
          icon="pi pi-plus"
          text
          rounded
          size="small"
          @click="showNewViewDialog = true"
          v-tooltip.bottom="'New View'"
        />
      </div>
    </div>

    <!-- Active view controls -->
    <div v-if="views.activeView.value" class="view-controls">
      <div class="view-info">
        <Checkbox
          :modelValue="views.activeView.value.enabled"
          @update:modelValue="handleToggleEnabled"
          binary
          inputId="view-enabled"
        />
        <label for="view-enabled" class="view-name">
          {{ views.activeView.value.name }}
        </label>
      </div>
      <div class="view-actions">
        <Button
          icon="pi pi-pencil"
          text
          rounded
          size="small"
          @click="handleStartEditName"
          v-tooltip.bottom="'Rename'"
        />
        <Button
          icon="pi pi-trash"
          text
          rounded
          size="small"
          severity="danger"
          @click="handleDeleteView"
          v-tooltip.bottom="'Delete View'"
        />
      </div>
    </div>

    <!-- Perspective configuration -->
    <div v-if="views.activeView.value" class="perspective-config">
      <div class="perspective-toggle">
        <Checkbox
          v-model="views.activeView.value.showInActivityBar"
          binary
          inputId="show-in-activity-bar"
          @update:modelValue="handlePerspectiveToggle"
        />
        <label for="show-in-activity-bar">Show in Activity Bar</label>
      </div>

      <div v-if="views.activeView.value.showInActivityBar" class="icon-selector">
        <label>Icon:</label>
        <Dropdown
          v-model="views.activeView.value.perspectiveIcon"
          :options="availableIcons"
          optionLabel="label"
          optionValue="value"
          placeholder="Select icon"
          class="icon-dropdown"
          @update:modelValue="handleIconChange"
        >
          <template #value="slotProps">
            <div v-if="slotProps.value" class="icon-option">
              <i :class="slotProps.value"></i>
              <span>{{ availableIcons.find(i => i.value === slotProps.value)?.label }}</span>
            </div>
            <span v-else>Select icon</span>
          </template>
          <template #option="slotProps">
            <div class="icon-option">
              <i :class="slotProps.option.value"></i>
              <span>{{ slotProps.option.label }}</span>
            </div>
          </template>
        </Dropdown>
      </div>
    </div>

    <!-- Filters list -->
    <div v-if="views.activeView.value" class="filters-section">
      <div class="section-header">
        <span>Hidden Items</span>
        <span class="filter-count">{{ views.activeView.value.filters.length }}</span>
      </div>

      <div v-if="views.activeView.value.filters.length === 0" class="empty-filters">
        <p>No filters defined</p>
        <p class="hint">Right-click on elements in the tree to hide them</p>
      </div>

      <div v-else class="filter-list">
        <div
          v-for="(filter, index) in views.activeView.value.filters"
          :key="index"
          class="filter-item"
          :class="{ 'filter-inactive': !filter.hidden }"
        >
          <Checkbox
            v-model="filter.hidden"
            binary
            @update:modelValue="views.toggleFilter(index)"
          />
          <i :class="getFilterIcon(filter)" class="filter-icon"></i>
          <span class="filter-label" :title="filter.targetTypeUri || filter.elementUri">
            {{ getFilterLabel(filter) }}
          </span>
          <Button
            icon="pi pi-times"
            text
            rounded
            size="small"
            class="remove-btn"
            @click="views.removeFilter(index)"
            v-tooltip.left="'Remove filter'"
          />
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <i class="pi pi-filter"></i>
      <p>No view selected</p>
      <p class="hint">Views let you hide parts of your model</p>
      <Button
        label="Create View"
        icon="pi pi-plus"
        size="small"
        @click="showNewViewDialog = true"
      />
    </div>

    <!-- New View Dialog -->
    <Dialog
      v-model:visible="showNewViewDialog"
      header="Create New View"
      :modal="true"
      :style="{ width: '350px' }"
    >
      <div class="dialog-content">
        <div class="field">
          <label for="new-view-name">View Name</label>
          <InputText
            id="new-view-name"
            v-model="newViewName"
            placeholder="My View"
            class="w-full"
            @keyup.enter="handleCreateView"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewViewDialog = false" />
        <Button label="Create" @click="handleCreateView" :disabled="!newViewName.trim()" />
      </template>
    </Dialog>

    <!-- Edit View Name Dialog -->
    <Dialog
      v-model:visible="showEditViewDialog"
      header="Rename View"
      :modal="true"
      :style="{ width: '350px' }"
    >
      <div class="dialog-content">
        <div class="field">
          <label for="edit-view-name">View Name</label>
          <InputText
            id="edit-view-name"
            v-model="editViewName"
            class="w-full"
            @keyup.enter="handleSaveEditName"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showEditViewDialog = false" />
        <Button label="Save" @click="handleSaveEditName" :disabled="!editViewName.trim()" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.views-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-ground);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-section);
}

.view-dropdown {
  flex: 1;
  min-width: 0;
}

.view-dropdown :deep(.p-dropdown) {
  width: 100%;
}

.header-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

.header-actions :deep(.p-button) {
  width: 28px;
  height: 28px;
  padding: 0;
}

.w-full {
  width: 100%;
}

.view-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-50);
}

.view-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.view-name {
  font-weight: 500;
  cursor: pointer;
}

.view-actions {
  display: flex;
  gap: 0.25rem;
}

.view-actions :deep(.p-button) {
  width: 24px;
  height: 24px;
  padding: 0;
}

.filters-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-color-secondary);
  background: var(--surface-100);
}

.filter-count {
  background: var(--surface-300);
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.625rem;
}

.empty-filters {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  text-align: center;
  color: var(--text-color-secondary);
}

.empty-filters .hint {
  font-size: 0.75rem;
  opacity: 0.7;
  margin-top: 0.25rem;
}

.filter-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border-radius: var(--border-radius);
  transition: background-color 0.15s;
}

.filter-item:hover {
  background: var(--surface-hover);
}

.filter-item.filter-inactive {
  opacity: 0.5;
}

.filter-icon {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.filter-label {
  flex: 1;
  font-size: 0.8125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-btn {
  opacity: 0;
  transition: opacity 0.15s;
}

.filter-item:hover .remove-btn {
  opacity: 1;
}

.remove-btn:deep(.p-button) {
  width: 20px;
  height: 20px;
  padding: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  color: var(--text-color-secondary);
  flex: 1;
}

.empty-state i {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state .hint {
  font-size: 0.875rem;
  opacity: 0.7;
  margin-bottom: 1rem;
}

.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field label {
  font-weight: 500;
  font-size: 0.875rem;
}

.perspective-config {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-50);
}

.perspective-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.perspective-toggle label {
  font-size: 0.875rem;
  cursor: pointer;
}

.icon-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.icon-selector label {
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
}

.icon-dropdown {
  flex: 1;
  min-width: 0;
}

.icon-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.icon-option i {
  width: 1rem;
  text-align: center;
}
</style>
