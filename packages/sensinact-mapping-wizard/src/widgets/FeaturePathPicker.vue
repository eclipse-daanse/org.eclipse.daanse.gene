<template>
  <div class="fpp">
    <label v-if="label" class="fpp-label">{{ label }}</label>
    <select class="fpp-select" :value="currentKey" @change="onChange">
      <option value="">— kein Feld —</option>
      <option v-for="c in candidates" :key="c.key" :value="c.key">
        {{ c.label }}{{ c.unit ? ` (${c.unit})` : '' }}{{ c.constant ? ' — konstant (Typkennung)' : '' }}
      </option>
    </select>
    <small v-if="currentIsConstant" class="fpp-warn">
      Dieses Feld ist die Typkennung des Payloads und für jede Instanz gleich — alle Sensoren
      würden auf einen Provider zusammenfallen und sich gegenseitig überschreiben.
    </small>
    <small v-if="currentDescription" class="fpp-desc">{{ currentDescription }}</small>
  </div>
</template>

<script setup lang="ts">
/**
 * "Wählen Sie das Feld …" — Auswahl eines Navigationspfads im Sensormodell.
 *
 * Wird über die vue-registry für alle FeaturePath-Referenzen des
 * Wizard-Modells registriert (siehe register.ts) und erhält daher die
 * WidgetComposer-Props (eObject + feature). Die Wertart-Filterung richtet
 * sich nach dem Feature-Namen (namePath → Textfelder usw.).
 */
import { computed } from 'vue';
import type { EObject, EStructuralFeature } from '@emfts/core';
import { enumerateFeaturePaths } from '../emf/featurePaths';
import type { ValueKind } from '../emf/featurePaths';
import { candidateFromPath, sensorClass, touch } from '../wizard/context';
import type { FeaturePath } from '../generated';

const props = defineProps<{
  eObject: EObject;
  feature: EStructuralFeature;
  eClass?: unknown;
  custom?: {
    resolvedStyle?: { label?: string };
    rawWidget?: { label?: string };
  };
}>();

/** Beschriftung aus dem UIModel-Widget („Feld mit dem Namen des Sensors"). */
const label = computed(
  () => props.custom?.resolvedStyle?.label || props.custom?.rawWidget?.label || '',
);

/** Wertarten je Einsatzzweck (Feature-Name im Wizard-Modell). */
const KIND_FILTER: Record<string, ValueKind[]> = {
  namePath: ['STRING'],
  friendlyNamePath: ['STRING'],
  path: ['TEMPORAL', 'STRING', 'NUMERIC'],
  valuePath: ['NUMERIC', 'BOOLEAN'],
  latitudePath: ['NUMERIC'],
  longitudePath: ['NUMERIC'],
  elevationPath: ['NUMERIC'],
};

/** Namens-Hints je Einsatzzweck: passende Kandidaten werden nach oben sortiert. */
const NAME_HINTS: Record<string, string[]> = {
  namePath: ['name', 'id', 'label'],
  friendlyNamePath: ['name', 'label', 'title'],
  path: ['time', 'date', 'timestamp', 'at'],
  latitudePath: ['lat'],
  longitudePath: ['lon', 'lng'],
  elevationPath: ['elev', 'alt', 'height'],
};

/**
 * Bewertet, wie gut ein Feldname zu einem Hint passt. Ein reines
 * Teilstring-Match (`deduplicationId`.includes('id')) wiegt zu leicht: es traf
 * bei einem Sensormodell mit `deduplicationId`, `sensor_id` und `area_id` alle
 * drei gleich stark, sodass die Modell-Reihenfolge entschied und die Typkennung
 * oben stand. Exakte Treffer und Suffixe wiegen darum schwerer, ein konstantes
 * Feld faellt hinter alles zurück.
 */
function hintScore(leaf: string, hints: string[], constant: boolean): number {
  if (constant) return -1;
  let best = 0;
  for (const hint of hints) {
    if (leaf === hint) best = Math.max(best, 3);
    else if (new RegExp(`(^|[_-])${hint}$`).test(leaf)) best = Math.max(best, 2);
    else if (leaf.includes(hint)) best = Math.max(best, 1);
  }
  return best;
}

const candidates = computed(() => {
  const root = sensorClass.value;
  if (!root) return [];
  const featureName = props.feature.getName() ?? '';
  const kinds = KIND_FILTER[featureName] ?? undefined;
  const hints = NAME_HINTS[featureName] ?? [];
  return enumerateFeaturePaths(root, { kinds })
    .map((c) => ({
      ...c,
      key: c.segments.map((s) => s.getName()).join('/'),
      score: hintScore(
        (c.segments[c.segments.length - 1]?.getName() ?? '').toLowerCase(),
        hints,
        c.constant === true,
      ),
    }))
    // Wahrscheinliche Treffer zuerst (z. B. …/latitude im Standort-Picker),
    // Rest in Modell-Reihenfolge — bei großen Modellen (DWD: 44 Kandidaten)
    // stünden sie sonst unauffindbar am Listenende. Die Sortierung ist stabil,
    // gleich bewertete Kandidaten behalten also die Modell-Reihenfolge.
    .sort((a, b) => b.score - a.score);
});

const currentPath = computed<FeaturePath | undefined>(() => {
  const value = props.eObject.eGet(props.feature) as FeaturePath | undefined;
  return value ?? undefined;
});

const currentKey = computed(() =>
  currentPath.value ? currentPath.value.segments.map((s) => s.getName()).join('/') : '',
);

const currentIsConstant = computed(
  () => candidates.value.find((c) => c.key === currentKey.value)?.constant === true,
);

const currentDescription = computed(() => {
  const key = currentKey.value;
  if (!key) return '';
  return candidates.value.find((c) => c.key === key)?.description ?? '';
});

function onChange(event: Event): void {
  const key = (event.target as HTMLSelectElement).value;
  if (!key) {
    props.eObject.eUnset(props.feature);
  } else {
    const candidate = candidates.value.find((c) => c.key === key);
    if (!candidate) return;
    props.eObject.eSet(props.feature, candidateFromPath(candidate));
  }
  touch();
}
</script>

<style scoped>
.fpp {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.fpp-label {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-color-secondary, #666);
}
.fpp-select {
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--input-border, var(--surface-border, #c0c4cc));
  border-radius: 6px;
  font: inherit;
  cursor: pointer;
  background: var(--input-bg, #fff);
  color: var(--input-text, var(--text-color, inherit));
  transition: border-color 0.15s;
}
.fpp-select:hover { border-color: var(--primary-color, #1a56a0); }
.fpp-select:focus-visible {
  outline: none;
  border-color: var(--primary-color, #1a56a0);
}
.fpp-desc {
  color: var(--text-color-secondary, #666);
  font-size: 0.85rem;
}
.fpp-warn {
  color: var(--warning-color, #a35a00);
  font-size: 0.85rem;
}
</style>
