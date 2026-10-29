<script setup lang="ts">
/**
 * Editor for the field rules (CR-2): one table row per FieldRule of the
 * workspace's *.fielddefaults.xmi - class, attribute, suggested values, UI
 * default, hidden, head (shown as the object's title). The cells follow
 * the attribute's type: an enum's UI default is chosen from its literals,
 * yes/no from yes and no, a number is a number; suggestions are for text
 * only. Changes apply at once;
 * "Speichern" writes the file through EMF's serializer.
 *
 * Opened from the context view's header, or from a field with its class
 * and attribute preselected. A GenE dialog: the rules as a table (a search
 * narrows it), below it the form for a new rule.
 */
import { computed, nextTick, onMounted, ref, shallowRef, toRaw, watch } from 'tsm:vue'
import { Button, Checkbox, Dialog, Dropdown, InputText, ProgressBar } from 'tsm:primevue'
import {
  addRule,
  editableFieldDefaultsFile,
  fieldDefaultsFiles,
  fieldDefaultsVersion,
  removeRule,
  ruleObjects,
  ruleTargetNames,
  saveFieldDefaultsFile,
  setRuleValue,
  type FieldDefaultsFile
} from '../composables/fieldDefaults'
import { many } from '../composables/documentation'
import { kindOf } from '../composables/rowContent'

const props = defineProps<{
  /** EClasses to choose from, e.g. those of the loaded model and their supertypes */
  classes: any[]
  /** Class and attribute to start with */
  focus?: { eClass: any; attributeName: string } | null
}>()

const emit = defineEmits<{ close: [] }>()

const file = shallowRef<FieldDefaultsFile | null>(null)
const status = ref('')
const error = ref('')
const highlighted = shallowRef<any>(null)
const listEl = ref<HTMLElement | null>(null)

const visible = ref(true)

/*
 * The dialog shows at once with a progress bar; its table and dropdowns
 * follow a frame later - the user sees it react instead of waiting.
 */
const ready = ref(false)
onMounted(() => requestAnimationFrame(() => requestAnimationFrame(() => { ready.value = true })))

const rows = computed(() => {
  void fieldDefaultsVersion.value
  const f = file.value
  return f ? ruleObjects(f).map(rule => {
    const names = ruleTargetNames(rule)
    return { rule, ...names, values: valuesOf(rule), type: typeOf(names.className, names.nsUri, names.attributeName) }
  }) : []
})

/** The rules the search leaves: class or attribute contains it */
const ruleFilter = ref('')
const shownRows = computed(() => {
  const f = ruleFilter.value.trim().toLowerCase()
  return f ? rows.value.filter(r => `${r.className} ${r.attributeName}`.toLowerCase().includes(f)) : rows.value
})

function get(o: any, name: string): any {
  const f = o?.eClass?.()?.getEStructuralFeature?.(name)
  return f ? toRaw(o.eGet(f)) : undefined
}

/** What the rule's attribute takes: text, number, yes/no, an enum's literals - or a reference */
interface RuleType {
  kind: 'text' | 'number' | 'boolean' | 'enum' | 'reference'
  literals: string[]
}

function typeOf(className: string, nsUri: string, attributeName: string): RuleType {
  const cls = props.classes.find((c: any) =>
    c.getName?.() === className && (!nsUri || c.getEPackage?.()?.getNsURI?.() === nsUri)
  )
  const feature = cls?.getEStructuralFeature?.(attributeName)
  if (!feature) return { kind: 'text', literals: [] }
  if (typeof feature.isContainment === 'function') return { kind: 'reference', literals: [] }
  const kind = kindOf(feature)
  const literals = kind === 'enum'
    ? many(feature.getEType().getELiterals()).map((l: any) => String(l.getLiteral?.() ?? l.getName?.()))
    : []
  return { kind, literals }
}

function valuesOf(rule: any) {
  return {
    suggestions: many(get(rule, 'suggestions')).map(String).join(', '),
    uiDefault: String(get(rule, 'uiDefault') ?? ''),
    backendDefault: String(get(rule, 'backendDefault') ?? ''),
    hidden: !!get(rule, 'hidden'),
    includeSubclasses: !!get(rule, 'includeSubclasses'),
    head: !!get(rule, 'head')
  }
}

/* ── new rule ─────────────────────────────────────────────────────── */

const newClass = shallowRef<any>(null)
const newAttribute = ref('')
const newIncludeSubclasses = ref(false)

const sortedClasses = computed(() =>
  [...props.classes].sort((a, b) => String(a.getName?.()).localeCompare(String(b.getName?.())))
)
/** The dropdown's options: the classes by index - the dropdown filters them itself */
const classOptions = computed(() => sortedClasses.value.map((c, i) => ({ label: classLabel(c), value: i })))
const newClassIndex = computed({
  get: () => (newClass.value ? sortedClasses.value.indexOf(newClass.value) : null),
  set: (i: number | null) => {
    newClass.value = i == null ? null : sortedClasses.value[i] ?? null
    newAttribute.value = ''
  }
})
/** Single-valued attributes, then the references the row shows (not containments) */
const attributes = computed(() => {
  if (!newClass.value) return []
  const byName = (a: any, b: any) => a.getName().localeCompare(b.getName())
  const attrs = many(newClass.value.getEAllAttributes?.()).filter((a: any) => !a.isMany?.()).sort(byName)
  const refs = many(newClass.value.getEAllReferences?.())
    .filter((r: any) => !r.isContainment?.() && !r.isContainer?.() && !r.isDerived?.() && !r.isTransient?.())
    .sort(byName)
  return [...attrs, ...refs]
})

function featureLabel(f: any): string {
  return typeof f.isContainment === 'function' ? `${f.getName()} (Referenz)` : f.getName()
}

function classLabel(c: any): string {
  const ns = c.getEPackage?.()?.getName?.()
  return ns ? `${c.getName()} (${ns})` : c.getName()
}

const attributeOptions = computed(() => attributes.value.map((a: any) => ({ label: featureLabel(a), value: a.getName() })))

function add(): void {
  const f = file.value
  const attr = attributes.value.find((a: any) => a.getName() === newAttribute.value)
  if (!f || !newClass.value || !attr) return
  const rule = addRule(f, newClass.value, attr, newIncludeSubclasses.value)
  newAttribute.value = ''
  status.value = ''
  void reveal(rule)
}

/* ── editing ──────────────────────────────────────────────────────── */

function onText(rule: any, field: 'uiDefault' | 'backendDefault', event: Event): void {
  if (file.value) setRuleValue(file.value, rule, field, (event.target as HTMLInputElement | HTMLSelectElement).value.trim())
  status.value = ''
}

function onSuggestions(rule: any, event: Event): void {
  const list = (event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean)
  if (file.value) setRuleValue(file.value, rule, 'suggestions', list)
  status.value = ''
}

function onFlag(rule: any, field: 'hidden' | 'includeSubclasses' | 'head', value: boolean): void {
  if (file.value) setRuleValue(file.value, rule, field, value)
  status.value = ''
}

function close(): void {
  visible.value = false
  emit('close')
}

function remove(rule: any): void {
  if (file.value) removeRule(file.value, rule)
  status.value = ''
}

async function save(): Promise<void> {
  const f = file.value
  if (!f) return
  error.value = ''
  status.value = ''
  try {
    await saveFieldDefaultsFile(f)
    status.value = `Gespeichert: ${f.path}`
  } catch (e) {
    error.value = `Speichern fehlgeschlagen: ${e instanceof Error ? e.message : e}`
  }
}

async function reveal(rule: any): Promise<void> {
  highlighted.value = toRaw(rule)
  // The table appears a frame after the dialog
  if (!ready.value) await new Promise<void>(resolve => { const stop = watch(ready, v => { if (v) { stop(); resolve() } }) })
  await nextTick()
  listEl.value?.querySelector('tr.highlighted')?.scrollIntoView({ block: 'nearest' })
}

/* ── opening ──────────────────────────────────────────────────────── */

watch(() => props.focus, async (focus) => {
  file.value = await editableFieldDefaultsFile()
  if (!focus) return
  const className = focus.eClass?.getName?.()
  const existing = rows.value.find(r => r.className === className && r.attributeName === focus.attributeName)
  if (existing) {
    void reveal(existing.rule)
  } else {
    newClass.value = toRaw(focus.eClass)
    newAttribute.value = focus.attributeName
  }
}, { immediate: true })

const dirty = computed(() => {
  void fieldDefaultsVersion.value
  return !!file.value?.dirty
})
const fileCount = computed(() => fieldDefaultsFiles.size)
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Feldregeln"
    :style="{ width: 'min(68rem, 95vw)' }"
    :pt="{ root: { 'data-testid': 'cwm.Editor.FieldRules' } }"
    @hide="emit('close')"
  >
    <div v-if="!ready" class="loading" role="status">
      <ProgressBar mode="indeterminate" style="height: 4px" />
      <span>Feldregeln werden geladen …</span>
    </div>
    <div v-else class="field-rules">
      <div class="top">
        <span class="file" :title="fileCount > 1 ? 'Weitere Dateien werden angewendet, aber hier nicht bearbeitet' : ''">
          <i class="pi pi-file"></i>
          {{ file?.path }}<span v-if="dirty" class="dirty" title="Ungespeicherte Änderungen"> ●</span>
          <span v-if="fileCount > 1" class="more-files">(+{{ fileCount - 1 }} weitere)</span>
        </span>
        <span class="search">
          <i class="pi pi-search"></i>
          <InputText v-model="ruleFilter" placeholder="Regel suchen…" aria-label="Regel suchen" />
        </span>
      </div>

      <div ref="listEl" class="list">
        <table>
          <thead>
            <tr>
              <th>Klasse</th>
              <th class="center" title="Die Regel gilt auch für alle Klassen, die von dieser Klasse erben">Erbende</th>
              <th>Attribut</th>
              <th>Vorschläge</th>
              <th>UI-Default</th>
              <th class="center" title="Erst nach „alle anzeigen“ sichtbar">Ausblenden</th>
              <th class="center" title="Als Kopf (Titel) des Objekts statt „name“ anzeigen; die spezifischste Klasse gewinnt">Kopf</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in shownRows" :key="i" :class="{ highlighted: r.rule === highlighted }">
              <td class="cls" :title="r.nsUri">{{ r.className || '?' }}</td>
              <td class="center">
                <Checkbox
                  :model-value="r.values.includeSubclasses"
                  binary
                  aria-label="Erbende Klassen"
                  @update:model-value="onFlag(r.rule, 'includeSubclasses', !!$event)"
                />
              </td>
              <td class="attr">{{ r.attributeName || '?' }}</td>
              <!-- Suggestions are for text; other types have their own choice -->
              <td>
                <input
                  v-if="r.type.kind === 'text'"
                  class="cell"
                  :value="r.values.suggestions"
                  placeholder="a, b, c"
                  aria-label="Vorschläge"
                  @change="onSuggestions(r.rule, $event)"
                />
                <span v-else class="not-applicable" :title="`Für ${r.type.kind === 'enum' ? 'Enums' : r.type.kind === 'boolean' ? 'Ja/Nein' : r.type.kind === 'number' ? 'Zahlen' : 'Referenzen'} nicht nötig`">–</span>
              </td>
              <!-- The UI default as the attribute's type takes it -->
              <td>
                <select
                  v-if="r.type.kind === 'enum' || r.type.kind === 'boolean'"
                  class="cell"
                  :value="r.values.uiDefault"
                  aria-label="UI-Default"
                  @change="onText(r.rule, 'uiDefault', $event)"
                >
                  <option value="">–</option>
                  <template v-if="r.type.kind === 'enum'">
                    <option v-for="l in r.type.literals" :key="l" :value="l">{{ l }}</option>
                  </template>
                  <template v-else>
                    <option value="true">ja</option>
                    <option value="false">nein</option>
                  </template>
                </select>
                <span v-else-if="r.type.kind === 'reference'" class="not-applicable" title="Für Referenzen nicht nötig">–</span>
                <input
                  v-else
                  class="cell"
                  :type="r.type.kind === 'number' ? 'number' : 'text'"
                  :value="r.values.uiDefault"
                  placeholder="–"
                  aria-label="UI-Default"
                  @change="onText(r.rule, 'uiDefault', $event)"
                />
                <span class="type-hint">{{ r.type.kind === 'enum' ? 'Enum' : r.type.kind === 'boolean' ? 'Ja/Nein' : r.type.kind === 'number' ? 'Zahl' : r.type.kind === 'reference' ? 'Referenz' : 'Text' }}</span>
              </td>
              <td class="center">
                <Checkbox
                  :model-value="r.values.hidden"
                  binary
                  aria-label="Ausblenden"
                  @update:model-value="onFlag(r.rule, 'hidden', !!$event)"
                />
              </td>
              <td class="center">
                <Checkbox
                  v-if="r.type.kind !== 'reference'"
                  :model-value="r.values.head"
                  binary
                  aria-label="Als Kopf anzeigen"
                  @update:model-value="onFlag(r.rule, 'head', !!$event)"
                />
              </td>
              <td class="end">
                <button type="button" class="remove" title="Regel löschen" @click="remove(r.rule)"><i class="pi pi-trash"></i></button>
              </td>
            </tr>
            <tr v-if="shownRows.length === 0">
              <td colspan="8" class="none">{{ rows.length ? 'Keine Regel passt zur Suche' : 'Noch keine Regeln' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="add">
        <div class="add-title"><i class="pi pi-plus-circle"></i> Neue Regel</div>
        <div class="add-row">
          <Dropdown
            v-model="newClassIndex"
            :options="classOptions"
            option-label="label"
            option-value="value"
            filter
            filter-placeholder="Klasse suchen…"
            placeholder="Klasse wählen"
            class="add-class"
            aria-label="Klasse"
          />
          <Dropdown
            v-model="newAttribute"
            :options="attributeOptions"
            option-label="label"
            option-value="value"
            filter
            placeholder="Attribut wählen"
            :disabled="!newClass"
            class="add-attr"
            aria-label="Attribut"
          />
          <label class="subclasses" title="Die Regel gilt auch für alle Klassen, die von der gewählten Klasse erben">
            <Checkbox v-model="newIncludeSubclasses" binary input-id="new-rule-subclasses" />
            <span>erbende Klassen</span>
          </label>
          <Button label="Hinzufügen" icon="pi pi-plus" size="small" :disabled="!newClass || !newAttribute" @click="add" />
        </div>
      </div>
    </div>

    <template #footer>
      <span v-if="error" class="error">{{ error }}</span>
      <span v-else class="status">{{ status }}</span>
      <Button label="Schließen" severity="secondary" text @click="close" />
      <Button label="Speichern" icon="pi pi-save" :disabled="!dirty" @click="save" />
    </template>
  </Dialog>
</template>

<style scoped>
.loading {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 2rem 0;
  font-size: 0.8rem;
  color: var(--text-color-secondary, #6c757d);
  text-align: center;
}

.field-rules {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.top {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.file {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 0.78rem;
  color: var(--text-color-secondary, #6c757d);
}

.dirty {
  color: var(--primary-color);
}

.more-files {
  font-family: inherit;
}

.search {
  position: relative;
  margin-left: auto;
}

.search i {
  position: absolute;
  left: 0.6rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.8rem;
  color: var(--text-color-secondary, #6c757d);
}

.search :deep(input) {
  width: 16rem;
  padding-left: 1.9rem;
}

.list {
  max-height: 50vh;
  overflow: auto;
  border: 1px solid var(--surface-border, #dee2e6);
  border-radius: 6px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 0.55rem 0.6rem;
  text-align: left;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  color: var(--text-color-secondary, #6c757d);
  background: var(--surface-ground);
  border-bottom: 1px solid var(--surface-border, #dee2e6);
}

td {
  padding: 0.3rem 0.6rem;
  vertical-align: middle;
}

tbody tr:hover {
  background: var(--surface-hover, rgba(0, 0, 0, 0.04));
}

tbody tr.highlighted {
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
}

.cls {
  font-weight: 600;
  white-space: nowrap;
}

.attr {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 0.8rem;
  white-space: nowrap;
}

.center {
  text-align: center;
}

/* Values edited in place: quiet until hovered or focused */
.cell {
  width: 100%;
  min-width: 6rem;
  box-sizing: border-box;
  font: inherit;
  color: var(--text-color);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 0.25rem 0.45rem;
}

.cell:hover {
  border-color: var(--surface-border, #dee2e6);
}

.cell:focus {
  outline: none;
  border-color: var(--primary-color);
  background: var(--surface-ground);
}

.not-applicable {
  padding: 0.25rem 0.45rem;
  color: var(--text-color-secondary, #6c757d);
}

/* The attribute's type under its UI default */
.type-hint {
  display: block;
  padding: 0 0.45rem;
  font-size: 0.65rem;
  color: var(--text-color-secondary, #6c757d);
}

.cell::placeholder {
  color: var(--text-color-secondary, #6c757d);
  opacity: 0.6;
}

.end {
  width: 2rem;
  text-align: right;
}

.remove {
  padding: 0.2rem 0.35rem;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--text-color-secondary, #6c757d);
  cursor: pointer;
  opacity: 0;
}

tr:hover .remove {
  opacity: 1;
}

.remove:hover {
  color: var(--red-500, #ef4444);
  background: color-mix(in srgb, var(--red-500, #ef4444) 10%, transparent);
}

.none {
  padding: 1rem 0.6rem;
  font-style: italic;
  color: var(--text-color-secondary, #6c757d);
}

.add {
  padding: 0.75rem;
  border: 1px solid var(--surface-border, #dee2e6);
  border-radius: 6px;
  background: color-mix(in srgb, var(--primary-color) 4%, transparent);
}

.add-title {
  margin-bottom: 0.5rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-color-secondary, #6c757d);
}

.add-title i {
  color: var(--primary-color);
}

.add-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}

.add-class {
  flex: 1 1 16rem;
}

.add-attr {
  flex: 1 1 14rem;
}

.subclasses {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  white-space: nowrap;
  cursor: pointer;
}

.status,
.error {
  margin-right: auto;
  font-size: 0.8rem;
}

.status {
  color: var(--text-color-secondary, #6c757d);
}

.error {
  color: var(--red-500, #ef4444);
}
</style>
