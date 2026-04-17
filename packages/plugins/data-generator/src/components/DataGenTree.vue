<script setup lang="ts">
/**
 * DataGenTree - Left-panel tree showing class configs with attributes and references.
 */

import { computed } from 'tsm:vue'
import { Tree, Button } from 'tsm:primevue'
import type { DataGenConfig, ClassGenConfig } from '../types'

const props = defineProps<{
  config: DataGenConfig | null
  selectedClassIndex: number
}>()

const emit = defineEmits<{
  'select-class': [index: number]
  'add-class': []
  'remove-class': [index: number]
  'auto-configure': [index: number]
}>()

// Build tree nodes from config
const treeNodes = computed(() => {
  if (!props.config) return []

  return props.config.classConfigs.map((cc, idx) => {
    const className = cc.contextClass.split('.').pop() || cc.contextClass
    const children: any[] = []

    // Attribute children
    for (const ag of cc.attributeGens) {
      const genLabel = ag.staticValue
        ? `"${ag.staticValue}"`
        : ag.generatorKey.replace('faker.', '')
      children.push({
        key: `class-${idx}-attr-${ag.featureName}`,
        label: `${ag.featureName} → ${genLabel}`,
        icon: 'pi pi-tag',
        type: 'attribute',
        leaf: true,
        data: { classIndex: idx, featureName: ag.featureName }
      })
    }

    // Reference children
    for (const rg of cc.referenceGens) {
      children.push({
        key: `class-${idx}-ref-${rg.featureName}`,
        label: `${rg.featureName} → ${rg.strategy} [${rg.minCount}..${rg.maxCount}]`,
        icon: 'pi pi-link',
        type: 'reference',
        leaf: true,
        data: { classIndex: idx, featureName: rg.featureName }
      })
    }

    return {
      key: `class-${idx}`,
      label: `${className} (${cc.instanceCount})`,
      icon: cc.enabled ? 'pi pi-box' : 'pi pi-ban',
      type: 'class',
      data: { classIndex: idx, classConfig: cc },
      children,
      leaf: children.length === 0,
      styleClass: !cc.enabled ? 'disabled-class' : ''
    }
  })
})

const selectedKeys = computed(() => {
  if (props.selectedClassIndex < 0) return {}
  return { [`class-${props.selectedClassIndex}`]: true }
})

function handleSelect(node: any) {
  const treeNode = (node as any).node ?? node
  if (treeNode.type === 'class') {
    emit('select-class', treeNode.data.classIndex)
  } else if (treeNode.type === 'attribute' || treeNode.type === 'reference') {
    emit('select-class', treeNode.data.classIndex)
  }
}
</script>

<template>
  <div class="datagen-tree">
    <div class="tree-header">
      <span class="header-title">Classes</span>
      <div class="header-actions">
        <Button
          icon="pi pi-plus"
          text
          rounded
          size="small"
          @click="emit('add-class')"
          title="Add Class Config"
          :disabled="!config"
        />
      </div>
    </div>

    <div v-if="!config" class="empty-state">
      <i class="pi pi-inbox"></i>
      <span>No config loaded</span>
    </div>

    <div v-else-if="treeNodes.length === 0" class="empty-state">
      <i class="pi pi-plus-circle"></i>
      <span>No classes configured</span>
      <span class="hint">Click + to add a class</span>
    </div>

    <div v-else class="tree-container">
      <Tree
        :value="treeNodes"
        :selectionKeys="selectedKeys"
        selectionMode="single"
        @node-select="handleSelect"
        class="gen-tree"
      >
        <template #default="{ node }">
          <div
            class="tree-node"
            :class="{
              'is-class': node.type === 'class',
              'is-disabled': node.styleClass === 'disabled-class',
              'is-attribute': node.type === 'attribute',
              'is-reference': node.type === 'reference'
            }"
          >
            <span class="node-label">{{ node.label }}</span>
            <div v-if="node.type === 'class'" class="node-actions">
              <Button
                icon="pi pi-cog"
                text
                rounded
                size="small"
                @click.stop="emit('auto-configure', node.data.classIndex)"
                title="Auto-configure"
                class="node-btn"
              />
              <Button
                icon="pi pi-trash"
                text
                rounded
                size="small"
                severity="danger"
                @click.stop="emit('remove-class', node.data.classIndex)"
                title="Remove"
                class="node-btn"
              />
            </div>
          </div>
        </template>
      </Tree>
    </div>
  </div>
</template>

<style scoped>
.datagen-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-right: 1px solid var(--surface-border);
}

.tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-ground);
}

.header-title {
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--text-color-secondary);
}

.header-actions :deep(.p-button) {
  width: 24px;
  height: 24px;
  padding: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  gap: 6px;
  color: var(--text-color-secondary);
  font-size: 0.8125rem;
}

.empty-state i { font-size: 1.5rem; opacity: 0.4; }
.empty-state .hint { font-size: 0.75rem; opacity: 0.6; }

.tree-container {
  flex: 1;
  overflow: auto;
}

.gen-tree { padding: 4px; background: transparent; }
.gen-tree :deep(.p-tree) { background: transparent; border: none; padding: 0; }

.tree-node {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8125rem;
  width: 100%;
}

.tree-node.is-class { font-weight: 600; }
.tree-node.is-disabled { opacity: 0.5; }
.tree-node.is-attribute { color: var(--text-color-secondary); }
.tree-node.is-reference { color: var(--primary-color); }

.node-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.node-actions {
  display: flex;
  gap: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.tree-node:hover .node-actions { opacity: 1; }

.node-btn { width: 20px !important; height: 20px !important; padding: 0 !important; }
.node-btn :deep(.p-button-icon) { font-size: 0.6875rem; }
</style>
