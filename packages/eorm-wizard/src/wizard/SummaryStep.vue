<template>
  <section class="step">
    <h2>Zusammenfassung</h2>

    <template v-if="result">
      <div class="card">
        <dl>
          <dt><i class="pi pi-box" aria-hidden="true"></i> Modell</dt>
          <dd>{{ setupValue?.modelPackage?.getName() }} <small>{{ setupValue?.modelPackage?.getNsURI() }}</small></dd>
          <dt><i class="pi pi-tag" aria-hidden="true"></i> Mapping-Name</dt>
          <dd>{{ setupValue?.mappingName }}</dd>
          <dt><i class="pi pi-database" aria-hidden="true"></i> Schema</dt>
          <dd>{{ setupValue?.schema }}</dd>
          <dt><i class="pi pi-table" aria-hidden="true"></i> Tabellen</dt>
          <dd>{{ tableSummary }}</dd>
          <dt><i class="pi pi-link" aria-hidden="true"></i> Beziehungen</dt>
          <dd>{{ relationCount }}</dd>
        </dl>
      </div>

      <label class="quoting">
        <input
          type="checkbox"
          :checked="setupValue?.delimitedIdentifiers"
          @change="setQuoting($event)"
        />
        Bezeichner in Anführungszeichen setzen
        <small>nötig, wenn Tabellen- oder Spaltennamen SQL-Schlüsselwörter sind (z.&nbsp;B. „order")</small>
      </label>

      <div v-if="result.warnings.length" class="warnbox">
        <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
        <ul>
          <li v-for="(w, i) in result.warnings" :key="i">{{ w }}</li>
        </ul>
      </div>

      <!-- In den Modelatlas veröffentlichen -->
      <div v-if="canPublish" class="publish-card">
        <h4><i class="pi pi-cloud-upload" aria-hidden="true"></i> In den Modelatlas veröffentlichen</h4>
        <div class="publish-row">
          <label>
            Registry
            <select v-model="publishRegistry">
              <option v-for="r in registries" :key="r.name" :value="r.name">{{ r.name }}</option>
            </select>
          </label>
          <label>
            Stage
            <select v-model="publishStage">
              <option v-for="st in writableStages" :key="st.name" :value="st.name">{{ st.name }}</option>
            </select>
          </label>
          <button
            type="button"
            class="btn primary"
            :disabled="publishing || !publishRegistry || !publishStage"
            @click="publish(result.eormFileName, result.eormXmi)"
          >
            <i :class="publishing ? 'pi pi-spinner pi-spin' : 'pi pi-cloud-upload'" aria-hidden="true"></i>
            {{ publishing ? 'Veröffentliche …' : 'Veröffentlichen' }}
          </button>
        </div>
        <p v-if="publishState" class="publish-status" :class="publishState">
          <i :class="publishState === 'ok' ? 'pi pi-check-circle' : 'pi pi-times-circle'" aria-hidden="true"></i>
          {{ publishMessage }}
        </p>
      </div>

      <div class="actions">
        <button type="button" class="btn primary" @click="download(result.eormFileName, result.eormXmi)">
          <i class="pi pi-download" aria-hidden="true"></i>
          Mapping herunterladen
          <span class="filename">{{ result.eormFileName }}</span>
        </button>
      </div>

      <details class="preview">
        <summary><i class="pi pi-code" aria-hidden="true"></i> {{ result.eormFileName }} ansehen</summary>
        <pre>{{ result.eormXmi }}</pre>
      </details>
    </template>

    <p v-else class="error">
      <i class="pi pi-times-circle" aria-hidden="true"></i>
      {{ error }}
    </p>
  </section>
</template>

<script setup lang="ts">
/**
 * Schritt 5: Review, Download und Veröffentlichen des eorm-Mappings.
 * Die Runtime (org.eclipse.fennec.sensinact… bzw. fennec.jpa.EORMLoader) lädt
 * die Datei aus dem Atlas oder vom Dateisystem.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { buildEormXmi } from '../transform/toEorm';
import type { EormResult } from '../transform/toEorm';
import type { AtlasRegistryInfo, AtlasStageInfo } from '../atlas/atlasSource';
import { atlasSource, setup, touch, version } from './context';

const setupValue = computed(() => {
  void version.value;
  return setup.value;
});

// Ergebnis und Fehlermeldung entstehen in einem Rechenschritt und werden
// daraus abgeleitet. Frueher schrieb dieses computed `error.value` selbst —
// ein Seiteneffekt waehrend der Berechnung, den Vue nicht garantiert
// konsistent einordnet (vue/no-side-effects-in-computed-properties).
const berechnet = computed<{ wert: EormResult | undefined; fehler: string }>(() => {
  void version.value;
  if (!setup.value) {
    return { wert: undefined, fehler: 'Es wurde noch kein Modell geladen.' };
  }
  try {
    return { wert: buildEormXmi(setup.value), fehler: '' };
  } catch (e) {
    return { wert: undefined, fehler: e instanceof Error ? e.message : String(e) };
  }
});
const result = computed<EormResult | undefined>(() => berechnet.value.wert);
const error = computed<string>(() => berechnet.value.fehler);

const tableSummary = computed(() => {
  const entities = (setupValue.value?.entities ?? []).filter((e) => e.selected);
  return entities.map((e) => e.tableName).join(', ');
});
const relationCount = computed(() => {
  const entities = (setupValue.value?.entities ?? []).filter((e) => e.selected);
  const count = entities.reduce((n, e) => n + e.relations.filter((r) => r.selected).length, 0);
  return count === 0 ? 'keine' : String(count);
});

function setQuoting(event: Event): void {
  if (!setup.value) return;
  setup.value.delimitedIdentifiers = (event.target as HTMLInputElement).checked;
  touch();
}

// --- Veröffentlichen ---
const registries = ref<AtlasRegistryInfo[]>([]);
const publishRegistry = ref('');
const publishStage = ref('');
const publishing = ref(false);
const publishState = ref<'' | 'ok' | 'error'>('');
const publishMessage = ref('');

const canPublish = computed(() => !!atlasSource.value?.canPublish && registries.value.length > 0);
const writableStages = computed<AtlasStageInfo[]>(
  () =>
    registries.value.find((r) => r.name === publishRegistry.value)?.stages.filter((s) => s.writable) ?? [],
);

onMounted(async () => {
  const source = atlasSource.value;
  if (!source?.canPublish) return;
  try {
    registries.value = await source.listRegistries();
    // Konvention: Mappings liegen in „mappings"
    const preferred = registries.value.find((r) => r.name === 'mappings') ?? registries.value[0];
    if (preferred) {
      publishRegistry.value = preferred.name;
      const stages = preferred.stages.filter((s) => s.writable);
      publishStage.value = (stages.find((s) => !s.final) ?? stages[0])?.name ?? '';
    }
  } catch {
    registries.value = [];
  }
});

watch(publishRegistry, () => {
  const stages = writableStages.value;
  publishStage.value = (stages.find((s) => !s.final) ?? stages[0])?.name ?? '';
});

async function publish(fileName: string, content: string): Promise<void> {
  const source = atlasSource.value;
  if (!source) return;
  publishing.value = true;
  publishState.value = '';
  try {
    await source.publishObject(publishRegistry.value, publishStage.value, fileName, content, {
      name: fileName,
      override: true,
    });
    publishState.value = 'ok';
    publishMessage.value = `${fileName} liegt jetzt in ${publishRegistry.value}/${publishStage.value}.`;
  } catch (e) {
    publishState.value = 'error';
    publishMessage.value = e instanceof Error ? e.message : String(e);
  } finally {
    publishing.value = false;
  }
}

function download(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 1rem; max-width: 56rem; }
.step h2 { margin: 0; font-size: 1.25rem; }
.card, .publish-card {
  border: 1px solid var(--surface-border, #ddd); border-radius: 8px;
  background: var(--surface-card, #fff); padding: 1rem 1.25rem;
}
.publish-card { display: flex; flex-direction: column; gap: 0.6rem; }
.publish-card h4 { margin: 0; display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.95rem; }
.publish-card h4 .pi { color: var(--primary-color, #1a56a0); }
.publish-row { display: flex; align-items: flex-end; gap: 0.75rem; flex-wrap: wrap; }
.publish-row label {
  display: flex; flex-direction: column; gap: 0.3rem;
  font-size: 0.9rem; font-weight: 500; color: var(--text-color-secondary, #666);
}
.publish-row select {
  padding: 0.45rem 0.6rem; font: inherit; border-radius: 6px; cursor: pointer;
  background: var(--input-bg, #fff); color: var(--text-color, inherit);
  border: 1px solid var(--surface-border, #c0c4cc);
}
.publish-status { display: inline-flex; align-items: center; gap: 0.5rem; margin: 0; font-size: 0.9rem; }
.publish-status.ok { color: #2f9e44; }
.publish-status.error { color: #e5484d; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.6rem 1.5rem; margin: 0; }
dt { display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 600; color: var(--text-color-secondary, #666); }
dt .pi { color: var(--primary-color, #1a56a0); font-size: 0.9rem; }
dd { margin: 0; }
dd small { color: var(--text-color-secondary, #888); margin-left: 0.4rem; }
.quoting {
  display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
  font-size: 0.925rem; cursor: pointer;
}
.quoting small { color: var(--text-color-secondary, #666); }
.quoting input { accent-color: var(--primary-color, #1a56a0); width: 1rem; height: 1rem; }
.warnbox {
  display: flex; gap: 0.65rem; align-items: flex-start; padding: 0.75rem 1rem; border-radius: 8px;
  background: color-mix(in srgb, #f5a623 12%, transparent);
  border: 1px solid color-mix(in srgb, #f5a623 45%, transparent);
}
.warnbox .pi { color: #b8860b; margin-top: 0.15rem; }
.warnbox ul { margin: 0; padding-left: 1rem; }
.actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
.btn {
  display: inline-flex; align-items: center; gap: 0.5rem; font: inherit; font-weight: 500;
  padding: 0.55rem 1.1rem; cursor: pointer; border-radius: 6px;
  background: var(--surface-card, #fff); color: var(--text-color, inherit);
  border: 1px solid var(--surface-border, #c0c4cc);
}
.btn.primary {
  background: var(--primary-color, #1a56a0); color: var(--primary-color-text, #fff);
  border-color: var(--primary-color, #1a56a0);
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn .filename { opacity: 0.75; font-weight: 400; font-size: 0.85em; }
.preview summary {
  display: inline-flex; align-items: center; gap: 0.5rem; cursor: pointer;
  color: var(--text-color-secondary, #666);
}
.preview[open] summary { margin-bottom: 0.5rem; }
pre {
  background: var(--surface-section, #f7f7f7); border: 1px solid var(--surface-border, #eee);
  border-radius: 8px; padding: 0.9rem 1rem; overflow: auto; max-height: 26rem;
  font-size: 0.85rem; line-height: 1.45;
}
.error { display: inline-flex; align-items: center; gap: 0.5rem; color: #e5484d; }
</style>
