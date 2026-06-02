<script setup lang="ts">
/**
 * ClassPickerDialog - Einheitlicher Class-Picker für alle Perspektiven.
 *
 * Zeigt User-Packages mit ihren Klassen als Tree an.
 * Emittiert bei Auswahl: { eClass, qualifiedName, className }
 */

import { ref, computed, watch } from 'tsm:vue'
import { Dialog, Tree, InputText } from 'tsm:primevue'
import { useSharedModelRegistry } from '../composables/useModelRegistry'

interface ClassSelection {
  eClass: any
  qualifiedName: string  // 'nsURI#//ClassName'
  className: string
  packageNsURI: string
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

// Build tree nodes from userPackages
function buildNodes(pkg: any, parentPrefix: string): any[] {
  const nodes: any[] = []
  const pkgName = pkg.getName?.() || ''
  const nsURI = pkg.getNsURI?.() || ''
  const prefix = parentPrefix ? `${parentPrefix}.${pkgName}` : pkgName
  const q = searchQuery.value.toLowerCase()

  const classifiers = pkg.getEClassifiers?.() ?? []
  for (const cls of Array.from(classifiers) as any[]) {
    if (!('getEAllAttributes' in cls || 'getEAttributes' in cls)) continue
    const name = cls.getName?.() || ''
    if (!name) continue
    const isAbstract = cls.isAbstract?.() || false
    if (!props.includeAbstract && isAbstract) continue
    if (q && !name.toLowerCase().includes(q)) continue
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

  const subPkgs = pkg.getESubpackages?.() ?? []
  for (const sub of Array.from(subPkgs) as any[]) {
    const children = buildNodes(sub, prefix)
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
  return pkgs.flatMap((pkgInfo: any) => buildNodes(pkgInfo.ePackage, ''))
})

// Auto-expand all package nodes when dialog opens or search changes
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

function onNodeSelect(node: any) {
  if (node.type !== 'class') return
  emit('select', node.data as ClassSelection)
  emit('update:visible', false)
}

function close() {
  emit('update:visible', false)
}
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
    <div class="ccp-search">
      <InputText
        v-model="searchQuery"
        placeholder="Filter classes..."
        size="small"
        class="ccp-search-input"
        autofocus
      />
    </div>

    <div class="ccp-tree-wrap">
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
  </Dialog>
</template>

<style scoped>
.ccp-search {
  padding: 8px 12px;
  border-bottom: 1px solid var(--surface-border);
}

.ccp-search-input {
  width: 100%;
}

.ccp-tree-wrap {
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

.ccp-abstract {
  font-style: italic;
  opacity: 0.75;
}

.ccp-package {
  color: var(--text-color-secondary);
  font-weight: 600;
}

.ccp-tag {
  font-size: 0.5625rem;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--surface-hover);
  color: var(--text-color-secondary);
  font-style: normal;
}

.ccp-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 0.8125rem;
}
</style>
