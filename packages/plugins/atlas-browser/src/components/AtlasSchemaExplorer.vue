<script setup lang="ts">
/**
 * AtlasSchemaExplorer Component
 *
 * Read-only schema explorer with a Tree (left) and Properties (right)
 * displayed side-by-side in a PrimeVue Splitter.
 * Parses XMI via EMFTs and builds a navigable EPackage hierarchy.
 */

import { ref, watch, computed, toRaw, onMounted } from 'tsm:vue'
import { Tree, Splitter, SplitterPanel } from 'tsm:primevue'
import { EResourceSetImpl, XMIResource, URI, getEcorePackage } from '@emfts/core'
import type { EPackage, EClass, EAttribute, EReference, EEnum, EDataType, EObject } from '@emfts/core'
import { useSharedAtlasBrowser } from '../composables/useAtlasBrowser'

interface TreeNode {
  key: string
  label: string
  icon: string
  leaf?: boolean
  data?: any
  children?: TreeNode[]
  type?: string
}

interface PropertyEntry {
  label: string
  value: string
}

const browser = useSharedAtlasBrowser()
const content = computed(() => browser.schemaTreeContent.value)

// Auto-load content when tree selection changes
watch(() => browser.selectedNodeData.value, () => {
  browser.ensureContentForSelection()
}, { immediate: true })

const treeNodes = ref<TreeNode[]>([])
const selectedKey = ref<Record<string, boolean>>({})
const selectedElement = ref<any>(null)
const error = ref<string | null>(null)
const loading = ref(false)

// Map from tree key to EObject for selection lookup
const elementMap = new Map<string, any>()

// Properties of the selected element
const properties = computed<PropertyEntry[]>(() => {
  const el = selectedElement.value
  if (!el) return []

  const kind = el.__explorerKind
  const entries: PropertyEntry[] = []

  if (kind === 'EPackage') {
    entries.push({ label: 'Name', value: el.getName?.() || '' })
    entries.push({ label: 'NsURI', value: el.getNsURI?.() || '' })
    entries.push({ label: 'NsPrefix', value: el.getNsPrefix?.() || '' })
  } else if (kind === 'EClass') {
    entries.push({ label: 'Name', value: el.getName?.() || '' })
    entries.push({ label: 'Abstract', value: String(el.isAbstract?.() ?? false) })
    entries.push({ label: 'Interface', value: String(el.isInterface?.() ?? false) })
    const supers = el.getESuperTypes?.() || []
    const superNames = Array.from(supers).map((s: any) => s.getName?.() || '?').join(', ')
    entries.push({ label: 'SuperTypes', value: superNames || '-' })
  } else if (kind === 'EAttribute') {
    entries.push({ label: 'Name', value: el.getName?.() || '' })
    let typeName = ''
    try { typeName = el.getEAttributeType?.()?.getName?.() || '' } catch { /* */ }
    entries.push({ label: 'Type', value: typeName })
    entries.push({ label: 'LowerBound', value: String(el.getLowerBound?.() ?? 0) })
    entries.push({ label: 'UpperBound', value: formatBound(el.getUpperBound?.() ?? 1) })
    entries.push({ label: 'DefaultValue', value: el.getDefaultValueLiteral?.() || '-' })
    entries.push({ label: 'Derived', value: String(el.isDerived?.() ?? false) })
  } else if (kind === 'EReference') {
    entries.push({ label: 'Name', value: el.getName?.() || '' })
    let typeName = ''
    try { typeName = el.getEReferenceType?.()?.getName?.() || '' } catch { /* */ }
    entries.push({ label: 'Type', value: typeName })
    entries.push({ label: 'LowerBound', value: String(el.getLowerBound?.() ?? 0) })
    entries.push({ label: 'UpperBound', value: formatBound(el.getUpperBound?.() ?? 1) })
    entries.push({ label: 'Containment', value: String(el.isContainment?.() ?? false) })
    let oppName = ''
    try { oppName = el.getEOpposite?.()?.getName?.() || '' } catch { /* */ }
    entries.push({ label: 'Opposite', value: oppName || '-' })
  } else if (kind === 'EEnum') {
    entries.push({ label: 'Name', value: el.getName?.() || '' })
    const literals = el.getELiterals?.() || []
    const litNames = Array.from(literals).map((l: any) => l.getName?.() || '').join(', ')
    entries.push({ label: 'Literals', value: litNames || '-' })
  } else if (kind === 'EEnumLiteral') {
    entries.push({ label: 'Name', value: el.getName?.() || '' })
    entries.push({ label: 'Value', value: String(el.getValue?.() ?? 0) })
    entries.push({ label: 'Literal', value: el.getLiteral?.() || el.getName?.() || '' })
  } else if (kind === 'EDataType') {
    entries.push({ label: 'Name', value: el.getName?.() || '' })
    entries.push({ label: 'InstanceClassName', value: el.getInstanceClassName?.() || '-' })
  }

  return entries
})

const selectedKindLabel = computed(() => {
  return selectedElement.value?.__explorerKind || ''
})

function formatBound(b: number): string {
  return b === -1 ? '*' : String(b)
}

// Watch for content changes
watch(content, (newContent) => {
  if (newContent) {
    parseSchema(newContent)
  } else {
    treeNodes.value = []
    selectedElement.value = null
    elementMap.clear()
  }
}, { immediate: true })

function parseSchema(xmiContent: string) {
  loading.value = true
  error.value = null
  elementMap.clear()
  selectedElement.value = null
  selectedKey.value = {}

  try {
    const rs = new EResourceSetImpl()
    rs.getPackageRegistry().set('http://www.eclipse.org/emf/2002/Ecore', getEcorePackage())

    const uri = URI.createURI('atlas://explorer.ecore')
    const res = new XMIResource(uri)
    rs.getResources().push(res)
    res.setResourceSet(rs)
    res.loadFromString(xmiContent)

    const contents = res.getContents()
    const contentsSize = typeof contents.size === 'function' ? contents.size() : contents.length
    if (contentsSize === 0) {
      error.value = 'No contents found in schema'
      return
    }

    const ePackage = contents.get(0) as EPackage
    if (!ePackage.getName || !ePackage.getEClassifiers) {
      error.value = 'Root element is not an EPackage'
      return
    }

    treeNodes.value = [buildPackageNode(ePackage, 'root')]
  } catch (e: any) {
    console.error('[AtlasSchemaExplorer] Parse error:', e)
    error.value = e.message || 'Failed to parse schema'
  } finally {
    loading.value = false
  }
}

function buildPackageNode(pkg: EPackage, prefix: string): TreeNode {
  const name = pkg.getName() || 'unknown'
  const key = `${prefix}:pkg:${name}`
  const raw = toRaw(pkg) as any
  raw.__explorerKind = 'EPackage'
  elementMap.set(key, raw)

  const children: TreeNode[] = []

  const classifiers = pkg.getEClassifiers?.() || []
  const classifierArray = typeof (classifiers as any).toArray === 'function'
    ? (classifiers as any).toArray()
    : Array.from(classifiers)

  for (const classifier of classifierArray) {
    if (isEClass(classifier)) {
      children.push(buildClassNode(classifier as EClass, key))
    } else if (isEEnum(classifier)) {
      children.push(buildEnumNode(classifier as EEnum, key))
    } else {
      children.push(buildDataTypeNode(classifier as EDataType, key))
    }
  }

  // Sub-packages
  const subPackages = pkg.getESubpackages?.() || []
  const subArray = typeof (subPackages as any).toArray === 'function'
    ? (subPackages as any).toArray()
    : Array.from(subPackages)
  for (const sub of subArray) {
    children.push(buildPackageNode(sub as EPackage, key))
  }

  return {
    key,
    label: name,
    icon: 'pi pi-box',
    children,
    data: raw,
    type: 'EPackage'
  }
}

function buildClassNode(cls: EClass, prefix: string): TreeNode {
  const name = cls.getName?.() || 'Unnamed'
  const key = `${prefix}:cls:${name}`
  const raw = toRaw(cls) as any
  raw.__explorerKind = 'EClass'
  elementMap.set(key, raw)

  const children: TreeNode[] = []

  // Attributes
  const attrs = cls.getEAttributes?.() || []
  for (const attr of attrs) {
    children.push(buildAttributeNode(attr, key))
  }

  // References
  const refs = cls.getEReferences?.() || []
  for (const eRef of refs) {
    children.push(buildReferenceNode(eRef, key))
  }

  const isAbstract = cls.isAbstract?.() ?? false
  const label = isAbstract ? `${name} (abstract)` : name

  return {
    key,
    label,
    icon: 'pi pi-tag',
    children,
    leaf: children.length === 0,
    data: raw,
    type: 'EClass'
  }
}

function buildAttributeNode(attr: EAttribute, prefix: string): TreeNode {
  const name = attr.getName?.() || 'unnamed'
  const key = `${prefix}:attr:${name}`
  const raw = toRaw(attr) as any
  raw.__explorerKind = 'EAttribute'
  elementMap.set(key, raw)

  let typeName = 'EString'
  try {
    const t = attr.getEAttributeType?.()
    if (t) typeName = t.getName?.() || 'EString'
  } catch { /* type not resolved */ }

  const lower = attr.getLowerBound?.() ?? 0
  const upper = attr.getUpperBound?.() ?? 1
  const label = `${name} : ${typeName} [${lower}..${formatBound(upper)}]`

  return {
    key,
    label,
    icon: 'pi pi-minus',
    leaf: true,
    data: raw,
    type: 'EAttribute'
  }
}

function buildReferenceNode(eRef: EReference, prefix: string): TreeNode {
  const name = eRef.getName?.() || 'unnamed'
  const key = `${prefix}:ref:${name}`
  const raw = toRaw(eRef) as any
  raw.__explorerKind = 'EReference'
  elementMap.set(key, raw)

  let typeName = 'EObject'
  try {
    const t = eRef.getEReferenceType?.()
    if (t) typeName = t.getName?.() || 'EObject'
  } catch { /* type not resolved */ }

  const lower = eRef.getLowerBound?.() ?? 0
  const upper = eRef.getUpperBound?.() ?? -1
  const containment = eRef.isContainment?.() ?? false
  const arrow = containment ? '\u25C6' : '\u2192'
  const label = `${arrow} ${name} : ${typeName} [${lower}..${formatBound(upper)}]`

  return {
    key,
    label,
    icon: 'pi pi-arrow-right',
    leaf: true,
    data: raw,
    type: 'EReference'
  }
}

function buildEnumNode(en: EEnum, prefix: string): TreeNode {
  const name = en.getName?.() || 'Unnamed'
  const key = `${prefix}:enum:${name}`
  const raw = toRaw(en) as any
  raw.__explorerKind = 'EEnum'
  elementMap.set(key, raw)

  const children: TreeNode[] = []
  const literals = en.getELiterals?.() || []
  for (const lit of literals) {
    const litName = lit.getName?.() || ''
    const litKey = `${key}:lit:${litName}`
    const litRaw = toRaw(lit) as any
    litRaw.__explorerKind = 'EEnumLiteral'
    elementMap.set(litKey, litRaw)
    children.push({
      key: litKey,
      label: litName,
      icon: 'pi pi-circle',
      leaf: true,
      data: litRaw,
      type: 'EEnumLiteral'
    })
  }

  return {
    key,
    label: name,
    icon: 'pi pi-list',
    children,
    leaf: children.length === 0,
    data: raw,
    type: 'EEnum'
  }
}

function buildDataTypeNode(dt: EDataType, prefix: string): TreeNode {
  const name = dt.getName?.() || 'Unnamed'
  const key = `${prefix}:dt:${name}`
  const raw = toRaw(dt) as any
  raw.__explorerKind = 'EDataType'
  elementMap.set(key, raw)

  return {
    key,
    label: name,
    icon: 'pi pi-hashtag',
    leaf: true,
    data: raw,
    type: 'EDataType'
  }
}

function isEClass(classifier: any): boolean {
  return typeof classifier.getEAttributes === 'function' &&
    typeof classifier.getEReferences === 'function'
}

function isEEnum(classifier: any): boolean {
  return typeof classifier.getELiterals === 'function'
}

function onNodeSelect(node: any) {
  const key = typeof node === 'string' ? node : node?.key
  if (key && elementMap.has(key)) {
    selectedElement.value = elementMap.get(key)
    browser.selectedSchemaElement.value = selectedElement.value
  }
}
</script>

<template>
  <div class="atlas-schema-explorer">
    <!-- Empty state -->
    <div v-if="!content" class="explorer-empty">
      <i class="pi pi-search" style="font-size: 2.5rem; opacity: 0.2"></i>
      <p>Select a schema in the tree to browse its structure.</p>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="explorer-loading">
      <i class="pi pi-spin pi-spinner" style="font-size: 2rem"></i>
      <span>Parsing schema...</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="explorer-error">
      <i class="pi pi-exclamation-triangle"></i>
      <span>{{ error }}</span>
    </div>

    <!-- Splitter: Tree + Properties -->
    <Splitter v-else class="explorer-splitter" style="height: 100%">
      <SplitterPanel :size="55" :min-size="30" class="tree-panel">
        <div class="tree-header">
          <i class="pi pi-sitemap"></i>
          <span>Structure</span>
        </div>
        <div class="tree-container">
          <Tree
            :value="treeNodes"
            v-model:selectionKeys="selectedKey"
            selectionMode="single"
            class="explorer-tree"
            @node-select="onNodeSelect"
          />
        </div>
      </SplitterPanel>
      <SplitterPanel :size="45" :min-size="25" class="properties-panel">
        <div class="properties-header">
          <i class="pi pi-list"></i>
          <span>Properties</span>
          <span v-if="selectedKindLabel" class="kind-badge">{{ selectedKindLabel }}</span>
        </div>
        <div class="properties-container">
          <div v-if="!selectedElement" class="properties-empty">
            <p>Select an element in the tree to view its properties.</p>
          </div>
          <table v-else class="properties-table">
            <tbody>
              <tr v-for="prop in properties" :key="prop.label">
                <td class="prop-label">{{ prop.label }}</td>
                <td class="prop-value">{{ prop.value }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SplitterPanel>
    </Splitter>
  </div>
</template>

<style scoped>
.atlas-schema-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--surface-ground, var(--p-content-background));
  color: var(--p-text-color);
}

.explorer-empty,
.explorer-loading,
.explorer-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px;
  color: var(--p-text-muted-color);
  text-align: center;
  flex: 1;
}

.explorer-error {
  color: var(--p-red-500);
}

.explorer-empty p {
  margin: 0;
  font-size: 0.85rem;
  max-width: 300px;
}

.explorer-splitter {
  flex: 1;
  border: none;
}

.tree-panel,
.properties-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tree-header,
.properties-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--surface-section, var(--p-content-background));
  border-bottom: 1px solid var(--surface-border, var(--p-content-border-color));
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-color-secondary, var(--p-text-muted-color));
  text-transform: uppercase;
  flex-shrink: 0;
}

.kind-badge {
  margin-left: auto;
  font-size: 0.7rem;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--p-highlight-background);
  color: var(--p-primary-color);
  text-transform: none;
}

.tree-container {
  flex: 1;
  overflow: auto;
  padding: 0.5rem;
}

.explorer-tree {
  border: none;
  font-size: 0.82rem;
  background: transparent;
}

.explorer-tree :deep(.p-tree-node-label) {
  font-size: 0.82rem;
}

.properties-container {
  flex: 1;
  overflow: auto;
  padding: 8px;
}

.properties-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
}

.properties-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.properties-table tr {
  border-bottom: 1px solid var(--surface-border, var(--p-content-border-color));
}

.prop-label {
  padding: 5px 10px 5px 0;
  font-weight: 500;
  color: var(--text-color-secondary, var(--p-text-muted-color));
  white-space: nowrap;
  width: 120px;
}

.prop-value {
  padding: 5px 0;
  word-break: break-all;
}
</style>
