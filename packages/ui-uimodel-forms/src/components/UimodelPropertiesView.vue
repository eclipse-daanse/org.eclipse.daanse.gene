<script setup lang="ts">
/**
 * UimodelPropertiesView — rendert die Feature-Sektionen des Property-Views
 * ueber den @emfts/uimodel-composer (Plan Phase 1/3/4).
 *
 * Ohne autoriertes UIModel (Registry, Phase 3) wird per Default-Generator
 * eines aus der EClass erzeugt (E4). Die Komponenten des UIModels werden
 * hier selbst ueber den ComponentDispatcher des Composers verteilt statt
 * ueber <UIModelComposer>, damit je Gruppe eine ECHTE Sektions-Ueberschrift
 * im DOM steht (Paritaet zum bisherigen Panel; uimodel.ecore kennt noch
 * kein Section-Titel-Konzept — F4-Erweiterungskandidat).
 */
import { computed, inject, provide, watch } from 'tsm:vue'
import type { EObject, EStructuralFeature } from '@emfts/core'
import {
  ComponentDispatcher,
  createComposerRegistry,
  COMPOSER_REGISTRY_KEY,
  FormViewComposer,
  SectionViewComposer,
  TabViewComposer,
  SummaryViewComposer,
  TableViewComposer,
  MasterDetailComposer,
  collectExpansionContext,
  EXPANSION_CONTEXT_KEY
} from '@emfts/uimodel-composer'
import { buildDefaultUiModel } from '../defaultUiModel'
import { bumpModelVersion } from '../oclAdapter'
import { findUiModel } from '../uiModelRegistry'

const props = defineProps<{
  eObject: EObject
  attributes: EStructuralFeature[]
  references: EStructuralFeature[]
  /** Derived Features (Ecore-derived Attribute + Referenzen), read-only */
  derived?: EStructuralFeature[]
}>()

// Composer-Registry fuer die Dispatch-Kette bereitstellen (sonst macht das
// UIModelComposer; Vega/Map bewusst nicht registriert — nicht benoetigt).
provide(COMPOSER_REGISTRY_KEY, createComposerRegistry({
  FormView: FormViewComposer,
  SectionView: SectionViewComposer,
  TabView: TabViewComposer,
  SummaryView: SummaryViewComposer,
  TableView: TableViewComposer,
  MasterDetail: MasterDetailComposer
}))

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
    references: props.references,
    derived: props.derived
  })
})

const components = computed(() => uiModel.value?.components ?? [])

// AllFeatures-Expansionskontext (Dedup zwischen Geschwister-Bloecken +
// explizit gebundene Widgets): normalerweise provided das der
// UIModelComposer — wir dispatchen selbst, also selbst bereitstellen.
provide(EXPANSION_CONTEXT_KEY, computed(() => collectExpansionContext(uiModel.value as any)))

</script>

<template>
  <div class="uimodel-properties-view">
    <div
      v-for="component in components"
      :key="component.name"
      class="section-group"
    >
      <div v-if="component.group" class="section-heading">{{ component.group }}</div>
      <ComponentDispatcher :component="component" :model="eObject" />
    </div>
  </div>
</template>

<style scoped>
/* Gleiche Optik wie die Sektionen des bisherigen Panels: dort sind die
   Sektionen direkte Flex-Kinder von .panel-content (gap: 0.75rem) — hier
   stecken sie in einem Wrapper und brauchen denselben Abstand. */
.uimodel-properties-view {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.section-group {
  margin-bottom: 0.25rem;
}

.section-heading {
  font-size: 0.75rem;
  text-align: center;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--primary-color, #6366f1);
  padding: 0.5rem 0.75rem 0.35rem;
  margin: 0 0 0.4rem;
  background: color-mix(in srgb, var(--primary-color, #6366f1) 6%, transparent);
  border-radius: 4px;
  border-bottom: 2px solid color-mix(in srgb, var(--primary-color, #6366f1) 25%, transparent);
}

/* Leere Sektionen (AllFeatures-Platzhalter expandierte zu 0 Widgets)
   samt Ueberschrift verbergen — Paritaet: das bisherige Panel rendert
   Sektionen nur, wenn sie Inhalt haben. */
.uimodel-properties-view .section-group:not(:has(.uimodel-property-row)) {
  display: none;
}

/* GroupWidget-Layouts (emf.ts.ui#6): der Composer stempelt nur Klassen,
   das Layout definiert der Konsument. */
.uimodel-properties-view :deep(.uimodel-group--horizontal) {
  display: flex;
  gap: 0.5rem;
}
.uimodel-properties-view :deep(.uimodel-group--horizontal > *) {
  flex: 1;
  min-width: 0;
}
.uimodel-properties-view :deep(.uimodel-group--grid) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}
.uimodel-properties-view :deep(.uimodel-foreach-empty) {
  color: var(--text-color-secondary);
  font-size: 0.85rem;
  padding: 0.25rem 0.5rem;
  margin: 0;
}
</style>
