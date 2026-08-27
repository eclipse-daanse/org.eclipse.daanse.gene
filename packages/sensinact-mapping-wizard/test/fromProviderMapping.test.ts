/**
 * Rück-Transformer-Tests (T19/#190): Ein Mapping-XMI wieder in das
 * Wizard-Fassadenmodell übersetzen — Round-Trip mit dem Writer und Öffnen des
 * handgeschriebenen event.atlas-Beispiels (Datei-hrefs).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  BasicResourceSet,
  EPackageRegistry,
  registerEcorePackage,
  URI,
  XMIResourceFactory,
} from '@emfts/core';
import type { EClass, EPackage, EStructuralFeature, XMIResource } from '@emfts/core';
import { buildProviderMappingXmi } from '../src/transform/toProviderMapping';
import {
  analyzeMappingXmi,
  restoreSetupFromMappingXmi,
  rewriteEcoreFileHrefs,
} from '../src/transform/fromProviderMapping';
import {
  MappingwizardFactory,
  MappingwizardPackage,
  FriendlyNameSource,
  LocationMode,
  NameSource,
  RetentionPreset,
  StoragePreset,
  TimestampSource,
} from '../src/generated';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');
// Handgeschriebene Beispiele aus event.atlas. Sie liegen ausserhalb dieses
// Repos, weshalb die Tests, die sie lesen, uebersprungen werden, wo der Pfad
// nicht existiert (CI, fremde Arbeitsplatzrechner). Wo er existiert, laufen
// sie unveraendert.
const EXAMPLES =
  '/mnt/be46e9e8-fa36-463c-8885-99892ace2ab9/dim_xdp/event.atlas/org.eclipse.fennec.event.atlas.mapping/model/examples/battery';
const MIT_BEISPIELEN = existsSync(EXAMPLES);
const LORAWAN_NS = 'https://eclipse.org/fennec/lorawan';
const EM310_NS = 'http://www.example.org/lorawan/specific/em310udl';

let rs: BasicResourceSet;
let em310Pkg: EPackage;
let lorawanPkg: EPackage;
let uplinkClass: EClass;
let waterparkPkg: EPackage;

function loadResource(uri: string, content: string): XMIResource {
  const resource = rs.createResource(URI.createURI(uri)) as XMIResource;
  resource.loadFromString(content);
  return resource;
}

function feature(eClass: EClass, name: string): EStructuralFeature {
  const f = eClass.getEStructuralFeature(name);
  if (!f) throw new Error(`Feature ${name} fehlt auf ${eClass.getName()}`);
  return f;
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

  lorawanPkg = loadResource(
    'lorawan-uplink.ecore',
    readFileSync(path.join(FIXTURES, 'lorawan-uplink.ecore'), 'utf-8'),
  )
    .getContents()
    .get(0) as unknown as EPackage;
  EPackageRegistry.INSTANCE.set(lorawanPkg.getNsURI()!, lorawanPkg);

  em310Pkg = loadResource(
    'em310udl-message.ecore',
    readFileSync(path.join(FIXTURES, 'em310udl-message.ecore'), 'utf-8'),
  )
    .getContents()
    .get(0) as unknown as EPackage;
  EPackageRegistry.INSTANCE.set(em310Pkg.getNsURI()!, em310Pkg);

  waterparkPkg = loadResource(
    'waterparc-domain.ecore',
    readFileSync(path.join(FIXTURES, 'waterparc-domain.ecore'), 'utf-8'),
  )
    .getContents()
    .get(0) as unknown as EPackage;
  EPackageRegistry.INSTANCE.set(waterparkPkg.getNsURI()!, waterparkPkg);

  const mappingPkg = loadResource(
    'event-atlas-mapping.ecore',
    readFileSync(path.join(__dirname, '..', 'src', 'assets', 'event-atlas-mapping.ecore'), 'utf-8'),
  )
    .getContents()
    .get(0) as unknown as EPackage;
  EPackageRegistry.INSTANCE.set(mappingPkg.getNsURI()!, mappingPkg);

  uplinkClass = em310Pkg.getEClassifier('EM310UDLUplink') as EClass;
});

/** Vollständiges Setup: Name/Zeit aus Feldern, Standort, zwei Messwerte mit Regeln. */
function fullSetup() {
  const f = MappingwizardFactory.eINSTANCE;
  const decodedClass = em310Pkg.getEClassifier('DecodedObject') as EClass;
  const uplinkBase = lorawanPkg.getEClassifier('UplinkMessage') as EClass;
  const deviceInfoClass = lorawanPkg.getEClassifier('DeviceInfo') as EClass;

  const setup = f.createSensorMappingSetup();
  setup.mappingId = 'em310udl-battery-sensor';
  setup.sensorClass = uplinkClass;

  setup.nameSource = NameSource.FROM_FIELD;
  const namePath = f.createFeaturePath();
  namePath.segments.push(feature(uplinkBase, 'deduplicationId'));
  setup.namePath = namePath;

  const ts = f.createTimestampChoice();
  ts.source = TimestampSource.DEVICE_TIME;
  const tsPath = f.createFeaturePath();
  tsPath.segments.push(feature(uplinkBase, 'time'));
  ts.path = tsPath;
  setup.timestamp = ts;

  setup.friendlyNameSource = FriendlyNameSource.FROM_FIELD;
  const friendly = f.createFeaturePath();
  friendly.segments.push(
    feature(uplinkBase, 'deviceInfo'),
    feature(deviceInfoClass, 'deviceProfileName'),
  );
  setup.friendlyNamePath = friendly;

  const loc = f.createLocationChoice();
  loc.mode = LocationMode.STATIC;
  loc.latitude = 50.9375;
  loc.longitude = 6.9603;
  setup.location = loc;

  const battery = f.createMeasurement();
  battery.selected = true;
  battery.label = 'BatteryLevel';
  battery.unit = 'V';
  battery.serviceGroup = 'battery';
  battery.storagePreset = StoragePreset.CHANGED_5_PERCENT;
  battery.retentionPreset = RetentionPreset.DAYS_90;
  const valuePath = f.createFeaturePath();
  valuePath.segments.push(feature(uplinkClass, 'object'), feature(decodedClass, 'battery'));
  battery.valuePath = valuePath;
  setup.measurements.push(battery);

  const distance = f.createMeasurement();
  distance.selected = true;
  distance.label = 'Distance';
  distance.unit = 'mm';
  distance.serviceGroup = 'data';
  const distancePath = f.createFeaturePath();
  distancePath.segments.push(feature(uplinkClass, 'object'), feature(decodedClass, 'distance'));
  distance.valuePath = distancePath;
  setup.measurements.push(distance);

  return setup;
}

describe('analyzeMappingXmi', () => {
  it.skipIf(!MIT_BEISPIELEN)('trennt nsURIs, .ecore-Dateien und Nachbar-Artefakte', () => {
    const raw = readFileSync(path.join(EXAMPLES, 'em310udl-battery-mapping.xmi'), 'utf-8');
    const analysis = analyzeMappingXmi(raw);
    expect(analysis.rootType).toBe('ProviderMapping');
    expect(analysis.mid).toBe('em310udl-battery-sensor');
    expect(analysis.ecoreFiles).toContain('../../lorawan-uplink.ecore');
    expect(analysis.ecoreFiles).toContain('../../em310udl-message.ecore');
    expect(analysis.xmiFiles).toContain('battery-sensor-profile.xmi');
    expect(analysis.nsUris).toEqual([]);
  });

  it('erkennt nsURI-basierte Referenzen des Assistenten', () => {
    const { mappingXmi } = buildProviderMappingXmi(fullSetup());
    const analysis = analyzeMappingXmi(mappingXmi);
    expect(analysis.nsUris).toContain(EM310_NS);
    expect(analysis.nsUris).toContain(LORAWAN_NS);
    expect(analysis.ecoreFiles).toEqual([]);
  });
});

describe('rewriteEcoreFileHrefs', () => {
  it.skipIf(!MIT_BEISPIELEN)('bildet Dateipfad-hrefs über die registrierten Packages auf nsURIs ab', () => {
    const raw = readFileSync(path.join(EXAMPLES, 'em310udl-battery-mapping.xmi'), 'utf-8');
    const result = rewriteEcoreFileHrefs(raw, [lorawanPkg, em310Pkg]);
    expect(result.rewritten['../../lorawan-uplink.ecore']).toBe(LORAWAN_NS);
    expect(result.rewritten['../../em310udl-message.ecore']).toBe(EM310_NS);
    expect(result.unresolved).toEqual([]);
    expect(result.xmi).toContain(`href="${LORAWAN_NS}#//UplinkMessage/time"`);
  });
});

describe('restoreSetupFromMappingXmi', () => {
  it('ist zum Writer invers (Round-Trip byte-identisch)', () => {
    const original = buildProviderMappingXmi(fullSetup());
    const restored = restoreSetupFromMappingXmi(original.mappingXmi, {
      siblings: [
        { fileName: original.rulesFileName!, content: original.rulesXmi! },
      ],
      packages: [em310Pkg, lorawanPkg],
    });
    expect(restored.warnings).toEqual([]);

    const again = buildProviderMappingXmi(restored.setup);
    expect(again.mappingXmi).toBe(original.mappingXmi);
    expect(again.rulesXmi).toBe(original.rulesXmi);
  });

  it('stellt die fachlichen Entscheidungen wieder her', () => {
    const original = buildProviderMappingXmi(fullSetup());
    const { setup } = restoreSetupFromMappingXmi(original.mappingXmi, {
      siblings: [{ fileName: original.rulesFileName!, content: original.rulesXmi! }],
      packages: [em310Pkg, lorawanPkg],
    });

    expect(setup.mappingId).toBe('em310udl-battery-sensor');
    expect(setup.sensorClass).toBe(uplinkClass);
    expect(setup.nameSource).toBe(NameSource.FROM_FIELD);
    expect(setup.namePath?.segments.map((s) => s.getName())).toEqual(['deduplicationId']);
    expect(setup.timestamp.source).toBe(TimestampSource.DEVICE_TIME);
    expect(setup.timestamp.path?.segments.map((s) => s.getName())).toEqual(['time']);
    expect(setup.friendlyNameSource).toBe(FriendlyNameSource.FROM_FIELD);
    expect(setup.friendlyNamePath?.segments.map((s) => s.getName())).toEqual([
      'deviceInfo',
      'deviceProfileName',
    ]);
    expect(setup.location?.mode).toBe(LocationMode.STATIC);
    expect(setup.location?.latitude).toBeCloseTo(50.9375);
    expect(setup.location?.longitude).toBeCloseTo(6.9603);

    const selected = setup.measurements.filter((m) => m.selected);
    expect(selected.map((m) => m.label)).toEqual(['BatteryLevel', 'Distance']);
    const battery = selected[0];
    expect(battery.unit).toBe('V');
    expect(battery.serviceGroup).toBe('battery');
    expect(battery.storagePreset).toBe(StoragePreset.CHANGED_5_PERCENT);
    expect(battery.retentionPreset).toBe(RetentionPreset.DAYS_90);
    expect(battery.valuePath.segments.map((s) => s.getName())).toEqual(['object', 'battery']);
  });

  it('ergänzt nicht gemappte Felder als abgewählte Vorschläge', () => {
    const original = buildProviderMappingXmi(fullSetup());
    const { setup } = restoreSetupFromMappingXmi(original.mappingXmi, {
      packages: [em310Pkg, lorawanPkg],
    });
    const unselected = setup.measurements.filter((m) => !m.selected);
    expect(unselected.length).toBeGreaterThan(0);
    // keine Duplikate zu den bereits gemappten Pfaden
    const labels = setup.measurements.map((m) => m.valuePath.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it.skipIf(!MIT_BEISPIELEN)('öffnet das handgeschriebene event.atlas-Beispiel (Datei-hrefs, statischer Name)', () => {
    const raw = readFileSync(path.join(EXAMPLES, 'em310udl-battery-mapping.xmi'), 'utf-8');
    const { setup, profile, warnings } = restoreSetupFromMappingXmi(raw, {
      packages: [em310Pkg, lorawanPkg],
    });

    expect(setup.mappingId).toBe('em310udl-battery-sensor');
    expect(setup.sensorClass).toBe(uplinkClass);
    // Das Beispiel kombiniert Feld UND Fallback-Namen — der Assistent
    // übernimmt das Feld und behält den Text als Ersatzname.
    expect(setup.nameSource).toBe(NameSource.FROM_FIELD);
    expect(setup.nameFallback).toBe('EM310UDL Battery Sensor');
    expect(setup.timestamp.source).toBe(TimestampSource.DEVICE_TIME);

    const selected = setup.measurements.filter((m) => m.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].label).toBe('BatteryLevel');
    expect(selected[0].unit).toBe('V');
    expect(selected[0].serviceGroup).toBe('Battery');

    expect(profile?.fileName).toBe('battery-sensor-profile.xmi');
    expect(profile?.profileId).toBe('battery-sensor');
    // Das Beispiel kombiniert Feld und festen Namen — darauf wird hingewiesen.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/fester Name|festen Namen/);
  });

  it('stellt Standort-Felder aus den Daten wieder her', () => {
    const f = MappingwizardFactory.eINSTANCE;
    const setup = fullSetup();
    const rxInfo = feature(lorawanPkg.getEClassifier('UplinkMessage') as EClass, 'rxInfo');
    const rxInfoClass = lorawanPkg.getEClassifier('RxInfo') as EClass;
    const locationRef = feature(rxInfoClass, 'location');
    const locationClass = lorawanPkg.getEClassifier('Location') as EClass;
    const loc = f.createLocationChoice();
    loc.mode = LocationMode.FROM_DATA;
    const lat = f.createFeaturePath();
    lat.segments.push(rxInfo, locationRef, feature(locationClass, 'latitude'));
    const lon = f.createFeaturePath();
    lon.segments.push(rxInfo, locationRef, feature(locationClass, 'longitude'));
    loc.latitudePath = lat;
    loc.longitudePath = lon;
    setup.location = loc;

    const original = buildProviderMappingXmi(setup);
    const restored = restoreSetupFromMappingXmi(original.mappingXmi, {
      siblings: [{ fileName: original.rulesFileName!, content: original.rulesXmi! }],
      packages: [em310Pkg, lorawanPkg],
    });
    expect(restored.setup.location?.mode).toBe(LocationMode.FROM_DATA);
    expect(restored.setup.location?.latitudePath?.segments.map((s) => s.getName())).toEqual([
      'rxInfo',
      'location',
      'latitude',
    ]);
    expect(buildProviderMappingXmi(restored.setup).mappingXmi).toBe(original.mappingXmi);
  });

  it.skipIf(!MIT_BEISPIELEN)('lehnt Objekte ab, die keine Sensor-Mappings sind', () => {
    const profile = readFileSync(path.join(EXAMPLES, 'battery-sensor-profile.xmi'), 'utf-8');
    expect(() => restoreSetupFromMappingXmi(profile)).toThrow(/kein Sensor-Mapping/);
  });

  /**
   * Echtes Artefakt aus einem laufenden Modelatlas (Scope „jena", Registry
   * „sensinactmapping"): Java-EMF serialisiert Referenzen als Attribut-
   * Kurzform (`valueFeature="ecore:EAttribute nsURI#//X/y"`) statt als
   * href-Kindelement.
   */
  it('öffnet ein vom Server serialisiertes Mapping (Attribut-Kurzform)', () => {
    const xmi = readFileSync(path.join(FIXTURES, 'waterpark-water-quality.xmi'), 'utf-8');
    const analysis = analyzeMappingXmi(xmi);
    expect(analysis.rootType).toBe('ProviderMapping');
    expect(analysis.nsUris).toContain('http://data-in-motion.biz/waterparc/domain');

    const { setup, warnings } = restoreSetupFromMappingXmi(xmi, { packages: [waterparkPkg] });
    expect(setup.mappingId).toBe('waterpark-water-quality');
    expect(setup.sensorClass?.getName()).toBe('WaterQuality');
    expect(setup.nameSource).toBe(NameSource.FROM_FIELD);
    expect(setup.namePath?.segments.map((seg) => seg.getName())).toEqual(['sensor_id']);

    const selected = setup.measurements.filter((m) => m.selected);
    expect(selected.map((m) => m.label)).toEqual(['ph', 'freeChlorine', 'redox', 'status', 'area']);
    expect(selected.every((m) => m.serviceGroup === 'Water Quality')).toBe(true);
    expect(selected[1].unit).toBe('mg/l');
    expect(warnings).toEqual([]);

    // und lässt sich wieder in ein gültiges Mapping überführen
    const again = buildProviderMappingXmi(setup);
    expect(again.mappingXmi).toContain('mid="waterpark-water-quality"');
    expect(again.mappingXmi).toContain(
      'href="http://data-in-motion.biz/waterparc/domain#//WaterQuality"',
    );
  });

  it('erkennt die Presets auch ohne die Regel-Datei (Id im href)', () => {
    const original = buildProviderMappingXmi(fullSetup());
    const { warnings, setup } = restoreSetupFromMappingXmi(original.mappingXmi, {
      packages: [em310Pkg, lorawanPkg],
    });
    expect(warnings).toEqual([]);
    expect(setup.measurements[0].storagePreset).toBe(StoragePreset.CHANGED_5_PERCENT);
    expect(setup.measurements[0].retentionPreset).toBe(RetentionPreset.DAYS_90);
    // und der Round-Trip bleibt verlustfrei
    expect(buildProviderMappingXmi(setup).rulesXmi).toBe(original.rulesXmi);
  });
});
