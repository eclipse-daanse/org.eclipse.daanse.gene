<template>
  <section class="step">
    <h2>Formate</h2>
    <p class="lead">
      Ohne Auswahl liefert der Data Atlas seine Vorgaben: JSON und XML. Sobald
      Sie <em>ein</em> Format anhaken, ersetzt die Auswahl diese Vorgaben
      vollständig — alles Nichtgewählte wird dann mit 406 abgelehnt.
    </p>

    <ul class="formate">
      <li v-for="art in ARTEN" :key="art.kind">
        <label class="zeile">
          <input
            type="checkbox"
            :checked="istGewaehlt(art.kind)"
            @change="schalte(art.kind, ($event.target as HTMLInputElement).checked)"
          />
          <span class="name">{{ art.label }}</span>
          <small>{{ art.hinweis }}</small>
        </label>

        <div v-if="istGewaehlt(art.kind) && istCsv(art.kind)" class="csv-optionen">
          <label>
            Trennzeichen
            <input
              type="text"
              maxlength="1"
              :value="eintrag(art.kind)!.separator"
              @input="setze(art.kind, 'separator', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="check">
            <input
              type="checkbox"
              :checked="eintrag(art.kind)!.includeTypeHeader"
              @change="setze(art.kind, 'includeTypeHeader', ($event.target as HTMLInputElement).checked)"
            />
            Zeile mit den SQL-Typen voranstellen
          </label>
        </div>
      </li>
    </ul>

    <p v-if="warnung" class="warnung">
      <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
      {{ warnung }}
    </p>
    <p v-else-if="gewaehlte.length === 0" class="hinweis">
      <i class="pi pi-info-circle" aria-hidden="true"></i>
      Nichts gewählt — es gelten JSON und XML.
    </p>
  </section>
</template>

<script setup lang="ts">
/**
 * Schritt 6: Ausgabeformate.
 *
 * Die Auswahl ist eine Liste von ExportConfig-Objekten am Setup; anhaken legt
 * eines an, abhaken entfernt es. Ein leerer Satz ist zulässig und bedeutet
 * etwas anderes als „alles abgewählt" — deshalb der Hinweis darunter.
 */
import { computed } from 'vue';
import { DataatlaswizardFactory, ExportKind, type ExportConfig } from '../generated';
import { setup, touch, version } from './context';
import { findWarnings } from '../transform/validate';

const ARTEN: { kind: ExportKind; label: string; hinweis: string; id: string; name: string; beschreibung: string }[] = [
  {
    kind: ExportKind.JSON,
    label: 'JSON',
    hinweis: 'application/json',
    id: 'json',
    name: 'JSON',
    beschreibung: 'Daten als JSON.',
  },
  {
    kind: ExportKind.XML,
    label: 'XML',
    hinweis: 'application/xml',
    id: 'xml',
    name: 'XML',
    beschreibung: 'Daten als XML.',
  },
  {
    kind: ExportKind.CSV,
    label: 'CSV',
    hinweis: 'Trennzeichen wählbar',
    id: 'csv',
    name: 'CSV',
    beschreibung: 'Daten als CSV.',
  },
  {
    kind: ExportKind.CSV_ZIP,
    label: 'CSV, gepackt',
    hinweis: 'CSV in einem ZIP',
    id: 'csv-zip',
    name: 'CSV (ZIP)',
    beschreibung: 'Daten als CSV, gepackt.',
  },
];

const gewaehlte = computed<ExportConfig[]>(() => {
  void version.value;
  return setup.value?.exports ?? [];
});

const istCsv = (kind: ExportKind) => kind === ExportKind.CSV || kind === ExportKind.CSV_ZIP;
const eintrag = (kind: ExportKind) => gewaehlte.value.find((e) => e.kind === kind);
const istGewaehlt = (kind: ExportKind) => !!eintrag(kind);

function schalte(kind: ExportKind, an: boolean): void {
  const s = setup.value;
  if (!s) return;
  if (an) {
    const art = ARTEN.find((a) => a.kind === kind)!;
    const neu = DataatlaswizardFactory.eINSTANCE.createExportConfig();
    neu.kind = kind;
    neu.id = art.id;
    neu.name = art.name;
    neu.description = art.beschreibung;
    s.exports.push(neu);
  } else {
    s.exports = s.exports.filter((e) => e.kind !== kind);
  }
  touch();
}

function setze<K extends keyof ExportConfig>(kind: ExportKind, feld: K, wert: ExportConfig[K]) {
  const e = eintrag(kind);
  if (!e) return;
  e[feld] = wert;
  touch();
}

/** Dieselbe Warnung, die auch die Zusammenfassung zeigt. */
const warnung = computed<string>(() => {
  void version.value;
  const s = setup.value;
  if (!s) return '';
  return findWarnings(s).find((w) => w.includes('406')) ?? '';
});
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 0.9rem; max-width: 44rem; }
h2 { margin: 0; font-size: 1.25rem; }
.lead { margin: 0; color: var(--text-color-secondary, #666); }
.formate { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.formate > li {
  border: 1px solid var(--surface-border, #ddd);
  border-radius: 6px;
  padding: 0.6rem 0.8rem;
}
.zeile { display: flex; align-items: baseline; gap: 0.6rem; cursor: pointer; }
.zeile .name { font-weight: 600; }
.zeile small { color: var(--text-color-secondary, #888); }
.csv-optionen {
  display: flex;
  gap: 1.5rem;
  align-items: center;
  margin: 0.6rem 0 0 1.8rem;
  font-size: 0.9rem;
}
.csv-optionen input[type='text'] {
  width: 2.5rem;
  text-align: center;
  font: inherit;
  padding: 0.2rem;
  border: 1px solid var(--surface-border, #ccc);
  border-radius: 4px;
}
.csv-optionen label.check { display: inline-flex; align-items: center; gap: 0.4rem; }
.warnung, .hinweis {
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.9rem;
}
.warnung { color: var(--text-color-secondary, #8a6d00); }
.hinweis { color: var(--text-color-secondary, #666); }
</style>
