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
      <!--
        Gerüst: je Schritt steht hier noch der Platzhalter mit dem Verweis auf
        die Stelle im Plan, die ihn beschreibt. Die Schritte selbst kommen in
        Schritt 8 der Umsetzungsreihenfolge.
      -->
      <section class="placeholder">
        <h2>{{ currentStep.title }}</h2>
        <p class="lead">{{ currentStep.lead }}</p>
        <p class="todo">
          <i class="pi pi-wrench" aria-hidden="true"></i>
          Noch nicht umgesetzt — {{ currentStep.plan }}
        </p>
      </section>
    </div>

    <nav class="nav">
      <button type="button" class="btn" :disabled="current === 0" @click="current--">
        <i class="pi pi-arrow-left" aria-hidden="true"></i>
        Zurück
      </button>
      <button
        v-if="current < steps.length - 1"
        type="button"
        class="btn primary next"
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
import { computed, ref } from 'vue';

const steps = [
  {
    id: 'model',
    title: 'Modell',
    lead: 'Domänenmodell aus dem Model Atlas laden oder eine .ecore hochladen.',
    plan: 'Abschnitt 3, Schritt 1 (Vorlage: eorm-wizard/ModelSourceStep.vue)',
  },
  {
    id: 'instance',
    title: 'Instanz & Modus',
    lead: 'Name der Data-Atlas-Instanz, und wo die Konfiguration später liegt.',
    plan: 'Abschnitt 3, Schritt 2 (UIModel step-instance.xmi)',
  },
  {
    id: 'source',
    title: 'Datenquelle',
    lead: 'Datei oder Datenbank — und bei JPA, ob das Mapping abgeleitet oder importiert wird.',
    plan: 'Abschnitt 3, Schritt 3 (UIModel step-source.xmi)',
  },
  {
    id: 'datasets',
    title: 'Datensätze',
    lead: 'Welche Klassen des Modells werden als Datensatz veröffentlicht.',
    plan: 'Abschnitt 3, Schritt 4 (Tabelle, Vorlage ColumnsStep.vue)',
  },
  {
    id: 'service',
    title: 'Endpunkt',
    lead: 'Basis-Pfad, OpenAPI und die Namen der Pagination-Parameter.',
    plan: 'Abschnitt 3, Schritt 5 (UIModel step-service.xmi)',
  },
  {
    id: 'exports',
    title: 'Formate',
    lead: 'JSON, XML, CSV oder CSV-ZIP — leer bedeutet die Runtime-Defaults.',
    plan: 'Abschnitt 3, Schritt 6',
  },
  {
    id: 'summary',
    title: 'Zusammenfassung',
    lead: 'Prüfliste, XMI-Vorschau, Download und Veröffentlichen in den Model Atlas.',
    plan: 'Abschnitt 3, Schritt 7 und Abschnitt 5',
  },
] as const;

const current = ref(0);
const currentStep = computed(() => steps[current.value]);
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
.placeholder { display: flex; flex-direction: column; gap: 0.75rem; max-width: 44rem; }
.placeholder h2 { margin: 0; font-size: 1.25rem; }
.lead { margin: 0; color: var(--text-color-secondary, #666); }
.todo {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  padding: 0.6rem 0.8rem;
  border: 1px dashed var(--surface-border, #ddd);
  border-radius: 6px;
  color: var(--text-color-secondary, #8a6d00);
  font-size: 0.9rem;
}

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
