<script setup lang="ts">
/**
 * UimodelPropertiesView — rendert die Feature-Sektionen des Property-Views
 * ueber den @emfts/uimodel-composer (Plan Phase 1).
 *
 * Ohne autoriertes UIModel wird per Default-Generator eines aus der EClass
 * des selektierten Objekts erzeugt (E4). Die Feature-Listen kommen vom
 * PropertiesPanel (useInstanceEditor), damit exakt dieselben Features
 * erscheinen wie im bisherigen Pfad.
 */
import { computed, inject, watch } from 'tsm:vue'
import type { EObject, EStructuralFeature } from '@emfts/core'
import { UIModelComposer } from '@emfts/uimodel-composer'
import { buildDefaultUiModel } from '../defaultUiModel'
import { bumpModelVersion } from '../oclAdapter'
import { findUiModel } from '../uiModelRegistry'

const props = defineProps<{
  eObject: EObject
  attributes: EStructuralFeature[]
  references: EStructuralFeature[]
}>()

// Modell-Version aus dem Editor-Kontext → OCL-Cache invalidieren, damit
// visibilityCondition/ValidationExpression auf Wertaenderungen reagieren.
const tsm = inject<any>('tsm')
const GENE_EDITOR_CONTEXT_KEY = tsm?.getService('ui.instance.composables')?.GENE_EDITOR_CONTEXT_KEY
const editorCtx = inject<any>(GENE_EDITOR_CONTEXT_KEY, null)
watch(() => editorCtx?.modelVersion?.value, () => bumpModelVersion())

// Autoriertes UIModel aus der Registry (Workspace vor App-Default, Phase 3);
// ohne Treffer Default-Generator. Je Selektion neu ausgewaehlt/aufgebaut —
// bewusst KEINE Abhaengigkeit auf die Modell-Version: ein Rebuild pro
// Tastendruck wuerde die Widgets neu erzeugen und den Fokus zerstoeren.
// findUiModel liest die Registry-Version → Registry-Aenderungen (Datei
// hinzugefuegt/entfernt) waehlen automatisch neu aus.
const uiModel = computed(() => {
  const authored = findUiModel(props.eObject)
  if (authored) return authored
  const eClass = props.eObject?.eClass?.()
  return buildDefaultUiModel({
    eClass,
    attributes: props.attributes,
    references: props.references
  })
})
</script>

<template>
  <div class="uimodel-properties-view">
    <UIModelComposer :ui-model="uiModel" :model="eObject" />
  </div>
</template>

<style scoped>
/* Sektions-Ueberschrift aus dem gestempelten data-uim-group-Attribut —
   gleiche Optik wie .section-heading des bisherigen Panels. */
.uimodel-properties-view :deep(.uimodel-form-view[data-uim-group])::before {
  content: attr(data-uim-group);
  display: block;
  font-size: 0.75rem;
  text-align: center;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--primary-color, #6366f1);
  padding: 0.5rem 0.75rem 0.35rem;
  margin-bottom: 0.4rem;
  background: color-mix(in srgb, var(--primary-color, #6366f1) 6%, transparent);
  border-radius: 4px;
  border-bottom: 2px solid color-mix(in srgb, var(--primary-color, #6366f1) 25%, transparent);
}

.uimodel-properties-view :deep(.uimodel-form-view) {
  margin-bottom: 0.25rem;
}
</style>
