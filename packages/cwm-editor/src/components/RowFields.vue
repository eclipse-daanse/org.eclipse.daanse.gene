<script setup lang="ts">
/**
 * The attributes of an ObjectRow, edited in place (PH-7 after CR-2).
 *
 * Set attributes show by default, unset ones with a UI default too;
 * "alle anzeigen" reveals the rest, including those a field rule hides.
 * Text fields offer the rule's suggested values; a UI default shows as
 * placeholder and is never written.
 */
import { computed, inject, ref } from 'tsm:vue'
import { fieldsOf, hiddenFieldCount, setField, type RowField } from '../composables/rowContent'
import { CWM_EDITING } from '../composables/editing'

const props = defineProps<{
  object: any
  testId: string
  version?: number
}>()

const editing = inject(CWM_EDITING)!
const showAll = ref(false)

const fields = computed(() => {
  void props.version
  return fieldsOf(props.object, showAll.value)
})

const hidden = computed(() => {
  void props.version
  return hiddenFieldCount(props.object)
})

function write(field: RowField, value: string | boolean): void {
  editing.change(() => setField(props.object, field, value))
}

function onInput(field: RowField, event: Event): void {
  const el = event.target as HTMLInputElement | HTMLSelectElement
  write(field, el.type === 'checkbox' ? (el as HTMLInputElement).checked : el.value)
}
</script>

<template>
  <div class="fields" :data-testid="testId" data-wire-kind="INPUT">
    <div v-if="fields.length" class="grid">
      <template v-for="f in fields" :key="f.name">
        <label
          :for="`${testId}.${f.name}`"
          :class="{ unset: !f.isSet }"
          :title="f.hidden ? 'Durch eine Feldregel ausgeblendet' : undefined"
        >{{ f.label }}<span v-if="f.hidden" class="hidden-mark"> ◌</span></label>
        <input
          v-if="f.kind === 'boolean'"
          :id="`${testId}.${f.name}`"
          type="checkbox"
          :class="{ 'ui-default': !f.isSet && f.uiDefault != null }"
          :checked="f.isSet ? !!f.value : f.uiDefault === 'true'"
          :title="!f.isSet && f.uiDefault != null ? 'UI-Default, nicht im Modell' : undefined"
          @change="onInput(f, $event)"
        />
        <select
          v-else-if="f.kind === 'enum'"
          :id="`${testId}.${f.name}`"
          :value="f.value ?? ''"
          @change="onInput(f, $event)"
        >
          <option v-if="!f.isSet" value="" disabled>{{ f.uiDefault ?? '–' }}</option>
          <option v-for="o in f.options" :key="o" :value="o">{{ o }}</option>
        </select>
        <input
          v-else
          :id="`${testId}.${f.name}`"
          :type="f.kind === 'number' ? 'number' : 'text'"
          :value="f.value ?? ''"
          :placeholder="f.uiDefault ?? undefined"
          :title="!f.isSet && f.uiDefault != null ? 'UI-Default, nicht im Modell' : undefined"
          :list="f.suggestions.length ? `${testId}.${f.name}.suggestions` : undefined"
          @change="onInput(f, $event)"
        />
        <datalist v-if="f.suggestions.length" :id="`${testId}.${f.name}.suggestions`">
          <option v-for="s in f.suggestions" :key="s" :value="s"></option>
        </datalist>
      </template>
    </div>
    <button
      v-if="hidden > 0 || showAll"
      type="button"
      class="show-all"
      @click="showAll = !showAll"
    >{{ showAll ? 'weniger anzeigen' : `alle anzeigen (+${hidden})` }}</button>
  </div>
</template>

<style scoped>
.fields {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
}

.grid {
  display: grid;
  grid-template-columns: max-content minmax(8rem, 24rem);
  gap: 0.2rem 0.75rem;
  align-items: center;
}

label {
  color: var(--text-color-secondary);
}

label.unset {
  opacity: 0.7;
}

.hidden-mark {
  color: var(--text-color-secondary);
}

input::placeholder,
select:invalid {
  font-style: italic;
  color: var(--text-color-secondary);
}

input.ui-default {
  opacity: 0.6;
}

input[type='text'],
input[type='number'],
select {
  font: inherit;
  color: var(--text-color);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  padding: 0.1rem 0.3rem;
}

input[type='text']:hover,
input[type='number']:hover,
select:hover,
input:focus,
select:focus {
  border-color: var(--surface-border);
  background: var(--surface-ground);
}

input[type='checkbox'] {
  justify-self: start;
}

.show-all {
  margin-top: 0.2rem;
  font: inherit;
  font-size: 0.7rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--primary-color);
  cursor: pointer;
}
</style>
