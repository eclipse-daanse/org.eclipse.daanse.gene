<script setup lang="ts">
/**
 * TransformationEditor - QVT-R Visual Transformation Mapping Editor
 *
 * Three-column layout:
 * - Left: Source model (checkonly domain) - select EPackage, browse classes/features
 * - Center: Relations & Variables - QVT-R relations with mappings
 * - Right: Target model (enforce domain) - select EPackage, browse classes/features
 *
 * Connections (SVG bezier curves) show data flow: source -> variables -> target.
 */

import { ref, computed, onMounted, onUnmounted, nextTick, watch, reactive, inject } from 'tsm:vue'
import { Dropdown, Button, InputText } from 'tsm:primevue'
import type { ModelPackageInfo, ClassInfo } from 'ui-model-browser'
import type { EClass } from '@emfts/core'
import OclMonacoEditor from './OclMonacoEditor.vue'
import AutoMapDialog from './AutoMapDialog.vue'
import { getSharedOclClient } from '../composables/useOclLanguageClient'

// --- Types ---

interface FeatureInfo {
  name: string
  typeName: string
  kind: 'attribute' | 'reference'
  isMany: boolean
  isContainment?: boolean
}

interface ClassFeatures {
  className: string
  isAbstract: boolean
  features: FeatureInfo[]
}

interface FeatureMapping {
  sourceFeature: string
  targetFeature: string
  expression?: string
  viaVariable?: string
}

interface RelationDef {
  id: number
  name: string
  isTop: boolean
  sourceClass: string
  targetClass: string
  mappings: FeatureMapping[]
}

interface VariableDef {
  id: number
  name: string
  type: string
  expression: string
}

interface Connection {
  from: { panel: 'source' | 'var'; key: string }
  to: { panel: 'var' | 'target'; key: string }
  color: string
}

// TSM for service access
const tsm = inject<any>('tsm')

// --- Model Registry ---

const modelRegistry = tsm?.getService('ui.model-browser.composables')?.useSharedModelRegistry()

const packageOptions = computed(() =>
  modelRegistry.allPackages.value.map(pkg => ({
    label: `${pkg.name} (${pkg.nsPrefix})`,
    value: pkg.nsURI
  }))
)

// --- State ---

const selectedSourceURI = ref<string | null>(null)
const selectedTargetURI = ref<string | null>(null)
const transformationName = ref('NewTransformation')

const relations = ref<RelationDef[]>([])
const variables = ref<VariableDef[]>([])
let nextRelationId = 1
let nextVariableId = 1

// Track expanded classes per panel
const expandedSourceClasses = ref<Set<string>>(new Set())
const expandedTargetClasses = ref<Set<string>>(new Set())

// Active relation for editing
const activeRelationId = ref<number | null>(null)

// Show QVT-R preview
const showPreview = ref(false)

// AutoMap dialog
const showAutoMapDialog = ref(false)

const sourceClassInfos = computed(() =>
  sourcePackage.value ? modelRegistry.getAllClasses(sourcePackage.value) : []
)
const targetClassInfos = computed(() =>
  targetPackage.value ? modelRegistry.getAllClasses(targetPackage.value) : []
)

// --- Computed: Selected packages ---

const sourcePackage = computed<ModelPackageInfo | null>(() => {
  if (!selectedSourceURI.value) return null
  return modelRegistry.allPackages.value.find(p => p.nsURI === selectedSourceURI.value) ?? null
})

const targetPackage = computed<ModelPackageInfo | null>(() => {
  if (!selectedTargetURI.value) return null
  return modelRegistry.allPackages.value.find(p => p.nsURI === selectedTargetURI.value) ?? null
})

// --- Computed: Class trees ---

function getEObjectName(obj: any): string | null {
  if (!obj) return null
  if (typeof obj.getName === 'function') return obj.getName()
  return null
}

function extractClassFeatures(pkg: ModelPackageInfo): ClassFeatures[] {
  const classes = modelRegistry.getAllClasses(pkg)
  return classes.map(cls => {
    const features: FeatureInfo[] = []

    // Attributes
    try {
      const attrs = cls.eClass.getEAttributes ? cls.eClass.getEAttributes() : []
      for (const attr of attrs) {
        const eType = attr.getEType ? attr.getEType() : null
        const typeName = getEObjectName(eType) || 'unknown'
        const name = typeof attr.getName === 'function' ? attr.getName() : 'unknown'
        features.push({
          name,
          typeName,
          kind: 'attribute',
          isMany: typeof attr.isMany === 'function' ? attr.isMany() : false
        })
      }
    } catch (e) { /* skip */ }

    // References
    try {
      const refs = cls.eClass.getEReferences ? cls.eClass.getEReferences() : []
      for (const r of refs) {
        const refType = r.getEReferenceType ? r.getEReferenceType() : null
        const typeName = getEObjectName(refType) || 'unknown'
        const name = typeof r.getName === 'function' ? r.getName() : 'unknown'
        features.push({
          name,
          typeName,
          kind: 'reference',
          isMany: typeof r.isMany === 'function' ? r.isMany() : false,
          isContainment: typeof r.isContainment === 'function' ? r.isContainment() : false
        })
      }
    } catch (e) { /* skip */ }

    return {
      className: cls.name,
      isAbstract: cls.isAbstract,
      features
    }
  })
}

const sourceClasses = computed<ClassFeatures[]>(() => {
  if (!sourcePackage.value) return []
  return extractClassFeatures(sourcePackage.value)
})

const targetClasses = computed<ClassFeatures[]>(() => {
  if (!targetPackage.value) return []
  return extractClassFeatures(targetPackage.value)
})

// --- Computed: Class name lists for dropdowns in relation editor ---

const sourceClassNames = computed(() =>
  sourceClasses.value.filter(c => !c.isAbstract).map(c => ({ label: c.className, value: c.className }))
)

const targetClassNames = computed(() =>
  targetClasses.value.filter(c => !c.isAbstract).map(c => ({ label: c.className, value: c.className }))
)

// --- Active relation ---

const activeRelation = computed(() =>
  relations.value.find(r => r.id === activeRelationId.value) ?? null
)

// Features of the active relation's source/target classes
const activeSourceFeatures = computed<FeatureInfo[]>(() => {
  if (!activeRelation.value) return []
  const cls = sourceClasses.value.find(c => c.className === activeRelation.value!.sourceClass)
  return cls?.features ?? []
})

const activeTargetFeatures = computed<FeatureInfo[]>(() => {
  if (!activeRelation.value) return []
  const cls = targetClasses.value.find(c => c.className === activeRelation.value!.targetClass)
  return cls?.features ?? []
})

// --- LSP Client: register packages when selected ---

const oclClient = getSharedOclClient()
let lspReady = false

async function initLspAndRegisterPackages() {
  try {
    await oclClient.initialize()
    lspReady = true
    if (sourcePackage.value) {
      oclClient.registerPackage(sourcePackage.value.ePackage)
    }
    if (targetPackage.value) {
      oclClient.registerPackage(targetPackage.value.ePackage)
    }
  } catch (e) {
    console.warn('[TransformationEditor] LSP init failed:', e)
  }
}

watch(sourcePackage, (pkg) => {
  if (pkg && lspReady) {
    oclClient.registerPackage(pkg.ePackage)
  }
})

watch(targetPackage, (pkg) => {
  if (pkg && lspReady) {
    oclClient.registerPackage(pkg.ePackage)
  }
})

// Context class for OCL editor (from active relation's source class)
const oclContextClass = computed(() => {
  if (!activeRelation.value) return ''
  return activeRelation.value.sourceClass || ''
})

// --- Connection lines ---

const connections = computed<Connection[]>(() => {
  const conns: Connection[] = []
  if (!activeRelation.value) return conns

  for (const mapping of activeRelation.value.mappings) {
    if (mapping.viaVariable) {
      // Source -> Variable
      conns.push({
        from: { panel: 'source', key: `src-feat-${mapping.sourceFeature}` },
        to: { panel: 'var', key: `var-${mapping.viaVariable}` },
        color: '#EAB308'
      })
      // Variable -> Target
      conns.push({
        from: { panel: 'var', key: `var-${mapping.viaVariable}` },
        to: { panel: 'target', key: `tgt-feat-${mapping.targetFeature}` },
        color: '#22C55E'
      })
    } else {
      // Direct source -> target
      conns.push({
        from: { panel: 'source', key: `src-feat-${mapping.sourceFeature}` },
        to: { panel: 'target', key: `tgt-feat-${mapping.targetFeature}` },
        color: '#94A3B8'
      })
    }
  }
  return conns
})

// --- SVG Connection Lines ---

const svgContainer = ref<SVGSVGElement | null>(null)
const editorContainer = ref<HTMLDivElement | null>(null)
const connectionPaths = ref<{ d: string; color: string }[]>([])

function getRowElement(key: string): HTMLElement | null {
  if (!editorContainer.value) return null
  return editorContainer.value.querySelector(`[data-row="${key}"]`)
}

function updateConnections() {
  if (!svgContainer.value || !editorContainer.value) return

  const containerRect = editorContainer.value.getBoundingClientRect()
  const paths: { d: string; color: string }[] = []

  for (const conn of connections.value) {
    const fromEl = getRowElement(conn.from.key)
    const toEl = getRowElement(conn.to.key)

    if (!fromEl || !toEl) continue

    const fromRect = fromEl.getBoundingClientRect()
    const toRect = toEl.getBoundingClientRect()

    const x1 = fromRect.right - containerRect.left
    const y1 = fromRect.top + fromRect.height / 2 - containerRect.top
    const x2 = toRect.left - containerRect.left
    const y2 = toRect.top + toRect.height / 2 - containerRect.top

    const cpx = (x2 - x1) * 0.5
    const d = `M ${x1} ${y1} C ${x1 + cpx} ${y1}, ${x2 - cpx} ${y2}, ${x2} ${y2}`
    paths.push({ d, color: conn.color })
  }

  connectionPaths.value = paths
}

let resizeObserver: ResizeObserver | null = null

// --- Save notification ---

const saveNotification = ref<{ message: string; type: 'success' | 'error' } | null>(null)
let saveNotificationTimer: ReturnType<typeof setTimeout> | null = null

function showSaveNotification(message: string, type: 'success' | 'error' = 'success') {
  if (saveNotificationTimer) clearTimeout(saveNotificationTimer)
  saveNotification.value = { message, type }
  saveNotificationTimer = setTimeout(() => {
    saveNotification.value = null
  }, 3000)
}

// --- Load from shared state ---

function loadFromData(data: any) {
  if (!data || data.format !== 'gene-qvtr') return

  console.log('[TransformationEditor] Loading transformation data:', data.transformationName)

  if (data.transformationName) transformationName.value = data.transformationName
  if (data.sourcePackageURI) selectedSourceURI.value = data.sourcePackageURI
  if (data.targetPackageURI) selectedTargetURI.value = data.targetPackageURI

  if (Array.isArray(data.relations)) {
    relations.value = data.relations.map((r: any, i: number) => ({
      id: nextRelationId++,
      name: r.name || `Relation${i + 1}`,
      isTop: r.isTop ?? true,
      sourceClass: r.sourceClass || '',
      targetClass: r.targetClass || '',
      mappings: Array.isArray(r.mappings) ? r.mappings : []
    }))
    if (relations.value.length > 0) {
      activeRelationId.value = relations.value[0].id
    }
  }

  if (Array.isArray(data.variables)) {
    variables.value = data.variables.map((v: any) => ({
      id: nextVariableId++,
      name: v.name || '',
      type: v.type || 'String',
      expression: v.expression || ''
    }))
  }
}

// --- Save to file system ---

async function handleSave() {
  const fileSystem = tsm?.getService('gene.filesystem')
  if (!fileSystem) {
    console.warn('[TransformationEditor] File system not available')
    return
  }

  const data = {
    format: 'gene-qvtr',
    version: 1,
    transformationName: transformationName.value,
    sourcePackageURI: selectedSourceURI.value,
    targetPackageURI: selectedTargetURI.value,
    relations: relations.value.map(r => ({
      name: r.name,
      isTop: r.isTop,
      sourceClass: r.sourceClass,
      targetClass: r.targetClass,
      mappings: r.mappings
    })),
    variables: variables.value.map(v => ({
      name: v.name,
      type: v.type,
      expression: v.expression
    })),
    qvtrCode: qvtCode.value
  }

  const fileName = `${transformationName.value || 'transformation'}.qvtr`
  const content = JSON.stringify(data, null, 2)

  try {
    // Try to find existing file first, or create new one in workspace folder
    const sources = fileSystem.sources?.value || []
    if (sources.length === 0) {
      console.warn('[TransformationEditor] No file sources available')
      return
    }

    const sourceId = sources[0].id
    let fileEntry = fileSystem.getFileByPath?.(sourceId, fileName)

    if (fileEntry) {
      await fileSystem.writeTextFile(fileEntry, content)
      console.log('[TransformationEditor] Updated existing file:', fileName)
      showSaveNotification(`Saved ${fileName}`)
    } else {
      // Create a new file in the root of the first source
      await fileSystem.createFile(sourceId, '', fileName)
      // Refresh to get the new file entry
      await fileSystem.refreshSource(sourceId)
      fileEntry = fileSystem.getFileByPath?.(sourceId, fileName)
      if (fileEntry) {
        await fileSystem.writeTextFile(fileEntry, content)
        console.log('[TransformationEditor] Created and saved new file:', fileName)
        showSaveNotification(`Created ${fileName}`)
      }
    }
  } catch (e: any) {
    console.error('[TransformationEditor] Failed to save:', e)
    showSaveNotification(`Failed to save: ${e.message}`, 'error')
  }
}

onMounted(() => {
  nextTick(() => updateConnections())
  resizeObserver = new ResizeObserver(() => updateConnections())
  if (editorContainer.value) {
    resizeObserver.observe(editorContainer.value)
  }
  // Initialize LSP worker
  initLspAndRegisterPackages()

  // Check for loaded transformation data
  const loadedData = tsm?.getService('gene.transformation.data')
  if (loadedData) {
    loadFromData(loadedData)
    tsm?.registerService('gene.transformation.data', null)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})

// Redraw connections when active relation or mappings change
watch([connections, activeRelationId], () => {
  nextTick(() => updateConnections())
}, { deep: true })

// Watch for externally loaded transformation data (e.g. loading a second file)
// Note: TSM services are not reactive, so we use a polling interval
const _transformationPollInterval = setInterval(() => {
  const data = tsm?.getService('gene.transformation.data')
  if (data) {
    loadFromData(data)
    tsm?.registerService('gene.transformation.data', null)
  }
}, 500)
onUnmounted(() => clearInterval(_transformationPollInterval))

// --- Actions ---

function toggleSourceClass(className: string) {
  if (expandedSourceClasses.value.has(className)) {
    expandedSourceClasses.value.delete(className)
  } else {
    expandedSourceClasses.value.add(className)
  }
  expandedSourceClasses.value = new Set(expandedSourceClasses.value)
}

function toggleTargetClass(className: string) {
  if (expandedTargetClasses.value.has(className)) {
    expandedTargetClasses.value.delete(className)
  } else {
    expandedTargetClasses.value.add(className)
  }
  expandedTargetClasses.value = new Set(expandedTargetClasses.value)
}

function addRelation() {
  const rel: RelationDef = {
    id: nextRelationId++,
    name: `Relation${relations.value.length + 1}`,
    isTop: true,
    sourceClass: sourceClassNames.value[0]?.value ?? '',
    targetClass: targetClassNames.value[0]?.value ?? '',
    mappings: []
  }
  relations.value.push(rel)
  activeRelationId.value = rel.id
}

function removeRelation(id: number) {
  relations.value = relations.value.filter(r => r.id !== id)
  if (activeRelationId.value === id) {
    activeRelationId.value = relations.value[0]?.id ?? null
  }
}

function addVariable() {
  variables.value.push({
    id: nextVariableId++,
    name: `var${variables.value.length + 1}`,
    type: 'String',
    expression: ''
  })
}

function removeVariable(id: number) {
  variables.value = variables.value.filter(v => v.id !== id)
}

function addMapping() {
  if (!activeRelation.value) return
  activeRelation.value.mappings.push({
    sourceFeature: activeSourceFeatures.value[0]?.name ?? '',
    targetFeature: activeTargetFeatures.value[0]?.name ?? ''
  })
  nextTick(() => updateConnections())
}

function removeMapping(idx: number) {
  if (!activeRelation.value) return
  activeRelation.value.mappings.splice(idx, 1)
  nextTick(() => updateConnections())
}

// --- Source feature selection for quick mapping ---

const selectedSourceFeature = ref<string | null>(null)
const selectedTargetFeature = ref<string | null>(null)

function selectSourceFeature(className: string, featureName: string) {
  selectedSourceFeature.value = `${className}.${featureName}`
  tryAutoMap()
}

function selectTargetFeature(className: string, featureName: string) {
  selectedTargetFeature.value = `${className}.${featureName}`
  tryAutoMap()
}

function tryAutoMap() {
  if (!selectedSourceFeature.value || !selectedTargetFeature.value || !activeRelation.value) return

  const [srcClass, srcFeat] = selectedSourceFeature.value.split('.')
  const [tgtClass, tgtFeat] = selectedTargetFeature.value.split('.')

  // Update relation source/target class if needed
  if (activeRelation.value.sourceClass !== srcClass) {
    activeRelation.value.sourceClass = srcClass
  }
  if (activeRelation.value.targetClass !== tgtClass) {
    activeRelation.value.targetClass = tgtClass
  }

  // Add the mapping
  activeRelation.value.mappings.push({
    sourceFeature: srcFeat,
    targetFeature: tgtFeat
  })

  selectedSourceFeature.value = null
  selectedTargetFeature.value = null
  nextTick(() => updateConnections())
}

// --- AutoMap apply ---

function applyAutoMapResults(newRelations: RelationDef[]) {
  for (const rel of newRelations) {
    rel.id = nextRelationId++
    relations.value.push(rel)
  }
  if (newRelations.length > 0) {
    activeRelationId.value = newRelations[0].id
  }
  showAutoMapDialog.value = false
  nextTick(() => updateConnections())
}

// --- QVT-R Code Generation ---

const qvtCode = computed(() => {
  const srcName = sourcePackage.value?.name ?? 'source'
  const tgtName = targetPackage.value?.name ?? 'target'

  let code = `transformation ${transformationName.value}(in source: ${srcName}, out target: ${tgtName}) {\n`

  for (const rel of relations.value) {
    const topStr = rel.isTop ? 'top ' : ''
    code += `\n  ${topStr}relation ${rel.name} {\n`

    // Checkonly domain (source)
    if (rel.sourceClass) {
      const srcVar = rel.sourceClass.charAt(0).toLowerCase()
      const bindings = rel.mappings
        .map(m => `${m.sourceFeature} = ${m.sourceFeature}`)
        .join(', ')
      code += `    checkonly domain source ${srcVar}: ${rel.sourceClass} { ${bindings} };\n`
    }

    // Enforce domain (target)
    if (rel.targetClass) {
      const tgtVar = rel.targetClass.charAt(0).toLowerCase()
      const bindings = rel.mappings
        .map(m => {
          if (m.viaVariable) {
            return `${m.targetFeature} = ${m.viaVariable}`
          }
          return `${m.targetFeature} = ${m.sourceFeature}`
        })
        .join(', ')
      code += `    enforce domain target ${tgtVar}: ${rel.targetClass} { ${bindings} };\n`
    }

    // Where clause for variables
    const varMappings = rel.mappings.filter(m => m.viaVariable)
    if (varMappings.length > 0) {
      code += `    where {\n`
      for (const vm of varMappings) {
        const varDef = variables.value.find(v => v.name === vm.viaVariable)
        if (varDef) {
          code += `      ${varDef.name} = ${varDef.expression || '/* expression */'};\n`
        }
      }
      code += `    }\n`
    }

    code += `  }\n`
  }

  code += `}\n`
  return code
})

// --- Feature highlighting: which features have mappings ---

function isSourceFeatureMapped(featureName: string): boolean {
  return relations.value.some(r =>
    r.mappings.some(m => m.sourceFeature === featureName)
  )
}

function isTargetFeatureMapped(featureName: string): boolean {
  return relations.value.some(r =>
    r.mappings.some(m => m.targetFeature === featureName)
  )
}
</script>

<template>
  <div class="transformation-root">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <InputText
          v-model="transformationName"
          class="transformation-name-input"
          placeholder="Transformation name"
        />
      </div>
      <div class="header-actions">
        <Button
          icon="pi pi-save"
          text
          rounded
          size="small"
          @click="handleSave"
          v-tooltip.bottom="'Save as .qvtr'"
        />
        <Button
          icon="pi pi-bolt"
          text
          rounded
          size="small"
          :disabled="!sourcePackage || !targetPackage"
          @click="showAutoMapDialog = true"
          v-tooltip.bottom="'AutoMap'"
        />
        <Button
          :icon="showPreview ? 'pi pi-eye-slash' : 'pi pi-eye'"
          text
          rounded
          size="small"
          @click="showPreview = !showPreview"
          v-tooltip.bottom="showPreview ? 'Hide QVT-R' : 'Show QVT-R'"
        />
      </div>
    </div>

    <!-- Main editor area -->
    <div class="transformation-editor" ref="editorContainer">
      <!-- SVG Connection Lines -->
      <svg ref="svgContainer" class="connection-svg">
        <path
          v-for="(path, i) in connectionPaths"
          :key="i"
          :d="path.d"
          :stroke="path.color"
          stroke-width="2"
          fill="none"
          stroke-opacity="0.7"
        />
      </svg>

      <!-- Left Panel: Source Model (checkonly domain) -->
      <div class="panel source-panel">
        <div class="panel-header source-header">
          <span class="panel-title">
            <i class="pi pi-database"></i>
            Source Model
          </span>
          <span class="panel-badge">checkonly</span>
        </div>
        <div class="model-selector">
          <Dropdown
            v-model="selectedSourceURI"
            :options="packageOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Select source metamodel..."
            class="w-full"
          />
        </div>
        <div class="panel-body" v-if="sourcePackage">
          <div v-for="cls in sourceClasses" :key="cls.className" class="class-group">
            <div
              class="class-row"
              :class="{ abstract: cls.isAbstract }"
              @click="toggleSourceClass(cls.className)"
            >
              <i :class="expandedSourceClasses.has(cls.className) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="expand-icon"></i>
              <i :class="cls.isAbstract ? 'pi pi-file-edit' : 'pi pi-file'" class="class-icon"></i>
              <span class="class-name">{{ cls.className }}</span>
              <span class="feature-count">{{ cls.features.length }}</span>
            </div>
            <div v-if="expandedSourceClasses.has(cls.className)" class="features-list">
              <div
                v-for="feat in cls.features"
                :key="feat.name"
                :data-row="`src-feat-${feat.name}`"
                class="feature-row"
                :class="{
                  mapped: isSourceFeatureMapped(feat.name),
                  'is-selected': selectedSourceFeature === `${cls.className}.${feat.name}`
                }"
                @click="selectSourceFeature(cls.className, feat.name)"
              >
                <i :class="feat.kind === 'attribute' ? 'pi pi-minus' : (feat.isContainment ? 'pi pi-box' : 'pi pi-link')" class="feat-icon"></i>
                <span class="feat-name">{{ feat.name }}</span>
                <span class="feat-type">{{ feat.typeName }}{{ feat.isMany ? '[]' : '' }}</span>
              </div>
            </div>
          </div>
          <div v-if="sourceClasses.length === 0" class="empty-hint">
            No classes found in package
          </div>
        </div>
        <div v-else class="panel-body empty-state">
          <i class="pi pi-arrow-up"></i>
          <span>Select a source metamodel</span>
        </div>
      </div>

      <!-- Center Panel: Relations & Variables -->
      <div class="panel var-panel">
        <div class="panel-header var-header">
          <span class="panel-title">
            <i class="pi pi-arrows-h"></i>
            Relations
          </span>
          <div class="header-actions">
            <Button
              icon="pi pi-plus"
              text
              rounded
              size="small"
              :disabled="!sourcePackage || !targetPackage"
              @click="addRelation"
              v-tooltip.bottom="'Add Relation'"
            />
            <Button
              icon="pi pi-sliders-v"
              text
              rounded
              size="small"
              @click="addVariable"
              v-tooltip.bottom="'Add Variable'"
            />
          </div>
        </div>

        <!-- Relation tabs -->
        <div class="relation-tabs" v-if="relations.length > 0">
          <div
            v-for="rel in relations"
            :key="rel.id"
            class="relation-tab"
            :class="{ active: activeRelationId === rel.id }"
            @click="activeRelationId = rel.id"
          >
            <span class="rel-tab-name">{{ rel.name }}</span>
            <i
              class="pi pi-times rel-tab-close"
              @click.stop="removeRelation(rel.id)"
            ></i>
          </div>
        </div>

        <div class="panel-body" v-if="activeRelation">
          <!-- Relation settings -->
          <div class="relation-settings">
            <div class="setting-row">
              <label>Name</label>
              <InputText v-model="activeRelation.name" class="setting-input" />
            </div>
            <div class="setting-row">
              <label>Top</label>
              <input type="checkbox" v-model="activeRelation.isTop" />
            </div>
            <div class="setting-row">
              <label>Source</label>
              <Dropdown
                v-model="activeRelation.sourceClass"
                :options="sourceClassNames"
                optionLabel="label"
                optionValue="value"
                placeholder="Source class"
                class="setting-dropdown"
              />
            </div>
            <div class="setting-row">
              <label>Target</label>
              <Dropdown
                v-model="activeRelation.targetClass"
                :options="targetClassNames"
                optionLabel="label"
                optionValue="value"
                placeholder="Target class"
                class="setting-dropdown"
              />
            </div>
          </div>

          <!-- Mappings -->
          <div class="mappings-section">
            <div class="section-header">
              <span>Feature Mappings</span>
              <Button
                icon="pi pi-plus"
                size="small"
                severity="info"
                text
                @click="addMapping"
              />
            </div>
            <div v-for="(mapping, idx) in activeRelation.mappings" :key="idx" class="mapping-row">
              <Dropdown
                v-model="mapping.sourceFeature"
                :options="activeSourceFeatures.map(f => ({ label: f.name, value: f.name }))"
                optionLabel="label"
                optionValue="value"
                placeholder="source"
                class="mapping-dropdown"
              />
              <i class="pi pi-arrow-right mapping-arrow"></i>
              <Dropdown
                v-model="mapping.targetFeature"
                :options="activeTargetFeatures.map(f => ({ label: f.name, value: f.name }))"
                optionLabel="label"
                optionValue="value"
                placeholder="target"
                class="mapping-dropdown"
              />
              <Dropdown
                v-model="mapping.viaVariable"
                :options="[{ label: '(direct)', value: undefined }, ...variables.map(v => ({ label: v.name, value: v.name }))]"
                optionLabel="label"
                optionValue="value"
                placeholder="via"
                class="mapping-via"
              />
              <Button
                icon="pi pi-trash"
                size="small"
                severity="danger"
                text
                @click="removeMapping(idx)"
              />
            </div>
            <div v-if="activeRelation.mappings.length === 0" class="empty-hint">
              Click a source feature, then a target feature to create a mapping.
              Or use the + button above.
            </div>
          </div>

          <!-- Variables -->
          <div class="variables-section">
            <div class="section-header">
              <span>Variables</span>
              <Button
                icon="pi pi-plus"
                size="small"
                severity="warning"
                text
                @click="addVariable"
              />
            </div>
            <div v-for="v in variables" :key="v.id" class="variable-row" :data-row="`var-${v.name}`">
              <InputText v-model="v.name" class="var-name-input" placeholder="name" />
              <InputText v-model="v.type" class="var-type-input" placeholder="type" />
              <OclMonacoEditor
                v-model="v.expression"
                :height="80"
                :context-class="oclContextClass"
                :single-line="false"
                class="var-expr-editor"
              />
              <Button
                icon="pi pi-trash"
                size="small"
                severity="danger"
                text
                @click="removeVariable(v.id)"
              />
            </div>
          </div>
        </div>

        <div v-else class="panel-body empty-state">
          <i class="pi pi-plus-circle"></i>
          <span>{{ relations.length === 0 ? 'Add a relation to start mapping' : 'Select a relation tab' }}</span>
        </div>
      </div>

      <!-- Right Panel: Target Model (enforce domain) -->
      <div class="panel target-panel">
        <div class="panel-header target-header">
          <span class="panel-title">
            <i class="pi pi-upload"></i>
            Target Model
          </span>
          <span class="panel-badge">enforce</span>
        </div>
        <div class="model-selector">
          <Dropdown
            v-model="selectedTargetURI"
            :options="packageOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Select target metamodel..."
            class="w-full"
          />
        </div>
        <div class="panel-body" v-if="targetPackage">
          <div v-for="cls in targetClasses" :key="cls.className" class="class-group">
            <div
              class="class-row"
              :class="{ abstract: cls.isAbstract }"
              @click="toggleTargetClass(cls.className)"
            >
              <i :class="expandedTargetClasses.has(cls.className) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="expand-icon"></i>
              <i :class="cls.isAbstract ? 'pi pi-file-edit' : 'pi pi-file'" class="class-icon"></i>
              <span class="class-name">{{ cls.className }}</span>
              <span class="feature-count">{{ cls.features.length }}</span>
            </div>
            <div v-if="expandedTargetClasses.has(cls.className)" class="features-list">
              <div
                v-for="feat in cls.features"
                :key="feat.name"
                :data-row="`tgt-feat-${feat.name}`"
                class="feature-row"
                :class="{
                  mapped: isTargetFeatureMapped(feat.name),
                  'is-selected': selectedTargetFeature === `${cls.className}.${feat.name}`
                }"
                @click="selectTargetFeature(cls.className, feat.name)"
              >
                <i :class="feat.kind === 'attribute' ? 'pi pi-minus' : (feat.isContainment ? 'pi pi-box' : 'pi pi-link')" class="feat-icon"></i>
                <span class="feat-name">{{ feat.name }}</span>
                <span class="feat-type">{{ feat.typeName }}{{ feat.isMany ? '[]' : '' }}</span>
              </div>
            </div>
          </div>
          <div v-if="targetClasses.length === 0" class="empty-hint">
            No classes found in package
          </div>
        </div>
        <div v-else class="panel-body empty-state">
          <i class="pi pi-arrow-up"></i>
          <span>Select a target metamodel</span>
        </div>
      </div>
    </div>

    <!-- QVT-R Preview -->
    <div v-if="showPreview" class="qvt-preview">
      <div class="preview-header">
        <span>QVT-R Output</span>
        <Button
          icon="pi pi-times"
          size="small"
          severity="secondary"
          text
          @click="showPreview = false"
        />
      </div>
      <pre class="preview-code">{{ qvtCode }}</pre>
    </div>

    <!-- AutoMap Dialog -->
    <AutoMapDialog
      :visible="showAutoMapDialog"
      :source-classes="sourceClasses"
      :target-classes="targetClasses"
      :source-class-infos="sourceClassInfos"
      :target-class-infos="targetClassInfos"
      @update:visible="showAutoMapDialog = $event"
      @apply="applyAutoMapResults"
    />

    <!-- Save Notification -->
    <Transition name="notification">
      <div v-if="saveNotification" class="save-notification" :class="saveNotification.type">
        <i :class="saveNotification.type === 'success' ? 'pi pi-check-circle' : 'pi pi-exclamation-triangle'"></i>
        <span>{{ saveNotification.message }}</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.transformation-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-ground, #f8fafc);
}

/* Toolbar */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--surface-card, #fff);
  border-bottom: 1px solid var(--surface-border, #e2e8f0);
  gap: 12px;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-actions {
  display: flex;
  gap: 0.25rem;
}

.transformation-name-input {
  font-weight: 600;
  font-size: 0.9rem;
  width: 220px;
}

/* Main editor grid */
.transformation-editor {
  display: grid;
  grid-template-columns: 1fr 1.4fr 1fr;
  gap: 0;
  flex: 1;
  padding: 12px;
  position: relative;
  overflow: hidden;
  min-height: 0;
}

/* SVG overlay */
.connection-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

/* Panel base */
.panel {
  display: flex;
  flex-direction: column;
  background: var(--surface-card, #fff);
  border: 1px solid var(--surface-border, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
  z-index: 2;
  margin: 0 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  min-height: 0;
}

.source-panel { margin-left: 0; }
.target-panel { margin-right: 0; }

/* Panel headers */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.75rem;
  height: 2.5rem;
  font-weight: 600;
  font-size: 0.8125rem;
  border-bottom: 1px solid var(--surface-border);
  flex-shrink: 0;
}

.source-header {
  background: color-mix(in srgb, var(--primary-color) 8%, var(--surface-section));
  color: var(--primary-color);
}

.var-header {
  background: color-mix(in srgb, #EAB308 8%, var(--surface-section));
  color: color-mix(in srgb, #EAB308 70%, var(--text-color));
}

.target-header {
  background: color-mix(in srgb, #22C55E 8%, var(--surface-section));
  color: color-mix(in srgb, #22C55E 70%, var(--text-color));
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.panel-badge {
  font-size: 0.625rem;
  font-weight: 500;
  padding: 0.0625rem 0.375rem;
  border-radius: 999px;
  opacity: 0.7;
  background: color-mix(in srgb, currentColor 12%, transparent);
}

/* Model selector */
.model-selector {
  padding: 8px 10px;
  border-bottom: 1px solid var(--surface-border, #e2e8f0);
  background: var(--surface-section, #f8fafc);
  flex-shrink: 0;
}

.model-selector .w-full {
  width: 100%;
}

/* Panel body */
.panel-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 0.8125rem;
  padding: 32px;
}

.empty-state i {
  font-size: 1.5rem;
  opacity: 0.5;
}

.empty-hint {
  padding: 12px 14px;
  color: var(--text-color-secondary, #94a3b8);
  font-size: 0.75rem;
  text-align: center;
  font-style: italic;
}

/* Class tree */
.class-group {
  border-bottom: 1px solid rgba(0,0,0,0.04);
}

.class-row {
  display: flex;
  align-items: center;
  padding: 7px 10px;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 600;
  gap: 6px;
  transition: background 0.15s;
}

.class-row:hover {
  background: var(--surface-hover, rgba(0,0,0,0.03));
}

.class-row.abstract {
  opacity: 0.6;
  font-style: italic;
}

.expand-icon {
  font-size: 0.65rem;
  width: 14px;
  color: var(--text-color-secondary, #94a3b8);
}

.class-icon {
  font-size: 0.8rem;
  color: var(--primary-color, #3B82F6);
}

.class-name {
  flex: 1;
}

.feature-count {
  font-size: 0.65rem;
  color: var(--text-color-secondary, #94a3b8);
  background: var(--surface-section, #f1f5f9);
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 400;
}

/* Feature rows */
.features-list {
  border-top: 1px solid rgba(0,0,0,0.03);
}

.feature-row {
  display: flex;
  align-items: center;
  padding: 5px 10px 5px 32px;
  font-size: 0.75rem;
  cursor: pointer;
  gap: 6px;
  transition: background 0.15s;
  border-bottom: 1px solid rgba(0,0,0,0.02);
}

.feature-row:hover {
  background: var(--surface-hover, rgba(0,0,0,0.03));
}

.feature-row.mapped {
  background: rgba(234, 179, 8, 0.12);
}

.feature-row.mapped:hover {
  background: rgba(234, 179, 8, 0.2);
}

.feature-row.is-selected {
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}

.feat-icon {
  font-size: 0.7rem;
  color: var(--text-color-secondary, #94a3b8);
  width: 14px;
}

.feat-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feat-type {
  font-size: 0.65rem;
  color: var(--text-color-secondary, #94a3b8);
  background: var(--surface-section, #f1f5f9);
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

/* Relation tabs */
.relation-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--surface-border, #e2e8f0);
  background: var(--surface-section, #f8fafc);
  overflow-x: auto;
  flex-shrink: 0;
}

.relation-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  border-right: 1px solid var(--surface-border, #e2e8f0);
  white-space: nowrap;
  transition: background 0.15s;
}

.relation-tab:hover {
  background: rgba(0,0,0,0.03);
}

.relation-tab.active {
  background: var(--surface-card, #fff);
  font-weight: 600;
  border-bottom: 2px solid var(--primary-color, #3B82F6);
}

.rel-tab-close {
  font-size: 0.6rem;
  opacity: 0.4;
  cursor: pointer;
}

.rel-tab-close:hover {
  opacity: 1;
  color: #EF4444;
}

/* Relation settings */
.relation-settings {
  padding: 10px 12px;
  border-bottom: 1px solid var(--surface-border, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
}

.setting-row label {
  width: 50px;
  font-weight: 600;
  color: var(--text-color-secondary, #64748b);
  flex-shrink: 0;
}

.setting-input {
  flex: 1;
  font-size: 0.75rem;
}

.setting-dropdown {
  flex: 1;
  font-size: 0.75rem;
}

/* Mappings section */
.mappings-section, .variables-section {
  padding: 8px 12px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-color-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--surface-border, #e2e8f0);
}

.mapping-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
  font-size: 0.75rem;
}

.mapping-dropdown {
  flex: 1;
  font-size: 0.7rem;
}

.mapping-arrow {
  font-size: 0.65rem;
  color: var(--text-color-secondary, #94a3b8);
  flex-shrink: 0;
}

.mapping-via {
  width: 90px;
  font-size: 0.7rem;
  flex-shrink: 0;
}

/* Variables */
.variables-section {
  border-top: 1px solid var(--surface-border, #e2e8f0);
}

.variable-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(0,0,0,0.04);
}

.variable-row .var-expr-editor {
  flex-basis: 100%;
}

.var-name-input {
  width: 80px;
  font-size: 0.7rem;
  font-weight: 500;
}

.var-type-input {
  width: 60px;
  font-size: 0.7rem;
}

.var-expr-editor {
  flex: 1;
  min-width: 0;
}

/* QVT-R Preview */
.qvt-preview {
  border-top: 1px solid var(--surface-border, #e2e8f0);
  background: var(--surface-card, #fff);
  max-height: 250px;
  overflow-y: auto;
  flex-shrink: 0;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  font-weight: 600;
  font-size: 0.8rem;
  background: #1E293B;
  color: #E2E8F0;
}

.preview-code {
  margin: 0;
  padding: 12px 16px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.75rem;
  line-height: 1.6;
  background: #0F172A;
  color: #E2E8F0;
  white-space: pre-wrap;
}

/* Save Notification */
.save-notification {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 0.8125rem;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
}

.save-notification.success {
  background: #F0FDF4;
  color: #166534;
  border: 1px solid #BBF7D0;
}

.save-notification.error {
  background: #FEF2F2;
  color: #991B1B;
  border: 1px solid #FECACA;
}

.notification-enter-active {
  transition: all 0.3s ease;
}
.notification-leave-active {
  transition: all 0.3s ease;
}
.notification-enter-from,
.notification-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
