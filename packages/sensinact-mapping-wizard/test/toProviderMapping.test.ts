/**
 * Pfad-Enumeration + Transformer-Tests gegen die echten Sensor-Modelle aus
 * event.atlas (EM310UDL/LoRaWAN) und das Golden-File
 * em310udl-battery-mapping.xmi (strukturell, nicht byte-genau).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  BasicResourceSet,
  EPackageRegistry,
  registerEcorePackage,
  URI,
  XMIResourceFactory,
} from '@emfts/core';
import type { EClass, EObject, EPackage, EStructuralFeature, XMIResource } from '@emfts/core';
import { enumerateFeaturePaths, suggestMeasurementPaths } from '../src/emf/featurePaths';
import { buildMappingProfileXmi, buildProviderMappingXmi, MAPPING_NS_URI, slug } from '../src/transform/toProviderMapping';
import {
  MappingwizardFactory,
  MappingwizardPackage,
  StoragePreset,
  RetentionPreset,
  TimestampSource,
  LocationMode,
  NameSource,
  FriendlyNameSource,
} from '../src/generated';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

let rs: BasicResourceSet;
let uplinkClass: EClass;
let em310Pkg: EPackage;
let lorawanPkg: EPackage;
let mappingPkg: EPackage;

function loadXmiResource(resourceSet: BasicResourceSet, uri: string, content: string): XMIResource {
  const resource = resourceSet.createResource(URI.createURI(uri)) as XMIResource;
  resource.loadFromString(content);
  expect(resource.getContents().isEmpty(), `Resource ${uri} ist leer`).toBe(false);
  return resource;
}

function feature(eClass: EClass, name: string): EStructuralFeature {
  const f = eClass.getEStructuralFeature(name);
  if (!f) throw new Error(`Feature ${name} nicht gefunden auf ${eClass.getName()}`);
  return f;
}

function eget(obj: EObject, featureName: string): unknown {
  const f = obj.eClass().getEStructuralFeature(featureName);
  if (!f) throw new Error(`Feature ${featureName} fehlt auf ${obj.eClass().getName()}`);
  return obj.eGet(f);
}

function elist(value: unknown): EObject[] {
  return Array.from(value as Iterable<EObject>);
}

beforeAll(() => {
  registerEcorePackage();

  const wiz = MappingwizardPackage.eINSTANCE;
  wiz.setEFactoryInstance(MappingwizardFactory.eINSTANCE);
  EPackageRegistry.INSTANCE.set(wiz.getNsURI()!, wiz);

  rs = new BasicResourceSet();
  const xmiFactory = new XMIResourceFactory();
  rs.getResourceFactoryRegistry().getExtensionToFactoryMap().set('xmi', xmiFactory);
  rs.getResourceFactoryRegistry().getExtensionToFactoryMap().set('ecore', xmiFactory);

  // Reihenfolge wichtig: em310udl referenziert lorawan-uplink.ecore relativ.
  const lorawanRes = loadXmiResource(
    rs,
    'lorawan-uplink.ecore',
    readFileSync(path.join(FIXTURES, 'lorawan-uplink.ecore'), 'utf-8'),
  );
  lorawanPkg = lorawanRes.getContents().get(0) as unknown as EPackage;
  EPackageRegistry.INSTANCE.set(lorawanPkg.getNsURI()!, lorawanPkg);

  const em310Res = loadXmiResource(
    rs,
    'em310udl-message.ecore',
    readFileSync(path.join(FIXTURES, 'em310udl-message.ecore'), 'utf-8'),
  );
  em310Pkg = em310Res.getContents().get(0) as unknown as EPackage;
  EPackageRegistry.INSTANCE.set(em310Pkg.getNsURI()!, em310Pkg);

  const mappingRes = loadXmiResource(
    rs,
    'event-atlas-mapping.ecore',
    readFileSync(path.join(__dirname, '..', 'src', 'assets', 'event-atlas-mapping.ecore'), 'utf-8'),
  );
  mappingPkg = mappingRes.getContents().get(0) as unknown as EPackage;
  EPackageRegistry.INSTANCE.set(mappingPkg.getNsURI()!, mappingPkg);

  uplinkClass = em310Pkg.getEClassifier('EM310UDLUplink') as EClass;
  expect(uplinkClass).toBeTruthy();
});

describe('enumerateFeaturePaths', () => {
  it('findet verschachtelte und geerbte Attribut-Pfade', () => {
    const paths = enumerateFeaturePaths(uplinkClass);
    const labels = paths.map((p) => p.label);
    // eigenes Containment
    expect(labels).toContain('object → battery');
    // geerbt von UplinkMessage (lorawan-Package)
    expect(labels).toContain('deduplicationId');
    // verschachtelt über geerbte Referenz
    expect(labels).toContain('deviceInfo → deviceName');
  });

  it('klassifiziert Wertarten und markiert Sammlungs-Pfade', () => {
    const paths = enumerateFeaturePaths(uplinkClass);
    const battery = paths.find((p) => p.label === 'object → battery')!;
    expect(battery.kind).toBe('NUMERIC');
    expect(battery.crossesCollection).toBe(false);

    const dedup = paths.find((p) => p.label === 'deduplicationId')!;
    expect(dedup.kind).toBe('STRING');

    // rxInfo ist upperBound=-1 → Pfade darüber durchqueren eine Sammlung
    const rssi = paths.find((p) => p.label === 'rxInfo → rssi');
    expect(rssi?.crossesCollection).toBe(true);
  });

  it('filtert nach Wertart (Messwert-Vorschläge)', () => {
    const suggestions = suggestMeasurementPaths(uplinkClass);
    expect(suggestions.every((p) => p.kind === 'NUMERIC' || p.kind === 'BOOLEAN')).toBe(true);
    expect(suggestions.some((p) => p.label === 'object → battery')).toBe(true);
    expect(suggestions.some((p) => p.label === 'deduplicationId')).toBe(false);
  });
});

/** Baut das Wizard-Setup nach, das dem Golden-File em310udl-battery-mapping.xmi entspricht. */
function batterySetup() {
  const f = MappingwizardFactory.eINSTANCE;
  const decodedClass = em310Pkg.getEClassifier('DecodedObject') as EClass;
  const uplinkBase = lorawanPkg.getEClassifier('UplinkMessage') as EClass;
  const deviceInfoClass = lorawanPkg.getEClassifier('DeviceInfo') as EClass;

  const setup = f.createSensorMappingSetup();
  setup.mappingId = 'em310udl-battery-sensor';
  setup.sensorClass = uplinkClass;
  setup.nameSource = NameSource.FROM_FIELD;
  setup.nameFallback = 'EM310UDL Battery Sensor'; // bei FROM_FIELD bewusst ignoriert

  const namePath = f.createFeaturePath();
  namePath.segments.push(feature(uplinkBase, 'deduplicationId'));
  setup.namePath = namePath;

  const ts = f.createTimestampChoice();
  ts.source = TimestampSource.DEVICE_TIME;
  const tsPath = f.createFeaturePath();
  tsPath.segments.push(feature(uplinkBase, 'time'));
  ts.path = tsPath;
  setup.timestamp = ts;

  const friendly = f.createFeaturePath();
  friendly.segments.push(feature(uplinkBase, 'deviceInfo'), feature(deviceInfoClass, 'deviceProfileName'));
  setup.friendlyNameSource = FriendlyNameSource.FROM_FIELD;
  setup.friendlyNamePath = friendly;

  const m = f.createMeasurement();
  m.selected = true;
  m.label = 'BatteryLevel';
  m.unit = 'V';
  m.serviceGroup = 'battery';
  const valuePath = f.createFeaturePath();
  valuePath.segments.push(feature(uplinkClass, 'object'), feature(decodedClass, 'battery'));
  m.valuePath = valuePath;
  setup.measurements.push(m);

  return setup;
}

describe('buildProviderMappingXmi', () => {
  it('erzeugt die Struktur des Golden-Files (nsURI-basierte hrefs)', () => {
    const result = buildProviderMappingXmi(batterySetup());
    const xmi = result.mappingXmi;

    expect(xmi).toContain(`xmlns:mapping="${MAPPING_NS_URI}"`);
    expect(xmi).toContain('mid="em310udl-battery-sensor"');
    // Name: Fallback + Feld aus dem lorawan-Basispackage (deklarierende Klasse!)
    // Entweder-Oder-Semantik: bei nameSource=FROM_FIELD nur der Feldpfad,
    // kein statisches name-Attribut (bewusste Abweichung vom Golden-File,
    // das beides kombiniert).
    expect(xmi).toContain('<name>');
    expect(xmi).not.toContain('name="EM310UDL Battery Sensor"');
    expect(xmi).toContain(
      '<featurePath xsi:type="ecore:EAttribute" href="https://eclipse.org/fennec/lorawan#//UplinkMessage/deduplicationId"/>',
    );
    // Zeitstempel aus den Daten
    expect(xmi).toContain('<timestamp strategy="FEATURE">');
    // providerClasses → Sensorklasse
    expect(xmi).toContain(
      '<providerClasses href="http://www.example.org/lorawan/specific/em310udl#//EM310UDLUplink"/>',
    );
    // Service + Resource mit Referenz- und Attribut-Segment
    expect(xmi).toContain('<services mid="battery">');
    expect(xmi).toContain('timestamp="//@timestamp" mid="batterylevel"');
    expect(xmi).toContain('<eType xsi:type="ecore:EDataType" href="http://www.eclipse.org/emf/2002/Ecore#//EDouble"/>');
    expect(xmi).toContain(
      '<valueFeature xsi:type="ecore:EReference" href="http://www.example.org/lorawan/specific/em310udl#//EM310UDLUplink/object"/>',
    );
    expect(xmi).toContain(
      '<valueFeature xsi:type="ecore:EAttribute" href="http://www.example.org/lorawan/specific/em310udl#//DecodedObject/battery"/>',
    );
    // Admin mit Anzeigename-Pfad und Quell-Package
    expect(xmi).toContain(
      '<friendlyNameFeature xsi:type="ecore:EReference" href="https://eclipse.org/fennec/lorawan#//UplinkMessage/deviceInfo"/>',
    );
    expect(xmi).toContain('<providerPackage href="http://www.example.org/lorawan/specific/em310udl#/"/>');
    // keine Regeln bei Default-Presets
    expect(result.rulesXmi).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it('lädt per Round-Trip zurück und löst alle Referenzen auf', () => {
    const result = buildProviderMappingXmi(batterySetup());
    const resource = loadXmiResource(rs, 'roundtrip-mapping.xmi', result.mappingXmi);
    const root = resource.getContents().get(0) as unknown as EObject;

    expect(root.eClass().getName()).toBe('ProviderMapping');
    expect(eget(root, 'mid')).toBe('em310udl-battery-sensor');

    const providerClasses = elist(eget(root, 'providerClasses'));
    expect(providerClasses).toHaveLength(1);
    expect((providerClasses[0] as unknown as EClass).getName()).toBe('EM310UDLUplink');

    const services = elist(eget(root, 'services'));
    expect(services).toHaveLength(1);
    expect(eget(services[0], 'mid')).toBe('battery');

    const resources = elist(eget(services[0], 'resources'));
    expect(resources).toHaveLength(1);
    const valueFeatures = elist(eget(resources[0], 'valueFeature')) as unknown as EStructuralFeature[];
    expect(valueFeatures.map((v) => v.getName())).toEqual(['object', 'battery']);

    const admin = eget(root, 'admin') as EObject;
    expect(eget(admin, 'mid')).toBe('admin');
  });

  it('erzeugt Persistenz-Regeln nur bei abweichenden Presets', () => {
    const setup = batterySetup();
    setup.measurements[0].storagePreset = StoragePreset.CHANGED_5_PERCENT;
    setup.measurements[0].retentionPreset = RetentionPreset.DAYS_90;

    const result = buildProviderMappingXmi(setup);
    expect(result.rulesFileName).toBe('em310udl-battery-sensor-persistence-rules.xmi');
    expect(result.rulesXmi).toContain('mapping:PercentageChangeRule');
    expect(result.rulesXmi).toContain('percentage="5.0"');
    expect(result.rulesXmi).toContain('retention="90"');
    expect(result.mappingXmi).toContain(
      '<changeRule href="em310udl-battery-sensor-persistence-rules.xmi#change-5-percent"/>',
    );
    expect(result.mappingXmi).toContain(
      '<deletionRule href="em310udl-battery-sensor-persistence-rules.xmi#keep-90-days"/>',
    );
  });

  it('setzt statische Standorte als admin-Attribute', () => {
    const setup = batterySetup();
    const loc = MappingwizardFactory.eINSTANCE.createLocationChoice();
    loc.mode = LocationMode.STATIC;
    loc.latitude = 50.92;
    loc.longitude = 11.58;
    setup.location = loc;

    const result = buildProviderMappingXmi(setup);
    expect(result.mappingXmi).toContain('<admin mid="admin" latitude="50.92" longitude="11.58">');
  });

  it('warnt bei Messwert-Pfaden durch Sammlungen', () => {
    const setup = batterySetup();
    const uplinkBase = lorawanPkg.getEClassifier('UplinkMessage') as EClass;
    const rxInfoClass = lorawanPkg.getEClassifier('RxInfo') as EClass;
    const m = MappingwizardFactory.eINSTANCE.createMeasurement();
    m.selected = true;
    m.label = 'Signalstärke';
    m.serviceGroup = 'signal';
    const p = MappingwizardFactory.eINSTANCE.createFeaturePath();
    p.segments.push(feature(uplinkBase, 'rxInfo'), feature(rxInfoClass, 'rssi'));
    m.valuePath = p;
    setup.measurements.push(m);

    const result = buildProviderMappingXmi(setup);
    expect(result.warnings.some((w) => w.includes('Signalstärke'))).toBe(true);
  });

  it('slug normalisiert Bezeichner', () => {
    expect(slug('EM310 UDL Batterie-Sensor!')).toBe('em310-udl-batterie-sensor');
    expect(slug('  ')).toBe('mapping');
  });
});

describe('buildMappingProfileXmi (UNIFIED-Provider, B1/#146)', () => {
  /** Zweiter Nachrichtentyp: Dragino LSE01 mit batteryValue. */
  function draginoSetup() {
    const f = MappingwizardFactory.eINSTANCE;
    const draginoRes = loadXmiResource(
      rs,
      'dragino-message.ecore',
      readFileSync(path.join(FIXTURES, 'dragino-message.ecore'), 'utf-8'),
    );
    const draginoPkg = draginoRes.getContents().get(0) as unknown as EPackage;
    EPackageRegistry.INSTANCE.set(draginoPkg.getNsURI()!, draginoPkg);
    const uplink = draginoPkg.getEClassifier('DraginoLSE01Uplink') as EClass;
    const decoded = draginoPkg.getEClassifier('DecodedObject') as EClass;

    const setup = f.createSensorMappingSetup();
    setup.mappingId = 'dragino-lse01-battery';
    setup.sensorClass = uplink;
    setup.nameSource = NameSource.STATIC;
    setup.nameFallback = 'Dragino LSE01';
    const ts = f.createTimestampChoice();
    ts.source = TimestampSource.RECEIVE_TIME;
    setup.timestamp = ts;

    const m = f.createMeasurement();
    m.selected = true;
    m.label = 'BatteryLevel'; // gleiche Resource-Id wie beim EM310 → gemeinsame Profil-Resource
    m.unit = 'V';
    m.serviceGroup = 'battery';
    const valuePath = f.createFeaturePath();
    valuePath.segments.push(feature(uplink, 'object'), feature(decoded, 'batV'));
    m.valuePath = valuePath;
    setup.measurements.push(m);

    const m2 = f.createMeasurement();
    m2.selected = true;
    m2.label = 'Bodenfeuchte';
    m2.serviceGroup = 'soil';
    const p2 = f.createFeaturePath();
    p2.segments.push(feature(uplink, 'object'), feature(decoded, 'water_SOIL_f'));
    m2.valuePath = p2;
    setup.measurements.push(m2);

    return setup;
  }

  it('erzeugt ein UNIFIED-Profil als Union der Nachrichtentypen', () => {
    const setups = [batterySetup(), draginoSetup()];
    const profile = buildMappingProfileXmi('Batterie Sensoren Halle 3', setups);

    expect(profile.profileId).toBe('batterie-sensoren-halle-3');
    expect(profile.profileFileName).toBe('batterie-sensoren-halle-3-profile.xmi');
    const xmi = profile.profileXmi;
    expect(xmi).toContain('providerStrategy="UNIFIED"');
    expect(xmi).toContain('<provider providerId="batterie-sensoren-halle-3">');
    // gemeinsame Resource (beide Typen liefern battery/batterylevel): required bleibt Default
    expect(xmi).toContain('<services serviceId="battery"');
    expect(xmi).toMatch(/<resources resourceId="batterylevel" resourceName="BatteryLevel" expectedUnit="V">/);
    // nur vom Dragino geliefert → required="false"
    expect(xmi).toMatch(/<resources resourceId="bodenfeuchte"[^>]*required="false">/);
    expect(xmi).toContain('<expectedType href="http://www.eclipse.org/emf/2002/Ecore#//EDouble"/>');
    // EM310 hat friendlyNamePath → Admin fordert Anzeigenamen
    expect(xmi).toContain('requiresFriendlyName="true"');
  });

  it('verlinkt Mappings über profile-href und lädt im Round-Trip', () => {
    const setups = [batterySetup(), draginoSetup()];
    const profile = buildMappingProfileXmi('Batterie Sensoren', setups);
    const ref = { fileName: profile.profileFileName, profileId: profile.profileId };

    const em310 = buildProviderMappingXmi(setups[0], { profile: ref });
    const dragino = buildProviderMappingXmi(setups[1], { profile: ref });
    for (const result of [em310, dragino]) {
      expect(result.mappingXmi).toContain(
        `<profile href="batterie-sensoren-profile.xmi#batterie-sensoren"/>`,
      );
    }

    // Round-Trip: Profil + Mapping laden, profile-Referenz löst gegen die Profil-Resource auf
    const roundtripRs = rs;
    loadXmiResource(roundtripRs, 'batterie-sensoren-profile.xmi', profile.profileXmi);
    const mappingRes = loadXmiResource(roundtripRs, 'unified-em310.xmi', em310.mappingXmi);
    const root = mappingRes.getContents().get(0) as unknown as EObject;
    const profileRef = eget(root, 'profile') as EObject | undefined;
    expect(profileRef, 'profile-Referenz nicht aufgelöst').toBeTruthy();
    expect(eget(profileRef!, 'profileId')).toBe('batterie-sensoren');
    expect(String(eget(profileRef!, 'providerStrategy') ?? '')).toContain('UNIFIED');
  });
});

describe('Identifikation: Feld ODER fester Text', () => {
  it('STATIC: nur das name-Attribut, kein featurePath', () => {
    const setup = batterySetup();
    setup.nameSource = NameSource.STATIC;
    const xmi = buildProviderMappingXmi(setup).mappingXmi;
    expect(xmi).toContain('<name name="EM310UDL Battery Sensor"/>');
    expect(xmi).not.toContain('UplinkMessage/deduplicationId');
  });

  it('meldet fehlende Eingabe je nach gewählter Quelle', () => {
    const fieldMode = batterySetup();
    fieldMode.namePath = undefined;
    expect(() => buildProviderMappingXmi(fieldMode)).toThrow(/kein Feld für den Namen/);

    const staticMode = batterySetup();
    staticMode.nameSource = NameSource.STATIC;
    staticMode.nameFallback = '';
    expect(() => buildProviderMappingXmi(staticMode)).toThrow(/kein fester Name/);
  });

  it('Anzeigename: NONE unterdrückt, STATIC als admin-Attribut, FROM_FIELD als Pfad', () => {
    const none = batterySetup();
    none.friendlyNameSource = FriendlyNameSource.NONE;
    const noneXmi = buildProviderMappingXmi(none).mappingXmi;
    expect(noneXmi).not.toContain('friendlyName');

    const staticName = batterySetup();
    staticName.friendlyNameSource = FriendlyNameSource.STATIC;
    staticName.friendlyName = 'Halle 3 – Nordseite';
    const staticXmi = buildProviderMappingXmi(staticName).mappingXmi;
    expect(staticXmi).toContain('<admin mid="admin" friendlyName="Halle 3 – Nordseite">');
    expect(staticXmi).not.toContain('friendlyNameFeature');

    const fromField = buildProviderMappingXmi(batterySetup()).mappingXmi;
    expect(fromField).toContain(
      '<friendlyNameFeature xsi:type="ecore:EReference" href="https://eclipse.org/fennec/lorawan#//UplinkMessage/deviceInfo"/>',
    );
  });
});

describe('Dynamische Einheiten (unitFeature)', () => {
  it('erzeugt unitFeature-Pfade und lässt die statische Einheit weg', () => {
    const setup = batterySetup();
    const uplinkBase = lorawanPkg.getEClassifier('UplinkMessage') as EClass;
    const deviceInfoClass = lorawanPkg.getEClassifier('DeviceInfo') as EClass;
    const unitPath = MappingwizardFactory.eINSTANCE.createFeaturePath();
    unitPath.segments.push(feature(uplinkBase, 'deviceInfo'), feature(deviceInfoClass, 'tenantName'));
    setup.measurements[0].unitPath = unitPath;

    const xmi = buildProviderMappingXmi(setup).mappingXmi;
    expect(xmi).toContain(
      '<unitFeature xsi:type="ecore:EReference" href="https://eclipse.org/fennec/lorawan#//UplinkMessage/deviceInfo"/>',
    );
    expect(xmi).toContain(
      '<unitFeature xsi:type="ecore:EAttribute" href="https://eclipse.org/fennec/lorawan#//DeviceInfo/tenantName"/>',
    );
    // dynamische Einheit hat Vorrang vor der statischen
    expect(xmi).not.toContain('unit="V"');
  });

  it('behält die statische Einheit ohne unitPath', () => {
    const xmi = buildProviderMappingXmi(batterySetup()).mappingXmi;
    expect(xmi).toContain('unit="V"');
    expect(xmi).not.toContain('unitFeature');
  });
});
