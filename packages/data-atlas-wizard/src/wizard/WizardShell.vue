<template>
  <div class="wizard">
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

      <section v-else-if="currentStep.id === 'instance'" class="composed">
        <h2>Instanz &amp; Modus</h2>
        <p class="lead">{{ currentStep.lead }}</p>
        <UIModelComposer
          v-if="uiModels && setupValue"
          :key="`instance-${version}`"
          :ui-model="uiModels.instance"
          :model="setupValue"
        />
      </section>

      <section v-else-if="currentStep.id === 'source'" class="composed">
        <h2>Datenquelle</h2>
        <p class="lead">{{ currentStep.lead }}</p>
        <!--
          Zwei Formulare im selben UIModel; welches gilt, entscheidet
          inputKind. Getrennt, weil ein FormView genau eine Zielklasse
          bedient und die beiden Quellen verschiedene Objekte sind.
        -->
        <UIModelComposer
          v-if="uiModels && istDatei && setupValue?.fileSource"
          :key="`file-${version}`"
          :ui-model="uiModels.source"
          :model="setupValue.fileSource"
        />
        <UIModelComposer
          v-else-if="uiModels && !istDatei && setupValue?.databaseSource"
          :key="`db-${version}`"
          :ui-model="uiModels.source"
          :model="setupValue.databaseSource"
        />
      </section>

      <section v-else-if="currentStep.id === 'service'" class="composed">
        <h2>Endpunkt</h2>
        <p class="lead">{{ currentStep.lead }}</p>
        <UIModelComposer
          v-if="uiModels && setupValue"
          :key="`service-${version}`"
          :ui-model="uiModels.service"
          :model="setupValue"
        />
      </section>

      <DatasetsStep v-else-if="currentStep.id === 'datasets'" />
      <ExportsStep v-else-if="currentStep.id === 'exports'" />
      <SummaryStep v-else-if="currentStep.id === 'summary'" />

      <p v-if="ladefehler" class="fehler">{{ ladefehler }}</p>
    </div>

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
 * Mehrstufiger Dialog des Data-Atlas-Assistenten.
 *
 * Die sieben Schritte stehen fest (Plan, Abschnitt 3); ihre Inhalte und die
 * `blockReason`-Prüfung je Schritt kommen später. Besuchte Schritte sind über
 * den Stepper anspringbar — dasselbe Verhalten wie im eorm-Assistenten.
 */
import { computed, onMounted, ref, shallowRef } from 'vue';
import { UIModelComposer } from '@emfts/uimodel-composer';
import { loadWizardUiModels, type WizardUiModels } from './uiModels';
import ModelSourceStep from './ModelSourceStep.vue';
import DatasetsStep from './DatasetsStep.vue';
import ExportsStep from './ExportsStep.vue';
import SummaryStep from './SummaryStep.vue';
import { setup, version } from './context';
import { InputKind } from '../generated';

const steps = [
  {
    id: 'model',
    title: 'Modell',
    lead: 'Domänenmodell aus dem Model Atlas laden oder eine .ecore hochladen.',
  },
  {
    id: 'instance',
    title: 'Instanz & Modus',
    lead: 'Name der Data-Atlas-Instanz, und wo die Konfiguration später liegt.',
  },
  {
    id: 'source',
    title: 'Datenquelle',
    lead: 'Datei oder Datenbank — und bei JPA, ob das Mapping abgeleitet oder importiert wird.',
  },
  {
    id: 'datasets',
    title: 'Datensätze',
    lead: 'Welche Klassen des Modells werden als Datensatz veröffentlicht.',
  },
  {
    id: 'service',
    title: 'Endpunkt',
    lead: 'Basis-Pfad, OpenAPI und die Namen der Pagination-Parameter.',
  },
  {
    id: 'exports',
    title: 'Formate',
    lead: 'JSON, XML, CSV oder CSV-ZIP — leer bedeutet die Runtime-Defaults.',
  },
  {
    id: 'summary',
    title: 'Zusammenfassung',
    lead: 'Prüfliste, XMI-Vorschau, Download und Veröffentlichen in den Model Atlas.',
  },
] as const;

const current = ref(0);
const currentStep = computed(() => steps[current.value]);

const uiModels = shallowRef<WizardUiModels | undefined>(undefined);
const ladefehler = ref('');

onMounted(async () => {
  try {
    uiModels.value = await loadWizardUiModels();
  } catch (e) {
    ladefehler.value = e instanceof Error ? e.message : String(e);
  }
});

/*
 * EMF-Objekte sind nicht deep-reaktiv: jedes computed, das am Modell liest,
 * beginnt mit `void version.value` und wird über touch() angestoßen.
 */
const setupValue = computed(() => {
  void version.value;
  return setup.value;
});

const istDatei = computed(() => {
  void version.value;
  return setup.value?.inputKind !== InputKind.DATABASE;
});

/**
 * Grund, warum „Weiter" gesperrt ist — leer, wenn der Schritt vollständig ist.
 * Bewusst nur das Nötigste je Schritt; die vollständige Prüfung macht der
 * Transformer (src/transform/validate.ts) vor dem Schreiben.
 */
const blockReason = computed<string>(() => {
  void version.value;
  const s = setup.value;
  if (!s) return currentStep.value.id === 'model' ? 'Bitte wählen Sie ein Domänenmodell.' : '';
  switch (currentStep.value.id) {
    case 'instance':
      return s.instanceName?.trim() ? '' : 'Bitte geben Sie einen Namen für die Instanz an.';
    case 'source':
      if (istDatei.value) {
        return s.fileSource?.fileUri?.trim() ? '' : 'Bitte geben Sie den Pfad der Datendatei an.';
      }
      return s.databaseSource?.dataSourceFilter?.trim()
        ? ''
        : 'Bitte geben Sie den Filter der DataSource an.';
    case 'datasets':
      return s.datasets.some((d) => d.selected) ? '' : 'Bitte wählen Sie mindestens einen Datensatz.';
    case 'service':
      if (!s.urlContext?.trim()) return 'Bitte geben Sie den Basis-Pfad an.';
      return s.serviceName?.trim() ? '' : 'Bitte geben Sie einen Namen für den Endpunkt an.';
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
  color: var(--text-color, #1a1a1a);
}

/* Stepper */
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
.composed h2 { margin: 0; font-size: 1.25rem; }
/* Die FormViewComposer rendert ohne eigenes Layout */
.composed :deep(.uimodel-form-view) {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  max-width: 30rem;
}
.fehler { color: #b00020; }
.nav .hint {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--text-color-secondary, #8a6d00);
  font-size: 0.9rem;
}
.lead { margin: 0; color: var(--text-color-secondary, #666); }

/* Fußnavigation */
.nav {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid var(--surface-border, #ddd);
}
.nav .next { margin-left: auto; }

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
