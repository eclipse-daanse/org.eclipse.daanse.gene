<template>
  <section class="step">
    <h2>Domänenmodell laden</h2>
    <p class="lead">
      Wählen Sie das Modell, dessen Klassen der Data Atlas veröffentlichen soll —
      aus einem Model-Atlas-Scope oder als Datei.
    </p>

    <nav class="tabs">
      <button type="button" :class="{ active: tab === 'atlas' }" @click="tab = 'atlas'">
        Model Atlas
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

    <div v-if="kandidaten.length" class="picked">
      <h3>Gewähltes Modell</h3>
      <select :value="gewaehlterNsUri" @change="onPackageChange">
        <option v-for="p in kandidaten" :key="p.getNsURI() ?? ''" :value="p.getNsURI() ?? ''">
          {{ p.getName() }} — {{ p.getNsURI() }}
        </option>
      </select>
      <p v-if="setupValue" class="summary-line">
        <i class="pi pi-list" aria-hidden="true"></i>
        {{ setupValue.datasets.length }} veröffentlichbare Klasse(n) gefunden
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Schritt 1: Domänenmodell wählen und daraus die Vorschläge ableiten.
 *
 * Verweise auf Modellklassen entstehen immer über den nsURI; die geladenen
 * Abhängigkeiten müssen daher nur registriert sein, nicht benannt.
 */
import { computed, ref, shallowRef } from 'vue';
import type { EPackage } from '@emfts/core';
import AtlasSourceTab from './AtlasSourceTab.vue';
import UploadSourceTab from './UploadSourceTab.vue';
import type { ModelSourcePayload } from './modelSource';
import { initSetup, modelPackages, setup, version } from './context';

const tab = ref<'atlas' | 'upload'>('atlas');
const warnings = ref<string[]>([]);
const kandidaten = shallowRef<EPackage[]>([]);

const setupValue = computed(() => {
  void version.value;
  return setup.value;
});
const gewaehlterNsUri = computed(() => setupValue.value?.modelPackage?.getNsURI() ?? '');

/**
 * Die Metamodelle der Atlas-REST-API — Antwort-Parsing, keine Domänenmodelle.
 *
 * Geprüft wird der Präfix, nicht ein Vorkommen von „/atlas/" irgendwo im
 * nsURI: die Vorlage im eorm-Assistenten filtert so, und damit fielen genau
 * die Modelle heraus, um die es hier geht — `https://eclipse.org/fennec/data/
 * atlas/example/person/1.0.0` enthält „/atlas/".
 */
const ATLAS_API_PREFIX = 'http://eclipse.org/fennec/model/atlas/';

function onPackagesLoaded(payload: ModelSourcePayload): void {
  const auswahl = payload.candidates.filter(
    (p) => !(p.getNsURI() ?? '').startsWith(ATLAS_API_PREFIX),
  );
  kandidaten.value = auswahl;
  modelPackages.value = auswahl;
  warnings.value = payload.warnings;
  if (auswahl.length) initSetup(auswahl[0]);
}

function onPackageChange(event: Event): void {
  const nsUri = (event.target as HTMLSelectElement).value;
  const pkg = kandidaten.value.find((p) => p.getNsURI() === nsUri);
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
