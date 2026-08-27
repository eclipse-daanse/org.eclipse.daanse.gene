<template>
  <section class="step">
    <h2>Sensormodell</h2>
    <p class="lead">
      Welches Modell beschreibt die Daten Ihres Sensors — und welche Nachricht sendet er?
    </p>

    <div v-if="editing" class="editbox">
      <i class="pi pi-pencil" aria-hidden="true"></i>
      <div>
        <p>
          Sie bearbeiten das Mapping <code>{{ editing.objectId }}</code>
          aus „{{ editing.registry }}/{{ editing.stage }}“.
        </p>
        <p class="muted">Beim Speichern in der Zusammenfassung wird dieses Objekt überschrieben.</p>
      </div>
    </div>

    <dl class="picks">
      <dt><i class="pi pi-box" aria-hidden="true"></i> Sensormodell</dt>
      <dd>
        <template v-if="modelLabel">
          <strong>{{ modelLabel }}</strong>
          <small>{{ modelNsUri }}</small>
        </template>
        <span v-else class="placeholder">Noch kein Modell gewählt</span>
        <button type="button" class="btn" @click="modelDialogOpen = true">
          <i class="pi pi-search" aria-hidden="true"></i>
          {{ modelLabel ? 'Anderes Modell …' : 'Modell wählen …' }}
        </button>
      </dd>

      <template v-if="classCandidates.length">
        <dt><i class="pi pi-sitemap" aria-hidden="true"></i> Nachricht</dt>
        <dd>
          <strong v-if="selectedClassLabel">{{ selectedClassLabel }}</strong>
          <span v-else class="placeholder">Noch keine Klasse gewählt</span>
          <button type="button" class="btn" @click="pickerVisible = true">
            <i class="pi pi-search" aria-hidden="true"></i>
            {{ selectedClassLabel ? 'Andere Klasse …' : 'Klasse wählen …' }}
          </button>
        </dd>
      </template>
    </dl>

    <div v-if="warnings.length" class="warnbox">
      <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
      <ul>
        <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
      </ul>
    </div>

    <ClassPickerDialog
      v-model:open="pickerVisible"
      :candidates="classCandidates"
      :current-key="currentClassKey"
      @select="selectClass"
    />
    <ModelPickerDialog
      v-model:open="modelDialogOpen"
      @packages-loaded="onPackagesLoaded"
      @mapping-opened="onMappingOpened"
    />
  </section>
</template>

<script setup lang="ts">
/**
 * Schritt 1 (T23/#195): kompakte Übersicht statt Listenwüste — Verbindung
 * (nur Auswahl), gewähltes Sensormodell und Nachrichtenklasse. Modell- und
 * Mapping-Auswahl laufen über Dialoge.
 */
import { computed, ref } from 'vue';
import type { EClass, EPackage } from '@emfts/core';
import ClassPickerDialog from './dialogs/ClassPickerDialog.vue';
import type { ClassCandidate } from './dialogs/ClassPickerDialog.vue';
import ModelPickerDialog from './dialogs/ModelPickerDialog.vue';
import { editing, initSetup, restoreWarnings, sensorPackages, setup } from './context';
import { suggestMeasurementPaths } from '../emf/featurePaths';

const warnings = ref<string[]>(restoreWarnings.value);
const modelDialogOpen = ref(false);

const pickerVisible = ref(false);

const modelLabel = computed(() => {
  const pkg = setup.value?.sensorClass?.getEPackage() ?? sensorPackages.value[0];
  return pkg?.getName() ?? '';
});
const modelNsUri = computed(() => {
  const pkg = setup.value?.sensorClass?.getEPackage() ?? sensorPackages.value[0];
  return pkg?.getNsURI() ?? '';
});

const selectedClassLabel = computed(() => {
  const eClass = setup.value?.sensorClass;
  if (!eClass) return '';
  return `${eClass.getName()} (${eClass.getEPackage()?.getName() ?? '?'})`;
});
/** Ein bestehendes Mapping wurde geöffnet — der Kontext ist bereits gesetzt. */
function onMappingOpened(openWarnings: string[]): void {
  warnings.value = openWarnings;
}

function onPackagesLoaded(packages: EPackage[], newWarnings: string[]): void {
  sensorPackages.value = packages;
  warnings.value = newWarnings;
  const roots = rootCandidates();
  if (roots.length >= 1) selectClass(roots[0]);
}

const currentClassKey = computed(() => {
  const eClass = setup.value?.sensorClass;
  if (!eClass) return '';
  return `${eClass.getEPackage()?.getNsURI()}#${eClass.getName()}`;
});

const classCandidates = computed<ClassCandidate[]>(() => {
  const contained = containedClassNames();
  const candidates: ClassCandidate[] = [];
  for (const pkg of sensorPackages.value) {
    for (const classifier of pkg.getEClassifiers()) {
      const eClass = classifier as EClass;
      if (typeof eClass.isAbstract !== 'function') continue; // EDataType/EEnum
      if (eClass.isAbstract() || eClass.isInterface?.()) continue;
      candidates.push({
        key: `${pkg.getNsURI()}#${eClass.getName()}`,
        label: `${eClass.getName()} (${pkg.getName()})`,
        eClass,
        isRoot: !contained.has(eClass.getName() ?? ''),
        // Wie viele Zahlen-/Wahrheitswerte liegen darunter? Eine Klasse ohne
        // solche Felder taugt nicht als Sensor-Nachricht (Schritt 4 bliebe leer).
        measurementCount: suggestMeasurementPaths(eClass).length,
      });
    }
  }
  return candidates.sort((a, b) => a.label.localeCompare(b.label));
});

/** Klassen, die irgendwo Containment-Ziel sind — also keine Wurzel-Kandidaten. */
function containedClassNames(): Set<string> {
  const names = new Set<string>();
  for (const pkg of sensorPackages.value) {
    for (const classifier of pkg.getEClassifiers()) {
      const eClass = classifier as EClass;
      if (typeof eClass.getEAllReferences !== 'function') continue;
      for (const ref of eClass.getEAllReferences()) {
        if (ref.isContainment()) names.add(ref.getEReferenceType()?.getName() ?? '');
      }
    }
  }
  return names;
}

/**
 * Nach dem Laden eines Modells: die wahrscheinlichste Nachrichtenklasse —
 * Wurzel-Kandidat **und** mit Messwerten. Ohne die zweite Bedingung fiel die
 * Wahl alphabetisch (z. B. auf „Locker" statt „WaterQuality"), und Schritt 4
 * blieb leer.
 */
function rootCandidates(): ClassCandidate[] {
  const roots = classCandidates.value.filter((c) => c.isRoot);
  const pool = roots.length ? roots : classCandidates.value;
  const withMeasurements = [...pool]
    .filter((c) => (c.measurementCount ?? 0) > 0)
    .sort((a, b) => (b.measurementCount ?? 0) - (a.measurementCount ?? 0));
  return withMeasurements.length ? withMeasurements : pool;
}

function selectClass(candidate: ClassCandidate): void {
  initSetup(candidate.eClass);
}
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 0.85rem; }
.step h2 { margin: 0; font-size: 1.25rem; }
.lead { margin: 0; color: var(--text-color-secondary, #666); max-width: 44rem; }

.picks {
  display: grid; grid-template-columns: max-content 1fr; gap: 0.6rem 1.25rem;
  align-items: center; margin: 0; max-width: 52rem;
  padding: 0.85rem 1rem; border-radius: 8px;
  border: 1px solid var(--surface-border, #e3e3e3);
  background: var(--surface-card, #fff);
}
.picks dt {
  display: inline-flex; align-items: center; gap: 0.5rem;
  font-weight: 500; color: var(--text-color-secondary, #666); font-size: 0.9rem;
}
.picks dt .pi { color: var(--primary-color, #1a56a0); }
.picks dd {
  margin: 0; display: flex; align-items: baseline; gap: 0.75rem; flex-wrap: wrap; min-width: 0;
}
.picks dd small { color: var(--text-color-secondary, #777); font-size: 0.8rem; overflow-wrap: anywhere; }
.placeholder { color: var(--text-color-muted, #999); font-style: italic; }

.btn {
  display: inline-flex; align-items: center; gap: 0.4rem; font: inherit; font-size: 0.85rem;
  padding: 0.3rem 0.65rem; cursor: pointer; border-radius: 6px;
  border: 1px solid var(--surface-border, #c0c4cc);
  background: var(--surface-card, #fff); color: var(--text-color, inherit);
}
.btn:hover { border-color: var(--primary-color, #1a56a0); }

.editbox {
  display: flex; gap: 0.65rem; align-items: flex-start; max-width: 52rem;
  padding: 0.7rem 1rem; border-radius: 8px;
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary-color, #1a56a0) 32%, transparent);
}
.editbox .pi { color: var(--primary-color, #1a56a0); margin-top: 0.15rem; }
.editbox p { margin: 0; }
.editbox .muted { color: var(--text-color-secondary, #666); font-size: 0.9rem; margin-top: 0.15rem; }
.editbox code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em;
  padding: 0.05rem 0.3rem; border-radius: 4px;
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 12%, transparent);
}

.warnbox {
  display: flex; gap: 0.65rem; align-items: flex-start; max-width: 52rem;
  padding: 0.75rem 1rem; border-radius: 8px;
  background: color-mix(in srgb, #f5a623 12%, transparent);
  border: 1px solid color-mix(in srgb, #f5a623 45%, transparent);
}
.warnbox .pi { color: #b8860b; margin-top: 0.15rem; }
.warnbox ul { margin: 0; padding-left: 1rem; }
</style>
