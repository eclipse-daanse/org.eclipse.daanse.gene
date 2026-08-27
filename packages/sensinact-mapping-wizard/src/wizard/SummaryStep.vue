<template>
  <section class="step">
    <h2>Zusammenfassung</h2>

    <!-- Übersicht aller Nachrichtentypen dieses Providers -->
    <div v-if="setups.length > 1" class="types-card">
      <h4><i class="pi pi-sitemap" aria-hidden="true"></i> Nachrichtentypen dieses Providers</h4>
      <ul>
        <li v-for="(s, i) in setups" :key="i">
          <i :class="i === setups.length - 1 ? 'pi pi-pencil' : 'pi pi-check'" aria-hidden="true"></i>
          <strong>{{ s.sensorClass?.getName() }}</strong>
          <span class="muted">
            — {{ s.measurements.filter((m) => m.selected).length }} Messwert(e), Mapping „{{ s.mappingId }}“
          </span>
        </li>
      </ul>
    </div>

    <div v-if="editing" class="editbox">
      <i class="pi pi-pencil" aria-hidden="true"></i>
      <span>
        Geöffnet aus dem Modelatlas: <code>{{ editing.objectId }}</code>
        („{{ editing.registry }}/{{ editing.stage }}“)
      </span>
    </div>
    <div v-else-if="mappingDocument.source === 'file'" class="editbox">
      <i class="pi pi-file-edit" aria-hidden="true"></i>
      <span>
        Geöffnet aus der Datei <code>{{ mappingDocument.name }}</code> — speichern Sie sie
        erneut herunter oder veröffentlichen Sie sie im Modelatlas.
      </span>
    </div>

    <template v-if="current">
      <div class="card">
        <dl>
          <dt><i class="pi pi-microchip" aria-hidden="true"></i> Sensor</dt>
          <dd>{{ current.sensorClass?.getName() }}</dd>
          <dt><i class="pi pi-tag" aria-hidden="true"></i> Name des Sensors</dt>
          <dd>
            <template v-if="current.nameSource === 'STATIC'">„{{ current.nameFallback }}“</template>
            <template v-else>aus Feld „{{ current.namePath?.label ?? '—' }}“</template>
          </dd>
          <template v-if="current.friendlyNameSource !== 'NONE'">
            <dt><i class="pi pi-id-card" aria-hidden="true"></i> Anzeigename</dt>
            <dd>
              <template v-if="current.friendlyNameSource === 'STATIC'">„{{ current.friendlyName }}“</template>
              <template v-else>aus Feld „{{ current.friendlyNamePath?.label ?? '—' }}“</template>
            </dd>
          </template>
          <dt><i class="pi pi-clock" aria-hidden="true"></i> Messzeitpunkt</dt>
          <dd>
            {{
              current.timestamp?.source === 'DEVICE_TIME'
                ? `aus Feld „${current.timestamp?.path?.label ?? '—'}“`
                : 'Empfangszeit'
            }}
          </dd>
          <dt><i class="pi pi-chart-line" aria-hidden="true"></i> Messwerte</dt>
          <dd>{{ selectedMeasurements.map((m) => m.label || m.valuePath?.label).join(', ') }}</dd>
        </dl>
      </div>

      <!-- Gemeinsamer Provider: weiteren Nachrichtentyp aufnehmen -->
      <div class="unified-card">
        <h4><i class="pi pi-plus-circle" aria-hidden="true"></i> Liefert dieser Provider Daten aus mehreren Nachrichtentypen?</h4>
        <p class="muted">
          Fügen Sie weitere Nachrichtentypen hinzu (auch aus anderen Modellen) — alle speisen
          denselben digitalen Zwilling.
        </p>
        <div class="unified-row">
          <label>
            Name des gemeinsamen Providers
            <input
              v-model="providerNameLocal"
              type="text"
              :placeholder="defaultProviderName"
            />
          </label>
          <button type="button" class="btn" @click="addAnotherType">
            <i class="pi pi-plus" aria-hidden="true"></i>
            Weiteren Nachrichtentyp hinzufügen
          </button>
        </div>
      </div>
    </template>

    <template v-if="result">
      <div v-if="result.warnings.length" class="warnbox">
        <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
        <ul>
          <li v-for="(w, i) in result.warnings" :key="i">{{ w }}</li>
        </ul>
      </div>

      <p class="menu-hint">
        <i class="pi pi-info-circle" aria-hidden="true"></i>
        <span>
          Speichern und Veröffentlichen liegen in der Werkzeugleiste oben
          („Speichern", „In den Modelatlas") —
          <button v-if="publishable" type="button" class="link" @click="openUpload">
            jetzt in den Modelatlas hochladen
          </button>
          <template v-else>oder hier als Datei herunterladen.</template>
        </span>
      </p>

      <div class="actions">
        <button
          v-for="file in result.files"
          :key="file.fileName"
          type="button"
          class="btn"
          :class="{ primary: file.primary }"
          @click="download(file.fileName, file.content)"
        >
          <i class="pi pi-download" aria-hidden="true"></i>
          {{ file.title }}
          <span class="filename">{{ file.fileName }}</span>
          <span v-if="mappingDocument.source === 'file' && file.kind === 'mapping'" class="sr-only">
            erneut speichern
          </span>
        </button>
      </div>

      <details v-for="file in result.files" :key="'preview-' + file.fileName" class="preview">
        <summary><i class="pi pi-code" aria-hidden="true"></i> {{ file.fileName }} ansehen</summary>
        <pre>{{ file.content }}</pre>
      </details>
    </template>

    <p v-else-if="error" class="error">
      <i class="pi pi-times-circle" aria-hidden="true"></i>
      {{ error }}
    </p>
  </section>
</template>

<script setup lang="ts">
/**
 * Schritt 6: Review + Erzeugung/Download der XMIs. Bei mehreren
 * Nachrichtentypen entsteht zusätzlich ein MappingProfile
 * (providerStrategy=UNIFIED), das alle Mappings zu EINEM Provider bündelt.
 */
import { computed, ref } from 'vue';
import { buildArtifacts, canPublish, downloadFile } from './artifacts';
import type { ArtifactResult } from './artifacts';
import {
  allSetups,
  editing,
  freezeCurrentSetup,
  mappingDocument,
  providerName,
  setup,
  uploadDialogOpen,
} from './context';

const emit = defineEmits<{ (e: 'add-type'): void }>();

const current = computed(() => setup.value);
const setups = computed(() => allSetups());
const selectedMeasurements = computed(
  () => setup.value?.measurements.filter((m) => m.selected) ?? [],
);

const defaultProviderName = computed(
  () => providerName.value || setups.value[0]?.mappingId || 'mein-provider',
);
const providerNameLocal = computed({
  get: () => providerName.value,
  set: (value: string) => {
    providerName.value = value;
  },
});

function addAnotherType(): void {
  if (!providerName.value.trim()) {
    providerName.value = defaultProviderName.value;
  }
  freezeCurrentSetup();
  emit('add-type');
}

const error = ref('');
const result = computed<ArtifactResult | undefined>(() => {
  error.value = '';
  try {
    return buildArtifacts();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    return undefined;
  }
});

const publishable = computed(() => canPublish());

/** Speichern/Veröffentlichen liegen in der Menü-Toolbar (T24/#201). */
function openUpload(): void {
  uploadDialogOpen.value = true;
}

function download(fileName: string, content: string): void {
  downloadFile(fileName, content);
}
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 1rem; max-width: 56rem; }
.step h2 { margin: 0; font-size: 1.25rem; }

.card, .types-card, .unified-card {
  border: 1px solid var(--surface-border, #ddd);
  border-radius: 8px;
  background: var(--surface-card, #fff);
  padding: 1rem 1.25rem;
}
.types-card h4, .unified-card h4 {
  margin: 0 0 0.5rem; display: inline-flex; align-items: center; gap: 0.5rem;
  font-size: 0.95rem;
}
.types-card h4 .pi, .unified-card h4 .pi { color: var(--primary-color, #1a56a0); }
.types-card ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.35rem; }
.types-card li { display: flex; align-items: center; gap: 0.5rem; }
.types-card li .pi-check { color: #2f9e44; font-size: 0.8rem; }
.types-card li .pi-pencil { color: var(--primary-color, #1a56a0); font-size: 0.8rem; }
.muted { color: var(--text-color-secondary, #666); }

dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.6rem 1.5rem; margin: 0; }
dt {
  display: inline-flex; align-items: center; gap: 0.5rem;
  font-weight: 600; color: var(--text-color-secondary, #666);
}
dt .pi { color: var(--primary-color, #1a56a0); font-size: 0.9rem; }
dd { margin: 0; }

.unified-card p { margin: 0 0 0.6rem; font-size: 0.9rem; }
.unified-row { display: flex; align-items: flex-end; gap: 0.75rem; flex-wrap: wrap; }
.unified-row label {
  display: flex; flex-direction: column; gap: 0.3rem; flex: 1; min-width: 16rem;
  font-size: 0.9rem; font-weight: 500; color: var(--text-color-secondary, #666);
}
.unified-row input {
  padding: 0.45rem 0.6rem; font: inherit; border-radius: 6px;
  border: 1px solid var(--input-border, var(--surface-border, #c0c4cc));
  background: var(--input-bg, #fff);
  color: var(--input-text, var(--text-color, inherit));
}
.unified-row input:focus-visible { outline: none; border-color: var(--primary-color, #1a56a0); }

.warnbox {
  display: flex; gap: 0.65rem; align-items: flex-start;
  padding: 0.75rem 1rem; border-radius: 8px;
  background: color-mix(in srgb, #f5a623 12%, transparent);
  border: 1px solid color-mix(in srgb, #f5a623 45%, transparent);
}
.warnbox .pi { color: #b8860b; margin-top: 0.15rem; }
.warnbox ul { margin: 0; padding-left: 1rem; }

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

.editbox {
  display: flex; gap: 0.6rem; align-items: flex-start; max-width: 46rem;
  padding: 0.6rem 0.9rem; border-radius: 8px; font-size: 0.92rem;
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary-color, #1a56a0) 32%, transparent);
}
.editbox .pi { color: var(--primary-color, #1a56a0); margin-top: 0.15rem; }
.editbox code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em;
  padding: 0.05rem 0.3rem; border-radius: 4px;
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 12%, transparent);
}

.menu-hint {
  display: flex; gap: 0.5rem; align-items: flex-start; margin: 0; max-width: 46rem;
  font-size: 0.9rem; color: var(--text-color-secondary, #666);
}
.menu-hint .pi { color: var(--primary-color, #1a56a0); margin-top: 0.15rem; }
.link {
  border: none; background: none; padding: 0; font: inherit;
  color: var(--primary-color, #1a56a0); cursor: pointer; text-decoration: underline;
}

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

.editbox {
  display: flex; gap: 0.6rem; align-items: flex-start; max-width: 46rem;
  padding: 0.6rem 0.9rem; border-radius: 8px; font-size: 0.92rem;
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary-color, #1a56a0) 32%, transparent);
}
.editbox .pi { color: var(--primary-color, #1a56a0); margin-top: 0.15rem; }
.editbox code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em;
  padding: 0.05rem 0.3rem; border-radius: 4px;
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 12%, transparent);
}

.publish-card {
  border: 1px solid var(--surface-border, #ddd);
  border-radius: 8px;
  background: var(--surface-card, #fff);
  padding: 1rem 1.25rem;
  display: flex; flex-direction: column; gap: 0.6rem;
}
.publish-card h4 {
  margin: 0; display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.95rem;
}
.publish-card h4 .pi { color: var(--primary-color, #1a56a0); }
.publish-card p { margin: 0; font-size: 0.9rem; }
.publish-row { display: flex; align-items: flex-end; gap: 0.75rem; flex-wrap: wrap; }
.publish-row label {
  display: flex; flex-direction: column; gap: 0.3rem;
  font-size: 0.9rem; font-weight: 500; color: var(--text-color-secondary, #666);
}
.publish-row select {
  padding: 0.45rem 0.6rem; font: inherit; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--input-border, var(--surface-border, #c0c4cc));
  background: var(--input-bg, #fff);
  color: var(--input-text, var(--text-color, inherit));
}
.publish-status { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.publish-status li { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; }
.publish-status li.ok .pi { color: #2f9e44; }
.publish-status li.error { color: #e5484d; }
.publish-status li.error .pi { color: #e5484d; }
.stage-notice {
  display: flex; gap: 0.5rem; align-items: flex-start; margin: 0; font-size: 0.9rem;
  padding: 0.55rem 0.75rem; border-radius: 6px;
  background: color-mix(in srgb, #f5a623 12%, transparent);
  border: 1px solid color-mix(in srgb, #f5a623 40%, transparent);
}
.stage-notice .pi { color: #b8860b; margin-top: 0.15rem; }

.publish-note {
  display: flex; gap: 0.5rem; align-items: flex-start;
  font-size: 0.85rem; color: var(--text-color-secondary, #666);
}
.publish-note .pi { color: var(--primary-color, #1a56a0); margin-top: 0.15rem; }

.actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
.btn {
  display: inline-flex; align-items: center; gap: 0.5rem;
  font: inherit; font-weight: 500; padding: 0.55rem 1.1rem; cursor: pointer;
  background: var(--surface-card, #fff);
  color: var(--text-color, inherit);
  border: 1px solid var(--surface-border, #c0c4cc);
  border-radius: 6px;
  transition: background 0.15s, border-color 0.15s;
}
.btn:hover { background: var(--surface-hover, #f0f0f0); }
.btn.primary {
  background: var(--primary-color, #1a56a0);
  color: var(--primary-color-text, #fff);
  border-color: var(--primary-color, #1a56a0);
}
.btn.primary:hover { background: var(--primary-color-hover, #1a56a0); }
.btn .filename { opacity: 0.75; font-weight: 400; font-size: 0.85em; }

.preview summary {
  display: inline-flex; align-items: center; gap: 0.5rem;
  cursor: pointer; color: var(--text-color-secondary, #666);
}
.preview[open] summary { margin-bottom: 0.5rem; }
pre {
  background: var(--surface-section, #f7f7f7);
  border: 1px solid var(--surface-border, #eee);
  border-radius: 8px;
  padding: 0.9rem 1rem;
  overflow: auto;
  max-height: 24rem;
  font-size: 0.85rem;
  line-height: 1.45;
}
.error { display: inline-flex; align-items: center; gap: 0.5rem; color: #e5484d; }
</style>
