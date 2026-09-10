<template>
  <section class="step">
    <h2>Datenwege</h2>
    <p class="lead">
      Ein Datenweg ist eine Kette: eine Quelle, die Klassen, die daraus
      veröffentlicht werden, und die Formate dafür. Mehrere Wege sind erlaubt
      und dürfen sich eine Quelle teilen.
    </p>

    <article v-for="(chain, ci) in chains" :key="ci" class="kette">
      <header>
        <input
          type="text"
          class="id"
          :value="chain.id"
          aria-label="id des Datenwegs"
          @input="setzeKette(chain, 'id', text($event))"
        />
        <span class="zahlen">
          {{ chain.datasets.filter((d) => d.selected).length }} Datensätze
        </span>
        <button
          type="button"
          class="weg"
          :disabled="chains.length < 2"
          title="Datenweg entfernen"
          @click="removeChain(chain)"
        >
          <i class="pi pi-trash" aria-hidden="true"></i>
        </button>
      </header>

      <!-- ── Quelle ──────────────────────────────────────────────────────── -->
      <fieldset>
        <legend>Datenquelle</legend>
        <label class="art">
          <select :value="quellenWahl(chain)" @change="waehleQuelle(chain, $event)">
            <option value="FILE">eigene XMI-Datei</option>
            <option value="DATABASE">eigene Datenbank (JPA)</option>
            <option
              v-for="q in fremdeQuellen(chain)"
              :key="q.id"
              :value="`shared:${q.id}`"
            >
              wie „{{ besitzerVon(q) }}" ({{ q.id }})
            </option>
          </select>
        </label>

        <template v-if="chain.source">
          <label>
            id
            <input
              type="text"
              :value="chain.source.id"
              @input="setzeQuelle(chain.source, 'id', text($event))"
            />
          </label>

          <template v-if="chain.source.kind === InputKind.FILE">
            <label>
              Pfad der Datendatei
              <input
                type="text"
                :value="chain.source.fileUri"
                placeholder="/opt/dataatlas/runtime/data/data/person.xmi"
                @input="setzeQuelle(chain.source!, 'fileUri', text($event))"
              />
              <small>Absolut — die Konfiguration kommt über HTTP.</small>
            </label>
          </template>

          <template v-else>
            <label>
              Name der DataSource
              <input
                type="text"
                :value="chain.source.dataSourceName"
                @input="setzeQuelle(chain.source!, 'dataSourceName', text($event))"
              />
            </label>
            <label>
              Filter auf den DataSource-Dienst
              <input
                type="text"
                :value="chain.source.dataSourceFilter"
                placeholder="(dataSourceName=personsDs)"
                @input="setzeQuelle(chain.source!, 'dataSourceFilter', text($event))"
              />
            </label>
            <label>
              id der DataSource
              <input
                type="text"
                :value="chain.source.dataSourceId"
                @input="setzeQuelle(chain.source!, 'dataSourceId', text($event))"
              />
            </label>
            <label>
              JPA-Mapping
              <select
                :value="chain.source.mappingKind"
                @change="setzeQuelle(chain.source!, 'mappingKind', wert($event) as MappingKind)"
              >
                <option :value="MappingKind.DERIVED">ableiten lassen</option>
                <option :value="MappingKind.IMPORTED">eorm-Mapping importieren</option>
              </select>
            </label>
            <label v-if="chain.source.mappingKind === MappingKind.IMPORTED">
              eorm-Dokument
              <input type="file" accept=".eorm,.xmi,.xml" @change="ladeMapping(chain.source!, $event)" />
              <small v-if="chain.source.eormXmi">{{ chain.source.eormXmi.length }} Zeichen geladen</small>
              <small v-else class="fehlt">Noch kein Mapping geladen.</small>
            </label>
          </template>
        </template>

        <p v-else class="geteilt">
          <i class="pi pi-link" aria-hidden="true"></i>
          Benutzt die Quelle „{{ chain.sharedSource?.id }}" mit — im Ergebnis ein
          einziger Dateneingang.
        </p>
      </fieldset>

      <!-- ── Datensätze ──────────────────────────────────────────────────── -->
      <fieldset>
        <legend>Datensätze</legend>
        <div v-if="chain.datasets.length === 0" class="leer">
          Keine konkrete Klasse im Modell.
        </div>
        <table v-else>
          <thead>
            <tr>
              <th class="check"></th>
              <th>Klasse</th>
              <th>id</th>
              <th>Name</th>
              <th>Pfad</th>
              <th>Beschreibung</th>
              <th class="tight">Batch</th>
              <th class="tight">Grenze</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, i) in chain.datasets" :key="i" :class="{ off: !d.selected }">
              <td class="check">
                <input
                  type="checkbox"
                  :checked="d.selected"
                  :aria-label="`${d.targetClass?.getName()} veröffentlichen`"
                  @change="setzeDatensatz(d, 'selected', ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td class="klasse">
                {{ d.targetClass?.getName() }}
                <small>{{ d.targetClass?.getEPackage()?.getName() }}</small>
              </td>
              <td><input type="text" :value="d.id" @input="setzeDatensatz(d, 'id', text($event))" /></td>
              <td><input type="text" :value="d.name" @input="setzeDatensatz(d, 'name', text($event))" /></td>
              <td><input type="text" :value="d.path" @input="setzeDatensatz(d, 'path', text($event))" /></td>
              <td>
                <input
                  type="text"
                  class="weit"
                  :value="d.description"
                  @input="setzeDatensatz(d, 'description', text($event))"
                />
              </td>
              <td class="tight">
                <input type="number" :value="d.batchSize" @input="setzeDatensatz(d, 'batchSize', zahl($event))" />
              </td>
              <td class="tight">
                <input
                  type="number"
                  :value="d.batchSizeLimit"
                  @input="setzeDatensatz(d, 'batchSizeLimit', zahl($event))"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </fieldset>

      <!-- ── Formate ─────────────────────────────────────────────────────── -->
      <fieldset>
        <legend>Formate</legend>
        <ul class="formate">
          <li v-for="art in ARTEN" :key="art.kind">
            <label>
              <input
                type="checkbox"
                :checked="hatFormat(chain, art.kind)"
                @change="schalteFormat(chain, art.kind, ($event.target as HTMLInputElement).checked)"
              />
              <span class="name">{{ art.label }}</span>
              <small>{{ art.hinweis }}</small>
            </label>
            <div v-if="hatFormat(chain, art.kind) && istCsv(art.kind)" class="csv">
              <label>
                Trennzeichen
                <input
                  type="text"
                  maxlength="1"
                  :value="formatVon(chain, art.kind)!.separator"
                  @input="setzeFormat(chain, art.kind, 'separator', text($event))"
                />
              </label>
              <label class="check">
                <input
                  type="checkbox"
                  :checked="formatVon(chain, art.kind)!.includeTypeHeader"
                  @change="setzeFormat(chain, art.kind, 'includeTypeHeader', ($event.target as HTMLInputElement).checked)"
                />
                Zeile mit den SQL-Typen
              </label>
            </div>
          </li>
        </ul>
        <p v-if="chain.exports.length === 0" class="hinweis">
          <i class="pi pi-info-circle" aria-hidden="true"></i>
          Nichts gewählt — es gelten JSON und XML.
        </p>
      </fieldset>

      <ul v-if="hinweise(chain).length" class="probleme">
        <li v-for="(h, i) in hinweise(chain)" :key="i">
          <i class="pi pi-exclamation-triangle" aria-hidden="true"></i> {{ h }}
        </li>
      </ul>
    </article>

    <div class="aktionen">
      <button type="button" class="btn" @click="neuerWeg(InputKind.FILE)">
        <i class="pi pi-plus" aria-hidden="true"></i> Datenweg (Datei)
      </button>
      <button type="button" class="btn" @click="neuerWeg(InputKind.DATABASE)">
        <i class="pi pi-plus" aria-hidden="true"></i> Datenweg (Datenbank)
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Schritt 3: die Datenwege.
 *
 * Ein Weg trägt seine Quelle, seine Datensätze und seine Formate — die
 * Verschachtelung drückt die Zugehörigkeit aus. Das Zielmodell führt
 * stattdessen Register; der Transformer flacht die Wege dahin aus und fasst
 * geteilte Quellen und gleiche Formatvorlagen zusammen.
 */
import { computed } from 'vue';
import {
  DataatlaswizardFactory,
  ExportKind,
  InputKind,
  MappingKind,
  type DataChain,
  type DataSourceConfig,
  type DatasetConfig,
  type ExportConfig,
} from '../generated';
import {
  addChain,
  buildChain,
  buildDatabaseSource,
  buildDataset,
  buildFileSource,
  concreteClasses,
  effectiveSource,
  ownSource,
  ownedSources,
  removeChain as entferneWeg,
  setup,
  shareSource,
  slugOf,
  touch,
  version,
} from './context';

const ARTEN: { kind: ExportKind; label: string; hinweis: string; id: string; name: string; beschreibung: string }[] = [
  { kind: ExportKind.JSON, label: 'JSON', hinweis: 'application/json', id: 'json', name: 'JSON', beschreibung: 'Daten als JSON.' },
  { kind: ExportKind.XML, label: 'XML', hinweis: 'application/xml', id: 'xml', name: 'XML', beschreibung: 'Daten als XML.' },
  { kind: ExportKind.CSV, label: 'CSV', hinweis: 'Trennzeichen wählbar', id: 'csv', name: 'CSV', beschreibung: 'Daten als CSV.' },
  { kind: ExportKind.CSV_ZIP, label: 'CSV, gepackt', hinweis: 'CSV in einem ZIP', id: 'csv-zip', name: 'CSV (ZIP)', beschreibung: 'Daten als CSV, gepackt.' },
];

const setupValue = computed(() => {
  void version.value;
  return setup.value;
});
const chains = computed<DataChain[]>(() => setupValue.value?.chains ?? []);

const text = (e: Event) => (e.target as HTMLInputElement).value;
const wert = (e: Event) => (e.target as HTMLSelectElement).value;
const zahl = (e: Event) => {
  const v = Number.parseInt((e.target as HTMLInputElement).value, 10);
  return Number.isFinite(v) ? v : -1;
};

function setzeKette<K extends keyof DataChain>(c: DataChain, feld: K, v: DataChain[K]) {
  c[feld] = v;
  touch();
}
function setzeQuelle<K extends keyof DataSourceConfig>(
  q: DataSourceConfig,
  feld: K,
  v: DataSourceConfig[K],
) {
  q[feld] = v;
  touch();
}
function setzeDatensatz<K extends keyof DatasetConfig>(
  d: DatasetConfig,
  feld: K,
  v: DatasetConfig[K],
) {
  d[feld] = v;
  touch();
}

const removeChain = (c: DataChain) => entferneWeg(c);

// ── Quelle wählen: eigene oder eine fremde mitbenutzen ─────────────────────

/** Quellen, die anderen Wegen gehören — Kandidaten fürs Mitbenutzen. */
function fremdeQuellen(chain: DataChain): DataSourceConfig[] {
  const s = setupValue.value;
  if (!s) return [];
  return ownedSources(s).filter((q) => q !== chain.source);
}

function besitzerVon(quelle: DataSourceConfig): string {
  return chains.value.find((c) => c.source === quelle)?.id ?? '?';
}

const quellenWahl = (chain: DataChain): string =>
  chain.source ? chain.source.kind : `shared:${chain.sharedSource?.id ?? ''}`;

function waehleQuelle(chain: DataChain, e: Event): void {
  const gewaehlt = wert(e);
  if (gewaehlt.startsWith('shared:')) {
    const id = gewaehlt.slice('shared:'.length);
    const quelle = fremdeQuellen(chain).find((q) => q.id === id);
    if (quelle) shareSource(chain, quelle);
    return;
  }
  const slug = slugOf(chain.id || 'quelle');
  ownSource(
    chain,
    gewaehlt === InputKind.DATABASE
      ? buildDatabaseSource(slug, chain.id)
      : buildFileSource(slug, ''),
  );
}

async function ladeMapping(quelle: DataSourceConfig, e: Event): Promise<void> {
  const datei = (e.target as HTMLInputElement).files?.[0];
  if (!datei) return;
  setzeQuelle(quelle, 'eormXmi', await datei.text());
}

// ── Formate je Weg ─────────────────────────────────────────────────────────

const istCsv = (kind: ExportKind) => kind === ExportKind.CSV || kind === ExportKind.CSV_ZIP;
const formatVon = (chain: DataChain, kind: ExportKind): ExportConfig | undefined =>
  chain.exports.find((e) => e.kind === kind);
const hatFormat = (chain: DataChain, kind: ExportKind) => !!formatVon(chain, kind);

function schalteFormat(chain: DataChain, kind: ExportKind, an: boolean): void {
  if (an) {
    const art = ARTEN.find((a) => a.kind === kind)!;
    const neu = DataatlaswizardFactory.eINSTANCE.createExportConfig();
    neu.kind = kind;
    neu.id = art.id;
    neu.name = art.name;
    neu.description = art.beschreibung;
    chain.exports.push(neu);
  } else {
    chain.exports = chain.exports.filter((e) => e.kind !== kind);
  }
  touch();
}

function setzeFormat<K extends keyof ExportConfig>(
  chain: DataChain,
  kind: ExportKind,
  feld: K,
  v: ExportConfig[K],
): void {
  const e = formatVon(chain, kind);
  if (!e) return;
  e[feld] = v;
  touch();
}

// ── Neuer Weg ──────────────────────────────────────────────────────────────

function neuerWeg(kind: InputKind): void {
  const s = setupValue.value;
  if (!s) return;
  const basis = slugOf(s.instanceName || 'weg');
  const quelle =
    kind === InputKind.DATABASE ? buildDatabaseSource(basis, s.instanceName) : buildFileSource(basis, '');
  const chain = buildChain(basis, quelle);
  // Die Klassen des Modells als Vorschlag, aber nichts ausgewählt: welche aus
  // diesem Weg kommen, entscheidet der Nutzer.
  if (s.modelPackage) {
    for (const eClass of concreteClasses(s.modelPackage)) {
      const dataset = buildDataset(eClass);
      dataset.selected = false;
      chain.datasets.push(dataset);
    }
  }
  addChain(chain);
}

/** Was dem Nutzer auffallen sollte, bevor die Zusammenfassung es hart meldet. */
function hinweise(chain: DataChain): string[] {
  void version.value;
  const meldungen: string[] = [];
  const quelle = effectiveSource(chain);
  if (!quelle) meldungen.push('Keine Datenquelle.');
  const ausgewaehlt = chain.datasets.filter((d) => d.selected);
  if (ausgewaehlt.length === 0) meldungen.push('Kein Datensatz ausgewählt.');
  for (const feld of ['id', 'path'] as const) {
    const werte = ausgewaehlt.map((d) => d[feld]);
    for (const doppelt of new Set(werte.filter((w, i) => w && werte.indexOf(w) !== i))) {
      meldungen.push(`„${doppelt}" ist als ${feld} mehrfach vergeben.`);
    }
  }
  return meldungen;
}
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 1rem; }
h2 { margin: 0; font-size: 1.25rem; }
.lead { margin: 0; color: var(--text-color-secondary, #666); max-width: 46rem; }

.kette {
  border: 1px solid var(--surface-border, #ddd);
  border-radius: 8px;
  padding: 0.7rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.kette > header { display: flex; align-items: center; gap: 0.6rem; }
.kette > header .id { flex: 0 0 14rem; font-family: ui-monospace, monospace; font-weight: 600; }
.zahlen { color: var(--text-color-secondary, #888); font-size: 0.85rem; }
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
fieldset label.art { max-width: 22rem; }
fieldset small { color: var(--text-color-secondary, #888); }
fieldset small.fehlt { color: #8a6d00; }
.geteilt { display: flex; align-items: baseline; gap: 0.4rem; margin: 0; font-size: 0.85rem; color: var(--text-color-secondary, #666); }

table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
th, td { padding: 0.3rem 0.45rem; text-align: left; border-bottom: 1px solid var(--surface-border, #eee); }
th { font-weight: 600; background: var(--surface-hover, #f6f6f6); white-space: nowrap; }
tr:last-child td { border-bottom: none; }
tr.off { opacity: 0.5; }
td.check, th.check { width: 2rem; }
td.tight input { width: 4.5rem; }
.klasse small { display: block; color: var(--text-color-secondary, #888); font-size: 0.75rem; }
.leer { color: var(--text-color-secondary, #666); font-size: 0.85rem; }

input[type='text'], input[type='number'], select {
  font: inherit;
  padding: 0.25rem 0.4rem;
  border: 1px solid var(--surface-border, #ccc);
  border-radius: 4px;
  background: var(--surface-card, #fff);
  color: inherit;
  width: 100%;
}
input.weit { min-width: 14rem; }

.formate { list-style: none; margin: 0; padding: 0; }
.formate label { flex-direction: row; align-items: baseline; gap: 0.4rem; }
.formate .name { font-weight: 600; }
.csv { display: flex; gap: 1.2rem; margin: 0 0 0.5rem 1.6rem; }
.csv label { flex-direction: row; align-items: center; gap: 0.3rem; }
.csv input[type='text'] { width: 2.5rem; text-align: center; }
.hinweis { display: flex; align-items: baseline; gap: 0.4rem; margin: 0; font-size: 0.85rem; color: var(--text-color-secondary, #666); }

.probleme { margin: 0; padding-left: 0.2rem; list-style: none; font-size: 0.85rem; color: var(--text-color-secondary, #8a6d00); }
.probleme li { display: flex; align-items: baseline; gap: 0.4rem; }

.aktionen { display: flex; gap: 0.6rem; }
.btn {
  display: inline-flex; align-items: center; gap: 0.4rem; font: inherit;
  padding: 0.4rem 0.9rem; cursor: pointer;
  background: var(--surface-card, #fff);
  border: 1px solid var(--surface-border, #c0c4cc);
  border-radius: 6px; color: inherit;
}
.btn:hover { background: var(--surface-hover, #f0f0f0); }
</style>
