<template>
  <section class="step">
    <h2>Spalten</h2>
    <p class="lead">
      Prüfen Sie Spaltennamen, Schlüssel und Pflichtfelder. Die Vorschläge stammen aus dem
      Modell — Änderungen hier gelten nur für die Datenbank, das Modell bleibt unberührt.
    </p>

    <label class="entity-pick">
      Klasse
      <select v-model="selectedIndex">
        <option v-for="(e, i) in entities" :key="i" :value="i">
          {{ e.targetClass.getName() }} → {{ e.tableName }}
        </option>
      </select>
    </label>

    <div v-if="current" class="table-card">
      <table>
        <thead>
          <tr>
            <th class="check"></th>
            <th>Attribut</th>
            <th>Spalte</th>
            <th>Rolle</th>
            <th>Schlüsselwert</th>
            <th class="tight">Pflicht</th>
            <th class="tight">Eindeutig</th>
            <th class="tight">Länge</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(a, i) in current.attributes" :key="i" :class="{ off: !a.selected }">
            <td class="check">
              <input type="checkbox" :checked="a.selected" @change="toggle(a, $event)" />
            </td>
            <td class="feat">
              {{ a.feature.getName() }}
              <small>{{ typeName(a) }}</small>
            </td>
            <td><input type="text" :value="a.columnName" @input="a.columnName = str($event)" /></td>
            <td>
              <select :value="a.role" @change="setRole(a, $event)">
                <option value="BASIC">Wert</option>
                <option value="ID">Schlüssel</option>
                <option value="VERSION">Versionszähler</option>
              </select>
            </td>
            <td>
              <select
                v-if="a.role === 'ID'"
                :value="a.idStrategy"
                @change="setStrategy(a, $event)"
              >
                <option value="NONE">selbst vergeben</option>
                <option value="SEQUENCE">Sequenz</option>
                <option value="IDENTITY">Auto-Wert der Datenbank</option>
                <option value="UUID">UUID</option>
                <option value="TABLE">Tabellen-Generator</option>
              </select>
              <span v-else class="muted">—</span>
            </td>
            <td class="tight">
              <input
                type="checkbox"
                :checked="!a.nullable"
                @change="a.nullable = !($event.target as HTMLInputElement).checked; touch()"
              />
            </td>
            <td class="tight">
              <input type="checkbox" :checked="a.unique" @change="a.unique = ($event.target as HTMLInputElement).checked; touch()" />
            </td>
            <td class="tight">
              <input
                type="number"
                min="0"
                :value="a.length"
                @input="a.length = Number(str($event)) || 0"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="current && !hasId" class="warn">
      <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
      „{{ current.targetClass.getName() }}“ hat keinen Schlüssel — ohne Schlüssel kann die
      Klasse nicht gespeichert werden.
    </p>
  </section>
</template>

<script setup lang="ts">
/** Schritt 3: Spalten je Entity prüfen (Name, Rolle, Schlüsselstrategie, Pflicht, Länge). */
import { computed, ref } from 'vue';
import type { AttributeConfig, EntityConfig } from '../generated';
import { AttributeRole, IdStrategy } from '../generated';
import { setup, touch, version } from './context';

const entities = computed<EntityConfig[]>(() => {
  void version.value;
  return (setup.value?.entities ?? []).filter((e) => e.selected);
});
const selectedIndex = ref(0);
const current = computed(() => entities.value[selectedIndex.value] ?? entities.value[0]);
const hasId = computed(
  () => !!current.value?.attributes.some((a) => a.selected && a.role === AttributeRole.ID),
);

function typeName(a: AttributeConfig): string {
  const t = a.feature.getEType?.();
  return t?.getName?.() ?? '';
}
function str(event: Event): string {
  return (event.target as HTMLInputElement).value;
}
function toggle(a: AttributeConfig, event: Event): void {
  a.selected = (event.target as HTMLInputElement).checked;
  touch();
}
function setRole(a: AttributeConfig, event: Event): void {
  a.role = (event.target as HTMLSelectElement).value as AttributeRole;
  if (a.role === AttributeRole.ID) {
    a.nullable = false;
    a.unique = true;
  }
  touch();
}
function setStrategy(a: AttributeConfig, event: Event): void {
  a.idStrategy = (event.target as HTMLSelectElement).value as IdStrategy;
  touch();
}
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 0.75rem; }
.step h2 { margin: 0; font-size: 1.25rem; }
.lead { margin: 0; color: var(--text-color-secondary, #666); max-width: 46rem; }
.entity-pick {
  display: flex; flex-direction: column; gap: 0.3rem; max-width: 26rem;
  font-size: 0.9rem; font-weight: 500; color: var(--text-color-secondary, #666);
}
.table-card {
  border: 1px solid var(--surface-border, #ddd); border-radius: 8px; overflow: auto;
  background: var(--surface-card, #fff);
}
table { border-collapse: collapse; width: 100%; font-size: 0.925rem; }
th, td { padding: 0.45rem 0.6rem; text-align: left; border-bottom: 1px solid var(--surface-border, #eee); }
th {
  background: var(--surface-section, #f5f5f5); color: var(--text-color-secondary, #666);
  font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap;
}
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover { background: var(--surface-hover, #f8f8f8); }
tr.off td:not(.check) { opacity: 0.45; }
td.check, th.check { width: 2rem; text-align: center; }
th.tight, td.tight { width: 4.5rem; text-align: center; }
td.feat { font-family: monospace; white-space: nowrap; }
td.feat small { color: var(--text-color-secondary, #888); margin-left: 0.4rem; }
.muted { color: var(--text-color-muted, #999); }
input[type='checkbox'] { accent-color: var(--primary-color, #1a56a0); width: 1rem; height: 1rem; cursor: pointer; }
td input[type='text'], td input[type='number'], td select {
  width: 100%; box-sizing: border-box; font: inherit; padding: 0.3rem 0.4rem; border-radius: 4px;
  background: var(--input-bg, #fff); color: var(--text-color, inherit);
  border: 1px solid var(--surface-border, #c0c4cc);
}
select, .entity-pick select {
  padding: 0.4rem 0.5rem; border-radius: 6px; font: inherit; cursor: pointer;
  background: var(--input-bg, #fff); color: var(--text-color, inherit);
  border: 1px solid var(--surface-border, #c0c4cc);
}
.warn { display: inline-flex; align-items: center; gap: 0.5rem; margin: 0; color: #b8860b; }
</style>
