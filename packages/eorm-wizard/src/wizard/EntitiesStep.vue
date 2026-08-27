<template>
  <section class="step">
    <h2>Klassen und Tabellen</h2>
    <p class="lead">
      Welche Klassen sollen gespeichert werden, und unter welchem Tabellennamen?
    </p>
    <div class="toolbar">
      <button type="button" class="btn small" @click="setAll(true)">
        <i class="pi pi-check-square" aria-hidden="true"></i> Alle auswählen
      </button>
      <button type="button" class="btn small" @click="setAll(false)">
        <i class="pi pi-stop" aria-hidden="true"></i> Alle abwählen
      </button>
      <span class="counter">{{ selectedCount }} von {{ entities.length }} gewählt</span>
    </div>

    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th class="check"></th>
            <th>Klasse</th>
            <th>Tabelle</th>
            <th>Spalten</th>
            <th>Beziehungen</th>
            <th>Vererbung</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(e, i) in entities" :key="i" :class="{ off: !e.selected }">
            <td class="check">
              <input type="checkbox" :checked="e.selected" @change="toggle(e, $event)" />
            </td>
            <td class="cls">{{ e.targetClass.getName() }}</td>
            <td><input type="text" :value="e.tableName" @input="e.tableName = str($event)" /></td>
            <td class="num">{{ e.attributes.filter((a) => a.selected).length }}</td>
            <td class="num">{{ e.relations.filter((r) => r.selected).length }}</td>
            <td>
              <select :value="e.inheritance" @change="setInheritance(e, $event)">
                <option value="NONE">—</option>
                <option value="SINGLE_TABLE">eine Tabelle</option>
                <option value="JOINED">getrennte Tabellen</option>
                <option value="TABLE_PER_CLASS">Tabelle je Klasse</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!anySelected" class="error">
      <i class="pi pi-times-circle" aria-hidden="true"></i>
      Bitte wählen Sie mindestens eine Klasse aus.
    </p>
  </section>
</template>

<script setup lang="ts">
/** Schritt 2: Entities auswählen, Tabellennamen und Vererbung festlegen. */
import { computed } from 'vue';
import type { EntityConfig } from '../generated';
import { InheritanceStrategy } from '../generated';
import { setup, touch, version } from './context';

const entities = computed<EntityConfig[]>(() => {
  void version.value;
  return [...(setup.value?.entities ?? [])];
});
const selectedCount = computed(() => entities.value.filter((e) => e.selected).length);
const anySelected = computed(() => selectedCount.value > 0);

function str(event: Event): string {
  return (event.target as HTMLInputElement).value;
}
function toggle(e: EntityConfig, event: Event): void {
  e.selected = (event.target as HTMLInputElement).checked;
  touch();
}
function setInheritance(e: EntityConfig, event: Event): void {
  e.inheritance = (event.target as HTMLSelectElement).value as InheritanceStrategy;
  touch();
}
function setAll(value: boolean): void {
  for (const e of entities.value) e.selected = value;
  touch();
}
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 0.75rem; }
.step h2 { margin: 0; font-size: 1.25rem; }
.lead { margin: 0; color: var(--text-color-secondary, #666); max-width: 44rem; }
.toolbar { display: flex; align-items: center; gap: 0.5rem; }
.counter { margin-left: auto; color: var(--text-color-secondary, #666); font-size: 0.9rem; }
.btn {
  display: inline-flex; align-items: center; gap: 0.4rem; font: inherit; cursor: pointer;
  border-radius: 6px; background: var(--surface-card, #fff); color: var(--text-color, inherit);
  border: 1px solid var(--surface-border, #c0c4cc);
}
.btn:hover { background: var(--surface-hover, #f0f0f0); }
.btn.small { padding: 0.35rem 0.75rem; font-size: 0.9rem; }
.table-card {
  border: 1px solid var(--surface-border, #ddd); border-radius: 8px; overflow: auto;
  background: var(--surface-card, #fff);
}
table { border-collapse: collapse; width: 100%; font-size: 0.925rem; }
th, td { padding: 0.5rem 0.65rem; text-align: left; border-bottom: 1px solid var(--surface-border, #eee); }
th {
  background: var(--surface-section, #f5f5f5); color: var(--text-color-secondary, #666);
  font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap;
}
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover { background: var(--surface-hover, #f8f8f8); }
tr.off td:not(.check) { opacity: 0.45; }
td.check, th.check { width: 2rem; text-align: center; }
td.cls { font-family: monospace; white-space: nowrap; }
td.num { text-align: right; color: var(--text-color-secondary, #666); }
input[type='checkbox'] { accent-color: var(--primary-color, #1a56a0); width: 1rem; height: 1rem; cursor: pointer; }
td input[type='text'], td select {
  width: 100%; box-sizing: border-box; font: inherit; padding: 0.3rem 0.45rem; border-radius: 4px;
  background: var(--input-bg, #fff); color: var(--text-color, inherit);
  border: 1px solid var(--surface-border, #c0c4cc);
}
.error { display: inline-flex; align-items: center; gap: 0.5rem; margin: 0; color: #e5484d; }
</style>
