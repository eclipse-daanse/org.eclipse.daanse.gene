/**
 * Zentraler, reaktiver Zustand des Assistenten. Der FeaturePathPicker liest
 * hieraus die aktuelle Sensorklasse, um seine Kandidatenliste zu berechnen.
 */
import { computed, ref, shallowRef, triggerRef } from 'vue';
import type { EClass, EPackage } from '@emfts/core';
import type { AtlasModelSource } from '../atlas/atlasSource';
import type { SensorMappingSetup } from '../generated';
import {
  MappingwizardFactory,
  FriendlyNameSource,
  LocationMode,
  NameSource,
  TimestampSource,
} from '../generated';
import { suggestMeasurementPaths } from '../emf/featurePaths';
import type { FeaturePathCandidate } from '../emf/featurePaths';
import { slug } from '../transform/toProviderMapping';

/**
 * Aktive Atlas-Verbindung des Modell-Schritts — der Zusammenfassungs-Schritt
 * nutzt sie zum Veröffentlichen der erzeugten Mappings (T17/#151).
 */
export const atlasSource = shallowRef<AtlasModelSource | undefined>(undefined);

/**
 * Der Assistent arbeitet dokument-orientiert (T21/#192): Entweder ist ein
 * Mapping geöffnet — aus dem Modelatlas oder aus einer Datei — und wird
 * bearbeitet und gespeichert, oder man beginnt leer mit einem neuen Mapping.
 */
export type DocumentSource = 'new' | 'file' | 'atlas';

export interface MappingDocument {
  source: DocumentSource;
  /** Anzeigename: objectId bzw. Dateiname; leer bei einem neuen Mapping. */
  name: string;
  /** Nur bei `atlas`: Herkunft, in die zurückgeschrieben wird. */
  registry?: string;
  stage?: string;
  objectId?: string;
}

export const mappingDocument = ref<MappingDocument>({ source: 'new', name: '' });

/**
 * Atlas-Herkunft des geöffneten Dokuments — steuert „Änderungen speichern"
 * (überschreibt dasselbe Objekt) in der Zusammenfassung.
 */
export const editing = computed(() => {
  const doc = mappingDocument.value;
  if (doc.source !== 'atlas' || !doc.objectId) return undefined;
  return {
    registry: doc.registry ?? '',
    stage: doc.stage ?? '',
    objectId: doc.objectId,
    objectName: doc.name,
  };
});

/** Hinweise aus dem Öffnen (nicht abbildbare Konstrukte des Mappings). */
export const restoreWarnings = ref<string[]>([]);

/**
 * Aus der Menü-Toolbar gesteuert (T24/#201): Der Upload-Dialog wird von dort
 * geöffnet, Rückmeldungen von „Speichern" erscheinen als Statuszeile.
 */
export const uploadDialogOpen = ref(false);
export const openDialogOpen = ref(false);
export const statusMessage = ref<{ text: string; kind: 'ok' | 'error' } | undefined>(undefined);

/** Statusmeldung setzen; sie verschwindet nach kurzer Zeit von selbst. */
export function showStatus(text: string, kind: 'ok' | 'error' = 'ok'): void {
  statusMessage.value = { text, kind };
  const shown = statusMessage.value;
  setTimeout(() => {
    if (statusMessage.value === shown) statusMessage.value = undefined;
  }, kind === 'ok' ? 6000 : 12000);
}

export const sensorPackages = shallowRef<EPackage[]>([]);
export const sensorClass = shallowRef<EClass | undefined>(undefined);
export const setup = shallowRef<SensorMappingSetup | undefined>(undefined);

export const ready = computed(() => !!setup.value);

// --- Gemeinsamer Provider über mehrere Nachrichtentypen (B1/#146) ---

/** Abgeschlossene Durchläufe (je Nachrichtentyp ein Setup). */
export const completedSetups = shallowRef<SensorMappingSetup[]>([]);
/** Name des gemeinsamen Providers (→ MappingProfile, providerStrategy=UNIFIED). */
export const providerName = ref('');

/** Alle Setups inklusive des aktuellen (für Profil-Erzeugung/Übersicht). */
export function allSetups(): SensorMappingSetup[] {
  return setup.value ? [...completedSetups.value, setup.value] : [...completedSetups.value];
}

/**
 * Friert den aktuellen Durchlauf ein und macht Schritt 1 frei für den
 * nächsten Nachrichtentyp (auch ein anderes Schema/Modell ist möglich).
 */
export function freezeCurrentSetup(): void {
  if (!setup.value) return;
  completedSetups.value = [...completedSetups.value, setup.value];
  setup.value = undefined;
  sensorClass.value = undefined;
  sensorPackages.value = [];
  mappingDocument.value = { source: 'new', name: '' };
  restoreWarnings.value = [];
  touch();
}

export function candidateFromPath(c: FeaturePathCandidate) {
  const f = MappingwizardFactory.eINSTANCE;
  const path = f.createFeaturePath();
  path.segments.push(...c.segments);
  path.label = c.label;
  return path;
}

/**
 * Initialisiert das Fassadenmodell für die gewählte Sensorklasse —
 * inklusive Messwert-Vorschlägen aus den Modell-Annotationen.
 */
export function initSetup(eClass: EClass): SensorMappingSetup {
  const f = MappingwizardFactory.eINSTANCE;
  const s = f.createSensorMappingSetup();
  s.mappingId = slug(eClass.getName() ?? 'sensor');
  s.sensorClass = eClass;
  // Default: Name aus einem Feld; der Klassenname dient als Vorschlag,
  // falls der Nutzer auf „fester Name" umschaltet.
  s.nameSource = NameSource.FROM_FIELD;
  s.nameFallback = eClass.getName() ?? '';
  s.friendlyNameSource = FriendlyNameSource.NONE;

  const ts = f.createTimestampChoice();
  ts.source = TimestampSource.RECEIVE_TIME;
  s.timestamp = ts;

  const loc = f.createLocationChoice();
  loc.mode = LocationMode.NONE;
  s.location = loc;

  for (const candidate of suggestMeasurementPaths(eClass)) {
    const m = f.createMeasurement();
    m.selected = !candidate.crossesCollection;
    m.valuePath = candidateFromPath(candidate);
    const lastSegment = candidate.segments[candidate.segments.length - 1];
    m.label = lastSegment.getName() ?? candidate.label;
    if (candidate.unit) m.unit = candidate.unit;
    s.measurements.push(m);
  }

  sensorClass.value = eClass;
  setup.value = s;
  // Ein neu angelegtes Mapping überschreibt kein bestehendes Dokument.
  mappingDocument.value = { source: 'new', name: '' };
  restoreWarnings.value = [];
  return s;
}

/** Alles verwerfen und mit einem leeren Mapping beginnen. */
export function startNewMapping(): void {
  setup.value = undefined;
  sensorClass.value = undefined;
  sensorPackages.value = [];
  completedSetups.value = [];
  providerName.value = '';
  mappingDocument.value = { source: 'new', name: '' };
  restoreWarnings.value = [];
  touch();
}

/**
 * Übernimmt ein aus dem Atlas geöffnetes Mapping in den Assistenten.
 * `packages` sind die dafür geladenen Modelle (für Klassenliste/Pfade).
 */
export function applyOpenedMapping(
  opened: { setup: SensorMappingSetup; warnings: string[]; profile?: { name?: string; profileId: string } },
  document: MappingDocument,
  packages: EPackage[] = [],
): void {
  const eClass = opened.setup.sensorClass as EClass | undefined;
  const own = eClass?.getEPackage();
  const list = packages.length ? packages : own ? [own] : [];
  sensorPackages.value = list;
  sensorClass.value = eClass;
  setup.value = opened.setup;
  completedSetups.value = [];
  if (opened.profile) providerName.value = opened.profile.name || opened.profile.profileId;
  mappingDocument.value = document;
  restoreWarnings.value = opened.warnings;
  touch();
}

/**
 * Änderungs-Zähler: EMF-Objekte sind nicht deep-reactive, und die
 * Sichtbarkeitsbedingungen des UIModelComposer werten das Modell nur beim
 * Rendern aus. Die Wizard-Shell keyed die composed Steps auf diese Version,
 * sodass ein touch() die Bedingungen neu auswertet.
 */
export const version = ref(0);

/** Manuelles Re-Rendern anstoßen (EMF-Objekte sind nicht deep-reactive). */
export function touch(): void {
  version.value++;
  triggerRef(setup);
}
