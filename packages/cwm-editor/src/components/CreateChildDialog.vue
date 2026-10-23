<script setup lang="ts">
/**
 * Creates a child (in a containment feature of the parent) or a sibling (in
 * the same list, at a given position). A GenE dialog, laid out like the
 * instance tree's class picker: search, the classes as a list with icon,
 * name and package - the parent's own namespace first, the others under
 * "Weitere" - and a counter. Enter takes the first match. The new object is
 * selected.
 *
 * Test id: `cwm.Editor.CreateChild`.
 */
import { computed, inject, ref, shallowRef, toRaw } from 'tsm:vue'
import { Button, Dialog, Dropdown, InputText } from 'tsm:primevue'
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

const visible = ref(true)

const features = computed(() => (props.feature ? [props.feature] : containmentFeatures(props.parent)))
/** ownedElement first when there is one: the usual place for a child */
const chosenFeature = shallowRef<any>(
  features.value.find((f: any) => f.getName() === 'ownedElement') ?? features.value[0] ?? null
)
const featureOptions = computed(() => features.value.map((f: any) => ({ label: f.getName(), value: f.getName() })))
const featureName = computed({
  get: () => chosenFeature.value?.getName?.() ?? null,
  set: (name: string | null) => { chosenFeature.value = features.value.find((f: any) => f.getName() === name) ?? null }
})

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
const total = computed(() => groups.value.near.length + groups.value.more.length)
const shown = computed(() => near.value.length + (moreOpen.value ? more.value.length : 0))

/** The icon the tree gives instances of the class */
function iconOf(c: any): { iconClass?: string; iconDataUrl?: string } | null {
  try {
    return editing.iconFor({ eClass: () => c })
  } catch {
    return null
  }
}

const packageOf = (c: any) => String(c.getEPackage?.()?.getName?.() ?? '')

function pick(c: any): void {
  const f = chosenFeature.value
  if (!f) return
  let created: any = null
  editing.change(() => { created = createChild(props.parent, f, c, props.index) })
  if (created) editing.select(created)
  close()
}

function pickFirst(): void {
  const first = near.value[0] ?? (moreOpen.value ? more.value[0] : undefined)
  if (first) pick(first)
}

function close(): void {
  visible.value = false
  emit('close')
}

const title = computed(() => {
  const where = displayName(toRaw(props.parent))
  return props.feature ? `Neues Element in ${where}` : `Neues Kind von ${where}`
})
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="title"
    :style="{ width: '32rem' }"
    :pt="{ root: { 'data-testid': 'cwm.Editor.CreateChild' } }"
    @hide="emit('close')"
  >
    <div class="create-child">
      <div class="where">
        <span class="label">in</span>
        <Dropdown
          v-if="features.length > 1"
          v-model="featureName"
          :options="featureOptions"
          option-label="label"
          option-value="value"
          class="feature"
          aria-label="Feature"
        />
        <code v-else-if="chosenFeature" class="feature-fixed">{{ chosenFeature.getName() }}</code>
      </div>

      <InputText
        v-model="filter"
        placeholder="Klasse suchen…"
        class="search"
        autofocus
        aria-label="Klasse suchen"
        @keydown.enter.prevent="pickFirst"
      />

      <div class="list">
        <div v-if="near.length" class="group">{{ groups.nearLabel }}</div>
        <button v-for="c in near" :key="`n-${c.getName()}`" type="button" class="entry" @click="pick(c)">
          <img v-if="iconOf(c)?.iconDataUrl" :src="iconOf(c)!.iconDataUrl" class="icon" alt="" />
          <i v-else :class="iconOf(c)?.iconClass || 'pi pi-file'" class="icon"></i>
          <span class="name">{{ c.getName() }}</span>
        </button>

        <template v-if="more.length">
          <button v-if="!moreOpen" type="button" class="more" @click="showMore = true">
            <i class="pi pi-chevron-right"></i> Weitere Klassen ({{ more.length }})
          </button>
          <template v-else>
            <div class="group">Weitere</div>
            <button
              v-for="c in more"
              :key="`m-${c.getName()}-${packageOf(c)}`"
              type="button"
              class="entry"
              @click="pick(c)"
            >
              <img v-if="iconOf(c)?.iconDataUrl" :src="iconOf(c)!.iconDataUrl" class="icon" alt="" />
              <i v-else :class="iconOf(c)?.iconClass || 'pi pi-file'" class="icon"></i>
              <span class="name">{{ c.getName() }}</span>
              <span class="package">{{ packageOf(c) }}</span>
            </button>
          </template>
        </template>

        <div v-if="!near.length && !more.length" class="empty">
          {{ filter.trim() ? `Keine Klasse passt zu „${filter.trim()}“` : 'Keine passende Klasse' }}
        </div>
      </div>

      <div class="counter">{{ shown }} von {{ total }}</div>
    </div>

    <template #footer>
      <Button label="Abbrechen" severity="secondary" text @click="close" />
    </template>
  </Dialog>
</template>

<style scoped>
/* As the instance tree's class picker (klassenauswahl) */
.create-child {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.where {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.label {
  font-size: 0.8rem;
  color: var(--text-color-secondary, #6c757d);
}

.feature {
  flex: 1 1 auto;
}

.feature-fixed {
  font-size: 0.8rem;
  color: var(--text-color-secondary, #6c757d);
}

.search {
  width: 100%;
}

.list {
  display: flex;
  flex-direction: column;
  max-height: 22rem;
  overflow-y: auto;
  border: 1px solid var(--surface-border, #dee2e6);
  border-radius: 6px;
}

.group {
  padding: 0.5rem 0.7rem 0.25rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary, #6c757d);
}

.entry {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.7rem;
  background: none;
  border: none;
  border-bottom: 1px solid var(--surface-border, #dee2e6);
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
}

.entry:last-child {
  border-bottom: none;
}

.entry:hover,
.entry:focus-visible {
  background: var(--surface-hover, rgba(0, 0, 0, 0.04));
  outline: none;
}

.icon {
  flex: 0 0 1rem;
  width: 1rem;
  height: 1rem;
  font-size: 0.9rem;
  object-fit: contain;
  color: var(--text-color-secondary, #6c757d);
}

.name {
  font-weight: 600;
}

/* The package tells same-named classes apart, muted beside the name */
.package {
  margin-left: auto;
  font-size: 0.8rem;
  color: var(--text-color-secondary, #6c757d);
}

.more {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.7rem;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  font: inherit;
  font-size: 0.85rem;
  color: var(--primary-color);
}

.more i {
  font-size: 0.7rem;
}

.more:hover {
  background: var(--surface-hover, rgba(0, 0, 0, 0.04));
}

.empty,
.counter {
  padding: 0.5rem 0.7rem;
  font-size: 0.8rem;
  color: var(--text-color-secondary, #6c757d);
}

.counter {
  padding: 0;
  text-align: right;
}
</style>
