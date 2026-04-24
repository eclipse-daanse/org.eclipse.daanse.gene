<script setup lang="ts">
/**
 * DerivedField Component
 *
 * Displays derived attributes and references with OCL-computed values.
 * - Read-only display
 * - Visual indicator (fx icon)
 * - Tooltip showing OCL expression
 * - Live evaluation on mount/update
 */

import { ref, computed, onMounted, onUnmounted, watch, toRaw } from 'tsm:vue'
import { Button } from 'tsm:primevue'
import type { EObject, EStructuralFeature, EAttribute, EReference, Notification, Adapter } from '@emfts/core'
import { AdapterImpl } from '@emfts/core'
import { isEReference, isMany } from '../types'

const OCL_SOURCES = ['http://www.eclipse.org/fennec/m2x/ocl/1.0', 'http://www.eclipse.org/emf/2002/Ecore/OCL', 'http://www.eclipse.org/OCL/Pivot']
function isOclSource(s: string | null | undefined): boolean { return !!s && OCL_SOURCES.includes(s) }

// Lazy load C-OCL loader for derived constraints
let coclLoaderModule: any = null
async function loadCoclLoader() {
  if (!coclLoaderModule) {
    try {
      coclLoaderModule = await import('ui-problems-panel')
    } catch {
      coclLoaderModule = null
    }
  }
  return coclLoaderModule
}

const props = defineProps<{
  feature: EStructuralFeature
  eObject: EObject
  /** Problems service for OCL evaluation */
  problemsService?: {
    evaluateDerived: (obj: EObject, featureName: string) => Promise<unknown>
    hasDerivedExpression: (eClass: any, featureName: string) => Promise<boolean>
    query: (obj: EObject, expression: string) => Promise<unknown>
  }
}>()

const emit = defineEmits<{
  'navigate': [eObject: EObject]
}>()

// State
const computedValue = ref<unknown>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const oclExpression = ref<string | null>(null)

// Feature info
const featureName = computed(() => props.feature.getName())
const isReference = computed(() => isEReference(props.feature))
const isManyValued = computed(() => isMany(props.feature))

// Display name
const displayName = computed(() => {
  const name = featureName.value
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
})

// Get OCL expression from C-OCL or Ecore annotation
async function getOclExpressionAsync(): Promise<string | null> {
  // First, try C-OCL DERIVED constraint
  try {
    const coclLoader = await loadCoclLoader()
    if (coclLoader?.getDerivedConstraint) {
      const eClass = props.eObject.eClass()
      const className = eClass.getName()
      const pkg = eClass.getEPackage()
      const pkgName = pkg?.getName()
      const fullClassName = pkgName ? `${pkgName}.${className}` : className

      // Try full name first, then simple name
      let constraint = coclLoader.getDerivedConstraint(fullClassName, featureName.value)
      if (!constraint) {
        constraint = coclLoader.getDerivedConstraint(className, featureName.value)
      }

      if (constraint) {
        console.log('[DerivedField] Found C-OCL DERIVED constraint for', fullClassName + '.' + featureName.value, ':', constraint.expression)
        return constraint.expression
      }
    }
  } catch (e) {
    console.warn('[DerivedField] Error getting C-OCL derived constraint:', e)
  }

  // Fallback: try Ecore annotation
  return getOclExpressionFromAnnotation()
}

// Get annotation source string
function getAnnotationSource(annotation: any): string | undefined {
  const annClass = annotation.eClass?.()
  if (annClass) {
    const sourceFeature = annClass.getEStructuralFeature?.('source')
    if (sourceFeature) {
      const s = annotation.eGet?.(sourceFeature)
      if (s) return String(s)
    }
  }
  if (annotation.eSettings instanceof Map) {
    const s = annotation.eSettings.get('source')
    if (s) return String(s)
  }
  return annotation.getSource?.() ?? (annotation as any).source
}

// Get key from a map entry (EStringToStringMapEntry)
function getMapEntryKey(entry: any): string | null {
  if (!entry) return null
  if ('key' in entry) return entry.key
  const eSettings = entry.eSettings
  if (eSettings instanceof Map) return eSettings.get('key') ?? null
  if (typeof entry.eGet === 'function') {
    const ec = entry.eClass?.()
    if (ec) {
      const kf = ec.getEStructuralFeature?.('key')
      if (kf) return entry.eGet(kf) as string | null
    }
  }
  if (typeof entry.getKey === 'function') return entry.getKey()
  return null
}

// Get value from a map entry (EStringToStringMapEntry)
function getMapEntryValue(entry: any): string | null {
  if (!entry) return null
  if ('value' in entry) return entry.value
  const eSettings = entry.eSettings
  if (eSettings instanceof Map) return eSettings.get('value') ?? null
  if (typeof entry.eGet === 'function') {
    const ec = entry.eClass?.()
    if (ec) {
      const vf = ec.getEStructuralFeature?.('value')
      if (vf) return entry.eGet(vf) as string | null
    }
  }
  if (typeof entry.getValue === 'function') return entry.getValue()
  return null
}

// Get detail value from annotation by key
function getAnnotationDetailValue(annotation: any, targetKey: string): string | undefined {
  const annClass = annotation.eClass?.()

  let details: any = null
  if (annClass) {
    const detailsFeature = annClass.getEStructuralFeature?.('details')
    if (detailsFeature) {
      details = annotation.eGet?.(detailsFeature)
    }
  }
  if (!details) {
    details = annotation.getDetails?.() ?? (annotation as any).details
  }
  if (!details) return undefined

  // Try EMap.get() method
  if (typeof details.get === 'function' && typeof details.size === 'function') {
    try {
      const val = details.get(targetKey)
      if (val !== undefined && val !== null) return String(val)
    } catch { /* fall through */ }
  }

  // Collect entries (handles Array, EList with .data, EList with .size()/.get())
  const entries: any[] = []
  if (Array.isArray(details.data)) {
    entries.push(...details.data)
  } else if (Array.isArray(details)) {
    entries.push(...details)
  } else if (typeof details.size === 'function') {
    for (let i = 0; i < details.size(); i++) {
      entries.push(details.get(i))
    }
  }

  for (const entry of entries) {
    if (getMapEntryKey(entry) === targetKey) {
      return getMapEntryValue(entry) ?? undefined
    }
  }

  return undefined
}

// Get OCL expression from Ecore annotation (synchronous)
function getOclExpressionFromAnnotation(): string | null {
  try {
    const annotations = props.feature.getEAnnotations?.() || []

    for (const annotation of annotations) {
      const source = getAnnotationSource(annotation)
      if (isOclSource(source)) {
        // Try 'derivation' first, then 'body'
        const derivation = getAnnotationDetailValue(annotation, 'derivation')
        if (derivation) return derivation
        const body = getAnnotationDetailValue(annotation, 'body')
        if (body) return body
      }
    }
  } catch (e) {
    console.warn('[DerivedField] Error getting OCL expression from annotation:', e)
  }
  return null
}

// Evaluate the derived value
async function evaluate() {
  if (!props.problemsService) {
    error.value = 'OCL service not available'
    return
  }

  isLoading.value = true
  error.value = null

  try {
    // Get OCL expression for tooltip (now async to support C-OCL)
    oclExpression.value = await getOclExpressionAsync()

    let result: unknown = undefined

    // If we have an OCL expression, evaluate it directly using query()
    if (oclExpression.value && props.problemsService.query) {
      result = await props.problemsService.query(props.eObject, oclExpression.value)
    } else {
      // Fallback to evaluateDerived (requires package registration)
      result = await props.problemsService.evaluateDerived(props.eObject, featureName.value)
    }

    computedValue.value = result
  } catch (e: any) {
    console.error('[DerivedField] Evaluation error:', e)
    error.value = e.message || 'Evaluation failed'
    computedValue.value = null
  } finally {
    isLoading.value = false
  }
}

// Format the value for display
const displayValue = computed(() => {
  if (isLoading.value) return 'Computing...'
  if (error.value) return `Error: ${error.value}`
  if (computedValue.value === null || computedValue.value === undefined) return '—'

  const val = computedValue.value

  // Handle arrays/collections
  if (Array.isArray(val)) {
    if (val.length === 0) return 'Empty'
    if (isReference.value) {
      return val.map(obj => getObjectLabel(obj)).join(', ')
    }
    return val.join(', ')
  }

  // Handle EObject references
  if (isReference.value && val && typeof val === 'object') {
    return getObjectLabel(val as EObject)
  }

  // Handle primitives
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  if (val instanceof Date) return val.toLocaleDateString()

  return String(val)
})

// Get label for an EObject
function getObjectLabel(obj: EObject): string {
  try {
    const eClass = obj.eClass()
    const className = eClass.getName()

    // Try to find a name attribute
    const nameFeature = eClass.getEStructuralFeature('name')
    if (nameFeature) {
      const name = obj.eGet(nameFeature)
      if (name) return `${name} (${className})`
    }

    return `[${className}]`
  } catch {
    return '[Object]'
  }
}

// Handle navigation to referenced object
function handleNavigate(obj: EObject) {
  emit('navigate', obj)
}

// Get clickable references
const clickableReferences = computed(() => {
  if (!isReference.value || computedValue.value === null) return []

  const val = computedValue.value
  if (Array.isArray(val)) return val as EObject[]
  if (val && typeof val === 'object') return [val as EObject]
  return []
})

// Tooltip content
const tooltipContent = computed(() => {
  if (oclExpression.value) {
    return `OCL: ${oclExpression.value}`
  }
  return 'Derived value (no OCL expression found)'
})

/**
 * Adapter to listen for changes on the eObject and re-evaluate derived value
 */
class DerivedValueAdapter extends AdapterImpl {
  private onChanged: () => void

  constructor(onChanged: () => void) {
    super()
    this.onChanged = onChanged
  }

  notifyChanged(notification: Notification): void {
    console.log('[DerivedField] EObject changed:', notification.toString?.() || notification)
    this.onChanged()
  }
}

// Track adapter instance
let currentAdapter: DerivedValueAdapter | null = null

// Add adapter to eObject
function attachAdapter(obj: EObject) {
  if (!obj) return

  // Create new adapter
  currentAdapter = new DerivedValueAdapter(() => {
    // Re-evaluate when properties change
    evaluate()
  })

  try {
    const rawObj = toRaw(obj) as any
    const adapters = rawObj.eAdapters?.()
    if (adapters) {
      adapters.push(currentAdapter)
      console.log('[DerivedField] Adapter attached to eObject')
    } else {
      console.warn('[DerivedField] eObject does not support eAdapters')
    }
  } catch (e) {
    console.warn('[DerivedField] Failed to attach adapter:', e)
  }
}

// Remove adapter from eObject
function detachAdapter(obj: EObject | null) {
  if (!obj || !currentAdapter) return

  try {
    const rawObj = toRaw(obj) as any
    const adapters = rawObj.eAdapters?.()
    if (adapters) {
      const idx = adapters.indexOf(currentAdapter)
      if (idx >= 0) {
        adapters.splice(idx, 1)
        console.log('[DerivedField] Adapter detached from eObject')
      }
    }
  } catch (e) {
    console.warn('[DerivedField] Failed to detach adapter:', e)
  }
  currentAdapter = null
}

// Evaluate on mount and attach adapter
onMounted(() => {
  evaluate()
  attachAdapter(props.eObject)
})

// Clean up adapter on unmount
onUnmounted(() => {
  detachAdapter(props.eObject)
})

// When eObject changes, re-evaluate and re-attach adapter
watch(() => props.eObject, (newObj, oldObj) => {
  detachAdapter(oldObj)
  evaluate()
  if (newObj) {
    attachAdapter(newObj)
  }
})

// Re-evaluate when problemsService becomes available (loaded async by parent)
watch(() => props.problemsService, (newService) => {
  if (newService && (computedValue.value === null || computedValue.value === undefined)) {
    evaluate()
  }
})
</script>

<template>
  <div class="derived-field">
    <div class="field-header">
      <span class="field-label">
        <i class="pi pi-calculator derived-icon" v-tooltip.top="tooltipContent" />
        {{ displayName }}
      </span>
      <span class="derived-badge">derived</span>
    </div>

    <div class="field-value" :class="{ 'has-error': error, 'is-loading': isLoading }">
      <!-- Loading state -->
      <template v-if="isLoading">
        <i class="pi pi-spin pi-spinner" />
        <span class="loading-text">Computing...</span>
      </template>

      <!-- Error state -->
      <template v-else-if="error">
        <i class="pi pi-exclamation-triangle error-icon" />
        <span class="error-text">{{ error }}</span>
      </template>

      <!-- Reference value(s) - clickable -->
      <template v-else-if="isReference && clickableReferences.length > 0">
        <div class="reference-list">
          <Button
            v-for="(obj, idx) in clickableReferences"
            :key="idx"
            :label="getObjectLabel(obj)"
            link
            size="small"
            class="reference-link"
            @click="handleNavigate(obj)"
          />
        </div>
      </template>

      <!-- Primitive value -->
      <template v-else>
        <span class="value-text">{{ displayValue }}</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.derived-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--surface-border);
}

.field-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.field-label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 500;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.derived-icon {
  color: var(--primary-color);
  font-size: 0.75rem;
  cursor: help;
}

.derived-badge {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  background: var(--primary-100);
  color: var(--primary-700);
  border-radius: 0.25rem;
  text-transform: uppercase;
  font-weight: 600;
}

.field-value {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  background: var(--surface-ground);
  border-radius: 0.25rem;
  min-height: 2rem;
}

.field-value.has-error {
  background: var(--red-50);
}

.field-value.is-loading {
  color: var(--text-color-secondary);
}

.loading-text {
  font-style: italic;
}

.error-icon {
  color: var(--red-500);
}

.error-text {
  color: var(--red-700);
  font-size: 0.875rem;
}

.value-text {
  color: var(--text-color);
}

.reference-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.reference-link {
  padding: 0;
  font-size: 0.875rem;
}

.reference-link:hover {
  text-decoration: underline;
}
</style>
