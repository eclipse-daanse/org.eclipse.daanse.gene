<script setup lang="ts">
/**
 * CoclEditor - Main component for the C-OCL Constraint Editor.
 *
 * Combines ConstraintList (left) and ConstraintForm (right) into
 * a full-screen editor for .c-ocl constraint files.
 */

import { ref, computed, onMounted, reactive, inject, watch } from 'tsm:vue'
import { InputText, Button, Dialog, Tree } from 'tsm:primevue'
import type { CoclConstraint, CoclConstraintSet } from 'ui-problems-panel'
import { loadCoclFromString } from 'ui-problems-panel'
import { useSharedModelRegistry } from 'ui-model-browser'
import { SearchDialog } from 'ui-search'
import { getSharedOclClient } from 'transformation'
import { serializeCoclToXml } from '../composables/useCoclSerializer'
import { useCoclAtlas } from '../composables/useCoclAtlas'
import ConstraintList from './ConstraintList.vue'
import ConstraintForm from './ConstraintForm.vue'

// TSM service access
const _tsm = inject<any>('tsm')
const atlas = useCoclAtlas(_tsm)

// Server dialog state
const showServerListDialog = ref(false)
const serverConfigs = ref<any[]>([])

// Reactive state
const constraintSet = ref<CoclConstraintSet | null>(null)
const selectedConstraintName = ref<string | null>(null)
const isDirty = ref(false)
const saveStatus = ref<'saved' | 'dirty' | 'saving' | 'error'>('saved')

// Data from the window global (set by App.vue)
let fileEntry: any = null
let filePath: string = ''

// Model registry for context class dropdown
const modelRegistry = useSharedModelRegistry()

const contextClassOptions = computed((): string[] => {
  const options: string[] = []
  for (const pkgInfo of modelRegistry.allPackages.value) {
    const pkg = pkgInfo.ePackage
    const nsURI = pkg.getNsURI?.() || ''
    collectClassURIs(pkg, nsURI, options)
  }
  return options.sort()
})

function collectClassURIs(pkg: any, nsURI: string, result: string[]) {
  const classifiers = pkg.getEClassifiers?.() || []
  for (const classifier of Array.from(classifiers)) {
    if ('getEAttributes' in classifier || 'getEAllAttributes' in classifier) {
      const className = (classifier as any).getName?.() || ''
      if (className && nsURI) {
        result.push(`${nsURI}#//${className}`)
      }
    }
  }

  const subPackages = pkg.getESubpackages?.() || []
  for (const subPkg of Array.from(subPackages)) {
    const subNsURI = subPkg.getNsURI?.() || nsURI
    collectClassURIs(subPkg, subNsURI, result)
  }
}

// --- Class Search via SearchDialog ---
const showClassSearch = ref(false)

// Get the metamodel Resource for the SearchDialog
const metamodelResource = computed(() => {
  const targetURIs = constraintSet.value?.targetModelNsURIs || []
  // Try to find a package matching the targetNsURIs first
  for (const pkgInfo of modelRegistry.allPackages.value) {
    if (targetURIs.includes(pkgInfo.nsURI)) {
      const resource = pkgInfo.ePackage.eResource?.()
      if (resource) return resource
    }
  }
  // Fallback: first available package's resource
  for (const pkgInfo of modelRegistry.allPackages.value) {
    const resource = pkgInfo.ePackage.eResource?.()
    if (resource) return resource
  }
  return null
})

function handleOpenClassSearch() {
  if (metamodelResource.value) {
    showClassSearch.value = true
  }
}

function handleClassSearchSelect(hit: any) {
  const obj = hit?.object || hit
  try {
    // Build qualified class name from the selected EObject
    // The object could be an EClass, EPackage, or other metamodel element
    const objMetaClass = obj.eClass?.()?.getName?.()
    const name = obj.getName?.()
    if (!name) return

    let qualifiedName = name

    // If this is an EClass, build nsURI#//ClassName format
    if (objMetaClass === 'EClass') {
      // Walk up to find the EPackage with nsURI
      let container = obj.eContainer?.()
      while (container) {
        const nsURI = container.getNsURI?.()
        if (nsURI) {
          qualifiedName = `${nsURI}#//${name}`
          break
        }
        const parent = container.eContainer?.()
        if (!parent || parent === container) break
        container = parent
      }
    }

    // Update the selected constraint's contextClass
    if (constraintSet.value && selectedConstraintName.value) {
      const idx = constraintSet.value.constraints.findIndex(c => c.name === selectedConstraintName.value)
      if (idx >= 0) {
        constraintSet.value.constraints[idx] = {
          ...constraintSet.value.constraints[idx],
          contextClass: qualifiedName
        }
        markDirty()
      }
    }
  } catch (e) {
    console.warn('[CoclEditor] Failed to extract class from search hit:', e)
  }
  showClassSearch.value = false
}

// --- Class Tree Picker ---
const showClassTree = ref(false)
const classTreeExpandedKeys = ref<Record<string, boolean>>({})

// Filter treeNodes to only show packages and classes (no attributes/references/enums)
const classTreeNodes = computed(() => {
  return filterClassNodes(modelRegistry.treeNodes.value)
})

function filterClassNodes(nodes: any[]): any[] {
  return nodes
    .map(node => {
      if (node.type === 'class') {
        // Class nodes are leaf in this tree (no need to show attributes/refs)
        return { ...node, children: undefined, leaf: true, selectable: true }
      }
      if (node.type === 'package' || node.type === 'subpackage') {
        const filteredChildren = filterClassNodes(node.children || [])
        if (filteredChildren.length === 0) return null
        return { ...node, children: filteredChildren, leaf: false, selectable: false }
      }
      return null // Skip attributes, references, enums, constraints
    })
    .filter(Boolean)
}

function handleOpenClassTree() {
  // Auto-expand all packages
  const keys: Record<string, boolean> = {}
  for (const node of modelRegistry.treeNodes.value) {
    keys[node.key] = true
    if (node.children) {
      for (const child of node.children) {
        if (child.type === 'package' || child.type === 'subpackage') {
          keys[child.key] = true
        }
      }
    }
  }
  classTreeExpandedKeys.value = keys
  showClassTree.value = true
}

function handleClassTreeSelect(node: any) {
  if (node.type !== 'class') return

  // Build qualified name from the EClass
  const eClass = node.data?.eClass
  if (!eClass) return

  const name = eClass.getName?.()
  if (!name) return

  // Walk eContainer() chain to find EPackage with nsURI
  let qualifiedName = name
  let container = eClass.eContainer?.()
  while (container) {
    const nsURI = container.getNsURI?.()
    if (nsURI) {
      qualifiedName = `${nsURI}#//${name}`
      break
    }
    const parent = container.eContainer?.()
    if (!parent || parent === container) break
    container = parent
  }

  // Update the selected constraint's contextClass
  if (constraintSet.value && selectedConstraintName.value) {
    const idx = constraintSet.value.constraints.findIndex(c => c.name === selectedConstraintName.value)
    if (idx >= 0) {
      constraintSet.value.constraints[idx] = {
        ...constraintSet.value.constraints[idx],
        contextClass: qualifiedName
      }
      markDirty()
    }
  }
  showClassTree.value = false
}

// Selected constraint (reactive copy)
const selectedConstraint = computed((): CoclConstraint | null => {
  if (!constraintSet.value || !selectedConstraintName.value) return null
  return constraintSet.value.constraints.find(c => c.name === selectedConstraintName.value) || null
})

// Find EClass by contextClass string (URI format: "nsURI#//ClassName")
function findEClassByContextName(contextClass: string): any | null {
  if (!contextClass) return null

  // Parse URI format: nsURI#//ClassName
  const hashIdx = contextClass.indexOf('#//')
  if (hashIdx < 0) return null

  const nsURI = contextClass.substring(0, hashIdx)
  const className = contextClass.substring(hashIdx + 3)

  for (const pkgInfo of modelRegistry.allPackages.value) {
    const pkg = pkgInfo.ePackage
    if (pkg.getNsURI?.() === nsURI) {
      const found = findClassInPackage(pkg, className)
      if (found) return found
    }
  }
  return null
}

function findClassInPackage(pkg: any, className: string): any | null {
  const classifiers = pkg.getEClassifiers?.() || []
  for (const classifier of Array.from(classifiers)) {
    const cName = (classifier as any).getName?.()
    if (cName === className) return classifier
  }

  const subPackages = pkg.getESubpackages?.() || []
  for (const subPkg of Array.from(subPackages)) {
    const found = findClassInPackage(subPkg, className)
    if (found) return found
  }
  return null
}

// Feature name options for the selected constraint's contextClass + role
const featureNameOptions = computed((): string[] => {
  const constraint = selectedConstraint.value
  if (!constraint?.contextClass) return []
  if (constraint.role !== 'DERIVED' && constraint.role !== 'REFERENCE_FILTER') return []

  const eClass = findEClassByContextName(constraint.contextClass)
  if (!eClass) return []

  const names: string[] = []
  if (constraint.role === 'DERIVED') {
    // Show attributes
    const attrs = eClass.getEAllAttributes?.() || eClass.getEAttributes?.() || []
    for (const attr of attrs) {
      const n = attr.getName?.()
      if (n) names.push(n)
    }
  } else {
    // REFERENCE_FILTER — show references
    const refs = eClass.getEAllReferences?.() || eClass.getEReferences?.() || []
    for (const ref of refs) {
      const n = ref.getName?.()
      if (n) names.push(n)
    }
  }
  return names.sort()
})

// Target NS URIs as comma-separated string for editing
const targetNsURIsText = computed({
  get: () => constraintSet.value?.targetModelNsURIs.join(', ') || '',
  set: (val: string) => {
    if (!constraintSet.value) return
    constraintSet.value.targetModelNsURIs = val.split(',').map(s => s.trim()).filter(Boolean)
    markDirty()
  }
})

function markDirty() {
  isDirty.value = true
  saveStatus.value = 'dirty'
  updateTargetNsURIs()
}

/** Auto-compute targetModelNsURIs from constraint contextClass values */
function updateTargetNsURIs() {
  if (!constraintSet.value) return
  const nsURIs = new Set<string>()
  for (const c of constraintSet.value.constraints) {
    if (c.contextClass?.includes('#//')) {
      const nsURI = c.contextClass.split('#//')[0]
      if (nsURI) nsURIs.add(nsURI)
    }
  }
  constraintSet.value.targetModelNsURIs = Array.from(nsURIs)
}

// Load the .c-ocl data
onMounted(async () => {
  const data = _tsm?.getService('gene.cocl.data')
  if (!data) {
    console.warn('[CoclEditor] No C-OCL data found via gene.cocl.data service')
    return
  }

  filePath = data.filePath || ''
  fileEntry = data.fileEntry || null

  try {
    const parsed = await loadCoclFromString(data.content, filePath)
    if (parsed) {
      // Make a deep reactive copy so we can edit without affecting the cached version
      constraintSet.value = JSON.parse(JSON.stringify(parsed))
      console.log('[CoclEditor] Loaded constraint set:', parsed.name, 'with', parsed.constraints.length, 'constraints')

      // Auto-select first constraint
      if (constraintSet.value!.constraints.length > 0) {
        selectedConstraintName.value = constraintSet.value!.constraints[0].name
      }
    }
  } catch (e) {
    console.error('[CoclEditor] Failed to parse C-OCL:', e)
  }

  // Register all loaded metamodel packages with the OCL LSP for autocompletion
  registerPackagesWithOcl()
})

// Register metamodel packages with OCL LSP for autocompletion
function registerPackagesWithOcl() {
  try {
    const oclClient = getSharedOclClient()
    for (const pkgInfo of modelRegistry.allPackages.value) {
      oclClient.registerPackage(pkgInfo.ePackage)
    }
    console.log('[CoclEditor] Registered', modelRegistry.allPackages.value.length, 'packages with OCL LSP')
  } catch (e) {
    console.warn('[CoclEditor] Failed to register packages with OCL LSP:', e)
  }
}

// Re-register when new packages are loaded
watch(() => modelRegistry.allPackages.value.length, () => {
  registerPackagesWithOcl()
})

// Create new empty constraint set
function handleNew() {
  constraintSet.value = {
    name: 'NewConstraints',
    version: '1.0',
    description: '',
    targetModelNsURIs: [],
    constraints: []
  }
  selectedConstraintName.value = null
  fileEntry = null
  filePath = ''
  isDirty.value = true
  saveStatus.value = 'dirty'
  registerPackagesWithOcl()
}

// Handlers
function handleSelect(name: string) {
  selectedConstraintName.value = name
}

function handleAdd() {
  if (!constraintSet.value) return

  const baseName = 'NewConstraint'
  let name = baseName
  let counter = 1
  while (constraintSet.value.constraints.some(c => c.name === name)) {
    name = `${baseName}${counter++}`
  }

  const newConstraint: CoclConstraint = {
    name,
    description: '',
    expression: 'true',
    severity: 'ERROR',
    role: 'VALIDATION',
    contextClass: contextClassOptions.value[0] || '',
    active: true,
    overrides: false,
    targetURIs: []
  }

  constraintSet.value.constraints.push(newConstraint)
  selectedConstraintName.value = name
  markDirty()
}

function handleRemove(name: string) {
  if (!constraintSet.value) return
  const idx = constraintSet.value.constraints.findIndex(c => c.name === name)
  if (idx < 0) return

  constraintSet.value.constraints.splice(idx, 1)

  // Select adjacent constraint
  if (constraintSet.value.constraints.length > 0) {
    const newIdx = Math.min(idx, constraintSet.value.constraints.length - 1)
    selectedConstraintName.value = constraintSet.value.constraints[newIdx].name
  } else {
    selectedConstraintName.value = null
  }
  markDirty()
}

function handleMoveUp(name: string) {
  if (!constraintSet.value) return
  const idx = constraintSet.value.constraints.findIndex(c => c.name === name)
  if (idx <= 0) return
  const arr = constraintSet.value.constraints
  ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
  markDirty()
}

function handleMoveDown(name: string) {
  if (!constraintSet.value) return
  const arr = constraintSet.value.constraints
  const idx = arr.findIndex(c => c.name === name)
  if (idx < 0 || idx >= arr.length - 1) return
  ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
  markDirty()
}

function handleConstraintUpdate(updated: CoclConstraint) {
  if (!constraintSet.value) return
  const idx = constraintSet.value.constraints.findIndex(c => c.name === selectedConstraintName.value)
  if (idx < 0) return

  // If name changed, update the selection
  if (updated.name !== selectedConstraintName.value) {
    selectedConstraintName.value = updated.name
  }

  constraintSet.value.constraints[idx] = updated
  markDirty()
}

function handleSetFieldUpdate(field: string, value: string) {
  if (!constraintSet.value) return
  ;(constraintSet.value as any)[field] = value
  markDirty()
}

async function handleSave() {
  if (!constraintSet.value) return

  // No file yet — redirect to Save As
  if (!fileEntry) {
    return handleSaveAs()
  }

  saveStatus.value = 'saving'

  try {
    const xml = serializeCoclToXml(constraintSet.value)

    // Write file via global file system
    const geneFS = _tsm?.getService('gene.filesystem')
    if (geneFS && fileEntry) {
      await geneFS.writeTextFile(fileEntry, xml)
      console.log('[CoclEditor] File saved:', filePath)
    } else {
      console.warn('[CoclEditor] No file system or file entry available, logging XML')
      console.log(xml)
    }

    // Reload in ProblemsService
    try {
      const { useSharedProblemsService } = await import('ui-problems-panel')
      const problemsService = useSharedProblemsService()
      await problemsService.loadCoclFile(xml, filePath)
      console.log('[CoclEditor] Constraints reloaded in ProblemsService')
    } catch (e) {
      console.warn('[CoclEditor] Failed to reload in ProblemsService:', e)
    }

    isDirty.value = false
    saveStatus.value = 'saved'
  } catch (e) {
    console.error('[CoclEditor] Save failed:', e)
    saveStatus.value = 'error'
  }
}

async function handleSaveAs() {
  if (!constraintSet.value) return

  const xml = serializeCoclToXml(constraintSet.value)
  const defaultName = constraintSet.value.name
    ? `${constraintSet.value.name}.c-ocl`
    : 'constraints.c-ocl'

  // Use File System Access API if available
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: defaultName,
      })
      const writable = await handle.createWritable()
      await writable.write(xml)
      await writable.close()
      console.log('[CoclEditor] File saved via Save As')
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('[CoclEditor] Save As failed:', e)
      }
    }
  } else {
    // Fallback: download via blob
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = defaultName
    a.click()
    URL.revokeObjectURL(url)
  }
}

function handleDiscard() {
  // Reload from original data
  const data = _tsm?.getService('gene.cocl.data')
  if (!data) return

  loadCoclFromString(data.content, filePath).then(parsed => {
    if (parsed) {
      constraintSet.value = JSON.parse(JSON.stringify(parsed))
      if (constraintSet.value!.constraints.length > 0) {
        selectedConstraintName.value = constraintSet.value!.constraints[0].name
      } else {
        selectedConstraintName.value = null
      }
      isDirty.value = false
      saveStatus.value = 'saved'
    }
  })
}

// --- Atlas Server ---

async function handleUploadToServer() {
  if (!constraintSet.value) return
  const xml = serializeCoclToXml(constraintSet.value)
  const name = constraintSet.value.name || 'Unnamed'
  const version = constraintSet.value.version || '1.0'
  const id = constraintSet.value.id

  const result = await atlas.uploadConstraintSet(xml, name, version, id)
  if (result.success) {
    console.log(`[CoclEditor] Uploaded to server: ${name} v${version}`)
  } else {
    console.error('[CoclEditor] Upload failed:', atlas.error.value)
  }
}

async function handleLoadFromServer() {
  showServerListDialog.value = true
  serverConfigs.value = await atlas.listConstraintSets()
}

async function handleSelectServerConfig(cfg: any) {
  showServerListDialog.value = false
  const xmi = await atlas.loadConstraintSet(cfg.objectId, cfg.stage)
  if (xmi) {
    const parsed = await loadCoclFromString(xmi, `server:${cfg.name}`)
    if (parsed) {
      constraintSet.value = JSON.parse(JSON.stringify(parsed))
      if (constraintSet.value!.constraints.length > 0) {
        selectedConstraintName.value = constraintSet.value!.constraints[0].name
      }
      isDirty.value = false
      saveStatus.value = 'saved'
      console.log(`[CoclEditor] Loaded from server: ${cfg.name}`)
    }
  }
}
</script>

<template>
  <div class="cocl-editor" v-if="constraintSet">
    <!-- Header -->
    <div class="editor-header">
      <div class="header-fields">
        <div class="header-field">
          <label>Name</label>
          <InputText
            :modelValue="constraintSet.name"
            @update:modelValue="handleSetFieldUpdate('name', $event)"
            size="small"
            class="header-input"
          />
        </div>
        <div class="header-field" style="width: 80px">
          <label>Version</label>
          <InputText
            :modelValue="constraintSet.version"
            @update:modelValue="handleSetFieldUpdate('version', $event)"
            size="small"
            class="header-input"
          />
        </div>
        <div class="header-field flex-1">
          <label>Description</label>
          <InputText
            :modelValue="constraintSet.description || ''"
            @update:modelValue="handleSetFieldUpdate('description', $event)"
            size="small"
            placeholder="Optional description"
            class="header-input"
          />
        </div>
        <div class="header-field flex-1">
          <label>Target NS URIs</label>
          <InputText
            v-model="targetNsURIsText"
            size="small"
            placeholder="Comma-separated namespace URIs"
            class="header-input"
          />
        </div>
      </div>
      <div class="header-actions">
        <Button
          icon="pi pi-file"
          severity="secondary"
          size="small"
          @click="handleNew"
          title="New constraint file"
          text
        />
        <span v-if="isDirty" class="unsaved-badge">Unsaved</span>
        <Button
          icon="pi pi-save"
          severity="secondary"
          size="small"
          :disabled="!isDirty || saveStatus === 'saving'"
          :loading="saveStatus === 'saving'"
          @click="handleSave"
          title="Save"
          text
        />
        <Button
          icon="pi pi-file-export"
          severity="secondary"
          size="small"
          @click="handleSaveAs"
          title="Save As..."
          text
        />
        <Button
          icon="pi pi-cloud-upload"
          severity="secondary"
          size="small"
          @click="handleUploadToServer"
          title="Upload to Server"
          :loading="atlas.loading.value"
          text
        />
        <Button
          icon="pi pi-cloud-download"
          severity="secondary"
          size="small"
          @click="handleLoadFromServer"
          title="Load from Server"
          text
        />
        <Button
          icon="pi pi-undo"
          severity="secondary"
          size="small"
          :disabled="!isDirty"
          @click="handleDiscard"
          title="Discard changes"
          text
        />
      </div>
    </div>

    <!-- Main content area -->
    <div class="editor-content">
      <div class="list-panel">
        <ConstraintList
          :constraints="constraintSet.constraints"
          :selectedId="selectedConstraintName"
          @select="handleSelect"
          @add="handleAdd"
          @remove="handleRemove"
          @move-up="handleMoveUp"
          @move-down="handleMoveDown"
        />
      </div>
      <div class="form-panel">
        <ConstraintForm
          :constraint="selectedConstraint"
          :featureNameOptions="featureNameOptions"
          @update:constraint="handleConstraintUpdate"
          @open-class-search="handleOpenClassSearch"
          @open-class-tree="handleOpenClassTree"
        />
      </div>
    </div>

  </div>

  <!-- Class Search Dialog -->
  <SearchDialog
    v-if="metamodelResource"
    :visible="showClassSearch"
    :resource="metamodelResource"
    :browseMode="true"
    @close="showClassSearch = false"
    @select="handleClassSearchSelect"
    @navigate="handleClassSearchSelect"
  />

  <!-- Class Tree Picker Dialog -->
  <Dialog
    v-model:visible="showClassTree"
    header="Select Context Class"
    :modal="true"
    :style="{ width: '480px' }"
    :contentStyle="{ padding: 0 }"
  >
    <div class="class-tree-container">
      <Tree
        :value="classTreeNodes"
        v-model:expandedKeys="classTreeExpandedKeys"
        selectionMode="single"
        @node-select="handleClassTreeSelect"
        class="class-tree"
      >
        <template #default="{ node }">
          <div
            class="class-tree-node"
            :class="{
              'is-class': node.type === 'class',
              'is-abstract': node.type === 'class' && node.data?.isAbstract,
              'is-package': node.type === 'package' || node.type === 'subpackage'
            }"
          >
            <span class="node-label">{{ node.label }}</span>
            <span v-if="node.type === 'class' && node.data?.isAbstract" class="abstract-tag">abstract</span>
          </div>
        </template>
      </Tree>
      <div v-if="classTreeNodes.length === 0" class="class-tree-empty">
        No metamodels loaded.
      </div>
    </div>
  </Dialog>

  <!-- Loading / empty state -->
  <div v-if="!constraintSet" class="cocl-editor-empty">
    <i class="pi pi-check-square" style="font-size: 2rem; opacity: 0.3"></i>
    <span>No C-OCL file loaded</span>
    <span class="hint">Open a .c-ocl file from the Explorer or create a new one.</span>
    <Button
      label="New Constraint File"
      icon="pi pi-plus"
      severity="secondary"
      size="small"
      @click="handleNew"
      style="margin-top: 8px"
    />
  </div>

  <!-- Server Config List Dialog -->
  <Dialog
    v-model:visible="showServerListDialog"
    header="C-OCL Constraints auf Server"
    :modal="true"
    :style="{ width: '500px' }"
  >
    <div v-if="atlas.loading.value" style="text-align: center; padding: 20px;">
      <i class="pi pi-spinner pi-spin" style="font-size: 1.5rem"></i>
    </div>
    <div v-else-if="serverConfigs.length === 0" style="text-align: center; padding: 20px; color: var(--text-color-secondary);">
      Keine Constraint-Sets auf dem Server gefunden.
    </div>
    <div v-else style="display: flex; flex-direction: column; gap: 4px; max-height: 300px; overflow-y: auto;">
      <div
        v-for="cfg in serverConfigs"
        :key="cfg.objectId"
        style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 6px; cursor: pointer; border: 1px solid var(--surface-border);"
        @click="handleSelectServerConfig(cfg)"
      >
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: 600; font-size: 0.875rem;">{{ cfg.name }}</span>
          <span style="font-size: 0.75rem; color: var(--text-color-secondary);">v{{ cfg.version }}</span>
        </div>
        <span style="font-size: 0.6875rem; font-family: monospace; color: var(--text-color-secondary);">{{ cfg.objectId }}</span>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.cocl-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-card, #ffffff);
}

.editor-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--surface-border, #e2e8f0);
  background: var(--surface-section, #f1f5f9);
}

.header-fields {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.header-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.header-field label {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-color-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.header-input {
  width: 100%;
}

.flex-1 {
  flex: 1;
}

.editor-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.list-panel {
  width: 280px;
  min-width: 200px;
  flex-shrink: 0;
}

.form-panel {
  flex: 1;
  overflow: hidden;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.unsaved-badge {
  font-size: 0.6875rem;
  font-weight: 600;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}

.cocl-editor-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  color: var(--text-color-secondary, #64748b);
  font-size: 0.875rem;
}

.cocl-editor-empty .hint {
  font-size: 0.75rem;
  opacity: 0.7;
}

/* Class Tree Picker */
.class-tree-container {
  max-height: 400px;
  overflow-y: auto;
}

.class-tree {
  border: none;
  padding: 0;
}

.class-tree :deep(.p-tree-node-content) {
  padding: 4px 8px;
}

.class-tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
}

.class-tree-node.is-class {
  cursor: pointer;
  font-weight: 500;
  color: var(--text-color, #1e293b);
}

.class-tree-node.is-abstract {
  font-style: italic;
  opacity: 0.75;
}

.class-tree-node.is-package {
  color: var(--text-color-secondary, #64748b);
  font-weight: 600;
}

.class-tree-node .abstract-tag {
  font-size: 0.625rem;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--surface-200, #e2e8f0);
  color: var(--text-color-secondary, #64748b);
  font-style: normal;
  font-weight: 400;
}

.class-tree-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--text-color-secondary, #64748b);
  font-size: 0.8125rem;
}
</style>
