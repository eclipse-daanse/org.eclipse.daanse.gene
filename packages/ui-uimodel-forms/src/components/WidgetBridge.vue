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
import { useValidation } from '@emfts/uimodel-composer'
import type { WidgetComponent } from '@emfts/uimodel-composer'
import { bumpModelVersion } from '../oclAdapter'

const props = defineProps<{
  eObject: EObject
  feature: EStructuralFeature
  eClass?: EClass
  custom?: Record<string, unknown>
}>()

// Das UIModel-Widget (fuer ValidationExpressions), vom WidgetComposer
// als custom.rawWidget durchgereicht.
const rawWidget = computed(() => (props.custom?.rawWidget ?? null) as WidgetComponent | null)

const tsm = inject<any>('tsm')

// PropertyField ueber den TSM-Service beziehen (kein statischer Cross-Import)
const instanceComponents = tsm?.getService('ui.instance.components')
const PropertyField = instanceComponents?.PropertyField

// Editor-Kontext des PropertiesPanel (stellt Wert-Zugriff + Aktionen bereit)
const instanceComposables = tsm?.getService('ui.instance.composables')
const GENE_EDITOR_CONTEXT_KEY = instanceComposables?.GENE_EDITOR_CONTEXT_KEY
const editorCtx = inject<any>(GENE_EDITOR_CONTEXT_KEY, null)

// Referenz-Erkennung (robust fuer DynamicEObjects): die Referenz-Helfer des
// Panels (getAvailableObjects etc.) rufen isContainment() auf und wuerden
// fuer Attribute im Render crashen.
const isReference = computed(() => {
  const f: any = props.feature
  if (typeof f?.isContainment === 'function') return true
  try { return f?.eClass?.()?.getName?.() === 'EReference' } catch { return false }
})

const value = computed(() => editorCtx?.getFeatureValue?.(props.feature))

// Validierung (Plan Phase 2, F5 — eine Quelle): Sind am UIModel-Widget
// ValidationExpressions definiert, ist deren Ergebnis massgeblich; sonst
// werden uebergangsweise die Fehler aus useInstanceEditor durchgereicht.
// Es wird immer nur EINE Meldung angezeigt (keine Doppelmeldung, A8).
const uimodelValidation = useValidation(
  () => rawWidget.value?.validations ?? [],
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
  editorCtx?.setFeatureValue?.(props.feature, v)
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
  <div v-if="PropertyField && editorCtx" class="uimodel-property-row">
    <component
      :is="PropertyField"
      :feature="feature"
      :eObject="eObject"
      :value="value"
      :error="error"
      :availableObjects="availableObjects"
      :validChildClasses="validChildClasses"
      :rootPackage="editorCtx.rootPackage"
      :problemsService="editorCtx.problemsService"
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
