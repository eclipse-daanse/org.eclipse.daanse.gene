/**
 * Rück-Transformer: SensiNact-`ProviderMapping`-XMI → Wizard-Fassadenmodell
 * (`SensorMappingSetup`). Gegenstück zu toProviderMapping.ts — damit ein
 * bereits veröffentlichtes Mapping wieder geöffnet, geändert und
 * zurückgeschrieben werden kann (T19/#190).
 *
 * Gelesen wird reflektiv über das dynamisch geladene Mapping-Metamodell: Der
 * emf.ts-XMI-Loader löst nsURI-basierte hrefs über die EPackage-Registry auf,
 * sodass `valueFeature` & Co. als echte EStructuralFeatures ankommen.
 *
 * Referenzen kommen in zwei Serialisierungen vor — als Kind-Element mit
 * `href` (so schreibt der Assistent, so stehen die Beispiele im User-Guide)
 * und als Attribut-Kurzform (`valueFeature="ecore:EAttribute nsURI#//X/y"`, so
 * serialisiert Java-EMF). Beide werden gelesen.
 *
 * Zwei Formen von Dokument-Referenzen müssen unterstützt werden:
 *  - nsURI-basiert (`https://…/lorawan#//UplinkMessage/time`) — so schreibt
 *    der Assistent, so braucht es die Runtime für Atlas-Objekte;
 *  - dateipfad-basiert (`../../lorawan-uplink.ecore#//UplinkMessage/time`) —
 *    so liegen die handgeschriebenen Beispiele in emf.util. Diese werden vor
 *    dem Laden anhand der registrierten Packages auf nsURIs umgeschrieben
 *    (`rewriteEcoreFileHrefs`), weil die Dateien selbst nicht vorliegen.
 */
import type {
  EClass,
  EClassifier,
  EDataType,
  EObject,
  EPackage,
  EStructuralFeature,
  XMIResource,
} from '@emfts/core';
import { EPackageRegistry, URI } from '@emfts/core';
import { newResourceSet } from '../emf/setup';
import { suggestMeasurementPaths } from '../emf/featurePaths';
import type { FeaturePath, Measurement, SensorMappingSetup } from '../generated';
import {
  MappingwizardFactory,
  FriendlyNameSource,
  LocationMode,
  NameSource,
  RetentionPreset,
  StoragePreset,
  TimestampSource,
} from '../generated';

const ECORE_NS_URI = 'http://www.eclipse.org/emf/2002/Ecore';

// ---------------------------------------------------------------------------
// Analyse (ohne Modell) — welche Dokumente braucht dieses Mapping?
// ---------------------------------------------------------------------------

export interface MappingAnalysis {
  /** Wurzel-Element, z. B. „ProviderMapping" oder „MappingProfile". */
  rootType: string;
  /** mid des Mappings (leer, wenn keins). */
  mid: string;
  /** Referenzierte Modelle als nsURI — per Atlas nachladbar. */
  nsUris: string[];
  /** Referenzierte .ecore-Dateien (Dateipfad-hrefs, nicht nachladbar). */
  ecoreFiles: string[];
  /** Nachbar-Artefakte (.xmi): Profil, Persistenz-Regeln. */
  xmiFiles: string[];
}

/**
 * Alle Referenz-Tokens eines XMI: Werte von `href` und von Attributen der
 * EMF-Kurzform. Mehrwertige Referenzen sind leerzeichengetrennt, ein
 * vorangestellter `prefix:Type` gehört nicht dazu (enthält kein `#`).
 */
function* referenceTokens(xmi: string): Generator<string> {
  for (const match of xmi.matchAll(/\s([A-Za-z_][\w.:-]*)="([^"]*)"/g)) {
    const [, name, value] = match;
    if (name.startsWith('xmlns') || name === 'xsi:schemaLocation') continue;
    if (!value.includes('#')) continue;
    for (const token of value.split(/\s+/)) {
      if (token.includes('#')) yield token.trim();
    }
  }
}

/** Zerlegt einen href in Dokument-URI und Fragment. */
function splitHref(href: string): { document: string; fragment: string } {
  const hash = href.indexOf('#');
  if (hash < 0) return { document: href, fragment: '' };
  return { document: href.slice(0, hash), fragment: href.slice(hash + 1) };
}

/**
 * Sammelt die Fremd-Dokumente eines Mapping-XMI, getrennt nach Art.
 * Rein textuell, damit die UI VOR dem Laden weiß, was sie nachladen muss.
 */
export function analyzeMappingXmi(xmi: string): MappingAnalysis {
  const nsUris = new Set<string>();
  const ecoreFiles = new Set<string>();
  const xmiFiles = new Set<string>();

  for (const token of referenceTokens(xmi)) {
    const { document } = splitHref(token);
    if (!document || document === ECORE_NS_URI) continue;
    if (/^\w+:\/\//.test(document)) {
      nsUris.add(document);
    } else if (document.endsWith('.ecore')) {
      ecoreFiles.add(document);
    } else if (document.endsWith('.xmi')) {
      xmiFiles.add(document);
    }
  }

  const rootMatch = xmi.match(/<(?:\w+:)?(ProviderMapping|MappingProfile|PersistenceRuleRegistry)\b/);
  const midMatch = xmi.match(/<(?:\w+:)?ProviderMapping\b[^>]*?\bmid="([^"]*)"/s);
  return {
    rootType: rootMatch?.[1] ?? '',
    mid: midMatch?.[1] ?? '',
    nsUris: [...nsUris],
    ecoreFiles: [...ecoreFiles],
    xmiFiles: [...xmiFiles],
  };
}

/**
 * Welche Klassifizierer werden über welche `.ecore`-Datei referenziert?
 * Grundlage, um das passende Modell im Atlas zu finden, wenn ein Mapping nur
 * Dateipfade nennt (die Atlas-Suche kennt `classifier`).
 */
export function referencedClassifiers(xmi: string): Record<string, string[]> {
  const result: Record<string, Set<string>> = {};
  for (const token of referenceTokens(xmi)) {
    const { document, fragment } = splitHref(token);
    if (!document.endsWith('.ecore') || /^\w+:\/\//.test(document)) continue;
    const name = fragment.replace(/^\/\//, '').split('/').filter(Boolean)[0];
    if (!name) continue;
    (result[document] ??= new Set()).add(name);
  }
  return Object.fromEntries(Object.entries(result).map(([key, set]) => [key, [...set]]));
}

// ---------------------------------------------------------------------------
// Dateipfad-hrefs auf nsURIs umschreiben
// ---------------------------------------------------------------------------

/** Kandidaten-Packages: explizit übergebene zuerst, danach die Registry. */
function candidatePackages(extra: EPackage[] = []): EPackage[] {
  const seen = new Set<string>();
  const result: EPackage[] = [];
  const add = (pkg: EPackage | null | undefined): void => {
    const nsUri = pkg?.getNsURI();
    if (!pkg || !nsUri || nsUri === ECORE_NS_URI || seen.has(nsUri)) return;
    seen.add(nsUri);
    result.push(pkg);
  };
  for (const pkg of extra) add(pkg);
  const registry = EPackageRegistry.INSTANCE as unknown as {
    keys?: () => Iterable<string>;
    get(nsUri: string): EPackage | null;
  };
  if (typeof registry.keys === 'function') {
    for (const nsUri of registry.keys()) add(registry.get(nsUri));
  }
  return result;
}

/** Löst ein Ecore-Fragment (`//Klasse`, `//Klasse/feature`) in einem Package auf. */
function resolveFragment(pkg: EPackage, fragment: string): EObject | undefined {
  const parts = fragment.replace(/^\/\//, '').split('/').filter(Boolean);
  if (parts.length === 0) return pkg as unknown as EObject;
  const classifier = pkg.getEClassifier(parts[0]) as EClassifier | null;
  if (!classifier) return undefined;
  if (parts.length === 1) return classifier as unknown as EObject;
  const eClass = classifier as EClass;
  if (typeof eClass.getEStructuralFeature !== 'function') return undefined;
  const feature = eClass.getEStructuralFeature(parts[1]);
  return (feature as unknown as EObject) ?? undefined;
}

/**
 * Entfernt die xsi:type-Kurzform aus Referenz-Attributen:
 * `valueFeature="ecore:EAttribute nsURI#//X/y"` → `valueFeature="nsURI#//X/y"`.
 *
 * Notwendig, weil der emf.ts-Loader den Wert an Leerzeichen zerlegt und
 * `ecore:EAttribute` als eigene (unauflösbare) Referenz behandelt — der Typ
 * steckt ohnehin im Ziel. Java-EMF serialisiert Referenzen so, der Assistent
 * selbst schreibt href-Kindelemente (die bleiben unangetastet).
 */
export function stripReferenceTypePrefixes(xmi: string): string {
  return xmi.replace(/\s([A-Za-z_][\w.:-]*)="([^"]*)"/g, (whole, name: string, value: string) => {
    if (name.startsWith('xmlns') || name === 'xsi:schemaLocation' || !value.includes('#')) {
      return whole;
    }
    const uris = value.trim().split(/\s+/).filter((token) => token.includes('#'));
    const cleaned = uris.join(' ');
    return cleaned === value ? whole : ` ${name}="${cleaned}"`;
  });
}

export interface RewriteResult {
  xmi: string;
  /** Zuordnung Dateiname → nsURI, die angewendet wurde. */
  rewritten: Record<string, string>;
  /** Dateien, für die kein passendes Package gefunden wurde. */
  unresolved: string[];
}

/**
 * Ersetzt dateipfad-basierte hrefs auf `.ecore`-Dokumente durch nsURI-hrefs,
 * indem das Fragment in den bekannten Packages gesucht wird. So lassen sich
 * auch die handgeschriebenen emf.util-Beispiele öffnen, deren Dateien im
 * Browser nicht vorliegen.
 */
export function rewriteEcoreFileHrefs(xmi: string, extraPackages: EPackage[] = []): RewriteResult {
  const { ecoreFiles } = analyzeMappingXmi(xmi);
  if (ecoreFiles.length === 0) return { xmi, rewritten: {}, unresolved: [] };

  const packages = candidatePackages(extraPackages);
  const rewritten: Record<string, string> = {};
  const unresolved: string[] = [];

  for (const file of ecoreFiles) {
    // Alle Fragmente, die über diese Datei referenziert werden.
    const fragments = new Set<string>();
    for (const token of referenceTokens(xmi)) {
      const { document, fragment } = splitHref(token);
      if (document === file && fragment) fragments.add(fragment);
    }
    const matching = packages.filter((pkg) =>
      [...fragments].every((fragment) => fragment === '/' || !!resolveFragment(pkg, fragment)),
    );
    const target = matching[0]?.getNsURI();
    if (!target) {
      unresolved.push(file);
      continue;
    }
    rewritten[file] = target;
  }

  let result = xmi;
  for (const [file, nsUri] of Object.entries(rewritten)) {
    // Gilt für beide Serialisierungen: href="datei#…" wie auch
    // valueFeature="ecore:EAttribute datei#…".
    result = result.replaceAll(`${file}#`, `${nsUri}#`);
  }
  return { xmi: result, rewritten, unresolved };
}

// ---------------------------------------------------------------------------
// Reflektive Lesehilfen
// ---------------------------------------------------------------------------

/**
 * Unauflösbare Referenzen kommen als Proxy zurück (z. B. eine Regel, deren
 * Datei nicht mitgeladen wurde). Ein Feature-Zugriff darauf wirft — dafür
 * steht der ursprüngliche href über `eProxyURI()` zur Verfügung.
 */
function isProxy(obj: EObject | undefined): boolean {
  const candidate = obj as unknown as { eIsProxy?: () => boolean } | undefined;
  return typeof candidate?.eIsProxy === 'function' && candidate.eIsProxy();
}

/** Fragment des Proxy-hrefs, z. B. „change-5-percent". */
function proxyFragment(obj: EObject): string {
  const candidate = obj as unknown as { eProxyURI?: () => { toString(): string } | null };
  const href = candidate.eProxyURI?.()?.toString() ?? '';
  const hash = href.indexOf('#');
  return hash < 0 ? '' : href.slice(hash + 1);
}

function eget(obj: EObject, featureName: string): unknown {
  if (isProxy(obj)) return undefined;
  const feature = obj.eClass()?.getEStructuralFeature(featureName);
  return feature ? obj.eGet(feature) : undefined;
}

function egetString(obj: EObject, featureName: string): string {
  const value = eget(obj, featureName);
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  const named = value as { getName?: () => string };
  return typeof named.getName === 'function' ? named.getName() : String(value);
}

function egetNumber(obj: EObject, featureName: string): number | undefined {
  const value = eget(obj, featureName);
  if (value === null || value === undefined || value === '') return undefined;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function egetList(obj: EObject, featureName: string): EObject[] {
  const value = eget(obj, featureName);
  if (!value) return [];
  return Array.from(value as Iterable<EObject>);
}

function egetFeatures(obj: EObject, featureName: string): EStructuralFeature[] {
  return egetList(obj, featureName) as unknown as EStructuralFeature[];
}

/** Enum-Literale kommen je nach Package-Herkunft als Objekt oder String. */
function enumName(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  const named = value as { getName?: () => string; getLiteral?: () => string };
  if (typeof named.getName === 'function') return named.getName();
  if (typeof named.getLiteral === 'function') return named.getLiteral();
  return String(value);
}

// ---------------------------------------------------------------------------
// Presets aus Persistenz-Regeln zurückgewinnen
// ---------------------------------------------------------------------------

/**
 * Erst über die stabilen Regel-Ids des Assistenten, dann über die Semantik —
 * so werden auch von Hand geschriebene Regeln erkannt, solange sie einem
 * Preset entsprechen.
 */
/** Sprechende Bezeichnung einer Regel — auch wenn sie nur als Proxy vorliegt. */
function ruleLabel(rule: EObject): string {
  if (isProxy(rule)) return proxyFragment(rule) || 'unbekannt';
  return egetString(rule, 'id') || rule.eClass()?.getName() || 'unbenannt';
}

function storagePresetOf(rule: EObject): StoragePreset | undefined {
  // Regel-Datei nicht mitgeladen: die Id steht im href-Fragment.
  const id = isProxy(rule) ? proxyFragment(rule) : egetString(rule, 'id');
  if (id === 'change-5-percent') return StoragePreset.CHANGED_5_PERCENT;
  if (id === 'throttle-10min') return StoragePreset.MAX_ONCE_10MIN;
  const kind = rule.eClass()?.getName();
  if (kind === 'PercentageChangeRule' && egetNumber(rule, 'percentage') === 5) {
    return StoragePreset.CHANGED_5_PERCENT;
  }
  if (
    kind === 'TimeThrottleChangeRule' &&
    egetNumber(rule, 'interval') === 10 &&
    enumName(eget(rule, 'intervalUnit')) === 'MINUTES'
  ) {
    return StoragePreset.MAX_ONCE_10MIN;
  }
  return undefined;
}

function retentionPresetOf(rule: EObject): RetentionPreset | undefined {
  const id = isProxy(rule) ? proxyFragment(rule) : egetString(rule, 'id');
  if (id === 'keep-90-days') return RetentionPreset.DAYS_90;
  if (id === 'keep-1-year') return RetentionPreset.YEAR_1;
  const retention = egetNumber(rule, 'retention');
  if (enumName(eget(rule, 'retentionUnit')) === 'DAYS') {
    if (retention === 90) return RetentionPreset.DAYS_90;
    if (retention === 365) return RetentionPreset.YEAR_1;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Fassadenmodell rekonstruieren
// ---------------------------------------------------------------------------

export interface RestoreOptions {
  /**
   * Nachbar-Artefakte, damit deren hrefs auflösen: Persistenz-Regeln und
   * Profil. Schlüssel ist der Dateiname, wie er im href steht.
   */
  siblings?: { fileName: string; content: string }[];
  /** Zusätzliche Packages für die Datei-href-Heuristik. */
  packages?: EPackage[];
}

export interface RestoredMapping {
  setup: SensorMappingSetup;
  /** Profil-Bezug, wenn das Mapping zu einem gemeinsamen Provider gehört. */
  profile?: { fileName: string; profileId: string; name?: string };
  /** Was nicht (verlustfrei) abgebildet werden konnte. */
  warnings: string[];
}

function pathFrom(segments: EStructuralFeature[], collectionIndex = 0): FeaturePath | undefined {
  // Nicht aufgelöste Segmente (fehlendes Modell) würden das Fassadenmodell
  // unbrauchbar machen — der Pfad gilt dann als nicht vorhanden.
  const usable = segments.filter((s) => typeof s?.getName === 'function');
  if (usable.length === 0 || usable.length !== segments.length) return undefined;
  const path = MappingwizardFactory.eINSTANCE.createFeaturePath();
  path.segments.push(...usable);
  path.label = usable.map((s) => s.getName()).join(' → ');
  if (collectionIndex) path.collectionIndex = collectionIndex;
  return path;
}

/** Pfad-Identität über die Feature-Instanzen (dieselbe Registry). */
function sameSegments(a: EStructuralFeature[], b: EStructuralFeature[]): boolean {
  return a.length === b.length && a.every((f, i) => f === b[i]);
}

/**
 * Lädt ein ProviderMapping-XMI und baut das Fassadenmodell daraus auf.
 * Voraussetzung: Die referenzierten Sensormodelle sind registriert
 * (`analyzeMappingXmi().nsUris` vorher nachladen).
 */
export function restoreSetupFromMappingXmi(
  xmi: string,
  options: RestoreOptions = {},
): RestoredMapping {
  const warnings: string[] = [];
  const analysis = analyzeMappingXmi(xmi);
  if (analysis.rootType && analysis.rootType !== 'ProviderMapping') {
    throw new Error(
      `Das gewählte Objekt ist kein Sensor-Mapping, sondern „${analysis.rootType}".`,
    );
  }

  const rewrite = rewriteEcoreFileHrefs(xmi, options.packages ?? []);
  for (const file of rewrite.unresolved) {
    warnings.push(
      `Das Mapping verweist über einen Dateipfad auf „${file}" — dieses Modell ist hier nicht bekannt. ` +
        `Laden Sie es zuerst (Schritt 1), sonst fehlen die betroffenen Felder.`,
    );
  }

  // Gemeinsames ResourceSet: Nachbar-Artefakte zuerst, damit Regel-/Profil-
  // hrefs beim Laden des Mappings auflösen.
  const resourceSet = newResourceSet();
  const siblings = options.siblings ?? [];
  for (const sibling of siblings) {
    try {
      const resource = resourceSet.createResource(
        URI.createURI(sibling.fileName),
      ) as XMIResource;
      resource.loadFromString(sibling.content);
    } catch (error) {
      warnings.push(
        `„${sibling.fileName}" konnte nicht gelesen werden: ${(error as Error).message}`,
      );
    }
  }

  const resource = resourceSet.createResource(URI.createURI('opened-mapping.xmi')) as XMIResource;
  resource.loadFromString(stripReferenceTypePrefixes(rewrite.xmi));
  if (resource.getContents().isEmpty()) {
    // Häufigster Grund: Das Objekt nutzt ein anderes Mapping-Metamodell, als
    // der Assistent kennt (nsURI aus der Wurzel-Deklaration).
    const declared = xmi.match(/xmlns:\w+="(https?:[^"]*mapping[^"]*)"/i)?.[1];
    throw new Error(
      declared
        ? `Das Objekt konnte nicht gelesen werden: Es nutzt das Mapping-Metamodell „${declared}", das der Assistent nicht kennt.`
        : 'Das Objekt konnte nicht als Mapping gelesen werden (unbekanntes Format).',
    );
  }
  const root = resource.getContents().get(0) as unknown as EObject;

  const sensorClasses = egetList(root, 'providerClasses') as unknown as EClass[];
  const sensorClass = sensorClasses[0];
  if (!sensorClass || typeof sensorClass.getEPackage !== 'function') {
    throw new Error(
      'Die Sensorklasse des Mappings konnte nicht aufgelöst werden. ' +
        'Vermutlich fehlt das zugehörige Modell — laden Sie es in Schritt 1.',
    );
  }
  if (sensorClasses.length > 1) {
    warnings.push(
      `Das Mapping gilt für ${sensorClasses.length} Klassen; der Assistent arbeitet mit „${sensorClass.getName()}". ` +
        'Beim Speichern bleibt nur diese Klasse erhalten.',
    );
  }

  const f = MappingwizardFactory.eINSTANCE;
  const setup = f.createSensorMappingSetup();
  setup.mappingId = egetString(root, 'mid') || (sensorClass.getName() ?? 'mapping');
  setup.sensorClass = sensorClass;

  // --- Name des Sensors ---
  const nameMapping = eget(root, 'name') as EObject | undefined;
  const namePath = nameMapping ? egetFeatures(nameMapping, 'featurePath') : [];
  const staticName = nameMapping ? egetString(nameMapping, 'name') : '';
  if (namePath.length) {
    setup.nameSource = NameSource.FROM_FIELD;
    setup.namePath = pathFrom(namePath, nameMapping ? egetNumber(nameMapping, 'collectionIndex') ?? 0 : 0);
    setup.nameFallback = staticName;
    if (staticName) {
      // Der Assistent fragt „Feld ODER fester Text" — das Mapping kombiniert
      // beides. Der Text bleibt als Vorschlag erhalten, wird aber nicht
      // mitgeschrieben (siehe toProviderMapping: Entweder-Oder-Semantik).
      warnings.push(
        `Das Mapping enthält neben dem Namensfeld auch den festen Namen „${staticName}". ` +
          'Der Assistent verwendet nur das Feld — beim Speichern entfällt der feste Name.',
      );
    }
  } else {
    setup.nameSource = NameSource.STATIC;
    setup.nameFallback = staticName || (sensorClass.getName() ?? '');
  }

  // --- Zeitstempel ---
  const ts = f.createTimestampChoice();
  const tsMapping = eget(root, 'timestamp') as EObject | undefined;
  const tsStrategy = tsMapping ? enumName(eget(tsMapping, 'strategy')) : '';
  const tsPath = tsMapping ? egetFeatures(tsMapping, 'featurePath') : [];
  if (tsPath.length) {
    ts.source = TimestampSource.DEVICE_TIME;
    ts.path = pathFrom(tsPath, tsMapping ? egetNumber(tsMapping, 'collectionIndex') ?? 0 : 0);
    const hint = tsMapping ? egetString(tsMapping, 'hint') : '';
    if (hint) ts.formatHint = hint;
  } else {
    ts.source = TimestampSource.RECEIVE_TIME;
    if (tsStrategy === 'FUNCTION') {
      warnings.push(
        'Der Messzeitpunkt wird im Mapping über eine Java-Funktion bestimmt. ' +
          'Der Assistent kennt diese Variante nicht — beim Speichern wird die Empfangszeit verwendet.',
      );
    }
  }
  setup.timestamp = ts;

  // --- Admin: Anzeigename + Standort ---
  const admin = eget(root, 'admin') as EObject | undefined;
  const friendlyPath = admin ? egetFeatures(admin, 'friendlyNameFeature') : [];
  const friendlyStatic = admin ? egetString(admin, 'friendlyName') : '';
  if (friendlyPath.length) {
    setup.friendlyNameSource = FriendlyNameSource.FROM_FIELD;
    setup.friendlyNamePath = pathFrom(friendlyPath);
    if (friendlyStatic) setup.friendlyName = friendlyStatic;
  } else if (friendlyStatic) {
    setup.friendlyNameSource = FriendlyNameSource.STATIC;
    setup.friendlyName = friendlyStatic;
  } else {
    setup.friendlyNameSource = FriendlyNameSource.NONE;
  }

  const location = f.createLocationChoice();
  const latitude = admin ? egetNumber(admin, 'latitude') : undefined;
  const longitude = admin ? egetNumber(admin, 'longitude') : undefined;
  const elevation = admin ? egetNumber(admin, 'elevation') : undefined;
  const latRef = admin ? egetFeatures(admin, 'latitudeRef') : [];
  const lonRef = admin ? egetFeatures(admin, 'longitudeRef') : [];
  const elevRef = admin ? egetFeatures(admin, 'elevationRef') : [];
  if (latRef.length || lonRef.length || elevRef.length) {
    location.mode = LocationMode.FROM_DATA;
    if (latRef.length) location.latitudePath = pathFrom(latRef);
    if (lonRef.length) location.longitudePath = pathFrom(lonRef);
    if (elevRef.length) location.elevationPath = pathFrom(elevRef);
  } else if (latitude !== undefined || longitude !== undefined || elevation !== undefined) {
    location.mode = LocationMode.STATIC;
    if (latitude !== undefined) location.latitude = latitude;
    if (longitude !== undefined) location.longitude = longitude;
    if (elevation !== undefined) location.elevation = elevation;
  } else {
    location.mode = LocationMode.NONE;
  }
  setup.location = location;

  // --- Messwerte ---
  for (const service of egetList(root, 'services')) {
    const serviceNameMapping = eget(service, 'name') as EObject | undefined;
    const group =
      (serviceNameMapping ? egetString(serviceNameMapping, 'name') : '') ||
      egetString(service, 'mid') ||
      'data';
    if (egetList(service, 'temporaryResources').length) {
      warnings.push(
        `Der Service „${group}" enthält temporäre Resources — der Assistent kennt diese nicht, ` +
          'sie gehen beim Speichern verloren.',
      );
    }
    if (eget(service, 'referencedResource')) {
      warnings.push(
        `Der Service „${group}" nutzt einen Sammlungs-Selektor (referencedResource) — ` +
          'der Assistent kennt diese Variante nicht, sie geht beim Speichern verloren.',
      );
    }
    for (const resourceMapping of egetList(service, 'resources')) {
      const valuePath = egetFeatures(resourceMapping, 'valueFeature');
      if (valuePath.length === 0) {
        warnings.push(
          `Die Resource „${egetString(resourceMapping, 'mid')}" im Service „${group}" hat kein auflösbares Quellfeld ` +
            'und wird übersprungen.',
        );
        continue;
      }
      const measurementPath = pathFrom(valuePath);
      if (!measurementPath) {
        warnings.push(
          `Das Quellfeld der Resource „${egetString(resourceMapping, 'mid')}" im Service „${group}" ` +
            'ist nicht auflösbar (fehlendes Modell) — der Messwert wird übersprungen.',
        );
        continue;
      }
      const measurement = f.createMeasurement();
      measurement.selected = true;
      measurement.valuePath = measurementPath;
      measurement.label = egetString(resourceMapping, 'name') || egetString(resourceMapping, 'mid');
      measurement.serviceGroup = group;
      const unit = egetString(resourceMapping, 'unit');
      if (unit) measurement.unit = unit;
      const unitPath = egetFeatures(resourceMapping, 'unitFeature');
      if (unitPath.length) measurement.unitPath = pathFrom(unitPath);

      const eType = eget(resourceMapping, 'eType') as EClassifier | undefined;
      if (eType && typeof (eType as EDataType).getName === 'function') {
        measurement.targetType = eType as EDataType;
      }

      const changeRule = eget(resourceMapping, 'changeRule') as EObject | undefined;
      if (changeRule) {
        const preset = storagePresetOf(changeRule);
        if (preset) {
          measurement.storagePreset = preset;
        } else {
          warnings.push(
            `Die Speicher-Regel „${ruleLabel(changeRule)}" (Messwert „${measurement.label}") entspricht ` +
              'keiner Auswahl des Assistenten und geht beim Speichern verloren.',
          );
        }
      }
      const deletionRule = eget(resourceMapping, 'deletionRule') as EObject | undefined;
      if (deletionRule) {
        const preset = retentionPresetOf(deletionRule);
        if (preset) {
          measurement.retentionPreset = preset;
        } else {
          warnings.push(
            `Die Aufbewahrungs-Regel „${ruleLabel(deletionRule)}" (Messwert „${measurement.label}") entspricht ` +
              'keiner Auswahl des Assistenten und geht beim Speichern verloren.',
          );
        }
      }
      setup.measurements.push(measurement);
    }
  }

  // Nicht gemappte Felder als abgewählte Vorschläge ergänzen, damit sich
  // weitere Messwerte hinzufügen lassen (wie beim Neuanlegen).
  const existing = setup.measurements.map((m: Measurement) => m.valuePath.segments);
  for (const candidate of suggestMeasurementPaths(sensorClass)) {
    if (existing.some((segments) => sameSegments(segments, candidate.segments))) continue;
    const measurement = f.createMeasurement();
    measurement.selected = false;
    measurement.valuePath = pathFrom(candidate.segments)!;
    const last = candidate.segments[candidate.segments.length - 1];
    measurement.label = last.getName() ?? candidate.label;
    if (candidate.unit) measurement.unit = candidate.unit;
    setup.measurements.push(measurement);
  }

  // --- Profil-Bezug (gemeinsamer Provider) ---
  let profile: RestoredMapping['profile'];
  const profileHref =
    rewrite.xmi.match(/<profile[^>]*href="([^"]+)"/)?.[1] ??
    rewrite.xmi.match(/\sprofile="([^"]*#[^"]*)"/)?.[1];
  if (profileHref) {
    const { document, fragment } = splitHref(profileHref.trim().split(/\s+/).pop()!);
    const profileObject = eget(root, 'profile') as EObject | undefined;
    const resolved = profileObject && !isProxy(profileObject) ? profileObject : undefined;
    profile = {
      fileName: document,
      profileId: fragment || (resolved ? egetString(resolved, 'profileId') : ''),
      name: resolved ? egetString(resolved, 'name') : undefined,
    };
  }

  return { setup, profile, warnings };
}
