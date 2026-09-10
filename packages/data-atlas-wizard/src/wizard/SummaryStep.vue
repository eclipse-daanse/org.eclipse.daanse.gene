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

      <p class="naechster-schritt">
        <i class="pi pi-info-circle" aria-hidden="true"></i>
        Das Veröffentlichen in einen Model-Atlas-Scope kommt als nächstes dazu.
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
import { computed, ref } from 'vue';
import { ConfigMode, InputKind, MappingKind } from '../generated';
import { setup, version } from './context';
import { buildDataAtlasXmi, type DataAtlasResult } from '../transform/toDataAtlasConfig';
import { findErrors } from '../transform/validate';

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
