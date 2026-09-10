<template>
  <section class="step">
    <h2>Datensätze</h2>
    <p class="lead">
      Jede angehakte Klasse wird ein Datensatz und bekommt unter dem Basis-Pfad
      einen eigenen Pfad. Die Vorschläge stammen aus dem Modell — Änderungen
      hier gelten nur für den Endpunkt, das Modell bleibt unberührt.
    </p>

    <div v-if="datasets.length === 0" class="leer">
      Das gewählte Modell enthält keine konkrete Klasse.
    </div>

    <div v-else class="table-card">
      <table>
        <thead>
          <tr>
            <th class="check"></th>
            <th>Klasse</th>
            <th>id</th>
            <th>Name</th>
            <th>Pfad</th>
            <th>Beschreibung</th>
            <th class="tight">Batch</th>
            <th class="tight">Grenze</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(d, i) in datasets" :key="i" :class="{ off: !d.selected }">
            <td class="check">
              <input
                type="checkbox"
                :checked="d.selected"
                :aria-label="`${d.targetClass?.getName()} veröffentlichen`"
                @change="setze(d, 'selected', ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td class="klasse">
              {{ d.targetClass?.getName() }}
              <small>{{ d.targetClass?.getEPackage()?.getName() }}</small>
            </td>
            <td><input type="text" :value="d.id" @input="setze(d, 'id', text($event))" /></td>
            <td><input type="text" :value="d.name" @input="setze(d, 'name', text($event))" /></td>
            <td><input type="text" :value="d.path" @input="setze(d, 'path', text($event))" /></td>
            <td>
              <input
                type="text"
                class="weit"
                :value="d.description"
                @input="setze(d, 'description', text($event))"
              />
            </td>
            <td class="tight">
              <input
                type="number"
                :value="d.batchSize"
                @input="setze(d, 'batchSize', zahl($event))"
              />
            </td>
            <td class="tight">
              <input
                type="number"
                :value="d.batchSizeLimit"
                @input="setze(d, 'batchSizeLimit', zahl($event))"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p class="fuss">
        <i class="pi pi-info-circle" aria-hidden="true"></i>
        Batch und Grenze bleiben auf −1, solange sie nicht gebraucht werden — dann
        stehen sie auch nicht in der Konfiguration.
      </p>
    </div>

    <ul v-if="hinweise.length" class="hinweise">
      <li v-for="(h, i) in hinweise" :key="i">
        <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
        {{ h }}
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
/**
 * Schritt 4: Welche Klassen werden Datensätze.
 *
 * Die Tabelle schreibt direkt ins Fassadenmodell und stößt danach `touch()`
 * an — EMF-Objekte sind nicht deep-reaktiv, ohne das bliebe die Anzeige
 * stehen.
 */
import { computed } from 'vue';
import type { DatasetConfig } from '../generated';
import { setup, touch, version } from './context';

const datasets = computed<DatasetConfig[]>(() => {
  void version.value;
  return setup.value?.datasets ?? [];
});

const text = (e: Event) => (e.target as HTMLInputElement).value;
const zahl = (e: Event) => {
  const wert = Number.parseInt((e.target as HTMLInputElement).value, 10);
  return Number.isFinite(wert) ? wert : -1;
};

function setze<K extends keyof DatasetConfig>(d: DatasetConfig, feld: K, wert: DatasetConfig[K]) {
  d[feld] = wert;
  touch();
}

/** Was der Nutzer sehen sollte, bevor die Zusammenfassung es hart meldet. */
const hinweise = computed<string[]>(() => {
  void version.value;
  const ausgewaehlt = datasets.value.filter((d) => d.selected);
  const meldungen: string[] = [];
  if (ausgewaehlt.length === 0) meldungen.push('Kein Datensatz ausgewählt.');

  for (const feld of ['id', 'path'] as const) {
    const werte = ausgewaehlt.map((d) => d[feld]);
    const doppelt = [...new Set(werte.filter((w, i) => w && werte.indexOf(w) !== i))];
    for (const wert of doppelt) {
      meldungen.push(`„${wert}" ist als ${feld} mehrfach vergeben.`);
    }
  }
  for (const d of ausgewaehlt) {
    if (!d.description?.trim()) {
      meldungen.push(`„${d.id || d.targetClass?.getName()}": die Beschreibung ist Pflicht.`);
    }
  }
  return meldungen;
});
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 0.9rem; }
h2 { margin: 0; font-size: 1.25rem; }
.lead { margin: 0; color: var(--text-color-secondary, #666); max-width: 46rem; }
.leer { color: var(--text-color-secondary, #666); }

.table-card {
  border: 1px solid var(--surface-border, #ddd);
  border-radius: 8px;
  overflow-x: auto;
}
table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
th, td { padding: 0.4rem 0.6rem; text-align: left; border-bottom: 1px solid var(--surface-border, #eee); }
th { font-weight: 600; background: var(--surface-hover, #f6f6f6); white-space: nowrap; }
tr:last-child td { border-bottom: none; }
tr.off { opacity: 0.5; }
td.check, th.check { width: 2rem; }
td.tight input { width: 5rem; }
.klasse small { display: block; color: var(--text-color-secondary, #888); font-size: 0.75rem; }
input[type='text'], input[type='number'] {
  width: 100%;
  min-width: 6rem;
  font: inherit;
  padding: 0.25rem 0.4rem;
  border: 1px solid var(--surface-border, #ccc);
  border-radius: 4px;
  background: var(--surface-card, #fff);
  color: inherit;
}
input.weit { min-width: 16rem; }
.fuss {
  margin: 0;
  padding: 0.5rem 0.6rem;
  font-size: 0.8rem;
  color: var(--text-color-secondary, #666);
}
.hinweise { margin: 0; padding-left: 1.1rem; color: var(--text-color-secondary, #8a6d00); font-size: 0.9rem; }
.hinweise li { list-style: none; }
</style>
