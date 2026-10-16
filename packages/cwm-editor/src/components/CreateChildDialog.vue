<script setup lang="ts">
/**
 * Creates a child (in a containment feature of the parent) or a sibling (in
 * the same list, at a given position). The classes of the parent's own
 * namespace come first, the others under "Weitere"; a filter narrows both.
 * The new object is selected.
 *
 * Test id: `cwm.Editor.CreateChild`.
 */
import { computed, inject, ref, shallowRef, toRaw } from 'tsm:vue'
import { containmentFeatures, createChild, creatableGroups } from '../composables/childCreation'
import { displayName } from '../composables/contextView'
import { CWM_EDITING } from '../composables/editing'

const props = defineProps<{
  parent: any
  /** Fixed feature (a sibling goes into the list of the object it follows); else the parent's choice */
  feature?: any
  /** Position in the list; none = at the end */
  index?: number
}>()

const emit = defineEmits<{ close: [] }>()

const editing = inject(CWM_EDITING)!

const features = computed(() => (props.feature ? [props.feature] : containmentFeatures(props.parent)))
/** ownedElement first when there is one: the usual place for a child */
const chosenFeature = shallowRef<any>(
  features.value.find((f: any) => f.getName() === 'ownedElement') ?? features.value[0] ?? null
)

const filter = ref('')
const showMore = ref(false)

const groups = computed(() =>
  chosenFeature.value ? creatableGroups(props.parent, chosenFeature.value, editing.objects.value) : { nearLabel: '', near: [], more: [] }
)

function matches(c: any): boolean {
  const f = filter.value.trim().toLowerCase()
  return !f || String(c.getName()).toLowerCase().includes(f)
}

const near = computed(() => groups.value.near.filter(matches))
const more = computed(() => groups.value.more.filter(matches))
/** While filtering, the other classes show without asking */
const moreOpen = computed(() => showMore.value || filter.value.trim() !== '' || near.value.length === 0)

function pick(c: any): void {
  const f = chosenFeature.value
  if (!f) return
  let created: any = null
  editing.change(() => { created = createChild(props.parent, f, c, props.index) })
  if (created) editing.select(created)
  emit('close')
}

function onFeature(event: Event): void {
  const name = (event.target as HTMLSelectElement).value
  chosenFeature.value = features.value.find((f: any) => f.getName() === name) ?? null
}

const title = computed(() => {
  const where = displayName(toRaw(props.parent))
  return props.feature ? `Neues Element in ${where}` : `Neues Kind von ${where}`
})
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="dialog" role="dialog" :aria-label="title" data-testid="cwm.Editor.CreateChild">
      <header>
        <strong>{{ title }}</strong>
        <select v-if="features.length > 1" :value="chosenFeature?.getName()" aria-label="Feature" @change="onFeature">
          <option v-for="f in features" :key="f.getName()" :value="f.getName()">{{ f.getName() }}</option>
        </select>
        <span v-else-if="chosenFeature" class="feature">{{ chosenFeature.getName() }}</span>
        <input v-model="filter" placeholder="Klasse filtern …" aria-label="Klasse filtern" autofocus />
      </header>
      <div class="list">
        <div v-if="near.length" class="group">{{ groups.nearLabel }}</div>
        <button v-for="c in near" :key="`n-${c.getName()}`" type="button" class="item" @click="pick(c)">{{ c.getName() }}</button>
        <template v-if="more.length">
          <button v-if="!moreOpen" type="button" class="group toggle-more" @click="showMore = true">
            Weitere ({{ more.length }}) …
          </button>
          <template v-else>
            <div class="group">Weitere</div>
            <button v-for="c in more" :key="`m-${c.getName()}-${c.getEPackage?.()?.getName?.()}`" type="button" class="item" @click="pick(c)">
              {{ c.getName() }}<span class="pkg">{{ c.getEPackage?.()?.getName?.() }}</span>
            </button>
          </template>
        </template>
        <div v-if="!near.length && !more.length" class="none">Keine passende Klasse</div>
      </div>
      <footer>
        <button type="button" @click="emit('close')">Abbrechen</button>
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
  width: min(30rem, 92vw);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--surface-card, var(--surface-ground));
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  font-size: 0.85rem;
  color: var(--text-color);
}

header,
footer {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
}

header {
  flex-wrap: wrap;
  border-bottom: 1px solid var(--surface-border);
}

header strong {
  flex: 1 1 100%;
}

header input {
  flex: 1 1 auto;
}

input,
select {
  font: inherit;
  color: var(--text-color);
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 3px;
  padding: 0.2rem 0.4rem;
}

.feature {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.list {
  flex: 1 1 auto;
  overflow: auto;
  padding: 0.3rem 0;
}

.group {
  padding: 0.4rem 0.75rem 0.2rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary);
}

.toggle-more {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--primary-color);
  text-transform: none;
  letter-spacing: normal;
  font-size: 0.8rem;
}

.item {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 0.25rem 0.75rem 0.25rem 1.25rem;
  font: inherit;
  text-align: left;
  color: var(--text-color);
  background: none;
  border: none;
  cursor: pointer;
}

.item:hover {
  background: var(--surface-hover);
}

.pkg {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.none {
  padding: 0.5rem 0.75rem;
  color: var(--text-color-secondary);
}

footer {
  justify-content: flex-end;
  border-top: 1px solid var(--surface-border);
}

footer button {
  font: inherit;
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--surface-border);
  border-radius: 4px;
  background: var(--surface-ground);
  color: var(--text-color);
  cursor: pointer;
}
</style>
