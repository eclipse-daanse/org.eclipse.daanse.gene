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
 * Radio-Auswahl für die Enums der Fassade, mit deutschen Beschriftungen.
 * Schreibt den Enum-NAMEN (String, wie vom generierten Modell erwartet) —
 * der Default-EEnumEditor der vue-registry schreibt numerische Werte und
 * passt daher nicht zum Fassadenmodell. Registriert per Feature in
 * register.ts.
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
  'AtlasSetup.configMode': [
    { value: 'FILE', label: 'Als Datei neben den Modellen' },
    { value: 'ATLAS', label: 'Als Objekt in einem Model-Atlas-Scope' },
  ],
  'AtlasSetup.inputKind': [
    { value: 'FILE', label: 'Aus einer XMI-Datei' },
    { value: 'DATABASE', label: 'Aus einer Datenbank (JPA)' },
  ],
  'DatabaseSourceConfig.mappingKind': [
    { value: 'DERIVED', label: 'Vom Data Atlas ableiten lassen' },
    { value: 'IMPORTED', label: 'Fertiges eorm-Mapping importieren' },
  ],
  'ExportConfig.kind': [
    { value: 'JSON', label: 'JSON' },
    { value: 'XML', label: 'XML' },
    { value: 'CSV', label: 'CSV' },
    { value: 'CSV_ZIP', label: 'CSV, gepackt (ZIP)' },
  ],
};

const key = computed(() => `${props.eObject.eClass().getName()}.${props.feature.getName()}`);

/**
 * Die Auswahl. Ohne Eintrag in LABELS werden die Literale des EEnum
 * angeboten — dank des Fixups (emf.ts#83) stehen sie am Feature. So bleibt
 * ein neues Enum-Feld bedienbar, auch wenn die Beschriftung noch fehlt.
 */
const options = computed<{ value: string; label: string }[]>(() => {
  const beschriftet = LABELS[key.value];
  if (beschriftet) return beschriftet;
  const eType = props.feature.getEType() as unknown as {
    getELiterals?: () => Iterable<{ getName(): string | null }>;
  } | null;
  const literals = eType?.getELiterals?.();
  if (!literals) return [];
  return [...literals].map((l) => ({ value: l.getName() ?? '', label: l.getName() ?? '' }));
});

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
