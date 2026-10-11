<script setup lang="ts">
/**
 * Editor for the field rules (CR-2): one table row per FieldRule of the
 * workspace's *.fielddefaults.xmi - class, attribute, suggested values, UI
 * default, backend default, hidden. Changes apply at once; "Speichern"
 * writes the file through EMF's serializer.
 *
 * Opened from the context view's header, or from a field with its class
 * and attribute preselected.
 */
import { computed, nextTick, ref, shallowRef, toRaw, watch } from 'tsm:vue'
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

const rows = computed(() => {
  void fieldDefaultsVersion.value
  const f = file.value
  return f ? ruleObjects(f).map(rule => ({ rule, ...ruleTargetNames(rule), values: valuesOf(rule) })) : []
})

function get(o: any, name: string): any {
  const f = o?.eClass?.()?.getEStructuralFeature?.(name)
  return f ? toRaw(o.eGet(f)) : undefined
}

function valuesOf(rule: any) {
  return {
    suggestions: many(get(rule, 'suggestions')).map(String).join(', '),
    uiDefault: String(get(rule, 'uiDefault') ?? ''),
    backendDefault: String(get(rule, 'backendDefault') ?? ''),
    hidden: !!get(rule, 'hidden'),
    includeSubclasses: !!get(rule, 'includeSubclasses')
  }
}

/* ── new rule ─────────────────────────────────────────────────────── */

const classFilter = ref('')
const newClass = shallowRef<any>(null)
const newAttribute = ref('')
const newIncludeSubclasses = ref(false)

const sortedClasses = computed(() =>
  [...props.classes].sort((a, b) => String(a.getName?.()).localeCompare(String(b.getName?.())))
)
const filteredClasses = computed(() => {
  const f = classFilter.value.trim().toLowerCase()
  return f ? sortedClasses.value.filter(c => String(c.getName?.()).toLowerCase().includes(f)) : sortedClasses.value
})
const attributes = computed(() =>
  newClass.value
    ? many(newClass.value.getEAllAttributes?.()).filter((a: any) => !a.isMany?.()).sort((a: any, b: any) => a.getName().localeCompare(b.getName()))
    : []
)

function classLabel(c: any): string {
  const ns = c.getEPackage?.()?.getName?.()
  return ns ? `${c.getName()} (${ns})` : c.getName()
}

function onPickClass(event: Event): void {
  const i = Number((event.target as HTMLSelectElement).value)
  newClass.value = filteredClasses.value[i] ?? null
  newAttribute.value = ''
}

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
  if (file.value) setRuleValue(file.value, rule, field, (event.target as HTMLInputElement).value.trim())
  status.value = ''
}

function onSuggestions(rule: any, event: Event): void {
  const list = (event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean)
  if (file.value) setRuleValue(file.value, rule, 'suggestions', list)
  status.value = ''
}

function onFlag(rule: any, field: 'hidden' | 'includeSubclasses', event: Event): void {
  if (file.value) setRuleValue(file.value, rule, field, (event.target as HTMLInputElement).checked)
  status.value = ''
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
    classFilter.value = ''
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
  <div class="backdrop" @click.self="emit('close')">
    <div class="dialog" role="dialog" aria-label="Feldregeln" data-testid="cwm.Editor.FieldRules">
      <header>
        <strong>Feldregeln</strong>
        <span class="file" :title="fileCount > 1 ? 'Weitere Dateien werden angewendet, aber hier nicht bearbeitet' : ''">
          {{ file?.path }}{{ dirty ? ' *' : '' }}{{ fileCount > 1 ? ` (+${fileCount - 1} weitere)` : '' }}
        </span>
      </header>

      <div ref="listEl" class="list">
        <table>
          <thead>
            <tr>
              <th>Klasse</th>
              <th title="Die Regel gilt auch für alle Klassen, die von dieser Klasse erben">Erbende Klassen</th>
              <th>Attribut</th>
              <th>Vorschläge</th>
              <th>UI-Default</th>
              <th>Backend-Default</th>
              <th title="Erst nach „alle anzeigen“ sichtbar">Aus&shy;blenden</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="i" :class="{ highlighted: r.rule === highlighted }">
              <td :title="r.nsUri">{{ r.className || '?' }}</td>
              <td class="center">
                <input
                  type="checkbox"
                  :checked="r.values.includeSubclasses"
                  aria-label="Erbende Klassen"
                  @change="onFlag(r.rule, 'includeSubclasses', $event)"
                />
              </td>
              <td>{{ r.attributeName || '?' }}</td>
              <td><input :value="r.values.suggestions" placeholder="a, b, c" aria-label="Vorschläge" @change="onSuggestions(r.rule, $event)" /></td>
              <td><input :value="r.values.uiDefault" aria-label="UI-Default" @change="onText(r.rule, 'uiDefault', $event)" /></td>
              <td><input :value="r.values.backendDefault" aria-label="Backend-Default" @change="onText(r.rule, 'backendDefault', $event)" /></td>
              <td class="center"><input type="checkbox" :checked="r.values.hidden" aria-label="Ausblenden" @change="onFlag(r.rule, 'hidden', $event)" /></td>
              <td><button type="button" class="remove" title="Regel löschen" @click="remove(r.rule)">×</button></td>
            </tr>
            <tr v-if="rows.length === 0">
              <td colspan="8" class="none">Noch keine Regeln</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="add">
        <input v-model="classFilter" placeholder="Klasse filtern …" aria-label="Klasse filtern" />
        <select aria-label="Klasse" :value="filteredClasses.indexOf(newClass)" @change="onPickClass">
          <option :value="-1" disabled>Klasse wählen</option>
          <option v-for="(c, i) in filteredClasses" :key="i" :value="i">{{ classLabel(c) }}</option>
        </select>
        <label class="subclasses" title="Die Regel gilt auch für alle Klassen, die von der gewählten Klasse erben">
          <input v-model="newIncludeSubclasses" type="checkbox" />
          alle erbenden Klassen
        </label>
        <select v-model="newAttribute" aria-label="Attribut" :disabled="!newClass">
          <option value="" disabled>Attribut wählen</option>
          <option v-for="a in attributes" :key="a.getName()" :value="a.getName()">{{ a.getName() }}</option>
        </select>
        <button type="button" :disabled="!newClass || !newAttribute" @click="add">Regel hinzufügen</button>
      </div>

      <footer>
        <span v-if="error" class="error">{{ error }}</span>
        <span v-else class="status">{{ status }}</span>
        <button type="button" @click="emit('close')">Schließen</button>
        <button type="button" class="primary" :disabled="!dirty" @click="save">Speichern</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.subclasses {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  white-space: nowrap;
}

.backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.dialog {
  width: min(64rem, 94vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--surface-card, var(--surface-ground));
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  font-size: 0.85rem;
  color: var(--text-color);
}

header,
footer,
.add {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
}

header .file {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
}

.list {
  flex: 1 1 auto;
  overflow: auto;
  border-top: 1px solid var(--surface-border);
  border-bottom: 1px solid var(--surface-border);
}

table {
  width: 100%;
  border-collapse: collapse;
}

th {
  position: sticky;
  top: 0;
  background: var(--surface-card, var(--surface-ground));
  text-align: left;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-color-secondary);
  padding: 0.35rem 0.4rem;
}

td {
  padding: 0.2rem 0.4rem;
  border-top: 1px solid color-mix(in srgb, var(--surface-border) 60%, transparent);
  white-space: nowrap;
}

tr.highlighted td {
  background: color-mix(in srgb, var(--primary-color) 10%, transparent);
}

.center {
  text-align: center;
}

.none {
  color: var(--text-color-secondary);
  padding: 0.6rem 0.4rem;
}

input:not([type='checkbox']),
select {
  font: inherit;
  color: var(--text-color);
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 3px;
  padding: 0.15rem 0.35rem;
}

td input:not([type='checkbox']) {
  width: 100%;
  min-width: 7rem;
  box-sizing: border-box;
}

.add select {
  max-width: 18rem;
}

button {
  font: inherit;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--surface-border);
  border-radius: 3px;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}

button.primary {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: var(--primary-color-text, #fff);
}

button.remove {
  border: none;
  font-size: 1rem;
  line-height: 1;
  color: var(--text-color-secondary);
}

footer {
  justify-content: flex-end;
}

footer .status,
footer .error {
  margin-right: auto;
  font-size: 0.75rem;
}

footer .status {
  color: var(--text-color-secondary);
}

footer .error {
  color: var(--red-500, #ef4444);
}
</style>
