<script setup lang="ts">
import { ref, computed, watch } from 'tsm:vue'
import { Dialog, Tree } from 'tsm:primevue'
import { useSharedModelRegistry } from '../composables/useModelRegistry'
import { deriveRootEPackages, collectClassesDeep, type PickerClass } from './classPickerSource'

interface ClassSelection {
  eClass: any
  qualifiedName: string
  className: string
  packageNsURI: string
}

type FlatItem = PickerClass

const props = withDefaults(defineProps<{
  visible: boolean
  header?: string
  /** 'list' = flache Liste (default), 'tree' = Paket-Baum mit Expand/Collapse */
  viewMode?: 'list' | 'tree'
  includeAbstract?: boolean
  /**
   * Root EPackage(s) to pick from. When provided, the dialog reads classes from
   * these (and their subpackages) instead of the shared ModelRegistry. Callers
   * that edit a live model (e.g. the Metamodeler) pass their working model here
   * so unsaved/newly added classes are visible. Omit to use the registry.
   */
  sourcePackages?: any[]
}>(), {
  header: 'Select Class',
  viewMode: 'tree',
  includeAbstract: true
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'select': [selection: ClassSelection]
}>()

const modelRegistry = useSharedModelRegistry()
const expandedKeys = ref<Record<string, boolean>>({})

// ── Flat list ──────────────────────────────────────────────────────────────

// Root EPackages to render (sourcePackages override / registry dedup). See
// classPickerSource for the rationale; kept pure there so it is unit-testable.
const rootEPackages = computed<any[]>(() =>
  deriveRootEPackages(modelRegistry.userPackages?.value, props.sourcePackages)
)

const flatItems = computed<FlatItem[]>(() =>
  collectClassesDeep(rootEPackages.value, props.includeAbstract)
)

// ── Tree nodes (Package als expandierbarer Elternknoten) ───────────────────

function buildPackageNode(pkg: any, parentPrefix: string): any | null {
  const pkgName = pkg.getName?.() || ''
  const nsURI = pkg.getNsURI?.() || ''
  const prefix = parentPrefix ? `${parentPrefix}.${pkgName}` : pkgName
  const children: any[] = []

  for (const cls of Array.from(pkg.getEClassifiers?.() ?? []) as any[]) {
    if (!('getEAllAttributes' in cls || 'getEAttributes' in cls)) continue
    const name = cls.getName?.() || ''
    if (!name) continue
    const isAbstract = cls.isAbstract?.() || false
    if (!props.includeAbstract && isAbstract) continue
    const qualifiedName = nsURI ? `${nsURI}#//${name}` : `${prefix}.${name}`
    children.push({
      key: qualifiedName,
      label: name,
      icon: isAbstract ? 'pi pi-circle' : 'pi pi-box',
      type: 'class',
      leaf: true,
      selectable: true,
      data: { eClass: cls, qualifiedName, className: name, packageNsURI: nsURI, isAbstract }
    })
  }

  for (const sub of Array.from(pkg.getESubpackages?.() ?? []) as any[]) {
    const subNode = buildPackageNode(sub, prefix)
    if (subNode) children.push(subNode)
  }

  if (children.length === 0) return null

  return {
    key: `pkg:${prefix}`,
    label: pkgName,
    icon: 'pi pi-folder',
    type: 'package',
    leaf: false,
    selectable: false,
    children
  }
}

const treeNodes = computed(() =>
  rootEPackages.value
    .map((pkg: any) => buildPackageNode(pkg, ''))
    .filter(Boolean)
)

function expandAll() {
  const keys: Record<string, boolean> = {}
  function walk(nodes: any[]) {
    for (const n of nodes) {
      if (!n.leaf) { keys[n.key] = true; walk(n.children ?? []) }
    }
  }
  walk(treeNodes.value)
  expandedKeys.value = keys
}

watch(() => props.visible, (v) => { if (v) expandAll() })

// ── Selection ──────────────────────────────────────────────────────────────

function selectFlat(item: FlatItem) {
  emit('select', { eClass: item.eClass, qualifiedName: item.qualifiedName, className: item.className, packageNsURI: item.packageNsURI })
  emit('update:visible', false)
}

function onNodeSelect(node: any) {
  if (node.type !== 'class') return
  emit('select', node.data as ClassSelection)
  emit('update:visible', false)
}

function close() { emit('update:visible', false) }
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="close"
    :header="header"
    :modal="true"
    :style="{ width: '440px' }"
    :contentStyle="{ padding: 0 }"
  >
    <div class="ccp-body">

      <!-- Flache Liste -->
      <template v-if="viewMode === 'list'">
        <div
          v-for="item in flatItems"
          :key="item.qualifiedName"
          class="ccp-list-item"
          :class="{ 'ccp-abstract': item.isAbstract }"
          @click="selectFlat(item)"
        >
          <i :class="item.isAbstract ? 'pi pi-circle' : 'pi pi-box'" class="ccp-list-icon"></i>
          <span class="ccp-list-name">{{ item.className }}</span>
          <span class="ccp-list-pkg">{{ item.packageName }}</span>
        </div>
        <div v-if="flatItems.length === 0" class="ccp-empty">No user metamodels loaded.</div>
      </template>

      <!-- Paket-Baum -->
      <template v-else>
        <Tree
          v-if="treeNodes.length > 0"
          :value="treeNodes"
          v-model:expandedKeys="expandedKeys"
          selectionMode="single"
          @node-select="onNodeSelect"
          class="ccp-tree"
        >
          <template #default="{ node }">
            <span class="ccp-node" :class="{ 'ccp-abstract': node.data?.isAbstract, 'ccp-package': node.type === 'package' }">
              {{ node.label }}
              <span v-if="node.data?.isAbstract" class="ccp-tag">abstract</span>
            </span>
          </template>
        </Tree>
        <div v-else class="ccp-empty">No user metamodels loaded.</div>
      </template>

    </div>
  </Dialog>
</template>

<style scoped>
.ccp-body {
  max-height: 420px;
  overflow-y: auto;
}

/* Flat list */
.ccp-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  cursor: pointer;
  font-size: 0.8125rem;
  transition: background 0.12s;
}

.ccp-list-item:hover { background: var(--surface-hover); }
.ccp-list-item.ccp-abstract { font-style: italic; opacity: 0.8; }

.ccp-list-icon { font-size: 0.75rem; color: var(--text-color-secondary); flex-shrink: 0; }
.ccp-list-name { flex: 1; }
.ccp-list-pkg { font-size: 0.6875rem; color: var(--text-color-secondary); flex-shrink: 0; }

/* Tree */
.ccp-tree { border: none; padding: 0; }
.ccp-tree :deep(.p-tree-node-content) { padding: 4px 8px; }

.ccp-node {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
}

.ccp-abstract { font-style: italic; opacity: 0.75; }
.ccp-package { color: var(--text-color-secondary); font-weight: 600; }

.ccp-tag {
  font-size: 0.5625rem;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--surface-hover);
  color: var(--text-color-secondary);
}

.ccp-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 0.8125rem;
}
</style>
