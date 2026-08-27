<template>
  <section class="step">
    <h2>EMF-Modell laden</h2>
    <p class="lead">
      Wählen Sie das Modell, dessen Klassen in der Datenbank gespeichert werden sollen.
    </p>

    <nav class="tabs">
      <button type="button" :class="{ active: tab === 'atlas' }" @click="tab = 'atlas'">
        Modelatlas
      </button>
      <button type="button" :class="{ active: tab === 'upload' }" @click="tab = 'upload'">
        Datei / Workspace
      </button>
    </nav>

    <AtlasSourceTab v-show="tab === 'atlas'" @packages-loaded="onPackagesLoaded" />
    <UploadSourceTab v-show="tab === 'upload'" @packages-loaded="onPackagesLoaded" />

    <div v-if="warnings.length" class="warnbox">
      <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
      <ul>
        <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
      </ul>
    </div>

    <div v-if="loadedPackages.length" class="picked">
      <h3>Gewähltes Modell</h3>
      <select :value="selectedNsUri" @change="onPackageChange">
        <option v-for="p in loadedPackages" :key="p.getNsURI() ?? ''" :value="p.getNsURI() ?? ''">
          {{ p.getName() }} — {{ p.getNsURI() }}
        </option>
      </select>
      <p v-if="setupValue" class="summary-line">
        <i class="pi pi-table" aria-hidden="true"></i>
        {{ setupValue.entities.length }} speicherbare Klasse(n) gefunden
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Schritt 1: EMF-Modell wählen (Modelatlas, Workspace oder Datei) und daraus
 * die Entity-Vorschläge ableiten.
 */
import { computed, ref, shallowRef } from 'vue';
import type { EPackage } from '@emfts/core';
import AtlasSourceTab from './AtlasSourceTab.vue';
import UploadSourceTab from './UploadSourceTab.vue';
import { initSetup, modelPackages, setup } from './context';

const tab = ref<'atlas' | 'upload'>('atlas');
const warnings = ref<string[]>([]);
const loadedPackages = shallowRef<EPackage[]>([]);
const setupValue = computed(() => setup.value);
const selectedNsUri = computed(() => setupValue.value?.modelPackage?.getNsURI() ?? '');

function onPackagesLoaded(packages: EPackage[], newWarnings: string[]): void {
  // Die Atlas-API-Metamodelle nicht als Kandidaten anbieten
  const candidates = packages.filter((p) => !(p.getNsURI() ?? '').includes('/atlas/'));
  loadedPackages.value = candidates;
  modelPackages.value = candidates;
  warnings.value = newWarnings;
  if (candidates.length) initSetup(candidates[0]);
}

function onPackageChange(event: Event): void {
  const nsUri = (event.target as HTMLSelectElement).value;
  const pkg = loadedPackages.value.find((p) => p.getNsURI() === nsUri);
  if (pkg) initSetup(pkg);
}
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 0.85rem; }
.step h2 { margin: 0; font-size: 1.25rem; }
.step h3 { margin: 0.25rem 0 0; font-size: 1.05rem; }
.lead { margin: 0; color: var(--text-color-secondary, #666); max-width: 44rem; }
.tabs { display: flex; border-bottom: 1px solid var(--surface-border, #ddd); max-width: 44rem; }
.tabs button {
  display: inline-flex; align-items: center; gap: 0.45rem;
  font: inherit; font-weight: 500; padding: 0.55rem 1.25rem; cursor: pointer;
  border: none; background: none; border-bottom: 2px solid transparent; margin-bottom: -1px;
  color: var(--text-color-secondary, #666);
}
.tabs button.active {
  border-bottom-color: var(--primary-color, #1a56a0);
  color: var(--primary-color, #1a56a0); font-weight: 600;
}
.warnbox {
  display: flex; gap: 0.65rem; align-items: flex-start; max-width: 44rem;
  padding: 0.75rem 1rem; border-radius: 8px;
  background: color-mix(in srgb, #f5a623 12%, transparent);
  border: 1px solid color-mix(in srgb, #f5a623 45%, transparent);
}
.warnbox .pi { color: #b8860b; margin-top: 0.15rem; }
.warnbox ul { margin: 0; padding-left: 1rem; }
.picked { display: flex; flex-direction: column; gap: 0.5rem; }
select {
  max-width: 40rem; padding: 0.45rem 0.6rem; font: inherit; border-radius: 6px; cursor: pointer;
  background: var(--input-bg, #fff); color: var(--input-text, var(--text-color, inherit));
  border: 1px solid var(--input-border, var(--surface-border, #c0c4cc));
}
.summary-line {
  display: inline-flex; align-items: center; gap: 0.5rem; margin: 0;
  color: var(--text-color-secondary, #666);
}
.summary-line .pi { color: var(--primary-color, #1a56a0); }
</style>
