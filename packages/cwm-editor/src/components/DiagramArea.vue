<script setup lang="ts">
/**
 * Diagram area of an ObjectRow (PH-10): first element of the body.
 *
 * First stage: only the diagram's name. The expand switch fills the whole
 * window and adds a toolbar; collapsing returns it to the row (FR-4.7).
 */
import { ref } from 'tsm:vue'

defineProps<{
  /** "Table customer" */
  title: string
  testId: string
}>()

const expanded = ref(false)
</script>

<template>
  <div class="diagram" :class="{ expanded }" :data-testid="testId" data-wire-kind="REGION">
    <div v-if="expanded" class="toolbar">
      <span class="tool-title">Diagramm: {{ title }}</span>
      <span class="tool-hint">Werkzeuge folgen, sobald feststeht, wie Diagramme entstehen.</span>
    </div>
    <div class="canvas">
      <i class="pi pi-sitemap"></i>
      <span>Diagramm: {{ title }}</span>
    </div>
    <button
      type="button"
      class="expand"
      :data-testid="`${testId}.Expand`"
      data-wire-kind="CONTROL"
      :aria-pressed="expanded"
      :title="expanded ? 'Zurück in die Zeile' : 'Auf das ganze Fenster vergrößern'"
      @click="expanded = !expanded"
    >{{ expanded ? '⤡ Verkleinern' : '⤢ Vollbild' }}</button>
  </div>
</template>

<style scoped>
.diagram {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.6rem;
  margin: 0.35rem 0;
  padding: 0.3rem 0.5rem;
  border: 1px dashed var(--surface-border);
  border-radius: 4px;
  font-size: 0.8rem;
  color: var(--text-color-secondary);
}

.canvas {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.expand {
  font: inherit;
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border: 1px solid var(--surface-border);
  border-radius: 3px;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
}

/* Whole window: above everything, toolbar on top, canvas fills the rest */
.diagram.expanded {
  position: fixed;
  inset: 0;
  z-index: 1000;
  margin: 0;
  border: none;
  border-radius: 0;
  flex-direction: column;
  align-items: stretch;
  padding: 0;
  background: var(--surface-ground);
}

.diagram.expanded .canvas {
  justify-content: center;
  font-size: 1rem;
}

.diagram.expanded .expand {
  position: absolute;
  top: 0.5rem;
  right: 0.75rem;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-card, var(--surface-ground));
}

.tool-title {
  font-weight: 600;
  color: var(--text-color);
}
</style>
