<template>
  <BaseDialog
    :open="open"
    title="Bestehendes Mapping öffnen"
    subtitle="Zum Bearbeiten und Zurückschreiben — aus einer Registry des Modelatlas oder als Datei."
    icon="pi pi-file-edit"
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
      <AtlasConnectionSelect :show-stage="false" />
      <MappingBrowser v-if="source" :source="source" @opened="onOpened" />
      <p v-else class="hint">
        <i class="pi pi-info-circle" aria-hidden="true"></i>
        Keine Modelatlas-Verbindung — wählen Sie eine Verbindung aus oder öffnen Sie eine Datei.
      </p>
    </template>
    <UploadSourceTab v-else @mapping-opened="onOpened" @packages-loaded="onPackagesOnly" />
  </BaseDialog>
</template>

<script setup lang="ts">
/**
 * Bestehendes Mapping öffnen (T19/#190) — seit T23/#195 im Dialog.
 */
import { ref } from 'vue';
import type { EPackage } from '@emfts/core';
import BaseDialog from './BaseDialog.vue';
import AtlasConnectionSelect from '../AtlasConnectionSelect.vue';
import MappingBrowser from '../MappingBrowser.vue';
import UploadSourceTab from '../UploadSourceTab.vue';
import { atlasSource as source } from '../context';

defineProps<{ open: boolean }>();
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'opened', warnings: string[]): void;
  (e: 'packages-loaded', packages: EPackage[], warnings: string[]): void;
}>();

const tab = ref<'atlas' | 'file'>('atlas');

function onOpened(warnings: string[]): void {
  emit('opened', warnings);
  emit('update:open', false);
}

/** Wurden nur Modelle abgelegt, ist das kein Öffnen — trotzdem übernehmen. */
function onPackagesOnly(packages: EPackage[], warnings: string[]): void {
  emit('packages-loaded', packages, warnings);
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
