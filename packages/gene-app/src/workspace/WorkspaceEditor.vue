<script setup lang="ts">
/**
 * The workspace tab while a workspace is loaded: what it consists of, in
 * which state each part is, and the means to change that.
 *
 * Models and instances can be opened, added and removed, Atlas connections
 * connected and disconnected. The constraint files are those beside the
 * workspace file - they are opened here, not declared. Presentation (icons,
 * views, widgets, actions) stays in the settings dialog; this links there.
 *
 * Shows; does nothing itself - every change goes out as an event.
 *
 * Read-only for a workspace file that is not the open one: what it declares,
 * which files are missing, and a button to open it. Nothing else applies -
 * what is loaded or connected belongs to the open workspace.
 */
import { ref } from 'tsm:vue'
import type { EntryStatus, OverviewEntry, WorkspaceOverview } from '../services/workspaceOverview'

export type SectionKind = 'model' | 'instance' | 'constraints' | 'atlas' | 'resolver'

export interface AddableFile {
  name: string
  path: string
}

const props = defineProps<{
  name: string
  path: string
  dirty: boolean
  overview: WorkspaceOverview
  addableModels: AddableFile[]
  addableInstances: AddableFile[]
  /** Another workspace than the open one - shown, not edited */
  readonly?: boolean
}>()

const emit = defineEmits<{
  save: []
  open: [kind: SectionKind, entry: OverviewEntry]
  remove: [kind: SectionKind, entry: OverviewEntry]
  add: [kind: 'model' | 'instance', file: AddableFile]
  connect: [entry: OverviewEntry]
  disconnect: [entry: OverviewEntry]
  settings: [section: string]
  openWorkspace: []
}>()

const STATUS_LABEL: Record<EntryStatus, string> = {
  loaded: 'geladen',
  'not-loaded': 'nicht geladen',
  missing: 'nicht gefunden',
  disabled: 'deaktiviert',
  connected: 'verbunden',
  connecting: 'verbindet …',
  disconnected: 'getrennt',
  error: 'Fehler',
}

/** Which section's "add" list is unfolded */
const adding = ref<'model' | 'instance' | null>(null)

function toggleAdding(kind: 'model' | 'instance') {
  adding.value = adding.value === kind ? null : kind
}

function add(kind: 'model' | 'instance', file: AddableFile) {
  adding.value = null
  emit('add', kind, file)
}

/** Read-only, only what concerns the file itself is a state worth naming */
function showsStatus(status: EntryStatus): boolean {
  return !props.readonly || status === 'missing' || status === 'disabled'
}

function addable(kind: 'model' | 'instance'): AddableFile[] {
  return kind === 'model' ? props.addableModels : props.addableInstances
}

function tone(status: EntryStatus): string {
  if (props.readonly) return status === 'missing' ? 'bad' : status === 'disabled' ? 'off' : 'plain'
  if (status === 'loaded' || status === 'connected') return 'ok'
  if (status === 'missing' || status === 'error') return 'bad'
  if (status === 'disabled') return 'off'
  return 'idle'
}
</script>

<template>
  <div class="ws-editor" data-testid="gene.WorkspaceEditor">
    <header class="ws-head">
      <i class="pi pi-box ws-head-icon"></i>
      <div class="ws-head-text">
        <span class="ws-head-name">{{ name }}</span>
        <span class="ws-head-path">{{ path }}</span>
      </div>
      <span v-if="readonly" class="ws-preview-tag">Vorschau</span>
      <button
        v-if="readonly"
        class="ws-btn ws-btn--primary"
        data-testid="gene.WorkspaceEditor.OpenWorkspace"
        @click="emit('openWorkspace')"
      >
        <i class="pi pi-folder-open"></i>
        <span>Workspace öffnen</span>
      </button>
      <button
        v-if="!readonly"
        class="ws-btn"
        :class="{ 'ws-btn--primary': dirty }"
        :disabled="!dirty"
        :title="dirty ? 'Workspace speichern' : 'Keine ungespeicherten Änderungen'"
        data-testid="gene.WorkspaceEditor.Save"
        @click="emit('save')"
      >
        <i class="pi pi-save"></i>
        <span>{{ dirty ? 'Speichern' : 'Gespeichert' }}</span>
      </button>
      <button v-if="!readonly" class="ws-btn" title="Darstellung, Aktionen, Storage …" @click="emit('settings', 'icons')">
        <i class="pi pi-cog"></i>
        <span>Einstellungen</span>
      </button>
    </header>

    <div class="ws-sections">
      <!-- Models and instances: declared in the .wsp, can be added and removed -->
      <section
        v-for="section in ([
          { kind: 'model', title: 'Modelle', icon: 'pi pi-sitemap', entries: overview.models, empty: 'Keine Modelle eingetragen.' },
          { kind: 'instance', title: 'Instanzen', icon: 'pi pi-file', entries: overview.instances, empty: 'Keine Instanzdateien eingetragen.' },
        ] as const)"
        :key="section.kind"
        class="ws-section"
        :data-testid="`gene.WorkspaceEditor.${section.kind}`"
      >
        <div class="ws-section-head">
          <i :class="section.icon"></i>
          <span class="ws-section-title">{{ section.title }}</span>
          <span class="ws-count">{{ section.entries.length }}</span>
          <button
            v-if="!readonly"
            class="ws-icon-btn ws-section-add"
            :title="`${section.title} hinzufügen`"
            :data-testid="`gene.WorkspaceEditor.${section.kind}.Add`"
            @click="toggleAdding(section.kind)"
          >
            <i class="pi pi-plus"></i>
          </button>
        </div>

        <div v-if="adding === section.kind" class="ws-adding">
          <button
            v-for="file in addable(section.kind)"
            :key="file.path"
            class="ws-adding-item"
            @click="add(section.kind, file)"
          >
            <i class="pi pi-plus-circle"></i>
            <span>{{ file.path }}</span>
          </button>
          <p v-if="addable(section.kind).length === 0" class="ws-empty">
            Keine weiteren passenden Dateien in dieser Quelle.
          </p>
        </div>

        <ul v-if="section.entries.length" class="ws-list">
          <li v-for="entry in section.entries" :key="entry.key" class="ws-row">
            <span class="ws-dot" :class="`ws-dot--${tone(entry.status)}`" :title="STATUS_LABEL[entry.status]"></span>
            <div class="ws-row-text">
              <span class="ws-row-label">{{ entry.label }}</span>
              <span class="ws-row-sub">
                {{ entry.location }}<template v-if="entry.detail"> · {{ entry.detail }}</template>
              </span>
            </div>
            <span v-if="showsStatus(entry.status)" class="ws-status" :class="`ws-status--${tone(entry.status)}`">{{ STATUS_LABEL[entry.status] }}</span>
            <button
              v-if="!readonly"
              class="ws-icon-btn"
              title="Öffnen"
              :disabled="entry.status === 'missing' || entry.location.startsWith('atlas://')"
              @click="emit('open', section.kind, entry)"
            >
              <i class="pi pi-external-link"></i>
            </button>
            <button v-if="!readonly" class="ws-icon-btn ws-icon-btn--danger" title="Aus dem Workspace entfernen" @click="emit('remove', section.kind, entry)">
              <i class="pi pi-trash"></i>
            </button>
          </li>
        </ul>
        <p v-else class="ws-empty">{{ section.empty }}</p>
      </section>

      <!-- Constraint files: those beside the .wsp -->
      <section class="ws-section" data-testid="gene.WorkspaceEditor.constraints">
        <div class="ws-section-head">
          <i class="pi pi-check-square"></i>
          <span class="ws-section-title">Constraints</span>
          <span class="ws-count">{{ overview.constraints.length }}</span>
        </div>
        <ul v-if="overview.constraints.length" class="ws-list">
          <li v-for="entry in overview.constraints" :key="entry.key" class="ws-row">
            <span class="ws-dot" :class="`ws-dot--${tone(entry.status)}`"></span>
            <div class="ws-row-text">
              <span class="ws-row-label">{{ entry.label }}</span>
              <span class="ws-row-sub">{{ entry.location }}</span>
            </div>
            <span v-if="showsStatus(entry.status)" class="ws-status" :class="`ws-status--${tone(entry.status)}`">{{ STATUS_LABEL[entry.status] }}</span>
            <button v-if="!readonly" class="ws-icon-btn" title="Öffnen" @click="emit('open', 'constraints', entry)">
              <i class="pi pi-external-link"></i>
            </button>
          </li>
        </ul>
        <p v-else class="ws-empty">Keine .c-ocl-Dateien neben der Workspace-Datei.</p>
      </section>

      <!-- Atlas connections -->
      <section class="ws-section" data-testid="gene.WorkspaceEditor.atlas">
        <div class="ws-section-head">
          <i class="pi pi-globe"></i>
          <span class="ws-section-title">Atlas</span>
          <span class="ws-count">{{ overview.atlas.length }}</span>
        </div>
        <ul v-if="overview.atlas.length" class="ws-list">
          <li v-for="entry in overview.atlas" :key="entry.key" class="ws-row">
            <span class="ws-dot" :class="`ws-dot--${tone(entry.status)}`"></span>
            <div class="ws-row-text">
              <span class="ws-row-label">{{ entry.label }}</span>
              <span class="ws-row-sub">
                {{ entry.location }}<template v-if="entry.detail"> · {{ entry.detail }}</template>
              </span>
            </div>
            <span v-if="showsStatus(entry.status)" class="ws-status" :class="`ws-status--${tone(entry.status)}`">{{ STATUS_LABEL[entry.status] }}</span>
            <template v-if="!readonly">
              <button
                v-if="entry.status === 'connected' || entry.status === 'connecting'"
                class="ws-icon-btn"
                title="Trennen"
                @click="emit('disconnect', entry)"
              >
                <i class="pi pi-times-circle"></i>
              </button>
              <button
                v-else
                class="ws-icon-btn"
                title="Verbinden"
                :disabled="entry.status === 'disabled'"
                @click="emit('connect', entry)"
              >
                <i class="pi pi-sync"></i>
              </button>
            </template>
          </li>
        </ul>
        <p v-else class="ws-empty">Keine Atlas-Verbindungen eingetragen.</p>
      </section>

      <!-- Resolvers: edited in the settings dialog -->
      <section class="ws-section" data-testid="gene.WorkspaceEditor.resolvers">
        <div class="ws-section-head">
          <i class="pi pi-link"></i>
          <span class="ws-section-title">Package-Resolver</span>
          <span class="ws-count">{{ overview.resolvers.length }}</span>
          <button v-if="!readonly" class="ws-icon-btn ws-section-add" title="Resolver bearbeiten" @click="emit('settings', 'resolvers')">
            <i class="pi pi-pencil"></i>
          </button>
        </div>
        <ul v-if="overview.resolvers.length" class="ws-list">
          <li v-for="entry in overview.resolvers" :key="entry.key" class="ws-row">
            <span class="ws-dot" :class="`ws-dot--${tone(entry.status)}`"></span>
            <div class="ws-row-text">
              <span class="ws-row-label">{{ entry.label }}</span>
              <span class="ws-row-sub">
                {{ entry.detail }}<template v-if="entry.location"> · {{ entry.location }}</template>
              </span>
            </div>
          </li>
        </ul>
        <p v-else class="ws-empty">Keine Resolver - Modelle werden nur aus den eingetragenen Dateien geladen.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ws-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
  background: var(--surface-ground);
  color: var(--text-color);
}

.ws-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid var(--surface-border);
  position: sticky;
  top: 0;
  background: var(--surface-ground);
  z-index: 1;
}

.ws-head-icon {
  font-size: 1.25rem;
  color: var(--primary-color);
}

.ws-head-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.ws-head-name {
  font-size: 1.05rem;
  font-weight: 600;
}

.ws-head-path,
.ws-row-sub {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  border-radius: 6px;
  border: 1px solid var(--surface-border);
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
}

.ws-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.ws-btn--primary {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: var(--primary-color-text, #fff);
}

.ws-sections {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 1rem;
  padding: 1rem 1.25rem 1.5rem;
  align-content: start;
}

.ws-section {
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  background: var(--surface-card);
  padding: 0.6rem 0.75rem 0.75rem;
  min-width: 0;
}

.ws-section-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.5rem;
  margin-bottom: 0.4rem;
  border-bottom: 1px solid var(--surface-border);
  font-size: 0.85rem;
}

.ws-section-head > .pi {
  color: var(--primary-color);
}

.ws-section-title {
  font-weight: 600;
}

.ws-count {
  font-size: 0.7rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--text-color-secondary);
}

.ws-section-add {
  margin-left: auto;
}

.ws-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.ws-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.35rem 0.25rem;
  border-radius: 6px;
}

.ws-row:hover {
  background: var(--surface-hover);
}

.ws-row-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.ws-row-label {
  font-size: 0.85rem;
}

.ws-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ws-dot--ok { background: var(--p-green-500, #22c55e); }
.ws-dot--bad { background: var(--p-red-500, #ef4444); }
.ws-dot--idle { background: var(--p-amber-500, #f59e0b); }
.ws-dot--off { background: var(--text-color-secondary); opacity: 0.5; }
.ws-dot--plain { background: var(--text-color-secondary); }

.ws-preview-tag {
  font-size: 0.7rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--surface-border);
  color: var(--text-color-secondary);
}

.ws-status {
  font-size: 0.7rem;
  white-space: nowrap;
  color: var(--text-color-secondary);
}

.ws-status--bad { color: var(--p-red-500, #ef4444); }

.ws-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
}

.ws-icon-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-color);
}

.ws-icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.ws-icon-btn--danger:hover:not(:disabled) {
  color: var(--p-red-500, #ef4444);
}

.ws-adding {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  margin-bottom: 0.5rem;
  padding: 0.35rem;
  border-radius: 6px;
  background: var(--surface-ground);
  max-height: 12rem;
  overflow: auto;
}

.ws-adding-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.4rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-color);
  font-size: 0.8rem;
  text-align: left;
  cursor: pointer;
}

.ws-adding-item:hover {
  background: var(--surface-hover);
}

.ws-adding-item .pi {
  color: var(--primary-color);
}

.ws-empty {
  margin: 0.4rem 0.25rem;
  font-size: 0.8rem;
  color: var(--text-color-secondary);
}
</style>
