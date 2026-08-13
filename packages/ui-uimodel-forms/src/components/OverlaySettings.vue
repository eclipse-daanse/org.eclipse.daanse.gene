<script setup lang="ts">
/**
 * Settings-Page "Property Widgets" (Plan Abschnitt 9, D3):
 * pflegt workspace-weite Widget-Wahl-Regeln als UIModelOverlay-Datei
 * (workspace-overrides.uimodel.xmi) im Workspace. Die Datei ist die
 * Quelle der Wahrheit; die Registry laedt sie wie jede *.uimodel.xmi.
 */
import { ref, computed, watch, onMounted, inject } from 'tsm:vue'
import { Button, Select, DataTable, Column } from 'tsm:primevue'
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
import { createFeaturePickerSource } from '../overlayPickers'

/** Gespeichert wird ueber den globalen Save-Button des Settings-Dialogs. */
const emit = defineEmits<{ dirty: [] }>()

const tsm = inject<any>('tsm')
const fs = computed(() => tsm?.getService('gene.filesystem'))

// Auswahl-Dialoge: generischer PickerDialog aus ui-search (Service),
// Daten aus der Model-Registry — Features/eTypes der geladenen Metamodelle
// sind damit klickbar statt Freitext (Freitext bleibt moeglich).
const PickerDialog = computed(() => tsm?.getService('ui.search.components')?.PickerDialog ?? null)
const modelRegistry = tsm?.getService('ui.model-browser.composables')?.useSharedModelRegistry?.() ?? null
const featurePickerVisible = ref(false)
const featureSource = computed(() => modelRegistry ? createFeaturePickerSource(modelRegistry) : null)

function onFeaturePicked(item: { label: string; secondaryLabel?: string }) {
  newRule.value.featureName = item.label
  // Der eType kommt FEST aus dem Metamodell (nicht frei kombinierbar —
  // ein widerspruechlicher Typ ergaebe eine Regel, die nie greift).
  newRule.value.eTypeName = item.secondaryLabel ?? ''
  featurePickerVisible.value = false
}


const rules = ref<OverlayRule[]>([])
const rawCases = ref<string[]>([])
const statusText = ref('')
const errorText = ref('')
const composerSupport = ref(true)
const fileEntry = ref<any>(null)
const sourceId = ref<string | null>(null)

const newRule = ref<OverlayRule>({ featureName: '', eTypeName: '', widget: 'textarea' })

// Eine Regel gilt immer fuer EIN bestimmtes Feature; der eType wird beim
// Auswaehlen aus dem Metamodell uebernommen und praezisiert die Regel
// (gleichnamige Features anderen Typs bleiben unberuehrt).

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
  markDirty()
}

function removeRule(index: number) {
  rules.value = rules.value.filter((_, i) => i !== index)
  markDirty()
}

/** Dialog aktiviert damit seinen Save-Button (Button ist bei !isDirty aus). */
function markDirty() {
  statusText.value = ''
  errorText.value = ''
  emit('dirty')
}

/**
 * Schreibt die Overlay-Datei. Wird vom Settings-Dialog ueber den globalen
 * Save-Button aufgerufen (defineExpose) — die Seite hat keinen eigenen
 * Speichern-Knopf mehr. Die Regeln leben in einer EIGENEN Datei, nicht im
 * `.wsp`, deshalb reicht `editorConfig.saveToFileSystem` dafuer nicht.
 */
async function save() {
  statusText.value = ''
  errorText.value = ''
  const f = fs.value
  if (!f) { errorText.value = 'Kein Dateisystem-Service verfuegbar.'; return }
  if (!hasWorkspace.value) { errorText.value = 'Kein Workspace geoeffnet.'; return }
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

defineExpose({ save })
</script>

<template>
  <div class="overlay-settings">
    <!-- Titel/Beschreibung liefert der Settings-Dialog (detail-title,
         detail-description) — hier nur der Datei-Hinweis. -->
    <p class="hint">
      Eine Regel gilt fuer ein bestimmtes Feature (klassenuebergreifend, auf
      dessen Typ begrenzt). Gespeichert als
      <code>{{ OVERLAY_FILE_NAME }}</code> im Workspace, ueber den
      Speichern-Knopf unten im Dialog.
    </p>

    <div v-if="!hasWorkspace" class="status-message warning">
      <i class="pi pi-exclamation-triangle"></i>
      <span>Kein Workspace geoeffnet — Regeln koennen erst mit geoeffnetem
        Workspace gespeichert werden.</span>
    </div>
    <div v-else-if="!composerSupport" class="status-message info">
      <i class="pi pi-info-circle"></i>
      <span>Die geladene uimodel-composer-Version kennt UIModelOverlay noch
        nicht (emf.ts.ui#8) — Regeln werden gespeichert, wirken aber erst
        nach dem Composer-Update.</span>
    </div>

    <!-- Neue Regel (Auswahl oben, wie bei den Icon-Mappings) -->
    <div class="add-rule-form">
      <div class="form-row">
        <div class="field field-feature">
          <label>Feature</label>
          <Button
            :label="newRule.featureName || 'Feature waehlen...'"
            icon="pi pi-tag"
            severity="secondary"
            outlined
            size="small"
            class="feature-picker-trigger"
            @click="featurePickerVisible = true"
          />
        </div>
        <div class="field field-small">
          <label>Typ</label>
          <span class="etype-info">{{ newRule.eTypeName || '—' }}</span>
        </div>
        <div class="field field-widget">
          <label>Widget</label>
          <Select v-model="newRule.widget" :options="filteredWidgetOptions" optionLabel="label"
                  optionValue="value" />
        </div>
        <div class="field-action">
          <Button icon="pi pi-plus" label="Hinzufuegen" :disabled="!canAdd" @click="addRule" />
        </div>
      </div>
    </div>

    <!-- Bestehende Regeln -->
    <div class="rules-table" v-if="rules.length > 0">
      <DataTable :value="rules" size="small" scrollable scrollHeight="250px">
        <Column field="featureName" header="Feature">
          <template #body="{ data }">{{ data.featureName || '—' }}</template>
        </Column>
        <Column field="eTypeName" header="Typ" style="width: 120px">
          <template #body="{ data }">{{ data.eTypeName || '—' }}</template>
        </Column>
        <Column field="widget" header="Widget">
          <template #body="{ data }">
            {{ widgetOptions.find(w => w.value === data.widget)?.label ?? data.widget }}
          </template>
        </Column>
        <Column header="" style="width: 50px">
          <template #body="{ index }">
            <Button icon="pi pi-trash" text rounded size="small" severity="danger"
                    @click="removeRule(index)" v-tooltip.bottom="'Regel entfernen'" />
          </template>
        </Column>
      </DataTable>
    </div>
    <div v-else class="empty-hint">Noch keine Regeln definiert.</div>

    <div v-if="rawCases.length > 0" class="raw-cases">
      <span class="raw-title">Manuell definierte Faelle in der Datei (werden beim Speichern verworfen):</span>
      <code v-for="(raw, i) in rawCases" :key="i">{{ raw }}</code>
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
    <div v-if="statusText || errorText" class="actions">
      <span v-if="statusText" class="status ok">{{ statusText }}</span>
      <span v-if="errorText" class="status error">{{ errorText }}</span>
    </div>
  </div>
</template>

<style scoped>
/* Uebernimmt das Design der Icon-Mappings im selben Dialog
   (WorkspaceSettingsDialog.vue, Kategorie "icons"): abgesetztes dunkles
   Formularfeld oben, umrandete Tabelle darunter. Die dortigen Klassen sind
   scoped, deshalb hier bewusst dieselben Werte statt eines Imports. */
.overlay-settings { display: flex; flex-direction: column; gap: 16px; }

.hint {
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
  margin: 0;
}

.status-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8125rem;
}

.status-message.warning {
  background: color-mix(in srgb, var(--yellow-500) 15%, transparent);
  color: var(--yellow-600);
}

.status-message.info {
  background: color-mix(in srgb, var(--blue-500) 15%, transparent);
  color: var(--blue-600);
}

/* Das dunkle Feld fuer die Eingabe */
.add-rule-form {
  padding: 12px;
  background: var(--surface-ground);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.field label {
  font-size: 0.7rem;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

/* Feature-Namen und Widget-Bezeichnungen brauchen Platz */
.field-feature { flex: 2; min-width: 170px; }
.field-widget { flex: 1.5; min-width: 150px; }
.field-small { flex: 0 0 auto; min-width: 4rem; }
.field-action { flex: 0 0 auto; }

.feature-picker-trigger {
  width: 100%;
  justify-content: flex-start;
}

.etype-info {
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
  /* auf Hoehe der Eingabefelder daneben halten (align-items: flex-end
     wuerde den kurzen Text sonst tiefer setzen) */
  display: flex;
  align-items: center;
  min-height: 2.25rem;
}

.rules-table {
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  overflow: hidden;
}

:deep(.p-datatable) {
  font-size: 0.8125rem;
  background: var(--surface-card);
}

.empty-hint {
  font-size: 0.8125rem;
  color: var(--text-color-secondary);
  font-style: italic;
  padding: 12px 0;
}

.actions { display: flex; gap: 0.75rem; align-items: center; }
.status { font-size: 0.8125rem; }
.status.ok { color: var(--green-500, #22c55e); }
.status.error { color: var(--red-400, #f87171); }
.raw-cases { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; }
.raw-title { color: var(--text-color-secondary); }
.raw-cases code { background: var(--surface-ground); padding: 0.15rem 0.4rem; border-radius: 4px; }
</style>
