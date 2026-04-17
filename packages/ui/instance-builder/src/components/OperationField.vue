<script setup lang="ts">
/**
 * OperationField Component
 *
 * Displays EOperations with OCL body for execution.
 * - Shows operation name and return type
 * - Execute button for manual invocation
 * - Parameter dialog for operations with parameters
 * - Displays result inline
 */

import { ref, computed, onMounted, watch } from 'tsm:vue'
import { Button } from 'tsm:primevue'
import type { EObject, EOperation, EParameter } from '@emfts/core'

const OCL_SOURCES = ['http://www.eclipse.org/fennec/m2x/ocl/1.0', 'http://www.eclipse.org/emf/2002/Ecore/OCL', 'http://www.eclipse.org/OCL/Pivot']
function isOclSource(s: string | null | undefined): boolean { return !!s && OCL_SOURCES.includes(s) }

const props = defineProps<{
  operation: EOperation
  eObject: EObject
  /** Problems service for OCL evaluation */
  problemsService?: {
    executeOperation: (obj: EObject, operationName: string, params?: Record<string, unknown>) => Promise<unknown>
    hasOperationExpression: (eClass: any, operationName: string) => Promise<boolean>
    query: (obj: EObject, expression: string) => Promise<unknown>
  }
  /** Auto-execute parameterless operations */
  autoExecute?: boolean
}>()

const emit = defineEmits<{
  'navigate': [eObject: EObject]
  'open-parameter-dialog': [operation: EOperation, callback: (params: Record<string, unknown>) => void]
}>()

// State
const result = ref<unknown>(null)
const isExecuting = ref(false)
const error = ref<string | null>(null)
const hasExecuted = ref(false)
const oclExpression = ref<string | null>(null)

// Helper to get name from an ENamedElement (handles DynamicEObjects)
function getElementName(element: any): string {
  // Try direct method first
  let name = element.getName?.()
  if (name) return name

  // Try eGet for DynamicEObject
  const eClass = element.eClass?.()
  if (eClass) {
    const nameFeature = eClass.getEStructuralFeature?.('name')
    if (nameFeature) {
      name = element.eGet?.(nameFeature)
      if (name) return name
    }
  }

  // Try eSettings
  if (element.eSettings instanceof Map) {
    name = element.eSettings.get('name')
    if (name) return name
  }

  return 'unnamed'
}

// Helper to get EType from an ETypedElement (handles DynamicEObjects)
function getElementType(element: any): any {
  // Try direct method first
  let eType = element.getEType?.()
  if (eType) return eType

  // Try eGet for DynamicEObject
  const eClass = element.eClass?.()
  if (eClass) {
    const typeFeature = eClass.getEStructuralFeature?.('eType')
    if (typeFeature) {
      eType = element.eGet?.(typeFeature)
      if (eType) return eType
    }
  }

  return null
}

// Helper to get parameters from an EOperation (handles DynamicEObjects)
function getOperationParameters(op: any): any[] {
  // Try direct method first
  let params = op.getEParameters?.()
  if (params && (Array.isArray(params) || params.data)) {
    return params.data ?? params ?? []
  }

  // Try eGet for DynamicEObject
  const eClass = op.eClass?.()
  if (eClass) {
    const paramsFeature = eClass.getEStructuralFeature?.('eParameters')
    if (paramsFeature) {
      params = op.eGet?.(paramsFeature)
      if (params) {
        return params.data ?? params ?? []
      }
    }
  }

  return []
}

// Helper to get annotations from an EModelElement (handles DynamicEObjects)
function getElementAnnotations(element: any): any[] {
  // Try direct method first
  let annotations = element.getEAnnotations?.()
  if (annotations && (Array.isArray(annotations) || annotations.data)) {
    return annotations.data ?? annotations ?? []
  }

  // Try eGet for DynamicEObject
  const eClass = element.eClass?.()
  if (eClass) {
    const annotationsFeature = eClass.getEStructuralFeature?.('eAnnotations')
    if (annotationsFeature) {
      annotations = element.eGet?.(annotationsFeature)
      if (annotations) {
        return annotations.data ?? annotations ?? []
      }
    }
  }

  return []
}

// Operation info
const operationName = computed(() => getElementName(props.operation))
const returnType = computed(() => {
  const eType = getElementType(props.operation)
  return eType ? getElementName(eType) : 'void'
})

// Get parameters
const parameters = computed<EParameter[]>(() => {
  return getOperationParameters(props.operation)
})

const hasParameters = computed(() => parameters.value.length > 0)

// Display name
const displayName = computed(() => {
  const name = operationName.value
  const params = parameters.value.map(p => {
    const pType = getElementType(p)
    const pTypeName = pType ? getElementName(pType) : '?'
    return `${getElementName(p)}: ${pTypeName}`
  }).join(', ')
  return `${name}(${params})`
})

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
    // Could be an EMap - try direct get by key
    // EMap.get() may take a key string directly
    try {
      const val = details.get(targetKey)
      if (val !== undefined && val !== null) return String(val)
    } catch { /* not a direct key-based map, fall through */ }
  }

  // Collect entries from details (handles Array, EList with .data, EList with .size()/.get())
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

// Get OCL expression from annotation
function getOclExpression(): string | null {
  try {
    const annotations = getElementAnnotations(props.operation)

    for (const annotation of annotations) {
      const source = getAnnotationSource(annotation)
      if (isOclSource(source)) {
        const body = getAnnotationDetailValue(annotation, 'body')
        if (body) return body
      }
    }
  } catch (e) {
    console.warn('[OperationField] Error getting OCL expression:', e)
  }
  return null
}

// Execute the operation
async function execute(params?: Record<string, unknown>) {
  if (!props.problemsService) {
    error.value = 'OCL service not available'
    return
  }

  isExecuting.value = true
  error.value = null

  try {
    // Get OCL expression
    oclExpression.value = getOclExpression()

    let execResult: unknown = undefined

    // If we have an OCL expression and query() is available, use it directly
    if (oclExpression.value && props.problemsService.query) {
      let expression = oclExpression.value

      // Substitute parameters if provided
      if (params && Object.keys(params).length > 0) {
        for (const [paramName, paramValue] of Object.entries(params)) {
          let oclValue: string
          if (typeof paramValue === 'string') {
            oclValue = `'${paramValue}'`
          } else if (typeof paramValue === 'number') {
            oclValue = String(paramValue)
          } else if (typeof paramValue === 'boolean') {
            oclValue = paramValue ? 'true' : 'false'
          } else if (paramValue === null || paramValue === undefined) {
            oclValue = 'null'
          } else if (typeof paramValue === 'object' && (paramValue as any).name) {
            oclValue = (paramValue as any).name
          } else {
            oclValue = 'null'
          }
          expression = expression.replace(new RegExp(`\\b${paramName}\\b`, 'g'), oclValue)
        }
      }

      execResult = await props.problemsService.query(props.eObject, expression)
    } else {
      // Fallback to executeOperation
      execResult = await props.problemsService.executeOperation(
        props.eObject,
        operationName.value,
        params
      )
    }

    result.value = execResult
    hasExecuted.value = true
  } catch (e: any) {
    console.error('[OperationField] Execution error:', e)
    error.value = e.message || 'Execution failed'
    result.value = null
  } finally {
    isExecuting.value = false
  }
}

// Handle execute button click
function handleExecute() {
  if (hasParameters.value) {
    // Open parameter dialog
    emit('open-parameter-dialog', props.operation, (params) => {
      execute(params)
    })
  } else {
    execute()
  }
}

// Format the result for display
const displayResult = computed(() => {
  if (isExecuting.value) return 'Executing...'
  if (error.value) return `Error: ${error.value}`
  if (!hasExecuted.value) return '—'
  if (result.value === null || result.value === undefined) return 'null'

  const val = result.value

  // Handle arrays/collections
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]'
    if (typeof val[0] === 'object' && val[0]?.eClass) {
      return val.map(obj => getObjectLabel(obj)).join(', ')
    }
    return `[${val.join(', ')}]`
  }

  // Handle EObject results
  if (val && typeof val === 'object' && (val as any).eClass) {
    return getObjectLabel(val as EObject)
  }

  // Handle primitives
  if (typeof val === 'boolean') return val ? 'true' : 'false'
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

// Is result a navigable reference?
const isResultReference = computed(() => {
  if (!hasExecuted.value || result.value === null) return false
  const val = result.value
  if (Array.isArray(val)) {
    return val.length > 0 && typeof val[0] === 'object' && (val[0] as any)?.eClass
  }
  return typeof val === 'object' && (val as any)?.eClass
})

// Get clickable references from result
const clickableReferences = computed(() => {
  if (!isResultReference.value || result.value === null) return []

  const val = result.value
  if (Array.isArray(val)) return val as EObject[]
  if (val && typeof val === 'object') return [val as EObject]
  return []
})

// Tooltip content
const tooltipContent = computed(() => {
  if (oclExpression.value) {
    return `OCL: ${oclExpression.value}`
  }
  return 'Operation (no OCL expression found)'
})

// Auto-execute parameterless operations on mount if enabled
onMounted(async () => {
  oclExpression.value = getOclExpression()

  if (props.autoExecute && !hasParameters.value && oclExpression.value) {
    await execute()
  }
})

// Reset state and optionally re-execute on eObject change
watch(() => props.eObject, async () => {
  // Reset state when object changes
  result.value = null
  hasExecuted.value = false
  error.value = null

  // Re-fetch OCL expression (may be different for different objects)
  oclExpression.value = getOclExpression()

  // Re-execute if auto-execute is enabled
  if (props.autoExecute && !hasParameters.value && oclExpression.value) {
    await execute()
  }
})
</script>

<template>
  <div class="operation-field">
    <div class="field-header">
      <span class="field-label">
        <i class="pi pi-code operation-icon" v-tooltip.top="tooltipContent" />
        {{ displayName }}
      </span>
      <span class="return-type">→ {{ returnType }}</span>
      <Button
        icon="pi pi-play"
        size="small"
        rounded
        text
        :loading="isExecuting"
        :disabled="isExecuting"
        @click="handleExecute"
        v-tooltip.top="'Execute operation'"
      />
    </div>

    <div class="field-value" :class="{ 'has-error': error, 'is-loading': isExecuting }">
      <!-- Not executed yet -->
      <template v-if="!hasExecuted && !isExecuting">
        <span class="not-executed">Click play to execute</span>
      </template>

      <!-- Loading state -->
      <template v-else-if="isExecuting">
        <i class="pi pi-spin pi-spinner" />
        <span class="loading-text">Executing...</span>
      </template>

      <!-- Error state -->
      <template v-else-if="error">
        <i class="pi pi-exclamation-triangle error-icon" />
        <span class="error-text">{{ error }}</span>
      </template>

      <!-- Reference result(s) - clickable -->
      <template v-else-if="isResultReference && clickableReferences.length > 0">
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

      <!-- Primitive result -->
      <template v-else>
        <span class="value-text">{{ displayResult }}</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.operation-field {
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
  color: var(--text-color);
  font-size: 0.875rem;
  font-family: monospace;
}

.operation-icon {
  color: var(--purple-500);
  font-size: 0.75rem;
  cursor: help;
}

.return-type {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  font-family: monospace;
  flex: 1;
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

.not-executed {
  color: var(--text-color-secondary);
  font-style: italic;
  font-size: 0.875rem;
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
  font-family: monospace;
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
