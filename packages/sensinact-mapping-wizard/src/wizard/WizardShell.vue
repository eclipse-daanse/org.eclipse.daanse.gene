<template>
  <div class="wizard">
    <!-- Aktuelles Dokument: neues Mapping oder ein geöffnetes (T21/#192) -->
    <header class="doc-bar">
      <span class="doc" :class="doc.source">
        <i :class="docIcon" aria-hidden="true"></i>
        <strong>{{ doc.source === 'new' ? 'Neues Mapping' : doc.name }}</strong>
        <small v-if="doc.source === 'atlas'">Modelatlas · {{ doc.registry }}/{{ doc.stage }}</small>
        <small v-else-if="doc.source === 'file'">Datei</small>
      </span>
      <span v-if="status" class="status" :class="status.kind">
        <i :class="status.kind === 'ok' ? 'pi pi-check-circle' : 'pi pi-times-circle'" aria-hidden="true"></i>
        {{ status.text }}
      </span>
    </header>

    <ol class="steps">
      <li
        v-for="(s, i) in steps"
        :key="s.id"
        :class="{ active: i === current, done: i < current, clickable: i < current }"
        @click="i < current ? (current = i) : undefined"
      >
        <span class="dot">
          <i v-if="i < current" class="pi pi-check" aria-hidden="true"></i>
          <template v-else>{{ i + 1 }}</template>
        </span>
        <span class="step-title">{{ s.title }}</span>
        <span v-if="i < steps.length - 1" class="connector" aria-hidden="true"></span>
      </li>
    </ol>

    <div class="body">
      <ModelSourceStep v-if="currentStep.id === 'model'" />

      <section v-else-if="currentStep.id === 'identification'" class="composed">
        <h2>Identifikation</h2>
        <p class="lead">Wie soll der Sensor benannt werden?</p>
        <UIModelComposer
          v-if="uiModels && setupValue"
          :key="`ident-${version}`"
          :ui-model="uiModels.identification"
          :model="setupValue"
        />
      </section>

      <section v-else-if="currentStep.id === 'timestamp'" class="composed">
        <h2>Messzeitpunkt</h2>
        <UIModelComposer
          v-if="uiModels && setupValue?.timestamp"
          :key="`ts-${version}`"
          :ui-model="uiModels.timestamp"
          :model="setupValue.timestamp"
        />
      </section>

      <MeasurementsStep v-else-if="currentStep.id === 'measurements'" />

      <section v-else-if="currentStep.id === 'location'" class="composed">
        <h2>Standort <span class="optional">(optional)</span></h2>
        <UIModelComposer
          v-if="uiModels && setupValue?.location"
          :key="`loc-${version}`"
          :ui-model="uiModels.location"
          :model="setupValue.location"
        />
      </section>

      <SummaryStep v-else-if="currentStep.id === 'summary'" @add-type="current = 0" />
    </div>

    <!-- Aus der Menü-Toolbar geöffnet -->
    <OpenMappingDialog
      v-model:open="openMappingOpen"
      @opened="onDocumentOpened"
      @packages-loaded="onPackagesLoaded"
    />
    <UploadDialog v-model:open="uploadOpen" />

    <nav class="nav">
      <button type="button" class="btn" :disabled="current === 0" @click="current--">
        <i class="pi pi-arrow-left" aria-hidden="true"></i>
        Zurück
      </button>
      <span v-if="blockReason" class="hint">
        <i class="pi pi-info-circle" aria-hidden="true"></i>
        {{ blockReason }}
      </span>
      <button
        v-if="current < steps.length - 1"
        type="button"
        class="btn primary next"
        :disabled="!!blockReason"
        @click="current++"
      >
        Weiter
        <i class="pi pi-arrow-right" aria-hidden="true"></i>
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
/**
 * Mehrstufiger Dialog des Mapping-Assistenten. Die Formular-Schritte sind
 * deklarative UIModels (src/assets/wizard-ui/*.xmi), gerendert über den
 * UIModelComposer gegen das Wizard-Fassadenmodell; Upload, Messwert-Tabelle
 * und Zusammenfassung sind dedizierte Komponenten. Besuchte Schritte sind
 * über den Stepper direkt anspringbar.
 */
import { computed, onMounted, ref, shallowRef } from 'vue';
import { UIModelComposer } from '@emfts/uimodel-composer';
import ModelSourceStep from './ModelSourceStep.vue';
import MeasurementsStep from './MeasurementsStep.vue';
import SummaryStep from './SummaryStep.vue';
import { loadWizardUiModels } from './uiModels';
import type { WizardUiModels } from './uiModels';
import OpenMappingDialog from './dialogs/OpenMappingDialog.vue';
import UploadDialog from './dialogs/UploadDialog.vue';
import {
  mappingDocument,
  openDialogOpen,
  restoreWarnings,
  sensorPackages,
  setup,
  statusMessage,
  uploadDialogOpen,
  version,
} from './context';
import type { EPackage } from '@emfts/core';
import { FriendlyNameSource, NameSource, TimestampSource } from '../generated';
import type { FeaturePath } from '../generated';
import { discriminatorPathOf } from '../emf/featurePaths';

const steps = [
  { id: 'model', title: 'Sensormodell' },
  { id: 'identification', title: 'Identifikation' },
  { id: 'timestamp', title: 'Messzeitpunkt' },
  { id: 'measurements', title: 'Messwerte' },
  { id: 'location', title: 'Standort' },
  { id: 'summary', title: 'Zusammenfassung' },
] as const;

const current = ref(0);

const doc = computed(() => mappingDocument.value);
const docIcon = computed(() =>
  doc.value.source === 'atlas' ? 'pi pi-cloud' : doc.value.source === 'file' ? 'pi pi-file-edit' : 'pi pi-plus-circle',
);

const status = computed(() => statusMessage.value);
const uploadOpen = uploadDialogOpen;
const openMappingOpen = openDialogOpen;

/**
 * Aus der Werkzeugleiste geöffnetes Dokument: zum ersten Schritt springen,
 * damit Modell und Nachricht sichtbar sind.
 */
function onDocumentOpened(warnings: string[]): void {
  restoreWarnings.value = warnings;
  current.value = 0;
}

/** Nur Modelle abgelegt: wie eine Modellauswahl behandeln. */
function onPackagesLoaded(packages: EPackage[], warnings: string[]): void {
  sensorPackages.value = packages;
  restoreWarnings.value = warnings;
  current.value = 0;
}
const currentStep = computed(() => steps[current.value]);
const uiModels = shallowRef<WizardUiModels | undefined>(undefined);
const setupValue = computed(() => setup.value);

onMounted(async () => {
  uiModels.value = await loadWizardUiModels();
});

/**
 * Zeigt der Pfad auf das Feld, aus dem der Codec den Payload-Typ liest? Dessen
 * Wert ist je EClass konstant, siehe `discriminatorPathOf`.
 */
function isDiscriminatorPath(path: FeaturePath): boolean {
  const root = setup.value?.sensorClass;
  if (!root) return false;
  const expected = discriminatorPathOf(root);
  if (!expected) return false;
  return path.segments.map((seg) => seg.getName() ?? '?').join('.') === expected;
}

/** Grund, warum "Weiter" gesperrt ist — leer, wenn der Schritt vollständig ist. */
const blockReason = computed<string>(() => {
  const s = setup.value;
  switch (currentStep.value.id) {
    case 'model':
      return s ? '' : 'Bitte laden Sie zuerst ein Sensormodell.';
    case 'identification':
      if (!s?.mappingId?.trim()) return 'Bitte vergeben Sie einen technischen Namen.';
      if (s?.nameSource === NameSource.STATIC) {
        if (!s.nameFallback?.trim()) return 'Bitte geben Sie einen festen Namen für den Sensor an.';
      } else if (!s?.namePath) {
        return 'Bitte wählen Sie das Feld mit dem Namen des Sensors.';
      } else if (isDiscriminatorPath(s.namePath)) {
        // Die Typkennung des Payloads ist je EClass konstant: als Provider-Name
        // faellt jeder Sensor auf denselben Twin und überschreibt die anderen.
        return 'Das gewählte Namensfeld ist die Typkennung des Payloads und damit für alle Sensoren gleich. Bitte wählen Sie ein Feld, das den einzelnen Sensor identifiziert.';
      }
      if (s?.friendlyNameSource === FriendlyNameSource.FROM_FIELD && !s.friendlyNamePath)
        return 'Bitte wählen Sie das Feld mit dem Anzeigenamen.';
      if (s?.friendlyNameSource === FriendlyNameSource.STATIC && !s.friendlyName?.trim())
        return 'Bitte geben Sie den festen Anzeigenamen an.';
      return '';
    case 'timestamp':
      if (s?.timestamp?.source === TimestampSource.DEVICE_TIME && !s.timestamp.path)
        return 'Bitte wählen Sie das Feld mit dem Messzeitpunkt.';
      return '';
    case 'measurements':
      return s?.measurements.some((m) => m.selected)
        ? ''
        : 'Bitte wählen Sie mindestens einen Messwert aus.';
    default:
      return '';
  }
});
</script>

<style scoped>
.wizard {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-width: 72rem;
  padding: 1.25rem 1.5rem;
  color: var(--text-color, #1a1a1a);
}

/* Stepper */
.doc-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 0.5rem 0.75rem; border-radius: 8px; flex-wrap: wrap;
  background: var(--surface-hover, #f4f5f7);
  border: 1px solid var(--surface-border, #e3e3e3);
}
.doc-bar .doc { display: inline-flex; align-items: baseline; gap: 0.5rem; min-width: 0; }
.doc-bar .doc .pi { color: var(--text-color-secondary, #777); align-self: center; }
.doc-bar .doc.atlas .pi { color: var(--primary-color, #1a56a0); }
.doc-bar .doc strong { overflow-wrap: anywhere; }
.doc-bar .doc small { color: var(--text-color-secondary, #777); font-size: 0.82rem; }
.doc-bar .status {
  display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.88rem;
  padding: 0.2rem 0.5rem; border-radius: 6px;
}
.doc-bar .status.ok { color: #2f9e44; background: color-mix(in srgb, #2f9e44 12%, transparent); }
.doc-bar .status.error { color: #e5484d; background: color-mix(in srgb, #e5484d 12%, transparent); }

.doc-bar .btn.ghost {
  display: inline-flex; align-items: center; gap: 0.4rem; font: inherit; font-size: 0.9rem;
  padding: 0.35rem 0.7rem; cursor: pointer; border-radius: 6px;
  border: 1px solid transparent; background: none; color: var(--text-color-secondary, #666);
}
.doc-bar .btn.ghost:hover {
  border-color: var(--surface-border, #ccc);
  background: var(--surface-card, #fff);
  color: var(--text-color, #1a1a1a);
}

.steps {
  display: flex;
  align-items: center;
  list-style: none;
  padding: 0;
  margin: 0;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.steps li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-color-secondary, #666);
  font-size: 0.9rem;
  user-select: none;
}
.steps li .dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  font-size: 0.8rem;
  font-weight: 600;
  background: var(--surface-hover, #eee);
  color: var(--text-color-secondary, #666);
  border: 1px solid var(--surface-border, #ddd);
  flex-shrink: 0;
}
.steps li.active { color: var(--text-color, #1a1a1a); font-weight: 600; }
.steps li.active .dot {
  background: var(--primary-color, #1a56a0);
  border-color: var(--primary-color, #1a56a0);
  color: var(--primary-color-text, #fff);
}
.steps li.done .dot {
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 15%, transparent);
  border-color: var(--primary-color, #1a56a0);
  color: var(--primary-color, #1a56a0);
}
.steps li.done .dot .pi { font-size: 0.7rem; }
.steps li.clickable { cursor: pointer; }
.steps li.clickable:hover .step-title { color: var(--primary-color, #1a56a0); }
.connector {
  width: 2rem;
  height: 1px;
  background: var(--surface-border, #ddd);
  margin: 0 0.35rem;
}

.body { min-height: 20rem; }
.composed { display: flex; flex-direction: column; gap: 0.75rem; max-width: 44rem; }
/* Abstände der UIModel-Formulare (FormViewComposer rendert ohne Layout) */
.composed :deep(.uimodel-form-view) {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  max-width: 30rem;
}
.composed h2 { margin: 0; font-size: 1.25rem; }
.lead { margin: 0; color: var(--text-color-secondary, #666); }
.optional { font-weight: 400; color: var(--text-color-muted, #999); font-size: 0.9em; }

/* Fußnavigation */
.nav {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid var(--surface-border, #ddd);
}
.nav .next { margin-left: auto; }
.nav .hint {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--text-color-secondary, #8a6d00);
  font-size: 0.9rem;
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
  transition: background 0.15s, border-color 0.15s;
}
.btn:hover:not(:disabled) { background: var(--surface-hover, #f0f0f0); }
.btn.primary {
  background: var(--primary-color, #1a56a0);
  color: var(--primary-color-text, #fff);
  border-color: var(--primary-color, #1a56a0);
}
.btn.primary:hover:not(:disabled) {
  background: var(--primary-color-hover, #1a56a0);
  border-color: var(--primary-color-hover, #1a56a0);
}
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn .pi { font-size: 0.85rem; }
.btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--primary-color, #1a56a0) 50%, transparent);
  outline-offset: 2px;
}
</style>
