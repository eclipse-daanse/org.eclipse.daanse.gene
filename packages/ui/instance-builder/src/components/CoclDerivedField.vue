<script setup lang="ts">
/**
 * CoclDerivedField Component
 *
 * Displays derived values defined only in C-OCL files (not in Ecore).
 * Unlike DerivedField, this component works without an Ecore EStructuralFeature.
 */

import { ref, computed, onMounted, onUnmounted, watch, toRaw } from 'tsm:vue'
import { Button } from 'tsm:primevue'
import type { EObject, Notification } from '@emfts/core'
import { AdapterImpl } from '@emfts/core'

/** C-OCL Constraint info */
interface CoclConstraint {
  name: string
  description?: string
  expression: string
  featureName?: string
}

const props = defineProps<{
  /** The C-OCL DERIVED constraint */
  constraint: CoclConstraint
  /** The EObject to evaluate on */
  eObject: EObject
  /** Problems service for OCL evaluation */
  problemsService?: {
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

// Feature name from constraint
const featureName = computed(() => props.constraint.featureName || props.constraint.name)

// Display name
const displayName = computed(() => {
  const name = featureName.value
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
})

// Evaluate the derived value
async function evaluate() {
  if (!props.problemsService?.query) {
    error.value = 'OCL service not available'
    return
  }

  isLoading.value = true
  error.value = null

  try {
    const result = await props.problemsService.query(props.eObject, props.constraint.expression)
    computedValue.value = result
  } catch (e: any) {
    console.error('[CoclDerivedField] Evaluation error:', e)
    error.value = e.message || 'Evaluation failed'
    computedValue.value = null
  } finally {
    isLoading.value = false
  }
}

// Check if value is an EObject
function isEObject(val: unknown): val is EObject {
  return val !== null && typeof val === 'object' && typeof (val as any).eClass === 'function'
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
    if (val.every(item => isEObject(item))) {
      return val.map(obj => getObjectLabel(obj as EObject)).join(', ')
    }
    return val.join(', ')
  }

  // Handle EObject references
  if (isEObject(val)) {
    return getObjectLabel(val)
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
  if (computedValue.value === null) return []

  const val = computedValue.value
  if (Array.isArray(val)) {
    return val.filter(item => isEObject(item)) as EObject[]
  }
  if (isEObject(val)) return [val]
  return []
})

// Tooltip content
const tooltipContent = computed(() => {
  let tip = `OCL: ${props.constraint.expression}`
  if (props.constraint.description) {
    tip = `${props.constraint.description}\n\n${tip}`
  }
  return tip
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
    console.log('[CoclDerivedField] EObject changed:', notification.toString?.() || notification)
    this.onChanged()
  }
}

// Track adapter instance
let currentAdapter: DerivedValueAdapter | null = null

// Add adapter to eObject
function attachAdapter(obj: EObject) {
  if (!obj) return

  currentAdapter = new DerivedValueAdapter(() => {
    evaluate()
  })

  try {
    const rawObj = toRaw(obj) as any
    const adapters = rawObj.eAdapters?.()
    if (adapters) {
      adapters.push(currentAdapter)
    }
  } catch (e) {
    console.warn('[CoclDerivedField] Failed to attach adapter:', e)
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
      }
    }
  } catch (e) {
    console.warn('[CoclDerivedField] Failed to detach adapter:', e)
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
</script>

<template>
  <div class="cocl-derived-field">
    <div class="field-header">
      <span class="field-label">
        <i class="pi pi-calculator derived-icon" v-tooltip.top="tooltipContent" />
        {{ displayName }}
      </span>
      <span class="derived-badge">C-OCL</span>
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
      <template v-else-if="clickableReferences.length > 0">
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
.cocl-derived-field {
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
  background: var(--orange-100);
  color: var(--orange-700);
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