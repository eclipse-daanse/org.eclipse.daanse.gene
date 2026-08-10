<script setup lang="ts">
/**
 * Settings-Page "Property Widgets" (Plan Abschnitt 9, D3):
 * pflegt workspace-weite Widget-Wahl-Regeln als UIModelOverlay-Datei
 * (workspace-overrides.uimodel.xmi) im Workspace. Die Datei ist die
 * Quelle der Wahrheit; die Registry laedt sie wie jede *.uimodel.xmi.
 */
import { ref, computed, watch, onMounted, inject } from 'tsm:vue'
import { Button, InputText, Select, SelectButton, Message, DataTable, Column } from 'tsm:primevue'
import {
  OVERLAY_FILE_NAME,
  WIDGET_KINDS,
  isValidRule,
  compatibleWidgets,
  rulesToOverlayXmi,
  parseOverlayRules,
  type OverlayRule,
  type WidgetKind
} from '../overlayRules'
import { loadUiModelXmi, reloadWorkspaceUiModels } from '../uiModelRegistry'
import { createFeaturePickerSource, createETypePickerSource } from '../overlayPickers'

const tsm = inject<any>('tsm')
const fs = computed(() => tsm?.getService('gene.filesystem'))

// Auswahl-Dialoge: generischer PickerDialog aus ui-search (Service),
// Daten aus der Model-Registry — Features/eTypes der geladenen Metamodelle
// sind damit klickbar statt Freitext (Freitext bleibt moeglich).
const PickerDialog = computed(() => tsm?.getService('ui.search.components')?.PickerDialog ?? null)
const modelRegistry = tsm?.getService('ui.model-browser.composables')?.useSharedModelRegistry?.() ?? null
const featurePickerVisible = ref(false)
const eTypePickerVisible = ref(false)
const featureSource = computed(() => modelRegistry ? createFeaturePickerSource(modelRegistry) : null)
const eTypeSource = computed(() => modelRegistry ? createETypePickerSource(modelRegistry) : null)

function onFeaturePicked(item: { label: string; secondaryLabel?: string }) {
  newRule.value.featureName = item.label
  // Der eType kommt FEST aus dem Metamodell (nicht frei kombinierbar —
  // ein widerspruechlicher Typ ergaebe eine Regel, die nie greift).
  newRule.value.eTypeName = item.secondaryLabel ?? ''
  featurePickerVisible.value = false
}

function onETypePicked(item: { label: string; groupKey?: string }) {
  newRule.value.eTypeName = item.label
  // sinnvoller Widget-Default je nach Typ-Art
  if (item.groupKey === 'Enums') newRule.value.widget = 'select'
  else if (item.groupKey === 'Klassen') newRule.value.widget = 'reference'
  eTypePickerVisible.value = false
}


const rules = ref<OverlayRule[]>([])
const rawCases = ref<string[]>([])
const statusText = ref('')
const errorText = ref('')
const composerSupport = ref(true)
const fileEntry = ref<any>(null)
const sourceId = ref<string | null>(null)

const newRule = ref<OverlayRule>({ featureName: '', eTypeName: '', widget: 'textarea' })

// ── Regel-Modus: "Bestimmtes Feature" ODER "Alle Features eines Typs" ──────
// Die freie Kombination beider Kriterien erlaubte tote Regeln
// (z. B. author + EDate: matcht nie). Der Modus macht die zwei sinnvollen
// Regel-Arten explizit; im Feature-Modus ist der eType aus dem Metamodell
// abgeleitet und nicht editierbar.
type RuleMode = 'feature' | 'type'
const ruleMode = ref<RuleMode>('feature')
const modeOptions = [
  { label: 'Bestimmtes Feature', value: 'feature' },
  { label: 'Alle Features eines Typs', value: 'type' }
]
watch(ruleMode, () => {
  newRule.value = { featureName: '', eTypeName: '', widget: newRule.value.widget }
})

// Widget-Auswahl nach eType gefiltert (kein Multiline-Datum etc.)
const filteredWidgetOptions = computed(() => {
  const allowed = compatibleWidgets(newRule.value.eTypeName)
  return WIDGET_KINDS.filter(w => allowed.includes(w.kind))
    .map(w => ({ label: w.label, value: w.kind }))
})
watch(filteredWidgetOptions, (opts) => {
  if (!opts.some(o => o.value === newRule.value.widget) && opts.length > 0) {
    newRule.value.widget = opts[0].value as WidgetKind
  }
})

const widgetOptions = WIDGET_KINDS.map(w => ({ label: w.label, value: w.kind }))
const canAdd = computed(() => isValidRule(newRule.value))
const hasWorkspace = computed(() => (fs.value?.sources?.value?.length ?? 0) > 0)

function findOverlayEntry(): { entry: any; sourceId: string } | null {
  const f = fs.value
  if (!f) return null
  for (const source of f.sources.value) {
    const files = f.filesBySource.get(source.id)
    if (!files) continue
    const stack = [...files]
    while (stack.length) {
      const e = stack.pop()
      if (e.isDirectory && e.children) stack.push(...e.children)
      else if (e.name === OVERLAY_FILE_NAME) return { entry: e, sourceId: source.id }
    }
  }
  return null
}

onMounted(async () => {
  const found = findOverlayEntry()
  if (!found) return
  fileEntry.value = found.entry
  sourceId.value = found.sourceId
  try {
    const content = await fs.value.readTextFile(found.entry)
    const roots = await loadUiModelXmi(content, OVERLAY_FILE_NAME, ['UIModelOverlay'])
    if (roots.length === 0) {
      composerSupport.value = false
      return
    }
    const parsed = parseOverlayRules(roots[0])
    rules.value = parsed.filter((p): p is OverlayRule => !('raw' in p))
    rawCases.value = parsed.filter((p): p is { raw: string } => 'raw' in p).map(p => p.raw)
  } catch {
    // Metamodell (noch) ohne UIModelOverlay — Regeln koennen trotzdem
    // definiert/gespeichert werden, wirken aber erst nach Composer-Update.
    composerSupport.value = false
  }
})

function addRule() {
  if (!canAdd.value) return
  rules.value = [...rules.value, { ...newRule.value }]
  newRule.value = { featureName: '', eTypeName: '', widget: 'textarea' }
}

function removeRule(index: number) {
  rules.value = rules.value.filter((_, i) => i !== index)
}

async function save() {
  statusText.value = ''
  errorText.value = ''
  const f = fs.value
  if (!f) { errorText.value = 'Kein Dateisystem-Service verfuegbar.'; return }
  try {
    const xmi = rulesToOverlayXmi(rules.value)
    let entry = fileEntry.value
    if (!entry) {
      const source = f.sources.value[0]
      if (!source) { errorText.value = 'Kein Workspace geoeffnet.'; return }
      await f.createFile(source.id, '', OVERLAY_FILE_NAME)
      await f.refreshSource(source.id)
      const found = findOverlayEntry()
      if (!found) { errorText.value = 'Datei konnte nicht angelegt werden.'; return }
      entry = found.entry
      fileEntry.value = entry
      sourceId.value = found.sourceId
    }
    await f.writeTextFile(entry, xmi)
    await reloadWorkspaceUiModels()
    statusText.value = `Gespeichert: ${OVERLAY_FILE_NAME} (${rules.value.filter(isValidRule).length} Regel(n))`
    // Unterstuetzung pruefen — beim allerersten Speichern gab es noch
    // keine Datei, der Hinweis-Banner waere sonst nie erschienen.
    try {
      const roots = await loadUiModelXmi(xmi, OVERLAY_FILE_NAME, ['UIModelOverlay'])
      composerSupport.value = roots.length > 0
    } catch {
      composerSupport.value = false
    }
  } catch (e) {
    errorText.value = `Speichern fehlgeschlagen: ${e instanceof Error ? e.message : e}`
  }
}
</script>

<template>
  <div class="overlay-settings">
    <p class="hint">
      Workspace-weite Regeln fuer die Widget-Wahl des generischen
      Property-Layouts. Eine Regel uebersteuert das Default-Mapping fuer
      alle Features, auf die Feature-Name und/oder eType zutreffen —
      gespeichert als <code>{{ OVERLAY_FILE_NAME }}</code> im Workspace.
    </p>

    <Message v-if="!hasWorkspace" severity="warn" :closable="false">
      Kein Workspace geoeffnet — Regeln koennen erst mit geoeffnetem
      Workspace gespeichert werden.
    </Message>
    <Message v-else-if="!composerSupport" severity="info" :closable="false">
      Die geladene uimodel-composer-Version kennt UIModelOverlay noch nicht
      (emf.ts.ui#8) — Regeln werden gespeichert, wirken aber erst nach dem
      Composer-Update.
    </Message>

    <DataTable :value="rules" size="small" v-if="rules.length > 0" class="rules-table">
      <Column field="featureName" header="Feature-Name">
        <template #body="{ data }">{{ data.featureName || '—' }}</template>
      </Column>
      <Column field="eTypeName" header="eType">
        <template #body="{ data }">{{ data.eTypeName || '—' }}</template>
      </Column>
      <Column field="widget" header="Widget">
        <template #body="{ data }">
          {{ widgetOptions.find(w => w.value === data.widget)?.label ?? data.widget }}
        </template>
      </Column>
      <Column header="" style="width: 3rem">
        <template #body="{ index }">
          <Button icon="pi pi-trash" text rounded size="small" severity="danger"
                  @click="removeRule(index)" v-tooltip.bottom="'Regel entfernen'" />
        </template>
      </Column>
    </DataTable>
    <p v-else class="empty">Noch keine Regeln definiert.</p>

    <div v-if="rawCases.length > 0" class="raw-cases">
      <span class="raw-title">Manuell definierte Faelle in der Datei (werden beim Speichern verworfen):</span>
      <code v-for="(raw, i) in rawCases" :key="i">{{ raw }}</code>
    </div>

    <div class="add-form">
      <SelectButton v-model="ruleMode" :options="modeOptions" optionLabel="label"
                    optionValue="value" size="small" :allowEmpty="false" />

      <template v-if="ruleMode === 'feature'">
        <div class="picker-field">
          <InputText v-model="newRule.featureName" placeholder="Feature waehlen..." size="small" readonly
                     @click="featurePickerVisible = true" />
          <Button v-if="PickerDialog && featureSource" icon="pi pi-search" text size="small"
                  @click="featurePickerVisible = true" v-tooltip.bottom="'Feature aus Metamodell waehlen'" />
        </div>
        <span v-if="newRule.eTypeName" class="etype-info">Typ: {{ newRule.eTypeName }}</span>
      </template>

      <template v-else>
        <div class="picker-field">
          <InputText v-model="newRule.eTypeName" placeholder="eType waehlen..." size="small" readonly
                     @click="eTypePickerVisible = true" />
          <Button v-if="PickerDialog && eTypeSource" icon="pi pi-search" text size="small"
                  @click="eTypePickerVisible = true" v-tooltip.bottom="'eType waehlen'" />
        </div>
      </template>

      <Select v-model="newRule.widget" :options="filteredWidgetOptions" optionLabel="label"
              optionValue="value" size="small" class="widget-select" />
      <Button label="Hinzufuegen" icon="pi pi-plus" size="small" :disabled="!canAdd" @click="addRule" />
    </div>

    <component
      :is="PickerDialog"
      v-if="PickerDialog && featureSource"
      v-model:visible="featurePickerVisible"
      header="Feature waehlen"
      placeholder="Feature suchen..."
      display-mode="grouped"
      :data-source="featureSource"
      @select="onFeaturePicked"
    />
    <component
      :is="PickerDialog"
      v-if="PickerDialog && eTypeSource"
      v-model:visible="eTypePickerVisible"
      header="eType waehlen"
      placeholder="Typ suchen..."
      display-mode="grouped"
      :data-source="eTypeSource"
      @select="onETypePicked"
    />

    <div class="actions">
      <Button label="Speichern" icon="pi pi-save" size="small" :disabled="!hasWorkspace" @click="save" />
      <span v-if="statusText" class="status ok">{{ statusText }}</span>
      <span v-if="errorText" class="status error">{{ errorText }}</span>
    </div>
  </div>
</template>

<style scoped>
.overlay-settings { display: flex; flex-direction: column; gap: 0.75rem; }
.hint { font-size: 0.85rem; color: var(--text-color-secondary); margin: 0; }
.empty { font-size: 0.85rem; color: var(--text-color-secondary); font-style: italic; }
.add-form { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.picker-field { display: flex; gap: 0.15rem; align-items: center; }
.picker-field input { cursor: pointer; }
.etype-info { font-size: 0.8rem; color: var(--text-color-secondary); }
.widget-select { min-width: 12rem; }
.actions { display: flex; gap: 0.75rem; align-items: center; }
.status { font-size: 0.8rem; }
.status.ok { color: var(--green-500, #22c55e); }
.status.error { color: var(--red-400, #f87171); }
.raw-cases { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; }
.raw-title { color: var(--text-color-secondary); }
.raw-cases code { background: var(--surface-ground); padding: 0.15rem 0.4rem; border-radius: 4px; }
</style>
