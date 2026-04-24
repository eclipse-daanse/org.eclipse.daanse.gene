<script setup lang="ts">
/**
 * ReferenceField Component
 *
 * Renders controls for EReference values.
 * - Single reference: Dropdown/Button to select
 * - Multi reference: List with add/remove
 * - Containment: Create new button (with subclass selection for abstract types)
 */

import { computed, ref, watch, onMounted } from 'tsm:vue'
import { Button } from 'tsm:primevue'
import { Dropdown } from 'tsm:primevue'
import { Menu } from 'tsm:primevue'
import type { EObject, EReference, EClass } from '@emfts/core'
import { isMany, isRequired } from '../types'

/** Option with OCL filter status */
interface ReferenceOption {
  label: string
  value: EObject
  disabled: boolean
  oclReason?: string
}

const props = defineProps<{
  feature: EReference
  value: any
  readonly?: boolean
  error?: string
  /** Available objects for non-containment references */
  availableObjects?: EObject[]
  /** Available concrete classes for containment (includes subclasses of abstract types) */
  validChildClasses?: EClass[]
  /** OCL referenceFilter expression (uses 'target' for candidate) */
  oclFilter?: string
  /** Source object for OCL context ('self' in expression) */
  sourceObject?: EObject
  /** Problems service for OCL evaluation */
  problemsService?: {
    query: (obj: EObject, expression: string) => Promise<unknown>
  }
}>()

const emit = defineEmits<{
  'update:value': [value: any]
  'create': [eClass: EClass]
  'select': [eObject: EObject]
  'navigate': [eObject: EObject]
  'search': [feature: EReference, callback: (obj: EObject) => void]
  'ocl-blocked': [object: EObject, reason: string]
}>()

// Is this a many-valued reference?
const isManyValued = computed(() => isMany(props.feature))

// Is this a containment reference?
const isContainment = computed(() => props.feature.isContainment())

// Get the referenced type - handles both native EReference and DynamicEObject
const referenceType = computed(() => {
  const ref = props.feature
  // Try native getEReferenceType first
  if (typeof ref.getEReferenceType === 'function') {
    try {
      return ref.getEReferenceType()
    } catch {
      // Fall through to alternative
    }
  }
  // Fallback: use getEType (more general)
  if (typeof ref.getEType === 'function') {
    const eType = ref.getEType()
    if (eType && typeof (eType as any).getEAllStructuralFeatures === 'function') {
      return eType as EClass
    }
  }
  return null
})

// Format value for display
const displayValue = computed(() => {
  if (!props.value) return 'Not set'

  if (isManyValued.value) {
    const list = props.value as EObject[]
    if (!list || list.length === 0) return 'Empty'
    return `${list.length} item(s)`
  }

  // Single value
  const obj = props.value as EObject
  return getObjectDisplayName(obj)
})

// Format feature name for display
const displayName = computed(() => {
  const name = props.feature.getName()
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
})

// Has opposite (back-reference)?
const hasOpposite = computed(() => {
  return props.feature.getEOpposite() != null
})

// Get display name for an EObject
function getObjectDisplayName(obj: EObject): string {
  // Check if object is an unresolved proxy
  if (obj.eIsProxy?.()) {
    const proxyURI = (obj as any).eProxyURI?.()
    if (proxyURI) {
      // Extract class name from proxy URI (e.g., "http://...#//ClassName" -> "ClassName")
      const fragment = String(proxyURI).split('#//').pop() || 'Proxy'
      return `[Unresolved: ${fragment}]`
    }
    return '[Unresolved Proxy]'
  }

  try {
    const eClass = obj.eClass()
    // Try to get 'name' attribute via eGet
    const nameFeature = eClass.getEStructuralFeature('name')
    if (nameFeature) {
      const name = obj.eGet(nameFeature)
      if (name) return String(name)
    }
    // Fallback to class name
    return `[${eClass.getName()}]`
  } catch (e) {
    // Handle any proxy-related errors gracefully
    return '[Unresolved]'
  }
}

// OCL filter state
const oclFilteredOptions = ref<Map<EObject, { disabled: boolean; reason?: string }>>(new Map())
const isEvaluatingOcl = ref(false)

/**
 * Transform OCL referenceFilter expression: replace 'target' with 'self'
 */
function transformOclExpression(expression: string): string {
  return expression.replace(/\btarget\b/g, 'self')
}

/**
 * Evaluate OCL filter for all available objects
 */
async function evaluateOclFilter() {
  if (!props.oclFilter || !props.problemsService?.query || !props.availableObjects) {
    oclFilteredOptions.value = new Map()
    return
  }

  isEvaluatingOcl.value = true
  const results = new Map<EObject, { disabled: boolean; reason?: string }>()

  const sourceObj = props.sourceObject
  if (!sourceObj) {
    oclFilteredOptions.value = new Map()
    isEvaluatingOcl.value = false
    return
  }

  // The REFERENCE_FILTER expression uses 'self' for the owner (e.g. Student)
  // and 'target' for the candidate (e.g. Kurs).
  // We evaluate the expression on the sourceObject (self=Student).
  // To handle 'target', we replace it with a navigation path that identifies
  // each candidate uniquely. For objects with a 'name' attribute, we use:
  //   target  →  oclContainer().kurse->any(x | x.name = 'Informatik')
  // But this is fragile. Instead, we use the simpler approach:
  // evaluate the expression on sourceObject and check each candidate.

  // Collect the valid set by evaluating a modified expression on sourceObject.
  // Transform: "...->exists(uk | uk = target)" → "...->asSet()"
  // to get the valid collection, then check membership.
  //
  // For the common pattern "GUARD implies COLLECTION->exists(v | v = target)":
  // Extract COLLECTION and evaluate it on sourceObject to get the valid set.

  try {
    // Try to extract the valid collection from the expression.
    // Common pattern: "condition implies collection->exists(v | v = target)"
    // We transform to: "if condition then collection else Set{} endif"
    const expr = props.oclFilter
    const existsMatch = expr.match(/^(.+?)\s*implies\s+(.+?)->exists\s*\(\s*\w+\s*\|\s*\w+\s*=\s*target\s*\)$/)
    const simpleExistsMatch = expr.match(/^(.+?)->exists\s*\(\s*\w+\s*\|\s*\w+\s*=\s*target\s*\)$/)

    let validSet: Set<EObject> | null = null

    if (existsMatch) {
      // Pattern: "guard implies collection->exists(v | v = target)"
      const guard = existsMatch[1]
      const collection = existsMatch[2]
      const setExpr = `if ${guard} then ${collection} else Set{} endif`
      const result = await props.problemsService.query(sourceObj, setExpr)

      if (result && Symbol.iterator in Object(result)) {
        const validArray = Array.from(result as Iterable<EObject>)

        // Use name-based matching since object identity may differ
        const validNames = new Set(validArray.map(o => getObjectDisplayName(o)))
        for (const candidate of props.availableObjects) {
          const candidateName = getObjectDisplayName(candidate)
          const pass = validNames.has(candidateName)
          results.set(candidate, { disabled: !pass, reason: pass ? undefined : `OCL: ${props.oclFilter}` })
        }
        oclFilteredOptions.value = results
        isEvaluatingOcl.value = false
        return
      }
    } else if (simpleExistsMatch) {
      // Pattern: "collection->exists(v | v = target)"
      const collection = simpleExistsMatch[1]
      const setExpr = collection
      const result = await props.problemsService.query(sourceObj, setExpr)
      if (result && Symbol.iterator in Object(result)) {
        const validArray = Array.from(result as Iterable<EObject>)
        const validNames = new Set(validArray.map(o => getObjectDisplayName(o)))
        for (const candidate of props.availableObjects) {
          const pass = validNames.has(getObjectDisplayName(candidate))
          results.set(candidate, { disabled: !pass, reason: pass ? undefined : `OCL: ${props.oclFilter}` })
        }
        oclFilteredOptions.value = results
        isEvaluatingOcl.value = false
        return
      }
    }

    if (results.size === 0) {
      // Fallback: can't parse expression, allow all
      console.warn('[ReferenceField] Could not parse OCL referenceFilter, allowing all:', props.oclFilter)
      for (const candidate of props.availableObjects) {
        results.set(candidate, { disabled: false })
      }
    }
  } catch (e: any) {
    console.error('[ReferenceField] OCL filter evaluation error:', e?.message || e)
    for (const candidate of props.availableObjects) {
      results.set(candidate, { disabled: false })
    }
  }

  oclFilteredOptions.value = results
  isEvaluatingOcl.value = false
}

// Evaluate OCL filter when props change or any feature on the source object changes
watch(
  () => {
    // Track all feature values on the sourceObject to detect any change
    const deps: unknown[] = [props.availableObjects, props.oclFilter, props.problemsService]
    if (props.sourceObject && props.oclFilter) {
      const eClass = props.sourceObject.eClass()
      const features = eClass?.getEAllStructuralFeatures?.() ?? []
      for (const f of features) {
        try { deps.push(props.sourceObject.eGet(f)) } catch { /* skip */ }
      }
    }
    return deps
  },
  () => evaluateOclFilter(),
  { immediate: true }
)

// Stable key for an EObject (index in availableObjects)
function getObjectKey(obj: EObject): string {
  const idx = props.availableObjects?.indexOf(obj) ?? -1
  if (idx >= 0) return String(idx)
  return getObjectDisplayName(obj)
}

// Selected key for the current value
const selectedKey = computed(() => {
  if (!props.value || !props.availableObjects) return null
  // Find the matching object in availableObjects
  for (let i = 0; i < props.availableObjects.length; i++) {
    if (props.availableObjects[i] === props.value) return String(i)
    // Fallback: match by display name
    if (getObjectDisplayName(props.availableObjects[i]) === getObjectDisplayName(props.value)) return String(i)
  }
  return null
})

// Handle select by key
function handleSelectByKey(key: string | null) {
  if (key === null || !props.availableObjects) {
    handleSelect(null as any)
    return
  }
  const idx = parseInt(key, 10)
  if (idx >= 0 && idx < props.availableObjects.length) {
    handleSelect(props.availableObjects[idx])
  }
}

// Options for dropdown (non-containment single references)
const dropdownOptions = computed<(ReferenceOption & { key: string })[]>(() => {
  if (!props.availableObjects) return []

  return props.availableObjects.map((obj, idx) => {
    const name = getObjectDisplayName(obj)
    const eClass = obj.eClass()
    const filterStatus = oclFilteredOptions.value.get(obj)

    return {
      key: String(idx),
      label: `${name} (${eClass.getName()})`,
      value: obj,
      disabled: filterStatus?.disabled ?? false,
      oclReason: filterStatus?.reason
    }
  })
})

// Menu ref for subclass selection
const createMenu = ref<InstanceType<typeof Menu> | null>(null)

// Get concrete classes that can be created
const concreteClasses = computed(() => {
  // If validChildClasses provided, use those
  if (props.validChildClasses && props.validChildClasses.length > 0) {
    return props.validChildClasses
  }
  // Otherwise, check if reference type is concrete
  const refType = referenceType.value
  if (refType && !refType.isAbstract() && !refType.isInterface()) {
    return [refType]
  }
  return []
})

// Menu items for subclass selection
const createMenuItems = computed(() => {
  return concreteClasses.value.map(eClass => ({
    label: eClass.getName(),
    icon: 'pi pi-file',
    command: () => emit('create', eClass)
  }))
})

// Can create new instances?
const canCreate = computed(() => concreteClasses.value.length > 0)

// Handle navigation to referenced object
function handleNavigate(obj: EObject) {
  emit('navigate', obj)
}

// Handle create new - show menu if multiple options, create directly if only one
function handleCreate(event: Event) {
  const classes = concreteClasses.value
  if (classes.length === 0) {
    console.warn('[ReferenceField] No concrete classes available for:', referenceType.value?.getName())
    return
  }
  if (classes.length === 1) {
    // Only one option, create directly
    emit('create', classes[0])
  } else {
    // Multiple options, show menu
    createMenu.value?.toggle(event)
  }
}

// Handle select from dropdown
function handleSelect(obj: EObject) {
  // Check if OCL blocks this selection
  const filterStatus = oclFilteredOptions.value.get(obj)
  if (filterStatus?.disabled) {
    emit('ocl-blocked', obj, filterStatus.reason || 'OCL constraint not satisfied')
    return
  }

  emit('update:value', obj)
  emit('select', obj)
}

// Handle remove from list
function handleRemove(index: number) {
  if (!isManyValued.value) {
    emit('update:value', null)
    return
  }

  const list = [...(props.value as EObject[])]
  list.splice(index, 1)
  emit('update:value', list)
}

// Selected object for adding to list (non-containment many-valued)
const selectedObjectToAdd = ref<EObject | null>(null)

// Handle search for reference target
function handleSearch() {
  const callback = (obj: EObject) => {
    if (isManyValued.value) {
      const currentList = (props.value as EObject[]) || []
      if (!currentList.includes(obj)) {
        emit('update:value', [...currentList, obj])
      }
    } else {
      emit('update:value', obj)
      emit('select', obj)
    }
  }
  emit('search', props.feature, callback)
}

// Handle adding an object to a many-valued non-containment reference
function handleAddToList() {
  if (!selectedObjectToAdd.value) return

  // Check if OCL blocks this selection
  const filterStatus = oclFilteredOptions.value.get(selectedObjectToAdd.value)
  if (filterStatus?.disabled) {
    emit('ocl-blocked', selectedObjectToAdd.value, filterStatus.reason || 'OCL constraint not satisfied')
    selectedObjectToAdd.value = null
    return
  }

  const currentList = (props.value as EObject[]) || []
  // Avoid duplicates
  if (!currentList.includes(selectedObjectToAdd.value)) {
    const newList = [...currentList, selectedObjectToAdd.value]
    emit('update:value', newList)
  }
  selectedObjectToAdd.value = null
}

// Filter available objects to exclude already selected ones
const availableObjectsFiltered = computed(() => {
  if (!props.availableObjects) return []
  const currentList = (props.value as EObject[]) || []
  return props.availableObjects.filter(obj => !currentList.includes(obj))
})

// Options for the many-valued add dropdown
const addDropdownOptions = computed<ReferenceOption[]>(() => {
  return availableObjectsFiltered.value.map(obj => {
    const name = getObjectDisplayName(obj)
    const eClass = obj.eClass()
    const filterStatus = oclFilteredOptions.value.get(obj)

    return {
      label: `${name} (${eClass.getName()})`,
      value: obj,
      disabled: filterStatus?.disabled ?? false,
      oclReason: filterStatus?.reason
    }
  })
})

// Currently selected option for the add dropdown (wrapper for the EObject)
const selectedAddOption = computed({
  get() {
    if (!selectedObjectToAdd.value) return null
    // Find matching option by reference
    return addDropdownOptions.value.find(opt => opt.value === selectedObjectToAdd.value) || null
  },
  set(option: { label: string; value: EObject } | null) {
    selectedObjectToAdd.value = option?.value ?? null
  }
})
</script>

<template>
  <div class="reference-field">
    <label class="field-label">
      {{ displayName }}
      <span v-if="isRequired(feature)" class="required-indicator">*</span>
      <span v-if="isContainment" class="containment-badge" title="Containment reference">C</span>
      <span v-if="hasOpposite" class="opposite-badge" title="Has opposite reference">B</span>
    </label>

    <!-- Single non-containment reference with available objects -->
    <div v-if="!isManyValued && !isContainment && availableObjects" class="single-reference">
      <Dropdown
        :modelValue="selectedKey"
        @update:modelValue="handleSelectByKey"
        :options="dropdownOptions"
        optionLabel="label"
        optionValue="key"
        optionDisabled="disabled"
        :disabled="readonly"
        :invalid="!!error"
        placeholder="Select..."
        showClear
        class="flex-1"
      >
        <template #option="{ option }">
          <div
            class="dropdown-option"
            :class="{ 'ocl-disabled': option.disabled }"
            :title="option.oclReason"
          >
            <span>{{ option.label }}</span>
            <i v-if="option.disabled" class="pi pi-ban ocl-icon" />
          </div>
        </template>
      </Dropdown>
      <Button
        v-if="!readonly"
        icon="pi pi-search"
        severity="secondary"
        size="small"
        @click="handleSearch"
        title="Search for reference target"
      />
    </div>

    <!-- Single containment or without options - show current value -->
    <div v-else-if="!isManyValued" class="single-reference">
      <div class="reference-value" @click="value && handleNavigate(value)">
        <span class="value-text">{{ displayValue }}</span>
        <i v-if="value" class="pi pi-external-link navigate-icon" />
      </div>
      <Button
        v-if="isContainment && !readonly && canCreate"
        icon="pi pi-plus"
        severity="secondary"
        size="small"
        @click="handleCreate($event)"
        :title="concreteClasses.length > 1 ? 'Create new (click to select type)' : `Create new ${concreteClasses[0]?.getName()}`"
      />
      <Button
        v-if="value && !readonly && !hasOpposite"
        icon="pi pi-times"
        severity="danger"
        size="small"
        @click="handleRemove(-1)"
        title="Clear"
      />
    </div>

    <!-- Many-valued reference -->
    <div v-else class="multi-reference">
      <div class="reference-list">
        <div
          v-for="(item, index) in (value as EObject[] || [])"
          :key="index"
          class="reference-item"
        >
          <span class="item-text" @click="handleNavigate(item)">
            {{ getObjectDisplayName(item) }}
            <i class="pi pi-external-link navigate-icon" />
          </span>
          <Button
            v-if="!readonly"
            icon="pi pi-times"
            severity="danger"
            size="small"
            text
            @click="handleRemove(index)"
          />
        </div>
        <div v-if="!value || (value as EObject[]).length === 0" class="empty-list">
          No items
        </div>
      </div>
      <div class="reference-actions">
        <!-- Containment: Create new -->
        <Button
          v-if="isContainment && !readonly && canCreate"
          icon="pi pi-plus"
          :label="concreteClasses.length > 1 ? 'Add...' : 'Add'"
          severity="secondary"
          size="small"
          @click="handleCreate($event)"
        />
        <!-- Non-containment: Select from available -->
        <template v-if="!isContainment && !readonly && availableObjects && availableObjects.length > 0">
          <Dropdown
            v-model="selectedAddOption"
            :options="addDropdownOptions"
            optionLabel="label"
            optionDisabled="disabled"
            placeholder="Select to add..."
            class="add-dropdown"
            showClear
          >
            <template #option="{ option }">
              <div
                class="dropdown-option"
                :class="{ 'ocl-disabled': option.disabled }"
                :title="option.oclReason"
              >
                <span>{{ option.label }}</span>
                <i v-if="option.disabled" class="pi pi-ban ocl-icon" />
              </div>
            </template>
          </Dropdown>
          <Button
            icon="pi pi-plus"
            severity="secondary"
            size="small"
            @click="handleAddToList"
            :disabled="!selectedObjectToAdd"
            title="Add to list"
          />
          <Button
            icon="pi pi-search"
            severity="secondary"
            size="small"
            @click="handleSearch"
            title="Search for reference target"
          />
        </template>
      </div>
    </div>

    <!-- Error message -->
    <small v-if="error" class="field-error">{{ error }}</small>

    <!-- Subclass selection menu -->
    <Menu ref="createMenu" :model="createMenuItems" :popup="true" />
  </div>
</template>

<style scoped>
.reference-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field-label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.required-indicator {
  color: var(--red-500);
}

.containment-badge,
.opposite-badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  background: var(--surface-200);
  color: var(--text-color-secondary);
}

.single-reference {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.flex-1 {
  flex: 1;
}

.reference-value {
  flex: 1;
  padding: 0.5rem 0.75rem;
  background: var(--surface-100);
  border-radius: var(--border-radius);
  border: 1px solid var(--surface-300);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.reference-value:hover {
  background: var(--surface-200);
}

.value-text {
  color: var(--text-color);
}

.navigate-icon {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.multi-reference {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.reference-list {
  border: 1px solid var(--surface-300);
  border-radius: var(--border-radius);
  background: var(--surface-50);
  max-height: 150px;
  overflow-y: auto;
}

.reference-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--surface-200);
}

.reference-item:last-child {
  border-bottom: none;
}

.item-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  color: var(--text-color);
}

.item-text:hover {
  color: var(--primary-color);
}

.empty-list {
  padding: 1rem;
  text-align: center;
  color: var(--text-color-secondary);
  font-style: italic;
}

.reference-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.add-dropdown {
  flex: 1;
  min-width: 150px;
}

.field-error {
  color: var(--red-500);
  font-size: 0.75rem;
}

/* OCL filter styles */
.dropdown-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.dropdown-option.ocl-disabled {
  color: var(--text-color-secondary);
  font-style: italic;
  opacity: 0.7;
}

.ocl-icon {
  color: var(--orange-500);
  font-size: 0.75rem;
  margin-left: 0.5rem;
}
</style>
