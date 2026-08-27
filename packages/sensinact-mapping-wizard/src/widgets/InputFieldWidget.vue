<template>
  <div class="ifw">
    <label :for="fieldId">
      {{ label }}
      <span v-if="required" class="required" aria-hidden="true">*</span>
    </label>
    <input
      :id="fieldId"
      :type="inputType"
      :step="inputType === 'number' ? 'any' : undefined"
      :placeholder="placeholder"
      :readonly="readOnly"
      :value="displayValue"
      @input="onInput"
      @change="onCommit"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Eingabefeld für String-/Zahl-Attribute in den UIModel-Formular-Schritten.
 * Ersetzt die Default-Editoren der vue-registry, die das UIModel-Label
 * ignorieren (sie zeigen "featureName (EType)") — hier gelten Label,
 * Placeholder und required aus dem UIModel-Widget (custom.rawWidget /
 * custom.resolvedStyle), gerendert im gene-Design.
 */
import { computed } from 'vue';
import type { EObject, EStructuralFeature } from '@emfts/core';
import { touch } from '../wizard/context';

interface WidgetContext {
  resolvedStyle?: { label?: string; readOnly?: boolean; required?: boolean };
  rawWidget?: { label?: string; placeholder?: string; required?: boolean };
}

const props = defineProps<{
  eObject: EObject;
  feature: EStructuralFeature;
  eClass?: unknown;
  custom?: WidgetContext;
}>();

const label = computed(
  () =>
    props.custom?.resolvedStyle?.label ||
    props.custom?.rawWidget?.label ||
    props.feature.getName() ||
    'Wert',
);
const placeholder = computed(() => props.custom?.rawWidget?.placeholder ?? '');
const required = computed(
  () => props.custom?.rawWidget?.required ?? props.custom?.resolvedStyle?.required ?? false,
);
const readOnly = computed(() => props.custom?.resolvedStyle?.readOnly ?? false);
const fieldId = computed(() => `ifw-${props.feature.getName()}`);

const isNumeric = computed(() => {
  const typeName = props.feature.getEType()?.getName() ?? '';
  return ['EInt', 'EDouble', 'EFloat', 'ELong', 'EShort'].includes(typeName);
});
const inputType = computed(() => (isNumeric.value ? 'number' : 'text'));

const displayValue = computed(() => {
  const value = props.eObject.eGet(props.feature);
  return value == null ? '' : String(value);
});

// Wert bei jedem Tastendruck ins Modell schreiben, das Wizard-Re-Rendering
// (touch → :key-Wechsel der composed Steps) aber erst beim Verlassen des
// Felds anstoßen — sonst verliert das Feld nach jedem Zeichen den Fokus.
function onInput(event: Event): void {
  if (readOnly.value) return;
  const raw = (event.target as HTMLInputElement).value;
  if (isNumeric.value) {
    const parsed = raw === '' ? null : Number(raw);
    if (parsed !== null && Number.isNaN(parsed)) return;
    props.eObject.eSet(props.feature, parsed);
  } else {
    props.eObject.eSet(props.feature, raw);
  }
}

function onCommit(): void {
  touch();
}
</script>

<style scoped>
.ifw {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.ifw label {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-color-secondary, #666);
}
.required { color: #e5484d; margin-left: 0.15rem; }
.ifw input {
  padding: 0.45rem 0.6rem;
  font: inherit;
  border-radius: 6px;
  border: 1px solid var(--input-border, var(--surface-border, #c0c4cc));
  background: var(--input-bg, #fff);
  color: var(--input-text, var(--text-color, inherit));
  transition: border-color 0.15s;
  max-width: 30rem;
}
.ifw input::placeholder { color: var(--input-placeholder, #999); }
.ifw input:hover:not(:read-only) { border-color: var(--primary-color, #1a56a0); }
.ifw input:focus-visible {
  outline: none;
  border-color: var(--primary-color, #1a56a0);
}
.ifw input:read-only { opacity: 0.7; }
</style>
