<template>
  <fieldset class="enum-chooser">
    <legend v-if="widgetLabel" class="enum-label">{{ widgetLabel }}</legend>
    <label v-for="opt in options" :key="opt.value" class="enum-option">
      <input
        type="radio"
        :name="groupName"
        :value="opt.value"
        :checked="current === opt.value"
        @change="onSelect(opt.value)"
      />
      <span>{{ opt.label }}</span>
    </label>
  </fieldset>
</template>

<script setup lang="ts">
/**
 * Radio-Auswahl für die Wizard-Enums mit deutschen Beschriftungen.
 * Schreibt den Enum-NAMEN (String, wie vom generierten Modell erwartet) —
 * der Default-EEnumEditor der vue-registry schreibt numerische Werte und
 * passt daher nicht zum Fassadenmodell. Registriert per Feature
 * (TimestampChoice.source, LocationChoice.mode) in register.ts.
 */
import { computed } from 'vue';
import type { EObject, EStructuralFeature } from '@emfts/core';
import { touch } from '../wizard/context';

const props = defineProps<{
  eObject: EObject;
  feature: EStructuralFeature;
  eClass?: unknown;
  custom?: {
    resolvedStyle?: { label?: string };
    rawWidget?: { label?: string };
  };
}>();

/** Beschriftung aus dem UIModel-Widget („Woher kommt der Messzeitpunkt?"). */
const widgetLabel = computed(
  () => props.custom?.resolvedStyle?.label || props.custom?.rawWidget?.label || '',
);

/** Beschriftungen je Feature (Klasse.Feature → Wert → Label). */
const LABELS: Record<string, { value: string; label: string }[]> = {
  'SensorMappingSetup.nameSource': [
    { value: 'FROM_FIELD', label: 'Aus einem Feld der Sensordaten' },
    { value: 'STATIC', label: 'Fester Name für alle Nachrichten' },
  ],
  'SensorMappingSetup.friendlyNameSource': [
    { value: 'NONE', label: 'Kein Anzeigename' },
    { value: 'FROM_FIELD', label: 'Aus einem Feld der Sensordaten' },
    { value: 'STATIC', label: 'Fester Anzeigename' },
  ],
  'TimestampChoice.source': [
    { value: 'RECEIVE_TIME', label: 'Empfangszeit verwenden' },
    { value: 'DEVICE_TIME', label: 'Der Zeitpunkt steht in den Sensordaten' },
  ],
  'LocationChoice.mode': [
    { value: 'NONE', label: 'Keine Standortangabe' },
    { value: 'STATIC', label: 'Fester Standort (Koordinaten eingeben)' },
    { value: 'FROM_DATA', label: 'Der Standort steht in den Sensordaten' },
  ],
};

const key = computed(
  () => `${props.eObject.eClass().getName()}.${props.feature.getName()}`,
);
const options = computed(() => LABELS[key.value] ?? []);
const groupName = computed(() => `enum-${key.value}`);
const current = computed(() => String(props.eObject.eGet(props.feature) ?? ''));

function onSelect(value: string): void {
  props.eObject.eSet(props.feature, value);
  touch();
}
</script>

<style scoped>
.enum-chooser {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  border: none;
  padding: 0;
  margin: 0;
  max-width: 30rem;
}
.enum-label {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-color-secondary, #666);
  padding: 0;
  margin-bottom: 0.1rem;
}
.enum-option {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  cursor: pointer;
  padding: 0.6rem 0.9rem;
  border: 1px solid var(--surface-border, #c0c4cc);
  border-radius: 8px;
  background: var(--surface-card, #fff);
  transition: border-color 0.15s, background 0.15s;
}
.enum-option:hover { border-color: var(--primary-color, #1a56a0); }
.enum-option:has(input:checked) {
  border-color: var(--primary-color, #1a56a0);
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 6%, var(--surface-card, #fff));
}
.enum-option input {
  accent-color: var(--primary-color, #1a56a0);
  width: 1rem;
  height: 1rem;
  cursor: pointer;
}
</style>
