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
      <EntitiesStep v-else-if="currentStep.id === 'entities'" />
      <ColumnsStep v-else-if="currentStep.id === 'columns'" />
      <RelationsStep v-else-if="currentStep.id === 'relations'" />
      <SummaryStep v-else-if="currentStep.id === 'summary'" />
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
 * Mehrstufiger Dialog des eorm-Assistenten: Modell wählen → Klassen/Tabellen →
 * Spalten → Beziehungen → Zusammenfassung (Download/Veröffentlichen).
 * Besuchte Schritte sind über den Stepper direkt anspringbar.
 */
import { computed, ref } from 'vue';
import ModelSourceStep from './ModelSourceStep.vue';
import EntitiesStep from './EntitiesStep.vue';
import ColumnsStep from './ColumnsStep.vue';
import RelationsStep from './RelationsStep.vue';
import SummaryStep from './SummaryStep.vue';
import { setup, version } from './context';
import { AttributeRole } from '../generated';

const steps = [
  { id: 'model', title: 'Modell' },
  { id: 'entities', title: 'Klassen' },
  { id: 'columns', title: 'Spalten' },
  { id: 'relations', title: 'Beziehungen' },
  { id: 'summary', title: 'Zusammenfassung' },
] as const;

const current = ref(0);
const currentStep = computed(() => steps[current.value]);

/** Grund, warum "Weiter" gesperrt ist — leer, wenn der Schritt vollständig ist. */
const blockReason = computed<string>(() => {
  void version.value;
  const s = setup.value;
  switch (currentStep.value.id) {
    case 'model':
      return s ? '' : 'Bitte laden Sie zuerst ein EMF-Modell.';
    case 'entities': {
      const selected = (s?.entities ?? []).filter((e) => e.selected);
      if (selected.length === 0) return 'Bitte wählen Sie mindestens eine Klasse aus.';
      const noTable = selected.find((e) => !e.tableName?.trim());
      return noTable ? `Bitte einen Tabellennamen für „${noTable.targetClass.getName()}" angeben.` : '';
    }
    case 'columns': {
      const withoutId = (s?.entities ?? [])
        .filter((e) => e.selected)
        .find((e) => !e.attributes.some((a) => a.selected && a.role === AttributeRole.ID));
      return withoutId
        ? `„${withoutId.targetClass.getName()}" braucht einen Schlüssel — bitte ein Attribut als Schlüssel markieren.`
        : '';
    }
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
