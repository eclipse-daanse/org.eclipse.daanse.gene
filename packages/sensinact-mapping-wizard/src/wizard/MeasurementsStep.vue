<template>
  <section class="step">
    <h2>Messwerte</h2>
    <p class="lead">
      Diese Felder wurden im Sensormodell gefunden. Wählen Sie aus, welche Werte der
      Sensor bereitstellen soll, und vergeben Sie Anzeigenamen und Einheiten.
    </p>
    <div class="toolbar">
      <button type="button" class="btn small" @click="setAll(true)">
        <i class="pi pi-check-square" aria-hidden="true"></i> Alle auswählen
      </button>
      <button type="button" class="btn small" @click="setAll(false)">
        <i class="pi pi-stop" aria-hidden="true"></i> Alle abwählen
      </button>
      <span class="counter">{{ selectedCount }} von {{ measurements.length }} ausgewählt</span>
    </div>

    <p class="unit-hint">
      <i class="pi pi-info-circle" aria-hidden="true"></i>
      <span>
        Einheiten sind aus dem Sensormodell vorbelegt (Annotation
        <code>sensinact.mapping.unit</code>) und frei überschreibbar. Steht die Einheit erst
        in den Messdaten, wählen Sie sie in der Spalte „Einheit aus Feld“.
      </span>
    </p>

    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th class="check"></th>
            <th>Feld im Sensormodell</th>
            <th>Anzeigename</th>
            <th>Einheit</th>
            <th>Einheit aus Feld</th>
            <th>Gruppe</th>
            <th>Speichern</th>
            <th>Aufbewahren</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(m, i) in measurements" :key="i" :class="{ off: !m.selected }">
            <td class="check">
              <input type="checkbox" :checked="m.selected" @change="toggle(m, $event)" />
            </td>
            <td class="path">{{ m.valuePath?.label ?? '' }}</td>
            <td><input type="text" :value="m.label" @input="m.label = str($event)" /></td>
            <td class="unit">
              <input
                type="text"
                :value="m.unit"
                placeholder="z. B. V"
                :disabled="!!m.unitPath"
                :title="m.unitPath ? 'Die Einheit kommt aus einem Feld' : ''"
                @input="m.unit = str($event)"
              />
            </td>
            <td class="unit-field">
              <select :value="unitPathKey(m)" @change="setUnitPath(m, $event)">
                <option value="">— fest —</option>
                <option v-for="c in unitCandidates" :key="c.key" :value="c.key">{{ c.label }}</option>
              </select>
            </td>
            <td class="group"><input type="text" :value="m.serviceGroup" @input="m.serviceGroup = str($event)" /></td>
            <td>
              <select :value="m.storagePreset" @change="m.storagePreset = storage($event)">
                <option value="EVERY_CHANGE">jede Änderung</option>
                <option value="CHANGED_5_PERCENT">ab 5 % Änderung</option>
                <option value="MAX_ONCE_10MIN">max. alle 10 min</option>
              </select>
            </td>
            <td>
              <select :value="m.retentionPreset" @change="m.retentionPreset = retention($event)">
                <option value="FOREVER">unbegrenzt</option>
                <option value="DAYS_90">90 Tage</option>
                <option value="YEAR_1">1 Jahr</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <!-- Klasse ohne Zahlen-/Wahrheitswerte: der Nutzer braucht den Weg zurück,
         nicht die Aufforderung, etwas auszuwählen, das es nicht gibt. -->
    <p v-if="measurements.length === 0" class="error">
      <i class="pi pi-times-circle" aria-hidden="true"></i>
      In „{{ sensorClassName }}" wurden keine Zahlen- oder Wahrheitswerte gefunden, die als
      Messwert taugen. Wählen Sie in Schritt 1 eine andere Nachricht — der Klassen-Dialog zeigt
      je Klasse, wie viele Messwerte sie enthält.
    </p>
    <p v-else-if="!anySelected" class="error">
      <i class="pi pi-times-circle" aria-hidden="true"></i>
      Bitte wählen Sie mindestens einen Messwert aus.
    </p>
  </section>
</template>

<script setup lang="ts">
/**
 * Schritt 4: Messwert-Auswahl. Die Zeilen sind direkt an die Measurement-
 * EObjects des Fassadenmodells gebunden (generierte Property-Accessoren).
 */
import { computed } from 'vue';
import type { Measurement } from '../generated';
import { StoragePreset, RetentionPreset } from '../generated';
import { candidateFromPath, sensorClass, setup, touch, version } from './context';
import { enumerateFeaturePaths } from '../emf/featurePaths';

// Die Measurements sind EMF-Objekte (nicht deep-reactive). Vue benachrichtigt
// Abhängige nicht, wenn ein computed dieselbe Array-Identität zurückgibt —
// deshalb hängt die Liste an `version` und liefert bei touch() eine neue Kopie.
const sensorClassName = computed(() => sensorClass.value?.getName() ?? 'dieser Klasse');

const measurements = computed<Measurement[]>(() => {
  void version.value;
  return [...(setup.value?.measurements ?? [])];
});
const anySelected = computed(() => measurements.value.some((m) => m.selected));
const selectedCount = computed(() => measurements.value.filter((m) => m.selected).length);

/**
 * Kandidaten für dynamische Einheiten (ResourceMapping.unitFeature): Die
 * Einheit steht dann als Text in den Messdaten statt fest im Mapping.
 */
const unitCandidates = computed(() => {
  const root = sensorClass.value;
  if (!root) return [];
  return enumerateFeaturePaths(root, { kinds: ['STRING'] }).map((c) => ({
    ...c,
    key: c.segments.map((s) => s.getName()).join('/'),
  }));
});

function unitPathKey(m: Measurement): string {
  return m.unitPath ? m.unitPath.segments.map((s) => s.getName()).join('/') : '';
}

function setUnitPath(m: Measurement, event: Event): void {
  const key = (event.target as HTMLSelectElement).value;
  if (!key) {
    m.unitPath = undefined;
  } else {
    const candidate = unitCandidates.value.find((c) => c.key === key);
    if (candidate) m.unitPath = candidateFromPath(candidate);
  }
  touch();
}

function str(event: Event): string {
  return (event.target as HTMLInputElement).value;
}
function storage(event: Event): StoragePreset {
  return (event.target as HTMLSelectElement).value as StoragePreset;
}
function retention(event: Event): RetentionPreset {
  return (event.target as HTMLSelectElement).value as RetentionPreset;
}
function toggle(m: Measurement, event: Event): void {
  m.selected = (event.target as HTMLInputElement).checked;
  touch();
}
function setAll(value: boolean): void {
  for (const m of measurements.value) m.selected = value;
  touch();
}
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 0.75rem; }
.step h2 { margin: 0; font-size: 1.25rem; }
.lead { margin: 0; color: var(--text-color-secondary, #666); max-width: 44rem; }

.toolbar { display: flex; align-items: center; gap: 0.5rem; }
.unit-hint {
  display: flex; align-items: flex-start; gap: 0.5rem; margin: 0;
  font-size: 0.875rem; color: var(--text-color-secondary, #666);
}
.unit-hint .pi { color: var(--primary-color, #1a56a0); margin-top: 0.15rem; }
.unit-hint code { font-size: 0.95em; }
.counter { margin-left: auto; color: var(--text-color-secondary, #666); font-size: 0.9rem; }

.btn {
  display: inline-flex; align-items: center; gap: 0.4rem;
  font: inherit; cursor: pointer; border-radius: 6px;
  background: var(--surface-card, #fff);
  color: var(--text-color, inherit);
  border: 1px solid var(--surface-border, #c0c4cc);
  transition: background 0.15s;
}
.btn:hover { background: var(--surface-hover, #f0f0f0); }
.btn.small { padding: 0.35rem 0.75rem; font-size: 0.9rem; }
.btn .pi { font-size: 0.8rem; }

.table-card {
  border: 1px solid var(--surface-border, #ddd);
  border-radius: 8px;
  overflow: auto;
  background: var(--surface-card, #fff);
}
table { border-collapse: collapse; width: 100%; font-size: 0.925rem; }
th, td { padding: 0.5rem 0.65rem; text-align: left; border-bottom: 1px solid var(--surface-border, #eee); }
th {
  background: var(--surface-section, #f5f5f5);
  color: var(--text-color-secondary, #666);
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
}
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover { background: var(--surface-hover, #f8f8f8); }
tr.off td:not(.check) { opacity: 0.45; }
td.check, th.check { width: 2rem; text-align: center; }
input[type='checkbox'] { accent-color: var(--primary-color, #1a56a0); width: 1rem; height: 1rem; cursor: pointer; }
td input[type='text'] {
  width: 100%; box-sizing: border-box; font: inherit; padding: 0.3rem 0.45rem;
  background: var(--input-bg, #fff); color: var(--text-color, inherit);
  border: 1px solid var(--surface-border, #c0c4cc); border-radius: 4px;
}
td input[type='text']:focus-visible,
select:focus-visible {
  outline: none;
  border-color: var(--primary-color, #1a56a0);
}
td.unit input { width: 5rem; }
td.unit input:disabled { opacity: 0.5; cursor: not-allowed; }
td.unit-field select { max-width: 11rem; }
td.group input { width: 7rem; }
td.path { font-family: monospace; white-space: nowrap; color: var(--text-color-secondary, #555); }
select {
  font: inherit; padding: 0.3rem 0.4rem; border-radius: 4px; cursor: pointer;
  background: var(--input-bg, #fff); color: var(--text-color, inherit);
  border: 1px solid var(--surface-border, #c0c4cc);
}
.error { display: inline-flex; align-items: center; gap: 0.5rem; margin: 0; color: #e5484d; }
</style>
