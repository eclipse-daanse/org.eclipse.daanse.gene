<template>
  <BaseDialog
    :open="open"
    title="Sensormodell wählen"
    subtitle="Aus dem Modelatlas oder als Datei — referenzierte Basis-Modelle werden automatisch mitgeladen."
    icon="pi pi-box"
    @update:open="$emit('update:open', $event)"
  >
    <nav class="tabs">
      <button type="button" :class="{ active: tab === 'atlas' }" @click="tab = 'atlas'">
        <i class="pi pi-cloud" aria-hidden="true"></i> Modelatlas
      </button>
      <button type="button" :class="{ active: tab === 'file' }" @click="tab = 'file'">
        <i class="pi pi-folder-open" aria-hidden="true"></i> Datei / Workspace
      </button>
    </nav>

    <template v-if="tab === 'atlas'">
      <AtlasConnectionSelect />
      <SchemaBrowser v-if="source" :source="source" @packages-loaded="onPackages" />
      <p v-else class="hint">
        <i class="pi pi-info-circle" aria-hidden="true"></i>
        Keine Modelatlas-Verbindung — wählen Sie eine Verbindung aus oder nutzen Sie „Datei / Workspace“.
      </p>
    </template>
    <UploadSourceTab v-else @packages-loaded="onPackages" @mapping-opened="onMappingOpened" />
  </BaseDialog>
</template>

<script setup lang="ts">
/**
 * Auswahl des Sensormodells im Dialog (T23/#195) — hält Schritt 1 frei von
 * Listen. Die Datei-Quelle nimmt auch ein Mapping-XMI entgegen; dann wird das
 * Dokument geöffnet statt ein neues Mapping begonnen.
 */
import { ref } from 'vue';
import type { EPackage } from '@emfts/core';
import BaseDialog from './BaseDialog.vue';
import AtlasConnectionSelect from '../AtlasConnectionSelect.vue';
import SchemaBrowser from '../SchemaBrowser.vue';
import UploadSourceTab from '../UploadSourceTab.vue';
import { atlasSource as source } from '../context';

defineProps<{ open: boolean }>();
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'packages-loaded', packages: EPackage[], warnings: string[]): void;
  (e: 'mapping-opened', warnings: string[]): void;
}>();

const tab = ref<'atlas' | 'file'>('atlas');

function onPackages(packages: EPackage[], warnings: string[]): void {
  emit('packages-loaded', packages, warnings);
  emit('update:open', false);
}

function onMappingOpened(warnings: string[]): void {
  emit('mapping-opened', warnings);
  emit('update:open', false);
}
</script>

<style scoped>
.tabs { display: flex; gap: 0; border-bottom: 1px solid var(--surface-border, #ddd); }
.tabs button {
  display: inline-flex; align-items: center; gap: 0.45rem;
  font: inherit; font-weight: 500; padding: 0.5rem 1rem; cursor: pointer;
  border: none; background: none; border-bottom: 2px solid transparent; margin-bottom: -1px;
  color: var(--text-color-secondary, #666);
}
.tabs button:hover { color: var(--text-color, #1a1a1a); }
.tabs button.active {
  border-bottom-color: var(--primary-color, #1a56a0);
  color: var(--primary-color, #1a56a0); font-weight: 600;
}
.hint {
  display: flex; gap: 0.5rem; align-items: flex-start; margin: 0;
  color: var(--text-color-secondary, #666); font-size: 0.9rem;
}
.hint .pi { color: var(--primary-color, #1a56a0); margin-top: 0.1rem; }
</style>
