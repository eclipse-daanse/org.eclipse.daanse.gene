<script setup lang="ts">
/**
 * DataGenPreview - File preview component for .dgen/.datagen files.
 * Registered as FileViewerContribution in the file viewer registry.
 */

import { ref, watch, computed, inject } from 'tsm:vue'
import { Button, Card } from 'tsm:primevue'
import type { DataGenConfig } from '../types'

const props = defineProps<{
  content: string
  fileName: string
}>()

const tsm = inject<{ getService<T>(id: string): T | undefined }>('tsm')

const config = ref<DataGenConfig | null>(null)
const parseError = ref<string | null>(null)

watch(() => props.content, (xml) => {
  if (!xml) {
    config.value = null
    parseError.value = null
    return
  }
  try {
    config.value = parseDatagenXml(xml)
    parseError.value = null
  } catch (e: any) {
    config.value = null
    parseError.value = e.message
  }
}, { immediate: true })

const totalInstances = computed(() => {
  if (!config.value) return 0
  return config.value.classConfigs
    .filter(c => c.enabled)
    .reduce((sum, c) => sum + c.instanceCount, 0)
})

function handleLoadInEditor() {
  const svc = tsm?.getService<{ load(content: string, filePath: string): void }>('gene.datagen.loader')
  svc?.load(props.content, props.fileName)
}

function parseDatagenXml(xml: string): DataGenConfig {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  const root = doc.documentElement

  const errorNode = doc.querySelector('parsererror')
  if (errorNode) throw new Error('Invalid XML')

  const cfg: DataGenConfig = {
    name: root.getAttribute('name') || '',
    version: root.getAttribute('version') || '1.0',
    description: root.getAttribute('description') || '',
    seed: parseInt(root.getAttribute('seed') || '0', 10) || 0,
    locale: root.getAttribute('locale') || 'de',
    targetModelNsURIs: [],
    classConfigs: [],
    customGenerators: []
  }

  for (const el of Array.from(root.querySelectorAll('targetModelNsURIs'))) {
    const uri = el.textContent?.trim()
    if (uri) cfg.targetModelNsURIs.push(uri)
  }

  for (const ccEl of Array.from(root.querySelectorAll('classConfigs'))) {
    cfg.classConfigs.push({
      contextClass: ccEl.getAttribute('contextClass') || '',
      instanceCount: parseInt(ccEl.getAttribute('instanceCount') || '10', 10),
      enabled: ccEl.getAttribute('enabled') !== 'false',
      attributeGens: Array.from(ccEl.querySelectorAll('attributeGens')).map(ag => ({
        featureName: ag.getAttribute('featureName') || '',
        generatorKey: ag.getAttribute('generatorKey') || '',
        generatorArgs: ag.getAttribute('generatorArgs') || '',
        unique: ag.getAttribute('unique') === 'true',
        staticValue: ag.getAttribute('staticValue') || '',
        template: ag.getAttribute('template') || ''
      })),
      referenceGens: Array.from(ccEl.querySelectorAll('referenceGens')).map(rg => ({
        featureName: rg.getAttribute('featureName') || '',
        strategy: (rg.getAttribute('strategy') as any) || 'RANDOM',
        targetClassFilter: rg.getAttribute('targetClassFilter') || '',
        minCount: parseInt(rg.getAttribute('minCount') || '0', 10),
        maxCount: parseInt(rg.getAttribute('maxCount') || '1', 10)
      }))
    })
  }

  for (const cgEl of Array.from(root.querySelectorAll('customGenerators'))) {
    cfg.customGenerators.push({
      key: cgEl.getAttribute('key') || '',
      label: cgEl.getAttribute('label') || '',
      expression: cgEl.getAttribute('expression') || '',
      category: cgEl.getAttribute('category') || 'Custom'
    })
  }

  return cfg
}
</script>

<template>
  <div class="datagen-preview">
    <div v-if="parseError" class="error-state">
      <i class="pi pi-exclamation-triangle"></i>
      <span>{{ parseError }}</span>
    </div>

    <Card v-else-if="config">
      <template #title>
        <div class="preview-header">
          <i class="pi pi-bolt"></i>
          <span>{{ config.name || fileName }}</span>
        </div>
      </template>
      <template #subtitle>{{ fileName }}</template>
      <template #content>
        <div class="preview-details">
          <div v-if="config.description" class="detail-row">
            <span class="detail-label">Description:</span>
            <span class="detail-value">{{ config.description }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Version:</span>
            <span class="detail-value">{{ config.version }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Locale:</span>
            <span class="detail-value">{{ config.locale }}</span>
          </div>
          <div v-if="config.seed" class="detail-row">
            <span class="detail-label">Seed:</span>
            <span class="detail-value">{{ config.seed }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Classes:</span>
            <span class="detail-value">{{ config.classConfigs.length }} ({{ config.classConfigs.filter(c => c.enabled).length }} enabled)</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Total Instances:</span>
            <span class="detail-value">~{{ totalInstances }}</span>
          </div>
          <div v-if="config.targetModelNsURIs.length > 0" class="detail-row">
            <span class="detail-label">Target Models:</span>
            <span class="detail-value uri">{{ config.targetModelNsURIs.join(', ') }}</span>
          </div>
          <div v-if="config.customGenerators.length > 0" class="detail-row">
            <span class="detail-label">Custom Generators:</span>
            <span class="detail-value">{{ config.customGenerators.length }}</span>
          </div>

          <div v-if="config.classConfigs.length > 0" class="class-list">
            <span class="detail-label">Class Configs:</span>
            <div v-for="cc in config.classConfigs" :key="cc.contextClass" class="class-item" :class="{ disabled: !cc.enabled }">
              <i class="pi pi-box"></i>
              <span class="class-name">{{ cc.contextClass }}</span>
              <span class="class-count">x{{ cc.instanceCount }}</span>
              <span v-if="!cc.enabled" class="class-disabled">(disabled)</span>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <Button
          label="Open in Data Generator"
          icon="pi pi-bolt"
          @click="handleLoadInEditor"
        />
      </template>
    </Card>
  </div>
</template>

<style scoped>
.datagen-preview {
  padding: 0.5rem;
}

.error-state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--p-red-500, #ef4444);
  padding: 1rem;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.preview-header i {
  color: var(--p-primary-color);
}

.preview-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.detail-row {
  display: flex;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.detail-label {
  color: var(--text-color-secondary);
  min-width: 120px;
  flex-shrink: 0;
}

.detail-value {
  color: var(--text-color);
  word-break: break-word;
}

.detail-value.uri {
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.8;
}

.class-list {
  margin-top: 0.5rem;
}

.class-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.8125rem;
}

.class-item.disabled {
  opacity: 0.5;
}

.class-item i {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.class-name {
  font-family: monospace;
}

.class-count {
  color: var(--text-color-secondary);
  font-size: 0.75rem;
}

.class-disabled {
  color: var(--text-color-secondary);
  font-size: 0.7rem;
  font-style: italic;
}
</style>
