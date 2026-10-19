<script setup lang="ts">
/**
 * Adds an access grant. Two ways in:
 *
 * - The assistant (`party` and/or `target` given, or neither): choose the
 *   responsible party, the schema / table / column / cube and the access.
 *   The grant always goes under the party - into an AccessRole it contains
 *   (design decision, Stefan, 2026-10-19 10:45).
 * - The structure's + (`parent` and `kind` given): a grant of that level in
 *   the parent grant or role, its object chosen from what fits there.
 *
 * Test id: `cwm.Editor.GrantDialog`.
 */
import { computed, inject, ref, shallowRef, toRaw } from 'tsm:vue'
import { addGrant, grantableTargets, grantForParty, type GrantChildKind } from '../composables/grants'
import { attr, className } from '../composables/documentation'
import { displayName, pathTo } from '../composables/contextView'
import { CWM_EDITING } from '../composables/editing'

const props = defineProps<{
  /** Assistant: the party, fixed when the dialog comes from it */
  party?: any
  /** Assistant: the object, fixed when the dialog comes from it */
  target?: any
  /** Structure: the grant or role the new grant goes into */
  parent?: any
  kind?: GrantChildKind
}>()

const emit = defineEmits<{ close: [] }>()

const editing = inject(CWM_EDITING)!

const assistant = computed(() => !props.parent)
const ACCESS = ['all', 'custom', 'none']
const access = ref('all')

const chosenParty = shallowRef<any>(props.party ? toRaw(props.party) : null)
const chosenTarget = shallowRef<any>(props.target ? toRaw(props.target) : null)

const partyFilter = ref('')
const targetFilter = ref('')

function pathText(o: any): string {
  return pathTo(o).map(displayName).join(' › ')
}

const parties = computed(() => {
  const f = partyFilter.value.trim().toLowerCase()
  return editing.objects.value
    .filter(o => className(o) === 'ResponsibleParty')
    .filter(o => !f || displayName(o).toLowerCase().includes(f))
})

const targets = computed(() => {
  const all = assistant.value
    ? grantableTargets(editing.objects.value)
    : props.kind!.targets(props.parent, editing.objects.value)
  const f = targetFilter.value.trim().toLowerCase()
  return all.filter(o => !f || `${className(o)} ${displayName(o)} ${pathText(o)}`.toLowerCase().includes(f)).slice(0, 200)
})

/** Levels without an object (catalog, member) need none */
const needsTarget = computed(() => assistant.value || targets.value.length > 0 || !!targetFilter.value)

const canCreate = computed(() =>
  assistant.value ? !!chosenParty.value && !!chosenTarget.value : !needsTarget.value || !!chosenTarget.value)

const title = computed(() => {
  if (!assistant.value) return `${props.kind!.level}-Grant hinzufügen`
  return 'Zugriff gewähren'
})

function create(): void {
  if (!canCreate.value) return
  let made: any = null
  editing.change(() => {
    made = assistant.value
      ? grantForParty(chosenParty.value, chosenTarget.value, access.value, editing.objects.value)
      : addGrant(props.parent, props.kind!.feature, chosenTarget.value, access.value)
  })
  if (made && assistant.value) editing.select(chosenParty.value)
  emit('close')
}

const partyName = (p: any) => String(attr(p, 'name') ?? '') || '(ohne Namen)'
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="dialog" role="dialog" :aria-label="title" data-testid="cwm.Editor.GrantDialog">
      <header>
        <strong>{{ title }}</strong>
        <p v-if="assistant" class="hint">Der Grant wird unter der gewählten Responsible Party abgelegt.</p>
      </header>

      <section v-if="assistant">
        <div class="label">Responsible Party</div>
        <div v-if="party" class="fixed"><i class="pi pi-user"></i>{{ partyName(party) }}</div>
        <template v-else>
          <input v-model="partyFilter" placeholder="Responsible Party suchen …" aria-label="Responsible Party suchen" />
          <ul class="list">
            <li
              v-for="(p, i) in parties"
              :key="i"
              :class="{ chosen: p === chosenParty }"
              @click="chosenParty = p"
            ><i class="pi pi-user"></i>{{ partyName(p) }}<span class="path">{{ pathText(p) }}</span></li>
            <li v-if="!parties.length" class="none">Keine Responsible Party im Modell</li>
          </ul>
        </template>
      </section>

      <section v-if="needsTarget">
        <div class="label">{{ assistant ? 'Objekt (Schema, Tabelle, Spalte oder Cube)' : kind!.level }}</div>
        <div v-if="target" class="fixed">{{ className(target) }} {{ displayName(target) }}</div>
        <template v-else>
          <input v-model="targetFilter" placeholder="Objekt suchen …" aria-label="Objekt suchen" />
          <ul class="list">
            <li
              v-for="(t, i) in targets"
              :key="i"
              :class="{ chosen: t === chosenTarget }"
              @click="chosenTarget = t"
            ><span class="kind">{{ className(t) }}</span>{{ displayName(t) }}<span class="path">{{ pathText(t) }}</span></li>
            <li v-if="!targets.length" class="none">Nichts Passendes gefunden</li>
          </ul>
        </template>
      </section>

      <section class="access-row">
        <div class="label">Zugriff</div>
        <label v-for="a in ACCESS" :key="a" class="access" :class="[`access-${a}`, { on: access === a }]">
          <input v-model="access" type="radio" :value="a" />{{ a }}
        </label>
      </section>

      <footer>
        <button type="button" @click="emit('close')">Abbrechen</button>
        <button type="button" class="primary" :disabled="!canCreate" data-testid="cwm.Editor.GrantDialog.Create" @click="create">Anlegen</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.dialog {
  width: min(34rem, 92vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.9rem 1rem;
  background: var(--surface-card, var(--surface-ground));
  border: 1px solid var(--surface-border);
  border-top: 2px solid var(--primary-color);
  border-radius: 6px;
  font-size: 0.82rem;
  color: var(--text-color);
  overflow: auto;
}

.hint {
  margin: 0.2rem 0 0;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.label {
  margin-bottom: 0.25rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
}

input:not([type='radio']) {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  color: var(--text-color);
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 3px;
  padding: 0.25rem 0.45rem;
}

input:not([type='radio']):focus {
  outline: none;
  border-color: var(--primary-color);
}

.list {
  max-height: 11rem;
  overflow: auto;
  margin: 0.25rem 0 0;
  padding: 0.15rem 0;
  list-style: none;
  border: 1px solid var(--surface-border);
  border-radius: 3px;
}

.list li {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
  white-space: nowrap;
}

.list li:hover {
  background: var(--surface-hover);
}

.list li.chosen {
  background: color-mix(in srgb, var(--primary-color) 16%, transparent);
}

.list li.none {
  cursor: default;
  color: var(--text-color-secondary);
  font-style: italic;
}

.list i,
.fixed i {
  font-size: 0.65rem;
  color: var(--primary-color);
}

.kind {
  font-size: 0.7rem;
  color: var(--text-color-secondary);
}

.path {
  margin-left: auto;
  padding-left: 1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.7rem;
  color: var(--text-color-secondary);
}

.fixed {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
}

.access-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.access-row .label {
  margin: 0 0.4rem 0 0;
}

.access {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--surface-border);
  cursor: pointer;
  font-weight: 600;
}

.access input {
  display: none;
}

.access-all.on {
  color: #16a34a;
  border-color: #16a34a;
  background: color-mix(in srgb, #16a34a 14%, transparent);
}

.access-custom.on {
  color: #d97706;
  border-color: #d97706;
  background: color-mix(in srgb, #d97706 14%, transparent);
}

.access-none.on {
  color: #dc2626;
  border-color: #dc2626;
  background: color-mix(in srgb, #dc2626 14%, transparent);
}

footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.3rem;
}

footer button {
  font: inherit;
  padding: 0.25rem 0.8rem;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  background: var(--surface-ground);
  color: var(--text-color);
  cursor: pointer;
}

footer button.primary {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: var(--primary-color-text, #fff);
}

footer button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
