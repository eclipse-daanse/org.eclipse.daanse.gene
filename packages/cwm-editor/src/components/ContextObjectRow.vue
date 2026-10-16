<script setup lang="ts">
/**
 * One ObjectRow of the context view (PH-1, PH-2, PH-5).
 *
 * Left the gutter with a bracket per element: it opens at the element's
 * title and closes after its last descendant, so a row carries the brackets
 * of its ancestors and its own; then the +/- of the row's own subtree. Right of it the Row: Body
 * (diagram, fields, text, columns table, references) and RightRail
 * (validation, actions).
 * Rows stand one below the other, never inside each other; only the lines
 * tell the hierarchy.
 */
import { computed, inject, nextTick, ref } from 'tsm:vue'
import type { ContextRow } from '../composables/contextView'
import { displayName, parentOf, shownByTable } from '../composables/contextView'
import { attr, className, isTable, objectSlug, tableView } from '../composables/documentation'
import { hasDiagram } from '../composables/diagrams'
import { CWM_EDITING } from '../composables/editing'
import { hasAssociationEnds, isAttributeContainer, shownByClass } from '../composables/attributes'
import { hiddenFieldCount, setAttributeFromText } from '../composables/rowContent'
import AttributesTable from './AttributesTable.vue'
import CreateChildDialog from './CreateChildDialog.vue'
import { containmentFeatures } from '../composables/childCreation'
import ColumnsTable from './ColumnsTable.vue'
import DiagramArea from './DiagramArea.vue'
import ReferencesTable from './ReferencesTable.vue'
import RowFields from './RowFields.vue'
import RowDocumentView from './RowDocumentView.vue'
import RowReferenceFields from './RowReferenceFields.vue'
import { hiddenReferenceCount } from '../composables/references'
import RowRightRail from './RowRightRail.vue'
import RowTextView from './RowTextView.vue'

const props = defineProps<{
  row: ContextRow
  /** Depth of the row shown above, -1 for none */
  prevDepth: number
  /** Depth of the row shown below, -1 for none */
  nextDepth: number
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

const editing = inject(CWM_EDITING)!

/* The name as the title; "Bearbeiten" turns it into an input. An empty name unsets it. */
const nameFeature = computed(() => props.row.object.eClass?.()?.getEStructuralFeature?.('name') ?? null)
const nameValue = computed(() => {
  void props.version
  return String(attr(props.row.object, 'name') ?? '')
})
/* ── creating children and siblings ──────────────────────────────── */

/** The dialog's target: a child of the row's object, or a sibling at the row's place */
const creating = ref<{ parent: any; feature?: any; index?: number } | null>(null)

const canHaveChildren = computed(() => {
  void props.version
  return containmentFeatures(props.row.object).length > 0
})

/** A new sibling goes into the same list, right before this row's object */
function createSibling(): void {
  const o = props.row.object
  const parent = parentOf(o)
  const feature = o?.eContainingFeature?.()
  if (!parent || !feature?.isMany?.()) return
  const list = parent.eGet(feature)
  creating.value = { parent, feature, index: list.indexOf(o) }
}

function createChildOf(): void {
  creating.value = { parent: props.row.object }
}

/** Objects that document others show their references (modelElement) below their text */
const referencesBelowText = computed(() => ['Description', 'Document', 'ResponsibleParty'].includes(props.row.kind))

/** The fields table shows all attributes, also unset and hidden ones */
const showAllFields = ref(false)

const hiddenFields = computed(() => {
  void props.version
  return hiddenFieldCount(props.row.object) + hiddenReferenceCount(props.row.object, shown.value)
})

const renaming = ref(false)
const nameDraft = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

async function startRename(): Promise<void> {
  nameDraft.value = nameValue.value
  renaming.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

function finishRename(): void {
  if (!renaming.value) return
  renaming.value = false
  const value = nameDraft.value.trim()
  if (!nameFeature.value || value === nameValue.value) return
  editing.change(() => setAttributeFromText(props.row.object, nameFeature.value, value))
}

function cancelRename(): void {
  renaming.value = false
}

/** The class icon, in its own column inside the card, right of the lines */
const icon = computed(() => editing.iconFor(props.row.object))

/** Width of one line slot in the gutter */
const SLOT = 12

const id = computed(() => `cwm.Editor.ContextView.ObjectRow@${props.row.slug}`)

/** Gap above a row whose sibling (or a sibling's descendant) comes before it */
const GAP = 8

const gap = computed(() => (props.row.depth > 0 && props.prevDepth >= props.row.depth ? GAP : 0))

/**
 * Brackets from outside in: the context object's (level 0), each
 * ancestor's, then the row's own. The own one opens here; a bracket closes
 * in the last row of its element's subtree.
 */
const lines = computed(() =>
  [...props.row.ancestors, props.row.object].map((owner, level) => ({
    level,
    testId: `${id.value}.Line@${level === 0 ? 'context' : objectSlug(owner)}`,
    owner,
    opens: level === props.row.depth,
    closes: props.nextDepth <= level
  }))
)

function lineStyle(line: { level: number; opens: boolean; closes: boolean; owner: any }): Record<string, string> {
  return {
    // On the card's left edge; the ticks lie on its top and bottom edge
    left: `${line.level * SLOT + SLOT / 2}px`,
    top: line.opens ? `${gap.value}px` : '0',
    bottom: '0',
    // The bracket of the row under the pointer, through all its rows
    color: line.owner === editing.hovered.value
      ? 'color-mix(in srgb, var(--primary-color) 55%, transparent)'
      : lineColor(line.level - 1)
  }
}

/**
 * Every element below the context object is a card lying on its parent's:
 * it starts at its own bracket and runs on through all its descendants'
 * rows, so each row paints the cards of all its ancestors and its own.
 * Each card is shaded from the text colour (lighter in dark mode, darker in
 * light mode) - stacked, the deepest lies on top. A card casts its shadow
 * left onto its parent's, and where it ends down onto what follows.
 * Siblings are separate cards with a gap between them.
 */
/** Width of a shadow's soft end, in px */
const SOFT = 10

function layerX(level: number): string {
  return `${level * SLOT + SLOT / 2}px`
}

function shadowColor(level: number): string {
  return `rgba(0, 0, 0, ${Math.min(0.15 + level * 0.04, 0.3).toFixed(2)})`
}

const layerStyle = computed(() => {
  const depth = props.row.depth
  const g = gap.value
  const layers: string[] = []
  // Cards ending in the row above cast their shadow down onto this one,
  // rounded off at the corner left of the bracket
  for (let level = props.prevDepth; level >= Math.max(depth, 1); level--) {
    const x = layerX(level)
    const c = shadowColor(level)
    layers.push(`radial-gradient(farthest-side at 100% 0, ${c}, transparent) calc(${x} - ${SOFT}px) 0 / ${SOFT}px ${SOFT}px no-repeat`)
    layers.push(`linear-gradient(${c}, transparent) ${x} 0 / 100% ${SOFT}px no-repeat`)
  }
  for (let level = depth; level > 0; level--) {
    const x = layerX(level)
    const c = shadowColor(level)
    const shade = `linear-gradient(to right, transparent ${x}, color-mix(in srgb, var(--text-color) var(--layer-shade-step), transparent) ${x})`
    const leftShadow = `linear-gradient(to right, transparent calc(${x} - ${SOFT}px), ${c} ${x}, transparent ${x})`
    if (level < depth) {
      layers.push(leftShadow, shade)
      continue
    }
    // The row's own card starts below the gap; its left shadow fades in at the top corner
    layers.push(`radial-gradient(farthest-side at 100% 100%, ${c}, transparent) calc(${x} - ${SOFT}px) ${g}px / ${SOFT}px ${SOFT}px no-repeat`)
    layers.push(`${leftShadow} 0 ${g + SOFT}px / 100% calc(100% - ${g + SOFT}px) no-repeat`)
    layers.push(`${shade} 0 ${g}px / 100% calc(100% - ${g}px) no-repeat`)
  }
  return layers.length ? { background: layers.join(', ') } : {}
})

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

const table = computed(() => {
  void props.version
  return isTable(props.row.object) ? tableView(props.row.object) : null
})

/** A class (not a table) shows its attributes as a table */
const attributeTable = computed(() => {
  void props.version
  return isAttributeContainer(props.row.object)
})

/** What the row shows in its text, columns or attributes table stays out of its references */
const shown = computed(() => {
  void props.version
  if (isTable(props.row.object)) return shownByTable(props.row.object)
  if (attributeTable.value) return shownByClass(props.row.object)
  return new Set<any>()
})
</script>

<template>
  <div
    class="object-row"
    :class="{ selected }"
    :style="layerStyle"
    :data-testid="id"
    data-wire-kind="LIST"
    :data-depth="row.depth"
    @mouseenter="editing.hovered.value = row.object"
    @mouseleave="editing.hovered.value === row.object && (editing.hovered.value = null)"
  >
    <!-- The gap before a sibling, across the whole row: hovering it offers a new element at this place, on the parent's line -->
    <div v-if="gap" class="gap-add" :style="{ height: `${gap + 6}px` }">
      <button
        type="button"
        class="add-button"
        title="Neues Element hier einfügen"
        :data-testid="`${id}.InsertBefore`"
        :style="{ left: `${(row.depth - 1) * SLOT + SLOT / 2 - 5}px` }"
        @click="createSibling"
      >+</button>
    </div>
    <div class="gutter" :style="{ width: `${(row.depth + 2) * SLOT}px` }" :data-testid="`${id}.Lines`">
      <span
        v-for="line in lines"
        :key="line.level"
        class="line"
        :data-testid="line.testId"
        :data-level="line.level"
        :class="{ opens: line.opens, closes: line.closes }"
        :title="lineTitle(line.owner, line.level)"
        :style="lineStyle(line)"
      ></span>
      <span
        v-if="selected"
        class="selected-marker"
        :data-testid="`${id}.Selected`"
        :style="{ left: `${row.depth * SLOT + SLOT / 2 + 1}px`, top: `calc(${gap}px + 0.9rem)` }"
        title="Ausgewähltes Objekt"
      ></span>
      <!-- Beside the own bracket: a new child -->
      <button
        v-if="canHaveChildren"
        type="button"
        class="add-button add-child"
        title="Neues Kind anlegen"
        :data-testid="`${id}.AddChild`"
        :style="{ left: `${row.depth * SLOT + SLOT / 2 - 5}px`, top: `calc(${gap}px + 2.1rem)` }"
        @click="createChildOf"
      >+</button>
      <button
        v-if="row.hasChildren"
        class="toggle"
        type="button"
        :data-testid="`${id}.Toggle`"
        :aria-expanded="expanded"
        :title="expanded ? 'Teilbaum einklappen' : 'Teilbaum ausklappen'"
        :style="{ left: `${(row.depth + 1) * SLOT}px`, marginTop: `${gap}px` }"
        @click="emit('toggle')"
      >{{ expanded ? '−' : '+' }}</button>
    </div>

    <div class="row-icon" :style="{ marginTop: `${gap}px` }" :title="row.kind">
      <img v-if="icon?.iconDataUrl" :src="icon.iconDataUrl" alt="" />
      <i v-else-if="icon?.iconClass" :class="icon.iconClass"></i>
    </div>
    <div class="row" :style="{ marginTop: `${gap}px` }" :data-testid="`${id}.Row`">
      <div class="main">
        <header class="row-title" :title="row.kind">
          <template v-if="renaming">
            <input
              ref="nameInput"
              v-model="nameDraft"
              class="name-input"
              placeholder="(ohne Namen)"
              aria-label="Name"
              @keydown.enter.prevent="finishRename"
              @keydown.esc.prevent="cancelRename"
            />
            <button type="button" class="title-action" @click="finishRename">Fertig</button>
            <button type="button" class="title-action muted" @click="cancelRename">Abbrechen</button>
          </template>
          <template v-else>
            <span class="name" @click="emit('select', row.object)">{{ row.name }}</span>
            <button
              v-if="nameFeature"
              type="button"
              class="rename"
              title="Namen bearbeiten"
              aria-label="Namen bearbeiten"
              @click="startRename"
            ><i class="pi pi-pencil"></i></button>
            <span class="kind">{{ row.kind }}</span>
          </template>
          <button
            v-if="hiddenFields > 0 || showAllFields"
            type="button"
            class="show-all"
            :data-testid="`${id}.Row.Body.Fields.ShowAll`"
            @click="showAllFields = !showAllFields"
          >{{ showAllFields ? 'weniger anzeigen' : `alle anzeigen (+${hiddenFields})` }}</button>
        </header>
        <div class="body" :data-testid="`${id}.Row.Body`">
          <DiagramArea
            v-if="hasDiagram(row.object)"
            :title="`${row.kind} ${row.name}`"
            :object="row.object"
            :test-id="`${id}.Row.Body.Diagram`"
          />
          <!-- A table's remark leads the body, a description's text follows its fields -->
          <RowTextView v-if="table" :object="row.object" :test-id="`${id}.Row.Body.TextView`" :version="version" />
          <!-- A document's file leads the body: the image, or a link to open it -->
          <RowDocumentView
            v-if="row.kind === 'Document'"
            :object="row.object"
            :test-id="`${id}.Row.Body.Document`"
            :version="version"
          />
          <RowFields :object="row.object" :test-id="`${id}.Row.Body.Fields`" :version="version" :show-all="showAllFields" />
          <RowReferenceFields
            v-if="!referencesBelowText"
            :object="row.object"
            :shown="shown"
            :show-all="showAllFields"
            :test-id="`${id}.Row.Body.ReferenceFields`"
            :version="version"
          />
          <RowTextView v-if="!table" :object="row.object" :test-id="`${id}.Row.Body.TextView`" :version="version" />
          <!-- Descriptions, documents, responsible parties: what they are about (modelElement) follows their text -->
          <RowReferenceFields
            v-if="referencesBelowText"
            :object="row.object"
            :shown="shown"
            :show-all="showAllFields"
            :test-id="`${id}.Row.Body.ReferenceFields`"
            :version="version"
          />
          <ColumnsTable
            v-if="table"
            :table="table"
            :test-id="`${id}.Row.Body.Columns`"
          />
          <AttributesTable
            v-if="attributeTable"
            :object="row.object"
            :test-id="`${id}.Row.Body.${hasAssociationEnds(row.object) ? 'Ends' : 'Attributes'}`"
            :version="version"
          />
          <ReferencesTable
            :object="row.object"
            :shown="shown"
            :test-id="`${id}.Row.Body.References`"
            :version="version"
          />
        </div>
      </div>

      <CreateChildDialog
        v-if="creating"
        :parent="creating.parent"
        :feature="creating.feature"
        :index="creating.index"
        @close="creating = null"
      />
      <RowRightRail :object="row.object" :test-id="`${id}.Row.RightRail`" :version="version" />
    </div>
  </div>
</template>

<style scoped>
.object-row {
  /* Light mode takes finer steps - stronger grey looks dull */
  --layer-shade-step: 2%;
  position: relative;
  display: flex;
  align-items: stretch;
  /* Keeps the row title clear of the sticky header when scrolled to */
  scroll-margin-top: 3rem;
}

.gutter {
  position: relative;
  flex: 0 0 auto;
}

/*
 * Brackets run the full row height; adjacent rows join them into one. A
 * tick to the right opens one at its element's title and closes it after
 * the element's last descendant.
 */
.line {
  position: absolute;
  width: 2px;
  background: currentColor;
  cursor: help;
}

.line.opens::before,
.line.closes::after {
  content: '';
  position: absolute;
  left: 0;
  width: 6px;
  height: 2px;
  background: currentColor;
}

.line.opens::before {
  top: 0;
}

.line.closes::after {
  bottom: 0;
}

.row-icon {
  flex: 0 0 1.25rem;
  display: flex;
  justify-content: center;
  padding-top: 0.55rem;
}

.row-icon img,
.row-icon i {
  width: 16px;
  height: 16px;
  font-size: 14px;
  line-height: 16px;
  text-align: center;
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
}

:global(.dark-theme) .object-row {
  --layer-shade-step: 3.5%;
}

/* "+" for new elements: a small round button on a bracket line, shown on hover */
.add-button {
  position: absolute;
  width: 11px;
  height: 11px;
  padding: 0;
  font-size: 10px;
  line-height: 9px;
  text-align: center;
  border: 1px solid var(--primary-color);
  border-radius: 50%;
  background: var(--surface-card, var(--surface-ground));
  color: var(--primary-color);
  cursor: pointer;
  visibility: hidden;
  z-index: 2;
}

.add-button:hover {
  background: var(--primary-color);
  color: var(--primary-color-text, #fff);
}

/* The gap between siblings (a little beyond, to be easy to hit): hovering it offers the insert button */
.gap-add {
  position: absolute;
  top: -3px;
  left: 0;
  right: 0;
  z-index: 3;
}

.gap-add .add-button {
  top: 50%;
  transform: translateY(-50%);
}

.gap-add:hover .add-button,
.object-row:hover .add-child,
.add-button:focus-visible {
  visibility: visible;
}

/* The selected object: a marker on its own bracket, level with the title - no background */
.selected-marker {
  position: absolute;
  width: 8px;
  height: 8px;
  margin-left: -3px;
  margin-top: -3px;
  border-radius: 50%;
  background: var(--primary-color);
  box-shadow: 0 0 0 2px var(--surface-ground);
  pointer-events: none;
  z-index: 1;
}

.main {
  flex: 10 1 auto;
  min-width: 0;
}

.row-title {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

/* The fields' "alle anzeigen", on the name's line at the right */
.show-all {
  margin-left: auto;
  font: inherit;
  font-size: 0.7rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--primary-color);
  cursor: pointer;
  white-space: nowrap;
}


.row-title .name,
.row-title .name-input {
  font-weight: 600;
  color: var(--text-color);
}

.name-input {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 40rem;
  font: inherit;
  font-weight: 600;
  padding: 0.05rem 0.25rem;
  margin-left: -0.25rem;
  border: 1px solid;
  border-radius: 3px;
}

.name-input {
  border-color: var(--surface-border);
  background: var(--surface-ground);
}

.row-title .name {
  cursor: pointer;
}

.row-title .kind {
  font-size: 0.7rem;
  font-style: italic;
  color: var(--text-color-secondary);
}

.title-action {
  font: inherit;
  font-size: 0.7rem;
  font-weight: normal;
  padding: 0;
  border: none;
  background: none;
  color: var(--primary-color);
  cursor: pointer;
}

/* Only while the row is hovered (or the pencil has the keyboard focus) */
.rename {
  visibility: hidden;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-color-secondary);
  cursor: pointer;
}

.rename .pi {
  font-size: 0.6rem;
}

.rename:hover {
  color: var(--primary-color);
}

.object-row:hover .rename,
.rename:focus-visible {
  visibility: visible;
}

.title-action.muted {
  color: var(--text-color-secondary);
}
</style>
