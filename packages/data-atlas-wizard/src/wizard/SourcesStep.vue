<template>
  <section class="step">
    <h2>Datenquellen</h2>
    <p class="lead">
      Woher der Data Atlas seine Objekte liest. Mehrere sind erlaubt — welche
      ein Datensatz benutzt, steht im nächsten Schritt; ohne Angabe gilt der
      Vorgabe-Eingang.
    </p>

    <ul class="quellen">
      <li v-for="(q, i) in quellen" :key="i" class="quelle">
        <header>
          <label class="vorgabe" :title="'Vorgabe-Eingang des Endpunkts'">
            <input
              type="radio"
              name="vorgabe"
              :checked="setupValue?.defaultSourceId === q.id"
              @change="setzeVorgabe(q)"
            />
            Vorgabe
          </label>
          <input
            type="text"
            class="id"
            :value="q.id"
            aria-label="id der Datenquelle"
            @input="setze(q, 'id', text($event))"
          />
          <select :value="q.kind" aria-label="Art der Datenquelle" @change="setzeArt(q, $event)">
            <option :value="InputKind.FILE">XMI-Datei</option>
            <option :value="InputKind.DATABASE">Datenbank (JPA)</option>
          </select>
          <button
            type="button"
            class="weg"
            :disabled="quellen.length < 2"
            title="Datenquelle entfernen"
            @click="entferne(q)"
          >
            <i class="pi pi-trash" aria-hidden="true"></i>
          </button>
        </header>

        <div v-if="q.kind === InputKind.FILE" class="felder">
          <label>
            Pfad der Datendatei
            <input
              type="text"
              :value="q.fileUri"
              placeholder="/opt/dataatlas/runtime/data/data/person.xmi"
              @input="setze(q, 'fileUri', text($event))"
            />
            <small>Absolut — die Konfiguration kommt über HTTP und hat keinen Bezugspunkt.</small>
          </label>
        </div>

        <div v-else class="felder">
          <label>
            Name der DataSource
            <input
              type="text"
              :value="q.dataSourceName"
              @input="setze(q, 'dataSourceName', text($event))"
            />
          </label>
          <label>
            Filter auf den DataSource-Dienst
            <input
              type="text"
              :value="q.dataSourceFilter"
              placeholder="(dataSourceName=personsDs)"
              @input="setze(q, 'dataSourceFilter', text($event))"
            />
          </label>
          <label>
            id der DataSource
            <input
              type="text"
              :value="q.dataSourceId"
              @input="setze(q, 'dataSourceId', text($event))"
            />
          </label>
          <label>
            JPA-Mapping
            <select :value="q.mappingKind" @change="setze(q, 'mappingKind', wert($event) as MappingKind)">
              <option :value="MappingKind.DERIVED">vom Data Atlas ableiten lassen</option>
              <option :value="MappingKind.IMPORTED">fertiges eorm-Mapping importieren</option>
            </select>
          </label>

          <label v-if="q.mappingKind === MappingKind.IMPORTED" class="import">
            eorm-Dokument
            <input type="file" accept=".eorm,.xmi,.xml" @change="lade(q, $event)" />
            <small v-if="q.eormXmi">{{ q.eormXmi.length }} Zeichen geladen</small>
            <small v-else class="fehlt">Noch kein Mapping geladen.</small>
          </label>
        </div>
      </li>
    </ul>

    <div class="aktionen">
      <button type="button" class="btn" @click="neueDatei()">
        <i class="pi pi-plus" aria-hidden="true"></i> XMI-Datei
      </button>
      <button type="button" class="btn" @click="neueDatenbank()">
        <i class="pi pi-plus" aria-hidden="true"></i> Datenbank
      </button>
    </div>

    <p class="verweis">
      Ein fertiges eorm-Mapping erzeugt der
      <a href="#" @click.prevent="oeffneEormWizard()">eorm-Assistent</a>.
    </p>
  </section>
</template>

<script setup lang="ts">
/**
 * Schritt 3: die Dateneingänge als Liste.
 *
 * Das Zielmodell kennt beliebig viele `DataInput`s, und eine Transformation
 * braucht ohnehin einen zweiten (ein `BridgeRepository` liest einen anderen
 * Eingang). Deshalb eine Liste statt der früheren Entweder-oder-Frage.
 *
 * Genau ein Eintrag ist der Vorgabe-Eingang: er landet am Service, und
 * Datensätze ohne eigene Angabe übernehmen ihn (override-else-default, wie im
 * Zielmodell).
 */
import { computed, inject } from 'vue';
import { InputKind, MappingKind, type DataSourceConfig } from '../generated';
import {
  addDataSource,
  buildDatabaseSource,
  buildFileSource,
  removeDataSource,
  setup,
  slugOf,
  touch,
  version,
} from './context';

const tsm = inject<{ getService?: <T>(id: string) => T | undefined } | undefined>('tsm', undefined);

const setupValue = computed(() => {
  void version.value;
  return setup.value;
});
const quellen = computed<DataSourceConfig[]>(() => setupValue.value?.dataSources ?? []);

const text = (e: Event) => (e.target as HTMLInputElement).value;
const wert = (e: Event) => (e.target as HTMLSelectElement).value;

function setze<K extends keyof DataSourceConfig>(
  q: DataSourceConfig,
  feld: K,
  neu: DataSourceConfig[K],
): void {
  q[feld] = neu;
  touch();
}

function setzeArt(q: DataSourceConfig, e: Event): void {
  q.kind = wert(e) as InputKind;
  touch();
}

function setzeVorgabe(q: DataSourceConfig): void {
  const s = setup.value;
  if (!s) return;
  s.defaultSourceId = q.id;
  touch();
}

function neueDatei(): void {
  const slug = slugOf(setupValue.value?.instanceName ?? 'daten');
  addDataSource(buildFileSource(slug, ''));
}

function neueDatenbank(): void {
  const name = setupValue.value?.instanceName ?? 'daten';
  addDataSource(buildDatabaseSource(slugOf(name), name));
}

function entferne(q: DataSourceConfig): void {
  removeDataSource(q);
}

async function lade(q: DataSourceConfig, e: Event): Promise<void> {
  const datei = (e.target as HTMLInputElement).files?.[0];
  if (!datei) return;
  setze(q, 'eormXmi', await datei.text());
}

/** Im gene-Betrieb den eorm-Assistenten öffnen, sonst nichts. */
function oeffneEormWizard(): void {
  tsm?.getService?.<() => void>('ui.eorm-wizard.open')?.();
}
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 0.9rem; max-width: 48rem; }
h2 { margin: 0; font-size: 1.25rem; }
.lead { margin: 0; color: var(--text-color-secondary, #666); }

.quellen { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.quelle {
  border: 1px solid var(--surface-border, #ddd);
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
}
.quelle header { display: flex; align-items: center; gap: 0.6rem; }
.vorgabe { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.85rem; white-space: nowrap; }
.quelle header .id { flex: 1; font-family: ui-monospace, monospace; }
.weg { background: none; border: none; cursor: pointer; color: var(--text-color-secondary, #888); }
.weg:disabled { opacity: 0.3; cursor: not-allowed; }

.felder { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.6rem; }
.felder label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; }
.felder small { color: var(--text-color-secondary, #888); }
.felder small.fehlt { color: #8a6d00; }

input[type='text'], select {
  font: inherit;
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--surface-border, #ccc);
  border-radius: 4px;
  background: var(--surface-card, #fff);
  color: inherit;
}

.aktionen { display: flex; gap: 0.6rem; }
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font: inherit;
  padding: 0.4rem 0.9rem;
  cursor: pointer;
  background: var(--surface-card, #fff);
  border: 1px solid var(--surface-border, #c0c4cc);
  border-radius: 6px;
  color: inherit;
}
.btn:hover { background: var(--surface-hover, #f0f0f0); }
.verweis { margin: 0; font-size: 0.85rem; color: var(--text-color-secondary, #666); }
</style>
