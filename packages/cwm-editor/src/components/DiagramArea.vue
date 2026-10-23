<script setup lang="ts">
/**
 * Diagram area of an ObjectRow (PH-10): first element of the body.
 *
 * Shows the diagram's name; where a diagram definition exists (the ERD of a
 * schema, its tables and views; the class diagram of a package, its classes,
 * associations and data types) "anzeigen" draws it in the row. The
 * expand switch fills the whole window and adds a toolbar; collapsing returns
 * it to the row (FR-4.7). Diagrams are drawn only on demand - a context view
 * holds hundreds of rows.
 */
import { computed, inject, ref } from 'tsm:vue'
import CwmDiagram from './CwmDiagram.vue'
import { hasDiagram } from '../composables/diagrams'
import { CWM_EDITING } from '../composables/editing'

const props = defineProps<{
  /** "Table customer" */
  title: string
  /** The row's object */
  object: any
  testId: string
}>()

const editing = inject(CWM_EDITING)!

const expanded = ref(false)
const shown = ref(false)

/* Whether a definition binds the class is decided when drawing; the registry gives the area */
const drawable = computed(() => hasDiagram(props.object))
const drawing = computed(() => drawable.value && (shown.value || expanded.value))

function select(o: any): void {
  expanded.value = false
  editing.select(o)
}
</script>

<template>
  <!-- Full screen leaves the row for the page: rows clip what reaches outside them -->
  <Teleport to="body" :disabled="!expanded">
  <div class="diagram" :class="{ expanded, drawing }" :data-testid="testId" data-wire-kind="REGION">
    <div v-if="expanded" class="toolbar">
      <span class="tool-title">Diagramm: {{ title }}</span>
      <span class="tool-hint">Ein Klick auf einen Knoten wählt sein Objekt.</span>
    </div>
    <div class="head">
      <i class="pi pi-sitemap"></i>
      <span>Diagramm: {{ title }}</span>
      <button
        v-if="drawable && !expanded"
        type="button"
        class="toggle"
        :data-testid="`${testId}.Show`"
        @click="shown = !shown"
      >{{ shown ? 'ausblenden' : 'anzeigen' }}</button>
    </div>
    <div v-if="drawing" class="canvas">
      <CwmDiagram :object="object" :fill="expanded" @select="select" />
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
  </Teleport>
</template>

<style scoped>
.diagram {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0.35rem 0;
  padding: 0.4rem 0.5rem;
  border: 1px dashed var(--surface-border);
  border-radius: 4px;
  font-size: 0.8rem;
  color: var(--text-color-secondary);
}

.head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.6rem;
  padding-right: 6rem;
}

.toggle {
  font: inherit;
  font-size: 0.75rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--primary-color);
  cursor: pointer;
}

/* In the row the diagram sizes itself to the graph's proportions */
.canvas {
  display: flex;
}

.expand {
  position: absolute;
  top: 0.4rem;
  right: 0.5rem;
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
  padding: 0;
  gap: 0;
  background: var(--surface-ground);
}

.diagram.expanded .head {
  display: none;
}

.diagram.expanded .canvas {
  flex: 1 1 auto;
  height: auto;
}

.diagram.expanded .expand {
  top: 0.5rem;
  right: 0.75rem;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  padding-right: 8rem;
  border-bottom: 1px solid var(--surface-border);
  background: var(--surface-card, var(--surface-ground));
}

.tool-title {
  font-weight: 600;
  color: var(--text-color);
}
</style>
