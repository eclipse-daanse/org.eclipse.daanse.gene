/**
 * Erzeugung und Ablage der Mapping-Artefakte (T24/#201).
 *
 * Zentral, weil zwei Stellen sie brauchen: die Menü-Toolbar der Perspective
 * (Speichern, In den Modelatlas) und der Zusammenfassungs-Schritt (Vorschau,
 * Download).
 */
import {
  buildMappingProfileXmi,
  buildProviderMappingXmi,
  slug,
} from '../transform/toProviderMapping';
import type { ProfileRef } from '../transform/toProviderMapping';
import { allSetups, atlasSource, editing, mappingDocument, providerName } from './context';

export interface OutputFile {
  title: string;
  fileName: string;
  content: string;
  /** Art des Artefakts — bestimmt die Upload-Reihenfolge. */
  kind: 'profile' | 'rules' | 'mapping';
  /** Hervorgehobener Download-Button. */
  primary?: boolean;
}

export interface ArtifactResult {
  files: OutputFile[];
  warnings: string[];
}

/**
 * Baut alle Artefakte des aktuellen Dokuments. Wirft mit nutzerlesbarer
 * Meldung, wenn Pflichtangaben fehlen (kein Modell, kein Messwert …).
 */
export function buildArtifacts(): ArtifactResult {
  const all = allSetups();
  if (all.length === 0) {
    throw new Error('Es wurde noch kein Sensormodell geladen.');
  }

  const files: OutputFile[] = [];
  const warnings: string[] = [];
  let profileRef: ProfileRef | undefined;

  // Mehrere Nachrichtentypen speisen einen gemeinsamen Provider (UNIFIED).
  if (all.length > 1) {
    const name = providerName.value.trim() || all[0].mappingId;
    const profile = buildMappingProfileXmi(name, all);
    profileRef = { fileName: profile.profileFileName, profileId: profile.profileId };
    files.push({
      title: 'Provider-Profil',
      fileName: profile.profileFileName,
      content: profile.profileXmi,
      kind: 'profile',
      primary: true,
    });
  }

  for (const setup of all) {
    const mapping = buildProviderMappingXmi(setup, { profile: profileRef });
    warnings.push(...mapping.warnings);

    // Ein geöffnetes Dokument behält seinen Namen, sonst entstünde beim
    // Speichern ein zweites Objekt bzw. eine zweite Datei (T19/T21).
    const single = all.length === 1;
    const openedObjectId = single ? editing.value?.objectId : undefined;
    const openedFile =
      single && mappingDocument.value.source === 'file' ? mappingDocument.value.name : undefined;
    const fileName = openedObjectId ?? openedFile ?? mapping.mappingFileName;
    if (openedObjectId && !fileName.startsWith(slug(setup.mappingId))) {
      warnings.push(
        `Das Mapping wird unter seinem bisherigen Namen „${fileName}" gespeichert ` +
          `(der Bezeichner „${setup.mappingId}" ergäbe „${mapping.mappingFileName}").`,
      );
    }

    files.push({
      title: `Mapping ${setup.sensorClass?.getName() ?? slug(setup.mappingId)}`,
      fileName,
      content: mapping.mappingXmi,
      kind: 'mapping',
      primary: single,
    });
    if (mapping.rulesXmi && mapping.rulesFileName) {
      files.push({
        title: 'Speicher-Regeln',
        fileName: mapping.rulesFileName,
        content: mapping.rulesXmi,
        kind: 'rules',
      });
    }
  }

  return { files, warnings };
}

/** Lässt sich überhaupt etwas erzeugen? (für die Menü-Zustände) */
export function hasArtifacts(): boolean {
  try {
    return buildArtifacts().files.length > 0;
  } catch {
    return false;
  }
}

export function downloadFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Workspace (gene.filesystem)
// ---------------------------------------------------------------------------

/** Ausschnitt der gene-Dateisystem-API, den der Assistent braucht. */
interface WorkspaceFileEntry {
  name: string;
  path: string;
  sourceId: string;
}
interface FileSourceLike {
  id: string;
  name: string;
  type: string;
}
export interface GeneFileSystem {
  sources: { value: FileSourceLike[] };
  getFileByPath(sourceId: string, path: string): WorkspaceFileEntry | undefined;
  createFile(sourceId: string, parentPath: string, fileName: string): Promise<void>;
  writeTextFile(entry: WorkspaceFileEntry, content: string): Promise<void>;
  readTextFile(entry: WorkspaceFileEntry): Promise<string>;
}

let fileSystem: GeneFileSystem | undefined;

/** Wird beim Aktivieren des Plugins gesetzt (Service `gene.filesystem`). */
export function setFileSystem(fs: GeneFileSystem | undefined): void {
  fileSystem = fs;
}

export function getFileSystem(): GeneFileSystem | undefined {
  return fileSystem;
}

/** Beschreibbarer Workspace-Ordner (nur lokale Quellen lassen sich schreiben). */
export function writableWorkspace(): FileSourceLike | undefined {
  return fileSystem?.sources.value.find((s) => s.type === 'local');
}

export function canSaveToWorkspace(): boolean {
  return !!writableWorkspace() && hasArtifacts();
}

/**
 * Schreibt alle Artefakte in den Workspace-Ordner (überschreibt gleichnamige
 * Dateien). Liefert die geschriebenen Dateinamen.
 */
export async function saveToWorkspace(files: OutputFile[]): Promise<string[]> {
  const fs = fileSystem;
  const source = writableWorkspace();
  if (!fs || !source) {
    throw new Error('Kein beschreibbarer Workspace-Ordner geöffnet.');
  }
  const written: string[] = [];
  for (const file of files) {
    let entry = fs.getFileByPath(source.id, file.fileName);
    if (!entry) {
      await fs.createFile(source.id, '', file.fileName);
      entry = fs.getFileByPath(source.id, file.fileName);
    }
    if (!entry) {
      throw new Error(`„${file.fileName}" konnte im Workspace nicht angelegt werden.`);
    }
    await fs.writeTextFile(entry, file.content);
    written.push(file.fileName);
  }
  return written;
}

// ---------------------------------------------------------------------------
// Modelatlas
// ---------------------------------------------------------------------------

export function canPublish(): boolean {
  return !!atlasSource.value?.canPublish && hasArtifacts();
}

export interface PublishProgress {
  fileName: string;
  state: 'pending' | 'ok' | 'error';
  message?: string;
}

/**
 * Lädt die Artefakte in eine Registry-Stage. Reihenfolge: Profil und Regeln
 * zuerst, damit die von den Mappings referenzierten Objekte schon da sind.
 * objectId = Dateiname, damit die hrefs zwischen den Objekten gültig bleiben.
 */
export async function publishToAtlas(
  registry: string,
  stage: string,
  files: OutputFile[],
  onProgress?: (entries: PublishProgress[]) => void,
): Promise<PublishProgress[]> {
  const source = atlasSource.value;
  if (!source) throw new Error('Keine Modelatlas-Verbindung.');

  const rank = (f: OutputFile) => (f.kind === 'mapping' ? 1 : 0);
  const ordered = [...files].sort((a, b) => rank(a) - rank(b));
  const progress: PublishProgress[] = ordered.map((f) => ({
    fileName: f.fileName,
    state: 'pending',
  }));
  onProgress?.([...progress]);

  for (const file of ordered) {
    const entry = progress.find((p) => p.fileName === file.fileName)!;
    try {
      await source.publishObject(registry, stage, file.fileName, file.content, {
        name: file.title,
        override: true,
      });
      entry.state = 'ok';
    } catch (e) {
      entry.state = 'error';
      entry.message = e instanceof Error ? e.message : String(e);
    }
    onProgress?.([...progress]);
  }
  return progress;
}
