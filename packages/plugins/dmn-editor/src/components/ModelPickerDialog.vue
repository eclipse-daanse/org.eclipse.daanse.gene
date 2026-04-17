<script setup lang="ts">
/**
 * ModelPickerDialog - Select EClass/EAttribute from workspace metamodels
 *
 * Two modes:
 * - 'class': Select an EClass (for InputData creation)
 * - 'attribute': Select an EAttribute of a given EClass (for InputClause creation)
 *
 * Uses useSharedModelRegistry() to access loaded EPackages.
 */

import { ref, computed, watch } from 'tsm:vue'
import { Dialog, Tree, Button } from 'tsm:primevue'
import { useSharedModelRegistry } from 'ui-model-browser'

const props = defineProps<{
  visible: boolean
  /** 'class' to pick an EClass, 'attribute' to pick an EAttribute */
  mode: 'class' | 'attribute'
  /** When mode='attribute', restrict to attributes of this EClass */
  restrictToClass?: any
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  /** Emitted when a class is selected: { name, eClass, nsURI } */
  'select-class': [data: { name: string; eClass: any; nsURI: string }]
  /** Emitted when an attribute is selected: { name, eAttribute, typeRef, eClass } */
  'select-attribute': [data: { name: string; eAttribute: any; typeRef: string; eClass: any; feelType: string }]
}>()

const modelRegistry = useSharedModelRegistry()
const expandedKeys = ref<Record<string, boolean>>({})
const selectedKey = ref<Record<string, boolean>>({})

const dialogHeader = computed(() =>
  props.mode === 'class' ? 'Select EClass' : 'Select EAttribute'
)

/** Map Ecore data type name to FEEL type */
function ecoreToFeelType(eTypeName: string): string {
  switch (eTypeName) {
    case 'EInt':
    case 'EShort':
    case 'ELong':
    case 'EBigInteger':
      return 'number'
    case 'EFloat':
    case 'EDouble':
    case 'EBigDecimal':
      return 'number'
    case 'EBoolean':
      return 'boolean'
    case 'EDate':
      return 'date'
    case 'EString':
    default:
      return 'string'
  }
}

/** Build tree nodes from the model registry */
const treeNodes = computed(() => {
  const allPkgs = modelRegistry.allPackages?.value || []
  const nodes: any[] = []

  for (const pkgInfo of allPkgs) {
    const pkg = pkgInfo.ePackage
    if (!pkg) continue
    const pkgName = pkg.getName?.() || 'Unknown'
    const nsURI = pkg.getNsURI?.() || ''

    if (props.mode === 'class') {
      // Show packages → classes
      const classNodes = buildClassNodes(pkg, pkgName, nsURI)
      if (classNodes.length > 0) {
        nodes.push({
          key: `pkg-${nsURI}`,
          label: pkgName,
          icon: 'pi pi-folder',
          type: 'package',
          children: classNodes,
          leaf: false,
          selectable: false
        })
        expandedKeys.value[`pkg-${nsURI}`] = true
      }
    } else if (props.mode === 'attribute') {
      // Show attributes of the restricted class, or all classes → attributes
      if (props.restrictToClass) {
        const attrNodes = buildAttributeNodes(props.restrictToClass)
        nodes.push(...attrNodes)
      } else {
        const classNodes = buildClassWithAttributeNodes(pkg, pkgName, nsURI)
        if (classNodes.length > 0) {
          nodes.push({
            key: `pkg-${nsURI}`,
            label: pkgName,
            icon: 'pi pi-folder',
            type: 'package',
            children: classNodes,
            leaf: false,
            selectable: false
          })
          expandedKeys.value[`pkg-${nsURI}`] = true
        }
      }
    }
  }
  return nodes
})

function buildClassNodes(pkg: any, pkgName: string, nsURI: string): any[] {
  const nodes: any[] = []
  const classifiers = pkg.getEClassifiers?.() || []

  for (const cls of Array.from(classifiers) as any[]) {
    if (!('getEAttributes' in cls || 'getEAllAttributes' in cls)) continue
    const name = cls.getName?.() || ''
    if (!name) continue
    const isAbstract = cls.isAbstract?.() || false

    nodes.push({
      key: `class-${nsURI}-${name}`,
      label: name,
      icon: isAbstract ? 'pi pi-circle' : 'pi pi-box',
      type: 'class',
      leaf: true,
      selectable: !isAbstract,
      data: { eClass: cls, name, nsURI, isAbstract }
    })
  }

  // Recurse into subpackages
  const subPkgs = pkg.getESubpackages?.() || []
  for (const sub of Array.from(subPkgs) as any[]) {
    const subName = sub.getName?.() || ''
    const subNodes = buildClassNodes(sub, `${pkgName}.${subName}`, nsURI)
    if (subNodes.length > 0) {
      nodes.push({
        key: `subpkg-${nsURI}-${subName}`,
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

function buildClassWithAttributeNodes(pkg: any, pkgName: string, nsURI: string): any[] {
  const nodes: any[] = []
  const classifiers = pkg.getEClassifiers?.() || []

  for (const cls of Array.from(classifiers) as any[]) {
    if (!('getEAllAttributes' in cls)) continue
    const name = cls.getName?.() || ''
    if (!name) continue
    const isAbstract = cls.isAbstract?.() || false
    if (isAbstract) continue

    const attrNodes = buildAttributeNodes(cls)
    if (attrNodes.length > 0) {
      nodes.push({
        key: `class-${nsURI}-${name}`,
        label: name,
        icon: 'pi pi-box',
        type: 'class',
        children: attrNodes,
        leaf: false,
        selectable: false,
        data: { eClass: cls, name, nsURI }
      })
      expandedKeys.value[`class-${nsURI}-${name}`] = true
    }
  }

  return nodes
}

function buildAttributeNodes(cls: any): any[] {
  const nodes: any[] = []
  const attrs = cls.getEAllAttributes?.() || cls.getEAttributes?.() || []

  for (const attr of Array.from(attrs) as any[]) {
    const name = attr.getName?.() || ''
    if (!name) continue
    const eType = attr.getEType?.()
    const typeName = eType?.getName?.() || 'EString'
    const feelType = ecoreToFeelType(typeName)

    nodes.push({
      key: `attr-${cls.getName()}-${name}`,
      label: `${name} : ${typeName}`,
      icon: 'pi pi-tag',
      type: 'attribute',
      leaf: true,
      selectable: true,
      data: { eAttribute: attr, name, typeName, feelType, eClass: cls }
    })
  }

  return nodes
}

function handleNodeSelect(event: any) {
  const node = event?.node ?? event
  if (!node?.data) return

  if (props.mode === 'class' && node.type === 'class' && !node.data.isAbstract) {
    emit('select-class', {
      name: node.data.name,
      eClass: node.data.eClass,
      nsURI: node.data.nsURI
    })
    emit('update:visible', false)
  } else if (props.mode === 'attribute' && node.type === 'attribute') {
    emit('select-attribute', {
      name: node.data.name,
      eAttribute: node.data.eAttribute,
      typeRef: node.data.typeName,
      eClass: node.data.eClass,
      feelType: node.data.feelType
    })
    emit('update:visible', false)
  }
}

watch(() => props.visible, (v) => {
  if (v) {
    selectedKey.value = {}
  }
})
</script>

<template>
  <Dialog
    :visible="visible"
    :header="dialogHeader"
    :modal="true"
    :style="{ width: '450px' }"
    :contentStyle="{ padding: 0, maxHeight: '400px', overflow: 'auto' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="model-picker-content">
      <Tree
        v-if="treeNodes.length > 0"
        :value="treeNodes"
        v-model:expandedKeys="expandedKeys"
        selectionMode="single"
        @node-select="handleNodeSelect"
        class="model-picker-tree"
      >
        <template #default="{ node }">
          <div class="picker-node" :class="{
            'is-abstract': node.data?.isAbstract,
            'is-attribute': node.type === 'attribute'
          }">
            <span>{{ node.label }}</span>
            <span v-if="node.data?.isAbstract" class="abstract-tag">abstract</span>
            <span v-if="node.type === 'attribute'" class="feel-type-tag">{{ node.data?.feelType }}</span>
          </div>
        </template>
      </Tree>
      <div v-else class="empty-picker">
        <p>No metamodels loaded in the workspace.</p>
        <p>Load an .ecore file first.</p>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.model-picker-content {
  min-height: 200px;
}

.model-picker-tree {
  border: none;
  padding: 0;
}

.model-picker-tree :deep(.p-tree) {
  border: none;
  padding: 0;
}

.picker-node {
  display: flex;
  align-items: center;
  gap: 8px;
}

.is-abstract {
  opacity: 0.6;
  font-style: italic;
}

.abstract-tag {
  font-size: 0.7rem;
  padding: 1px 4px;
  background: var(--surface-border, #e2e8f0);
  border-radius: 3px;
  color: var(--text-color-secondary, #64748b);
}

.feel-type-tag {
  font-size: 0.7rem;
  padding: 1px 4px;
  background: #dbeafe;
  border-radius: 3px;
  color: #1e40af;
  font-style: italic;
}

.is-attribute {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.85rem;
}

.empty-picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--text-color-secondary, #64748b);
  text-align: center;
  gap: 4px;
}

.empty-picker p {
  margin: 0;
  font-size: 0.85rem;
}
</style>
