<script setup lang="ts">
/**
 * IconSettings Component
 *
 * UI for configuring icon mappings for EClasses.
 * Uses fennecui EditorConfig model for persistence.
 * Uses Model Browser to get available classes.
 */

import { ref, shallowRef, computed, onMounted, watch, inject } from 'tsm:vue'
import { Dialog } from 'tsm:primevue'
import { DataTable } from 'tsm:primevue'
import { Column } from 'tsm:primevue'
import { Dropdown } from 'tsm:primevue'
import { InputNumber } from 'tsm:primevue'
import { Button } from 'tsm:primevue'
import {
  getAllMappings,
  MappingScope,
  IconLibrary,
  type IconMapping
} from '../services/iconRegistry'
import IconPicker from './IconPicker.vue'
import type { SelectedIcon } from '../services/iconProviders'

// Get model registry via TSM service (avoids circular dependency with ui-model-browser)
const tsm = inject<any>('tsm')
const modelRegistry = tsm?.getService('ui.model-browser.composables')?.useSharedModelRegistry?.()
const editorConfigInjected = inject<any>('gene.editor.config', null)

// Get global EditorConfig service
interface EditorConfigService {
  iconMappings: { value: any[] }
  addIconMapping: (targetType: string, iconName: string, options?: any) => any
  removeIconMapping: (mapping: any) => boolean
  clearIconMappings: () => void
  initialized: { value: boolean }
  dirty: { value: boolean }
  workspaceFileEntry: { value: any }
  saveToFileSystem: (writeFileFn: (entry: any, content: string) => Promise<void>) => Promise<void>
}

function getEditorConfigService(): EditorConfigService | null {
  console.log('[IconSettings] getEditorConfigService, injected exists:', !!editorConfigInjected)
  return editorConfigInjected || null
}

const editorConfig = shallowRef<EditorConfigService | null>(null)
const saving = ref(false)

// Try to get the EditorConfig service, with retry for timing issues
function tryGetEditorConfig() {
  const service = getEditorConfigService()
  console.log('[IconSettings] tryGetEditorConfig, service:', !!service)
  if (service) {
    editorConfig.value = service
    console.log('[IconSettings] EditorConfig service found, initialized:', service.initialized?.value, 'service object:', service)
    return true
  }
  return false
}

onMounted(() => {
  // Try immediately
  if (!tryGetEditorConfig()) {
    // Retry a few times with delay (for module loading timing)
    let retries = 0
    const interval = setInterval(() => {
      retries++
      if (tryGetEditorConfig() || retries > 10) {
        clearInterval(interval)
      }
    }, 100)
  }
})

// Get file system for saving
function getFileSystem(): any {
  return tsm?.getService('gene.filesystem')
}

// Save changes to workspace file
async function handleSave() {
  console.log('[IconSettings] handleSave called')
  console.log('[IconSettings] fileEntry:', editorConfig.value?.workspaceFileEntry?.value)
  console.log('[IconSettings] fileSystem:', getFileSystem())

  if (!editorConfig.value?.workspaceFileEntry?.value) {
    console.warn('[IconSettings] No file entry available for saving')
    return
  }

  saving.value = true
  try {
    // Get the file system's writeTextFile function
    const fileSystem = getFileSystem()
    if (fileSystem?.writeTextFile) {
      console.log('[IconSettings] Calling saveToFileSystem...')
      await editorConfig.value.saveToFileSystem(fileSystem.writeTextFile)
      console.log('[IconSettings] Saved successfully')
    } else {
      console.warn('[IconSettings] File system not available')
    }
  } catch (e) {
    console.error('[IconSettings] Failed to save:', e)
  } finally {
    saving.value = false
  }
}

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

// Dialog visibility - also refresh EditorConfig when dialog opens
const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

// Watch for dialog opening to refresh EditorConfig
watch(() => props.visible, (isVisible) => {
  if (isVisible) {
    console.log('[IconSettings] Dialog opened, trying to get EditorConfig')
    if (!tryGetEditorConfig()) {
      // Retry a few times
      let retries = 0
      const interval = setInterval(() => {
        retries++
        console.log('[IconSettings] Retry', retries)
        if (tryGetEditorConfig() || retries > 20) {
          clearInterval(interval)
        }
      }, 100)
    }
  }
}, { immediate: true })

/**
 * Helper to get a feature value from EObject (supports both Impl and DynamicEObject)
 */
function getFeatureValue(obj: any, featureName: string): any {
  // Try property access first (generated Impl classes)
  if (obj[featureName] !== undefined) {
    return obj[featureName]
  }
  // Fall back to eGet for DynamicEObject
  if (typeof obj.eGet === 'function') {
    const eClass = obj.eClass()
    const feature = eClass?.getEStructuralFeature(featureName)
    if (feature) {
      return obj.eGet(feature)
    }
  }
  return undefined
}

// Current mappings - from EditorConfig if available, otherwise from iconRegistry
const mappings = computed(() => {
  if (editorConfig.value?.iconMappings?.value) {
    // Convert fennecui IconMapping to display format
    return editorConfig.value.iconMappings.value.map((m: any) => {
      const targetTypeUri = getFeatureValue(m, 'targetTypeUri') || ''
      const scope = getFeatureValue(m, 'scope')
      const priority = getFeatureValue(m, 'priority') || 0
      const iconObj = getFeatureValue(m, 'icon')

      // Get icon properties (icon is also an EObject)
      let iconLibrary = IconLibrary.PRIME_ICONS
      let iconName = ''
      if (iconObj) {
        const libValue = getFeatureValue(iconObj, 'library')
        iconLibrary = mapFennecLibrary(libValue?.toString())
        iconName = getFeatureValue(iconObj, 'name') || ''
      }

      return {
        targetType: targetTypeUri,
        scope: scope || MappingScope.TYPE_ONLY,
        priority: priority,
        icon: {
          library: iconLibrary,
          name: iconName
        },
        _original: m
      }
    })
  }
  return getAllMappings()
})

// Map fennecui IconLibrary enum to our local enum
function mapFennecLibrary(fennecLib: string | undefined): IconLibrary {
  if (!fennecLib) return IconLibrary.PRIME_ICONS
  if (fennecLib === 'MATERIAL_SYMBOLS') return IconLibrary.MATERIAL_SYMBOLS
  if (fennecLib === 'FONT_AWESOME') return IconLibrary.FONT_AWESOME
  if (fennecLib === 'CUSTOM') return IconLibrary.CUSTOM
  // For PrimeIcons stored as CUSTOM with pi- prefix
  return IconLibrary.PRIME_ICONS
}

// Map our local IconLibrary to fennecui (PrimeIcons -> CUSTOM with naming convention)
function mapToFennecLibrary(lib: IconLibrary): string {
  switch (lib) {
    case IconLibrary.MATERIAL_SYMBOLS: return 'MATERIAL_SYMBOLS'
    case IconLibrary.FONT_AWESOME: return 'FONT_AWESOME'
    case IconLibrary.CUSTOM: return 'CUSTOM'
    case IconLibrary.PRIME_ICONS:
    default: return 'CUSTOM' // PrimeIcons stored as CUSTOM
  }
}

// Available classes from Model Browser
// Uses nsURI#className format for unique identification
const availableClasses = computed(() => {
  const classes: { label: string; value: string; package: string; nsUri: string }[] = []
  for (const pkg of modelRegistry.allPackages.value) {
    const pkgName = pkg.ePackage.getName()
    const nsUri = pkg.ePackage.getNsURI()
    // Get all classifiers (EClasses)
    for (const classifier of pkg.ePackage.getEClassifiers()) {
      if ('getEAllStructuralFeatures' in classifier) {
        // It's an EClass
        const eClass = classifier as any
        const className = eClass.getName()
        // Use nsURI#className format for unique identification
        const typeUri = `${nsUri}#${className}`
        classes.push({
          label: className,
          value: typeUri,
          package: pkgName,
          nsUri: nsUri
        })
      }
    }
  }
  return classes.sort((a, b) => a.label.localeCompare(b.label))
})

// New mapping form
const newMapping = ref({
  targetType: '',
  icon: '',
  scope: MappingScope.TYPE_ONLY,
  priority: 20,
  library: IconLibrary.PRIME_ICONS
})

// Selected icon from IconPicker
const selectedIconFromPicker = ref<SelectedIcon | null>(null)
const iconPickerDialogVisible = ref(false)

// Handle icon selection from picker
function handleIconSelect(icon: SelectedIcon) {
  selectedIconFromPicker.value = icon
  // Extract icon name from CSS class (e.g., "pi pi-star" -> "star")
  const iconName = icon.iconName
  newMapping.value.icon = iconName
  // Close dialog
  iconPickerDialogVisible.value = false
}

// Open icon picker dialog
function openIconPicker() {
  iconPickerDialogVisible.value = true
}

// Scope options
const scopeOptions = [
  { label: 'Nur dieser Typ', value: MappingScope.TYPE_ONLY },
  { label: 'Typ und Subtypen', value: MappingScope.TYPE_AND_SUBTYPES }
]

// Library options
const libraryOptions = [
  { label: 'PrimeIcons (pi-*)', value: IconLibrary.PRIME_ICONS },
  { label: 'Material Symbols', value: IconLibrary.MATERIAL_SYMBOLS },
  { label: 'Font Awesome', value: IconLibrary.FONT_AWESOME },
  { label: 'Custom CSS', value: IconLibrary.CUSTOM }
]

// Note: commonIcons array removed - using IconPicker with PrimeIconsProvider now

// Add new mapping
async function addMapping() {
  console.log('[IconSettings] addMapping called:', newMapping.value)
  if (!newMapping.value.targetType || !newMapping.value.icon) return

  if (editorConfig.value) {
    // Use EditorConfig service (persisted to IndexedDB)
    const iconName = newMapping.value.library === IconLibrary.PRIME_ICONS
      ? `pi pi-${newMapping.value.icon}` // Store full CSS class for PrimeIcons
      : newMapping.value.icon

    console.log('[IconSettings] Adding icon mapping:', newMapping.value.targetType, '->', iconName)
    const result = editorConfig.value.addIconMapping(
      newMapping.value.targetType,
      iconName,
      {
        scope: newMapping.value.scope,
        priority: newMapping.value.priority,
        library: mapToFennecLibrary(newMapping.value.library)
      }
    )
    console.log('[IconSettings] addIconMapping result:', result)
    console.log('[IconSettings] Current mappings count:', editorConfig.value.iconMappings?.value?.length)

    // Auto-save after adding mapping
    await handleSave()
  } else {
    console.warn('[IconSettings] No editorConfig available for adding mapping')
  }

  // Reset form
  newMapping.value = {
    targetType: '',
    icon: '',
    scope: MappingScope.TYPE_ONLY,
    priority: 20,
    library: IconLibrary.PRIME_ICONS
  }
  selectedIconFromPicker.value = null
}

// Remove a mapping
async function removeMapping(mapping: any) {
  if (editorConfig.value && mapping._original) {
    editorConfig.value.removeIconMapping(mapping._original)
    // Auto-save after removing mapping
    await handleSave()
  }
}

// Format scope for display
function formatScope(scope: MappingScope | string): string {
  const scopeStr = typeof scope === 'string' ? scope : scope
  return scopeStr === MappingScope.TYPE_AND_SUBTYPES || scopeStr === 'TYPE_AND_SUBTYPES'
    ? 'Typ + Subtypen'
    : 'Nur Typ'
}

// Format library for display
function formatLibrary(library: IconLibrary | string): string {
  const lib = typeof library === 'string' ? library : library
  if (lib === IconLibrary.PRIME_ICONS || lib === 'PRIME_ICONS') return 'PrimeIcons'
  if (lib === IconLibrary.MATERIAL_SYMBOLS || lib === 'MATERIAL_SYMBOLS') return 'Material'
  if (lib === IconLibrary.FONT_AWESOME || lib === 'FONT_AWESOME') return 'FontAwesome'
  if (lib === IconLibrary.CUSTOM || lib === 'CUSTOM') return 'Custom'
  return String(lib)
}

// Format target type for display (extract class name from nsURI#className)
function formatTargetType(targetType: string): string {
  if (!targetType) return ''
  // If it contains #, extract the class name after #
  const hashIndex = targetType.lastIndexOf('#')
  if (hashIndex !== -1) {
    return targetType.substring(hashIndex + 1)
  }
  return targetType
}

// Get icon class for preview
function getIconClass(mapping: any): string {
  const icon = mapping.icon
  const iconName = icon?.name || ''

  // If it's already a full CSS class (e.g., "pi pi-star")
  if (iconName.startsWith('pi ') || iconName.startsWith('fa-')) {
    return iconName
  }

  switch (icon?.library) {
    case IconLibrary.PRIME_ICONS:
    case 'PRIME_ICONS':
      return `pi pi-${iconName}`
    case IconLibrary.MATERIAL_SYMBOLS:
    case 'MATERIAL_SYMBOLS':
      return `material-symbols-${icon?.variant || 'outlined'}`
    case IconLibrary.FONT_AWESOME:
    case 'FONT_AWESOME':
      return `fa-${icon?.variant || 'solid'} fa-${iconName}`
    case IconLibrary.CUSTOM:
    case 'CUSTOM':
      // Check if it's a PrimeIcon stored as CUSTOM
      if (iconName.startsWith('pi pi-')) {
        return iconName
      }
      return iconName
    default:
      return iconName
  }
}

// Check if EditorConfig is available
const hasEditorConfig = computed(() => {
  const result = !!editorConfig.value?.initialized?.value
  console.log('[IconSettings] hasEditorConfig computed:', result, 'editorConfig.value:', !!editorConfig.value, 'initialized:', editorConfig.value?.initialized?.value)
  return result
})

// Check if there are unsaved changes
const isDirty = computed(() => !!editorConfig.value?.dirty?.value)

// Check if we can save (have a file entry)
const canSave = computed(() => {
  const fileEntry = editorConfig.value?.workspaceFileEntry?.value
  console.log('[IconSettings] canSave computed, fileEntry:', fileEntry)
  return !!fileEntry
})
</script>

<template>
  <Dialog
    v-model:visible="dialogVisible"
    header="Icon Konfiguration"
    :modal="true"
    :style="{ width: '750px' }"
  >
    <!-- Status message when no workspace file is open -->
    <div v-if="!canSave && hasEditorConfig" class="status-message info">
      <i class="pi pi-info-circle"></i>
      <span>Öffne eine Workspace-Datei (.wsp) um Änderungen zu speichern.</span>
    </div>
    <!-- Status message when EditorConfig is not available -->
    <div v-if="!hasEditorConfig" class="status-message warning">
      <i class="pi pi-exclamation-triangle"></i>
      <span>EditorConfig nicht verfügbar.</span>
    </div>

    <!-- Add new mapping -->
    <div class="add-mapping-form">
      <h4>Neues Icon Mapping</h4>
      <div class="form-row">
        <div class="field">
          <label>Klasse</label>
          <Dropdown
            v-model="newMapping.targetType"
            :options="availableClasses"
            optionLabel="label"
            optionValue="value"
            placeholder="Klasse wählen..."
            filter
            showClear
            :emptyMessage="availableClasses.length === 0 ? 'Kein Modell geladen' : 'Keine Klasse gefunden'"
          >
            <template #option="{ option }">
              <div class="class-option">
                <span class="class-name">{{ option.label }}</span>
                <span class="package-name">{{ option.package }}</span>
              </div>
            </template>
          </Dropdown>
        </div>
        <div class="field">
          <label>Icon</label>
          <Button
            :label="newMapping.icon || 'Icon wählen'"
            :icon="newMapping.icon ? `pi pi-${newMapping.icon}` : 'pi pi-th-large'"
            severity="secondary"
            outlined
            class="icon-picker-button"
            @click="openIconPicker"
          />
        </div>
        <div class="field">
          <label>Scope</label>
          <Dropdown
            v-model="newMapping.scope"
            :options="scopeOptions"
            optionLabel="label"
            optionValue="value"
          />
        </div>
        <div class="field field-small">
          <label>Priorität</label>
          <InputNumber v-model="newMapping.priority" :min="0" :max="100" />
        </div>
        <div class="field-action">
          <Button
            icon="pi pi-plus"
            label="Hinzufügen"
            @click="addMapping"
            :disabled="!newMapping.targetType || !newMapping.icon"
          />
        </div>
      </div>
    </div>

    <!-- Existing mappings -->
    <div class="mappings-table">
      <h4>Aktuelle Mappings</h4>
      <DataTable :value="mappings" size="small" scrollable scrollHeight="300px">
        <Column header="Icon" style="width: 60px">
          <template #body="{ data }">
            <i :class="getIconClass(data)" style="font-size: 1.2rem"></i>
          </template>
        </Column>
        <Column header="Klasse">
          <template #body="{ data }">
            <span :title="data.targetType">{{ formatTargetType(data.targetType) }}</span>
          </template>
        </Column>
        <Column header="Scope" style="width: 120px">
          <template #body="{ data }">
            {{ formatScope(data.scope) }}
          </template>
        </Column>
        <Column field="priority" header="Prio" style="width: 60px"></Column>
        <Column header="Library" style="width: 100px">
          <template #body="{ data }">
            {{ formatLibrary(data.icon?.library) }}
          </template>
        </Column>
        <Column header="" style="width: 50px">
          <template #body="{ data }">
            <Button
              v-if="data._original"
              icon="pi pi-trash"
              text
              rounded
              severity="danger"
              size="small"
              @click="removeMapping(data)"
            />
          </template>
        </Column>
      </DataTable>
    </div>

    <template #footer>
      <div class="footer-left">
        <span v-if="isDirty" class="dirty-indicator">
          <i class="pi pi-circle-fill"></i> Ungespeicherte Änderungen
        </span>
      </div>
      <div class="footer-right">
        <Button
          v-if="canSave"
          :label="saving ? 'Speichern...' : 'Speichern'"
          icon="pi pi-save"
          :disabled="!isDirty || saving"
          :loading="saving"
          @click="handleSave"
        />
        <Button label="Schließen" severity="secondary" @click="dialogVisible = false" />
      </div>
    </template>
  </Dialog>

  <!-- Icon Picker Dialog -->
  <Dialog
    v-model:visible="iconPickerDialogVisible"
    header="Icon auswählen"
    :modal="true"
    :style="{ width: '500px' }"
  >
    <IconPicker
      v-model="selectedIconFromPicker"
      @select="handleIconSelect"
    />
  </Dialog>
</template>

<style scoped>
.status-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 1rem;
  border-radius: var(--border-radius);
}

.status-message.warning {
  background: var(--yellow-50);
  color: var(--yellow-700);
  border: 1px solid var(--yellow-200);
}

.status-message.info {
  background: var(--blue-50);
  color: var(--blue-700);
  border: 1px solid var(--blue-200);
}

.add-mapping-form {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--surface-50);
  border-radius: var(--border-radius);
}

.add-mapping-form h4 {
  margin: 0 0 1rem 0;
  font-size: 0.9rem;
  color: var(--text-color-secondary);
}

.form-row {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
  flex-wrap: wrap;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 120px;
}

.field-small {
  max-width: 80px;
  flex: 0;
}

.field-action {
  flex: 0;
}

.field label {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.mappings-table h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
  color: var(--text-color-secondary);
}

.icon-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.class-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.class-option .class-name {
  font-weight: 500;
}

.class-option .package-name {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

/* PrimeVue 4 DataTable Styles */
:deep(.p-datatable) {
  font-size: 0.875rem;
}

:deep(.p-datatable-table-container) {
  border: none;
}

/* PrimeVue 4 Dialog Styles */
:deep(.p-dialog-footer) {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-left {
  display: flex;
  align-items: center;
}

.footer-right {
  display: flex;
  gap: 0.5rem;
}

.dirty-indicator {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--orange-500);
}

.dirty-indicator i {
  font-size: 0.5rem;
}

/* Icon Picker Button */
.icon-picker-button {
  width: 100%;
  justify-content: flex-start;
  height: 2.5rem;
}

/* Align all form fields to same height */
.form-row :deep(.p-dropdown),
.form-row :deep(.p-inputnumber),
.form-row :deep(.p-button) {
  height: 2.5rem;
}
</style>
