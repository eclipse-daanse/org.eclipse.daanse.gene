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
import RowContactCard from './RowContactCard.vue'
import RowGrants from './RowGrants.vue'
import RowPrivileges from './RowPrivileges.vue'
import { isAccessRole, shownByRole } from '../composables/grants'
import { isResponsibleParty, shownByParty } from '../composables/contactCard'
import { shownPrivileges } from '../composables/privileges'
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
  /** Outline number, when the editor numbers its rows */
  number?: string
  /** The editor numbers its rows */
  numbering?: boolean
  /** Below a folded element: only the head - title and type */
  head?: boolean
  /** Below a folded element, opened on its own */
  opened?: boolean
  /** Its parent is folded */
  parentFolded?: boolean
  /** Model version, read to re-render after edits */
  version?: number
}>()

const emit = defineEmits<{
  toggle: []
  /** All the parent's children to heads - from the "−" on the first child's row */
  'fold-parent': []
  /** All the parent's children in full - from the "+" on the first head's row */
  'unfold-parent': []
  /** This child of a folded element: in full, or back to its head */
  'toggle-opened': []
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
/** Gap before a sibling - room for the "+" that inserts there */
const GAP = 15

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

/** How much earlier each deeper bracket ends than the one around it, in px */
const END_STEP = 7

/**
 * Brackets closing in the same row end staggered - the innermost first, each
 * outer one a step further down - as they started staggered row by row.
 */
function lineEnd(line: { level: number; closes: boolean }): string {
  if (!line.closes) return '0'
  const outermost = Math.max(props.nextDepth, 0)
  return `${(line.level - outermost) * END_STEP}px`
}

function lineStyle(line: { level: number; opens: boolean; closes: boolean; owner: any }): Record<string, string> {
  return {
    // On the card's left edge; the ticks lie on its top and bottom edge
    left: `${line.level * SLOT + SLOT / 2}px`,
    top: line.opens ? `${gap.value}px` : '0',
    bottom: lineEnd(line),
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
 * left onto its parent's, where it ends down onto what follows, and at its
 * right end - a little before the view's edge - outwards, so it ends softly.
 * Siblings are separate cards with a gap between them.
 */
/** Width of a shadow's soft end, in px */
const SOFT = 10

/** A card's left edge: its bracket - right of the number column, when there is one */
function layerX(level: number): string {
  return `calc(var(--cwm-number-col, 0px) + ${level * SLOT + SLOT / 2}px)`
}

/** Deeper cards cast stronger shadows; --layer-shadow scales them per theme (lighter in light mode) */
function shadowColor(level: number): string {
  return `rgb(0 0 0 / calc(var(--layer-shadow, 1) * ${Math.min(0.15 + level * 0.04, 0.3).toFixed(2)}))`
}

/** Room right of the cards for their right shadow, so they end softly instead of at the view's edge */
const RIGHT = SOFT

/**
 * With numbering on, titles read like headings: the outline level (parts of
 * the number) sets size and weight - level 0 (the context object, it has no
 * number) largest and boldest, from level 4 on all alike.
 */
/** The row right below its parent: the first of its children */
const isFirstChild = computed(() => props.row.depth > 1 && props.prevDepth === props.row.depth - 1)

const headingClass = computed(() => {
  if (!props.numbering) return null
  if (props.row.depth === 0) return 'heading-0'
  if (!props.number) return null
  return `heading-${Math.min(props.number.split('.').length, 4)}`
})

/** The cards' shadows - switched off; the levels show by a light tint only */
const SHADOWS = false

/** Tint of a level's card: children a little lighter than their parents (steps per theme, see the CSS) */
function tint(level: number): string {
  const pct = `max(0%, calc(var(--layer-tint-base) + var(--layer-tint-step) * ${level - 1}))`
  return `color-mix(in srgb, var(--text-color) ${pct}, transparent)`
}

/**
 * Tint only: each level paints its own strip - an ancestor from its bracket
 * to the next one, the row's own card from its bracket to the right end
 * (below the gap; in the gap the parent's tint goes on). The strips do not
 * overlap, so the tints do not add up.
 */
const tintStyle = computed(() => {
  const depth = props.row.depth
  const g = gap.value
  const layers: string[] = []
  const flat = (c: string) => `linear-gradient(${c}, ${c})`
  for (let level = 1; level < depth; level++) {
    layers.push(`${flat(tint(level))} ${layerX(level)} 0 / ${SLOT}px 100% no-repeat`)
  }
  if (depth > 0) {
    const x = layerX(depth)
    const rest = `calc(100% - ${x} - ${RIGHT}px)`
    layers.push(`${flat(tint(depth))} ${x} ${g}px / ${rest} calc(100% - ${g}px) no-repeat`)
    if (g > 0 && depth > 1) layers.push(`${flat(tint(depth - 1))} ${x} 0 / ${rest} ${g}px no-repeat`)
  }
  return layers.length ? { background: layers.join(', ') } : {}
})

const layerStyle = computed(() => {
  if (!SHADOWS) return tintStyle.value
  const depth = props.row.depth
  const g = gap.value
  const layers: string[] = []
  const width = `calc(100% - ${RIGHT}px)`
  // Cards ending in the row above cast their shadow down onto this one,
  // rounded off at the corner left of the bracket
  for (let level = props.prevDepth; level >= Math.max(depth, 1); level--) {
    const x = layerX(level)
    const c = shadowColor(level)
    layers.push(`radial-gradient(farthest-side at 100% 0, ${c}, transparent) calc(${x} - ${SOFT}px) 0 / ${SOFT}px ${SOFT}px no-repeat`)
    layers.push(`linear-gradient(${c}, transparent) ${x} 0 / calc(100% - ${x} - ${RIGHT}px) ${SOFT}px no-repeat`)
    // ... and at its right corner
    layers.push(`radial-gradient(farthest-side at 0 0, ${c}, transparent) ${width} 0 / ${SOFT}px ${SOFT}px no-repeat`)
  }
  for (let level = depth; level > 0; level--) {
    const x = layerX(level)
    const c = shadowColor(level)
    const shade = `linear-gradient(to right, transparent ${x}, color-mix(in srgb, var(--text-color) var(--layer-shade-step), transparent) ${x})`
    const leftShadow = `linear-gradient(to right, transparent calc(${x} - ${SOFT}px), ${c} ${x}, transparent ${x})`
    const rightShadow = `linear-gradient(to right, ${c}, transparent)`
    if (level < depth) {
      layers.push(`${rightShadow} ${width} 0 / ${SOFT}px 100% no-repeat`, leftShadow, `${shade} 0 0 / ${width} 100% no-repeat`)
      continue
    }
    // The row's own card starts below the gap; its left and right shadows fade in at the top corners
    layers.push(`radial-gradient(farthest-side at 100% 100%, ${c}, transparent) calc(${x} - ${SOFT}px) ${g}px / ${SOFT}px ${SOFT}px no-repeat`)
    layers.push(`radial-gradient(farthest-side at 0 100%, ${c}, transparent) ${width} ${g}px / ${SOFT}px ${SOFT}px no-repeat`)
    layers.push(`${leftShadow} 0 ${g + SOFT}px / 100% calc(100% - ${g + SOFT}px) no-repeat`)
    layers.push(`${rightShadow} ${width} ${g + SOFT}px / ${SOFT}px calc(100% - ${g + SOFT}px) no-repeat`)
    layers.push(`${shade} 0 ${g}px / ${width} calc(100% - ${g}px) no-repeat`)
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
  if (isResponsibleParty(props.row.object)) return new Set([...shownByParty(props.row.object), ...shownPrivileges(props.row.object)])
  if (isAccessRole(props.row.object)) return shownByRole(props.row.object)
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
    <div v-if="gap" class="gap-add" :style="{ height: `${gap}px` }">
      <button
        type="button"
        class="add-button"
        title="Neues Element hier einfügen"
        :data-testid="`${id}.InsertBefore`"
        :style="{ left: `calc(var(--cwm-number-col, 0px) + ${(row.depth - 1) * SLOT + SLOT / 2 - 5}px)` }"
        @click="createSibling"
      >+</button>
    </div>
    <!-- The outline number in a column of its own at the left edge, flush for all rows -->
    <div v-if="numbering" class="number-col" :style="{ marginTop: `${gap}px` }" :data-testid="`${id}.Row.Number`">{{ number }}</div>
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
      <!-- First child, on the parent's line: "−" folds all children to heads, "+" opens all again -->
      <button
        v-if="isFirstChild"
        type="button"
        class="unfold fold"
        :title="parentFolded ? 'Alle Kinder aufklappen' : 'Alle Kinder zuklappen'"
        :data-testid="`${id}.${parentFolded ? 'UnfoldParent' : 'FoldParent'}`"
        :style="{ left: `${(row.depth - 1) * SLOT + SLOT / 2 + 1}px` }"
        @click="emit(parentFolded ? 'unfold-parent' : 'fold-parent')"
      >{{ parentFolded ? '+' : '−' }}</button>
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
    </div>

    <div class="row-icon" :style="{ marginTop: `${gap}px` }" :title="row.kind">
      <img v-if="icon?.iconDataUrl" :src="icon.iconDataUrl" alt="" />
      <i v-else-if="icon?.iconClass" :class="icon.iconClass"></i>
    </div>
    <div class="row" :style="{ marginTop: `${gap}px` }" :data-testid="`${id}.Row`">
      <div class="main">
        <header class="row-title" :class="headingClass" :title="row.kind">
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
            <!-- Below a folded element: open or close this child on its own -->
            <button
              v-if="parentFolded"
              type="button"
              class="open-child"
              :title="head ? 'Aufklappen' : 'Zuklappen'"
              :aria-expanded="!head"
              :data-testid="`${id}.${head ? 'Open' : 'Close'}`"
              @click="emit('toggle-opened')"
            ><i :class="head ? 'pi pi-chevron-right' : 'pi pi-chevron-down'"></i></button>
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
            v-if="!head && (hiddenFields > 0 || showAllFields)"
            type="button"
            class="show-all"
            :data-testid="`${id}.Row.Body.Fields.ShowAll`"
            @click="showAllFields = !showAllFields"
          >{{ showAllFields ? 'weniger anzeigen' : `alle anzeigen (+${hiddenFields})` }}</button>
        </header>
        <div v-if="!head" class="body" :data-testid="`${id}.Row.Body`">
          <DiagramArea
            v-if="hasDiagram(row.object)"
            :title="`${row.kind} ${row.name}`"
            :object="row.object"
            :test-id="`${id}.Row.Body.Diagram`"
          />
          <!-- A table's remark leads the body, a description's text follows its fields -->
          <RowTextView v-if="table" :object="row.object" :test-id="`${id}.Row.Body.TextView`" :version="version" />
          <!-- A responsible party leads with its business card: who, what, how to reach -->
          <RowContactCard
            v-if="row.kind === 'ResponsibleParty'"
            :object="row.object"
            :test-id="`${id}.Row.Body.ContactCard`"
            :version="version"
          />
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
          <!-- A responsible party or access role: its grants ("Zugriffe"); there is no row for a grant -->
          <RowGrants :object="row.object" :test-id="`${id}.Row.Body.Grants`" :version="version" />
          <!-- Table, view, column, procedure: who may do what; a responsible party: what it may do -->
          <RowPrivileges :object="row.object" :test-id="`${id}.Row.Body.Privileges`" :version="version" />
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
      <RowRightRail
        v-if="!head"
        :object="row.object"
        :test-id="`${id}.Row.RightRail`"
        :version="version"
        :has-children="row.hasChildren"
        :numbering="!!numbering"
      />
    </div>
  </div>
</template>

<style scoped>
/* Outline number in a column at the left edge, as wide as the longest number (set by the view) */
.number-col {
  flex: 0 0 var(--cwm-number-col, 0px);
  box-sizing: border-box;
  padding: 0.5rem 0 0 0.25rem;
  text-align: left;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text-color-secondary);
  white-space: nowrap;
}

.object-row {
  /* Light mode takes finer steps - stronger grey looks dull */
  --layer-shade-step: 0.9%;
  --layer-shadow: 0.5;
  /* Tint per level: light mode starts at 4 % and gets lighter towards the children */
  --layer-tint-base: 4%;
  --layer-tint-step: -0.8%;
  position: relative;
  display: flex;
  align-items: stretch;
  /* The cards end before the view's edge with a soft shadow; the content (and the right rail) stays on them */
  padding-right: 10px;
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

/* The top of a bracket: a stroke running right into the element, fading out; the bottom ends plain.
   It starts right of the vertical line - overlapping, the two translucent strokes would darken the corner */
.line.opens::before {
  content: '';
  position: absolute;
  left: 2px;
  width: 14rem;
  height: 2px;
  background: linear-gradient(to right, currentColor, transparent);
  pointer-events: none;
}

.line.opens::before {
  top: 0;
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
  --layer-shadow: 1;
  /* Dark mode: lighter means more of the (light) text colour towards the children */
  --layer-tint-base: 3%;
  --layer-tint-step: 1%;
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
  top: 0;
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
.unfold {
  color: var(--primary-color);
  border-color: var(--primary-color);
}

.unfold {
  flex: 0 0 auto;
  display: inline-block;
  box-sizing: border-box;
  width: 1rem;
  height: 1rem;
  padding: 0;
  font: inherit;
  font-size: 0.75rem;
  line-height: 0.9rem;
  font-weight: 600;
  text-align: center;
  color: var(--text-color-secondary);
  background: var(--surface-card, var(--surface-ground));
  border: 1px solid color-mix(in srgb, var(--text-color-secondary) 45%, transparent);
  border-radius: 3px;
  cursor: pointer;
}

/* Below a folded element: the chevron opening or closing one child */
.open-child {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: none;
  color: var(--text-color-secondary);
  cursor: pointer;
  align-self: center;
}

.open-child i {
  font-size: 0.65rem;
}

.open-child:hover {
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}

/* The "−" / "+" on the first child's row, centred on the parent's line */
.fold {
  position: absolute;
  top: 0.15rem;
  transform: translateX(-50%);
  z-index: 1;
}

.unfold:hover {
  color: var(--primary-color);
  border-color: var(--primary-color);
}

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

/* Titles as headings while numbered: larger and bolder towards the top */
.row-title.heading-0 .name {
  font-size: 1.35rem;
  font-weight: 800;
}

.row-title.heading-1 .name {
  font-size: 1.2rem;
  font-weight: 700;
}

.row-title.heading-2 .name {
  font-size: 1.07rem;
  font-weight: 650;
}

.row-title.heading-3 .name {
  font-size: 0.97rem;
  font-weight: 600;
}

.row-title.heading-4 .name {
  font-size: 0.9rem;
  font-weight: 500;
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
