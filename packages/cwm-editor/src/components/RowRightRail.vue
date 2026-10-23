<script setup lang="ts">
/**
 * Icon bar of an ObjectRow (PH-4), at the right end of its name's line, all
 * in one row: the eye shows all fields (or only the filled ones again), "+"
 * adds "Siehe auch" references, the OCL validation result as a small dot
 * (the findings in its title; a click validates anew) and "⋯" opening one
 * dropdown with the actions from the registry per EClass and the element's
 * editor settings, kept as tagged values in the model: whether its children
 * start folded, and (while the editor numbers) how it counts.
 */
import { computed, inject, onBeforeUnmount, ref, watch } from 'tsm:vue'
import { actionLabel, actionRegistry, type ActionApi, type CwmAction } from '../composables/actions'
import { CWM_EDITING } from '../composables/editing'
import {
  canHaveTags,
  childrenDefault,
  NUMBERING_LABELS,
  numberingMode,
  setTag,
  TAG_CHILDREN,
  TAG_NUMBERING,
  type ChildrenDefault,
  type NumberingMode
} from '../composables/taggedValues'

const props = defineProps<{
  object: any
  testId: string
  version?: number
  /** The element has rows below it */
  hasChildren?: boolean
  /** The editor numbers its rows */
  numbering?: boolean
  /** Fields hidden while not all are shown */
  hiddenFields?: number
  /** All fields are shown */
  showAll?: boolean
}>()

const emit = defineEmits<{ 'toggle-show-all': []; 'add-reference': [] }>()

const eyeTitle = computed(() =>
  props.showAll ? 'Nur gefüllte Felder anzeigen' : props.hiddenFields ? `Alle Felder anzeigen (+${props.hiddenFields})` : 'Alle Felder werden angezeigt'
)

const editing = inject(CWM_EDITING)!

const issues = computed(() => {
  void props.version
  return editing.issuesFor(props.object)
})
const errors = computed(() => issues.value.filter(i => i.severity === 'error').length)
const warnings = computed(() => issues.value.filter(i => i.severity === 'warning').length)
const badge = computed(() => {
  if (errors.value > 0) return { count: errors.value, kind: 'error' }
  if (warnings.value > 0) return { count: warnings.value, kind: 'warning' }
  return { count: 0, kind: 'ok' }
})
const badgeTitle = computed(() =>
  issues.value.length
    ? `OCL: ${issues.value.map(i => `${i.severity}: ${i.message}`).join('\n')}\n– Klick validiert neu`
    : 'OCL: keine Befunde – Klick validiert neu'
)

const api = computed<ActionApi>(() => ({
  change: editing.change,
  select: editing.select,
  selected: editing.selected.value,
  setContext: editing.setContext,
  validate: editing.validate,
  deleteObject: editing.deleteObject
}))

const open = ref(false)
/** Action waiting for its second click */
const confirming = ref<string | null>(null)
const menu = computed(() => {
  void props.version
  return actionRegistry.actionsFor(props.object).map(a => ({
    action: a,
    label: actionLabel(a, props.object, api.value),
    enabled: a.enabled ? a.enabled(props.object, api.value) : true
  }))
})

function run(action: CwmAction): void {
  if (action.confirm && confirming.value !== action.id) {
    confirming.value = action.id
    return
  }
  confirming.value = null
  open.value = false
  action.run(props.object, api.value)
}

/* ── settings as tagged values ───────────────────────────────────── */

const taggable = computed(() => canHaveTags(props.object))

const children = computed(() => {
  void props.version
  return childrenDefault(props.object)
})

const numberingValue = computed(() => {
  void props.version
  return numberingMode(props.object)
})

const NUMBERING_MODES = Object.keys(NUMBERING_LABELS) as NumberingMode[]

function setChildren(value: ChildrenDefault): void {
  // Unfolded is the default - no tag for it
  editing.change(() => setTag(props.object, TAG_CHILDREN, value === 'collapsed' ? 'collapsed' : null))
}

function setNumbering(value: NumberingMode): void {
  editing.change(() => setTag(props.object, TAG_NUMBERING, value === 'normal' ? null : value))
}

/* The menu lies on the page (rows clip what reaches outside them), placed under its button */
const actionsButton = ref<HTMLElement | null>(null)
const menuAt = ref({ top: 0, right: 0 })

function toggleMenu(): void {
  if (!open.value && actionsButton.value) {
    const r = actionsButton.value.getBoundingClientRect()
    menuAt.value = { top: r.bottom + 2, right: Math.max(8, window.innerWidth - r.right) }
  }
  open.value = !open.value
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement
  if (!target.closest?.(`[data-testid="${props.testId}"]`) && !target.closest?.(`[data-rail-menu="${props.testId}"]`)) open.value = false
}
// Listen for outside clicks only while the menu is open - there are many rows
watch(open, isOpen => {
  if (!isOpen) confirming.value = null
  if (isOpen) document.addEventListener('mousedown', onDocumentClick)
  else document.removeEventListener('mousedown', onDocumentClick)
})
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick))
</script>

<template>
  <div class="right-rail" :data-testid="testId">
    <button
      type="button"
      class="icon"
      :class="{ on: showAll }"
      :disabled="!showAll && !hiddenFields"
      :data-testid="`${testId}.ShowAll`"
      :title="eyeTitle"
      :aria-label="eyeTitle"
      :aria-pressed="!!showAll"
      @click="emit('toggle-show-all')"
    ><i :class="showAll ? 'pi pi-eye-slash' : 'pi pi-eye'"></i></button>
    <button
      type="button"
      class="icon"
      :data-testid="`${testId}.AddReference`"
      title="Siehe auch hinzufügen"
      aria-label="Siehe auch hinzufügen"
      @click="emit('add-reference')"
    ><i class="pi pi-plus"></i></button>
    <button
      type="button"
      class="badge"
      :class="badge.kind"
      :data-testid="`${testId}.Validation`"
      data-wire-kind="BADGE"
      :title="badgeTitle"
      :aria-label="badgeTitle"
      @click="editing.validate(object)"
    ><span v-if="badge.count" class="count">{{ badge.count }}</span></button>
    <div class="actions-wrap" :data-testid="`${testId}.Actions`" data-wire-kind="CONTROL">
      <button
        type="button"
        class="actions"
        aria-haspopup="menu"
        :aria-expanded="open"
        title="Aktionen und Einstellungen"
        aria-label="Aktionen"
        ref="actionsButton"
        @click="toggleMenu"
      ><i class="pi pi-ellipsis-v"></i></button>
      <Teleport to="body">
      <ul
        v-if="open"
        class="menu"
        role="menu"
        :data-rail-menu="testId"
        :style="{ top: `${menuAt.top}px`, right: `${menuAt.right}px` }"
      >
        <li v-for="m in menu" :key="m.action.id" role="none">
          <button
            type="button"
            role="menuitem"
            :data-action="m.action.id"
            :disabled="!m.enabled"
            :class="{ confirm: confirming === m.action.id }"
            @click="run(m.action)"
          >{{ confirming === m.action.id ? m.action.confirm : m.label }}</button>
        </li>

        <template v-if="taggable && hasChildren">
          <li class="group" role="none">Kinder zuerst</li>
          <li v-for="c in (['expanded', 'collapsed'] as ChildrenDefault[])" :key="c" role="none">
            <button
              type="button"
              role="menuitemradio"
              :aria-checked="children === c"
              :data-testid="`${testId}.Children.${c}`"
              @click="setChildren(c)"
            ><i class="check" :class="{ on: children === c }">✓</i>{{ c === 'expanded' ? 'ausgeklappt' : 'eingeklappt' }}</button>
          </li>
        </template>

        <template v-if="taggable && numbering">
          <li class="group" role="none">Nummerierung</li>
          <li v-for="m in NUMBERING_MODES" :key="m" role="none">
            <button
              type="button"
              role="menuitemradio"
              :aria-checked="numberingValue === m"
              :data-testid="`${testId}.Numbering.${m}`"
              @click="setNumbering(m)"
            ><i class="check" :class="{ on: numberingValue === m }">✓</i>{{ NUMBERING_LABELS[m] }}</button>
          </li>
        </template>
      </ul>
      </Teleport>
    </div>
  </div>
</template>

<style scoped>
/* One row of small icons: eye, "+", the OCL dot, "⋯" */
.right-rail {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 0.15rem;
}

.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.3rem;
  height: 1.3rem;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
}

.icon i {
  font-size: 0.75rem;
}

.icon:hover:not(:disabled),
.icon.on {
  background: var(--surface-hover);
  color: var(--primary-color);
}

.icon:disabled {
  opacity: 0.35;
  cursor: default;
}

/* The OCL dot between the icons, a little apart from them; its count centred */
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 1rem;
  height: 1rem;
  margin: 0 0.25rem;
  padding: 0 0.25rem;
  border: none;
  border-radius: 999px;
  font: inherit;
  font-size: 0.65rem;
  line-height: 1;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #fff;
  cursor: pointer;
}

.badge.ok {
  width: 0.5rem;
  min-width: 0;
  height: 0.5rem;
  padding: 0;
  /* Takes the room of a count badge (1rem + margins), so the bars line up */
  margin: 0 0.5rem;
  background: color-mix(in srgb, var(--green-500, #22c55e) 70%, transparent);
}

/* The count trimmed to its digits' height (cap height to baseline), so the ring centres the digits themselves */
.count {
  display: block;
  line-height: 1;
  text-box: trim-both cap alphabetic;
  /* Digits reach a little above the cap height - evens that out */
  translate: 0 0.04em;
}

/* Browsers without text-box trimming: the digits sit about 1px high in the line box - moved down by that */
@supports not (text-box: trim-both cap alphabetic) {
  .count {
    translate: 0 0.115em;
  }
}

/* Findings as a ring in their colour, the count inside - not filled */
.badge.warning,
.badge.error {
  border: 1.5px solid currentColor;
  background: transparent;
}

.badge.warning {
  color: var(--orange-500, #f97316);
}

.badge.error {
  color: var(--red-500, #ef4444);
}

.actions-wrap {
  position: relative;
}

.actions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.3rem;
  height: 1.3rem;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
}

.actions i {
  font-size: 0.75rem;
}

.actions:hover,
.actions[aria-expanded='true'] {
  background: var(--surface-hover);
  color: var(--primary-color);
}

.menu {
  position: fixed;
  z-index: 1000;
  min-width: 14rem;
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
  background: var(--surface-card, var(--surface-ground));
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.menu button {
  display: block;
  width: 100%;
  font: inherit;
  font-size: 0.8rem;
  text-align: left;
  padding: 0.3rem 0.75rem;
  border: none;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
}

.menu button:hover:not(:disabled) {
  background: var(--surface-hover);
}

.menu button.confirm {
  color: var(--red-500, #ef4444);
  font-weight: 600;
}

.menu button:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Settings (tagged values) as choices in the same dropdown */
.menu .group {
  margin-top: 0.25rem;
  padding: 0.35rem 0.75rem 0.15rem;
  border-top: 1px solid var(--surface-border);
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
}

.check {
  display: inline-block;
  width: 1rem;
  font-style: normal;
  color: var(--primary-color);
  visibility: hidden;
}

.check.on {
  visibility: visible;
}
</style>
