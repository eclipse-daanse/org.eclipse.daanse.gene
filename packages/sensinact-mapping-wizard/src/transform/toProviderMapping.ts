/**
 * Transformer: Wizard-Fassadenmodell (SensorMappingSetup) →
 * SensiNact-ProviderMapping-XMI (Metamodell event-atlas-mapping.ecore,
 * nsURI https://fennec.eclipse.org/event.atlas/mapping/1.0).
 *
 * Das Mapping entsteht als echte EObjects des (dynamisch geladenen)
 * Mapping-Metamodells und wird vom XMI-Serializer von @emfts/core
 * geschrieben. Was früher ein Text-Template erzwang, liefert der Kern heute
 * selbst:
 *  - hrefs auf Sensormodelle nsURI-basiert ("https://eclipse.org/fennec/lorawan
 *    #//UplinkMessage/time"), weil die Modell-Resources unter ihrer nsURI
 *    liegen (emf/setup.ts) — die Java-Seite löst sie über die Registry auf.
 *  - xsi:type="ecore:EAttribute|EReference" an featurePath/valueFeature/…,
 *    deren deklarierter Typ das abstrakte EStructuralFeature ist.
 *  - Referenzen innerhalb des Dokuments nach den Regeln des Kerns: ID-Attribut
 *    (mid, id, profileId), sonst Pfad.
 *
 * Konformanz wird über Golden-/Round-Trip-Tests abgesichert
 * (test/toProviderMapping.test.ts).
 */
import type {
  EClass,
  EClassifier,
  EDataType,
  EEnum,
  EObject,
  EPackage,
  EReference,
  EStructuralFeature,
  Resource,
} from '@emfts/core';
import { URI, getEcorePackage } from '@emfts/core';
import type { FeaturePath, Measurement, SensorMappingSetup } from '../generated';
import {
  FriendlyNameSource,
  LocationMode,
  NameSource,
  RetentionPreset,
  StoragePreset,
  TimestampSource,
} from '../generated';
import { classifyDataType } from '../emf/featurePaths';
import { getMappingPackage, newResourceSet } from '../emf/setup';

export const MAPPING_NS_URI = 'https://fennec.eclipse.org/event.atlas/mapping/1.0';

/*
 * The documents are written as neighbours in one folder and refer to each
 * other by bare file name: the resources carry exactly that name as URI, so
 * an href from the mapping into its rules file reads `<rules>.xmi#<id>`.
 */

export interface TransformResult {
  /** Das ProviderMapping-XMI (Endprodukt). */
  mappingXmi: string;
  mappingFileName: string;
  /** Persistenz-Regeln, nur wenn Presets abweichend von den Defaults gewählt wurden. */
  rulesXmi?: string;
  rulesFileName?: string;
  /** Hinweise, die dem Nutzer in der Zusammenfassung angezeigt werden sollten. */
  warnings: string[];
}

/** id-tauglicher Bezeichner: klein, nur [a-z0-9-]. */
export function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'mapping';
}

function isReference(f: EStructuralFeature): f is EReference {
  return typeof (f as EReference).isContainment === 'function';
}

// ── The mapping model, reflectively ──────────────────────────────────────

function mappingClass(name: string): EClass {
  const c = getMappingPackage().getEClassifier(name) as EClass | null;
  if (!c) throw new Error(`Das Mapping-Metamodell kennt keine Klasse ${name}`);
  return c;
}

function create(className: string): EObject {
  const factory = getMappingPackage().getEFactoryInstance();
  if (!factory) throw new Error('Das Mapping-Metamodell hat keine Factory');
  return factory.create(mappingClass(className));
}

function featureOf(obj: EObject, name: string): EStructuralFeature {
  const f = obj.eClass().getEStructuralFeature(name);
  if (!f) throw new Error(`${obj.eClass().getName()} hat kein Feature ${name}`);
  return f;
}

function set(obj: EObject, name: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  obj.eSet(featureOf(obj, name), value);
}

/** An enum value by literal name - the factory turns the literal back into text on save */
function setEnum(obj: EObject, name: string, literal: string): void {
  const f = featureOf(obj, name);
  const type = f.getEType() as EEnum | null;
  const value = (type as EEnum | null)?.getEEnumLiteral?.(literal as never) ?? null;
  obj.eSet(f, value ?? literal);
}

function addAll(obj: EObject, name: string, values: readonly unknown[]): void {
  const list = obj.eGet(featureOf(obj, name)) as { add: (v: unknown) => unknown };
  for (const v of values) list.add(v);
}

function pathSegments(path: FeaturePath | undefined | null): EStructuralFeature[] {
  return [...((path?.segments ?? []) as Iterable<EStructuralFeature>)];
}

/**
 * Ziel-EDataType eines Messwerts: explizite Wahl > Quelltyp (falls Ecore-Typ) >
 * kanonischer Typ nach Wertart.
 */
function resolveEType(m: Measurement): EDataType {
  const ecore = getEcorePackage();
  const explicit = m.targetType as EDataType | undefined;
  if (explicit?.getEPackage()?.getNsURI()) return explicit;
  const segments = pathSegments(m.valuePath);
  const last = segments[segments.length - 1];
  const sourceType = last && !isReference(last) ? (last.getEType() as EDataType | null) : null;
  if (sourceType?.getEPackage() === ecore) return sourceType;
  const byKind: Record<string, string> = { NUMERIC: 'EDouble', BOOLEAN: 'EBoolean', TEMPORAL: 'EDate' };
  const name = byKind[classifyDataType(sourceType)] ?? 'EString';
  return ecore.getEClassifier(name) as EDataType;
}

/** Persistenz-Presets → Regel-Definitionen mit stabilen ids. */
interface RuleSpec {
  id: string;
  className: string;
  values: Record<string, unknown>;
  enums?: Record<string, string>;
}
const CHANGE_RULES: Partial<Record<StoragePreset, RuleSpec>> = {
  [StoragePreset.CHANGED_5_PERCENT]: {
    id: 'change-5-percent',
    className: 'PercentageChangeRule',
    values: { name: 'Nur bei Änderung ab 5 %', percentage: 5.0 },
  },
  [StoragePreset.MAX_ONCE_10MIN]: {
    id: 'throttle-10min',
    className: 'TimeThrottleChangeRule',
    values: { name: 'Höchstens alle 10 Minuten', interval: 10 },
    enums: { intervalUnit: 'MINUTES' },
  },
};
const DELETION_RULES: Partial<Record<RetentionPreset, RuleSpec>> = {
  [RetentionPreset.DAYS_90]: {
    id: 'keep-90-days',
    className: 'DeletionRule',
    values: { name: '90 Tage aufbewahren', retention: 90, cleanupInterval: 1 },
    enums: { retentionUnit: 'DAYS', cleanupIntervalUnit: 'DAYS' },
  },
  [RetentionPreset.YEAR_1]: {
    id: 'keep-1-year',
    className: 'DeletionRule',
    values: { name: '1 Jahr aufbewahren', retention: 365, cleanupInterval: 7 },
    enums: { retentionUnit: 'DAYS', cleanupIntervalUnit: 'DAYS' },
  },
};

function createRule(spec: RuleSpec): EObject {
  const rule = create(spec.className);
  set(rule, 'id', spec.id);
  for (const [k, v] of Object.entries(spec.values)) set(rule, k, v);
  for (const [k, v] of Object.entries(spec.enums ?? {})) setEnum(rule, k, v);
  return rule;
}

/** Basis-Resource-Id eines Messwerts (identisch in Mapping und Profil). */
function resourceIdOf(m: Measurement): string {
  const segments = pathSegments(m.valuePath);
  const last = segments[segments.length - 1];
  return slug(m.label || last?.getName() || 'value');
}

/** A NameMapping: static text, a feature path, or both */
function nameMapping(text?: string | null, path?: FeaturePath | null): EObject {
  const name = create('NameMapping');
  set(name, 'name', text || undefined);
  const segments = pathSegments(path);
  if (segments.length) {
    addAll(name, 'featurePath', segments);
    if (path?.collectionIndex) set(name, 'collectionIndex', path.collectionIndex);
  }
  return name;
}

function serialize(resource: Resource): string {
  const text = (resource as unknown as { saveToString: () => string }).saveToString();
  return text.endsWith('\n') ? text : `${text}\n`;
}

export interface ProfileRef {
  /** Dateiname der Profil-XMI (href-Basis). */
  fileName: string;
  profileId: string;
}

export function buildProviderMappingXmi(
  setup: SensorMappingSetup,
  options: { profile?: ProfileRef } = {},
): TransformResult {
  const warnings: string[] = [];
  const mid = slug(setup.mappingId);
  const mappingFileName = `${mid}-mapping.xmi`;
  const rulesFileName = `${mid}-persistence-rules.xmi`;

  const sensorClass = setup.sensorClass as EClass | undefined;
  if (!sensorClass) throw new Error('Es wurde keine Sensor-Nachrichtenklasse gewählt');
  const sensorPkg = sensorClass.getEPackage() as EPackage | null;
  if (!sensorPkg?.getNsURI()) throw new Error('Die Sensorklasse hat kein Package mit nsURI');

  const measurements = setup.measurements.filter((m) => m.selected && pathSegments(m.valuePath).length);
  if (measurements.length === 0) {
    throw new Error('Es wurde kein Messwert ausgewählt');
  }

  // Name validation first - the message names what is missing, not a half-built model
  const useNameField = setup.nameSource !== NameSource.STATIC;
  if (useNameField && !pathSegments(setup.namePath).length) {
    throw new Error('Es wurde kein Feld für den Namen des Sensors gewählt');
  }
  if (!useNameField && !setup.nameFallback) {
    throw new Error('Es wurde kein fester Name für den Sensor angegeben');
  }

  const rs = newResourceSet();
  const mappingResource = rs.createResource(URI.createURI(mappingFileName));

  // Regeln: nur die gebrauchten, jede genau einmal, in ihrer eigenen Datei
  const rules = new Map<string, EObject>();
  let rulesResource: Resource | null = null;
  const ruleFor = (spec: RuleSpec | undefined, list: 'changeRules' | 'deletionRules'): EObject | undefined => {
    if (!spec) return undefined;
    let rule = rules.get(spec.id);
    if (!rule) {
      if (!rulesResource) {
        rulesResource = rs.createResource(URI.createURI(rulesFileName));
        rulesResource.getContents().add(create('PersistenceRuleRegistry'));
      }
      rule = createRule(spec);
      addAll(rulesResource.getContents().get(0) as EObject, list, [rule]);
      rules.set(spec.id, rule);
    }
    return rule;
  };

  const root = create('ProviderMapping');
  mappingResource.getContents().add(root);
  set(root, 'mid', mid);

  // Provider-Zeitstempel - die Resources verweisen auf dasselbe Objekt
  const timestamp = create('TimestampMapping');
  const ts = setup.timestamp;
  if (ts?.source === TimestampSource.DEVICE_TIME && pathSegments(ts.path).length) {
    setEnum(timestamp, 'strategy', 'FEATURE');
    set(timestamp, 'hint', ts.formatHint || undefined);
    if (ts.path?.collectionIndex) set(timestamp, 'collectionIndex', ts.path.collectionIndex);
    addAll(timestamp, 'featurePath', pathSegments(ts.path));
  } else {
    setEnum(timestamp, 'strategy', 'NOW');
  }
  set(root, 'timestamp', timestamp);

  // Provider-Name: entweder Feldwert ODER fester Text (nameSource)
  set(root, 'name', useNameField ? nameMapping(undefined, setup.namePath) : nameMapping(setup.nameFallback));

  addAll(root, 'providerClasses', [sensorClass]);

  // Messwerte, gruppiert nach serviceGroup → je ein Service
  const groups = new Map<string, Measurement[]>();
  for (const m of measurements) {
    const group = slug(m.serviceGroup || 'data');
    const list = groups.get(group) ?? [];
    list.push(m);
    groups.set(group, list);
  }
  const usedResourceIds = new Set<string>();
  for (const [group, ms] of groups) {
    const service = create('ServiceMapping');
    set(service, 'mid', group);
    set(service, 'name', nameMapping(ms[0].serviceGroup || group));
    for (const m of ms) {
      let rid = resourceIdOf(m);
      while (usedResourceIds.has(`${group}/${rid}`)) rid = `${rid}-2`;
      usedResourceIds.add(`${group}/${rid}`);

      const valuePath = pathSegments(m.valuePath);
      if (valuePath.some((s) => s.isMany())) {
        warnings.push(
          `Messwert "${m.label ?? rid}": Der Pfad durchquert eine Sammlung — es wird immer das erste Element verwendet.`,
        );
      }

      const resource = create('ResourceMapping');
      set(resource, 'name', m.label || undefined);
      // Dynamische Einheit (unitFeature) hat Vorrang vor der statischen
      const unitPath = pathSegments(m.unitPath);
      if (unitPath.length) addAll(resource, 'unitFeature', unitPath);
      else set(resource, 'unit', m.unit || undefined);
      set(resource, 'timestamp', timestamp);
      set(resource, 'mid', rid);
      set(resource, 'eType', resolveEType(m));
      addAll(resource, 'valueFeature', valuePath);
      set(resource, 'changeRule', ruleFor(CHANGE_RULES[m.storagePreset as StoragePreset], 'changeRules'));
      set(resource, 'deletionRule', ruleFor(DELETION_RULES[m.retentionPreset as RetentionPreset], 'deletionRules'));
      addAll(service, 'resources', [resource]);
    }
    addAll(root, 'services', [service]);
  }

  // Admin-Service: Anzeigename, Standort, Quell-Package
  const admin = create('AdminMapping');
  set(admin, 'mid', 'admin');
  set(admin, 'name', nameMapping('Admin'));
  if (setup.friendlyNameSource === FriendlyNameSource.STATIC && setup.friendlyName) {
    set(admin, 'friendlyName', setup.friendlyName);
  } else if (setup.friendlyNameSource === FriendlyNameSource.FROM_FIELD) {
    addAll(admin, 'friendlyNameFeature', pathSegments(setup.friendlyNamePath));
  }
  const loc = setup.location;
  if (loc?.mode === LocationMode.STATIC) {
    if (Number.isFinite(loc.latitude)) set(admin, 'latitude', loc.latitude);
    if (Number.isFinite(loc.longitude)) set(admin, 'longitude', loc.longitude);
    if (Number.isFinite(loc.elevation)) set(admin, 'elevation', loc.elevation);
  } else if (loc?.mode === LocationMode.FROM_DATA) {
    addAll(admin, 'latitudeRef', pathSegments(loc.latitudePath));
    addAll(admin, 'longitudeRef', pathSegments(loc.longitudePath));
    addAll(admin, 'elevationRef', pathSegments(loc.elevationPath));
  }
  set(admin, 'providerPackage', sensorPkg);
  set(root, 'admin', admin);

  // Gemeinsamer Provider über mehrere Nachrichtentypen: Referenz auf das
  // MappingProfile (providerStrategy=UNIFIED, siehe buildMappingProfileXmi).
  // The profile is another document; a proxy carries its address - relative,
  // as the two files lie side by side, and written out unchanged.
  if (options.profile) {
    const profile = create('MappingProfile') as EObject & { eSetProxyURI?: (uri: URI) => void };
    profile.eSetProxyURI?.(URI.createURI(`${options.profile.fileName}#${options.profile.profileId}`));
    set(root, 'profile', profile);
  }

  const result: TransformResult = {
    mappingXmi: serialize(mappingResource),
    mappingFileName,
    warnings,
  };
  if (rulesResource) {
    result.rulesXmi = serialize(rulesResource);
    result.rulesFileName = rulesFileName;
  }
  return result;
}

// ---------------------------------------------------------------------------
// MappingProfile: gemeinsamer Provider über mehrere Nachrichtentypen (UNIFIED)
// ---------------------------------------------------------------------------

export interface ProfileResult {
  profileXmi: string;
  profileFileName: string;
  profileId: string;
}

/**
 * Erzeugt ein MappingProfile mit providerStrategy="UNIFIED" aus mehreren
 * Wizard-Durchläufen: Alle ProviderMappings, die dieses Profil referenzieren,
 * speisen EINEN gemeinsamen Provider (Vorbild:
 * emf.util/.../examples/battery/battery-sensor-profile.xmi).
 *
 * Services/Resources sind die Union aller Setups; Resources, die nicht jeder
 * Nachrichtentyp liefert, werden als required="false" markiert, damit die
 * Konformanz-Prüfung der MappingProfileRegistry die Teil-Mappings akzeptiert.
 */
export function buildMappingProfileXmi(
  providerName: string,
  setups: SensorMappingSetup[],
): ProfileResult {
  if (setups.length === 0) throw new Error('Kein Nachrichtentyp für das Profil vorhanden');
  const profileId = slug(providerName);
  const profileFileName = `${profileId}-profile.xmi`;

  // Union: Service → Resource-Id → {type, unit, name, count}
  interface ProfileResource {
    name: string;
    unit?: string;
    type: EClassifier;
    count: number;
  }
  const services = new Map<string, { name: string; resources: Map<string, ProfileResource> }>();
  for (const setup of setups) {
    for (const m of setup.measurements) {
      if (!m.selected || !pathSegments(m.valuePath).length) continue;
      const group = slug(m.serviceGroup || 'data');
      const service = services.get(group) ?? {
        name: m.serviceGroup || group,
        resources: new Map<string, ProfileResource>(),
      };
      const rid = resourceIdOf(m);
      const existing = service.resources.get(rid);
      if (existing) {
        existing.count++;
        if (!existing.unit && m.unit) existing.unit = m.unit;
      } else {
        service.resources.set(rid, {
          name: m.label || rid,
          unit: m.unit || undefined,
          type: resolveEType(m),
          count: 1,
        });
      }
      services.set(group, service);
    }
  }

  const requiresFriendlyName = setups.some(
    (s) => s.friendlyNameSource && s.friendlyNameSource !== FriendlyNameSource.NONE,
  );
  const requiresLocation = setups.some(
    (s) => s.location && s.location.mode !== LocationMode.NONE,
  );

  const rs = newResourceSet();
  const resource = rs.createResource(URI.createURI(profileFileName));
  const profile = create('MappingProfile');
  resource.getContents().add(profile);
  set(profile, 'profileId', profileId);
  set(profile, 'name', providerName);
  set(
    profile,
    'description',
    `Gemeinsamer Provider aus ${setups.length} Nachrichtentyp(en), erzeugt vom SensiNact-Mapping-Assistenten.`,
  );
  setEnum(profile, 'providerStrategy', 'UNIFIED');

  const provider = create('ProfileProvider');
  set(provider, 'providerId', profileId);
  for (const [serviceId, service] of services) {
    const profileService = create('ProfileService');
    set(profileService, 'serviceId', serviceId);
    set(profileService, 'serviceName', service.name);
    for (const [rid, r] of service.resources) {
      const profileResource = create('ProfileResource');
      set(profileResource, 'resourceId', rid);
      set(profileResource, 'resourceName', r.name);
      set(profileResource, 'expectedUnit', r.unit);
      // Nur Resources, die JEDER Nachrichtentyp liefert, sind verpflichtend
      if (r.count < setups.length) set(profileResource, 'required', false);
      set(profileResource, 'expectedType', r.type);
      addAll(profileService, 'resources', [profileResource]);
    }
    addAll(provider, 'services', [profileService]);
  }
  const admin = create('ProfileAdmin');
  set(admin, 'serviceId', 'admin');
  set(admin, 'serviceName', 'Admin');
  if (requiresFriendlyName) set(admin, 'requiresFriendlyName', true);
  if (requiresLocation) set(admin, 'requiresLocation', true);
  set(provider, 'admin', admin);
  set(profile, 'provider', provider);

  return { profileXmi: serialize(resource), profileFileName, profileId };
}
