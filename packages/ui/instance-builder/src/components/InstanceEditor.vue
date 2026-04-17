<script setup lang="ts">
/**
 * InstanceEditor Component
 *
 * Main editor component for creating and editing EMF instances.
 * Displays all structural features as form fields.
 */

import { computed, ref, watch, inject, onMounted } from 'tsm:vue'
import { Button } from 'tsm:primevue'
import { Fieldset } from 'tsm:primevue'
import { Message } from 'tsm:primevue'
import type { EObject, EClass, EStructuralFeature, EOperation } from '@emfts/core'
import PropertyField from './PropertyField.vue'
import ClassSelector from './ClassSelector.vue'
import OperationField from './OperationField.vue'
import OperationParameterDialog from './OperationParameterDialog.vue'
import { useInstanceEditor } from '../composables/useInstanceEditor'
import { analyzeFeature } from '../types'

const OCL_SOURCES = ['http://www.eclipse.org/fennec/m2x/ocl/1.0', 'http://www.eclipse.org/emf/2002/Ecore/OCL', 'http://www.eclipse.org/OCL/Pivot']
function isOclSource(s: string | null | undefined): boolean { return !!s && OCL_SOURCES.includes(s) }

// Lazy load problems service
let problemsServiceModule: any = null
async function loadProblemsService() {
  if (!problemsServiceModule) {
    try {
      problemsServiceModule = await import('ui-problems-panel')
    } catch {
      problemsServiceModule = null
    }
  }
  return problemsServiceModule?.useSharedProblemsService?.()
}

const props = defineProps<{
  /** EObject to edit (for edit mode) */
  eObject?: EObject
  /** EClass for new instance creation */
  eClass?: EClass
  /** Is this a new instance? */
  isNew?: boolean
}>()

const emit = defineEmits<{
  'save': [eObject: EObject]
  'close': []
}>()

// TSM for accessing services (injected by gene-app)
const tsm = inject<{ getService: <T>(id: string) => T | undefined }>('tsm')

// For new instances without a class, track selected class
const selectedClass = ref<EClass | undefined>(props.eClass)

// Available classes for new instances
const availableClasses = ref<EClass[]>([])

// Problems service for OCL evaluation
const problemsService = ref<any>(null)

onMounted(async () => {
  problemsService.value = await loadProblemsService()
})

// Use the instance editor composable
const editor = computed(() => {
  const eClass = props.isNew ? selectedClass.value : props.eObject?.eClass()
  return useInstanceEditor({
    eObject: props.eObject,
    eClass,
    isNew: props.isNew
  })
})

// Current class name
const className = computed(() => {
  return editor.value.eClass.value?.getName() ?? 'Unknown'
})

// Instance name (for display)
const instanceName = computed(() => {
  if (props.isNew) return 'New Instance'
  const name = editor.value.getValue({ getName: () => 'name' } as EStructuralFeature)
  return name || 'Instance'
})

// Group features by type
const attributeFeatures = computed(() => {
  return editor.value.attributes.value
})

const referenceFeatures = computed(() => {
  return editor.value.references.value
})

// Derived features
const derivedAttributeFeatures = computed(() => {
  return editor.value.derivedAttributes.value
})

const derivedReferenceFeatures = computed(() => {
  return editor.value.derivedReferences.value
})

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

// Get operations with OCL bodies
const operations = computed<EOperation[]>(() => {
  const eClass = editor.value.eClass.value
  if (!eClass) return []

  const allOps = eClass.getEAllOperations?.() || []

  // Filter to only operations that have OCL annotations
  return allOps.filter((op: any) => {
    try {
      const annotations = getElementAnnotations(op)
      for (const annotation of annotations) {
        // Get source using eGet (for DynamicEObject)
        const annClass = annotation.eClass?.()
        let source: string | undefined

        if (annClass) {
          const sourceFeature = annClass.getEStructuralFeature?.('source')
          if (sourceFeature) {
            source = annotation.eGet?.(sourceFeature) as string
          }
        }

        // Try eSettings
        if (!source && annotation.eSettings instanceof Map) {
          source = annotation.eSettings.get('source')
        }

        if (!source) {
          source = annotation.getSource?.() ?? (annotation as any).source
        }

        if (isOclSource(source)) {
          // Get details
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

          if (details) {
            const entries = details.data ?? details
            if (Array.isArray(entries)) {
              for (const entry of entries) {
                const eSettings = entry?.eSettings
                if (eSettings instanceof Map) {
                  const key = eSettings.get('key')
                  if (key === 'body') {
                    return true
                  }
                }
              }
            }
          }
        }
      }
      return false
    } catch {
      return false
    }
  })
})

// Parameter dialog state
const showParameterDialog = ref(false)
const selectedOperation = ref<EOperation | null>(null)
const operationCallback = ref<((params: Record<string, unknown>) => void) | null>(null)

// Has any features?
const hasAttributes = computed(() => attributeFeatures.value.length > 0)
const hasReferences = computed(() => referenceFeatures.value.length > 0)
const hasDerivedFeatures = computed(() =>
  derivedAttributeFeatures.value.length > 0 || derivedReferenceFeatures.value.length > 0
)
const hasOperations = computed(() => operations.value.length > 0)

// Save handler
async function handleSave() {
  if (!editor.value.validate()) {
    return
  }

  editor.value.save()

  if (props.eObject) {
    emit('save', props.eObject)
  }
}

// Reset handler
function handleReset() {
  editor.value.reset()
}

// Create new referenced object
function handleCreateReference(eClass: EClass) {
  // Get the instance editor service to open a new editor
  const editorService = tsm?.getService<any>('ui.instance.editor')
  if (editorService) {
    editorService.openNewEditor(eClass)
  }
}

// Navigate to referenced object
function handleNavigate(eObject: EObject) {
  const editorService = tsm?.getService<any>('ui.instance.editor')
  if (editorService) {
    editorService.openEditor(eObject)
  }
}

// Get value for feature
function getFeatureValue(feature: EStructuralFeature): any {
  return editor.value.getValue(feature)
}

// Set value for feature
function setFeatureValue(feature: EStructuralFeature, value: any) {
  editor.value.setValue(feature, value)
}

// Get error for feature
function getFeatureError(feature: EStructuralFeature): string | undefined {
  return editor.value.errors.value.get(feature.getName())
}

// Open parameter dialog for an operation
function handleOpenParameterDialog(operation: EOperation, callback: (params: Record<string, unknown>) => void) {
  selectedOperation.value = operation
  operationCallback.value = callback
  showParameterDialog.value = true
}

// Execute operation with parameters from dialog
function handleExecuteWithParams(params: Record<string, unknown>) {
  if (operationCallback.value) {
    operationCallback.value(params)
  }
  selectedOperation.value = null
  operationCallback.value = null
}

// Cancel parameter dialog
function handleCancelParameterDialog() {
  selectedOperation.value = null
  operationCallback.value = null
}

// Watch for class selection changes
watch(selectedClass, (newClass) => {
  // Reset editor when class changes
})
</script>

<template>
  <div class="instance-editor">
    <!-- Header -->
    <div class="editor-header">
      <div class="header-info">
        <span class="class-name">{{ className }}</span>
        <span v-if="!isNew" class="instance-name">{{ instanceName }}</span>
        <span v-if="isNew" class="new-badge">New</span>
        <span v-if="editor.isDirty.value" class="dirty-indicator" title="Unsaved changes">*</span>
      </div>
      <div class="header-actions">
        <Button
          label="Reset"
          icon="pi pi-refresh"
          severity="secondary"
          size="small"
          @click="handleReset"
          :disabled="!editor.isDirty.value"
        />
        <Button
          label="Save"
          icon="pi pi-save"
          size="small"
          @click="handleSave"
          :disabled="!editor.isDirty.value && !isNew"
        />
      </div>
    </div>

    <!-- Class selector for new instances without a class -->
    <div v-if="isNew && !eClass" class="class-selection">
      <Message severity="info" :closable="false">
        Select a class to create a new instance.
      </Message>
      <ClassSelector
        v-model="selectedClass"
        :classes="availableClasses"
        label="Class"
        placeholder="Select class to create..."
      />
    </div>

    <!-- Editor content -->
    <div v-if="editor.eClass.value" class="editor-content">
      <!-- Validation errors summary -->
      <Message v-if="editor.errors.value.size > 0" severity="error" :closable="false">
        Please fix the validation errors below.
      </Message>

      <!-- Attributes section -->
      <Fieldset v-if="hasAttributes" legend="Attributes" :toggleable="true">
        <div class="fields-grid">
          <PropertyField
            v-for="feature in attributeFeatures"
            :key="feature.getName()"
            :feature="feature"
            :eObject="eObject!"
            :value="getFeatureValue(feature)"
            @update:value="(v) => setFeatureValue(feature, v)"
            :error="getFeatureError(feature)"
          />
        </div>
      </Fieldset>

      <!-- References section -->
      <Fieldset v-if="hasReferences" legend="References" :toggleable="true">
        <div class="fields-grid">
          <PropertyField
            v-for="feature in referenceFeatures"
            :key="feature.getName()"
            :feature="feature"
            :eObject="eObject!"
            :value="getFeatureValue(feature)"
            @update:value="(v) => setFeatureValue(feature, v)"
            @create="handleCreateReference"
            @navigate="handleNavigate"
            :error="getFeatureError(feature)"
          />
        </div>
      </Fieldset>

      <!-- Derived Values section -->
      <Fieldset v-if="hasDerivedFeatures" legend="Derived Values" :toggleable="true">
        <div class="fields-grid">
          <PropertyField
            v-for="feature in derivedAttributeFeatures"
            :key="feature.getName()"
            :feature="feature"
            :eObject="eObject!"
            :value="undefined"
            :problemsService="problemsService"
            @navigate="handleNavigate"
          />
          <PropertyField
            v-for="feature in derivedReferenceFeatures"
            :key="feature.getName()"
            :feature="feature"
            :eObject="eObject!"
            :value="undefined"
            :problemsService="problemsService"
            @navigate="handleNavigate"
          />
        </div>
      </Fieldset>

      <!-- Operations section -->
      <Fieldset v-if="hasOperations" legend="Operations" :toggleable="true">
        <div class="operations-list">
          <OperationField
            v-for="(op, idx) in operations"
            :key="getElementName(op) + '-' + idx"
            :operation="op"
            :eObject="eObject!"
            :problemsService="problemsService"
            :autoExecute="false"
            @navigate="handleNavigate"
            @open-parameter-dialog="handleOpenParameterDialog"
          />
        </div>
      </Fieldset>

      <!-- Empty state -->
      <div v-if="!hasAttributes && !hasReferences" class="empty-state">
        <i class="pi pi-info-circle"></i>
        <span>This class has no editable features.</span>
      </div>
    </div>

    <!-- No class selected state -->
    <div v-else-if="isNew" class="empty-state">
      <i class="pi pi-list"></i>
      <span>Select a class above to see its properties.</span>
    </div>

    <!-- Operation Parameter Dialog -->
    <OperationParameterDialog
      v-model:visible="showParameterDialog"
      :operation="selectedOperation"
      :eObject="eObject"
      @execute="handleExecuteWithParams"
      @cancel="handleCancelParameterDialog"
    />
  </div>
</template>

<style scoped>
.instance-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-ground);
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--surface-card);
  border-bottom: 1px solid var(--surface-border);
}

.header-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.class-name {
  font-weight: 600;
  color: var(--text-color);
}

.instance-name {
  color: var(--text-color-secondary);
}

.new-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  background: var(--primary-100);
  color: var(--primary-700);
  border-radius: 1rem;
}

.dirty-indicator {
  font-size: 1.25rem;
  color: var(--orange-500);
  font-weight: bold;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.class-selection {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
}

.operations-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 3rem;
  color: var(--text-color-secondary);
}

.empty-state i {
  font-size: 2rem;
}

/* PrimeVue 4 Fieldset Styles */
:deep(.p-fieldset) {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: var(--border-radius);
}

:deep(.p-fieldset-legend) {
  font-weight: 600;
  font-size: 0.875rem;
  border: 1px solid var(--surface-border);
  border-radius: var(--border-radius);
  background: var(--surface-ground);
  padding: 0.25rem 0.75rem;
}

:deep(.p-fieldset-content) {
  padding: 0.75rem;
}
</style>
