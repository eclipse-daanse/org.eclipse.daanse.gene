/**
 * Dokument-orientiertes Öffnen (T21/#192): Ein Mapping-XMI aus einer Datei
 * öffnen, Herkunft im Kontext festhalten, fehlende Modelle melden.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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
import type { EPackage, XMIResource } from '@emfts/core';
import { openMappingContent } from '../src/wizard/openMapping';
import {
  editing,
  mappingDocument,
  restoreWarnings,
  setup as wizardSetup,
  startNewMapping,
} from '../src/wizard/context';
import { MappingwizardFactory, MappingwizardPackage } from '../src/generated';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');
const WATERPARK_NS = 'http://data-in-motion.biz/waterparc/domain';

let rs: BasicResourceSet;
let waterparkPkg: EPackage;

function loadResource(uri: string, content: string): XMIResource {
  const resource = rs.createResource(URI.createURI(uri)) as XMIResource;
  resource.loadFromString(content);
  return resource;
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

  const mappingPkg = loadResource(
    'event-atlas-mapping.ecore',
    readFileSync(path.join(__dirname, '..', 'src', 'assets', 'event-atlas-mapping.ecore'), 'utf-8'),
  )
    .getContents()
    .get(0) as unknown as EPackage;
  EPackageRegistry.INSTANCE.set(mappingPkg.getNsURI()!, mappingPkg);

  waterparkPkg = loadResource(
    'waterparc-domain.ecore',
    readFileSync(path.join(FIXTURES, 'waterparc-domain.ecore'), 'utf-8'),
  )
    .getContents()
    .get(0) as unknown as EPackage;
});

beforeEach(() => {
  startNewMapping();
  EPackageRegistry.INSTANCE.set(WATERPARK_NS, waterparkPkg);
});

const mappingXmi = () =>
  readFileSync(path.join(FIXTURES, 'waterpark-water-quality.xmi'), 'utf-8');

describe('openMappingContent', () => {
  it('öffnet ein Mapping aus einer Datei und hält die Herkunft fest', async () => {
    const result = await openMappingContent({
      content: mappingXmi(),
      document: { source: 'file', name: 'waterpark-water-quality.xmi' },
      packages: [waterparkPkg],
    });

    expect(result.warnings).toEqual([]);
    expect(mappingDocument.value).toEqual({
      source: 'file',
      name: 'waterpark-water-quality.xmi',
    });
    // Aus einer Datei geöffnet heißt: kein Atlas-Objekt zum Überschreiben.
    expect(editing.value).toBeUndefined();
    expect(wizardSetup.value?.sensorClass?.getName()).toBe('WaterQuality');
    expect(wizardSetup.value?.measurements.filter((m) => m.selected)).toHaveLength(5);
    expect(restoreWarnings.value).toEqual([]);
  });

  it('meldet ein fehlendes Sensormodell verständlich', async () => {
    // Mapping auf ein Modell, das weder registriert noch beigelegt ist:
    // ohne Atlas-Verbindung kann der Assistent es nicht auflösen.
    const unknown = mappingXmi().replaceAll(WATERPARK_NS, 'http://example.org/unbekannt');
    await expect(
      openMappingContent({
        content: unknown,
        document: { source: 'file', name: 'fremd.xmi' },
      }),
    ).rejects.toThrow(/Sensorklasse/);
  });

  it('lehnt Dateien ab, die keine Sensor-Mappings sind', async () => {
    const profile = readFileSync(
      '/mnt/be46e9e8-fa36-463c-8885-99892ace2ab9/dim_xdp/event.atlas/org.eclipse.fennec.event.atlas.mapping/model/examples/battery/battery-sensor-profile.xmi',
      'utf-8',
    );
    await expect(
      openMappingContent({
        content: profile,
        document: { source: 'file', name: 'battery-sensor-profile.xmi' },
      }),
    ).rejects.toThrow(/kein Sensor-Mapping/);
  });

  it('startNewMapping verwirft das geöffnete Dokument', async () => {
    await openMappingContent({
      content: mappingXmi(),
      document: { source: 'file', name: 'waterpark-water-quality.xmi' },
      packages: [waterparkPkg],
    });
    startNewMapping();
    expect(mappingDocument.value).toEqual({ source: 'new', name: '' });
    expect(wizardSetup.value).toBeUndefined();
  });
});
