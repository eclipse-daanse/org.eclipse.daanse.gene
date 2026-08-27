/**
 * Transformer: Wizard-Fassadenmodell (SensorMappingSetup) →
 * SensiNact-ProviderMapping-XMI (Metamodell event-atlas-mapping.ecore,
 * nsURI https://fennec.eclipse.org/event.atlas/mapping/1.0).
 *
 * Das XMI wird direkt erzeugt (kein generischer Serializer), aus zwei Gründen:
 *  - Die hrefs müssen nsURI-basiert sein (z. B.
 *    "https://eclipse.org/fennec/lorawan#//UplinkMessage/time"), damit die
 *    Java-Seite sie über die EPackage-Registry auflöst — hochgeladene
 *    Sensor-Modelle haben keinen stabilen Dateipfad.
 *  - featurePath/valueFeature/unitFeature/*Ref brauchen zwingend
 *    xsi:type="ecore:EAttribute|EReference" (deklarierter Typ ist das
 *    abstrakte EStructuralFeature) — siehe sensinact-mapping-user-guide.md.
 *
 * Konformanz wird über Golden-/Round-Trip-Tests abgesichert
 * (test/toProviderMapping.test.ts).
 */
import type { EClass, EClassifier, EDataType, EReference, EStructuralFeature } from '@emfts/core';
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

export const MAPPING_NS_URI = 'https://fennec.eclipse.org/event.atlas/mapping/1.0';
const ECORE_NS_URI = 'http://www.eclipse.org/emf/2002/Ecore';

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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isReference(f: EStructuralFeature): f is EReference {
  return typeof (f as EReference).isContainment === 'function';
}

/** nsURI-basierter href auf ein Feature — zeigt auf die DEKLARIERENDE Klasse. */
function featureHref(f: EStructuralFeature): string {
  const owner = f.getEContainingClass();
  const pkg = owner?.getEPackage();
  if (!owner || !pkg?.getNsURI()) {
    throw new Error(`Feature ${f.getName()} hat keine auflösbare deklarierende Klasse/Package`);
  }
  return `${pkg.getNsURI()}#//${owner.getName()}/${f.getName()}`;
}

function classifierHref(c: EClassifier): string {
  const pkg = c.getEPackage();
  if (!pkg?.getNsURI()) throw new Error(`Klassifizierer ${c.getName()} hat kein Package mit nsURI`);
  return `${pkg.getNsURI()}#//${c.getName()}`;
}

function featureXsiType(f: EStructuralFeature): string {
  return isReference(f) ? 'ecore:EReference' : 'ecore:EAttribute';
}

/** Pfad-Segmente als Kind-Elemente (featurePath, valueFeature, *Ref …). */
function pathElements(tag: string, path: FeaturePath, indent: string): string[] {
  return path.segments.map(
    (seg: EStructuralFeature) =>
      `${indent}<${tag} xsi:type="${featureXsiType(seg)}" href="${escapeXml(featureHref(seg))}"/>`,
  );
}

/**
 * Ziel-EDataType eines Messwerts: explizite Wahl > Quelltyp (falls Ecore-Typ) >
 * kanonischer Typ nach Wertart.
 */
function resolveETypeHref(m: Measurement): string {
  const explicit = m.targetType as EDataType | undefined;
  if (explicit?.getEPackage()?.getNsURI()) {
    return classifierHref(explicit);
  }
  const last = m.valuePath?.segments[m.valuePath.segments.length - 1];
  const sourceType = last && !isReference(last) ? (last.getEType() as EDataType | null) : null;
  if (sourceType?.getEPackage()?.getNsURI() === ECORE_NS_URI) {
    return classifierHref(sourceType);
  }
  switch (classifyDataType(sourceType)) {
    case 'NUMERIC':
      return `${ECORE_NS_URI}#//EDouble`;
    case 'BOOLEAN':
      return `${ECORE_NS_URI}#//EBoolean`;
    case 'TEMPORAL':
      return `${ECORE_NS_URI}#//EDate`;
    default:
      return `${ECORE_NS_URI}#//EString`;
  }
}

/** Persistenz-Presets → Regel-Definitionen mit stabilen ids. */
const CHANGE_RULES: Partial<Record<StoragePreset, { id: string; xml: string }>> = {
  [StoragePreset.CHANGED_5_PERCENT]: {
    id: 'change-5-percent',
    xml: '<changeRules xsi:type="mapping:PercentageChangeRule" id="change-5-percent" name="Nur bei Änderung ab 5 %" percentage="5.0"/>',
  },
  [StoragePreset.MAX_ONCE_10MIN]: {
    id: 'throttle-10min',
    xml: '<changeRules xsi:type="mapping:TimeThrottleChangeRule" id="throttle-10min" name="Höchstens alle 10 Minuten" interval="10" intervalUnit="MINUTES"/>',
  },
};
const DELETION_RULES: Partial<Record<RetentionPreset, { id: string; xml: string }>> = {
  [RetentionPreset.DAYS_90]: {
    id: 'keep-90-days',
    xml: '<deletionRules id="keep-90-days" name="90 Tage aufbewahren" retention="90" retentionUnit="DAYS" cleanupInterval="1" cleanupIntervalUnit="DAYS"/>',
  },
  [RetentionPreset.YEAR_1]: {
    id: 'keep-1-year',
    xml: '<deletionRules id="keep-1-year" name="1 Jahr aufbewahren" retention="365" retentionUnit="DAYS" cleanupInterval="7" cleanupIntervalUnit="DAYS"/>',
  },
};

/** Basis-Resource-Id eines Messwerts (identisch in Mapping und Profil). */
function resourceIdOf(m: Measurement): string {
  const last = m.valuePath.segments[m.valuePath.segments.length - 1];
  return slug(m.label || last?.getName() || 'value');
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
  const sensorPkg = sensorClass.getEPackage();
  if (!sensorPkg?.getNsURI()) throw new Error('Die Sensorklasse hat kein Package mit nsURI');

  const measurements = setup.measurements.filter((m) => m.selected && m.valuePath?.segments.length);
  if (measurements.length === 0) {
    throw new Error('Es wurde kein Messwert ausgewählt');
  }

  // Welche Regeln werden gebraucht?
  const usedChangeRules = new Map<string, string>();
  const usedDeletionRules = new Map<string, string>();
  for (const m of measurements) {
    const cr = CHANGE_RULES[m.storagePreset as StoragePreset];
    if (cr) usedChangeRules.set(cr.id, cr.xml);
    const dr = DELETION_RULES[m.retentionPreset as RetentionPreset];
    if (dr) usedDeletionRules.set(dr.id, dr.xml);
  }
  const hasRules = usedChangeRules.size > 0 || usedDeletionRules.size > 0;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<mapping:ProviderMapping`);
  lines.push(`    xmi:version="2.0"`);
  lines.push(`    xmlns:xmi="http://www.omg.org/XMI"`);
  lines.push(`    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`);
  lines.push(`    xmlns:ecore="${ECORE_NS_URI}"`);
  lines.push(`    xmlns:mapping="${MAPPING_NS_URI}"`);
  lines.push(`    mid="${escapeXml(mid)}">`);

  // Provider-Zeitstempel — Resources referenzieren ihn per Fragment (//@timestamp).
  const ts = setup.timestamp;
  if (ts?.source === TimestampSource.DEVICE_TIME && ts.path?.segments.length) {
    const hint = ts.formatHint ? ` hint="${escapeXml(ts.formatHint)}"` : '';
    const idx = ts.path.collectionIndex ? ` collectionIndex="${ts.path.collectionIndex}"` : '';
    lines.push(`  <timestamp strategy="FEATURE"${hint}${idx}>`);
    lines.push(...pathElements('featurePath', ts.path, '    '));
    lines.push(`  </timestamp>`);
  } else {
    lines.push(`  <timestamp strategy="NOW"/>`);
  }

  // Provider-Name: entweder Feldwert ODER fester Text (nameSource).
  const useNameField = setup.nameSource !== NameSource.STATIC;
  const fallback = !useNameField && setup.nameFallback ? ` name="${escapeXml(setup.nameFallback)}"` : '';
  if (useNameField && setup.namePath?.segments.length) {
    const idx = setup.namePath.collectionIndex
      ? ` collectionIndex="${setup.namePath.collectionIndex}"`
      : '';
    lines.push(`  <name${fallback}${idx}>`);
    lines.push(...pathElements('featurePath', setup.namePath, '    '));
    lines.push(`  </name>`);
  } else if (fallback) {
    lines.push(`  <name${fallback}/>`);
  } else {
    throw new Error(
      useNameField
        ? 'Es wurde kein Feld für den Namen des Sensors gewählt'
        : 'Es wurde kein fester Name für den Sensor angegeben',
    );
  }

  lines.push(`  <providerClasses href="${escapeXml(classifierHref(sensorClass))}"/>`);

  // Messwerte, gruppiert nach serviceGroup → je ein Service.
  const groups = new Map<string, Measurement[]>();
  for (const m of measurements) {
    const group = slug(m.serviceGroup || 'data');
    const list = groups.get(group) ?? [];
    list.push(m);
    groups.set(group, list);
  }
  const usedResourceIds = new Set<string>();
  for (const [group, ms] of groups) {
    lines.push(`  <services mid="${escapeXml(group)}">`);
    lines.push(`    <name name="${escapeXml(ms[0].serviceGroup || group)}"/>`);
    for (const m of ms) {
      let rid = resourceIdOf(m);
      while (usedResourceIds.has(`${group}/${rid}`)) rid = `${rid}-2`;
      usedResourceIds.add(`${group}/${rid}`);

      if (m.valuePath.segments.some((s: EStructuralFeature) => s.isMany())) {
        warnings.push(
          `Messwert "${m.label ?? rid}": Der Pfad durchquert eine Sammlung — es wird immer das erste Element verwendet.`,
        );
      }

      // Dynamische Einheit (unitFeature) hat Vorrang vor der statischen.
      const hasUnitPath = !!m.unitPath?.segments.length;
      const unit = !hasUnitPath && m.unit ? ` unit="${escapeXml(m.unit)}"` : '';
      const label = m.label ? ` name="${escapeXml(m.label)}"` : '';
      lines.push(`    <resources${label}${unit} timestamp="//@timestamp" mid="${escapeXml(rid)}">`);
      lines.push(`      <eType xsi:type="ecore:EDataType" href="${escapeXml(resolveETypeHref(m))}"/>`);
      lines.push(...pathElements('valueFeature', m.valuePath, '      '));
      if (hasUnitPath) {
        lines.push(...pathElements('unitFeature', m.unitPath!, '      '));
      }
      const cr = CHANGE_RULES[m.storagePreset as StoragePreset];
      if (cr) lines.push(`      <changeRule href="${escapeXml(rulesFileName)}#${cr.id}"/>`);
      const dr = DELETION_RULES[m.retentionPreset as RetentionPreset];
      if (dr) lines.push(`      <deletionRule href="${escapeXml(rulesFileName)}#${dr.id}"/>`);
      lines.push(`    </resources>`);
    }
    lines.push(`  </services>`);
  }

  // Admin-Service: Anzeigename, Standort, Quell-Package.
  // Anzeigename: keiner, aus einem Feld ODER fester Text (friendlyNameSource).
  const staticFriendly =
    setup.friendlyNameSource === FriendlyNameSource.STATIC && setup.friendlyName
      ? ` friendlyName="${escapeXml(setup.friendlyName)}"`
      : '';
  lines.push(`  <admin mid="admin"${staticFriendly}>`);
  lines.push(`    <name name="Admin"/>`);
  if (
    setup.friendlyNameSource === FriendlyNameSource.FROM_FIELD &&
    setup.friendlyNamePath?.segments.length
  ) {
    lines.push(...pathElements('friendlyNameFeature', setup.friendlyNamePath, '    '));
  }
  const loc = setup.location;
  if (loc?.mode === LocationMode.STATIC) {
    const parts: string[] = [];
    if (Number.isFinite(loc.latitude)) parts.push(`latitude="${loc.latitude}"`);
    if (Number.isFinite(loc.longitude)) parts.push(`longitude="${loc.longitude}"`);
    if (Number.isFinite(loc.elevation)) parts.push(`elevation="${loc.elevation}"`);
    if (parts.length) {
      // statische Koordinaten sind Attribute des admin-Elements
      const adminOpen = lines.lastIndexOf(`  <admin mid="admin"${staticFriendly}>`);
      lines[adminOpen] = `  <admin mid="admin"${staticFriendly} ${parts.join(' ')}>`;
    }
  } else if (loc?.mode === LocationMode.FROM_DATA) {
    if (loc.latitudePath?.segments.length) lines.push(...pathElements('latitudeRef', loc.latitudePath, '    '));
    if (loc.longitudePath?.segments.length) lines.push(...pathElements('longitudeRef', loc.longitudePath, '    '));
    if (loc.elevationPath?.segments.length) lines.push(...pathElements('elevationRef', loc.elevationPath, '    '));
  }
  lines.push(`    <providerPackage href="${escapeXml(sensorPkg.getNsURI()!)}#/"/>`);
  lines.push(`  </admin>`);

  // Gemeinsamer Provider über mehrere Nachrichtentypen: Referenz auf das
  // MappingProfile (providerStrategy=UNIFIED, siehe buildMappingProfileXmi).
  if (options.profile) {
    lines.push(
      `  <profile href="${escapeXml(options.profile.fileName)}#${escapeXml(options.profile.profileId)}"/>`,
    );
  }

  lines.push(`</mapping:ProviderMapping>`);

  const result: TransformResult = {
    mappingXmi: lines.join('\n') + '\n',
    mappingFileName,
    warnings,
  };

  if (hasRules) {
    const ruleLines: string[] = [];
    ruleLines.push('<?xml version="1.0" encoding="UTF-8"?>');
    ruleLines.push(`<mapping:PersistenceRuleRegistry`);
    ruleLines.push(`    xmi:version="2.0"`);
    ruleLines.push(`    xmlns:xmi="http://www.omg.org/XMI"`);
    ruleLines.push(`    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`);
    ruleLines.push(`    xmlns:mapping="${MAPPING_NS_URI}">`);
    for (const xml of usedChangeRules.values()) ruleLines.push(`  ${xml}`);
    for (const xml of usedDeletionRules.values()) ruleLines.push(`  ${xml}`);
    ruleLines.push(`</mapping:PersistenceRuleRegistry>`);
    result.rulesXmi = ruleLines.join('\n') + '\n';
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

  // Union: Service → Resource-Id → {typeHref, unit, name, count}
  interface ProfileResource {
    name: string;
    unit?: string;
    typeHref: string;
    count: number;
  }
  const services = new Map<string, { name: string; resources: Map<string, ProfileResource> }>();
  for (const setup of setups) {
    for (const m of setup.measurements) {
      if (!m.selected || !m.valuePath?.segments.length) continue;
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
          typeHref: resolveETypeHref(m),
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

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<mapping:MappingProfile`);
  lines.push(`    xmi:version="2.0"`);
  lines.push(`    xmlns:xmi="http://www.omg.org/XMI"`);
  lines.push(`    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`);
  lines.push(`    xmlns:mapping="${MAPPING_NS_URI}"`);
  lines.push(`    profileId="${escapeXml(profileId)}"`);
  lines.push(`    name="${escapeXml(providerName)}"`);
  lines.push(`    description="Gemeinsamer Provider aus ${setups.length} Nachrichtentyp(en), erzeugt vom SensiNact-Mapping-Assistenten."`);
  lines.push(`    providerStrategy="UNIFIED">`);
  lines.push(`  <provider providerId="${escapeXml(profileId)}">`);
  for (const [serviceId, service] of services) {
    lines.push(`    <services serviceId="${escapeXml(serviceId)}" serviceName="${escapeXml(service.name)}">`);
    for (const [rid, resource] of service.resources) {
      const unit = resource.unit ? ` expectedUnit="${escapeXml(resource.unit)}"` : '';
      // Nur Resources, die JEDER Nachrichtentyp liefert, sind verpflichtend.
      const required = resource.count < setups.length ? ' required="false"' : '';
      lines.push(
        `      <resources resourceId="${escapeXml(rid)}" resourceName="${escapeXml(resource.name)}"${unit}${required}>`,
      );
      lines.push(`        <expectedType href="${escapeXml(resource.typeHref)}"/>`);
      lines.push(`      </resources>`);
    }
    lines.push(`    </services>`);
  }
  lines.push(
    `    <admin serviceId="admin" serviceName="Admin"${requiresFriendlyName ? ' requiresFriendlyName="true"' : ''}${requiresLocation ? ' requiresLocation="true"' : ''}/>`,
  );
  lines.push(`  </provider>`);
  lines.push(`</mapping:MappingProfile>`);

  return { profileXmi: lines.join('\n') + '\n', profileFileName, profileId };
}
