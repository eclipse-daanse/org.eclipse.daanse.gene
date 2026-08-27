<template>
  <div class="mapping-browser">
    <div class="target-row">
      <label>
        Registry
        <select v-model="registry">
          <option v-for="r in registries" :key="r.name" :value="r.name">
            {{ r.name }}<template v-if="r.description"> — {{ r.description }}</template>
          </option>
        </select>
      </label>
      <label>
        Stage
        <select v-model="stage">
          <option v-for="st in stages" :key="st.name" :value="st.name">
            {{ st.name }}{{ st.final ? ' (final)' : '' }}
          </option>
        </select>
      </label>
      <button type="button" class="btn" :disabled="loading" @click="refresh">
        <i :class="loading ? 'pi pi-spinner pi-spin' : 'pi pi-refresh'" aria-hidden="true"></i>
        Aktualisieren
      </button>
    </div>

    <p v-if="error" class="error">
      <i class="pi pi-times-circle" aria-hidden="true"></i>
      {{ error }}
    </p>

    <label v-if="objects.length > PAGE_SIZE || query" class="search">
      <i class="pi pi-search" aria-hidden="true"></i>
      <input v-model="query" type="search" placeholder="Mapping suchen …" />
    </label>

    <p v-if="loading" class="loading">
      <i class="pi pi-spinner pi-spin" aria-hidden="true"></i> Lade Mappings …
    </p>
    <p v-else-if="filtered.length === 0" class="empty">
      <template v-if="query.trim()">Kein Mapping passt zu „{{ query }}“.</template>
      <template v-else>
        In „{{ registry }}/{{ stage }}“ liegen noch keine Mappings.
      </template>
    </p>
    <template v-else>
      <p class="result-count">
        {{ filtered.length }} Objekt{{ filtered.length === 1 ? '' : 'e' }}
        <template v-if="visible.length < filtered.length">
          · {{ visible.length }} angezeigt
        </template>
      </p>
      <ul class="object-list">
        <li v-for="o in visible" :key="o.objectId">
          <button type="button" :disabled="!!opening" @click="open(o)">
            <span class="object-icon">
              <i
                :class="opening === o.objectId ? 'pi pi-spinner pi-spin' : iconFor(o)"
                aria-hidden="true"
              ></i>
            </span>
            <span class="object-text">
              <strong>{{ o.name }}</strong>
              <small>
                {{ o.objectId }}
                <template v-if="o.version"> · v{{ o.version }}</template>
                <template v-if="o.uploadTime"> · {{ o.uploadTime }}</template>
              </small>
            </span>
            <i class="pi pi-angle-right chevron" aria-hidden="true"></i>
          </button>
        </li>
      </ul>
      <button
        v-if="visible.length < filtered.length"
        type="button"
        class="btn more"
        @click="visibleCount += PAGE_SIZE"
      >
        <i class="pi pi-chevron-down" aria-hidden="true"></i>
        Weitere {{ Math.min(PAGE_SIZE, filtered.length - visible.length) }} anzeigen
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Bestehende Mappings einer Registry-Stage auflisten und öffnen (T19/#190).
 * Die Atlas-Verbindung kommt aus dem Wizard-Kontext (AtlasConnectionBar), damit es
 * nur EINE Verbindungslogik gibt.
 */
import { computed, onMounted, ref, watch } from 'vue';
import type { AtlasModelSource, AtlasObjectInfo, AtlasRegistryInfo } from '../atlas/atlasSource';
import { openMappingFromAtlas } from './openMapping';

const props = defineProps<{ source: AtlasModelSource }>();
const emit = defineEmits<{ (e: 'opened', warnings: string[]): void }>();

const PAGE_SIZE = 20;

const registries = ref<AtlasRegistryInfo[]>([]);
const registry = ref('');
const stage = ref('');
const objects = ref<AtlasObjectInfo[]>([]);
const loading = ref(false);
const opening = ref('');
const error = ref('');
const query = ref('');
const visibleCount = ref(PAGE_SIZE);

const stages = computed(
  () => registries.value.find((r) => r.name === registry.value)?.stages ?? [],
);
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return objects.value;
  return objects.value.filter(
    (o) => o.name.toLowerCase().includes(q) || o.objectId.toLowerCase().includes(q),
  );
});
const visible = computed(() => filtered.value.slice(0, visibleCount.value));

watch(filtered, () => {
  visibleCount.value = PAGE_SIZE;
});

/** Profil-/Regel-Objekte sind sichtbar, aber als andere Art erkennbar. */
function iconFor(object: AtlasObjectInfo): string {
  if (object.objectType === 'MappingProfile') return 'pi pi-sitemap';
  if (object.objectType === 'PersistenceRuleRegistry') return 'pi pi-database';
  return 'pi pi-file-edit';
}

onMounted(load);
watch(() => props.source, load);

async function load(): Promise<void> {
  error.value = '';
  try {
    registries.value = await props.source.listRegistries();
    // Registry-Namen sind serverabhängig („mappings" im Mock,
    // „sensinactmapping" im Fennec-Atlas) — alles mit „mapping" im Namen zählt.
    const preferred =
      registries.value.find((r) => /mapping/i.test(r.name)) ?? registries.value[0];
    registry.value = preferred?.name ?? '';
    stage.value = preferred ? await stageWithObjects(preferred) : '';
    await refresh();
  } catch (e) {
    error.value = toMessage(e);
  }
}

/**
 * Erste Stage, in der Objekte liegen. Der Fennec-Atlas hält freigegebene
 * Mappings in „release" (final) — eine Vorauswahl auf die schreibbare Stage
 * zeigte dort eine leere Liste.
 */
async function stageWithObjects(reg: AtlasRegistryInfo): Promise<string> {
  for (const st of reg.stages) {
    try {
      if ((await props.source.listObjects(reg.name, st.name)).length) return st.name;
    } catch {
      /* Stage nicht lesbar — nächste probieren */
    }
  }
  return (reg.stages.find((st) => st.writable) ?? reg.stages[0])?.name ?? '';
}

watch(registry, async (name) => {
  const reg = registries.value.find((r) => r.name === name);
  stage.value = reg ? await stageWithObjects(reg) : '';
});
watch(stage, refresh);

async function refresh(): Promise<void> {
  if (!registry.value || !stage.value) {
    objects.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    objects.value = await props.source.listObjects(registry.value, stage.value);
  } catch (e) {
    error.value = toMessage(e);
    objects.value = [];
  } finally {
    loading.value = false;
  }
}

async function open(object: AtlasObjectInfo): Promise<void> {
  error.value = '';
  opening.value = object.objectId;
  try {
    const result = await openMappingFromAtlas({
      source: props.source,
      registry: registry.value,
      stage: stage.value,
      object,
    });
    emit('opened', result.warnings);
  } catch (e) {
    error.value = toMessage(e);
  } finally {
    opening.value = '';
  }
}

function toMessage(e: unknown): string {
  if (e instanceof TypeError) return 'Der Atlas-Server ist nicht erreichbar.';
  return e instanceof Error ? e.message : String(e);
}
</script>

<style scoped>
.mapping-browser { display: flex; flex-direction: column; gap: 0.75rem; max-width: 44rem; }

.target-row { display: flex; align-items: flex-end; gap: 0.75rem; flex-wrap: wrap; }
.target-row label {
  display: flex; flex-direction: column; gap: 0.3rem;
  font-size: 0.9rem; font-weight: 500; color: var(--text-color-secondary, #666);
}
select {
  padding: 0.4rem 0.6rem; font: inherit; border-radius: 6px; cursor: pointer;
  background: var(--input-bg, #fff);
  color: var(--input-text, var(--text-color, inherit));
  border: 1px solid var(--input-border, var(--surface-border, #c0c4cc));
}
select:focus-visible { outline: none; border-color: var(--primary-color, #1a56a0); }

.btn {
  display: inline-flex; align-items: center; gap: 0.4rem;
  font: inherit; padding: 0.45rem 0.85rem; cursor: pointer;
  border: 1px solid var(--surface-border, #c0c4cc); border-radius: 6px;
  background: var(--surface-card, #fff); color: var(--text-color, inherit);
}
.btn:hover:not(:disabled) { border-color: var(--primary-color, #1a56a0); }
.btn:disabled { opacity: 0.6; cursor: default; }
.btn.more { align-self: flex-start; }

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

.object-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.object-list button {
  display: flex; align-items: center; gap: 0.75rem; width: 100%; text-align: left;
  font: inherit; padding: 0.55rem 0.7rem; cursor: pointer;
  border: 1px solid var(--surface-border, #e3e3e3); border-radius: 8px;
  background: var(--surface-card, #fff); color: var(--text-color, inherit);
  transition: border-color 0.15s, background 0.15s;
}
.object-list button:hover:not(:disabled) {
  border-color: var(--primary-color, #1a56a0);
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 4%, var(--surface-card, #fff));
}
.object-list button:disabled { opacity: 0.6; cursor: default; }
.object-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 2rem; height: 2rem; border-radius: 6px; flex-shrink: 0;
  color: var(--primary-color, #1a56a0);
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 10%, transparent);
}
.object-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.object-text small { color: var(--text-color-secondary, #777); font-size: 0.8rem; overflow-wrap: anywhere; }
.chevron { color: var(--text-color-muted, #bbb); }
</style>
