<script setup lang="ts">
/**
 * The documentation of the selected element.
 *
 * A description shows its text, editable, and beneath it everything it owns
 * as paragraphs, one level deeper each. A table shows as a table. Any other
 * element - package, schema, class - shows what beneath it is documented.
 */
import { computed, toRaw } from 'tsm:vue'
import DocSection from './DocSection.vue'
import { sectionFor, isDescription, setDescriptionField } from '../composables/documentation'

const props = defineProps<{ context: any }>()

const selected = computed(() => {
  // The model version changes with every edit; reading it re-reads the model
  void props.context.version?.value
  return toRaw(props.context.selectedObject?.value ?? null)
})

const root = computed(() => (selected.value ? sectionFor(selected.value) : null))
const editable = computed(() => isDescription(selected.value))

function onEdit(field: 'name' | 'body', value: string): void {
  if (!selected.value) return
  if (!setDescriptionField(selected.value, field, value)) return
  props.context.markDirty?.()
  props.context.triggerUpdate?.()
}
</script>

<template>
  <div class="cwm-documentation">
    <div v-if="!selected" class="empty">
      <i class="pi pi-book"></i>
      <p>Ein Element im Baum wählen — eine Beschreibung, eine Tabelle oder ein Paket.</p>
    </div>
    <div v-else-if="!root" class="empty">
      <i class="pi pi-info-circle"></i>
      <p>Zu diesem Element gibt es keine Dokumentation.</p>
    </div>
    <DocSection v-else :section="root" :editable="editable" @edit="onEdit" />
  </div>
</template>

<style scoped>
.cwm-documentation {
  height: 100%;
  overflow: auto;
  padding: 1rem 1.5rem 2rem;
  box-sizing: border-box;
  max-width: 1100px;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  color: var(--text-color-secondary);
  text-align: center;
}

.empty i {
  font-size: 2rem;
}
</style>
