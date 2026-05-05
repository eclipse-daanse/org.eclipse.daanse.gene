<template>
  <div class="icon-picker">
    <!-- Provider Tabs -->
    <div v-if="providers.length > 1" class="provider-tabs">
      <button
        v-for="provider in providers"
        :key="provider.id"
        class="provider-tab"
        :class="{ active: provider.id === activeProviderId }"
        @click="activeProviderId = provider.id"
      >
        {{ provider.name }}
      </button>
    </div>

    <!-- Search Bar -->
    <div class="search-bar">
      <div class="search-input-wrapper">
        <i class="pi pi-search search-icon" />
        <InputText
          v-model="searchQuery"
          placeholder="Icon suchen..."
          class="search-input"
        />
      </div>
      <button
        v-if="addCustomIcon"
        class="add-icon-btn"
        :class="{ active: showUploadForm }"
        title="Eigenes Icon hinzufügen"
        @click="toggleUploadForm"
      >
        <i :class="showUploadForm ? 'pi pi-times' : 'pi pi-plus'" />
      </button>
    </div>

    <!-- Upload form for custom icons -->
    <div v-if="showUploadForm && addCustomIcon" class="upload-form">
      <div class="upload-row">
        <label class="upload-file-label">
          <i class="pi pi-upload" />
          <span>{{ newCustomIcon.dataUrl ? 'Datei gewählt' : 'SVG / PNG wählen' }}</span>
          <input type="file" accept=".svg,.png,image/svg+xml,image/png" class="upload-file-input" @change="handleCustomIconFile" />
        </label>
        <img v-if="newCustomIcon.dataUrl" :src="newCustomIcon.dataUrl" class="upload-preview" alt="" />
      </div>
      <div class="upload-row">
        <input v-model="newCustomIcon.id" class="upload-input" placeholder="ID *" />
        <input v-model="newCustomIcon.label" class="upload-input" placeholder="Bezeichnung" />
        <input v-model="newCustomIcon.category" class="upload-input upload-input--sm" placeholder="Kategorie" />
        <button
          class="upload-submit"
          :disabled="!newCustomIcon.id || !newCustomIcon.dataUrl"
          @click="submitCustomIcon"
        >
          <i class="pi pi-check" />
        </button>
      </div>
    </div>

    <!-- Category Chips -->
    <div class="category-chips">
      <span
        class="category-chip"
        :class="{ active: activeCategory === null }"
        @click="activeCategory = null"
      >
        Alle
      </span>
      <span
        v-for="category in categories"
        :key="category"
        class="category-chip"
        :class="{ active: category === activeCategory }"
        @click="activeCategory = category"
      >
        {{ formatCategory(category) }}
      </span>
    </div>

    <!-- Icon Grid -->
    <div class="icon-grid-container">
      <div class="icon-grid">
        <div
          v-for="icon in filteredIcons"
          :key="icon.name"
          class="icon-item"
          :class="{ selected: isSelected(icon) }"
          :title="icon.label"
          @click="selectIcon(icon)"
        >
          <span v-if="isMaterialProvider" :class="getMaterialClass()" class="icon-display">{{ icon.name }}</span>
          <img v-else-if="isCustomProvider" :src="getCustomIconDataUrl(icon)" class="icon-display icon-display--img" :alt="icon.label" />
          <i v-else :class="getIconClass(icon)" class="icon-display" />
          <span class="icon-name">{{ icon.label }}</span>
        </div>
      </div>

      <div v-if="filteredIcons.length === 0" class="no-results">
        <i class="pi pi-search" />
        <span>Keine Icons gefunden</span>
      </div>
    </div>

    <!-- Selected Icon Info -->
    <div v-if="selectedIcon" class="selected-info">
      <span v-if="selectedIcon.providerId === 'material-symbols'" class="material-symbols-outlined selected-preview">{{ selectedIcon.iconName }}</span>
      <img v-else-if="selectedIcon.providerId === CUSTOM_ICONS_PROVIDER_ID" :src="selectedIconDef ? getCustomIconDataUrl(selectedIconDef) : ''" class="selected-preview selected-preview--img" :alt="selectedIcon.iconName" />
      <i v-else :class="selectedIcon.cssClass" class="selected-preview" />
      <div class="selected-details">
        <span class="selected-name">{{ selectedIconDef?.label || selectedIcon.iconName }}</span>
        <span class="selected-class">{{ selectedIcon.cssClass }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'tsm:vue'
import { InputText } from 'tsm:primevue'
import { iconProviderRegistry } from '../services/iconProviderRegistry'
import type { IconDefinition, IconProvider, SelectedIcon } from '../services/iconProviders'
import type { CustomIconEntry } from '../services/providers/CustomIconProvider'
import { CUSTOM_ICONS_PROVIDER_ID } from '../services/providers/CustomIconProvider'

const props = defineProps<{
  modelValue?: SelectedIcon | null
  addCustomIcon?: (options: CustomIconEntry) => void
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: SelectedIcon | null): void
  (e: 'select', value: SelectedIcon): void
}>()

// State
const searchQuery = ref('')
const activeProviderId = ref('')
const activeCategory = ref<string | null>(null)

// Custom icon upload form
const showUploadForm = ref(false)
const newCustomIcon = ref({ id: '', label: '', category: 'custom', dataUrl: '', keywords: '' })

function toggleUploadForm() {
  showUploadForm.value = !showUploadForm.value
  if (!showUploadForm.value) {
    newCustomIcon.value = { id: '', label: '', category: 'custom', dataUrl: '', keywords: '' }
  }
}

function handleCustomIconFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !['image/svg+xml', 'image/png'].includes(file.type)) return
  const reader = new FileReader()
  reader.onload = (e) => {
    newCustomIcon.value.dataUrl = e.target?.result as string
    if (!newCustomIcon.value.id) {
      newCustomIcon.value.id = file.name.replace(/\.[^.]+$/, '')
    }
  }
  reader.readAsDataURL(file)
}

function submitCustomIcon() {
  if (!newCustomIcon.value.id || !newCustomIcon.value.dataUrl) return
  props.addCustomIcon?.({ ...newCustomIcon.value })
  newCustomIcon.value = { id: '', label: '', category: 'custom', dataUrl: '', keywords: '' }
  showUploadForm.value = false
}

// Watch registry version for reactivity
const registryVersion = iconProviderRegistry.version

// Providers
const providers = computed<IconProvider[]>(() => {
  // Trigger reactivity
  void registryVersion.value
  return iconProviderRegistry.getAll()
})

// Active provider
const activeProvider = computed<IconProvider | null>(() => {
  if (!activeProviderId.value && providers.value.length > 0) {
    return providers.value[0]
  }
  return iconProviderRegistry.get(activeProviderId.value) || null
})

// Categories for active provider
const categories = computed<string[]>(() => {
  if (!activeProvider.value) return []
  return activeProvider.value.getCategories()
})

// Filtered icons
const filteredIcons = computed<IconDefinition[]>(() => {
  if (!activeProvider.value) return []

  let icons: IconDefinition[]

  // Start with category filter
  if (activeCategory.value) {
    icons = activeProvider.value.getIconsByCategory(activeCategory.value)
  } else {
    icons = activeProvider.value.getIcons()
  }

  // Apply search filter
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    icons = icons.filter((icon) => {
      return (
        icon.name.toLowerCase().includes(query) ||
        icon.label.toLowerCase().includes(query) ||
        icon.category.toLowerCase().includes(query) ||
        icon.keywords?.some((k) => k.toLowerCase().includes(query))
      )
    })
  }

  return icons
})

// Selected icon
const selectedIcon = computed<SelectedIcon | null>(() => props.modelValue || null)

const selectedIconDef = computed<IconDefinition | null>(() => {
  if (!selectedIcon.value || !activeProvider.value) return null
  return (
    activeProvider.value
      .getIcons()
      .find((i) => i.name === selectedIcon.value?.iconName) || null
  )
})

// Check if current provider is Material Symbols
const isMaterialProvider = computed(() => {
  return activeProvider.value?.id === 'material-symbols'
})

// Check if current provider is the custom icon provider
const isCustomProvider = computed(() => {
  return activeProvider.value?.id === CUSTOM_ICONS_PROVIDER_ID
})

function getCustomIconDataUrl(icon: IconDefinition): string | undefined {
  const provider = activeProvider.value as any
  return provider?.getDataUrl?.(icon.name)
}

// Methods
function getIconClass(icon: IconDefinition): string {
  if (!activeProvider.value) return ''
  return activeProvider.value.resolveIconClass(icon.name)
}

function getMaterialClass(): string {
  // Material Symbols default to outlined variant
  return 'material-symbols-outlined'
}

function isSelected(icon: IconDefinition): boolean {
  if (!selectedIcon.value) return false
  return (
    selectedIcon.value.providerId === activeProvider.value?.id &&
    selectedIcon.value.iconName === icon.name
  )
}

function selectIcon(icon: IconDefinition): void {
  if (!activeProvider.value) return

  const selected: SelectedIcon = {
    providerId: activeProvider.value.id,
    iconName: icon.name,
    cssClass: activeProvider.value.resolveIconClass(icon.name)
  }

  emit('update:modelValue', selected)
  emit('select', selected)
}

function formatCategory(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1)
}

// Initialize active provider
onMounted(() => {
  if (providers.value.length > 0 && !activeProviderId.value) {
    activeProviderId.value = providers.value[0].id
  }

  // If we have a selected icon, switch to its provider
  if (props.modelValue?.providerId) {
    activeProviderId.value = props.modelValue.providerId
  }
})

// Watch for provider changes to reset category
watch(activeProviderId, () => {
  activeCategory.value = null
})
</script>

<style scoped>
.icon-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

/* Provider Tabs */
.provider-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--surface-border);
  padding-bottom: 8px;
}

.provider-tab {
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 4px 4px 0 0;
  transition: all 0.15s;
}

.provider-tab:hover {
  background: var(--surface-hover);
  color: var(--text-color);
}

.provider-tab.active {
  background: var(--primary-100);
  color: var(--primary-700);
  font-weight: 500;
}

/* Search Bar */
.search-bar {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
}

.add-icon-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  color: var(--text-color-secondary);
  cursor: pointer;
  font-size: 0.75rem;
}
.add-icon-btn:hover,
.add-icon-btn.active {
  background: var(--surface-hover);
  color: var(--primary-color);
  border-color: var(--primary-color);
}

/* Inline upload form */
.upload-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  background: var(--surface-section);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
}

.upload-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.upload-file-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: var(--surface-b, var(--surface-ground));
  border: 1px dashed var(--surface-border);
  border-radius: 4px;
  font-size: 0.8rem;
  color: var(--text-color-secondary);
  cursor: pointer;
  flex: 1;
}
.upload-file-label:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}
.upload-file-input {
  display: none;
}

.upload-preview {
  width: 28px;
  height: 28px;
  object-fit: contain;
  border: 1px solid var(--surface-border);
  border-radius: 3px;
  padding: 2px;
  background: var(--surface-ground);
}

.upload-input {
  flex: 1;
  padding: 5px 8px;
  font-size: 0.8rem;
  background: var(--surface-b, var(--surface-ground));
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  color: var(--text-color);
  min-width: 0;
}
.upload-input:focus {
  outline: none;
  border-color: var(--primary-color);
}
.upload-input--sm {
  max-width: 90px;
}

.upload-submit {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  background: var(--primary-color);
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
}
.upload-submit:disabled {
  opacity: 0.4;
  cursor: default;
}

.search-input-wrapper {
  position: relative;
  flex: 1;
  min-width: 0;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-color-secondary);
  z-index: 1;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding-left: 36px !important;
}

/* Category Chips */
.category-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.category-chip {
  padding: 4px 10px;
  border-radius: 16px;
  background: var(--surface-100);
  color: var(--text-color-secondary);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.category-chip:hover {
  background: var(--surface-200);
  color: var(--text-color);
}

.category-chip.active {
  background: var(--primary-500);
  color: #ffffff;
  font-weight: 500;
}

/* Icon Grid */
.icon-grid-container {
  min-height: 200px;
  max-height: 350px;
  overflow-y: auto;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  background: var(--surface-ground);
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
  gap: 4px;
  padding: 8px;
}

.icon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  border: 2px solid transparent;
}

.icon-item:hover {
  background: var(--surface-hover);
}

.icon-item.selected {
  background: var(--primary-50);
  border-color: var(--primary-500);
}

.icon-item .icon-display {
  font-size: 1.4rem;
  margin-bottom: 4px;
  color: var(--text-color);
}

.icon-item .icon-display--img {
  width: 1.4rem;
  height: 1.4rem;
  object-fit: contain;
  font-size: unset;
}

/* Dark mode: invert monochrome custom icons */
:root.p-dark .icon-display--img,
.dark-theme .icon-display--img {
  filter: invert(0.85);
}

.icon-item.selected .icon-display {
  color: var(--primary-700);
}

/* Material Symbols specific */
.icon-item .material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-feature-settings: 'liga';
  font-feature-settings: 'liga';
}

.icon-name {
  font-size: 0.65rem;
  text-align: center;
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* No Results */
.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  color: var(--text-color-secondary);
}

.no-results i {
  font-size: 2rem;
  opacity: 0.5;
}

/* Selected Info */
.selected-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: var(--surface-100);
  border-radius: 6px;
}

.selected-preview {
  font-size: 1.8rem;
  color: var(--primary-600);
}

.selected-preview--img {
  width: 1.8rem;
  height: 1.8rem;
  object-fit: contain;
  font-size: unset;
}

:root.p-dark .selected-preview--img,
.dark-theme .selected-preview--img {
  filter: invert(0.85);
}

/* Upload form preview */
:root.p-dark .upload-preview,
.dark-theme .upload-preview {
  filter: invert(0.85);
}

.selected-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.selected-name {
  font-weight: 500;
  color: var(--text-color);
}

.selected-class {
  font-size: 0.75rem;
  font-family: monospace;
  color: var(--text-color-secondary);
}
</style>
