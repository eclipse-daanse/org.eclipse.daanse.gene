<template>
  <div class="schema-browser">
    <label class="search">
      <i class="pi pi-search" aria-hidden="true"></i>
      <input v-model="query" type="search" placeholder="Modell suchen, z. B. em310" @input="onSearch" />
    </label>

    <p v-if="error" class="error">
      <i class="pi pi-times-circle" aria-hidden="true"></i>
      {{ error }}
    </p>
    <p v-if="loading" class="loading">
      <i class="pi pi-spinner pi-spin" aria-hidden="true"></i> Lade Modelle …
    </p>
    <p v-else-if="filtered.length === 0" class="empty">
      <template v-if="query.trim()">Kein Modell passt zu „{{ query }}“.</template>
      <template v-else>Keine Modelle in dieser Stage gefunden.</template>
    </p>
    <template v-else>
      <p class="result-count">
        {{ filtered.length }} Modell{{ filtered.length === 1 ? '' : 'e' }}
        <template v-if="visible.length < filtered.length"> · {{ visible.length }} angezeigt</template>
      </p>
      <ul class="list">
        <li v-for="s in visible" :key="s.objectId">
          <button type="button" :disabled="loadingSchema === s.nsUri" @click="pick(s)">
            <span class="icon">
              <i :class="loadingSchema === s.nsUri ? 'pi pi-spinner pi-spin' : 'pi pi-box'" aria-hidden="true"></i>
            </span>
            <span class="text">
              <strong>{{ s.name }}</strong>
              <small>{{ s.nsUri }}<template v-if="s.version"> · v{{ s.version }}</template></small>
            </span>
            <i class="pi pi-angle-right chevron" aria-hidden="true"></i>
          </button>
        </li>
      </ul>
      <button v-if="visible.length < filtered.length" type="button" class="btn more" @click="visibleCount += PAGE_SIZE">
        <i class="pi pi-chevron-down" aria-hidden="true"></i>
        Weitere {{ Math.min(PAGE_SIZE, filtered.length - visible.length) }} anzeigen
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Liste/Suche der Sensormodelle einer Atlas-Stage (T10/T11, seit T23/#195 im
 * Dialog). Beim Auswählen werden referenzierte Basis-Modelle automatisch per
 * nsURI nachgeladen.
 */
import { computed, onMounted, ref, watch } from 'vue';
import type { EPackage } from '@emfts/core';
import type { AtlasModelSource, AtlasSchemaInfo } from '../atlas/atlasSource';
import { loadSchemaWithDependencies } from '../atlas/cascadeLoader';

const props = defineProps<{ source: AtlasModelSource }>();
const emit = defineEmits<{
  (e: 'packages-loaded', packages: EPackage[], warnings: string[]): void;
}>();

const PAGE_SIZE = 20;

const schemas = ref<AtlasSchemaInfo[]>([]);
const loading = ref(false);
const loadingSchema = ref('');
const error = ref('');
const query = ref('');
const visibleCount = ref(PAGE_SIZE);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Große Scopes bleiben bedienbar: sofortige clientseitige Filterung über die
 * geladene Liste, serverseitige Suche nachgelagert, schrittweises Einblenden.
 */
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return schemas.value;
  return schemas.value.filter(
    (s) => s.name.toLowerCase().includes(q) || s.nsUri.toLowerCase().includes(q),
  );
});
const visible = computed(() => filtered.value.slice(0, visibleCount.value));

watch(filtered, () => {
  visibleCount.value = PAGE_SIZE;
});
watch(() => props.source, refresh);
onMounted(refresh);

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    schemas.value =
      query.value.trim().length >= 2
        ? await props.source.searchSchemas(query.value.trim())
        : await props.source.listSchemas();
  } catch (e) {
    error.value = toMessage(e);
  } finally {
    loading.value = false;
  }
}

function onSearch(): void {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(refresh, 300);
}

async function pick(schema: AtlasSchemaInfo): Promise<void> {
  error.value = '';
  // Ohne nsURI ist das Schema nicht adressierbar: Der Content-Endpunkt kennt
  // nur nsURIs, mit der objectId antwortet der Server leer (HTTP 204).
  if (!schema.nsUri.includes(':')) {
    error.value =
      `Für „${schema.name}" liefert der Atlas keine nsURI (nur die Objekt-ID ${schema.objectId}) — ` +
      'das Modell lässt sich so nicht laden. Bitte über „Datei / Workspace" laden.';
    return;
  }
  loadingSchema.value = schema.nsUri;
  try {
    const result = await loadSchemaWithDependencies(props.source, schema.nsUri);
    const warnings = result.unresolved.map(
      (ref) =>
        `Referenziertes Modell „${ref}" konnte nicht aus dem Atlas geladen werden — zugehörige Felder fehlen eventuell.`,
    );
    // Nur das gewählte Schema liefert Klassen-Kandidaten; nachgeladene
    // Basis-Modelle sind registriert und für Pfade/Vererbung verfügbar.
    emit('packages-loaded', [result.rootPackage], warnings);
  } catch (e) {
    error.value = toMessage(e);
  } finally {
    loadingSchema.value = '';
  }
}

function toMessage(e: unknown): string {
  if (e instanceof TypeError) return 'Der Atlas-Server ist nicht erreichbar.';
  return e instanceof Error ? e.message : String(e);
}
</script>

<style scoped>
.schema-browser { display: flex; flex-direction: column; gap: 0.7rem; }
.search {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.7rem; border-radius: 6px;
  border: 1px solid var(--input-border, var(--surface-border, #c0c4cc));
  background: var(--input-bg, #fff);
}
.search .pi { color: var(--text-color-muted, #999); }
.search input { flex: 1; border: none; background: none; font: inherit; color: inherit; outline: none; }

.loading, .empty, .result-count { margin: 0; color: var(--text-color-secondary, #666); font-size: 0.9rem; }
.error { display: flex; align-items: center; gap: 0.5rem; margin: 0; color: #e5484d; font-size: 0.9rem; }

.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.list button {
  display: flex; align-items: center; gap: 0.75rem; width: 100%; text-align: left;
  font: inherit; padding: 0.55rem 0.7rem; cursor: pointer;
  border: 1px solid var(--surface-border, #e3e3e3); border-radius: 8px;
  background: var(--surface-card, #fff); color: var(--text-color, inherit);
  transition: border-color 0.15s, background 0.15s;
}
.list button:hover:not(:disabled) {
  border-color: var(--primary-color, #1a56a0);
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 4%, var(--surface-card, #fff));
}
.list button:disabled { opacity: 0.6; cursor: default; }
.icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 2rem; height: 2rem; border-radius: 6px; flex-shrink: 0;
  color: var(--primary-color, #1a56a0);
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 10%, transparent);
}
.text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.text small { color: var(--text-color-secondary, #777); font-size: 0.8rem; overflow-wrap: anywhere; }
.chevron { color: var(--text-color-muted, #bbb); }
.btn {
  display: inline-flex; align-items: center; gap: 0.4rem; align-self: flex-start;
  font: inherit; font-size: 0.9rem; padding: 0.4rem 0.75rem; cursor: pointer;
  border: 1px solid var(--surface-border, #c0c4cc); border-radius: 6px;
  background: var(--surface-card, #fff); color: var(--text-color, inherit);
}
.btn:hover { border-color: var(--primary-color, #1a56a0); }
</style>
