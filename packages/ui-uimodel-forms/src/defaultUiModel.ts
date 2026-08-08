/**
 * Default-UIModel-Generator (Plan Phase 1, E4)
 *
 * Erzeugt zur Laufzeit ein UIModel fuer eine EClass, wenn kein autoriertes
 * UIModel vorliegt. Die Feature-Listen kommen vom Aufrufer (useInstanceEditor),
 * damit die Anzeige exakt dieselben Features zeigt wie der bisherige Pfad.
 */

import type { EClass, EStructuralFeature } from '@emfts/core'
import { UimodelFactory } from '@emfts/uimodel-composer'
import type { UIModel, WidgetComponent } from '@emfts/uimodel-composer'

export interface DefaultUiModelInput {
  eClass: EClass
  /** Editierbare Attribute (nicht-derived, changeable) — Reihenfolge wird uebernommen */
  attributes: EStructuralFeature[]
  /** Editierbare Referenzen (Containment + Non-Containment) */
  references: EStructuralFeature[]
}

/** camelCase → Title Case, identisch zur bisherigen Label-Ableitung im Panel */
export function featureDisplayName(feature: EStructuralFeature): string {
  const name = feature.getName()
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase())
}

function isRequired(feature: EStructuralFeature): boolean {
  try { return feature.getLowerBound() > 0 } catch { return false }
}

/** EEnum-Erkennung, robust fuer DynamicEObjects (vgl. AttributeField) */
function isEnumType(feature: EStructuralFeature): boolean {
  try {
    const eType: any = feature.getEType?.()
    if (!eType) return false
    if (typeof eType.getELiterals === 'function') return true
    return eType.eClass?.()?.getName?.() === 'EEnum'
  } catch { return false }
}

function dataTypeName(feature: EStructuralFeature): string {
  try {
    const eType: any = feature.getEType?.()
    return eType?.getName?.() ?? 'EString'
  } catch { return 'EString' }
}

const NUMBER_TYPES = new Set(['EInt', 'EIntegerObject', 'ELong', 'ELongObject', 'EShort', 'EShortObject', 'EFloat', 'EFloatObject', 'EDouble', 'EDoubleObject', 'EBigDecimal', 'EBigInteger', 'EByte'])
const DATE_TYPES = new Set(['EDate'])
const BOOLEAN_TYPES = new Set(['EBoolean', 'EBooleanObject'])

/** Widget-Auswahl nach Datentyp — semantisch korrekt modelliert, auch wenn
 *  die Widget-Bridge (Phase 1) alle Widgets ueber PropertyField rendert. */
function createAttributeWidget(factory: typeof UimodelFactory.eINSTANCE, feature: EStructuralFeature): WidgetComponent {
  const tn = dataTypeName(feature)
  let widget: WidgetComponent
  if (BOOLEAN_TYPES.has(tn)) widget = factory.createCheckboxWidget()
  else if (NUMBER_TYPES.has(tn)) widget = factory.createNumberWidget()
  else if (DATE_TYPES.has(tn)) widget = factory.createDateWidget()
  else if (isEnumType(feature)) widget = factory.createSelectWidget()
  else widget = factory.createInputWidget()
  return widget
}

function initWidget(widget: WidgetComponent, feature: EStructuralFeature, group: string): WidgetComponent {
  widget.name = feature.getName()
  widget.group = group
  widget.feature = feature
  widget.label = featureDisplayName(feature)
  widget.required = isRequired(feature)
  return widget
}

/**
 * Baut ein Default-UIModel: eine FormView "Attributes" + eine FormView
 * "References" (nur wenn Features vorhanden), je ein Widget pro Feature.
 */
export function buildDefaultUiModel(input: DefaultUiModelInput): UIModel {
  const factory = UimodelFactory.eINSTANCE
  const uiModel = factory.createUIModel()
  uiModel.name = `default:${input.eClass?.getName?.() ?? 'unknown'}`
  ;(uiModel as any).targetClasses = input.eClass ? [input.eClass] : []

  const components: any[] = []

  if (input.attributes.length > 0) {
    const form = factory.createFormView()
    form.name = 'attributes'
    form.group = 'Attributes'
    form.fields = input.attributes.map(f => initWidget(createAttributeWidget(factory, f), f, 'Attributes'))
    components.push(form)
  }

  if (input.references.length > 0) {
    const form = factory.createFormView()
    form.name = 'references'
    form.group = 'References'
    form.fields = input.references.map(f => initWidget(factory.createReferenceLinkWidget(), f, 'References'))
    components.push(form)
  }

  uiModel.components = components
  return uiModel
}
