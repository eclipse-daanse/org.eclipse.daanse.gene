<script setup lang="ts">
/**
 * PropertiesPanel Component
 *
 * Panel that shows properties for the selected EObject in the instance tree.
 * Uses components from instance-builder for property editing.
 *
 * Accepts an optional context prop to support both Instance Editor and Metamodeler.
 */

import { computed, watch, ref, onMounted, provide, inject } from 'tsm:vue'
import { Fieldset } from 'tsm:primevue'
import { Message } from 'tsm:primevue'
import { Button } from 'tsm:primevue'
import { Breadcrumb } from 'tsm:primevue'
import { InputText } from 'tsm:primevue'
import { useSharedInstanceTree, getXmiId, setXmiId, generateXmiId } from 'ui-instance-tree'
import { useInstanceEditor, PropertyField, DerivedField, CoclDerivedField, OperationField, OperationParameterDialog, GENE_EDITOR_CONTEXT_KEY } from 'instance-builder'
import type { EObject, EStructuralFeature, EClass, EReference, EOperation, Resource } from '@emfts/core'

const OCL_SOURCES = ['http://www.eclipse.org/fennec/m2x/ocl/1.0', 'http://www.eclipse.org/emf/2002/Ecore/OCL', 'http://www.eclipse.org/OCL/Pivot']
function isOclSource(s: string | null | undefined): boolean { return !!s && OCL_SOURCES.includes(s) }
import { getSharedResource } from 'ui-instance-tree'

/** C-OCL Constraint interface */
interface CoclConstraint {
  name: string
  description?: string
  expression: string
  featureName?: string
  contextClass: string
  role: string
}

// Lazy load problems service for OCL evaluation
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

// Lazy load C-OCL loader for reference filters
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

// EditorContext interface (simplified for this component's needs)
interface EditorContext {
  mode: 'instance' | 'metamodel'
  selectedObject: { value: EObject | null }
  rootPackage?: { value: import('@emfts/core').EPackage | null }
  createChild?: (parent: EObject, ref: EReference, eClass: EClass) => EObject | null
  triggerUpdate?: () => void
  markDirty?: () => void
}

// Props - context can be provided by parent (for different perspectives)
const props = defineProps<{
  context?: EditorContext
}>()

// TSM for service access
const tsm = inject<any>('tsm')

// Resolved context: prop > global current context (mode-aware)
const ctx = computed(() => {
  if (props.context) return props.context
  const editorMode = tsm?.getService('gene.editor.context')
  return editorMode?.getCurrentContext?.() ?? null
})

// WorkspaceActionService for direct App-level actions
function getActions() {
  return tsm?.getService('gene.workspace.actions')
}

// Fallback to shared instance tree if no context provided
const instanceTree = useSharedInstanceTree()
const modelRegistry = tsm?.getService('ui.model-browser.composables')?.useSharedModelRegistry()

// Problems service for OCL evaluation
const problemsService = ref<any>(null)

// C-OCL loader for reference filters
const coclLoader = ref<any>(null)

onMounted(async () => {
  problemsService.value = await loadProblemsService()
  coclLoader.value = await loadCoclLoader()
})

// Get selected object from context or fallback to instance tree
const selectedObject = computed(() => {
  if (ctx.value?.selectedObject) {
    return ctx.value.selectedObject.value
  }
  return instanceTree.selectedObject.value
})

// Get root package from context (for metamodel mode - user's classes)
const rootPackage = computed(() => {
  return ctx.value?.rootPackage?.value ?? null
})

// Track EClass for the editor
const currentEClass = computed(() => selectedObject.value?.eClass() ?? null)

// Instance editor composable - recreate when selection changes
const editor = computed(() => {
  if (!selectedObject.value) return null
  // In metamodel mode, include Ecore features (EPackage, EClass properties)
  const isMetamodelMode = ctx.value?.mode === 'metamodel'
  const ed = useInstanceEditor({
    eObject: selectedObject.value,
    eClass: currentEClass.value ?? undefined,
    isNew: false,
    includeEcoreFeatures: isMetamodelMode
  })
  return ed
})

// Current class name
const className = computed(() => {
  return currentEClass.value?.getName() ?? 'Unknown'
})

// Instance name
const instanceName = computed(() => {
  if (!selectedObject.value) return ''
  const nameAttr = currentEClass.value?.getEStructuralFeature('name')
  if (nameAttr) {
    const name = selectedObject.value.eGet(nameAttr)
    if (name) return String(name)
  }
  return 'Instance'
})

// XMI ID for the selected object
const xmiId = computed(() => {
  if (!selectedObject.value) return null
  return getXmiId(selectedObject.value)
})

// Editing state for XMI ID
const editingXmiId = ref(false)
const editXmiIdValue = ref('')

// Start editing XMI ID
function startEditXmiId() {
  editXmiIdValue.value = xmiId.value || ''
  editingXmiId.value = true
}

// Save XMI ID
function saveXmiId() {
  if (selectedObject.value && editXmiIdValue.value.trim()) {
    setXmiId(selectedObject.value, editXmiIdValue.value.trim())
    instanceTree.triggerUpdate()
  }
  editingXmiId.value = false
}

// Cancel editing XMI ID
function cancelEditXmiId() {
  editingXmiId.value = false
}

// Generate new XMI ID
function handleGenerateXmiId() {
  if (selectedObject.value) {
    generateXmiId(selectedObject.value)
    instanceTree.triggerUpdate()
  }
}

// Get display label for an EObject
function getObjectLabel(obj: EObject): string {
  const eClass = obj.eClass()
  const nameAttr = eClass.getEStructuralFeature('name')
  if (nameAttr) {
    const name = obj.eGet(nameAttr)
    if (name) return String(name)
  }
  return eClass.getName()
}

// Breadcrumb items - path from root to selected object
const breadcrumbItems = computed(() => {
  if (!selectedObject.value) return []

  const items: { label: string; data: EObject }[] = []
  let current: EObject | null = selectedObject.value

  // Build path from current to root
  while (current) {
    items.unshift({
      label: getObjectLabel(current),
      data: current
    })
    current = current.eContainer()
  }

  // Convert to breadcrumb format (exclude the last item as it's the current selection)
  return items.slice(0, -1).map(item => ({
    label: item.label,
    command: () => handleNavigate(item.data)
  }))
})

// Home item for breadcrumb (root indicator)
const breadcrumbHome = computed(() => ({
  icon: 'pi pi-home',
  command: () => {
    // Navigate to root if there are breadcrumb items
    if (breadcrumbItems.value.length > 0) {
      const rootItem = breadcrumbItems.value[0]
      if (rootItem.command) rootItem.command()
    }
  }
}))

// Features
const attributeFeatures = computed(() => editor.value?.attributes.value ?? [])
const referenceFeatures = computed(() => editor.value?.references.value ?? [])
const derivedAttributeFeatures = computed(() => editor.value?.derivedAttributes.value ?? [])
const derivedReferenceFeatures = computed(() => editor.value?.derivedReferences.value ?? [])

// Helper to get annotations from an EModelElement (operation, feature, etc.)
function getAnnotationsFromElement(element: any): any[] {
  // Try direct method first
  let annotations = element.getEAnnotations?.()
  if (annotations && (Array.isArray(annotations) || annotations.data)) {
    return annotations.data ?? annotations
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

// Helper to get name from an ENamedElement
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

// Helper to get all operations from an EClass (handles DynamicEObjects)
function getAllOperations(eClass: any): any[] {
  // Try native method first
  if (typeof eClass.getEAllOperations === 'function') {
    const ops = eClass.getEAllOperations()
    if (ops) return Array.isArray(ops) ? ops : (ops.data ?? [])
  }

  // Fallback: get eOperations via eGet (DynamicEObject)
  const metaClass = eClass.eClass?.()
  if (metaClass) {
    const opsFeature = metaClass.getEStructuralFeature?.('eOperations')
    if (opsFeature) {
      const ops = eClass.eGet?.(opsFeature)
      if (ops) {
        const ownOps = Array.isArray(ops) ? ops : (ops.data ?? [])

        // Also collect inherited operations from supertypes
        const allOps = [...ownOps]
        const superTypesFeature = metaClass.getEStructuralFeature?.('eSuperTypes')
        if (superTypesFeature) {
          const supers = eClass.eGet?.(superTypesFeature)
          const superList = supers ? (Array.isArray(supers) ? supers : (supers.data ?? [])) : []
          for (const superType of superList) {
            allOps.push(...getAllOperations(superType))
          }
        }

        return allOps
      }
    }
  }

  return []
}

// Helper to get annotation source string
function getAnnotationSource(annotation: any): string | undefined {
  // Try eGet for DynamicEObject
  const annClass = annotation.eClass?.()
  if (annClass) {
    const sourceFeature = annClass.getEStructuralFeature?.('source')
    if (sourceFeature) {
      const s = annotation.eGet?.(sourceFeature)
      if (s) return String(s)
    }
  }

  // Try eSettings Map
  if (annotation.eSettings instanceof Map) {
    const s = annotation.eSettings.get('source')
    if (s) return String(s)
  }

  // Try direct method/property
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

// Get the value of a detail entry with the given key from an annotation
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

// Get operations with OCL bodies
const operations = computed<EOperation[]>(() => {
  const eClass = currentEClass.value
  if (!eClass) return []

  const allOps = getAllOperations(eClass)

  // Filter to only operations that have OCL annotations with body
  return allOps.filter((op: any) => {
    try {
      const annotations = getAnnotationsFromElement(op)

      for (const annotation of annotations) {
        const source = getAnnotationSource(annotation)
        if (isOclSource(source)) {
          // Found OCL annotation - include this operation
          // OperationField handles body extraction
          return true
        }
      }
      return false
    } catch (e) {
      return false
    }
  })
})

// Parameter dialog state
const showParameterDialog = ref(false)
const selectedOperation = ref<EOperation | null>(null)
const operationCallback = ref<((params: Record<string, unknown>) => void) | null>(null)

// C-OCL derived constraints (for features only defined in C-OCL, not in Ecore)
const coclDerivedConstraints = ref<CoclConstraint[]>([])

// Load C-OCL DERIVED constraints for the current class
async function loadCoclDerivedConstraints() {
  coclDerivedConstraints.value = []

  if (!selectedObject.value || !coclLoader.value?.getConstraintsForClass) {
    return
  }

  try {
    const eClass = selectedObject.value.eClass()
    const className = eClass.getName()
    const pkg = eClass.getEPackage()
    const pkgName = pkg?.getName()
    const fullClassName = pkgName ? `${pkgName}.${className}` : className

    // Get all DERIVED constraints for this class
    const allConstraints = [
      ...(coclLoader.value.getConstraintsForClass?.(fullClassName, 'DERIVED') || []),
      ...(coclLoader.value.getConstraintsForClass?.(className, 'DERIVED') || [])
    ]

    // Filter out duplicates and constraints for features already marked as derived in Ecore
    const ecoreDerivedFeatureNames = new Set([
      ...derivedAttributeFeatures.value.map((f: EStructuralFeature) => f.getName()),
      ...derivedReferenceFeatures.value.map((f: EStructuralFeature) => f.getName())
    ])

    const uniqueConstraints = new Map<string, CoclConstraint>()
    for (const constraint of allConstraints) {
      const key = constraint.featureName || constraint.name
      // Skip if this feature is already in Ecore as derived
      if (ecoreDerivedFeatureNames.has(key)) continue
      // Skip duplicates
      if (!uniqueConstraints.has(key)) {
        uniqueConstraints.set(key, constraint)
      }
    }

    coclDerivedConstraints.value = Array.from(uniqueConstraints.values())
  } catch (e) {
    console.warn('[PropertiesPanel] Error loading C-OCL DERIVED constraints:', e)
  }
}

// Watch for selected object changes to reload C-OCL constraints
watch(selectedObject, () => {
  loadCoclDerivedConstraints()
}, { immediate: true })

// Has any features?
const hasAttributes = computed(() => attributeFeatures.value.length > 0)
const hasReferences = computed(() => referenceFeatures.value.length > 0)
const hasDerivedFeatures = computed(() =>
  derivedAttributeFeatures.value.length > 0 ||
  derivedReferenceFeatures.value.length > 0 ||
  coclDerivedConstraints.value.length > 0
)
const hasOperations = computed(() => operations.value.length > 0)
const hasFeatures = computed(() => hasAttributes.value || hasReferences.value || hasDerivedFeatures.value || hasOperations.value)

// Get value for feature
function getFeatureValue(feature: EStructuralFeature): any {
  return editor.value?.getValue(feature)
}

// Set value for feature
function setFeatureValue(feature: EStructuralFeature, value: any) {
  editor.value?.setValue(feature, value)
  // Notify context that data changed (for dirty tracking)
  if (ctx.value?.markDirty) {
    ctx.value.markDirty()
  }
  // Also trigger update for tree refresh
  if (ctx.value?.triggerUpdate) {
    ctx.value.triggerUpdate()
  }
}

// Get error for feature
function getFeatureError(feature: EStructuralFeature): string | undefined {
  return editor.value?.errors.value.get(feature.getName())
}

// Check if a class is a subtype of another
function isSubtypeOf(subClass: EClass, superClass: EClass): boolean {
  if (subClass === superClass) return true
  try {
    const superTypes = typeof subClass.getESuperTypes === 'function' ? subClass.getESuperTypes() : []
    if (superTypes && (Array.isArray(superTypes) || (superTypes as any)[Symbol.iterator])) {
      for (const superType of superTypes) {
        if (isSubtypeOf(superType, superClass)) return true
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return false
}

// Helper to get reference type - handles both native EReference and DynamicEObject
function getReferenceType(ref: EReference): EClass | null {
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
    // Handle unresolved proxy: resolve via model registry by parsing the proxy URI
    if (eType && typeof (eType as any).eIsProxy === 'function' && (eType as any).eIsProxy()) {
      const proxyURI = (eType as any).eProxyURI?.()?.toString?.() || ''
      const hashIdx = proxyURI.indexOf('#//')
      if (hashIdx >= 0) {
        const nsURI = proxyURI.substring(0, hashIdx)
        const className = proxyURI.substring(hashIdx + 3) // after #//
        // Look up in model registry
        const pkg = modelRegistry.allPackages.value.find(p => p.nsURI === nsURI)
        if (pkg) {
          const cls = modelRegistry.getAllClasses(pkg).find(c => c.name === className)
          if (cls?.eClass) {
            return cls.eClass
          }
        }
      }
    }
  }
  return null
}

// Helper to check if a class is abstract - handles both native EClass and DynamicEObject
function isClassAbstract(eClass: EClass): boolean {
  if (typeof eClass.isAbstract === 'function') {
    return eClass.isAbstract()
  }
  // DynamicEObject - try eGet
  try {
    const metaClass = (eClass as any).eClass?.()
    if (metaClass) {
      const abstractFeature = metaClass.getEStructuralFeature?.('abstract')
      if (abstractFeature) {
        return (eClass as any).eGet?.(abstractFeature) ?? false
      }
    }
  } catch { /* ignore */ }
  return false
}

// Helper to check if a class is interface - handles both native EClass and DynamicEObject
function isClassInterface(eClass: EClass): boolean {
  if (typeof eClass.isInterface === 'function') {
    return eClass.isInterface()
  }
  // DynamicEObject - try eGet
  try {
    const metaClass = (eClass as any).eClass?.()
    if (metaClass) {
      const interfaceFeature = metaClass.getEStructuralFeature?.('interface')
      if (interfaceFeature) {
        return (eClass as any).eGet?.(interfaceFeature) ?? false
      }
    }
  } catch { /* ignore */ }
  return false
}

// Get available objects for a non-containment reference
function getAvailableObjects(feature: EStructuralFeature): EObject[] {
  const ref = feature as EReference
  const containment = ref.isContainment()
  if (containment) {
    return []
  }

  const refType = getReferenceType(ref)
  if (!refType) {
    return []
  }

  // Get all objects of the reference type from the instance tree
  return instanceTree.getAllObjectsOfType(refType)
}

// Get valid child classes for a containment reference (including subclasses of abstract types)
function getValidChildClasses(feature: EStructuralFeature): EClass[] {
  const ref = feature as EReference
  if (!ref.isContainment()) return []

  const refType = getReferenceType(ref)
  if (!refType) return []

  const validClasses: EClass[] = []

  // If the reference type itself is concrete, include it
  if (!isClassAbstract(refType) && !isClassInterface(refType)) {
    validClasses.push(refType)
  }

  // Find all concrete classes from all loaded packages that are subtypes of the reference type
  for (const pkg of modelRegistry.allPackages.value) {
    const concreteClasses = modelRegistry.getConcreteClasses(pkg)
    for (const classInfo of concreteClasses) {
      if (isSubtypeOf(classInfo.eClass, refType)) {
        if (!validClasses.includes(classInfo.eClass)) {
          validClasses.push(classInfo.eClass)
        }
      }
    }
  }

  return validClasses
}

// Save handler
async function handleSave() {
  if (!editor.value?.validate()) {
    return
  }
  editor.value.save()
}

// Reset handler
function handleReset() {
  editor.value?.reset()
}

// Handle create child for containment references
function handleCreate(eClass: EClass, feature: EStructuralFeature) {
  if (!selectedObject.value) return

  // In metamodel mode, use context.createChild (metamodeler's createChild)
  if (ctx.value?.mode === 'metamodel' && ctx.value.createChild) {
    const newObj = ctx.value.createChild(selectedObject.value, feature as EReference, eClass)
    if (ctx.value.triggerUpdate) ctx.value.triggerUpdate()
    return
  }

  // Instance mode: use instanceTree.createChild which handles:
  // - Creating the instance
  // - Adding to containment
  // - Triggering UI update
  // - Expanding parent and selecting new object
  const newObj = instanceTree.createChild(eClass, feature as EReference)
}

// Handle navigation to a referenced object
function handleNavigate(obj: EObject) {
  // Select the object in the instance tree (this will also expand parent nodes)
  instanceTree.selectObject(obj)
}

// Handle search request from ReferenceField
function handleSearch(feature: EReference, callback: (obj: EObject) => void) {
  const resource = getSharedResource()
  if (resource) {
    const actions = getActions()
    if (actions) {
      actions.openSearchDialog({ feature, resource, callback })
    }
  }
}

/**
 * Extract OCL referenceFilter from:
 * 1. C-OCL files (higher priority)
 * 2. Ecore annotations (fallback)
 */
function getOclFilter(feature: EStructuralFeature): string | undefined {
  const featureName = feature.getName()

  // First, try C-OCL reference filter
  if (coclLoader.value?.getReferenceFilterConstraint && selectedObject.value) {
    try {
      const eClass = selectedObject.value.eClass()
      const className = eClass.getName()
      // Try with full qualified name first (package.ClassName), then simple name
      const pkg = eClass.getEPackage()
      const pkgName = pkg?.getName()
      const fullClassName = pkgName ? `${pkgName}.${className}` : className

      // Try full name first, then simple name
      let constraint = coclLoader.value.getReferenceFilterConstraint(fullClassName, featureName)
      if (!constraint) {
        constraint = coclLoader.value.getReferenceFilterConstraint(className, featureName)
      }

      if (constraint) {
        return constraint.expression
      }
    } catch (e) {
      console.warn('[PropertiesPanel] Error getting C-OCL reference filter:', e)
    }
  }

  // Fallback: try Ecore annotation
  try {
    const annotations = getAnnotationsFromElement(feature)

    for (const annotation of annotations) {
      const source = getAnnotationSource(annotation)
      if (isOclSource(source)) {
        const value = getAnnotationDetailValue(annotation, 'referenceFilter')
        if (value) return value
      }
    }
  } catch (e) {
    console.warn('[PropertiesPanel] Error getting OCL referenceFilter:', e)
  }
  return undefined
}

// Provide editor context for custom editors (inject from custom property editors)
provide(GENE_EDITOR_CONTEXT_KEY, {
  getAvailableObjects,
  getValidChildClasses,
  getOclFilter,
  problemsService: problemsService.value,
  handleNavigate,
  handleSearch,
  mode: ctx.value?.mode ?? 'instance',
  rootPackage: rootPackage.value
})

/**
 * Handle OCL blocked assignment attempt
 */
function handleOclBlocked(object: EObject, reason: string) {
  // Add issue to problems service
  if (problemsService.value?.addIssue) {
    problemsService.value.addIssue({
      severity: 'warning',
      message: `Reference assignment blocked: ${reason}`,
      source: 'ocl-filter',
      object,
      objectLabel: getObjectLabel(object),
      eClassName: object.eClass().getName()
    })
  }

  // Show problems panel
  const actions = getActions()
  if (actions) {
    actions.showProblemsPanel()
  } else {
    // Fallback to EventBus
    const eventBus = tsm?.getService('gene.eventbus')
    if (eventBus) {
      eventBus.emit('show-problems')
    }
  }
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
</script>

<template>
  <div class="properties-panel">
    <!-- Header -->
    <div class="panel-header">
      <span class="header-title">Properties</span>
      <div v-if="editor?.isDirty.value" class="header-actions">
        <Button
          icon="pi pi-refresh"
          text
          rounded
          size="small"
          @click="handleReset"
          v-tooltip.bottom="'Reset'"
        />
        <Button
          icon="pi pi-save"
          text
          rounded
          size="small"
          @click="handleSave"
          v-tooltip.bottom="'Save'"
        />
      </div>
    </div>

    <!-- No selection -->
    <div v-if="!selectedObject" class="empty-state">
      <i class="pi pi-file-edit"></i>
      <p>No object selected</p>
      <p class="hint">Select an object in the instance tree to edit its properties</p>
    </div>

    <!-- Properties content -->
    <div v-else class="panel-content">
      <!-- Breadcrumbs -->
      <Breadcrumb
        v-if="breadcrumbItems.length > 0"
        :model="breadcrumbItems"
        :home="breadcrumbHome"
        class="instance-breadcrumb"
      />

      <!-- Object info -->
      <div class="object-info">
        <span class="class-name">{{ className }}</span>
        <span class="instance-name">{{ instanceName }}</span>
        <span v-if="editor?.isDirty.value" class="dirty-indicator" title="Unsaved changes">*</span>
      </div>

      <!-- XMI ID -->
      <div class="xmi-id-row">
        <label class="xmi-id-label">XMI ID:</label>
        <template v-if="editingXmiId">
          <InputText
            v-model="editXmiIdValue"
            size="small"
            class="xmi-id-input"
            @keyup.enter="saveXmiId"
            @keyup.escape="cancelEditXmiId"
          />
          <Button
            icon="pi pi-check"
            text
            rounded
            size="small"
            @click="saveXmiId"
            v-tooltip.bottom="'Save'"
          />
          <Button
            icon="pi pi-times"
            text
            rounded
            size="small"
            @click="cancelEditXmiId"
            v-tooltip.bottom="'Cancel'"
          />
        </template>
        <template v-else>
          <span class="xmi-id-value" :class="{ 'no-id': !xmiId }">
            {{ xmiId || '(no ID)' }}
          </span>
          <Button
            icon="pi pi-pencil"
            text
            rounded
            size="small"
            @click="startEditXmiId"
            v-tooltip.bottom="'Edit ID'"
          />
          <Button
            icon="pi pi-refresh"
            text
            rounded
            size="small"
            @click="handleGenerateXmiId"
            v-tooltip.bottom="'Generate new UUID'"
          />
        </template>
      </div>

      <!-- Validation errors -->
        <Message v-if="editor?.errors.value.size ?? 0 > 0" severity="error" :closable="false" class="validation-message">
          Please fix the validation errors below.
        </Message>

        <!-- No features -->
        <div v-if="!hasFeatures" class="empty-features">
          <i class="pi pi-info-circle"></i>
          <span>This class has no editable properties.</span>
        </div>

        <!-- Attributes -->
        <Fieldset v-if="hasAttributes" legend="Attributes" :toggleable="true" class="properties-fieldset">
        <div class="fields-grid">
          <PropertyField
            v-for="feature in attributeFeatures"
            :key="feature.getName()"
            :feature="feature"
            :eObject="selectedObject!"
            :value="getFeatureValue(feature)"
            @update:value="(v) => setFeatureValue(feature, v)"
            :error="getFeatureError(feature)"
          />
        </div>
      </Fieldset>

      <!-- References -->
      <Fieldset v-if="hasReferences" legend="References" :toggleable="true" class="properties-fieldset">
        <div class="fields-grid">
          <PropertyField
            v-for="feature in referenceFeatures"
            :key="feature.getName()"
            :feature="feature"
            :eObject="selectedObject!"
            :value="getFeatureValue(feature)"
            @update:value="(v) => setFeatureValue(feature, v)"
            @create="(eClass) => handleCreate(eClass, feature)"
            @navigate="handleNavigate"
            @search="handleSearch"
            @ocl-blocked="handleOclBlocked"
            :error="getFeatureError(feature)"
            :validChildClasses="getValidChildClasses(feature)"
            :availableObjects="getAvailableObjects(feature)"
            :rootPackage="rootPackage"
            :oclFilter="getOclFilter(feature)"
            :problemsService="problemsService"
          />
        </div>
      </Fieldset>

      <!-- Derived Values -->
      <Fieldset v-if="hasDerivedFeatures" legend="Derived Values" :toggleable="true" class="properties-fieldset">
        <div class="fields-grid">
          <!-- Ecore-defined derived features -->
          <DerivedField
            v-for="feature in derivedAttributeFeatures"
            :key="feature.getName()"
            :feature="feature"
            :eObject="selectedObject!"
            :problemsService="problemsService"
            @navigate="handleNavigate"
          />
          <DerivedField
            v-for="feature in derivedReferenceFeatures"
            :key="feature.getName()"
            :feature="feature"
            :eObject="selectedObject!"
            :problemsService="problemsService"
            @navigate="handleNavigate"
          />
          <!-- C-OCL-only derived features -->
          <CoclDerivedField
            v-for="constraint in coclDerivedConstraints"
            :key="constraint.name"
            :constraint="constraint"
            :eObject="selectedObject!"
            :problemsService="problemsService"
            @navigate="handleNavigate"
          />
        </div>
      </Fieldset>

      <!-- Operations -->
      <Fieldset v-if="hasOperations" legend="Operations" :toggleable="true" class="properties-fieldset">
        <div class="operations-list">
          <OperationField
            v-for="(op, idx) in operations"
            :key="getElementName(op) + '-' + idx"
            :operation="op"
            :eObject="selectedObject!"
            :problemsService="problemsService"
            :autoExecute="false"
            @navigate="handleNavigate"
            @open-parameter-dialog="handleOpenParameterDialog"
          />
        </div>
      </Fieldset>
    </div>

    <!-- Operation Parameter Dialog -->
    <OperationParameterDialog
      v-model:visible="showParameterDialog"
      :operation="selectedOperation"
      :eObject="selectedObject"
      @execute="handleExecuteWithParams"
      @cancel="handleCancelParameterDialog"
    />
  </div>
</template>

<style scoped>
.properties-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-ground);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-section);
}

.header-title {
  font-weight: 600;
  font-size: 0.875rem;
  text-transform: uppercase;
  color: var(--text-color-secondary);
}

.header-actions {
  display: flex;
  gap: 0.25rem;
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
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state .hint {
  font-size: 0.875rem;
  opacity: 0.7;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.object-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--surface-border);
}

.class-name {
  font-weight: 600;
  color: var(--primary-color);
}

.instance-name {
  color: var(--text-color-secondary);
}

.dirty-indicator {
  font-size: 1.25rem;
  color: var(--orange-500);
  font-weight: bold;
}

.xmi-id-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.85rem;
}

.xmi-id-label {
  color: var(--text-color-secondary);
  font-weight: 500;
  min-width: 50px;
}

.xmi-id-value {
  font-family: monospace;
  color: var(--text-color);
  background: var(--surface-ground);
  padding: 0.15rem 0.4rem;
  border-radius: var(--border-radius);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.xmi-id-value.no-id {
  color: var(--text-color-secondary);
  font-style: italic;
  font-family: inherit;
}

.xmi-id-input {
  flex: 1;
  font-family: monospace;
  font-size: 0.85rem;
}

.instance-breadcrumb {
  background: transparent;
  padding: 0;
  border: none;
}

:deep(.instance-breadcrumb .p-breadcrumb-list) {
  flex-wrap: wrap;
  gap: 0.25rem;
}

:deep(.instance-breadcrumb .p-breadcrumb-item-link) {
  color: var(--text-color-secondary);
  font-size: 0.8rem;
  padding: 0.15rem 0.35rem;
  border-radius: var(--border-radius);
  transition: background 0.15s, color 0.15s;
}

:deep(.instance-breadcrumb .p-breadcrumb-item-link:hover) {
  background: var(--surface-hover);
  color: var(--text-color);
}

:deep(.instance-breadcrumb .p-breadcrumb-separator) {
  color: var(--text-color-muted);
  margin: 0 0.15rem;
}

.validation-message {
  margin: 0;
}

.empty-features {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  color: var(--text-color-secondary);
}

.properties-fieldset {
  margin: 0;
}

.fields-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.operations-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* PrimeVue 4 Fieldset Styles */
:deep(.p-fieldset) {
  background: var(--surface-card);
  border-radius: var(--border-radius);
  border: 1px solid var(--surface-border);
}

:deep(.p-fieldset-legend) {
  font-weight: 600;
  font-size: 0.875rem;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--surface-border);
  border-radius: var(--border-radius);
  background: var(--surface-ground);
}

:deep(.p-fieldset-content) {
  padding: 0.75rem;
}

:deep(.p-fieldset-toggle-icon) {
  margin-right: 0.5rem;
}
</style>
