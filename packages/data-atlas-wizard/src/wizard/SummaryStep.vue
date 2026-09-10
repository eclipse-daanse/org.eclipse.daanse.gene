<template>
  <section class="step">
    <h2>Zusammenfassung</h2>

    <div v-if="fehler.length" class="fehlerbox">
      <p><i class="pi pi-times-circle" aria-hidden="true"></i> So lässt sich die Konfiguration nicht schreiben:</p>
      <ul>
        <li v-for="(f, i) in fehler" :key="i">{{ f }}</li>
      </ul>
    </div>

    <template v-if="ergebnis">
      <div class="card">
        <dl>
          <dt><i class="pi pi-box" aria-hidden="true"></i> Modell</dt>
          <dd>
            {{ setupValue?.modelPackage?.getName() }}
            <small>{{ setupValue?.modelPackage?.getNsURI() }}</small>
          </dd>
          <dt><i class="pi pi-server" aria-hidden="true"></i> Instanz</dt>
          <dd>{{ setupValue?.instanceName }}</dd>
          <dt><i class="pi pi-file" aria-hidden="true"></i> Ablage</dt>
          <dd>{{ modusText }}</dd>
          <dt><i class="pi pi-database" aria-hidden="true"></i> Datenquelle</dt>
          <dd>{{ quelleText }}</dd>
          <dt><i class="pi pi-list" aria-hidden="true"></i> Datensätze</dt>
          <dd>{{ datensatzText }}</dd>
          <dt><i class="pi pi-link" aria-hidden="true"></i> Endpunkt</dt>
          <dd>{{ setupValue?.urlContext }}</dd>
          <dt><i class="pi pi-download" aria-hidden="true"></i> Formate</dt>
          <dd>{{ formatText }}</dd>
        </dl>
      </div>

      <div v-if="ergebnis.warnings.length" class="warnbox">
        <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
        <ul>
          <li v-for="(w, i) in ergebnis.warnings" :key="i">{{ w }}</li>
        </ul>
      </div>

      <div class="aktionen">
        <button type="button" class="btn primary" @click="herunterladen()">
          <i class="pi pi-download" aria-hidden="true"></i>
          Konfiguration herunterladen
          <span class="dateiname">{{ ergebnis.fileName }}</span>
        </button>
        <button type="button" class="btn" @click="zeigeVorschau = !zeigeVorschau">
          <i :class="zeigeVorschau ? 'pi pi-eye-slash' : 'pi pi-eye'" aria-hidden="true"></i>
          {{ zeigeVorschau ? 'Vorschau ausblenden' : 'XMI ansehen' }}
        </button>
      </div>

      <pre v-if="zeigeVorschau" class="vorschau">{{ ergebnis.xmi }}</pre>

      <!-- In einen Model-Atlas-Scope veröffentlichen -->
      <div v-if="quelle" class="publish-card">
        <h4><i class="pi pi-cloud-upload" aria-hidden="true"></i> In den Model Atlas veröffentlichen</h4>

        <p v-if="!quelle.canPublish" class="hinweis">
          Dieser Zugang darf nicht schreiben — bitte im Schritt „Modell" eine
          Verbindung mit Schreibrecht wählen.
        </p>

        <template v-else>
          <div class="publish-row">
            <label>
              Registry
              <select v-model="registry">
                <option v-for="r in registries" :key="r.name" :value="r.name">{{ r.name }}</option>
              </select>
            </label>
            <label>
              Stage
              <select v-model="stage">
                <option v-for="st in stages" :key="st" :value="st">{{ st }}</option>
              </select>
            </label>
            <label>
              Objekt-id
              <input type="text" v-model="objektId" />
            </label>
          </div>

          <label class="wechsel">
            <input type="checkbox" v-model="mitWechsel" :disabled="!zielStage" />
            Anschließend nach <strong>{{ zielStage || '—' }}</strong> schieben
            <small>der Data Atlas liest die finale Stage</small>
          </label>

          <button
            type="button"
            class="btn primary"
            :disabled="laeuft || !registry || !stage || !objektId"
            @click="veroeffentlichen()"
          >
            <i :class="laeuft ? 'pi pi-spinner pi-spin' : 'pi pi-cloud-upload'" aria-hidden="true"></i>
            Veröffentlichen
          </button>

          <ol v-if="schritte.length" class="fortschritt">
            <li v-for="(sch, i) in schritte" :key="i" :class="sch.state">
              <i :class="symbol(sch.state)" aria-hidden="true"></i>
              <span>{{ sch.label }}</span>
              <small v-if="sch.detail">{{ sch.detail }}</small>
            </li>
          </ol>

          <p v-if="publishFehler" class="publish-fehler">{{ publishFehler }}</p>
          <p v-else-if="fertig" class="publish-ok">
            <i class="pi pi-check-circle" aria-hidden="true"></i>
            Veröffentlicht. Der Data Atlas übernimmt sie beim nächsten Abgleich.
          </p>
        </template>
      </div>

      <p v-else class="naechster-schritt">
        <i class="pi pi-info-circle" aria-hidden="true"></i>
        Zum Veröffentlichen im Schritt „Modell" einen Model Atlas verbinden.
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * Schritt 7: Prüfliste, XMI-Vorschau und Download.
 *
 * Die Konfiguration wird hier erzeugt — in einem `computed`, damit ein Fehler
 * aus dem Transformer als Meldung erscheint statt als Absturz. Das
 * Veröffentlichen in den Model Atlas folgt in Schritt 10 der
 * Umsetzungsreihenfolge.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { ConfigMode, InputKind, MappingKind } from '../generated';
import { atlasSource, setup, version } from './context';
import { buildDataAtlasXmi, type DataAtlasResult } from '../transform/toDataAtlasConfig';
import { findErrors } from '../transform/validate';
import { requiredSchemas } from '../transform/requiredSchemas';
import { publishConfiguration, type PublishStep } from '../atlas/publish';
import type { AtlasRegistryInfo } from '../atlas/atlasSource';

const zeigeVorschau = ref(false);

const setupValue = computed(() => {
  void version.value;
  return setup.value;
});

const fehler = computed<string[]>(() => {
  void version.value;
  return setup.value ? findErrors(setup.value) : ['Es ist noch kein Modell gewählt.'];
});

/** Erzeugt die Konfiguration — Fehler landen in der Liste darüber. */
const ergebnis = computed<DataAtlasResult | null>(() => {
  void version.value;
  const s = setup.value;
  if (!s || fehler.value.length > 0) return null;
  try {
    return buildDataAtlasXmi(s);
  } catch (e) {
    return {
      xmi: '',
      fileName: '',
      warnings: [e instanceof Error ? e.message : String(e)],
    };
  }
});

const modusText = computed(() => {
  void version.value;
  return setup.value?.configMode === ConfigMode.ATLAS
    ? 'Model-Atlas-Scope (nsURI-Verweise)'
    : 'Datei neben den Modellen (relative Verweise)';
});

const quelleText = computed(() => {
  void version.value;
  const s = setup.value;
  if (!s) return '';
  if (s.inputKind === InputKind.FILE) return `Datei ${s.fileSource?.fileUri ?? ''}`;
  const art =
    s.databaseSource?.mappingKind === MappingKind.IMPORTED
      ? 'importiertes Mapping'
      : 'abgeleitetes Mapping';
  return `Datenbank ${s.databaseSource?.dataSourceFilter ?? ''} (${art})`;
});

const datensatzText = computed(() => {
  void version.value;
  const ausgewaehlt = setup.value?.datasets.filter((d) => d.selected) ?? [];
  if (ausgewaehlt.length === 0) return 'keine';
  return `${ausgewaehlt.length}: ${ausgewaehlt.map((d) => d.id).join(', ')}`;
});

const formatText = computed(() => {
  void version.value;
  const gewaehlt = setup.value?.exports.filter((e) => e.selected) ?? [];
  return gewaehlt.length === 0
    ? 'Vorgaben des Data Atlas (JSON, XML)'
    : gewaehlt.map((e) => e.kind).join(', ');
});

// ── Veröffentlichen ────────────────────────────────────────────────────────
const quelle = computed(() => atlasSource.value);
const registries = ref<AtlasRegistryInfo[]>([]);
const registry = ref('');
const stage = ref('');
const objektId = ref('dataatlas');
const mitWechsel = ref(true);
const schritte = ref<PublishStep[]>([]);
const laeuft = ref(false);
const publishFehler = ref('');
const fertig = ref(false);

/** Die Stages der gewählten Registry — Namen werden nie angenommen. */
const stages = computed<string[]>(() => {
  const gewaehlt = registries.value.find((r) => r.name === registry.value);
  return (gewaehlt?.stages ?? []).map((st) => st.name);
});

/** Die Stage nach der gewählten — dorthin wird geschoben. */
const zielStage = computed<string>(() => {
  const alle = stages.value;
  const i = alle.indexOf(stage.value);
  return i >= 0 && i + 1 < alle.length ? alle[i + 1] : '';
});

async function ladeZiele(): Promise<void> {
  const source = quelle.value;
  if (!source) return;
  try {
    registries.value = await source.listRegistries();
    // Erste beschreibbare Registry/Stage vorschlagen
    const erste = registries.value[0];
    if (erste && !registry.value) {
      registry.value = erste.name;
      stage.value = erste.stages[0]?.name ?? '';
    }
  } catch (e) {
    publishFehler.value = e instanceof Error ? e.message : String(e);
  }
}

onMounted(ladeZiele);
watch(quelle, ladeZiele);
watch(registry, () => {
  if (!stages.value.includes(stage.value)) stage.value = stages.value[0] ?? '';
});

const symbol = (state: PublishStep['state']) =>
  ({
    offen: 'pi pi-circle',
    laeuft: 'pi pi-spinner pi-spin',
    fertig: 'pi pi-check',
    uebersprungen: 'pi pi-minus',
    fehler: 'pi pi-times',
  })[state];

async function veroeffentlichen(): Promise<void> {
  const source = quelle.value;
  const daten = ergebnis.value;
  const s = setup.value;
  if (!source || !daten?.xmi || !s) return;

  laeuft.value = true;
  publishFehler.value = '';
  fertig.value = false;
  schritte.value = [];
  try {
    await publishConfiguration(
      source,
      {
        registry: registry.value,
        stage: stage.value,
        targetStage: mitWechsel.value ? zielStage.value || undefined : undefined,
        objectId: objektId.value,
        objectName: s.instanceName,
      },
      requiredSchemas(s),
      daten.xmi,
      { onProgress: (aktuell) => (schritte.value = aktuell) },
    );
    fertig.value = true;
  } catch (e) {
    publishFehler.value = e instanceof Error ? e.message : String(e);
  } finally {
    laeuft.value = false;
  }
}

function herunterladen(): void {
  const daten = ergebnis.value;
  if (!daten?.xmi) return;
  const blob = new Blob([daten.xmi], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = daten.fileName;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 0.9rem; }
h2 { margin: 0; font-size: 1.25rem; }

.card, .warnbox, .fehlerbox {
  border: 1px solid var(--surface-border, #ddd);
  border-radius: 8px;
  padding: 0.8rem 1rem;
}
.card dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.4rem 1rem; margin: 0; }
.card dt { font-weight: 600; color: var(--text-color-secondary, #666); white-space: nowrap; }
.card dd { margin: 0; }
.card dd small { display: block; color: var(--text-color-secondary, #888); font-size: 0.78rem; }

.warnbox {
  display: flex;
  gap: 0.6rem;
  border-color: #d9a600;
  background: color-mix(in srgb, #d9a600 8%, transparent);
}
.fehlerbox {
  border-color: #b00020;
  background: color-mix(in srgb, #b00020 8%, transparent);
}
.fehlerbox p { margin: 0 0 0.4rem; font-weight: 600; }
.warnbox ul, .fehlerbox ul { margin: 0; padding-left: 1.1rem; }

.aktionen { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.dateiname { font-weight: 400; opacity: 0.85; font-size: 0.85em; }

.vorschau {
  margin: 0;
  padding: 0.8rem;
  max-height: 28rem;
  overflow: auto;
  border: 1px solid var(--surface-border, #ddd);
  border-radius: 8px;
  background: var(--surface-ground, #f8f8f8);
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  white-space: pre;
}
.publish-card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  border: 1px solid var(--surface-border, #ddd);
  border-radius: 8px;
  padding: 0.8rem 1rem;
}
.publish-card h4 { margin: 0; font-size: 1rem; display: flex; align-items: center; gap: 0.4rem; }
.publish-row { display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end; }
.publish-row label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }
.publish-row select, .publish-row input {
  font: inherit;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--surface-border, #ccc);
  border-radius: 4px;
  background: var(--surface-card, #fff);
  color: inherit;
  min-width: 10rem;
}
.wechsel { display: flex; align-items: baseline; gap: 0.4rem; font-size: 0.9rem; }
.wechsel small { color: var(--text-color-secondary, #888); }
.fortschritt { margin: 0; padding: 0; list-style: none; font-size: 0.85rem; }
.fortschritt li { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.15rem 0; }
.fortschritt li small { color: var(--text-color-secondary, #888); }
.fortschritt li.fertig .pi { color: #2e7d32; }
.fortschritt li.uebersprungen { color: var(--text-color-secondary, #888); }
.fortschritt li.fehler { color: #b00020; }
.publish-fehler { margin: 0; color: #b00020; font-size: 0.9rem; }
.publish-ok { margin: 0; color: #2e7d32; font-size: 0.9rem; display: flex; align-items: baseline; gap: 0.4rem; }
.hinweis { margin: 0; color: var(--text-color-secondary, #666); font-size: 0.9rem; }
.naechster-schritt {
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-color-secondary, #666);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font: inherit;
  font-weight: 500;
  padding: 0.5rem 1.1rem;
  cursor: pointer;
  background: var(--surface-card, #fff);
  color: var(--text-color, inherit);
  border: 1px solid var(--surface-border, #c0c4cc);
  border-radius: 6px;
}
.btn:hover { background: var(--surface-hover, #f0f0f0); }
.btn.primary {
  background: var(--primary-color, #1a56a0);
  color: var(--primary-color-text, #fff);
  border-color: var(--primary-color, #1a56a0);
}
</style>
