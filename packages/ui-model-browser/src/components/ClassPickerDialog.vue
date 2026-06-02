<script setup lang="ts">
import { ref, computed, watch } from 'tsm:vue'
import { Dialog, Tree, InputText } from 'tsm:primevue'
import { useSharedModelRegistry } from '../composables/useModelRegistry'

interface ClassSelection {
  eClass: any
  qualifiedName: string
  className: string
  packageNsURI: string
}

interface FlatItem {
  eClass: any
  qualifiedName: string
  className: string
  packageNsURI: string
  packageName: string
  isAbstract: boolean
}

const props = withDefaults(defineProps<{
  visible: boolean
  header?: string
  includeAbstract?: boolean
}>(), {
  header: 'Select Class',
  includeAbstract: true
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'select': [selection: ClassSelection]
}>()

const modelRegistry = useSharedModelRegistry()
const searchQuery = ref('')
const expandedKeys = ref<Record<string, boolean>>({})
const viewMode = ref<'tree' | 'list'>('tree')

// ── Flat list (all classes from all userPackages) ──────────────────────────

function collectClasses(pkg: any, pkgLabel: string): FlatItem[] {
  const nsURI = pkg.getNsURI?.() || ''
  const pkgName = pkg.getName?.() || ''
  const result: FlatItem[] = []

  for (const cls of Array.from(pkg.getEClassifiers?.() ?? []) as any[]) {
    if (!('getEAllAttributes' in cls || 'getEAttributes' in cls)) continue
    const name = cls.getName?.() || ''
    if (!name) continue
    const isAbstract = cls.isAbstract?.() || false
    if (!props.includeAbstract && isAbstract) continue
    result.push({
      eClass: cls,
      qualifiedName: nsURI ? `${nsURI}#//${name}` : `${pkgLabel}.${name}`,
      className: name,
      packageNsURI: nsURI,
      packageName: pkgLabel || pkgName,
      isAbstract
    })
  }
  for (const sub of Array.from(pkg.getESubpackages?.() ?? []) as any[]) {
    const subLabel = `${pkgLabel}.${sub.getName?.() || ''}`
    result.push(...collectClasses(sub, subLabel))
  }
  return result
}

const allClasses = computed<FlatItem[]>(() => {
  const pkgs = modelRegistry.userPackages?.value ?? []
  return pkgs.flatMap((p: any) => collectClasses(p.ePackage, p.ePackage.getName?.() || ''))
})

const filteredFlat = computed<FlatItem[]>(() => {
  const q = searchQuery.value.toLowerCase()
  if (!q) return allClasses.value
  return allClasses.value.filter(c =>
    c.className.toLowerCase().includes(q) ||
    c.packageName.toLowerCase().includes(q)
  )
})

// ── Tree nodes ─────────────────────────────────────────────────────────────

function buildTreeNodes(pkg: any, parentPrefix: string): any[] {
  const nodes: any[] = []
  const pkgName = pkg.getName?.() || ''
  const nsURI = pkg.getNsURI?.() || ''
  const prefix = parentPrefix ? `${parentPrefix}.${pkgName}` : pkgName
  const q = searchQuery.value.toLowerCase()

  for (const cls of Array.from(pkg.getEClassifiers?.() ?? []) as any[]) {
    if (!('getEAllAttributes' in cls || 'getEAttributes' in cls)) continue
    const name = cls.getName?.() || ''
    if (!name) continue
    const isAbstract = cls.isAbstract?.() || false
    if (!props.includeAbstract && isAbstract) continue
    if (q && !name.toLowerCase().includes(q) && !pkgName.toLowerCase().includes(q)) continue
    const qualifiedName = nsURI ? `${nsURI}#//${name}` : `${prefix}.${name}`
    nodes.push({
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
    const children = buildTreeNodes(sub, prefix)
    if (children.length === 0) continue
    const subName = sub.getName?.() || ''
    nodes.push({
      key: `pkg:${prefix}.${subName}`,
      label: subName,
      icon: 'pi pi-folder',
      type: 'package',
      leaf: false,
      selectable: false,
      children
    })
  }
  return nodes
}

const treeNodes = computed(() => {
  const pkgs = modelRegistry.userPackages?.value ?? []
  return pkgs.flatMap((p: any) => buildTreeNodes(p.ePackage, ''))
})

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

watch(() => props.visible, (v) => {
  if (v) { searchQuery.value = ''; expandAll() }
})

watch(searchQuery, () => {
  if (searchQuery.value) expandAll()
})

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
    :style="{ width: '460px' }"
    :contentStyle="{ padding: 0 }"
  >
    <!-- Search + view toggle -->
    <div class="ccp-toolbar">
      <InputText
        v-model="searchQuery"
        placeholder="Filter classes..."
        size="small"
        class="ccp-search-input"
        autofocus
      />
      <button
        class="ccp-view-btn"
        :class="{ active: viewMode === 'tree' }"
        @click="viewMode = 'tree'"
        title="Tree view"
      ><i class="pi pi-sitemap"></i></button>
      <button
        class="ccp-view-btn"
        :class="{ active: viewMode === 'list' }"
        @click="viewMode = 'list'"
        title="List view"
      ><i class="pi pi-list"></i></button>
    </div>

    <!-- Tree view -->
    <div v-if="viewMode === 'tree'" class="ccp-body">
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
      <div v-else class="ccp-empty">
        <span v-if="searchQuery">No classes match "{{ searchQuery }}"</span>
        <span v-else>No user metamodels loaded.</span>
      </div>
    </div>

    <!-- Flat list view -->
    <div v-else class="ccp-body">
      <div
        v-for="item in filteredFlat"
        :key="item.qualifiedName"
        class="ccp-list-item"
        :class="{ 'ccp-abstract': item.isAbstract }"
        @click="selectFlat(item)"
      >
        <i :class="item.isAbstract ? 'pi pi-circle' : 'pi pi-box'" class="ccp-list-icon"></i>
        <span class="ccp-list-name">{{ item.className }}</span>
        <span class="ccp-list-pkg">{{ item.packageName }}</span>
      </div>
      <div v-if="filteredFlat.length === 0" class="ccp-empty">
        <span v-if="searchQuery">No classes match "{{ searchQuery }}"</span>
        <span v-else>No user metamodels loaded.</span>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.ccp-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--surface-border);
}

.ccp-search-input {
  flex: 1;
}

.ccp-view-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  background: none;
  cursor: pointer;
  color: var(--text-color-secondary);
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}

.ccp-view-btn:hover { background: var(--surface-hover); }
.ccp-view-btn.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.ccp-body {
  max-height: 380px;
  overflow-y: auto;
}

.ccp-tree {
  border: none;
  padding: 0;
}

.ccp-tree :deep(.p-tree-node-content) {
  padding: 4px 8px;
}

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
  font-style: normal;
}

/* Flat list */
.ccp-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 0.8125rem;
  border-bottom: 1px solid var(--surface-border);
  transition: background 0.12s;
}

.ccp-list-item:last-child { border-bottom: none; }
.ccp-list-item:hover { background: var(--surface-hover); }
.ccp-list-item.ccp-abstract { font-style: italic; opacity: 0.8; }

.ccp-list-icon {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.ccp-list-name { flex: 1; font-weight: 500; }

.ccp-list-pkg {
  font-size: 0.6875rem;
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.ccp-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 0.8125rem;
}
</style>
