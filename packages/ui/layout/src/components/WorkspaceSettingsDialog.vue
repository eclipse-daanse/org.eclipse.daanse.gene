<script setup lang="ts">
/**
 * WorkspaceSettingsDialog - Workspace-specific settings panel
 *
 * Master-Detail view with categories on the left and settings on the right.
 */

import { computed, ref, shallowRef, triggerRef, watch, onMounted, onUnmounted, inject } from 'tsm:vue'
import { Dropdown } from 'tsm:primevue'
import { DataTable } from 'tsm:primevue'
import { Column } from 'tsm:primevue'
import { InputNumber } from 'tsm:primevue'
import { Button } from 'tsm:primevue'
import { useSharedPerspective, type StorageStrategy } from 'ui-perspectives'
import { useSharedModelRegistry } from 'ui-model-browser'
import {
  getAllMappings,
  MappingScope,
  IconLibrary
} from 'ui-instance-tree'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'close': []
}>()

const perspective = useSharedPerspective()
const modelRegistry = useSharedModelRegistry()
const tsm = inject<any>('tsm')
const editorConfigService = inject<any>('gene.editor.config', null)

const workspaceSettings = computed(() => perspective.state.workspaceSettings)

// === Master-Detail Navigation ===
type SettingsCategory = 'icons' | 'actions' | 'events' | 'storage' | 'resolvers'

const categories: { id: SettingsCategory; label: string; icon: string }[] = [
  { id: 'icons', label: 'Icon Mappings', icon: 'pi pi-palette' },
  { id: 'actions', label: 'Actions', icon: 'pi pi-play' },
  { id: 'events', label: 'Event Mappings', icon: 'pi pi-bolt' },
  { id: 'storage', label: 'Storage', icon: 'pi pi-database' },
  { id: 'resolvers', label: 'Package Resolvers', icon: 'pi pi-link' }
]

// Action components (loaded from TSM)
const actionComponents = computed(() => {
  return tsm?.getService('gene.action.components') || null
})
const EventMappingEditor = computed(() => actionComponents.value?.EventMappingEditor || null)
const ActionEditor = computed(() => actionComponents.value?.ActionEditor || null)

const selectedCategory = ref<SettingsCategory>('icons')

// === Storage Strategy ===
const storageStrategies: { value: StorageStrategy; label: string; description: string; icon: string }[] = [
  {
    value: 'single-file',
    label: 'Single File',
    description: 'All entities are stored in one file',
    icon: 'pi pi-file'
  },
  {
    value: 'file-per-entity',
    label: 'File per Entity',
    description: 'Each entity is stored in a separate file',
    icon: 'pi pi-copy'
  }
]

function setStorageStrategy(strategy: StorageStrategy) {
  perspective.updateWorkspaceSettings({ storageStrategy: strategy })
}

// === Icon Settings ===

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
  // Try inject first, then TSM service (different plugin scopes may have different inject values)
  return editorConfigService || tsm?.getService('gene.editor.config') || null
}

const editorConfig = shallowRef<EditorConfigService | null>(null)
const saving = ref(false)

function tryGetEditorConfig() {
  const service = getEditorConfigService()
  if (service) {
    editorConfig.value = service
    return true
  }
  return false
}

onMounted(() => {
  if (!tryGetEditorConfig()) {
    let retries = 0
    const interval = setInterval(() => {
      retries++
      if (tryGetEditorConfig() || retries > 10) {
        clearInterval(interval)
      }
    }, 100)
  }
})

watch(() => props.visible, (isVisible) => {
  if (isVisible) {
    if (!tryGetEditorConfig()) {
      let retries = 0
      const interval = setInterval(() => {
        retries++
        if (tryGetEditorConfig() || retries > 20) {
          clearInterval(interval)
        }
      }, 100)
    }
  }
}, { immediate: true })

function getFileSystem(): any {
  return tsm?.getService('gene.filesystem')
}

async function handleSave() {
  if (!editorConfig.value?.workspaceFileEntry?.value) {
    console.warn('[WorkspaceSettings] No workspace file entry, cannot save')
    return
  }

  saving.value = true
  try {
    const fileSystem = getFileSystem()
    console.log('[WorkspaceSettings] fileSystem:', !!fileSystem, 'writeTextFile:', !!fileSystem?.writeTextFile)
    if (fileSystem?.writeTextFile) {
      await editorConfig.value.saveToFileSystem(fileSystem.writeTextFile)
      isDirty.value = false
      console.log('[WorkspaceSettings] Saved successfully')
    }
  } catch (e) {
    console.error('[WorkspaceSettings] Failed to save:', e)
  } finally {
    saving.value = false
  }
}

function getFeatureValue(obj: any, featureName: string): any {
  if (obj[featureName] !== undefined) return obj[featureName]
  if (typeof obj.eGet === 'function') {
    const eClass = obj.eClass()
    const feature = eClass?.getEStructuralFeature(featureName)
    if (feature) return obj.eGet(feature)
  }
  return undefined
}

const mappings = computed(() => {
  if (editorConfig.value?.iconMappings?.value) {
    return editorConfig.value.iconMappings.value.map((m: any) => {
      const targetTypeUri = getFeatureValue(m, 'targetTypeUri') || ''
      const scope = getFeatureValue(m, 'scope')
      const priority = getFeatureValue(m, 'priority') || 0
      const iconObj = getFeatureValue(m, 'icon')

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
        icon: { library: iconLibrary, name: iconName },
        _original: m
      }
    })
  }
  return getAllMappings()
})

function mapFennecLibrary(fennecLib: string | undefined): IconLibrary {
  if (!fennecLib) return IconLibrary.PRIME_ICONS
  if (fennecLib === 'MATERIAL_SYMBOLS') return IconLibrary.MATERIAL_SYMBOLS
  if (fennecLib === 'FONT_AWESOME') return IconLibrary.FONT_AWESOME
  if (fennecLib === 'CUSTOM') return IconLibrary.CUSTOM
  return IconLibrary.PRIME_ICONS
}

function mapToFennecLibrary(lib: IconLibrary): string {
  switch (lib) {
    case IconLibrary.MATERIAL_SYMBOLS: return 'MATERIAL_SYMBOLS'
    case IconLibrary.FONT_AWESOME: return 'FONT_AWESOME'
    case IconLibrary.CUSTOM: return 'CUSTOM'
    default: return 'CUSTOM'
  }
}

const availableClasses = computed(() => {
  const classes: { label: string; value: string; package: string }[] = []
  for (const pkg of modelRegistry.allPackages.value) {
    const pkgName = pkg.ePackage.getName()
    const nsUri = pkg.ePackage.getNsURI()
    for (const classifier of pkg.ePackage.getEClassifiers()) {
      if ('getEAllStructuralFeatures' in classifier) {
        const eClass = classifier as any
        const className = eClass.getName()
        const typeUri = `${nsUri}#${className}`
        classes.push({ label: className, value: typeUri, package: pkgName })
      }
    }
  }
  return classes.sort((a, b) => a.label.localeCompare(b.label))
})

const newMapping = ref({
  targetType: '',
  icon: '',
  scope: MappingScope.TYPE_ONLY,
  priority: 20,
  library: IconLibrary.PRIME_ICONS
})

const scopeOptions = [
  { label: 'Nur dieser Typ', value: MappingScope.TYPE_ONLY },
  { label: 'Typ und Subtypen', value: MappingScope.TYPE_AND_SUBTYPES }
]

const commonIcons = [
  'circle', 'star', 'heart', 'user', 'users', 'home', 'folder', 'file',
  'calendar', 'clock', 'bell', 'envelope', 'comment', 'comments',
  'cog', 'wrench', 'database', 'server', 'cloud', 'code',
  'box', 'building', 'microphone', 'video', 'image', 'book'
]

function addMapping() {
  if (!newMapping.value.targetType || !newMapping.value.icon) return

  if (editorConfig.value) {
    const iconName = newMapping.value.library === IconLibrary.PRIME_ICONS
      ? `pi pi-${newMapping.value.icon}`
      : newMapping.value.icon

    editorConfig.value.addIconMapping(
      newMapping.value.targetType,
      iconName,
      {
        scope: newMapping.value.scope,
        priority: newMapping.value.priority,
        library: mapToFennecLibrary(newMapping.value.library)
      }
    )
  }

  newMapping.value = {
    targetType: '',
    icon: '',
    scope: MappingScope.TYPE_ONLY,
    priority: 20,
    library: IconLibrary.PRIME_ICONS
  }
}

function removeMapping(mapping: any) {
  if (editorConfig.value && mapping._original) {
    editorConfig.value.removeIconMapping(mapping._original)
  }
}

function formatScope(scope: MappingScope | string): string {
  return scope === MappingScope.TYPE_AND_SUBTYPES || scope === 'TYPE_AND_SUBTYPES'
    ? 'Typ + Sub'
    : 'Nur Typ'
}

function formatTargetType(targetType: string): string {
  if (!targetType) return ''
  const hashIndex = targetType.lastIndexOf('#')
  return hashIndex !== -1 ? targetType.substring(hashIndex + 1) : targetType
}

function getIconClass(mapping: any): string {
  const icon = mapping.icon
  const iconName = icon?.name || ''

  if (iconName.startsWith('pi ') || iconName.startsWith('fa-')) return iconName

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
      return iconName.startsWith('pi pi-') ? iconName : iconName
    default:
      return iconName
  }
}

const hasEditorConfig = computed(() => !!editorConfig.value?.initialized?.value)
// Access dirty ref directly — editorConfigService.dirty is a Vue Ref
const isDirty = computed(() => !!editorConfig.value?.dirty?.value)
const canSave = computed(() => !!editorConfig.value?.workspaceFileEntry?.value)

// === Package Resolvers ===

const resolverKindOptions = [
  { label: 'Local Registry', value: 'LOCAL' },
  { label: 'Model Atlas', value: 'MODEL_ATLAS' }
]

const newResolver = ref({
  name: '',
  kind: 'MODEL_ATLAS' as string,
  baseUrl: '',
  scopeName: '',
  stage: 'release',
  token: ''
})

const resolversList = computed(() => {
  const ec = editorConfig.value as any
  if (!ec) return []

  const chain = ec.packageResolverChain?.value
  if (!chain) return []

  const rawChain = chain.__v_raw || chain
  let resolvers = rawChain.resolvers
  if (resolvers === undefined && typeof rawChain.eGet === 'function') {
    const eClass = rawChain.eClass()
    const feature = eClass?.getEStructuralFeature('resolvers')
    if (feature) resolvers = rawChain.eGet(feature)
  }

  if (!resolvers) return []
  const arr = typeof resolvers.toArray === 'function' ? resolvers.toArray() : resolvers
  return Array.from(arr).map((r: any, index: number) => ({
    index,
    name: getFeatureValue(r, 'name') || '',
    kind: getFeatureValue(r, 'kind') || 'LOCAL',
    enabled: getFeatureValue(r, 'enabled') ?? true,
    baseUrl: getFeatureValue(r, 'baseUrl') || '',
    scopeName: getFeatureValue(r, 'scopeName') || '',
    stage: getFeatureValue(r, 'stage') || 'release',
    token: getFeatureValue(r, 'token') || '',
    _original: r
  }))
})

const autoResolveReferences = computed(() => {
  const ec = editorConfig.value as any
  if (!ec) return true
  const chain = ec.packageResolverChain?.value
  if (!chain) return true
  const rawChain = chain.__v_raw || chain
  return getFeatureValue(rawChain, 'autoResolveReferences') ?? true
})

const maxResolutionDepth = computed(() => {
  const ec = editorConfig.value as any
  if (!ec) return -1
  const chain = ec.packageResolverChain?.value
  if (!chain) return -1
  const rawChain = chain.__v_raw || chain
  return getFeatureValue(rawChain, 'maxResolutionDepth') ?? -1
})

function addResolver() {
  const ec = editorConfig.value as any
  if (!ec?.addPackageResolver) return

  ec.addPackageResolver({
    name: newResolver.value.name || (newResolver.value.kind === 'MODEL_ATLAS' ? 'Atlas Server' : 'Local'),
    kind: newResolver.value.kind,
    enabled: true,
    baseUrl: newResolver.value.baseUrl || undefined,
    scopeName: newResolver.value.scopeName || undefined,
    stage: newResolver.value.stage || 'release',
    token: newResolver.value.token || undefined
  })

  // Reset form
  newResolver.value = { name: '', kind: 'MODEL_ATLAS', baseUrl: '', scopeName: '', stage: 'release', token: '' }
}

function removeResolver(index: number) {
  const ec = editorConfig.value as any
  if (!ec?.removePackageResolver) return
  ec.removePackageResolver(index)
}

function toggleResolver(resolver: any) {
  const raw = resolver._original
  if (!raw) return
  const current = getFeatureValue(raw, 'enabled') ?? true
  if (typeof raw.eSet === 'function') {
    const eClass = raw.eClass()
    const feature = eClass?.getEStructuralFeature('enabled')
    if (feature) raw.eSet(feature, !current)
  } else {
    raw.enabled = !current
  }
  const ec = editorConfig.value as any
  if (ec?.markDirty) ec.markDirty()
}

function formatKind(kind: string): string {
  return kind === 'MODEL_ATLAS' ? 'Model Atlas' : 'Local'
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="settings-overlay" @click.self="emit('close')">
      <div class="settings-dialog">
        <!-- Header -->
        <div class="settings-header">
          <span class="settings-title">Workspace Settings</span>
          <button class="close-btn" @click="emit('close')">
            <i class="pi pi-times"></i>
          </button>
        </div>

        <div class="settings-body">
          <!-- Master: Category List -->
          <div class="settings-master">
            <button
              v-for="cat in categories"
              :key="cat.id"
              class="category-item"
              :class="{ active: selectedCategory === cat.id }"
              @click="selectedCategory = cat.id"
            >
              <i :class="cat.icon"></i>
              <span>{{ cat.label }}</span>
            </button>
          </div>

          <!-- Detail: Settings Content -->
          <div class="settings-detail">
            <!-- Icon Mappings -->
            <div v-if="selectedCategory === 'icons'" class="detail-content">
              <h3 class="detail-title">Icon Mappings</h3>
              <p class="detail-description">Configure custom icons for EClasses in the instance tree.</p>

              <!-- Status messages -->
              <div v-if="!canSave && hasEditorConfig" class="status-message info">
                <i class="pi pi-info-circle"></i>
                <span>Open a workspace file (.wsp) to save changes.</span>
              </div>
              <div v-if="!hasEditorConfig" class="status-message warning">
                <i class="pi pi-exclamation-triangle"></i>
                <span>EditorConfig not available.</span>
              </div>

              <!-- Add new mapping -->
              <div class="add-mapping-form">
                <div class="form-row">
                  <div class="field">
                    <label>Class</label>
                    <Dropdown
                      v-model="newMapping.targetType"
                      :options="availableClasses"
                      optionLabel="label"
                      optionValue="value"
                      placeholder="Select class..."
                      filter
                      showClear
                      :emptyMessage="availableClasses.length === 0 ? 'No model loaded' : 'No class found'"
                    >
                      <template #option="{ option }">
                        <div class="class-option">
                          <span class="class-name">{{ option.label }}</span>
                          <span class="package-name">{{ option.package }}</span>
                        </div>
                      </template>
                    </Dropdown>
                  </div>
                  <div class="field field-icon">
                    <label>Icon</label>
                    <Dropdown
                      v-model="newMapping.icon"
                      :options="commonIcons"
                      placeholder="Icon..."
                      editable
                      filter
                    >
                      <template #option="{ option }">
                        <div class="icon-option">
                          <i :class="`pi pi-${option}`"></i>
                          <span>{{ option }}</span>
                        </div>
                      </template>
                      <template #value="{ value }">
                        <div v-if="value" class="icon-option">
                          <i :class="`pi pi-${value}`"></i>
                          <span>{{ value }}</span>
                        </div>
                        <span v-else>Icon...</span>
                      </template>
                    </Dropdown>
                  </div>
                </div>
                <div class="form-row">
                  <div class="field">
                    <label>Scope</label>
                    <Dropdown
                      v-model="newMapping.scope"
                      :options="scopeOptions"
                      optionLabel="label"
                      optionValue="value"
                    />
                  </div>
                  <div class="field field-prio">
                    <label>Priority</label>
                    <InputNumber v-model="newMapping.priority" :min="0" :max="100" />
                  </div>
                  <div class="field-action">
                    <Button
                      icon="pi pi-plus"
                      label="Add"
                      @click="addMapping"
                      :disabled="!newMapping.targetType || !newMapping.icon"
                    />
                  </div>
                </div>
              </div>

              <!-- Existing mappings -->
              <div class="mappings-table" v-if="mappings.length > 0">
                <DataTable :value="mappings" size="small" scrollable scrollHeight="250px">
                  <Column header="" style="width: 40px">
                    <template #body="{ data }">
                      <i :class="getIconClass(data)" style="font-size: 1.1rem"></i>
                    </template>
                  </Column>
                  <Column header="Class">
                    <template #body="{ data }">
                      <span :title="data.targetType">{{ formatTargetType(data.targetType) }}</span>
                    </template>
                  </Column>
                  <Column header="Scope" style="width: 90px">
                    <template #body="{ data }">
                      {{ formatScope(data.scope) }}
                    </template>
                  </Column>
                  <Column field="priority" header="Prio" style="width: 50px"></Column>
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
              <div v-else class="empty-hint">
                No icon mappings configured yet.
              </div>
            </div>

            <!-- Actions -->
            <div v-if="selectedCategory === 'actions'" class="detail-content">
              <h3 class="detail-title">Actions</h3>
              <p class="detail-description">Configure actions that appear in context menus. Map handlers to object types.</p>
              <component
                v-if="ActionEditor"
                :is="ActionEditor"
                @dirty="triggerRef(editorConfig)"
              />
              <div v-else class="empty-state">
                <i class="pi pi-info-circle"></i>
                Action System module not loaded.
              </div>
            </div>

            <!-- Event-Action Mappings -->
            <div v-if="selectedCategory === 'events'" class="detail-content">
              <h3 class="detail-title">Event-Action Mappings</h3>
              <p class="detail-description">Configure automated actions triggered by events (model changes, lifecycle, plugins).</p>
              <component
                v-if="EventMappingEditor"
                :is="EventMappingEditor"
                @dirty="triggerRef(editorConfig)"
              />
              <div v-else class="empty-state">
                <i class="pi pi-info-circle"></i>
                Action System module not loaded.
              </div>
            </div>

            <!-- Storage Strategy -->
            <div v-if="selectedCategory === 'storage'" class="detail-content">
              <h3 class="detail-title">Storage Strategy</h3>
              <p class="detail-description">Choose how model data is stored in the workspace.</p>

              <div class="strategy-options">
                <button
                  v-for="strategy in storageStrategies"
                  :key="strategy.value"
                  class="strategy-btn"
                  :class="{ active: workspaceSettings.storageStrategy === strategy.value }"
                  @click="setStorageStrategy(strategy.value)"
                >
                  <i :class="strategy.icon"></i>
                  <div class="strategy-info">
                    <span class="strategy-label">{{ strategy.label }}</span>
                    <span class="strategy-desc">{{ strategy.description }}</span>
                  </div>
                </button>
              </div>
            </div>

            <!-- Package Resolvers -->
            <div v-if="selectedCategory === 'resolvers'" class="detail-content">
              <h3 class="detail-title">Package Resolvers</h3>
              <p class="detail-description">Configure where imported EPackages are resolved from. Resolvers are tried in order.</p>

              <!-- Status -->
              <div v-if="!hasEditorConfig" class="status-message warning">
                <i class="pi pi-exclamation-triangle"></i>
                <span>EditorConfig not available.</span>
              </div>

              <!-- Add new resolver form -->
              <div class="add-mapping-form">
                <div class="form-row">
                  <div class="field">
                    <label>Kind</label>
                    <Dropdown
                      v-model="newResolver.kind"
                      :options="resolverKindOptions"
                      optionLabel="label"
                      optionValue="value"
                    />
                  </div>
                  <div class="field">
                    <label>Name</label>
                    <input
                      v-model="newResolver.name"
                      class="resolver-input"
                      placeholder="e.g. Company Atlas"
                    />
                  </div>
                </div>
                <template v-if="newResolver.kind === 'MODEL_ATLAS'">
                  <div class="form-row">
                    <div class="field">
                      <label>Server URL</label>
                      <input
                        v-model="newResolver.baseUrl"
                        class="resolver-input"
                        placeholder="http://localhost:8185/rest"
                      />
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="field">
                      <label>Scope</label>
                      <input
                        v-model="newResolver.scopeName"
                        class="resolver-input"
                        placeholder="main"
                      />
                    </div>
                    <div class="field">
                      <label>Stage</label>
                      <input
                        v-model="newResolver.stage"
                        class="resolver-input"
                        placeholder="release"
                      />
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="field">
                      <label>Token (optional)</label>
                      <input
                        v-model="newResolver.token"
                        class="resolver-input"
                        type="password"
                        placeholder="Bearer token"
                      />
                    </div>
                  </div>
                </template>
                <div class="form-row">
                  <div class="field-action">
                    <Button
                      icon="pi pi-plus"
                      label="Add Resolver"
                      @click="addResolver"
                      :disabled="newResolver.kind === 'MODEL_ATLAS' && (!newResolver.baseUrl || !newResolver.scopeName)"
                    />
                  </div>
                </div>
              </div>

              <!-- Chain settings -->
              <div v-if="resolversList.length > 0" class="chain-settings">
                <div class="chain-info">
                  <span class="chain-label">Auto-Resolve:</span>
                  <span :class="autoResolveReferences ? 'badge-on' : 'badge-off'">
                    {{ autoResolveReferences ? 'On' : 'Off' }}
                  </span>
                  <span class="chain-label" style="margin-left: 16px;">Max Depth:</span>
                  <span class="chain-value">{{ maxResolutionDepth === -1 ? 'Unlimited' : maxResolutionDepth }}</span>
                </div>
              </div>

              <!-- Existing resolvers -->
              <div class="resolvers-list" v-if="resolversList.length > 0">
                <div
                  v-for="(resolver, idx) in resolversList"
                  :key="idx"
                  class="resolver-item"
                  :class="{ disabled: !resolver.enabled }"
                >
                  <div class="resolver-header">
                    <div class="resolver-left">
                      <span class="resolver-order">{{ idx + 1 }}</span>
                      <i :class="resolver.kind === 'MODEL_ATLAS' ? 'pi pi-globe' : 'pi pi-folder'"></i>
                      <span class="resolver-name">{{ resolver.name || formatKind(resolver.kind) }}</span>
                      <span class="resolver-kind-badge">{{ formatKind(resolver.kind) }}</span>
                    </div>
                    <div class="resolver-actions">
                      <Button
                        :icon="resolver.enabled ? 'pi pi-eye' : 'pi pi-eye-slash'"
                        text
                        rounded
                        size="small"
                        :severity="resolver.enabled ? 'secondary' : 'warning'"
                        @click="toggleResolver(resolver)"
                        v-tooltip.top="resolver.enabled ? 'Disable' : 'Enable'"
                      />
                      <Button
                        icon="pi pi-trash"
                        text
                        rounded
                        severity="danger"
                        size="small"
                        @click="removeResolver(idx)"
                      />
                    </div>
                  </div>
                  <div v-if="resolver.kind === 'MODEL_ATLAS'" class="resolver-details">
                    <span class="resolver-url">{{ resolver.baseUrl }}</span>
                    <span class="resolver-sep">/</span>
                    <span class="resolver-scope">{{ resolver.scopeName }}</span>
                    <span class="resolver-sep">@</span>
                    <span class="resolver-stage">{{ resolver.stage }}</span>
                  </div>
                </div>
              </div>
              <div v-else class="empty-hint">
                No package resolvers configured. Local registry is always used as default.
              </div>
            </div>
          </div>
        </div>

        <!-- Footer with Save button -->
        <div class="settings-footer">
          <div class="footer-left">
            <span v-if="isDirty" class="dirty-indicator">
              <i class="pi pi-circle-fill"></i> Unsaved changes
            </span>
          </div>
          <div class="footer-right">
            <Button
              label="Cancel"
              text
              size="small"
              @click="emit('close')"
            />
            <Button
              :label="saving ? 'Saving...' : 'Save'"
              icon="pi pi-save"
              size="small"
              :disabled="saving || !isDirty"
              :loading="saving"
              @click="handleSave"
            />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-dialog {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  width: 900px;
  max-width: 90vw;
  height: 650px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--surface-border);
  flex-shrink: 0;
}

.settings-title {
  font-size: 0.875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-color);
}

.close-btn {
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

.close-btn:hover {
  color: var(--text-color);
  background: var(--surface-hover);
}

/* Master-Detail Layout */
.settings-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.settings-master {
  width: 180px;
  flex-shrink: 0;
  border-right: 1px solid var(--surface-border);
  background: var(--surface-ground);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s ease;
  text-align: left;
  font-size: 0.875rem;
}

.category-item:hover {
  color: var(--text-color);
  background: var(--surface-hover);
}

.category-item.active {
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 12%, var(--surface-card));
  font-weight: 600;
}

.category-item i {
  font-size: 1rem;
  width: 20px;
  text-align: center;
}

.settings-detail {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
}

.detail-description {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
}

/* Status messages */
.status-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8125rem;
}

.status-message.warning {
  background: color-mix(in srgb, var(--yellow-500) 15%, transparent);
  color: var(--yellow-600);
}

.status-message.info {
  background: color-mix(in srgb, var(--blue-500) 15%, transparent);
  color: var(--blue-600);
}

/* Add mapping form */
.add-mapping-form {
  padding: 12px;
  background: var(--surface-ground);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.field label {
  font-size: 0.7rem;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.field-icon {
  flex: 0.6;
}

.field.field-prio {
  flex: 0 0 100px;
  min-width: 100px;
}

.field.field-prio :deep(.p-inputnumber),
.field.field-prio :deep(.p-inputnumber-input) {
  width: 100%;
}

.field-action {
  flex: 0 0 auto;
  min-width: fit-content;
}

.field-action :deep(.p-button) {
  height: 2.375rem;
}

.class-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 8px;
}

.class-option .class-name {
  font-weight: 500;
}

.class-option .package-name {
  font-size: 0.7rem;
  color: var(--text-color-secondary);
}

.icon-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Mappings table */
.mappings-table {
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  overflow: hidden;
}

:deep(.p-datatable) {
  font-size: 0.8125rem;
  background: var(--surface-card);
}

:deep(.p-datatable .p-datatable-thead > tr > th) {
  padding: 0.5rem;
  font-size: 0.75rem;
  background: #e8e8e8;
  color: var(--text-color);
  border-color: var(--surface-border);
}

:deep(.p-datatable .p-datatable-tbody > tr) {
  background: var(--surface-card);
  color: var(--text-color);
}

:deep(.p-datatable .p-datatable-tbody > tr:hover) {
  background: var(--surface-hover);
}

:deep(.p-datatable .p-datatable-tbody > tr > td) {
  padding: 0.4rem 0.5rem;
  border-color: var(--surface-border);
}

.empty-hint {
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
  font-style: italic;
  padding: 12px 0;
}

/* Dialog Footer */
.settings-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-top: 1px solid var(--surface-border);
  background: #e8e8e8;
  flex-shrink: 0;
}

.footer-left {
  display: flex;
  align-items: center;
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
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

/* Strategy options */
.strategy-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.strategy-btn {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--surface-border);
  background: var(--surface-ground);
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s ease;
  text-align: left;
}

.strategy-btn:hover {
  color: var(--text-color);
  background: var(--surface-hover);
}

.strategy-btn.active {
  color: var(--primary-color);
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 10%, var(--surface-ground));
}

.strategy-btn > i {
  font-size: 1.5rem;
  margin-top: 2px;
  flex-shrink: 0;
}

.strategy-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.strategy-label {
  font-size: 0.9375rem;
  font-weight: 600;
}

.strategy-desc {
  font-size: 0.8125rem;
  opacity: 0.8;
}

/* Resolver styles */
.resolver-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  background: var(--surface-card);
  color: var(--text-color);
  font-size: 0.8125rem;
  outline: none;
  transition: border-color 0.15s ease;
}

.resolver-input:focus {
  border-color: var(--primary-color);
}

.resolver-input::placeholder {
  color: var(--text-color-secondary);
  opacity: 0.6;
}

.chain-settings {
  padding: 8px 12px;
  background: var(--surface-ground);
  border-radius: 6px;
  font-size: 0.8125rem;
}

.chain-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chain-label {
  color: var(--text-color-secondary);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.chain-value {
  color: var(--text-color);
  font-weight: 500;
}

.badge-on {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 600;
  background: color-mix(in srgb, var(--green-500) 20%, transparent);
  color: var(--green-600);
}

.badge-off {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 600;
  background: color-mix(in srgb, var(--red-500) 20%, transparent);
  color: var(--red-500);
}

.resolvers-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.resolver-item {
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  padding: 10px 14px;
  background: var(--surface-card);
  transition: opacity 0.15s ease;
}

.resolver-item.disabled {
  opacity: 0.5;
}

.resolver-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.resolver-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.resolver-order {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  color: var(--primary-color);
  font-size: 0.7rem;
  font-weight: 700;
  flex-shrink: 0;
}

.resolver-name {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-color);
}

.resolver-kind-badge {
  font-size: 0.65rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--surface-ground);
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.resolver-actions {
  display: flex;
  gap: 2px;
}

.resolver-details {
  margin-top: 6px;
  padding-left: 30px;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.resolver-url {
  font-family: monospace;
}

.resolver-sep {
  opacity: 0.4;
}

.resolver-scope {
  font-weight: 500;
  color: var(--text-color);
}

.resolver-stage {
  font-style: italic;
}
</style>

<style>
/* Dark mode overrides (unscoped for Teleport) */
.dark-theme .settings-dialog .p-datatable .p-datatable-thead > tr > th {
  background: #535353 !important;
}

.dark-theme .settings-dialog .settings-footer {
  background: #323232 !important;
}
</style>
