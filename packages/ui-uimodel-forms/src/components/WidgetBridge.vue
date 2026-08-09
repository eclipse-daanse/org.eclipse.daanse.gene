<script setup lang="ts">
/**
 * WidgetBridge — verbindet den uimodel-composer mit den gene-Feldern.
 *
 * Der WidgetComposer des @emfts/uimodel-composer loest Widgets ueber die
 * @emfts/vue-registry auf und uebergibt { eObject, feature, eClass, custom }.
 * Diese Bridge rendert dafuer das bestehende PropertyField aus dem
 * instance-builder und verdrahtet Wert-Zugriff und Aktionen mit dem vom
 * PropertiesPanel bereitgestellten Editor-Kontext (GENE_EDITOR_CONTEXT_KEY) —
 * dadurch bleiben Dirty-Tracking, Referenz-Dialoge, OCL-Filter und
 * Navigation identisch zum bisherigen Pfad (Plan E5).
 */
import { computed, inject } from 'tsm:vue'
import type { EObject, EStructuralFeature, EClass, EReference } from '@emfts/core'
import { useValidation, resolveBindings } from '@emfts/uimodel-composer'
import type { WidgetComponent } from '@emfts/uimodel-composer'
import { bumpModelVersion, expressionVersion } from '../oclAdapter'
import { createRequiredValidation } from '../defaultUiModel'

const props = defineProps<{
  eObject: EObject
  feature: EStructuralFeature
  eClass?: EClass
  custom?: Record<string, unknown>
}>()

// Das UIModel-Widget (fuer ValidationExpressions), vom WidgetComposer
// als custom.rawWidget durchgereicht.
const rawWidget = computed(() => (props.custom?.rawWidget ?? null) as WidgetComponent | null)

// Fertig aufgeloeste Widget-Konfiguration (Issue #3): der WidgetComposer
// reicht sie als custom.resolvedStyle durch — PropertyBindings > statische
// Widget-Attribute > Style-Kette.
const resolvedConfig = computed(() => (props.custom?.resolvedStyle ?? null) as
  { label?: string; readOnly?: boolean; required?: boolean } | null)

// LIVE-Neuauswertung der Bindings: upstream (useWidgetConfig) haengt nicht
// reaktiv an Instanzwerten (emf.ts.ui#3) — hier gegen unsere Expression-
// Version ausgewertet, die bei jeder Wertaenderung gebumpt wird. Ergebnis
// gewinnt gegen den (potenziell veralteten) resolvedStyle-Snapshot.
const liveBindings = computed(() => {
  void expressionVersion()
  const w = rawWidget.value
  if (!w || (w.bindings?.length ?? 0) === 0) return null
  try { return resolveBindings(w, props.eObject) } catch { return null }
})
const effectiveLabel = computed(() =>
  (liveBindings.value?.values?.label as string | undefined)
    ?? resolvedConfig.value?.label ?? rawWidget.value?.label)
const effectiveReadOnly = computed(() =>
  (liveBindings.value?.values?.readOnly as boolean | undefined)
    ?? resolvedConfig.value?.readOnly)
const effectiveRequired = computed(() =>
  (liveBindings.value?.values?.required as boolean | undefined)
    ?? resolvedConfig.value?.required)

const tsm = inject<any>('tsm')

// Feld-Komponenten ueber den TSM-Service beziehen (kein statischer Cross-Import)
const instanceComponents = tsm?.getService('ui.instance.components')
const PropertyField = instanceComponents?.PropertyField
const DerivedField = instanceComponents?.DerivedField

// Editor-Kontext des PropertiesPanel (stellt Wert-Zugriff + Aktionen bereit)
const instanceComposables = tsm?.getService('ui.instance.composables')
const GENE_EDITOR_CONTEXT_KEY = instanceComposables?.GENE_EDITOR_CONTEXT_KEY
const editorCtx = inject<any>(GENE_EDITOR_CONTEXT_KEY, null)

// Derived Features (Phase 4): read-only, OCL-berechnet → DerivedField
const isDerived = computed(() => {
  try { return (props.feature as { isDerived?: () => boolean }).isDerived?.() === true } catch { return false }
})

// Referenz-Erkennung (robust fuer DynamicEObjects): die Referenz-Helfer des
// Panels (getAvailableObjects etc.) rufen isContainment() auf und wuerden
// fuer Attribute im Render crashen.
const isReference = computed(() => {
  const f: any = props.feature
  if (typeof f?.isContainment === 'function') return true
  try { return f?.eClass?.()?.getName?.() === 'EReference' } catch { return false }
})

// problemsService laedt asynchron — den reaktiven Ref bevorzugen, der
// eingefrorene Snapshot im Kontext kann noch null sein.
const problemsService = computed(() => editorCtx?.problemsServiceRef?.value ?? editorCtx?.problemsService)

// Objektbewusster Wert-Zugriff (emf.ts.ui#6): in ForEach-Bodies ist
// props.eObject ein Collection-Element, nicht das selektierte Objekt —
// der alte getFeatureValue-Pfad wuerde am falschen Objekt lesen.
const value = computed(() => {
  if (editorCtx?.getFeatureValueOn) return editorCtx.getFeatureValueOn(props.eObject, props.feature)
  return editorCtx?.getFeatureValue?.(props.feature)
})

// Validierung (Plan Phase 2, F5 — eine Quelle): Sind am UIModel-Widget
// ValidationExpressions definiert, ist deren Ergebnis massgeblich; sonst
// werden uebergangsweise die Fehler aus useInstanceEditor durchgereicht.
// Es wird immer nur EINE Meldung angezeigt (keine Doppelmeldung, A8).
// AllFeatures-expandierte Widgets tragen keine Validations — den
// Required-Check aus dem Feature (lowerBound) synthetisieren, damit die
// Semantik unabhaengig von der UIModel-Quelle identisch ist.
const effectiveValidations = computed(() => {
  const authored = rawWidget.value?.validations ?? []
  if (authored.length > 0) return authored
  if (isDerived.value) return []
  try {
    // required-Binding/-Attribut hat Vorrang vor der lowerBound-Ableitung
    // (explizites required=false unterdrueckt den Check)
    const required = effectiveRequired.value ?? ((props.feature.getLowerBound?.() ?? 0) > 0)
    if (required) {
      return [createRequiredValidation(props.feature, effectiveLabel.value)]
    }
  } catch { /* ignore */ }
  return []
})

const uimodelValidation = useValidation(
  () => effectiveValidations.value,
  () => props.eObject
)
const error = computed(() => {
  const v = uimodelValidation.value
  if (v && !v.valid) return v.message
  return editorCtx?.getFeatureError?.(props.feature)
})
const availableObjects = computed(() => isReference.value ? editorCtx?.getAvailableObjects?.(props.feature) : undefined)
const validChildClasses = computed(() => isReference.value ? editorCtx?.getValidChildClasses?.(props.feature) : undefined)
const oclFilter = computed(() => isReference.value ? editorCtx?.getOclFilter?.(props.feature) : undefined)

function onUpdateValue(v: unknown) {
  if (editorCtx?.setFeatureValueOn) editorCtx.setFeatureValueOn(props.eObject, props.feature, v)
  else editorCtx?.setFeatureValue?.(props.feature, v)
  // OCL-Expression-Cache invalidieren: der Instance-Kontext fuehrt keine
  // Modell-Version (anders als der Metamodeler), deshalb wird direkt an der
  // Schreibquelle invalidiert — visibilityCondition/Validations werten neu aus.
  bumpModelVersion()
}
function onCreate(eClass: EClass) {
  editorCtx?.handleCreate?.(eClass, props.feature)
}
function onNavigate(obj: EObject) {
  editorCtx?.handleNavigate?.(obj)
}
function onSearch(feature: EReference, callback: (obj: EObject) => void) {
  editorCtx?.handleSearch?.(feature, callback)
}
function onOclBlocked(obj: EObject, reason: string) {
  editorCtx?.handleOclBlocked?.(obj, reason)
}
</script>

<template>
  <!-- Derived Features: read-only, OCL-berechnet (Klasse property-row
       zusaetzlich fuer Selektor-Paritaet mit dem alten Pfad) -->
  <div v-if="isDerived && DerivedField" class="uimodel-property-row property-row">
    <component
      :is="DerivedField"
      :feature="feature"
      :eObject="eObject"
      :problemsService="problemsService"
      @navigate="onNavigate"
    />
  </div>
  <div v-else-if="PropertyField && editorCtx" class="uimodel-property-row property-row">
    <component
      :is="PropertyField"
      :feature="feature"
      :eObject="eObject"
      :value="value"
      :label="effectiveLabel"
      :readonly="effectiveReadOnly"
      :error="error"
      :availableObjects="availableObjects"
      :validChildClasses="validChildClasses"
      :rootPackage="editorCtx.rootPackage"
      :problemsService="problemsService"
      :oclFilter="oclFilter"
      @update:value="onUpdateValue"
      @create="onCreate"
      @navigate="onNavigate"
      @search="onSearch"
      @ocl-blocked="onOclBlocked"
    />
  </div>
  <div v-else class="uimodel-bridge-missing">
    Widget bridge unavailable (instance-builder service or editor context missing)
  </div>
</template>

<style scoped>
.uimodel-property-row {
  padding: 0.4rem 0.6rem 0.5rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--surface-card) 60%, transparent);
  border-left: 3px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}

.uimodel-property-row:hover {
  background: var(--surface-hover, color-mix(in srgb, var(--surface-card) 90%, transparent));
  border-left-color: color-mix(in srgb, var(--primary-color, #6366f1) 50%, transparent);
}

.uimodel-bridge-missing {
  padding: 0.5rem;
  font-size: 0.8rem;
  color: var(--red-400, #f87171);
}
</style>
