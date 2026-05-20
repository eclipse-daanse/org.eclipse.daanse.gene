<script setup lang="ts">
/**
 * BatchValidationDialog - UC-OCL-009: Batch-Validierung (Client-seitig)
 *
 * Lets the user select instances, a reference depth, and a C-OCL ConstraintSet
 * (from server or workspace), then triggers batch validation.
 *
 * All data (instances, workspace COCLs) is provided by the handler via the
 * shared composable — no inject/window access needed.
 */
import { ref, watch, computed } from 'tsm:vue'
import { Dialog, Dropdown } from 'tsm:primevue'
export interface BatchValidationChoice {
  selectedObjects: any[]
  referenceDepth: number
  coclId: string
  coclSource: 'server' | 'workspace'
  coclContent?: string
}

const props = defineProps<{
  visible: boolean
  serverCocls?: { id: string; name: string; stage: string }[]
  workspaceCocls?: { name: string; path: string }[]
  instances?: { obj: any; label: string; sourcePath: string }[]
  coclError?: string | null
}>()

const emit = defineEmits<{
  'update:visible': [val: boolean]
  'validate': [choice: BatchValidationChoice]
}>()

const loading = ref(false)

// Instance tree state
interface FileGroup {
  path: string
  expanded: boolean
  checked: boolean
  objects: { obj: any; label: string; checked: boolean }[]
}
const fileGroups = ref<FileGroup[]>([])

// Reference depth
const referenceDepth = ref(0)
const depthOptions = [
  { label: '0 — Nur Objekt selbst', value: 0 },
  { label: '1 — Direkte Referenzen', value: 1 },
  { label: '2 — Tiefe 2', value: 2 },
  { label: '3 — Tiefe 3', value: 3 },
  { label: '-1 — Unbegrenzt', value: -1 }
]

// COCL selection
interface CoclOption {
  id: string
  name: string
  source: 'server' | 'workspace'
  stage?: string
}
const coclOptions = ref<CoclOption[]>([])
const selectedCoclId = ref<string | null>(null)

const selectedCocl = computed(() => coclOptions.value.find(c => c.id === selectedCoclId.value))

const selectedObjects = computed(() => {
  const result: any[] = []
  for (const group of fileGroups.value) {
    for (const entry of group.objects) {
      if (entry.checked) result.push(entry.obj)
    }
  }
  return result
})

const coclLoadError = computed(() => props.coclError || null)

const canValidate = computed(() => selectedObjects.value.length > 0 && !!selectedCoclId.value)

watch(() => props.visible, (visible) => {
  if (!visible) return
  referenceDepth.value = 0
  selectedCoclId.value = null
  fileGroups.value = []
  coclOptions.value = []
  loadData()
})

function loadData() {
  loadInstances()
  loadCoclOptions()
  loading.value = false
}

function loadInstances() {
  const instances = props.instances
  if (!instances || instances.length === 0) return

  const groupMap = new Map<string, { obj: any; label: string; checked: boolean }[]>()
  for (const inst of instances) {
    if (!groupMap.has(inst.sourcePath)) {
      groupMap.set(inst.sourcePath, [])
    }
    groupMap.get(inst.sourcePath)!.push({ obj: inst.obj, label: inst.label, checked: true })
  }

  fileGroups.value = Array.from(groupMap.entries()).map(([path, objects]) => ({
    path,
    expanded: true,
    checked: true,
    objects
  }))
}

function loadCoclOptions() {
  const options: CoclOption[] = []

  // 1. Server COCLs (passed as prop)
  for (const s of (props.serverCocls || [])) {
    options.push({
      id: s.id,
      name: s.name,
      source: 'server',
      stage: s.stage
    })
  }

  // 2. Workspace COCLs (passed as prop)
  for (const cocl of (props.workspaceCocls || [])) {
    options.push({
      id: `ws:${cocl.name}`,
      name: cocl.name.replace(/\.c-ocl$/, ''),
      source: 'workspace'
    })
  }

  coclOptions.value = options
}

function toggleFileGroup(group: FileGroup) {
  group.checked = !group.checked
  for (const entry of group.objects) {
    entry.checked = group.checked
  }
}

function toggleObject(group: FileGroup, idx: number) {
  group.objects[idx].checked = !group.objects[idx].checked
  group.checked = group.objects.every(o => o.checked)
}

function toggleExpand(group: FileGroup) {
  group.expanded = !group.expanded
}

function selectAll() {
  for (const group of fileGroups.value) {
    group.checked = true
    for (const entry of group.objects) {
      entry.checked = true
    }
  }
}

function selectNone() {
  for (const group of fileGroups.value) {
    group.checked = false
    for (const entry of group.objects) {
      entry.checked = false
    }
  }
}

function handleValidate() {
  if (!canValidate.value || !selectedCocl.value) return

  const cocl = selectedCocl.value
  const coclId = cocl.source === 'workspace' ? cocl.name : cocl.id

  emit('validate', {
    selectedObjects: selectedObjects.value,
    referenceDepth: referenceDepth.value,
    coclId,
    coclSource: cocl.source
  })
}

function handleClose() {
  emit('update:visible', false)
}

function shortPath(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="handleClose"
    header="Batch-Validierung"
    :modal="true"
    :style="{ width: '560px' }"
  >
    <p class="dialog-hint">
      Instanzen auswahlen und gegen ein C-OCL ConstraintSet validieren.
      Die Objekte werden serialisiert und an den Server gesendet.
    </p>

    <!-- Loading -->
    <div v-if="loading" class="val-loading">
      <i class="pi pi-spinner pi-spin"></i>
      <span>Lade Daten...</span>
    </div>

    <template v-else>
      <!-- Section: Instance tree -->
      <div class="val-divider">
        <span>Instanzen</span>
      </div>

      <div v-if="fileGroups.length === 0" class="val-empty">
        Keine Instanzen geladen. Lade zuerst Instanzen im Instance Editor.
      </div>
      <div v-else class="instance-tree">
        <div v-for="group in fileGroups" :key="group.path" class="file-group">
          <div class="file-header" @click="toggleExpand(group)">
            <i :class="group.expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="expand-icon"></i>
            <input
              type="checkbox"
              :checked="group.checked"
              :indeterminate="group.objects.some(o => o.checked) && !group.objects.every(o => o.checked)"
              @click.stop="toggleFileGroup(group)"
            />
            <i class="pi pi-file"></i>
            <span class="file-name">{{ shortPath(group.path) }}</span>
            <span class="file-count">({{ group.objects.length }})</span>
          </div>
          <div v-if="group.expanded" class="file-objects">
            <div
              v-for="(entry, idx) in group.objects"
              :key="idx"
              class="object-row"
              @click="toggleObject(group, idx)"
            >
              <input type="checkbox" :checked="entry.checked" @click.stop="toggleObject(group, idx)" />
              <span class="object-label">{{ entry.label }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick-select buttons -->
      <div v-if="fileGroups.length > 0" class="quick-select">
        <button class="link-btn" @click="selectAll">Alle</button>
        <span class="separator">|</span>
        <button class="link-btn" @click="selectNone">Keine</button>
        <span class="selection-info">{{ selectedObjects.length }} von {{ fileGroups.reduce((s, g) => s + g.objects.length, 0) }} ausgewahlt</span>
      </div>

      <!-- Section: Reference depth -->
      <div class="val-divider">
        <span>Optionen</span>
      </div>

      <div class="field-row">
        <label class="field-label-inline">Referenz-Tiefe</label>
        <Dropdown
          v-model="referenceDepth"
          :options="depthOptions"
          optionLabel="label"
          optionValue="value"
          class="depth-dropdown"
        />
      </div>

      <!-- Section: COCL selection -->
      <div class="val-divider">
        <span>C-OCL ConstraintSet</span>
      </div>

      <div v-if="coclLoadError" class="val-warn">
        <i class="pi pi-exclamation-triangle"></i>
        <span>{{ coclLoadError }}</span>
      </div>
      <div v-if="coclOptions.length === 0 && !coclLoadError" class="val-empty">
        Keine C-OCL ConstraintSets gefunden (Server oder Workspace).
      </div>

      <div
        v-for="cocl in coclOptions"
        :key="cocl.id"
        class="val-option"
        :class="{ selected: selectedCoclId === cocl.id, server: cocl.source === 'server', workspace: cocl.source === 'workspace' }"
        @click="selectedCoclId = cocl.id"
      >
        <div class="val-icon" :class="cocl.source">
          <i :class="cocl.source === 'server' ? 'pi pi-globe' : 'pi pi-folder'"></i>
        </div>
        <div class="val-info">
          <span class="val-label">{{ cocl.name }}</span>
          <span class="val-desc">
            {{ cocl.source === 'server' ? 'Server' : 'Workspace' }}
            <span v-if="cocl.stage" class="val-stage">{{ cocl.stage }}</span>
          </span>
        </div>
        <i v-if="selectedCoclId === cocl.id" class="pi pi-check val-check"></i>
      </div>

      <!-- Workspace upload hint -->
      <div v-if="selectedCocl?.source === 'workspace'" class="upload-hint">
        <i class="pi pi-info-circle"></i>
        <span>Wird vor der Validierung automatisch auf den Server hochgeladen.</span>
      </div>
    </template>

    <template #footer>
      <div class="dialog-footer">
        <button class="btn btn-secondary" @click="handleClose">Abbrechen</button>
        <button class="btn btn-primary" :disabled="!canValidate" @click="handleValidate">
          <i class="pi pi-play"></i>
          Validieren ({{ selectedObjects.length }})
        </button>
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.dialog-hint {
  font-size: 0.82rem;
  color: var(--text-color-secondary);
  margin: 0 0 10px 0;
  line-height: 1.4;
}

/* ── Dividers ── */
.val-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 14px 0 8px 0;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.val-divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--surface-border);
}

/* ── Instance tree ── */
.instance-tree {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  padding: 4px;
  background: var(--surface-ground);
}

.file-group + .file-group {
  border-top: 1px solid var(--surface-border);
  padding-top: 2px;
  margin-top: 2px;
}

.file-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-color);
}

.file-header:hover {
  background: var(--surface-hover);
}

.expand-icon {
  font-size: 0.65rem;
  color: var(--text-color-secondary);
  width: 12px;
  text-align: center;
  flex-shrink: 0;
}

.file-header input[type="checkbox"] {
  cursor: pointer;
  accent-color: var(--primary-color);
}

.file-header .pi-file {
  font-size: 0.8rem;
  color: var(--primary-color);
}

.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-count {
  font-size: 0.7rem;
  color: var(--text-color-secondary);
  font-weight: 400;
}

.file-objects {
  padding-left: 36px;
}

.object-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.78rem;
  color: var(--text-color);
}

.object-row:hover {
  background: var(--surface-hover);
}

.object-row input[type="checkbox"] {
  cursor: pointer;
  accent-color: var(--primary-color);
}

.object-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Quick select ── */
.quick-select {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  font-size: 0.75rem;
}

.link-btn {
  background: none;
  border: none;
  color: var(--primary-color);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0 2px;
  text-decoration: underline;
}

.link-btn:hover {
  color: color-mix(in srgb, var(--primary-color) 80%, black);
}

.separator {
  color: var(--surface-border);
}

.selection-info {
  margin-left: auto;
  color: var(--text-color-secondary);
}

/* ── Depth field ── */
.field-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.field-label-inline {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
}

.depth-dropdown {
  flex: 1;
}

/* ── COCL options (same as ValidationDialog) ── */
.val-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 5px;
  transition: all 0.15s;
}

.val-option:hover {
  background: var(--surface-hover);
}

.val-option.selected {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 6%, transparent);
}

.val-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  flex-shrink: 0;
  font-size: 0.9rem;
}

.val-icon.server {
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  color: var(--primary-color);
}

.val-icon.workspace {
  background: color-mix(in srgb, var(--green-500) 15%, transparent);
  color: var(--green-500);
}

.val-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.val-label {
  font-size: 0.85rem;
  font-weight: 600;
}

.val-desc {
  font-size: 0.72rem;
  color: var(--text-color-secondary);
}

.val-stage {
  display: inline-block;
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  color: var(--primary-color);
  padding: 0 5px;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  margin-left: 4px;
}

.val-check {
  color: var(--primary-color);
  font-size: 0.85rem;
  flex-shrink: 0;
}

/* ── Info / hint boxes ── */
.upload-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--primary-color) 6%, transparent);
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  margin-top: 2px;
}

.upload-hint i {
  color: var(--primary-color);
  flex-shrink: 0;
}

.val-empty {
  font-size: 0.8rem;
  color: var(--text-color-secondary);
  padding: 8px 0;
  font-style: italic;
}

.val-warn {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--orange-500, #f59e0b) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--orange-500, #f59e0b) 25%, transparent);
  border-radius: 6px;
  font-size: 0.78rem;
  color: var(--orange-500, #f59e0b);
  line-height: 1.4;
  margin-bottom: 6px;
}

.val-warn i {
  margin-top: 1px;
  flex-shrink: 0;
}

.val-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  font-size: 0.82rem;
  color: var(--text-color-secondary);
}

/* ── Footer ── */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-secondary {
  background: var(--surface-ground);
  color: var(--text-color);
}

.btn-secondary:hover {
  background: var(--surface-hover);
}

.btn-primary {
  background: var(--primary-color);
  color: var(--primary-color-text);
  border-color: var(--primary-color);
}

.btn-primary:hover {
  background: color-mix(in srgb, var(--primary-color) 85%, black);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
