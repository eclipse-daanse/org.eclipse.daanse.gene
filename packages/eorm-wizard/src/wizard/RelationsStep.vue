<template>
  <section class="step">
    <h2>Beziehungen <span class="optional">(optional)</span></h2>
    <p class="lead">
      Referenzen zwischen Klassen werden als Fremdschlüssel oder Zwischentabelle gespeichert.
      Die Vorschläge folgen dem Modell: enthaltene Objekte hängen am Elternobjekt, freie
      Referenzen werden nur verknüpft.
    </p>

    <p v-if="rows.length === 0" class="empty">
      Die gewählten Klassen haben keine Referenzen — weiter zum nächsten Schritt.
    </p>

    <div v-else class="table-card">
      <table>
        <thead>
          <tr>
            <th class="check"></th>
            <th>Referenz</th>
            <th>Art</th>
            <th>Speicherung</th>
            <th>Name</th>
            <th>Laden</th>
            <th class="tight">Mit Eltern</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.key" :class="{ off: !row.relation.selected }">
            <td class="check">
              <input
                type="checkbox"
                :checked="row.relation.selected"
                @change="row.relation.selected = ($event.target as HTMLInputElement).checked; touch()"
              />
            </td>
            <td class="feat">
              {{ row.entity.targetClass.getName() }}.{{ row.relation.feature.getName() }}
              <small>→ {{ targetName(row.relation) }}</small>
            </td>
            <td>
              <select :value="row.relation.kind" @change="set(row.relation, 'kind', $event)">
                <option value="ONE_TO_ONE">1 : 1</option>
                <option value="ONE_TO_MANY">1 : n</option>
                <option value="MANY_TO_ONE">n : 1</option>
                <option value="MANY_TO_MANY">n : m</option>
              </select>
            </td>
            <td>
              <select :value="row.relation.joinStrategy" @change="set(row.relation, 'joinStrategy', $event)">
                <option value="JOIN_COLUMN">Fremdschlüssel-Spalte</option>
                <option value="JOIN_TABLE">Zwischentabelle</option>
              </select>
            </td>
            <td>
              <input
                type="text"
                :value="row.relation.joinName"
                :placeholder="row.relation.joinStrategy === 'JOIN_TABLE' ? 'automatisch' : 'automatisch'"
                @input="row.relation.joinName = (($event.target as HTMLInputElement).value)"
              />
            </td>
            <td>
              <select :value="row.relation.fetch" @change="set(row.relation, 'fetch', $event)">
                <option value="LAZY">bei Bedarf</option>
                <option value="EAGER">sofort</option>
              </select>
            </td>
            <td class="tight">
              <input
                type="checkbox"
                :checked="row.relation.cascadeAll"
                title="Änderungen und Löschen an den verknüpften Objekten mitführen"
                @change="setCascade(row.relation, $event)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="mappedByHint" class="hintbox">
      <i class="pi pi-info-circle" aria-hidden="true"></i>
      <span>
        Bei zweiseitigen Beziehungen trägt nur eine Seite den Fremdschlüssel; die andere
        verweist darauf ({{ mappedByHint }}). Das ist automatisch gesetzt.
      </span>
    </p>
  </section>
</template>

<script setup lang="ts">
/** Schritt 4: Beziehungen prüfen (Art, Speicherung, Laden, Kaskadierung). */
import { computed } from 'vue';
import type { EReference } from '@emfts/core';
import type { EntityConfig, RelationConfig } from '../generated';
import { setup, touch, version } from './context';

interface Row {
  key: string;
  entity: EntityConfig;
  relation: RelationConfig;
}

const rows = computed<Row[]>(() => {
  void version.value;
  const result: Row[] = [];
  for (const entity of setup.value?.entities ?? []) {
    if (!entity.selected) continue;
    for (const relation of entity.relations) {
      result.push({
        key: `${entity.targetClass.getName()}.${relation.feature.getName()}`,
        entity,
        relation,
      });
    }
  }
  return result;
});

const mappedByHint = computed(() => {
  const withMappedBy = rows.value.filter((r) => r.relation.mappedBy);
  return withMappedBy.length ? withMappedBy.map((r) => r.key).join(', ') : '';
});

function targetName(r: RelationConfig): string {
  return (r.feature as EReference).getEReferenceType()?.getName() ?? '?';
}
function set(r: RelationConfig, key: 'kind' | 'joinStrategy' | 'fetch', event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  (r as unknown as Record<string, string>)[key] = value;
  touch();
}
function setCascade(r: RelationConfig, event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  r.cascadeAll = checked;
  r.orphanRemoval = checked;
  touch();
}
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 0.75rem; }
.step h2 { margin: 0; font-size: 1.25rem; }
.optional { font-weight: 400; color: var(--text-color-muted, #999); font-size: 0.9em; }
.lead { margin: 0; color: var(--text-color-secondary, #666); max-width: 46rem; }
.empty { color: var(--text-color-secondary, #666); margin: 0; }
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
th.tight, td.tight { width: 5.5rem; text-align: center; }
td.feat { font-family: monospace; white-space: nowrap; }
td.feat small { color: var(--text-color-secondary, #888); }
input[type='checkbox'] { accent-color: var(--primary-color, #1a56a0); width: 1rem; height: 1rem; cursor: pointer; }
td input[type='text'], td select {
  width: 100%; box-sizing: border-box; font: inherit; padding: 0.3rem 0.4rem; border-radius: 4px;
  background: var(--input-bg, #fff); color: var(--text-color, inherit);
  border: 1px solid var(--surface-border, #c0c4cc);
}
.hintbox {
  display: flex; gap: 0.5rem; align-items: flex-start; margin: 0;
  font-size: 0.875rem; color: var(--text-color-secondary, #666);
}
.hintbox .pi { color: var(--primary-color, #1a56a0); margin-top: 0.15rem; }
</style>
