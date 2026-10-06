/**
 * The state of one wizard tab.
 *
 * Everything that belongs to a mapping being edited - its document, the setup,
 * the sensor model, the finished message types of a shared provider, status
 * and dialog flags - lives in a context of its own, one per tab. The shell
 * provides it, the steps, widgets and dialogs inject it. Nothing is "current"
 * module-wide any more: two open mappings no longer write into each other.
 *
 * What stays shared is what really is shared: the Atlas connection chosen in
 * the model step (`atlasSource`), the host services, and `candidateFromPath`,
 * which has no state at all.
 */
import { computed, inject, provide, ref, shallowRef, triggerRef } from 'vue';
import type { ComputedRef, InjectionKey, Ref, ShallowRef } from 'vue';
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

export interface EditingTarget {
  registry: string;
  stage: string;
  objectId: string;
  objectName: string;
}

export interface OpenedMapping {
  setup: SensorMappingSetup;
  warnings: string[];
  profile?: { name?: string; profileId: string };
}

export interface WizardContext {
  /** The editor tab this context belongs to */
  readonly tabId: string;
  mappingDocument: Ref<MappingDocument>;
  /** Atlas origin of the open document - drives "save changes" over the same object */
  editing: ComputedRef<EditingTarget | undefined>;
  /** What the opener could not map onto the wizard */
  restoreWarnings: Ref<string[]>;
  uploadDialogOpen: Ref<boolean>;
  openDialogOpen: Ref<boolean>;
  statusMessage: Ref<{ text: string; kind: 'ok' | 'error' } | undefined>;
  showStatus(text: string, kind?: 'ok' | 'error'): void;
  sensorPackages: ShallowRef<EPackage[]>;
  sensorClass: ShallowRef<EClass | undefined>;
  setup: ShallowRef<SensorMappingSetup | undefined>;
  ready: ComputedRef<boolean>;
  /** Finished runs of a shared provider, one setup per message type */
  completedSetups: ShallowRef<SensorMappingSetup[]>;
  providerName: Ref<string>;
  allSetups(): SensorMappingSetup[];
  freezeCurrentSetup(): void;
  initSetup(eClass: EClass): SensorMappingSetup;
  startNewMapping(): void;
  applyOpenedMapping(opened: OpenedMapping, document: MappingDocument, packages?: EPackage[]): void;
  /** Change counter - EMF objects are not deep-reactive, the shell keys its forms on it */
  version: Ref<number>;
  touch(): void;
}

export function candidateFromPath(c: FeaturePathCandidate) {
  const f = MappingwizardFactory.eINSTANCE;
  const path = f.createFeaturePath();
  path.segments.push(...c.segments);
  path.label = c.label;
  return path;
}

export function createWizardContext(tabId: string): WizardContext {
  const mappingDocument = ref<MappingDocument>({ source: 'new', name: '' });
  const editing = computed<EditingTarget | undefined>(() => {
    const doc = mappingDocument.value;
    if (doc.source !== 'atlas' || !doc.objectId) return undefined;
    return {
      registry: doc.registry ?? '',
      stage: doc.stage ?? '',
      objectId: doc.objectId,
      objectName: doc.name,
    };
  });
  const restoreWarnings = ref<string[]>([]);
  const uploadDialogOpen = ref(false);
  const openDialogOpen = ref(false);
  const statusMessage = ref<{ text: string; kind: 'ok' | 'error' } | undefined>(undefined);

  /** Statusmeldung setzen; sie verschwindet nach kurzer Zeit von selbst. */
  function showStatus(text: string, kind: 'ok' | 'error' = 'ok'): void {
    statusMessage.value = { text, kind };
    const shown = statusMessage.value;
    setTimeout(() => {
      if (statusMessage.value === shown) statusMessage.value = undefined;
    }, kind === 'ok' ? 6000 : 12000);
  }

  const sensorPackages = shallowRef<EPackage[]>([]);
  const sensorClass = shallowRef<EClass | undefined>(undefined);
  const setup = shallowRef<SensorMappingSetup | undefined>(undefined);
  const ready = computed(() => !!setup.value);

  const completedSetups = shallowRef<SensorMappingSetup[]>([]);
  const providerName = ref('');

  const version = ref(0);
  function touch(): void {
    version.value++;
    triggerRef(setup);
  }

  /** Alle Setups inklusive des aktuellen (für Profil-Erzeugung/Übersicht). */
  function allSetups(): SensorMappingSetup[] {
    return setup.value ? [...completedSetups.value, setup.value] : [...completedSetups.value];
  }

  /**
   * Friert den aktuellen Durchlauf ein und macht Schritt 1 frei für den
   * nächsten Nachrichtentyp (auch ein anderes Schema/Modell ist möglich).
   */
  function freezeCurrentSetup(): void {
    if (!setup.value) return;
    completedSetups.value = [...completedSetups.value, setup.value];
    setup.value = undefined;
    sensorClass.value = undefined;
    sensorPackages.value = [];
    mappingDocument.value = { source: 'new', name: '' };
    restoreWarnings.value = [];
    touch();
  }

  /**
   * Initialisiert das Fassadenmodell für die gewählte Sensorklasse —
   * inklusive Messwert-Vorschlägen aus den Modell-Annotationen.
   */
  function initSetup(eClass: EClass): SensorMappingSetup {
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
  function startNewMapping(): void {
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
   * Übernimmt ein geöffnetes Mapping in diesen Tab.
   * `packages` sind die dafür geladenen Modelle (für Klassenliste/Pfade).
   */
  function applyOpenedMapping(opened: OpenedMapping, document: MappingDocument, packages: EPackage[] = []): void {
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

  return {
    tabId,
    mappingDocument,
    editing,
    restoreWarnings,
    uploadDialogOpen,
    openDialogOpen,
    statusMessage,
    showStatus,
    sensorPackages,
    sensorClass,
    setup,
    ready,
    completedSetups,
    providerName,
    allSetups,
    freezeCurrentSetup,
    initSetup,
    startNewMapping,
    applyOpenedMapping,
    version,
    touch,
  };
}

// ── One context per tab ──────────────────────────────────────────────────

/** Tab ids of the wizard start with this; the rest names the document */
export const WIZARD_TAB_PREFIX = 'sensinact:';
/** The context used where no tab provides one - tests, widgets mounted alone */
export const DEFAULT_TAB_ID = `${WIZARD_TAB_PREFIX}default`;

const contexts = new Map<string, WizardContext>();

/** The context of a tab; created on first use. */
export function wizardContextFor(tabId: string): WizardContext {
  let ctx = contexts.get(tabId);
  if (!ctx) {
    ctx = createWizardContext(tabId);
    contexts.set(tabId, ctx);
  }
  return ctx;
}

export function hasWizardContext(tabId: string): boolean {
  return contexts.has(tabId);
}

/** Forgets a closed tab's context. */
export function closeWizardContext(tabId: string): void {
  contexts.delete(tabId);
}

export function openWizardTabIds(): string[] {
  return [...contexts.keys()];
}

export const WIZARD_CONTEXT_KEY: InjectionKey<WizardContext> = Symbol.for('sensinact:wizardContext');

/** Called by the tab component; everything beneath takes the context with `useWizardContext`. */
export function provideWizardContext(ctx: WizardContext): void {
  provide(WIZARD_CONTEXT_KEY, ctx);
}

/** The context of the tab a component sits in - or the tab-less default. */
export function useWizardContext(): WizardContext {
  return inject(WIZARD_CONTEXT_KEY, null) ?? wizardContextFor(DEFAULT_TAB_ID);
}
