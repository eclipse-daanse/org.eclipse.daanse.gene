<script setup lang="ts">
/**
 * AtlasDataTypeNode — Vue Flow custom node for EDataType/EEnum visualization
 *
 * Shows data type or enum name with optional literals.
 */
import { Handle, Position } from '@vue-flow/core'

const props = defineProps<{
  data: {
    name: string
    isEnum: boolean
    literals?: string[]
    instanceClassName?: string
  }
}>()
</script>

<template>
  <div class="datatype-node" :class="{ enum: data.isEnum }">
    <Handle type="target" :position="Position.Top" />

    <div class="datatype-header">
      <span class="datatype-label">{{ data.isEnum ? '«enum»' : '«datatype»' }}</span>
      <span class="datatype-name">{{ data.name }}</span>
    </div>

    <div v-if="data.isEnum && data.literals && data.literals.length > 0" class="literals-section">
      <div v-for="lit in data.literals" :key="lit" class="literal">
        {{ lit }}
      </div>
    </div>

    <div v-if="data.instanceClassName" class="instance-class">
      {{ data.instanceClassName }}
    </div>

    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<style scoped>
.datatype-node {
  background: #fafafa;
  border: 2px solid #9e9e9e;
  border-radius: 6px;
  min-width: 120px;
  max-width: 200px;
  font-size: 11px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.datatype-node.enum {
  border-color: #7b1fa2;
}

.datatype-header {
  background: #9e9e9e;
  color: white;
  padding: 6px 10px;
  border-radius: 3px 3px 0 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.datatype-node.enum .datatype-header {
  background: #7b1fa2;
}

.datatype-label {
  font-size: 9px;
  font-style: italic;
  opacity: 0.85;
}

.datatype-name {
  font-weight: 700;
  font-size: 12px;
}

.literals-section {
  padding: 4px 8px;
  border-top: 1px solid #e0e0e0;
}

.literal {
  padding: 1px 0;
  color: #555;
  font-size: 10px;
}

.literal::before {
  content: '• ';
  color: #7b1fa2;
}

.instance-class {
  padding: 3px 8px;
  font-size: 9px;
  color: #888;
  border-top: 1px solid #e0e0e0;
  text-align: center;
}
</style>
