<script setup lang="ts">
/**
 * One ObjectRow of the context view (PH-1, PH-2, PH-5).
 *
 * Left the gutter with a bracket per element: it opens at the element's
 * title and closes after its last descendant, so a row carries the brackets
 * of its ancestors and its own; then the +/- of the row's own subtree. Right of it the Row: its
 * name's line ending in the icon bar (RowRightRail: all fields, "Siehe auch", validation,
 * actions), then the Body (diagram, fields, text, columns table, references).
 * Rows stand one below the other, never inside each other; only the lines
 * tell the hierarchy.
 */
import { computed, inject, nextTick, ref, toRaw } from 'tsm:vue'
import type { ContextRow } from '../composables/contextView'
import { displayName, parentOf, shownByTable } from '../composables/contextView'
import { className, isTable, objectSlug, tableView } from '../composables/documentation'
import { hasDiagram } from '../composables/diagrams'
import { CWM_EDITING } from '../composables/editing'
import { hasAssociationEnds, isAttributeContainer, shownByClass } from '../composables/attributes'
import { fieldFor, hiddenFieldCount, setAttributeFromText } from '../composables/rowContent'
import { headAttributeName } from '../composables/fieldDefaults'
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
import RowMapping from './RowMapping.vue'
import { isOrmEntityMappings, shownByEntityMappings } from '../composables/ormMapping'

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
  /** Closed with its "−": only the name shows, the children not at all */
  shut?: boolean
  /** Model version, read to re-render after edits */
  version?: number
}>()

const emit = defineEmits<{
  /** All children to heads, or in full again */
  toggle: []
  /** "−" behind the name: the element down to its name, its children hidden - "+" shows them again */
  'toggle-shut': []
  /** This child of a folded element: in full, or back to its head */
  'toggle-opened': []
  select: [object: any]
}>()

const editing = inject(CWM_EDITING)!

/*
 * The head attribute (a head rule's, else the name) as the title; "Bearbeiten"
 * turns it into an input. An empty value unsets it.
 */
const nameFeature = computed(() => props.row.object.eClass?.()?.getEStructuralFeature?.(headAttributeName(props.row.object)) ?? null)
const nameValue = computed(() => {
  void props.version
  return nameFeature.value ? String(fieldFor(props.row.object, nameFeature.value).value ?? '') : ''
})
/** "Namen", or the head attribute's name */
const nameLabel = computed(() => {
  const name = String(nameFeature.value?.getName?.() ?? 'name')
  return name === 'name' ? 'Namen' : name
})
/* ── creating children and siblings ──────────────────────────────── */

/** The dialog's target: a child of the row's object, or a sibling at the row's place */
const creating = ref<{ parent: any; feature?: any; index?: number } | null>(null)

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

/** "Kind" at the element's lower edge, "Schwester" in the gap before a sibling */
const canHaveChildren = computed(() => {
  void props.version
  return containmentFeatures(props.row.object).length > 0
})

const canAddSibling = computed(() => {
  void props.version
  const o = props.row.object
  return !!parentOf(o) && !!o?.eContainingFeature?.()?.isMany?.()
})

/** Objects that document others show their references (modelElement) below their text */
const referencesBelowText = computed(() => ['Description', 'Document', 'ResponsibleParty'].includes(props.row.kind))

/** The fields table shows all attributes, also unset and hidden ones */
const showAllFields = ref(false)

/** The "Siehe auch" list - the icon bar's "+" opens its picker */
const references = ref<{ openPicker: () => void } | null>(null)

/**
 * The icon bar's eye and "+" act on the body: a head (minimised, or a child
 * of a folded element) opens first, then the action follows
 */
async function whenOpen(action: () => void): Promise<void> {
  if (props.head) {
    if (props.shut) emit('toggle-shut')
    else if (props.parentFolded) emit('toggle-opened')
    await nextTick()
    await nextTick()
  }
  action()
}

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
  editing.validate(props.row.object)
}

function cancelRename(): void {
  renaming.value = false
}

/** The class icon, in its own column inside the card, right of the lines */
const icon = computed(() => editing.iconFor(props.row.object))

/** Width of one line slot in the gutter */
const SLOT = 12

const id = computed(() => `cwm.Editor.ContextView.ObjectRow@${props.row.slug}`)

/**
 * Height of the two insert zones, alike: the gap before a sibling ("+
 * Schwester") and the zone at an element's lower edge ("+ Kind"), for which
 * the row keeps that room free below its content
 */
const INSERT_ZONE = 18

/**
 * The "Kind" zone at a row's lower edge and the "Schwester" zone in the gap
 * right below it (in the next row) belong together: hovering one shows the
 * other too. They lie in neighbouring rows, so it is found in the page.
 */
function pairZone(event: MouseEvent, on: boolean): void {
  const zone = event.currentTarget as HTMLElement
  const row = zone.closest('.object-row')
  const other = zone.classList.contains('child-zone')
    ? row?.nextElementSibling?.querySelector(':scope > .insert-zone:not(.child-zone)')
    : row?.previousElementSibling?.querySelector(':scope > .child-zone')
  other?.classList.toggle('paired', on)
}

/** The insert zones span the row's card: from its bracket line (left of it the lines stay free) to its right end */
const insertLeft = computed(() => `${props.row.depth * SLOT + SLOT / 2 + 2}px`)

/** Gap above a row whose sibling (or a sibling's descendant) comes before it - the "Schwester" zone */
const GAP = INSERT_ZONE

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

/** Radius of an element's upper left corner - its bracket and its card turn round there */
const CORNER = 15

function lineStyle(line: { level: number; opens: boolean; closes: boolean; owner: any }): Record<string, string> {
  return {
    // On the card's left edge; the ticks lie on its top and bottom edge
    left: `${line.level * SLOT + SLOT / 2}px`,
    // An opening bracket starts below its rounded corner (drawn by its ::after)
    top: line.opens ? `${gap.value + CORNER}px` : '0',
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

/** A card's left edge: its bracket */
function layerX(level: number): string {
  return `${level * SLOT + SLOT / 2}px`
}

/** Deeper cards cast stronger shadows; --layer-shadow scales them per theme (lighter in light mode) */
function shadowColor(level: number): string {
  return `rgb(0 0 0 / calc(var(--layer-shadow, 1) * ${Math.min(0.15 + level * 0.04, 0.3).toFixed(2)}))`
}

/** Room right of the cards for their right shadow, so they end softly instead of at the view's edge */
const RIGHT = SOFT

/**
 * Hues for the type tags, neighbours far apart. A class takes the hue of its
 * place among its package's classifiers (moved by the package), so the
 * classes of one package - Term, Concept, Glossary … - never share one.
 */
const KIND_HUES = [210, 28, 145, 320, 55, 185, 275, 95, 350, 245, 165, 5]

/** Trial: all type tags in the complement of the theme's highlight colour instead of a hue per type */
const KIND_ACCENT = true

function kindHue(object: any): number {
  const eClass = toRaw(object)?.eClass?.()
  const pkg = eClass?.getEPackage?.()
  const classifiers: any[] = pkg ? [...(pkg.getEClassifiers?.() ?? [])] : []
  let offset = 0
  for (const ch of String(pkg?.getNsURI?.() ?? '')) offset = (offset * 31 + ch.charCodeAt(0)) >>> 0
  const index = Math.max(0, classifiers.indexOf(eClass))
  return KIND_HUES[(index + offset) % KIND_HUES.length]!
}

/**
 * With numbering on, titles read like headings: the outline level (parts of
 * the number) sets size and weight - the top ("1") largest and boldest, from
 * the fifth level on all alike.
 */
const headingClass = computed(() => {
  if (!props.numbering) return null
  if (!props.number) return props.row.depth === 0 ? 'heading-0' : null
  return `heading-${Math.min(props.number.split('.').length - 1, 4)}`
})

/** The cards' shadows - switched off; the levels show by a light tint only */
const SHADOWS = false

/** The cards' tint per level - switched off; only the lines tell the levels */
const TINT = false

/** The own bracket's top line: from its round corner to the card's right end, in the bracket's colour */
const topLineStyle = computed(() => {
  const own = lines.value[lines.value.length - 1]!
  return {
    left: `${props.row.depth * SLOT + SLOT / 2 + CORNER}px`,
    top: `${gap.value}px`,
    right: `${RIGHT}px`,
    color: lineStyle(own).color
  }
})

/**
 * The element under the pointer stands out: its card (from its bracket to
 * the right end, below the gap, the upper left corner round) takes a light
 * ground (--hover-card, a faint warm grey in light mode)
 */
const hoverStyle = computed(() => {
  if (editing.hovered.value !== props.row.object) return {}
  const x = layerX(props.row.depth)
  const g = gap.value
  const rest = `calc(100% - ${x} - ${RIGHT}px)`
  const c = 'var(--hover-card)'
  const flat = `linear-gradient(${c}, ${c})`
  return {
    background: [
      `radial-gradient(circle at ${CORNER}px ${CORNER}px, ${c} ${CORNER - 0.5}px, transparent ${CORNER}px) ${x} ${g}px / ${CORNER}px ${CORNER}px no-repeat`,
      `${flat} calc(${x} + ${CORNER}px) ${g}px / calc(${rest} - ${CORNER}px) ${CORNER}px no-repeat`,
      `${flat} ${x} ${g + CORNER}px / ${rest} calc(100% - ${g + CORNER}px) no-repeat`
    ].join(', ')
  }
})

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
    const own = tint(depth)
    // Outside the rounded corner the parent's card shows (the context object has none)
    const outside = depth > 1 ? tint(depth - 1) : 'transparent'
    layers.push(`radial-gradient(circle at ${CORNER}px ${CORNER}px, ${own} ${CORNER - 0.5}px, ${outside} ${CORNER}px) ${x} ${g}px / ${CORNER}px ${CORNER}px no-repeat`)
    layers.push(`${flat(own)} calc(${x} + ${CORNER}px) ${g}px / calc(${rest} - ${CORNER}px) ${CORNER}px no-repeat`)
    layers.push(`${flat(own)} ${x} ${g + CORNER}px / ${rest} calc(100% - ${g + CORNER}px) no-repeat`)
    if (g > 0 && depth > 1) layers.push(`${flat(tint(depth - 1))} ${x} 0 / ${rest} ${g}px no-repeat`)
  }
  return layers.length ? { background: layers.join(', ') } : {}
})

const layerStyle = computed(() => {
  if (!SHADOWS) return TINT ? tintStyle.value : hoverStyle.value
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
  if (isOrmEntityMappings(props.row.object)) return shownByEntityMappings(props.row.object)
  return new Set<any>()
})
</script>

<template>
  <div
    class="object-row"
    :class="[{ selected }, headingClass && `name-${headingClass}`]"
    :style="layerStyle"
    :data-testid="id"
    :data-row-key="row.key"
    data-wire-kind="LIST"
    :data-depth="row.depth"
    @mouseenter="editing.hovered.value = row.object"
    @mouseleave="editing.hovered.value === row.object && (editing.hovered.value = null)"
  >
    <!-- The gap before this row (it follows a sibling's subtree), right of the lines: hovering it offers a new sister at this place -->
    <div
      v-if="gap && canAddSibling"
      class="insert-zone"
      :style="{ left: insertLeft, height: `${gap}px` }"
      :data-testid="`${id}.Insert`"
      title="Neue Schwester an dieser Stelle"
      @click.self="createSibling"
      @mouseenter="pairZone($event, true)"
      @mouseleave="pairZone($event, false)"
    >
      <button
        type="button"
        class="insert"
        title="Neue Schwester an dieser Stelle"
        :data-testid="`${id}.InsertSibling`"
        @click="createSibling"
      ><i class="pi pi-plus"></i> Schwester</button>
    </div>
    <!-- The element's lower edge: hovering it offers a new child -->
    <div
      v-if="canHaveChildren"
      class="insert-zone child-zone"
      :style="{ left: insertLeft, height: `${INSERT_ZONE}px` }"
      :data-testid="`${id}.InsertChildZone`"
      title="Neues Kind anlegen"
      @click.self="createChildOf"
      @mouseenter="pairZone($event, true)"
      @mouseleave="pairZone($event, false)"
    >
      <button
        type="button"
        class="insert"
        title="Neues Kind anlegen"
        :data-testid="`${id}.InsertChild`"
        @click="createChildOf"
      ><i class="pi pi-plus"></i> Kind</button>
    </div>
    <!-- The top of the own bracket, after its round corner: a line across the whole card to its right end, fading out - it parts the elements on the right too -->
    <span class="top-line" :style="topLineStyle"></span>
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
    </div>

    <div class="row-icon" :style="{ marginTop: `${gap}px` }" :title="row.kind">
      <img v-if="icon?.iconDataUrl" :src="icon.iconDataUrl" alt="" />
      <i v-else-if="icon?.iconClass" :class="icon.iconClass"></i>
    </div>
    <div class="row" :style="{ marginTop: `${gap}px`, paddingBottom: canHaveChildren ? `${INSERT_ZONE + 2}px` : undefined }" :data-testid="`${id}.Row`">
      <div class="main">
        <header class="row-title" :class="headingClass" :title="row.kind">
          <template v-if="renaming">
            <input
              ref="nameInput"
              v-model="nameDraft"
              class="name-input"
              :placeholder="nameLabel === 'Namen' ? '(ohne Namen)' : `(ohne ${nameLabel})`"
              :aria-label="nameLabel === 'Namen' ? 'Name' : nameLabel"
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
              :title="`${nameLabel} bearbeiten`"
              :aria-label="`${nameLabel} bearbeiten`"
              @click="startRename"
            ><i class="pi pi-pencil"></i></button>
            <!-- Behind the name, for every element: "−" closes it down to its name (and hides its children), "+" shows all again -->
            <button
              type="button"
              class="unfold fold"
              :title="shut ? 'Wieder anzeigen' : row.hasChildren ? 'Bis auf den Namen schließen, Kinder ausblenden' : 'Bis auf den Namen schließen'"
              :aria-expanded="!shut"
              :data-testid="`${id}.${shut ? 'Open' : 'Shut'}`"
              @click="emit('toggle-shut')"
            >{{ shut ? '+' : '−' }}</button>
          </template>
          <!-- At the line's end, centred on the name: the outline number, the type tag, the icon bar -->
          <span class="title-end">
            <span v-if="numbering && number" class="row-number" :data-testid="`${id}.Row.Number`">{{ number }}</span>
            <span v-if="!renaming" class="kind" :class="{ accent: KIND_ACCENT }" :style="KIND_ACCENT ? undefined : { '--kind-hue': kindHue(row.object) }">{{ row.kind }}</span>
            <!-- Icon bar: all fields, "Siehe auch", OCL, actions -->
            <!-- Also on a head (minimised or folded): eye and "+" open it first -->
            <RowRightRail
              :object="row.object"
              :test-id="`${id}.Row.RightRail`"
              :version="version"
              :has-children="row.hasChildren"
              :numbering="!!numbering"
              :hidden-fields="hiddenFields"
              :show-all="showAllFields"
              @toggle-show-all="whenOpen(() => { showAllFields = !showAllFields })"
              @add-reference="whenOpen(() => references?.openPicker())"
            />
          </span>
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
          <!-- An orm mapping set: its classes and tables side by side, entities and attribute mappings as lines between them -->
          <RowMapping
            v-if="isOrmEntityMappings(row.object)"
            :object="row.object"
            :test-id="`${id}.Row.Body.Mapping`"
            :version="version"
          />
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
            ref="references"
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
    </div>
  </div>
</template>

<style scoped>
/* Outline number at the line's end, before the type tag - right-aligned, all in one column (the tags are all as wide) */
.row-number {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  font-size: 0.8rem;
  color: color-mix(in srgb, var(--text-color-secondary) 55%, transparent);
  white-space: nowrap;
}

.object-row {
  /* Ground of the element under the pointer: a faint warm grey, only hinted */
  --hover-card: hsl(40 10% 96.5%);
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

/* The top of a bracket: a rounded corner (radius CORNER), then the top line (.top-line) runs on
   across the card; the bottom ends plain. The parts touch without overlapping - the
   translucent strokes would darken where they overlap */
.line.opens::after {
  content: '';
  position: absolute;
  top: -15px;
  left: 0;
  box-sizing: border-box;
  width: 15px;
  height: 15px;
  border-top: 2px solid currentColor;
  border-left: 2px solid currentColor;
  border-top-left-radius: 15px;
  pointer-events: none;
}

.top-line {
  position: absolute;
  height: 2px;
  /* Strong at the corner, running out into a faint line that stays to the end */
  background: linear-gradient(
    to right,
    currentColor,
    color-mix(in srgb, currentColor 35%, transparent) 30%,
    color-mix(in srgb, currentColor 12%, transparent)
  );
  pointer-events: none;
}

/*
 * The icon sits in the corner of its element's bracket, as far from the top
 * line as from the left one (--icon-inset). Left of the icon column lie 16.5px
 * from the bracket's line (2 slots minus half a slot minus its 2px, plus the
 * half pixel the 19px icon has in the 20px column); the column moves left by
 * what the inset is smaller. The name's line is centred on the icon.
 */
.object-row {
  --icon-inset: 10px;
  --icon-size: 19px;
}

.row-icon {
  flex: 0 0 1.25rem;
  display: flex;
  justify-content: center;
  /* Below the top line (2px) by the inset, right of the left line by the same */
  padding-top: calc(2px + var(--icon-inset));
  margin-left: calc(var(--icon-inset) - 16.5px);
}

.object-row.name-heading-0 { --name-size: 1.35rem; }
.object-row.name-heading-1 { --name-size: 1.2rem; }
.object-row.name-heading-2 { --name-size: 1.07rem; }
.object-row.name-heading-3 { --name-size: 0.97rem; }
.object-row.name-heading-4 { --name-size: 0.9rem; }

.row-icon img,
.row-icon i {
  width: 19px;
  height: 19px;
  font-size: 17px;
  line-height: 19px;
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
  /* The name's line (1.3 × the name's size high) centred on the icon */
  padding: calc(2px + var(--icon-inset) + var(--icon-size) / 2 - 0.65 * var(--name-size, 1em)) 0.5rem 0.4rem;
}

/* Sections with nothing to show take no room (their margins would still add up below the title) */
.body > :deep(:empty) {
  display: none;
}

:global(.dark-theme) .object-row {
  --hover-card: color-mix(in srgb, var(--text-color) 6%, transparent);
  --layer-shade-step: 3.5%;
  --layer-shadow: 1;
  /* Dark mode: lighter means more of the (light) text colour towards the children */
  --layer-tint-base: 3%;
  --layer-tint-step: 1%;
}

/* Right of the lines, on hover a button in the middle: in the gap a new sister, at the lower edge a new child */
.insert-zone {
  position: absolute;
  top: 0;
  /* Up to the card's right end, not into the room kept for its soft end */
  right: 10px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  box-sizing: border-box;
  border: 1px dashed transparent;
  border-radius: 6px;
  /* The whole zone is clickable, not only its button */
  cursor: pointer;
}

.insert {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  height: 16px;
  padding: 0 0.5rem;
  font: inherit;
  font-size: 0.68rem;
  font-weight: 600;
  border: 1px solid var(--primary-color);
  border-radius: 999px;
  background: var(--surface-card, var(--surface-ground));
  color: var(--primary-color);
  cursor: pointer;
  visibility: hidden;
}

.insert i {
  font-size: 0.55rem;
}

.insert:hover {
  background: var(--primary-color);
  color: var(--primary-color-text, #fff);
}

/* At the element's lower edge */
.insert-zone.child-zone {
  top: auto;
  bottom: 0;
}

/* Being there (or at its partner): the zone lights up, framed, and shows its button */
.insert-zone:hover,
.insert-zone.paired {
  background: color-mix(in srgb, var(--primary-color) 20%, transparent);
  border-color: color-mix(in srgb, var(--primary-color) 65%, transparent);
}

.insert-zone:hover .insert,
.insert-zone.paired .insert,
.insert:focus-visible {
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

/* The "−" / "+" behind the name, centred on its line - only while the row is hovered */
.fold {
  align-self: center;
  visibility: hidden;
}

.object-row:hover .fold,
.fold:focus-visible {
  visibility: visible;
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

.row-title .name,
.row-title .name-input {
  line-height: 1.3;
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

/* The type as a tag: framed, pale ground, text in its colour - a hue per type; centred on the name */
/* Number, type tag and icon bar at the line's end, all centred on the name */
.title-end {
  margin-left: auto;
  align-self: center;
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.row-title .kind {
  /* Text centred in the tag: trimmed to cap height and baseline, the padding even around it */
  text-box: trim-both cap alphabetic;
  padding: 0.22rem 0.5rem;
  /* As wide as the widest type on the page (set by the view), its text centred */
  box-sizing: content-box;
  min-width: var(--cwm-kind-width, auto);
  text-align: center;
  border: 1px solid hsl(var(--kind-hue) 55% 50% / 0.5);
  border-radius: 999px;
  background: hsl(var(--kind-hue) 75% 50% / 0.1);
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  color: hsl(var(--kind-hue) 60% 34%);
}

:global(.dark-theme) .row-title .kind {
  border-color: hsl(var(--kind-hue) 60% 65% / 0.45);
  background: hsl(var(--kind-hue) 70% 60% / 0.14);
  color: hsl(var(--kind-hue) 75% 75%);
}

/* All alike in the complement of the theme's highlight colour (its hue turned by 180°), pale */
.row-title .kind.accent {
  border-color: hsl(from var(--primary-color) calc(h + 180) calc(s * 0.45) l / 0.45);
  background: hsl(from var(--primary-color) calc(h + 180) calc(s * 0.45) l / 0.08);
  color: hsl(from var(--primary-color) calc(h + 180) calc(s * 0.45) 38%);
}

:global(.dark-theme) .row-title .kind.accent {
  border-color: hsl(from var(--primary-color) calc(h + 180) calc(s * 0.45) 70% / 0.4);
  background: hsl(from var(--primary-color) calc(h + 180) calc(s * 0.45) 60% / 0.1);
  color: hsl(from var(--primary-color) calc(h + 180) calc(s * 0.45) 75%);
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
