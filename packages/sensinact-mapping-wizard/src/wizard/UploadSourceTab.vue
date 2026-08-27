<template>
  <div class="upload-tab">
    <!-- gene-Betrieb: Modelle und Mappings aus dem Workspace -->
    <div v-if="workspaceFiles.length" class="workspace-card">
      <h4><i class="pi pi-folder-open" aria-hidden="true"></i> Aus dem Workspace</h4>
      <ul class="ws-list">
        <li v-for="f in workspaceFiles" :key="f.sourceId + ':' + f.path">
          <label>
            <input type="checkbox" v-model="selectedPaths" :value="f.sourceId + ':' + f.path" />
            <span class="ws-name">{{ f.name }}</span>
            <small>{{ f.path }}</small>
          </label>
        </li>
      </ul>
      <button
        type="button"
        class="btn primary"
        :disabled="selectedPaths.length === 0 || loadingWorkspace"
        @click="loadFromWorkspace"
      >
        <i :class="loadingWorkspace ? 'pi pi-spinner pi-spin' : 'pi pi-download'" aria-hidden="true"></i>
        {{ selectedPaths.length }} Datei(en) laden
      </button>
    </div>

    <label
      class="dropzone"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <i class="pi pi-cloud-upload" aria-hidden="true"></i>
      <strong>Sensormodell (.ecore) oder Mapping (.xmi) hierher ziehen</strong>
      <span>oder klicken, um Dateien auszuwählen</span>
      <small>
        Ein Mapping-XMI wird zum Bearbeiten geöffnet; .ecore-Dateien legen ein neues
        Mapping an. Gehören mehrere Dateien zusammen (Basis-Modell, Profil,
        Speicher-Regeln), legen Sie sie gemeinsam ab.
      </small>
      <input type="file" accept=".ecore,.xmi" multiple @change="onFiles" />
    </label>
    <p v-if="fileNames.length" class="files">
      <i class="pi pi-file" aria-hidden="true"></i>
      {{ fileNames.join(', ') }}
    </p>
    <p v-if="error" class="error">
      <i class="pi pi-times-circle" aria-hidden="true"></i>
      {{ error }}
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * Datei-Quelle für **Modelle und Mappings** (T21/#192): Im gene-Betrieb werden
 * Dateien direkt aus dem Workspace angeboten (Service `gene.filesystem` aus
 * ui-file-explorer); die Dropzone bleibt als Alternative für lokale Dateien.
 *
 * Was abgelegt wird, entscheidet den Ausgang: Ein `ProviderMapping`-XMI wird
 * als Dokument geöffnet (Profil/Regeln daneben werden als Nachbar-Artefakte
 * mitgenommen), .ecore-Dateien legen ein neues Mapping an. Fehlende
 * Begleitdateien werden gemeldet.
 */
import { computed, inject, ref } from 'vue';
import type { EPackage } from '@emfts/core';
import { registerEcoreFiles } from '../emf/setup';
import { findMissingReferences } from '../atlas/cascadeLoader';
import { analyzeMappingXmi } from '../transform/fromProviderMapping';
import { openMappingContent } from './openMapping';
import { atlasSource } from './context';

const emit = defineEmits<{
  (e: 'packages-loaded', packages: EPackage[], warnings: string[]): void;
  (e: 'mapping-opened', warnings: string[]): void;
}>();

const error = ref('');
const dragging = ref(false);
const fileNames = ref<string[]>([]);

/** Sicht auf gene.filesystem (Struktur siehe ui-file-explorer/useFileSystem). */
interface WorkspaceFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  sourceId: string;
  extension?: string;
  children?: WorkspaceFileEntry[];
}
interface GeneFileSystem {
  files: { value: WorkspaceFileEntry[] };
  readTextFile(entry: WorkspaceFileEntry): Promise<string>;
}

const tsm = inject<{ getService?: (id: string) => unknown } | undefined>('tsm', undefined);
const geneFS = (tsm?.getService?.('gene.filesystem') ?? null) as GeneFileSystem | null;

const selectedPaths = ref<string[]>([]);
const loadingWorkspace = ref(false);

function flatten(entries: WorkspaceFileEntry[], out: WorkspaceFileEntry[] = []): WorkspaceFileEntry[] {
  for (const entry of entries) {
    if (entry.isDirectory) {
      if (entry.children) flatten(entry.children, out);
    } else {
      out.push(entry);
    }
  }
  return out;
}

const workspaceFiles = computed<WorkspaceFileEntry[]>(() => {
  if (!geneFS) return [];
  return flatten(geneFS.files.value ?? []).filter(
    (f) => f.name.endsWith('.ecore') || f.name.endsWith('.xmi'),
  );
});

async function loadFromWorkspace(): Promise<void> {
  if (!geneFS) return;
  error.value = '';
  loadingWorkspace.value = true;
  try {
    const selected = workspaceFiles.value.filter((f) =>
      selectedPaths.value.includes(`${f.sourceId}:${f.path}`),
    );
    const contents = await Promise.all(
      selected.map(async (f) => ({ name: f.name, content: await geneFS.readTextFile(f) })),
    );
    await processContents(contents);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loadingWorkspace.value = false;
  }
}

async function onFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  await processFiles(Array.from(input.files ?? []));
}

async function onDrop(event: DragEvent): Promise<void> {
  dragging.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []).filter(
    (f) => f.name.endsWith('.ecore') || f.name.endsWith('.xmi'),
  );
  await processFiles(files);
}

async function processFiles(files: File[]): Promise<void> {
  error.value = '';
  if (!files.length) return;
  fileNames.value = files.map((f) => f.name);
  try {
    const contents = await Promise.all(
      files.map(async (f) => ({ name: f.name, content: await f.text() })),
    );
    await processContents(contents);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

/**
 * Abgelegte Dateien einsortieren und daraus das Richtige machen: Mapping
 * öffnen, wenn eins dabei ist, sonst die Modelle für ein neues Mapping
 * registrieren.
 */
async function processContents(contents: { name: string; content: string }[]): Promise<void> {
  const ecores = contents.filter((c) => c.name.endsWith('.ecore'));
  const others = contents.filter((c) => !c.name.endsWith('.ecore'));
  const mappings = others.filter((c) => analyzeMappingXmi(c.content).rootType === 'ProviderMapping');
  const siblings = others.filter((c) => !mappings.includes(c));

  const packages = ecores.length ? registerEcoreFiles(ecores) : [];
  const missing = findMissingReferences(ecores);
  const warnings = missing.map(
    (ref) =>
      `Das Modell referenziert „${ref}" — bitte die Datei mit laden oder den Modelatlas verbinden, sonst fehlen zugehörige Felder.`,
  );

  if (mappings.length === 0) {
    if (packages.length === 0) {
      error.value =
        'Keine verwertbare Datei: erwartet werden ein Sensormodell (.ecore) oder ein Mapping (.xmi).';
      return;
    }
    emit('packages-loaded', packages, warnings);
    return;
  }

  if (mappings.length > 1) {
    warnings.push(
      `Es wurden ${mappings.length} Mappings abgelegt — geöffnet wird „${mappings[0].name}".`,
    );
  }

  const result = await openMappingContent({
    content: mappings[0].content,
    document: { source: 'file', name: mappings[0].name },
    packages,
    siblings: siblings.map((s) => ({ fileName: s.name, content: s.content })),
    // Fehlende Sensormodelle notfalls aus dem verbundenen Atlas nachladen.
    source: atlasSource.value,
  });
  emit('mapping-opened', [...warnings, ...result.warnings]);
}
</script>

<style scoped>
.upload-tab { display: flex; flex-direction: column; gap: 0.85rem; max-width: 44rem; }

/* Workspace-Dateien (gene) */
.workspace-card {
  border: 1px solid var(--surface-border, #ddd);
  border-radius: 8px;
  background: var(--surface-card, #fff);
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.workspace-card h4 {
  margin: 0; display: inline-flex; align-items: center; gap: 0.5rem;
  font-size: 0.95rem; color: var(--text-color, inherit);
}
.workspace-card h4 .pi { color: var(--primary-color, #1a56a0); }
.ws-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; max-height: 14rem; overflow: auto; }
.ws-list label {
  display: flex; align-items: center; gap: 0.55rem; cursor: pointer;
  padding: 0.3rem 0.4rem; border-radius: 6px;
}
.ws-list label:hover { background: var(--surface-hover, #f5f5f5); }
.ws-list input { accent-color: var(--primary-color, #1a56a0); }
.ws-name { font-weight: 500; }
.ws-list small { color: var(--text-color-secondary, #888); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btn {
  display: inline-flex; align-items: center; gap: 0.5rem; align-self: flex-start;
  font: inherit; font-weight: 500; padding: 0.45rem 1rem; cursor: pointer;
  border-radius: 6px; border: 1px solid var(--surface-border, #c0c4cc);
  background: var(--surface-card, #fff); color: var(--text-color, inherit);
}
.btn.primary {
  background: var(--primary-color, #1a56a0);
  color: var(--primary-color-text, #fff);
  border-color: var(--primary-color, #1a56a0);
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn .pi { font-size: 0.85rem; }
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 2.25rem 1.5rem;
  border: 2px dashed var(--surface-border, #c0c4cc);
  border-radius: 8px;
  background: var(--surface-section, #fafafa);
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s, background 0.15s;
  max-width: 44rem;
}
.dropzone:hover,
.dropzone.dragging {
  border-color: var(--primary-color, #1a56a0);
  background: color-mix(in srgb, var(--primary-color, #1a56a0) 6%, transparent);
}
.dropzone .pi-cloud-upload {
  font-size: 2rem;
  color: var(--primary-color, #1a56a0);
  margin-bottom: 0.25rem;
}
.dropzone span,
.dropzone small { color: var(--text-color-secondary, #666); }
.dropzone input { display: none; }
.files {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  color: var(--text-color-secondary, #666);
}
.error {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  color: #e5484d;
}
</style>
