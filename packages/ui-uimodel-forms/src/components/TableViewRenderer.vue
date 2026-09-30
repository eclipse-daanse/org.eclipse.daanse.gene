<script setup lang="ts">
/**
 * TableViewRenderer — gene-seitiger Renderer fuer uimodel:TableView.
 *
 * Der Composer selbst rendert TableView nicht (TableViewComposer sucht in der
 * Registry nach "TableViewRenderer" und zeigt sonst nur einen Platzhalter).
 * Hier: PrimeVue-DataTable, eine Spalte je WidgetStyle in tableStyle.columns.
 *
 * Zeilen: uimodel.ecore bindet TableView an kein Feature. Konvention dieses
 * Renderers: Zeilen sind die direkten Containment-Kinder des Modells
 * (eContents), deren Klasse ALLE Spalten-Features besitzt. Fuer eine
 * relational:Table mit Spalten name/type/isNullable sind das genau die
 * Columns — PrimaryKey/ForeignKey/Description fallen raus, weil ihnen
 * StructuralFeature.type bzw. Column.isNullable fehlt.
 *
 * Zeilen-Klick navigiert zum Objekt (Editor-Kontext handleNavigate), das
 * ist der Weg "Detail im Detail" (Besprechung 2026-09-29, A1).
 */
import { computed, inject } from 'tsm:vue'
import { DataTable, Column } from 'tsm:primevue'
import type { EObject, EStructuralFeature, EClass } from '@emfts/core'

const props = defineProps<{
  component: any
  model: EObject
}>()

const tsm = inject<any>('tsm')
const instanceComposables = tsm?.getService('ui.instance.composables')
const GENE_EDITOR_CONTEXT_KEY = instanceComposables?.GENE_EDITOR_CONTEXT_KEY
const editorCtx = inject<any>(GENE_EDITOR_CONTEXT_KEY, null)

interface ColumnDef {
  key: string
  label: string
  feature: EStructuralFeature
  isReference: boolean
  isMany: boolean
}

function toArray<T>(v: any): T[] {
  if (!v) return []
  if (Array.isArray(v)) return v
  if (typeof v.toArray === 'function') return v.toArray()
  if (typeof v[Symbol.iterator] === 'function') return Array.from(v)
  return [v]
}

function isReferenceFeature(f: any): boolean {
  if (typeof f?.isContainment === 'function') return true
  try { return f?.eClass?.()?.getName?.() === 'EReference' } catch { return false }
}

const columns = computed<ColumnDef[]>(() => {
  const styles = toArray<any>(props.component?.tableStyle?.columns)
  return styles
    .filter(s => s?.feature)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s, i) => {
      const f = s.feature as EStructuralFeature
      return {
        key: `${f.getName?.() ?? 'col'}-${i}`,
        label: s.label || featureLabel(f),
        feature: f,
        isReference: isReferenceFeature(f),
        isMany: typeof (f as any).isMany === 'function' ? (f as any).isMany() : false
      }
    })
})

function featureLabel(f: EStructuralFeature): string {
  const n = f.getName?.() ?? ''
  return n.charAt(0).toUpperCase() + n.slice(1)
}

function sameClass(a: EClass | null | undefined, b: EClass | null | undefined): boolean {
  if (!a || !b) return false
  if (a === b) return true
  try {
    return a.getName() === b.getName()
      && a.getEPackage()?.getNsURI() === b.getEPackage()?.getNsURI()
  } catch { return false }
}

/** Besitzt die Zeilenklasse das Spalten-Feature (identisch oder ueber Supertyp)? */
function hasFeature(rowClass: EClass, colFeature: EStructuralFeature): boolean {
  const own = rowClass.getEStructuralFeature(colFeature.getName())
  if (!own) return false
  if (own === colFeature) return true
  const owner = (colFeature as any).getEContainingClass?.() as EClass | undefined
  if (!owner) return true
  if (sameClass(owner, rowClass)) return true
  try {
    for (const s of rowClass.getEAllSuperTypes()) if (sameClass(owner, s)) return true
  } catch { /* ignore */ }
  return false
}

const rows = computed<EObject[]>(() => {
  // Modell-Version mitlesen, damit Anlegen/Loeschen von Kindern neu rendert
  void editorCtx?.modelVersion?.value
  const cols = columns.value
  if (!cols.length || !props.model) return []
  const kids = toArray<EObject>(props.model.eContents?.())
  return kids.filter(k => {
    const cls = k.eClass?.()
    return !!cls && cols.every(c => hasFeature(cls, c.feature))
  })
})

function rowFeature(row: EObject, col: ColumnDef): EStructuralFeature | null {
  return row.eClass().getEStructuralFeature(col.feature.getName()) ?? null
}

function rawValue(row: EObject, col: ColumnDef): any {
  const f = rowFeature(row, col)
  if (!f) return null
  if (editorCtx?.getFeatureValueOn) return editorCtx.getFeatureValueOn(row, f)
  return row.eGet(f)
}

function objectLabel(o: any): string {
  try {
    const nameF = o.eClass?.().getEStructuralFeature?.('name')
    const n = nameF ? o.eGet(nameF) : null
    return n ? String(n) : (o.eClass?.().getName?.() ?? '?')
  } catch { return '?' }
}

function formatScalar(v: any): string {
  if (v == null || v === '') return ''
  if (typeof v === 'boolean') return v ? '✓' : '–'
  if (typeof v === 'object') {
    if (typeof v.getLiteral === 'function') return v.getLiteral()
    if (typeof v.getName === 'function') return v.getName()
    if (typeof v.eClass === 'function') return objectLabel(v)
  }
  return String(v)
}

function cellText(row: EObject, col: ColumnDef): string {
  const v = rawValue(row, col)
  if (col.isMany) return toArray<any>(v).map(formatScalar).join(', ')
  return formatScalar(v)
}

function cellTargets(row: EObject, col: ColumnDef): EObject[] {
  const v = rawValue(row, col)
  return toArray<EObject>(v).filter(t => t && typeof (t as any).eClass === 'function')
}

function navigate(obj: EObject) {
  editorCtx?.handleNavigate?.(obj)
}

const emptyText = computed(() => props.component?.emptyText || 'Keine Einträge')
</script>

<template>
  <div class="uimodel-table-view" :data-uim-table="component?.name">
    <DataTable
      :value="rows"
      size="small"
      stripedRows
      class="uimodel-table"
      :rowHover="true"
      dataKey="__uid"
      @row-click="(e: any) => navigate(e.data)"
    >
      <Column
        v-for="col in columns"
        :key="col.key"
        :header="col.label"
      >
        <template #body="{ data }">
          <template v-if="col.isReference">
            <span
              v-for="(t, i) in cellTargets(data, col)"
              :key="i"
              class="uimodel-table-ref"
              @click.stop="navigate(t)"
            >{{ objectLabel(t) }}<i class="pi pi-external-link" /></span>
          </template>
          <template v-else>{{ cellText(data, col) }}</template>
        </template>
      </Column>
      <template #empty>
        <div class="uimodel-table-empty">{{ emptyText }}</div>
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
.uimodel-table-view {
  margin: 0.25rem 0 0.5rem;
}
.uimodel-table :deep(.p-datatable-tbody > tr) {
  cursor: pointer;
}
.uimodel-table :deep(.p-datatable-tbody > tr > td),
.uimodel-table :deep(.p-datatable-thead > tr > th) {
  padding: 0.35rem 0.6rem;
  font-size: 0.85rem;
}
.uimodel-table-ref {
  color: var(--p-primary-color, #3b82f6);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-right: 0.5rem;
}
.uimodel-table-ref .pi {
  font-size: 0.7rem;
  opacity: 0.7;
}
.uimodel-table-empty {
  padding: 0.5rem 0.6rem;
  font-size: 0.85rem;
  opacity: 0.7;
}
</style>
