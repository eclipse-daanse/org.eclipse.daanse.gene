<script setup lang="ts">
/**
 * One ObjectRow of the context view (PH-1, PH-2, PH-5).
 *
 * Left the gutter with one line per ancestor - the outermost for the context
 * object - and the +/- of the row's own subtree. Right of it the Row: Body
 * (fields, text, columns table) and RightRail (validation, actions).
 * Rows stand one below the other, never inside each other; only the lines
 * tell the hierarchy.
 */
import { computed } from 'tsm:vue'
import type { ContextRow } from '../composables/contextView'
import { displayName, parentOf } from '../composables/contextView'
import { className, isTable, objectSlug, tableView } from '../composables/documentation'
import { fieldsOf, textOf } from '../composables/rowContent'
import ColumnsTable from './ColumnsTable.vue'

const props = defineProps<{
  row: ContextRow
  /** The context object, owner of the outermost line */
  context: any
  /** Stripe slots in the gutter - the deepest row on the page plus the context line */
  gutter: number
  expanded: boolean
  selected: boolean
  /** Model version, read to re-render after edits */
  version?: number
}>()

const emit = defineEmits<{
  toggle: []
  select: [object: any]
}>()

/** Width of one line slot in the gutter */
const SLOT = 12

const id = computed(() => `cwm.Editor.ContextView.ObjectRow@${props.row.slug}`)

/** Lines from outside in: the context object (level -1), then each ancestor */
const lines = computed(() => [
  { level: -1, testId: `${id.value}.Line@context`, owner: props.context },
  ...props.row.ancestors.map((a, i) => ({ level: i, testId: `${id.value}.Line@${objectSlug(a)}`, owner: a }))
])

/** Darker outside, lighter inside */
function lineColor(level: number): string {
  const strength = Math.max(18, 60 - (level + 1) * 9)
  return `color-mix(in srgb, var(--text-color-secondary) ${strength}%, transparent)`
}

function lineTitle(owner: any, level: number): string {
  const parent = parentOf(owner)
  const parentText = parent ? `${className(parent)} ${displayName(parent)}` : '–'
  return `${className(owner)} ${displayName(owner)} · Ebene ${level} · Eltern: ${parentText}`
}

const fields = computed(() => {
  void props.version
  return fieldsOf(props.row.object)
})

const text = computed(() => {
  void props.version
  return textOf(props.row.object)
})

const table = computed(() => {
  void props.version
  return isTable(props.row.object) ? tableView(props.row.object) : null
})
</script>

<template>
  <div
    class="object-row"
    :class="{ selected }"
    :data-testid="id"
    data-wire-kind="LIST"
    :data-depth="row.depth"
  >
    <div class="gutter" :style="{ width: `${gutter * SLOT}px` }" :data-testid="`${id}.Lines`">
      <span
        v-for="line in lines"
        :key="line.level"
        class="line"
        :data-testid="line.testId"
        :data-level="line.level"
        :title="lineTitle(line.owner, line.level)"
        :style="{ left: `${(line.level + 1) * SLOT + SLOT / 2 - 1}px`, background: lineColor(line.level) }"
      ></span>
      <button
        v-if="row.hasChildren"
        class="toggle"
        type="button"
        :data-testid="`${id}.Toggle`"
        :aria-expanded="expanded"
        :title="expanded ? 'Teilbaum einklappen' : 'Teilbaum ausklappen'"
        :style="{ left: `${(row.depth + 1) * SLOT}px` }"
        @click="emit('toggle')"
      >{{ expanded ? '−' : '+' }}</button>
    </div>

    <div class="row" :data-testid="`${id}.Row`">
      <div class="body" :data-testid="`${id}.Row.Body`">
        <header class="row-title" @click="emit('select', row.object)">
          <span class="kind">{{ row.kind }}</span>
          <span class="name">{{ row.name }}</span>
        </header>

        <dl v-if="fields.length" class="fields" :data-testid="`${id}.Row.Body.Fields`" data-wire-kind="INPUT">
          <template v-for="f in fields" :key="f.name">
            <dt>{{ f.label }}</dt>
            <dd>{{ f.value }}</dd>
          </template>
        </dl>
        <div v-else class="fields empty" :data-testid="`${id}.Row.Body.Fields`" data-wire-kind="INPUT"></div>

        <div class="text-view" :data-testid="`${id}.Row.Body.TextView`" data-wire-kind="TEXT">
          <p v-for="(p, i) in text" :key="i">{{ p }}</p>
        </div>

        <ColumnsTable
          v-if="table && table.columns.length > 0"
          :table="table"
          :test-id="`${id}.Row.Body.Columns`"
          data-wire-kind="TABLE"
          @navigate="emit('select', $event)"
        />
      </div>

      <div class="right-rail" :data-testid="`${id}.Row.RightRail`">
        <!-- Filled in step 3 (PH-4): OCL result and the actions registry per EClass -->
        <span class="badge" :data-testid="`${id}.Row.RightRail.Validation`" data-wire-kind="BADGE" title="Noch nicht geprüft">OCL –</span>
        <button
          class="actions"
          type="button"
          disabled
          :data-testid="`${id}.Row.RightRail.Actions`"
          data-wire-kind="CONTROL"
          title="Aktionen folgen"
        >Aktionen ▾</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.object-row {
  display: flex;
  align-items: stretch;
  /* Keeps the row title clear of the sticky header when scrolled to */
  scroll-margin-top: 3rem;
}

.gutter {
  position: relative;
  flex: 0 0 auto;
}

/* Lines run the full row height; adjacent rows join them into one line */
.line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  cursor: help;
}

.toggle {
  position: absolute;
  top: 0.55rem;
  width: 12px;
  height: 12px;
  padding: 0;
  line-height: 10px;
  font-size: 11px;
  border: 1px solid var(--surface-border);
  border-radius: 2px;
  background: var(--surface-card, var(--surface-ground));
  color: var(--text-color-secondary);
  cursor: pointer;
  z-index: 1;
}

.row {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  gap: 0.75rem;
  padding: 0.5rem 0.5rem 0.75rem;
  border-bottom: 1px solid var(--surface-border);
}

.object-row.selected .row {
  background: color-mix(in srgb, var(--primary-color) 7%, transparent);
}

.body {
  flex: 10 1 auto;
  min-width: 0;
}

.row-title {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  cursor: pointer;
}

.row-title .kind {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
}

.row-title .name {
  font-weight: 600;
  color: var(--text-color);
}

.fields {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.1rem 0.75rem;
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
}

.fields.empty {
  display: none;
}

.fields dt {
  color: var(--text-color-secondary);
}

.fields dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.text-view p {
  margin: 0.35rem 0 0;
  line-height: 1.5;
  white-space: pre-wrap;
}

.right-rail {
  flex: 0 0 7rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.3rem;
}

.badge,
.actions {
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  border: 1px solid var(--surface-border);
  color: var(--text-color-secondary);
  background: transparent;
  text-align: center;
}

.actions:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
