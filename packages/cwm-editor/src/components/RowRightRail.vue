<script setup lang="ts">
/**
 * Right column of an ObjectRow (PH-4): the OCL validation result as a badge,
 * below it the actions menu from the registry per EClass.
 *
 * The badge shows the issues the problems service holds for this object; a
 * click on it - or "Validieren" in the menu - validates the object anew.
 */
import { computed, inject, onBeforeUnmount, ref, watch } from 'tsm:vue'
import { actionLabel, actionRegistry, type ActionApi, type CwmAction } from '../composables/actions'
import { CWM_EDITING } from '../composables/editing'

const props = defineProps<{
  object: any
  testId: string
  version?: number
}>()

const editing = inject(CWM_EDITING)!

const issues = computed(() => {
  void props.version
  return editing.issuesFor(props.object)
})
const errors = computed(() => issues.value.filter(i => i.severity === 'error').length)
const warnings = computed(() => issues.value.filter(i => i.severity === 'warning').length)
const badge = computed(() => {
  if (errors.value > 0) return { text: `OCL ✗ ${errors.value}`, kind: 'error' }
  if (warnings.value > 0) return { text: `OCL ! ${warnings.value}`, kind: 'warning' }
  return { text: 'OCL ✓', kind: 'ok' }
})
const badgeTitle = computed(() =>
  issues.value.length ? issues.value.map(i => `${i.severity}: ${i.message}`).join('\n') : 'Keine Befunde — Klick validiert neu'
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

function onDocumentClick(event: MouseEvent): void {
  if (!(event.target as HTMLElement).closest?.(`[data-testid="${props.testId}"]`)) open.value = false
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
      class="badge"
      :class="badge.kind"
      :data-testid="`${testId}.Validation`"
      data-wire-kind="BADGE"
      :title="badgeTitle"
      @click="editing.validate(object)"
    >{{ badge.text }}</button>
    <div class="actions-wrap" :data-testid="`${testId}.Actions`" data-wire-kind="CONTROL">
      <button
        type="button"
        class="actions"
        aria-haspopup="menu"
        :aria-expanded="open"
        @click="open = !open"
      >Aktionen ▾</button>
      <ul v-if="open" class="menu" role="menu">
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
      </ul>
    </div>
  </div>
</template>

<style scoped>
.right-rail {
  flex: 0 0 7rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.3rem;
}

.badge,
.actions {
  width: 100%;
  font: inherit;
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  border: 1px solid var(--surface-border);
  color: var(--text-color-secondary);
  background: transparent;
  text-align: center;
  cursor: pointer;
}

.badge.ok {
  color: var(--green-500, #22c55e);
  border-color: color-mix(in srgb, var(--green-500, #22c55e) 40%, transparent);
}

.badge.warning {
  color: var(--orange-500, #f97316);
  border-color: color-mix(in srgb, var(--orange-500, #f97316) 50%, transparent);
}

.badge.error {
  color: var(--red-500, #ef4444);
  border-color: color-mix(in srgb, var(--red-500, #ef4444) 50%, transparent);
}

.actions-wrap {
  position: relative;
}

.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 2px);
  z-index: 20;
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
</style>
