<script setup lang="ts">
/**
 * AtlasClassNode — Vue Flow custom node for EClass visualization
 *
 * Shows class name, attributes (name:type), and reference handles.
 */
import { computed } from 'tsm:vue'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps<{
  data: {
    name: string
    isAbstract: boolean
    attributes: Array<{ name: string; type: string }>
    references: Array<{ name: string; type: string; lower: number; upper: number; containment: boolean }>
    superTypes: string[]
  }
}>()

const cardinalityLabel = (lower: number, upper: number): string => {
  if (lower === 0 && upper === -1) return '[*]'
  if (lower === 0 && upper === 1) return '[0..1]'
  if (lower === 1 && upper === 1) return '[1]'
  if (lower === 1 && upper === -1) return '[1..*]'
  return `[${lower}..${upper === -1 ? '*' : upper}]`
}
</script>

<template>
  <div class="class-node" :class="{ abstract: data.isAbstract }">
    <!-- Handles for incoming edges -->
    <Handle type="target" :position="Position.Top" />

    <!-- Header -->
    <div class="class-header">
      <span v-if="data.isAbstract" class="abstract-label">&laquo;abstract&raquo;</span>
      <span class="class-name">{{ data.name }}</span>
    </div>

    <!-- Attributes -->
    <div v-if="data.attributes.length > 0" class="class-section">
      <div
        v-for="attr in data.attributes"
        :key="attr.name"
        class="class-field"
      >
        <span class="field-name">{{ attr.name }}</span>
        <span class="field-type">: {{ attr.type }}</span>
      </div>
    </div>

    <!-- References (shown as text, edges are drawn separately) -->
    <div v-if="data.references.length > 0" class="class-section refs">
      <div
        v-for="ref in data.references"
        :key="ref.name"
        class="class-field ref-field"
      >
        <span class="ref-icon">{{ ref.containment ? '◆' : '◇' }}</span>
        <span class="field-name">{{ ref.name }}</span>
        <span class="field-type">: {{ ref.type }} {{ cardinalityLabel(ref.lower, ref.upper) }}</span>
      </div>
    </div>

    <!-- Handle for outgoing edges -->
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<style scoped>
.class-node {
  background: #ffffff;
  border: 2px solid #4f7cac;
  border-radius: 6px;
  min-width: 180px;
  max-width: 300px;
  font-size: 11px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.class-node.abstract {
  border-style: dashed;
}

.class-header {
  background: #4f7cac;
  color: white;
  padding: 6px 10px;
  text-align: center;
  border-radius: 3px 3px 0 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.abstract-label {
  font-size: 9px;
  font-style: italic;
  opacity: 0.85;
}

.class-name {
  font-weight: 700;
  font-size: 12px;
}

.class-section {
  padding: 4px 8px;
  border-top: 1px solid #e0e0e0;
}

.class-section.refs {
  background: #fafafa;
  border-radius: 0 0 3px 3px;
}

.class-field {
  display: flex;
  align-items: baseline;
  gap: 2px;
  padding: 1px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ref-field {
  gap: 3px;
}

.ref-icon {
  font-size: 9px;
  color: #e88b23;
}

.field-name {
  font-weight: 500;
  color: #333;
}

.field-type {
  color: #777;
  font-size: 10px;
}
</style>
