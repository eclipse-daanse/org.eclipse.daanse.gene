<script setup lang="ts">
/**
 * DataGenPerspective - Main container for the Data Generator plugin.
 * Toolbar + Splitter (left: Tree, right: Editor)
 */

import { ref, computed, onMounted, watch, inject } from 'tsm:vue'
import { Button, InputText, Dialog, Select, Tree, Menu } from 'tsm:primevue'
import type { DataGenConfig, ClassGenConfig, GenerationResult } from '../types'
import { createDefaultConfig } from '../types'
import { useDataGenerator } from '../composables/useDataGenerator'
import { useGeneratorRegistry } from '../composables/useGeneratorRegistry'
import { registerFakerProviders, setFakerLocale, setFakerSeed } from '../composables/useFakerProviders'
import { registerDatafakerProviders } from '../composables/useDatafakerProviders'
import { generateInstances } from '../composables/useInstanceGenerator'
import { useRemoteDataGen } from '../composables/useRemoteDataGen'
import { useDataGenAtlas } from '../composables/useDataGenAtlas'
import { useSharedModelRegistry } from 'ui-model-browser'
import DataGenTree from './DataGenTree.vue'
import DataGenEditor from './DataGenEditor.vue'
import GenerationDialog from './GenerationDialog.vue'

const dg = useDataGenerator()
const tsm = inject<any>('tsm')
const registry = useGeneratorRegistry()
const remoteGen = useRemoteDataGen()
const atlas = useDataGenAtlas()

// Generate dropdown menu
const generateMenu = ref<InstanceType<typeof Menu> | null>(null)
const generateMenuItems = computed(() => {
  const items: any[] = [
    {
      label: 'Lokal generieren',
      icon: 'pi pi-bolt',
      command: () => handleGenerate()
    }
  ]
  if (remoteGen.isAvailable.value) {
    for (const conn of remoteGen.availableConnections.value) {
      items.push({
        label: `Server: ${conn.label}`,
        icon: 'pi pi-server',
        command: () => handleGenerateRemote(conn.id)
      })
    }
  }
  // Always show "Generate on Server" via Atlas DataGen endpoint
  items.push({
    label: 'Auf Server generieren (Atlas)',
    icon: 'pi pi-cloud',
    disabled: !dg.config.value?.name,
    command: () => handleGenerateOnServer()
  })
  return items
})

// Generation state
const showGenDialog = ref(false)
const genRunning = ref(false)
const genProgress = ref(0)
const genProgressMsg = ref('')
const genResult = ref<GenerationResult | null>(null)

// Class picker dialog
const showClassPicker = ref(false)
const classPickerExpandedKeys = ref<Record<string, boolean>>({})

// Config metadata dialog
const showNewConfigDialog = ref(false)
const newConfigName = ref('MyTestData')

// Initialize faker providers
let providersRegistered = false

onMounted(() => {
  if (!providersRegistered) {
    const count = registerFakerProviders()
    console.log(`[DataGenerator] Registered ${count} faker providers`)
    providersRegistered = true
    // Async load Datafaker-sourced providers (weather, computer, medical, etc.)
    registerDatafakerProviders()
  }

  // Load from TSM service if available (set by App.vue on .datagen file open)
  const data = tsm?.getService('gene.datagen.data')
  if (data) {
    try {
      const parsed = parseDatagenXml(data.content)
      if (parsed) {
        dg.loadConfig(parsed, data.filePath, data.fileEntry)
        console.log('[DataGenerator] Loaded config:', parsed.name)
      }
    } catch (e) {
      console.error('[DataGenerator] Failed to parse .datagen file:', e)
    }
  }
})

// --- Model registry for class picker ---
const modelRegistry = useSharedModelRegistry()

const classTreeNodes = computed(() => {
  const allPkgs = modelRegistry.allPackages?.value || []
  return allPkgs.flatMap((pkgInfo: any) => buildClassNodes(pkgInfo.ePackage, ''))
})

function buildClassNodes(pkg: any, prefix: string): any[] {
  const nodes: any[] = []
  const pkgName = pkg.getName?.() || ''
  const nsURI = pkg.getNsURI?.() || ''
  const fullPrefix = prefix ? `${prefix}.${pkgName}` : pkgName

  const classifiers = pkg.getEClassifiers?.() || []
  for (const cls of Array.from(classifiers) as any[]) {
    if ('getEAttributes' in cls || 'getEAllAttributes' in cls) {
      const name = cls.getName?.() || ''
      if (!name) continue
      const isAbstract = cls.isAbstract?.() || false
      // Use full EClass URI: nsURI#//ClassName
      const classURI = nsURI ? `${nsURI}#//${name}` : `${fullPrefix}.${name}`
      nodes.push({
        key: classURI,
        label: name,
        icon: isAbstract ? 'pi pi-circle' : 'pi pi-box',
        type: 'class',
        leaf: true,
        data: { qualifiedName: classURI, eClass: cls, isAbstract }
      })
    }
  }

  const subPkgs = pkg.getESubpackages?.() || []
  for (const sub of Array.from(subPkgs)) {
    const subNodes = buildClassNodes(sub, fullPrefix)
    if (subNodes.length > 0) {
      const subName = (sub as any).getName?.() || ''
      nodes.push({
        key: `pkg-${fullPrefix}.${subName}`,
        label: subName,
        icon: 'pi pi-folder',
        type: 'package',
        children: subNodes,
        leaf: false,
        selectable: false
      })
    }
  }

  return nodes
}

// --- Actions ---

function handleNewConfig() {
  showNewConfigDialog.value = true
}

function createNewConfig() {
  dg.newConfig(newConfigName.value || 'New Config')
  showNewConfigDialog.value = false
}

function handleAddClass() {
  // Open class picker
  // Auto-expand all
  const keys: Record<string, boolean> = {}
  for (const node of classTreeNodes.value) {
    if (!node.leaf) keys[node.key] = true
  }
  classPickerExpandedKeys.value = keys
  showClassPicker.value = true
}

function handleClassPickerSelect(node: any) {
  const treeNode = (node as any).node ?? node
  if (treeNode.type !== 'class') return
  dg.addClassConfig(treeNode.data.qualifiedName)

  // Auto-configure if we have the eClass
  if (treeNode.data.eClass) {
    const idx = dg.config.value!.classConfigs.length - 1
    dg.autoConfigureClass(idx, treeNode.data.eClass)
  }

  showClassPicker.value = false
}

function handleAutoConfigureClass(index: number) {
  const cc = dg.config.value?.classConfigs[index]
  if (!cc) return

  const eClass = findEClass(cc.contextClass)
  if (eClass) {
    dg.autoConfigureClass(index, eClass)
  }
}

/**
 * Find EClass by URI (nsURI#//ClassName) or legacy dot-format (pkg.ClassName)
 */
function findEClass(contextClass: string): any | null {
  const allPkgs = modelRegistry.allPackages?.value || []

  // URI format: nsURI#//ClassName
  if (contextClass.includes('#//')) {
    const [nsURI, fragment] = contextClass.split('#//')
    const className = fragment || ''
    for (const pkgInfo of allPkgs) {
      if (pkgInfo.nsURI === nsURI || pkgInfo.ePackage.getNsURI?.() === nsURI) {
        const found = findClassInPkg(pkgInfo.ePackage, className)
        if (found) return found
      }
    }
    return null
  }

  // Legacy dot-format fallback: pkg.ClassName
  const lastDot = contextClass.lastIndexOf('.')
  const className = lastDot >= 0 ? contextClass.substring(lastDot + 1) : contextClass
  for (const pkgInfo of allPkgs) {
    const found = findClassInPkg(pkgInfo.ePackage, className)
    if (found) return found
  }
  return null
}

function findClassInPkg(pkg: any, className: string): any | null {
  const classifiers = pkg.getEClassifiers?.() || []
  for (const cls of Array.from(classifiers) as any[]) {
    if ((cls as any).getName?.() === className) return cls
  }
  const subs = pkg.getESubpackages?.() || []
  for (const sub of Array.from(subs)) {
    const found = findClassInPkg(sub, className)
    if (found) return found
  }
  return null
}

// --- Save / Load ---

async function handleSave() {
  if (!dg.config.value) return

  const xml = serializeDatagenToXml(dg.config.value)
  const geneFS = tsm?.getService('gene.filesystem')
  const fileEntry = dg.getFileEntry()

  if (geneFS && fileEntry) {
    await geneFS.writeTextFile(fileEntry, xml)
    dg.markSaved()
    console.log('[DataGenerator] Saved:', dg.filePath.value)
  } else {
    // Save As fallback
    handleSaveAs()
  }
}

async function handleSaveAs() {
  if (!dg.config.value) return

  const xml = serializeDatagenToXml(dg.config.value)
  const defaultName = `${dg.config.value.name || 'config'}.datagen`

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: defaultName,
        types: [{ description: 'DataGen Config', accept: { 'application/xml': ['.datagen'] } }]
      })
      const writable = await handle.createWritable()
      await writable.write(xml)
      await writable.close()
      dg.markSaved()
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error('[DataGenerator] Save As failed:', e)
    }
  } else {
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = defaultName
    a.click()
    URL.revokeObjectURL(url)
  }
}

// --- Atlas Server Integration ---

const showServerListDialog = ref(false)
const serverConfigs = ref<any[]>([])

async function handleUploadToServer() {
  if (!dg.config.value) return

  const xml = serializeDatagenToXml(dg.config.value)
  const name = dg.config.value.name || 'Unnamed'
  const version = dg.config.value.version || '1.0'

  const result = await atlas.uploadConfig(xml, name, version)
  if (result.success) {
    console.log(`[DataGenerator] Uploaded to server: ${name} v${version}`)
  } else {
    console.error('[DataGenerator] Upload failed:', atlas.error.value)
  }
}

async function handleLoadFromServer() {
  showServerListDialog.value = true
  serverConfigs.value = await atlas.listConfigs()
}

async function handleSelectServerConfig(config: any) {
  showServerListDialog.value = false
  const xmi = await atlas.loadConfig(config.objectId, config.stage)
  if (xmi) {
    parseDatagenFromXml(xmi)
    console.log(`[DataGenerator] Loaded from server: ${config.name}`)
  }
}

async function handleGenerateOnServer() {
  if (!dg.config.value) return

  const name = dg.config.value.name
  const version = dg.config.value.version
  const result = await atlas.generateOnServer(name, version)

  if (result.success) {
    genResult.value = {
      success: true,
      instanceCount: (result.xmiContent.match(/xsi:type=/g) || []).length,
      xmiContent: result.xmiContent,
      errors: [],
      log: ['Generated on server: ' + name]
    }
    showGenDialog.value = true
  } else {
    console.error('[DataGenerator] Server generation failed:', result.error)
  }
}

// --- Generation ---

async function handleGenerate() {
  if (!dg.config.value) return

  genResult.value = null
  genRunning.value = true
  genProgress.value = 0
  genProgressMsg.value = 'Starting...'
  showGenDialog.value = true

  // Run generation in next tick to let UI update
  await new Promise(r => setTimeout(r, 50))

  try {
    const result = generateInstances(
      dg.config.value,
      modelRegistry,
      (msg, pct) => {
        genProgressMsg.value = msg
        genProgress.value = pct
      }
    )
    genResult.value = result
  } catch (e: any) {
    genResult.value = {
      success: false,
      instanceCount: 0,
      xmiContent: '',
      errors: [e.message],
      log: []
    }
  } finally {
    genRunning.value = false
    genProgress.value = 100
    genProgressMsg.value = 'Done'
  }
}

async function handleGenerateRemote(connectionId: string) {
  if (!dg.config.value) return

  // Build package name → nsURI map from model registry
  const allPkgs = modelRegistry.allPackages?.value || []
  const pkgMap = new Map<string, string>()
  for (const pkgInfo of allPkgs) {
    const name = pkgInfo.name || pkgInfo.ePackage?.getName?.()
    const nsUri = pkgInfo.nsURI || pkgInfo.ePackage?.getNsURI?.()
    if (name && nsUri) {
      pkgMap.set(name, nsUri)
      // Ensure targetModelNsURIs contains this nsURI
      if (!dg.config.value.targetModelNsURIs.includes(nsUri)) {
        dg.config.value.targetModelNsURIs.push(nsUri)
      }
    }
  }

  genResult.value = null
  genRunning.value = true
  genProgress.value = 0
  genProgressMsg.value = 'Sende an Atlas Server...'
  showGenDialog.value = true

  try {
    const result = await remoteGen.generateRemote(
      dg.config.value,
      connectionId,
      (msg, pct) => {
        genProgressMsg.value = msg
        genProgress.value = pct
      },
      pkgMap
    )
    genResult.value = result
  } catch (e: any) {
    genResult.value = {
      success: false,
      instanceCount: 0,
      xmiContent: '',
      errors: [e.message],
      log: []
    }
  } finally {
    genRunning.value = false
    genProgress.value = 100
    genProgressMsg.value = 'Done'
  }
}

function handleSaveXmi() {
  if (!genResult.value?.xmiContent) return

  const defaultName = `${dg.config.value?.name || 'generated'}.xmi`

  if ('showSaveFilePicker' in window) {
    ;(window as any).showSaveFilePicker({
      suggestedName: defaultName,
      types: [{ description: 'XMI File', accept: { 'application/xml': ['.xmi'] } }]
    }).then(async (handle: any) => {
      const writable = await handle.createWritable()
      await writable.write(genResult.value!.xmiContent)
      await writable.close()
    }).catch((e: any) => {
      if (e.name !== 'AbortError') console.error('[DataGenerator] XMI save failed:', e)
    })
  } else {
    const blob = new Blob([genResult.value.xmiContent], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = defaultName
    a.click()
    URL.revokeObjectURL(url)
  }
}

async function handleSaveToWorkspace() {
  if (!genResult.value?.xmiContent) return

  const geneFS = tsm?.getService('gene.filesystem')
  if (!geneFS) {
    console.warn('[DataGenerator] No file system available')
    return
  }

  const fileName = `${dg.config.value?.name || 'generated'}.xmi`

  // Use File System Access API to let user pick location
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
      })
      const writable = await handle.createWritable()
      await writable.write(genResult.value.xmiContent)
      await writable.close()
      console.log('[DataGenerator] Saved to workspace:', fileName)
      showGenDialog.value = false
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('[DataGenerator] Save failed:', e)
      }
    }
  } else {
    // Fallback: download
    const blob = new Blob([genResult.value.xmiContent], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }
}

// --- Serialization ---

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function serializeDatagenToXml(cfg: DataGenConfig): string {
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')

  const rootAttrs = [
    'xmi:version="2.0"',
    'xmlns:xmi="http://www.omg.org/XMI"',
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    'xmlns:datagen="http://www.gme.org/datagen/1.0"',
    `name="${escapeXml(cfg.name)}"`,
    `version="${escapeXml(cfg.version || '1.0')}"`,
  ]
  if (cfg.description) rootAttrs.push(`description="${escapeXml(cfg.description)}"`)
  if (cfg.seed) rootAttrs.push(`seed="${cfg.seed}"`)
  if (cfg.locale) rootAttrs.push(`locale="${escapeXml(cfg.locale)}"`)

  lines.push(`<datagen:DataGenConfig ${rootAttrs.join('\n    ')}>`)

  for (const uri of cfg.targetModelNsURIs) {
    lines.push(`  <targetModelNsURIs>${escapeXml(uri)}</targetModelNsURIs>`)
  }

  for (const cc of cfg.classConfigs) {
    const ccAttrs = [
      `contextClass="${escapeXml(cc.contextClass)}"`,
      `instanceCount="${cc.instanceCount}"`,
      `enabled="${cc.enabled}"`
    ]
    const hasChildren = cc.attributeGens.length > 0 || cc.referenceGens.length > 0
    if (!hasChildren) {
      lines.push(`  <classConfigs ${ccAttrs.join(' ')}/>`)
    } else {
      lines.push(`  <classConfigs ${ccAttrs.join(' ')}>`)
      for (const ag of cc.attributeGens) {
        const agAttrs = [`featureName="${escapeXml(ag.featureName)}"`, `generatorKey="${escapeXml(ag.generatorKey)}"`]
        if (ag.generatorArgs) agAttrs.push(`generatorArgs="${escapeXml(ag.generatorArgs)}"`)
        if (ag.unique) agAttrs.push(`unique="true"`)
        if (ag.staticValue) agAttrs.push(`staticValue="${escapeXml(ag.staticValue)}"`)
        if (ag.template) agAttrs.push(`template="${escapeXml(ag.template)}"`)
        lines.push(`    <attributeGens ${agAttrs.join(' ')}/>`)
      }
      for (const rg of cc.referenceGens) {
        const rgAttrs = [
          `featureName="${escapeXml(rg.featureName)}"`,
          `strategy="${rg.strategy}"`,
          `minCount="${rg.minCount}"`,
          `maxCount="${rg.maxCount}"`
        ]
        if (rg.targetClassFilter) rgAttrs.push(`targetClassFilter="${escapeXml(rg.targetClassFilter)}"`)
        lines.push(`    <referenceGens ${rgAttrs.join(' ')}/>`)
      }
      lines.push('  </classConfigs>')
    }
  }

  for (const cg of cfg.customGenerators) {
    const cgAttrs = [
      `key="${escapeXml(cg.key)}"`,
      `label="${escapeXml(cg.label)}"`,
      `expression="${escapeXml(cg.expression)}"`,
    ]
    if (cg.category && cg.category !== 'Custom') cgAttrs.push(`category="${escapeXml(cg.category)}"`)
    lines.push(`  <customGenerators ${cgAttrs.join(' ')}/>`)
  }

  lines.push('')
  lines.push('</datagen:DataGenConfig>')
  return lines.join('\n')
}

function parseDatagenXml(xml: string): DataGenConfig | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')
    const root = doc.documentElement

    const config: DataGenConfig = {
      name: root.getAttribute('name') || '',
      version: root.getAttribute('version') || '1.0',
      description: root.getAttribute('description') || '',
      seed: parseInt(root.getAttribute('seed') || '0', 10) || 0,
      locale: root.getAttribute('locale') || 'de',
      targetModelNsURIs: [],
      classConfigs: [],
      customGenerators: []
    }

    // Parse targetModelNsURIs
    for (const el of Array.from(root.querySelectorAll('targetModelNsURIs'))) {
      const uri = el.textContent?.trim()
      if (uri) config.targetModelNsURIs.push(uri)
    }

    // Parse classConfigs
    for (const ccEl of Array.from(root.querySelectorAll('classConfigs'))) {
      const cc: ClassGenConfig = {
        contextClass: ccEl.getAttribute('contextClass') || '',
        instanceCount: parseInt(ccEl.getAttribute('instanceCount') || '10', 10),
        enabled: ccEl.getAttribute('enabled') !== 'false',
        attributeGens: [],
        referenceGens: []
      }

      for (const agEl of Array.from(ccEl.querySelectorAll('attributeGens'))) {
        cc.attributeGens.push({
          featureName: agEl.getAttribute('featureName') || '',
          generatorKey: agEl.getAttribute('generatorKey') || '',
          generatorArgs: agEl.getAttribute('generatorArgs') || '',
          unique: agEl.getAttribute('unique') === 'true',
          staticValue: agEl.getAttribute('staticValue') || '',
          template: agEl.getAttribute('template') || ''
        })
      }

      for (const rgEl of Array.from(ccEl.querySelectorAll('referenceGens'))) {
        cc.referenceGens.push({
          featureName: rgEl.getAttribute('featureName') || '',
          strategy: (rgEl.getAttribute('strategy') as any) || 'RANDOM',
          targetClassFilter: rgEl.getAttribute('targetClassFilter') || '',
          minCount: parseInt(rgEl.getAttribute('minCount') || '0', 10),
          maxCount: parseInt(rgEl.getAttribute('maxCount') || '1', 10)
        })
      }

      config.classConfigs.push(cc)
    }

    // Parse customGenerators
    for (const cgEl of Array.from(root.querySelectorAll('customGenerators'))) {
      config.customGenerators.push({
        key: cgEl.getAttribute('key') || '',
        label: cgEl.getAttribute('label') || '',
        expression: cgEl.getAttribute('expression') || '',
        category: cgEl.getAttribute('category') || 'Custom'
      })
    }

    return config
  } catch (e) {
    console.error('[DataGenerator] XML parse error:', e)
    return null
  }
}
</script>

<template>
  <div class="datagen-perspective">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <Button icon="pi pi-file" label="New" size="small" severity="secondary" text @click="handleNewConfig" />
        <Button icon="pi pi-save" label="Save" size="small" severity="secondary" text @click="handleSave"
          :disabled="!dg.config.value || !dg.isDirty.value" />
        <Button icon="pi pi-file-export" label="Save As" size="small" severity="secondary" text @click="handleSaveAs"
          :disabled="!dg.config.value" />
        <span class="toolbar-sep"></span>
        <Button icon="pi pi-cloud-upload" label="Upload to Server" size="small" severity="secondary" text @click="handleUploadToServer"
          :disabled="!dg.config.value" :loading="atlas.loading.value" />
        <Button icon="pi pi-cloud-download" label="Load from Server" size="small" severity="secondary" text @click="handleLoadFromServer" />
        <span v-if="dg.isDirty.value" class="dirty-badge">Unsaved</span>
      </div>
      <div class="toolbar-center">
        <span v-if="dg.config.value" class="config-name">{{ dg.config.value.name }}</span>
      </div>
      <div class="toolbar-right">
        <div class="toolbar-field" v-if="dg.config.value">
          <label>Locale</label>
          <InputText
            :modelValue="dg.config.value.locale"
            @update:modelValue="dg.config.value!.locale = $event; dg.markDirty()"
            size="small"
            style="width: 50px"
          />
        </div>
        <div class="toolbar-field" v-if="dg.config.value">
          <label>Seed</label>
          <InputText
            :modelValue="String(dg.config.value.seed)"
            @update:modelValue="dg.config.value!.seed = parseInt($event) || 0; dg.markDirty()"
            size="small"
            style="width: 60px"
            placeholder="0"
          />
        </div>
        <div class="split-button">
          <Button
            icon="pi pi-bolt"
            label="Generate"
            size="small"
            severity="success"
            @click="handleGenerate"
            :disabled="!dg.config.value || dg.config.value.classConfigs.length === 0"
            class="split-main"
          />
          <Button
            icon="pi pi-chevron-down"
            size="small"
            severity="success"
            @click="(e: any) => generateMenu?.toggle(e)"
            :disabled="!dg.config.value || dg.config.value.classConfigs.length === 0"
            class="split-toggle"
          />
          <Menu ref="generateMenu" :model="generateMenuItems" :popup="true" />
        </div>
      </div>
    </div>

    <!-- Main content -->
    <div class="main-content" v-if="dg.config.value">
      <div class="left-panel">
        <DataGenTree
          :config="dg.config.value"
          :selectedClassIndex="dg.selectedClassIndex.value"
          @select-class="dg.selectClass"
          @add-class="handleAddClass"
          @remove-class="dg.removeClassConfig"
          @auto-configure="handleAutoConfigureClass"
        />
      </div>
      <div class="right-panel">
        <DataGenEditor
          :classConfig="dg.selectedClassConfig.value"
          :classIndex="dg.selectedClassIndex.value"
          @update="dg.updateClassConfig"
          @update-attr="dg.updateAttributeGen"
          @remove-attr="dg.removeAttributeGen"
          @add-attr="(idx) => dg.addAttributeGen(idx, 'newAttribute')"
          @update-ref="dg.updateReferenceGen"
          @remove-ref="dg.removeReferenceGen"
          @add-ref="(idx) => dg.addReferenceGen(idx, 'newReference')"
        />
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <i class="pi pi-bolt" style="font-size: 3rem; opacity: 0.2"></i>
      <h3>Data Generator</h3>
      <p>Generate test data from EMF metamodels using FakerJS</p>
      <div class="empty-actions">
        <Button label="New Configuration" icon="pi pi-plus" @click="handleNewConfig" />
      </div>
      <p class="hint">Or open a .datagen file from the Explorer</p>
    </div>

    <!-- New Config Dialog -->
    <Dialog v-model:visible="showNewConfigDialog" header="New Configuration" :modal="true" :style="{ width: '350px' }">
      <div class="dialog-field">
        <label>Config Name</label>
        <InputText v-model="newConfigName" placeholder="MyTestData" class="w-full" @keyup.enter="createNewConfig" />
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="showNewConfigDialog = false" />
        <Button label="Create" @click="createNewConfig" :disabled="!newConfigName" />
      </template>
    </Dialog>

    <!-- Class Picker Dialog -->
    <Dialog v-model:visible="showClassPicker" header="Add Class" :modal="true" :style="{ width: '420px' }" :contentStyle="{ padding: 0 }">
      <div class="class-picker-content">
        <Tree
          v-if="classTreeNodes.length > 0"
          :value="classTreeNodes"
          v-model:expandedKeys="classPickerExpandedKeys"
          selectionMode="single"
          @node-select="handleClassPickerSelect"
          class="class-picker-tree"
        >
          <template #default="{ node }">
            <div class="picker-node" :class="{ 'is-abstract': node.data?.isAbstract }">
              <span>{{ node.label }}</span>
              <span v-if="node.data?.isAbstract" class="abstract-tag">abstract</span>
            </div>
          </template>
        </Tree>
        <div v-else class="picker-empty">
          <p>No metamodels loaded in workspace.</p>
          <p class="hint">Load a .ecore model first.</p>
        </div>
      </div>
    </Dialog>

    <!-- Generation Dialog -->
    <GenerationDialog
      v-model:visible="showGenDialog"
      :result="genResult"
      :running="genRunning"
      :progress="genProgress"
      :progressMessage="genProgressMsg"
      @save-xmi="handleSaveXmi"
      @save-workspace="handleSaveToWorkspace"
      @cancel="genRunning = false"
    />

    <!-- Server Config List Dialog -->
    <Dialog
      v-model:visible="showServerListDialog"
      header="DataGen Configs auf Server"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div v-if="atlas.loading.value" style="text-align: center; padding: 20px;">
        <i class="pi pi-spinner pi-spin" style="font-size: 1.5rem"></i>
        <p>Lade Konfigurationen...</p>
      </div>
      <div v-else-if="serverConfigs.length === 0" style="text-align: center; padding: 20px; color: var(--text-color-secondary);">
        Keine Konfigurationen auf dem Server gefunden.
      </div>
      <div v-else class="server-config-list">
        <div
          v-for="cfg in serverConfigs"
          :key="cfg.objectId"
          class="server-config-item"
          @click="handleSelectServerConfig(cfg)"
        >
          <div class="config-item-info">
            <span class="config-item-name">{{ cfg.name }}</span>
            <span class="config-item-version">v{{ cfg.version }}</span>
          </div>
          <span class="config-item-id">{{ cfg.objectId }}</span>
        </div>
      </div>
      <template #footer>
        <Button label="Schliessen" severity="secondary" size="small" @click="showServerListDialog = false" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.datagen-perspective {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-card);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-ground);
  gap: 12px;
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-center {
  flex: 1;
  text-align: center;
}

.config-name {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-color);
}

.dirty-badge {
  font-size: 0.6875rem;
  font-weight: 600;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
}

.toolbar-field {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-field label {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-color-secondary);
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.left-panel {
  width: 280px;
  min-width: 200px;
  flex-shrink: 0;
}

.right-panel {
  flex: 1;
  overflow: hidden;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 8px;
  color: var(--text-color-secondary);
}

.empty-state h3 {
  margin: 0;
  font-size: 1.125rem;
  color: var(--text-color);
}

.empty-state p { margin: 0; font-size: 0.875rem; }
.empty-state .hint { font-size: 0.75rem; opacity: 0.7; margin-top: 8px; }
.empty-actions { margin-top: 12px; }

.dialog-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dialog-field label {
  font-weight: 500;
  font-size: 0.875rem;
}

.w-full { width: 100%; }

.toolbar-sep {
  width: 1px;
  height: 20px;
  background: var(--surface-border);
  margin: 0 4px;
}

/* Server Config List */
.server-config-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.server-config-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--surface-border);
}

.server-config-item:hover {
  background: var(--surface-hover);
}

.config-item-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-item-name {
  font-weight: 600;
  font-size: 0.875rem;
}

.config-item-version {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.config-item-id {
  font-size: 0.6875rem;
  font-family: monospace;
  color: var(--text-color-secondary);
}

/* Class Picker */
.class-picker-content {
  max-height: 400px;
  overflow-y: auto;
}

.class-picker-tree {
  border: none;
  padding: 0;
}

.picker-node {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
}

.picker-node.is-abstract {
  font-style: italic;
  opacity: 0.75;
}

.abstract-tag {
  font-size: 0.5625rem;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--surface-hover);
  color: var(--text-color-secondary);
  font-style: normal;
}

.picker-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--text-color-secondary);
}

.picker-empty .hint { font-size: 0.75rem; opacity: 0.7; }

/* Split Button */
.split-button {
  display: flex;
  align-items: stretch;
}

.split-button .split-main {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.split-button .split-toggle {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.2);
  padding-left: 6px;
  padding-right: 6px;
}
</style>
