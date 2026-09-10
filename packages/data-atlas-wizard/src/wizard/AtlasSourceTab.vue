<template>
  <div class="atlas-tab">
    <!-- gene-Betrieb: bestehende Verbindungen des Atlas-Browser-Plugins -->
    <template v-if="geneBrowser">
      <div v-if="activeConnections.length === 0" class="infobox">
        <i class="pi pi-info-circle" aria-hidden="true"></i>
        <div>
          <p>Keine aktive Modelatlas-Verbindung.</p>
          <p class="muted">Verbinden Sie sich im Atlas Browser — der Assistent nutzt die bestehende Verbindung.</p>
          <div class="infobox-actions">
            <button v-if="openAtlasBrowser" type="button" class="btn" @click="openAtlasBrowser()">
              <i class="pi pi-globe" aria-hidden="true"></i> Atlas Browser öffnen
            </button>
            <button type="button" class="btn" @click="refreshConnections">
              <i class="pi pi-refresh" aria-hidden="true"></i> Erneut prüfen
            </button>
          </div>
        </div>
      </div>

      <div v-else class="connection-row">
        <label>
          Verbindung
          <select v-model="selectedConnectionId" @change="onConnectionChange">
            <option v-for="c in activeConnections" :key="c.id" :value="c.id">
              {{ c.label }} — Scope „{{ c.scopeName }}“
            </option>
          </select>
        </label>
        <label class="stage">
          Stage
          <input v-model="stage" type="text" placeholder="release" @change="onConnectionChange" />
        </label>
        <span class="badge ok"><i class="pi pi-check" aria-hidden="true"></i> Atlas Browser</span>
      </div>
    </template>

    <!-- Standalone: eigenes Verbindungsformular -->
    <details v-else class="connection" :open="!connected">
      <summary>
        <i class="pi pi-globe" aria-hidden="true"></i>
        <code>{{ connection.baseUrl }}</code>
        <template v-if="connection.scope">
          <span class="crumb">Scope „{{ connection.scope }}“</span>
          <span class="crumb">Stage „{{ connection.stage }}“</span>
        </template>
        <span v-if="connected" class="badge ok"><i class="pi pi-check" aria-hidden="true"></i> verbunden</span>
      </summary>
      <div class="form">
        <label>
          Atlas-URL
          <input v-model="connection.baseUrl" type="url" placeholder="http://localhost:8185/rest" />
        </label>
        <label>
          Zugriffs-Token (optional)
          <input v-model="connection.token" type="password" autocomplete="off" />
        </label>
        <label>
          Scope
          <span class="scope-row">
            <input v-model="connection.scope" type="text" list="atlas-scopes" placeholder="z. B. sensors" />
            <datalist id="atlas-scopes">
              <option v-for="s in scopes" :key="s" :value="s" />
            </datalist>
          </span>
        </label>
        <label>
          Stage
          <input v-model="connection.stage" type="text" placeholder="release" />
        </label>
        <button type="button" class="btn primary" :disabled="connecting" @click="connect">
          <i :class="connecting ? 'pi pi-spinner pi-spin' : 'pi pi-link'" aria-hidden="true"></i>
          {{ connecting ? 'Verbinde …' : 'Verbinden' }}
        </button>
      </div>
    </details>

    <p v-if="error" class="error">
      <i class="pi pi-times-circle" aria-hidden="true"></i>
      {{ error }}
    </p>

    <!-- Schema-Liste -->
    <template v-if="connected">
      <label class="search">
        <i class="pi pi-search" aria-hidden="true"></i>
        <input
          v-model="query"
          type="search"
          placeholder="Modell suchen, z. B. em310"
          @input="onSearch"
        />
      </label>
      <p v-if="loading" class="loading">
        <i class="pi pi-spinner pi-spin" aria-hidden="true"></i> Lade Modelle …
      </p>
      <p v-else-if="filteredSchemas.length === 0" class="empty">
        <template v-if="query.trim()">
          Kein Modell passt zu „{{ query }}“.
        </template>
        <template v-else>Keine Modelle gefunden (Stage „{{ effectiveStage }}“).</template>
      </p>
      <template v-else>
        <p class="result-count">
          {{ filteredSchemas.length }} Modell{{ filteredSchemas.length === 1 ? '' : 'e' }}
          <template v-if="visibleSchemas.length < filteredSchemas.length">
            · {{ visibleSchemas.length }} angezeigt
          </template>
        </p>
        <ul class="schema-list">
          <li v-for="s in visibleSchemas" :key="s.objectId">
          <button type="button" :disabled="loadingSchema === s.nsUri" @click="pick(s)">
            <span class="schema-icon">
              <i :class="loadingSchema === s.nsUri ? 'pi pi-spinner pi-spin' : 'pi pi-box'" aria-hidden="true"></i>
            </span>
            <span class="schema-text">
              <strong>{{ s.name }}</strong>
              <small>{{ s.nsUri }}<template v-if="s.version"> · v{{ s.version }}</template></small>
            </span>
            <i class="pi pi-angle-right chevron" aria-hidden="true"></i>
          </button>
          </li>
        </ul>
        <button
          v-if="visibleSchemas.length < filteredSchemas.length"
          type="button"
          class="btn more"
          @click="visibleCount += PAGE_SIZE"
        >
          <i class="pi pi-chevron-down" aria-hidden="true"></i>
          Weitere {{ Math.min(PAGE_SIZE, filteredSchemas.length - visibleSchemas.length) }} anzeigen
        </button>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Modelatlas-Quelle (T10/T11): Schema-Liste/-Suche und Auswahl mit
 * automatischem Nachladen referenzierter Modelle.
 *
 * Im gene-Betrieb wird KEINE eigene Verbindung aufgebaut: Der Tab nutzt die
 * bestehenden Verbindungen des Atlas-Browser-Plugins (Service
 * `gene.atlas.browser`: `connections` + `getClient(id)` liefert den echten
 * ModelAtlasClient). Nur standalone greift das eigene Verbindungsformular.
 */
import { computed, inject, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import type { Ref } from 'vue';
import type { EPackage } from '@emfts/core';
import { createAtlasClient } from '../atlas/clientFactory';
import type { AtlasReadClient } from '../atlas/ModelAtlasClient';
import {
  AtlasModelSource,
  loadStoredConnection,
  storeConnection,
} from '../atlas/atlasSource';
import type { AtlasSchemaInfo } from '../atlas/atlasSource';
import { loadSchemaWithDependencies } from '../atlas/cascadeLoader';
import { atlasSource as sharedAtlasSource } from './context';

import type { ModelSourcePayload } from './modelSource';

const emit = defineEmits<{
  (e: 'packages-loaded', payload: ModelSourcePayload): void;
}>();

/** Sicht auf die Atlas-Browser-Verbindung (Struktur siehe gene/atlas-browser). */
interface BrowserConnection {
  id: string;
  label: string;
  baseUrl: string;
  scopeName: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
}
interface GeneAtlasBrowser {
  connections: Ref<BrowserConnection[]>;
  getClient(connectionId: string): AtlasReadClient | undefined;
}

const tsm = inject<{ getService?: (id: string) => unknown } | undefined>('tsm', undefined);
const geneBrowser = (tsm?.getService?.('gene.atlas.browser') ?? null) as GeneAtlasBrowser | null;
const openAtlasBrowser = (tsm?.getService?.('ui.atlas-browser.open') ?? null) as
  | (() => void)
  | null;

// --- gemeinsamer Zustand ---
const connected = ref(false);
const error = ref('');
const schemas = ref<AtlasSchemaInfo[]>([]);
const loading = ref(false);
const loadingSchema = ref('');
const query = ref('');
const source = shallowRef<AtlasModelSource>();
let searchTimer: ReturnType<typeof setTimeout> | undefined;

// --- gene-Betrieb: Verbindungen des Atlas Browsers ---
const connectionsTick = ref(0);
const activeConnections = computed<BrowserConnection[]>(() => {
  void connectionsTick.value;
  return (geneBrowser?.connections.value ?? []).filter((c) => c.status === 'connected');
});
const selectedConnectionId = ref('');
const stage = ref('release');
const effectiveStage = computed(() =>
  geneBrowser ? stage.value.trim() || 'release' : connection.stage.trim() || 'release',
);

function refreshConnections(): void {
  connectionsTick.value++;
  if (!selectedConnectionId.value && activeConnections.value.length) {
    selectedConnectionId.value = activeConnections.value[0].id;
    onConnectionChange();
  }
}

// Taucht eine Verbindung auf (Atlas Browser verbindet, während dieser Tab
// offen ist), automatisch vorauswählen — die Infobox verschwindet reaktiv,
// ohne watch bliebe die Schema-Liste leer.
watch(activeConnections, (connections) => {
  if (!selectedConnectionId.value && connections.length) {
    selectedConnectionId.value = connections[0].id;
    onConnectionChange();
  } else if (selectedConnectionId.value && !connections.some((c) => c.id === selectedConnectionId.value)) {
    selectedConnectionId.value = '';
    connected.value = false;
    schemas.value = [];
  }
});

async function onConnectionChange(): Promise<void> {
  error.value = '';
  const conn = activeConnections.value.find((c) => c.id === selectedConnectionId.value);
  const client = conn ? geneBrowser?.getClient(conn.id) : undefined;
  if (!conn || !client) {
    connected.value = false;
    return;
  }
  source.value = new AtlasModelSource(client, conn.scopeName, effectiveStage.value);
  sharedAtlasSource.value = source.value;
  connected.value = true;
  await refreshList();
}

// --- Standalone: eigenes Formular + eigener Client ---
const connection = reactive(loadStoredConnection());
const connecting = ref(false);
const scopes = ref<string[]>([]);

function newStandaloneSource(): AtlasModelSource {
  const client = createAtlasClient({
    baseUrl: connection.baseUrl,
    token: connection.token || undefined,
  });
  return new AtlasModelSource(client, connection.scope.trim(), effectiveStage.value);
}

async function connect(): Promise<void> {
  error.value = '';
  connecting.value = true;
  connected.value = false;
  try {
    const probe = newStandaloneSource();
    scopes.value = await probe.listScopes();
    if (scopes.value.length === 0) {
      throw new Error('Der Atlas-Server ist erreichbar, liefert aber keine Scopes.');
    }
    if (!connection.scope.trim()) {
      connection.scope = scopes.value[0];
    }
    source.value = newStandaloneSource();
    sharedAtlasSource.value = source.value;
    await refreshList();
    connected.value = true;
    storeConnection({ ...connection });
  } catch (e) {
    error.value = toMessage(e);
  } finally {
    connecting.value = false;
  }
}

// --- Liste / Suche / Auswahl (beide Betriebsarten) ---
async function refreshList(): Promise<void> {
  if (!source.value) return;
  loading.value = true;
  try {
    schemas.value = query.value.trim().length >= 2
      ? await source.value.searchSchemas(query.value.trim())
      : await source.value.listSchemas();
  } catch (e) {
    error.value = toMessage(e);
  } finally {
    loading.value = false;
  }
}

/**
 * Große Scopes bleiben bedienbar: sofortige clientseitige Filterung über die
 * geladene Liste, serverseitige Suche nachgelagert (entlastet bei Scopes, die
 * mehr Modelle enthalten als eine Antwortseite fasst), und schrittweises
 * Einblenden statt einer endlos langen Liste.
 */
const PAGE_SIZE = 20;
const visibleCount = ref(PAGE_SIZE);

const filteredSchemas = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return schemas.value;
  return schemas.value.filter(
    (s) => s.name.toLowerCase().includes(q) || s.nsUri.toLowerCase().includes(q),
  );
});
const visibleSchemas = computed(() => filteredSchemas.value.slice(0, visibleCount.value));

watch([filteredSchemas, () => query.value], () => {
  visibleCount.value = PAGE_SIZE;
});

function onSearch(): void {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(refreshList, 300);
}

async function pick(schema: AtlasSchemaInfo): Promise<void> {
  if (!source.value) return;
  error.value = '';
  loadingSchema.value = schema.nsUri;
  try {
    const result = await loadSchemaWithDependencies(source.value, schema.nsUri);
    const warnings = result.unresolved.map(
      (ref) => `Referenziertes Modell „${ref}" konnte nicht aus dem Atlas geladen werden — zugehörige Felder fehlen eventuell.`,
    );
    /*
     * Nur das gewählte Schema liefert Kandidaten für Datensätze; die
     * nachgeladenen Basis-Modelle reisen als `all` mit, damit der Datei-Modus
     * auch für sie einen Pfad kennt. Dateinamen liefert der Atlas nicht — im
     * Datei-Modus greift dann die Ableitung `model/<Paketname>.ecore`.
     */
    emit('packages-loaded', {
      candidates: [result.rootPackage],
      all: result.loadedPackages,
      warnings,
    });
  } catch (e) {
    error.value = toMessage(e);
  } finally {
    loadingSchema.value = '';
  }
}

function toMessage(e: unknown): string {
  if (e instanceof TypeError) {
    return 'Der Atlas-Server ist nicht erreichbar.';
  }
  return e instanceof Error ? e.message : String(e);
}

onMounted(() => {
  if (geneBrowser) refreshConnections();
});
</script>

<style scoped>
.atlas-tab { display: flex; flex-direction: column; gap: 0.85rem; max-width: 44rem; }

/* Hinweis bei fehlender Verbindung (gene) */
.infobox {
  display: flex; gap: 0.65rem; align-items: flex-start;
  padding: 0.9rem 1rem; border-radius: 8px;
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary-color, #1a56a0) 30%, transparent);
}
.infobox .pi-info-circle { color: var(--primary-color, #1a56a0); margin-top: 0.15rem; }
.infobox p { margin: 0 0 0.25rem; }
.infobox .muted { color: var(--text-color-secondary, #666); font-size: 0.9rem; }
.infobox-actions { display: flex; gap: 0.5rem; margin-top: 0.6rem; }

/* Verbindungs-Auswahl (gene) */
.connection-row {
  display: flex; align-items: flex-end; gap: 0.75rem; flex-wrap: wrap;
  padding: 0.65rem 0.9rem;
  border: 1px solid var(--surface-border, #ddd); border-radius: 8px;
  background: var(--surface-card, #fff);
}
.connection-row label {
  display: flex; flex-direction: column; gap: 0.3rem;
  font-size: 0.9rem; color: var(--text-color-secondary, #666); font-weight: 500;
  flex: 1; min-width: 14rem;
}
.connection-row label.stage { flex: 0 0 7rem; min-width: 7rem; }
.connection-row select, .connection-row input {
  padding: 0.45rem 0.6rem; font: inherit; border-radius: 6px;
  border: 1px solid var(--input-border, var(--surface-border, #c0c4cc));
  background: var(--input-bg, #fff);
  color: var(--input-text, var(--text-color, inherit));
}
.connection-row .badge { margin-bottom: 0.5rem; }

/* Verbindung als Karte (standalone) */
.connection {
  border: 1px solid var(--surface-border, #ddd);
  border-radius: 8px;
  background: var(--surface-card, #fff);
  padding: 0.65rem 0.9rem;
}
.connection summary {
  display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
  cursor: pointer; list-style: none;
}
.connection summary::-webkit-details-marker { display: none; }
.connection summary .pi-globe { color: var(--primary-color, #1a56a0); }
.connection code { font-size: 0.9em; }
.crumb { color: var(--text-color-secondary, #666); font-size: 0.9rem; }
.badge {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600;
  margin-left: auto;
}
.badge.ok {
  color: #2f9e44;
  background: color-mix(in srgb, #2f9e44 12%, transparent);
}
.badge .pi { font-size: 0.7rem; }

.form {
  display: grid; grid-template-columns: repeat(2, minmax(12rem, 1fr));
  gap: 0.75rem; padding-top: 0.9rem;
}
.form label {
  display: flex; flex-direction: column; gap: 0.3rem;
  font-size: 0.9rem; color: var(--text-color-secondary, #666); font-weight: 500;
}
.form input {
  padding: 0.45rem 0.6rem; font: inherit; border-radius: 6px;
  border: 1px solid var(--input-border, var(--surface-border, #c0c4cc));
  background: var(--input-bg, #fff);
  color: var(--input-text, var(--text-color, inherit));
}
.form input:focus-visible { outline: none; border-color: var(--primary-color, #1a56a0); }
.form button { grid-column: 1 / -1; justify-self: start; }

/* Suche */
.search {
  position: relative; display: flex; align-items: center; max-width: 26rem;
}
.search .pi-search {
  position: absolute; left: 0.7rem;
  color: var(--text-color-muted, #999); font-size: 0.85rem; pointer-events: none;
}
.search input {
  width: 100%; padding: 0.5rem 0.7rem 0.5rem 2.1rem; font: inherit; border-radius: 6px;
  border: 1px solid var(--input-border, var(--surface-border, #c0c4cc));
  background: var(--input-bg, #fff);
  color: var(--input-text, var(--text-color, inherit));
}
.search input:focus-visible { outline: none; border-color: var(--primary-color, #1a56a0); }

.loading, .empty { color: var(--text-color-secondary, #666); margin: 0; display: inline-flex; gap: 0.5rem; align-items: center; }

.result-count { margin: 0; font-size: 0.85rem; color: var(--text-color-secondary, #666); }

/* Schema-Karten */
.schema-list {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: 0.4rem;
  max-height: 22rem; overflow-y: auto;
}
.btn.more { align-self: flex-start; padding: 0.4rem 0.9rem; font-size: 0.9rem; }
.schema-list button {
  width: 100%; display: flex; align-items: center; gap: 0.75rem; text-align: left;
  padding: 0.65rem 0.85rem; font: inherit; cursor: pointer;
  border: 1px solid var(--surface-border, #ddd); border-radius: 8px;
  background: var(--surface-card, #fff);
  color: var(--text-color, inherit);
  transition: border-color 0.15s, background 0.15s;
}
.schema-list button:hover:not(:disabled) {
  border-color: var(--primary-color, #1a56a0);
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 4%, var(--surface-card, #fff));
}
.schema-list button:disabled { cursor: progress; }
.schema-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 2.1rem; height: 2.1rem; border-radius: 6px; flex-shrink: 0;
  color: var(--primary-color, #1a56a0);
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 10%, transparent);
}
.schema-text { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
.schema-text small {
  color: var(--text-color-secondary, #666);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.chevron { margin-left: auto; color: var(--text-color-muted, #bbb); }

.btn {
  display: inline-flex; align-items: center; gap: 0.5rem;
  font: inherit; font-weight: 500; padding: 0.5rem 1.1rem; cursor: pointer;
  border-radius: 6px; border: 1px solid var(--surface-border, #c0c4cc);
  background: var(--surface-card, #fff); color: var(--text-color, inherit);
}
.btn:hover:not(:disabled) { background: var(--surface-hover, #f0f0f0); }
.btn.primary {
  background: var(--primary-color, #1a56a0);
  color: var(--primary-color-text, #fff);
  border-color: var(--primary-color, #1a56a0);
}
.btn.primary:hover:not(:disabled) { background: var(--primary-color-hover, #1a56a0); }
.btn:disabled { opacity: 0.6; cursor: progress; }
.btn .pi { font-size: 0.85rem; }

.error { display: inline-flex; align-items: center; gap: 0.5rem; margin: 0; color: #e5484d; }
</style>
