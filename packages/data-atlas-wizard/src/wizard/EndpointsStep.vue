<template>
  <section class="step">
    <h2>Endpunkte</h2>
    <p class="lead">
      Ein Endpunkt veröffentlicht Datenwege. Welche Felder er hat, hängt an
      seiner Art — das Zielmodell kennt für jede Art eigene.
    </p>

    <article v-for="(endpoint, ei) in endpoints" :key="ei" class="endpunkt">
      <header>
        <input
          type="text"
          class="id"
          :value="endpoint.id"
          aria-label="id des Endpunkts"
          @input="setEndpoint(endpoint, 'id', text($event))"
        />
        <select
          class="art"
          :value="endpoint.kind"
          aria-label="Art des Endpunkts"
          @change="changeKind(endpoint, wert($event) as EndpointKind)"
        >
          <option v-for="k in ENDPOINT_KINDS" :key="k.kind" :value="k.kind">{{ k.label }}</option>
        </select>
        <button
          type="button"
          class="weg"
          :disabled="endpoints.length < 2"
          title="Endpunkt entfernen"
          @click="removeEndpoint(endpoint)"
        >
          <i class="pi pi-trash" aria-hidden="true"></i>
        </button>
      </header>

      <fieldset>
        <legend>Identität</legend>
        <label>
          Name
          <input type="text" :value="endpoint.name" @input="setEndpoint(endpoint, 'name', text($event))" />
        </label>
        <label>
          Beschreibung
          <input
            type="text"
            :value="endpoint.description"
            @input="setEndpoint(endpoint, 'description', text($event))"
          />
        </label>
        <label>
          Basis-Pfad
          <input
            type="text"
            :value="endpoint.urlContext"
            placeholder="/example"
            @input="setEndpoint(endpoint, 'urlContext', text($event))"
          />
        </label>

        <label v-if="shapeOf(endpoint).hasOpenApi" class="check">
          <input
            type="checkbox"
            :checked="endpoint.openApi"
            @change="setEndpoint(endpoint, 'openApi', ($event.target as HTMLInputElement).checked)"
          />
          OpenAPI-Beschreibung ausliefern
        </label>

        <template v-if="shapeOf(endpoint).hasPagination">
          <label>
            Pagination: Offset-Parameter
            <input
              type="text"
              :value="endpoint.paginationOffsetParameterName"
              @input="setEndpoint(endpoint, 'paginationOffsetParameterName', text($event))"
            />
          </label>
          <label>
            Pagination: Size-Parameter
            <input
              type="text"
              :value="endpoint.paginationSizeParameterName"
              @input="setEndpoint(endpoint, 'paginationSizeParameterName', text($event))"
            />
          </label>
        </template>
      </fieldset>

      <!-- ── Welche Datenwege ─────────────────────────────────────────────── -->
      <fieldset>
        <legend>Veröffentlicht</legend>
        <ul class="wege">
          <li v-for="chain in allChains" :key="chain.id">
            <label>
              <input
                type="checkbox"
                :checked="publishes(endpoint, chain)"
                @change="toggleChain(endpoint, chain, ($event.target as HTMLInputElement).checked)"
              />
              {{ chain.id }}
              <small>{{ chain.datasets.filter((d) => d.selected).length }} Datensätze</small>
            </label>
          </li>
        </ul>
        <p v-if="endpoint.chains.length === 0" class="hinweis">
          <i class="pi pi-info-circle" aria-hidden="true"></i>
          Nichts gewählt — dann alle Wege.
        </p>
      </fieldset>

      <!-- ── Je Datensatz ─────────────────────────────────────────────────── -->
      <fieldset v-if="shapeOf(endpoint).hasEntries && endpoint.entries.length > 0">
        <legend>Je Datensatz</legend>
        <table>
          <thead>
            <tr>
              <th>Datensatz</th>
              <th v-if="shapeOf(endpoint).hasPath">Pfad</th>
              <th v-if="shapeOf(endpoint).hasPath" class="tight">Batch</th>
              <th v-if="shapeOf(endpoint).hasPath" class="tight">Grenze</th>
              <th v-if="shapeOf(endpoint).hasGeometry">Länge</th>
              <th v-if="shapeOf(endpoint).hasGeometry">Breite</th>
              <th v-if="shapeOf(endpoint).hasGeometry">Geometrie</th>
              <th v-if="shapeOf(endpoint).classFeature">
                {{ shapeOf(endpoint).classFeature === 'mapping' ? 'mapping' : 'layer' }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, i) in endpoint.entries" :key="i">
              <td class="klasse">{{ entry.dataset?.id }}</td>
              <td v-if="shapeOf(endpoint).hasPath">
                <input type="text" :value="entry.path" @input="setEntry(entry, 'path', text($event))" />
              </td>
              <td v-if="shapeOf(endpoint).hasPath" class="tight">
                <input type="number" :value="entry.batchSize" @input="setEntry(entry, 'batchSize', zahl($event))" />
              </td>
              <td v-if="shapeOf(endpoint).hasPath" class="tight">
                <input
                  type="number"
                  :value="entry.batchSizeLimit"
                  @input="setEntry(entry, 'batchSizeLimit', zahl($event))"
                />
              </td>
              <td v-if="shapeOf(endpoint).hasGeometry">
                <input
                  type="text"
                  :value="entry.longitudeFeature"
                  @input="setEntry(entry, 'longitudeFeature', text($event))"
                />
              </td>
              <td v-if="shapeOf(endpoint).hasGeometry">
                <input
                  type="text"
                  :value="entry.latitudeFeature"
                  @input="setEntry(entry, 'latitudeFeature', text($event))"
                />
              </td>
              <td v-if="shapeOf(endpoint).hasGeometry">
                <input
                  type="text"
                  :value="entry.geometryFeature"
                  @input="setEntry(entry, 'geometryFeature', text($event))"
                />
              </td>
              <td v-if="shapeOf(endpoint).classFeature">
                <select
                  :value="classNameOf(entry, shapeOf(endpoint).classFeature!)"
                  @change="setClass(entry, shapeOf(endpoint).classFeature!, wert($event))"
                >
                  <option value="">— wählen —</option>
                  <option v-for="c in modelClasses" :key="c.getName() ?? ''" :value="c.getName() ?? ''">
                    {{ c.getName() }}
                  </option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </fieldset>

      <p v-else-if="!shapeOf(endpoint).hasEntries" class="hinweis">
        <i class="pi pi-info-circle" aria-hidden="true"></i>
        Diese Art kennt keine Angaben je Datensatz — sie liefert aus, was ihr
        Dateneingang führt.
      </p>

      <ul v-if="hinweise(endpoint).length" class="probleme">
        <li v-for="(h, i) in hinweise(endpoint)" :key="i">
          <i class="pi pi-exclamation-triangle" aria-hidden="true"></i> {{ h }}
        </li>
      </ul>
    </article>

    <div class="aktionen">
      <button type="button" class="btn" @click="addEndpointOfKind(EndpointKind.REST)">
        <i class="pi pi-plus" aria-hidden="true"></i> Endpunkt
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Step 4: the endpoints.
 *
 * The target model allows several services of different kinds, each with its
 * own fields — only what a kind actually has is shown. What a service says
 * about a single data set (path, batch limits, the GeoJSON feature names, the
 * XMLA mapping and the QGis layer) sits on its configuration in the target
 * model, so it sits on the entry here and not on the data set.
 */
import { computed } from 'vue';
import type { EClass } from '@emfts/core';
import {
  EndpointKind,
  type DataChain,
  type EndpointConfig,
  type EndpointEntry,
} from '../generated';
import {
  ENDPOINT_KINDS,
  addEndpoint,
  buildEndpoint,
  concreteClasses,
  endpointShape,
  removeEndpoint as dropEndpoint,
  setup,
  slugOf,
  syncEndpointEntries,
  touch,
  version,
} from './context';

const setupValue = computed(() => {
  void version.value;
  return setup.value;
});
const endpoints = computed<EndpointConfig[]>(() => setupValue.value?.endpoints ?? []);
const allChains = computed<DataChain[]>(() => setupValue.value?.chains ?? []);
const modelClasses = computed<EClass[]>(() => {
  const pkg = setupValue.value?.modelPackage;
  return pkg ? concreteClasses(pkg) : [];
});

const text = (e: Event) => (e.target as HTMLInputElement).value;
const wert = (e: Event) => (e.target as HTMLSelectElement).value;
const zahl = (e: Event) => {
  const v = Number.parseInt((e.target as HTMLInputElement).value, 10);
  return Number.isFinite(v) ? v : -1;
};

const shapeOf = (endpoint: EndpointConfig) => endpointShape(endpoint.kind);
const removeEndpoint = (endpoint: EndpointConfig) => dropEndpoint(endpoint);

function setEndpoint<K extends keyof EndpointConfig>(
  endpoint: EndpointConfig,
  field: K,
  value: EndpointConfig[K],
) {
  endpoint[field] = value;
  touch();
}

function setEntry<K extends keyof EndpointEntry>(
  entry: EndpointEntry,
  field: K,
  value: EndpointEntry[K],
) {
  entry[field] = value;
  touch();
}

/** Changing the kind drops what the new kind does not know. */
function changeKind(endpoint: EndpointConfig, kind: EndpointKind) {
  endpoint.kind = kind;
  const s = setupValue.value;
  if (s) syncEndpointEntries(s, endpoint);
  touch();
}

const publishes = (endpoint: EndpointConfig, chain: DataChain) =>
  endpoint.chains.length === 0 || endpoint.chains.includes(chain);

function toggleChain(endpoint: EndpointConfig, chain: DataChain, on: boolean) {
  const s = setupValue.value;
  if (!s) return;
  // An empty selection means "all" — the first click has to spell that out
  const current = endpoint.chains.length > 0 ? [...endpoint.chains] : [...s.chains];
  endpoint.chains = on
    ? [...new Set([...current, chain])]
    : current.filter((c) => c !== chain);
  syncEndpointEntries(s, endpoint);
  touch();
}

const classNameOf = (entry: EndpointEntry, feature: 'mapping' | 'layer') =>
  (feature === 'mapping' ? entry.mapping : entry.layer)?.getName() ?? '';

function setClass(entry: EndpointEntry, feature: 'mapping' | 'layer', name: string) {
  const eClass = modelClasses.value.find((c) => c.getName() === name);
  if (feature === 'mapping') entry.mapping = eClass as never;
  else entry.layer = eClass as never;
  touch();
}

function addEndpointOfKind(kind: EndpointKind) {
  const s = setupValue.value;
  if (!s) return;
  addEndpoint(buildEndpoint(slugOf(s.instanceName || 'endpunkt'), s.instanceName, kind));
}

/** What should catch the user's eye before the summary says it harder. */
function hinweise(endpoint: EndpointConfig): string[] {
  void version.value;
  const messages: string[] = [];
  const shape = shapeOf(endpoint);
  if (!endpoint.urlContext?.trim()) messages.push('Kein Basis-Pfad.');
  if (shape.hasEntries && endpoint.entries.length === 0) {
    messages.push('Kein Datensatz — die gewählten Wege haben keinen ausgewählt.');
  }
  if (shape.hasPath) {
    const paths = endpoint.entries.map((e) => e.path);
    for (const twice of new Set(paths.filter((p, i) => p && paths.indexOf(p) !== i))) {
      messages.push(`„${twice}" ist als Pfad mehrfach vergeben.`);
    }
  }
  if (shape.classFeature) {
    const missing = endpoint.entries.filter((e) =>
      shape.classFeature === 'mapping' ? !e.mapping : !e.layer,
    );
    if (missing.length > 0) {
      messages.push(`${missing.length} Datensätze ohne ${shape.classFeature}-Klasse.`);
    }
  }
  return messages;
}
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 1rem; }
h2 { margin: 0; font-size: 1.25rem; }
.lead { margin: 0; color: var(--text-color-secondary, #666); max-width: 46rem; }

.endpunkt {
  border: 1px solid var(--surface-border, #ddd);
  border-radius: 8px;
  padding: 0.7rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.endpunkt > header { display: flex; align-items: center; gap: 0.6rem; }
.endpunkt > header .id { flex: 0 0 14rem; font-family: ui-monospace, monospace; font-weight: 600; }
.endpunkt > header .art { flex: 0 0 12rem; }
.weg { margin-left: auto; background: none; border: none; cursor: pointer; color: var(--text-color-secondary, #888); }
.weg:disabled { opacity: 0.3; cursor: not-allowed; }

fieldset {
  border: 1px solid var(--surface-border, #eee);
  border-radius: 6px;
  padding: 0.5rem 0.7rem;
  margin: 0;
}
legend { font-size: 0.8rem; font-weight: 600; color: var(--text-color-secondary, #666); padding: 0 0.3rem; }
fieldset label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; margin-bottom: 0.4rem; }
fieldset label.check { flex-direction: row; align-items: center; gap: 0.4rem; }
fieldset small { color: var(--text-color-secondary, #888); }

.wege { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.8rem; }
.wege label { flex-direction: row; align-items: center; gap: 0.35rem; margin: 0; }

table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
th, td { padding: 0.3rem 0.45rem; text-align: left; border-bottom: 1px solid var(--surface-border, #eee); }
th { font-weight: 600; background: var(--surface-hover, #f6f6f6); white-space: nowrap; }
td input, td select { width: 100%; }
.tight { width: 6rem; }
.klasse { font-family: ui-monospace, monospace; }

.hinweis { display: flex; align-items: baseline; gap: 0.4rem; margin: 0; font-size: 0.85rem; color: var(--text-color-secondary, #666); }
.probleme { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; color: #8a6d00; }
.aktionen { display: flex; gap: 0.5rem; }
.btn { padding: 0.35rem 0.7rem; border: 1px solid var(--surface-border, #ddd); border-radius: 6px; background: var(--surface-card, #fff); cursor: pointer; }
</style>
