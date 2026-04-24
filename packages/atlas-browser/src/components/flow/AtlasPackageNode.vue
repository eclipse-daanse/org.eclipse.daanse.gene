<script setup lang="ts">
/**
 * AtlasPackageNode — Vue Flow custom node for EPackage visualization
 *
 * Shows package name and nsURI as a green container.
 */
const props = defineProps<{
  data: {
    name: string
    nsUri: string
    nsPrefix: string
  }
}>()
</script>

<template>
  <div class="package-node">
    <div class="package-header">
      <span class="package-icon">&laquo;package&raquo;</span>
      <span class="package-name">{{ data.name }}</span>
    </div>
    <div class="package-uri">{{ data.nsUri }}</div>
  </div>
</template>

<style scoped>
.package-node {
  background: #f0faf0;
  border: 2px solid #4caf50;
  border-radius: 6px;
  min-width: 200px;
  font-size: 11px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.package-header {
  background: #4caf50;
  color: white;
  padding: 8px 12px;
  border-radius: 3px 3px 0 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.package-icon {
  font-size: 9px;
  font-style: italic;
  opacity: 0.85;
}

.package-name {
  font-weight: 700;
  font-size: 13px;
}

.package-uri {
  padding: 4px 10px;
  color: #666;
  font-size: 10px;
  text-align: center;
  word-break: break-all;
}
</style>
