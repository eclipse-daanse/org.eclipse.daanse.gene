<template>
  <BaseDialog
    :open="open"
    title="Welche Nachricht sendet Ihr Sensor?"
    subtitle="Die Klasse, die eine vollständige Nachricht beschreibt — Vorschläge stehen oben."
    icon="pi pi-sitemap"
    width="38rem"
    @update:open="$emit('update:open', $event)"
  >
    <label v-if="candidates.length > 8" class="search">
      <i class="pi pi-search" aria-hidden="true"></i>
      <input v-model="query" type="search" placeholder="Klasse suchen …" />
    </label>

    <p v-if="filtered.length === 0" class="empty">Keine Klasse passt zu „{{ query }}“.</p>
    <ul v-else class="list">
      <li v-for="c in filtered" :key="c.key">
        <button type="button" :class="{ current: c.key === currentKey }" @click="pick(c)">
          <span class="icon"><i class="pi pi-sitemap" aria-hidden="true"></i></span>
          <span class="text">
            <strong>{{ c.eClass.getName() }}</strong>
            <small>
              {{ c.eClass.getEPackage()?.getName() }}
              <template v-if="c.measurementCount !== undefined">
                ·
                {{ c.measurementCount === 0 ? 'keine Messwerte' : `${c.measurementCount} Messwert(e)` }}
              </template>
            </small>
          </span>
          <span v-if="c.isRoot" class="tag">Nachricht</span>
          <i v-if="c.key === currentKey" class="pi pi-check current-mark" aria-hidden="true"></i>
        </button>
      </li>
    </ul>
  </BaseDialog>
</template>

<script setup lang="ts">
/**
 * Auswahl der Nachrichtenklasse (T23/#195). Bewusst eigener Dialog statt des
 * `ClassPickerDialog` aus ui-model-browser: Der Service ist beim Rendern des
 * Panels nicht verlässlich da, und hier geht es nur um die Klassen des einen
 * geladenen Modells — Wurzel-Kandidaten zuerst.
 */
import { computed, ref } from 'vue';
import type { EClass } from '@emfts/core';
import BaseDialog from './BaseDialog.vue';

export interface ClassCandidate {
  key: string;
  label: string;
  eClass: EClass;
  isRoot?: boolean;
  /** Zahl der Messwert-Kandidaten (Zahlen-/Wahrheitswerte) darunter. */
  measurementCount?: number;
}

const props = defineProps<{
  open: boolean;
  candidates: ClassCandidate[];
  currentKey?: string;
}>();
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'select', candidate: ClassCandidate): void;
}>();

const query = ref('');

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = q
    ? props.candidates.filter((c) => c.label.toLowerCase().includes(q))
    : props.candidates;
  // Wurzel-Kandidaten (nirgends Containment-Ziel) zuerst — das sind die
  // Klassen, die als vollständige Nachricht in Frage kommen.
  return [...list].sort((a, b) => Number(!!b.isRoot) - Number(!!a.isRoot));
});

function pick(candidate: ClassCandidate): void {
  emit('select', candidate);
  emit('update:open', false);
}
</script>

<style scoped>
.search {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.7rem; border-radius: 6px;
  border: 1px solid var(--input-border, var(--surface-border, #c0c4cc));
  background: var(--input-bg, #fff);
}
.search .pi { color: var(--text-color-muted, #999); }
.search input { flex: 1; border: none; background: none; font: inherit; color: inherit; outline: none; }
.empty { margin: 0; color: var(--text-color-secondary, #666); font-size: 0.9rem; }

.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.list button {
  display: flex; align-items: center; gap: 0.7rem; width: 100%; text-align: left;
  font: inherit; padding: 0.5rem 0.65rem; cursor: pointer;
  border: 1px solid var(--surface-border, #e3e3e3); border-radius: 8px;
  background: var(--surface-card, #fff); color: var(--text-color, inherit);
  transition: border-color 0.15s, background 0.15s;
}
.list button:hover {
  border-color: var(--primary-color, #1a56a0);
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 4%, var(--surface-card, #fff));
}
.list button.current { border-color: var(--primary-color, #1a56a0); }
.icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.9rem; height: 1.9rem; border-radius: 6px; flex-shrink: 0;
  color: var(--primary-color, #1a56a0);
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 10%, transparent);
}
.text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.text small { color: var(--text-color-secondary, #777); font-size: 0.8rem; }
.tag {
  font-size: 0.72rem; padding: 0.1rem 0.45rem; border-radius: 999px;
  color: var(--primary-color, #1a56a0);
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 12%, transparent);
}
.current-mark { color: var(--primary-color, #1a56a0); }
</style>
