/**
 * Tests für die Modelatlas-Anbindung (T10/#139) und das Cascade-Nachladen
 * referenzierter Modelle (T11/#140) — gegen gemockte fetch-Antworten.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { registerEcorePackage, EPackageRegistry } from '@emfts/core';
import type { EClass, EPackage } from '@emfts/core';
import { ModelAtlasClient } from '../src/atlas/ModelAtlasClient';
import {
  AtlasModelSource,
  decodeSchemaNsUri,
  parseSchemaList,
  parseScopeNames,
  parseScopeRegistries,
  registerAtlasApiPackages,
} from '../src/atlas/atlasSource';
import {
  collectReferencedDocuments,
  findMissingReferences,
  loadSchemaWithDependencies,
} from '../src/atlas/cascadeLoader';
import { enumerateFeaturePaths } from '../src/emf/featurePaths';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');
const ASSETS = path.join(__dirname, '..', 'src', 'assets');

const LORAWAN_NS = 'https://eclipse.org/fennec/lorawan';
const EM310_NS = 'http://www.example.org/lorawan/specific/em310udl';

const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64');

function metadataListXmi(entries: { nsUri: string; name: string; version?: string }[]): string {
  const items = entries
    .map(
      (e) =>
        `  <metadata objectId="${b64(e.nsUri)}" objectName="${e.name}" objectType="EPackage" stage="release" scope="sensors" registry="schema" contentHash="x" uploadUser="t" uploadTime="t" sourceChannel="t"${e.version ? ` version="${e.version}"` : ''}/>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<mgmt:ObjectMetadataContainer xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:mgmt="http://eclipse.org/fennec/model/atlas/management/1.0.0">
${items}
</mgmt:ObjectMetadataContainer>`;
}

const scopeListXmi = `<?xml version="1.0" encoding="UTF-8"?>
<workflowapi:ScopeListResponse xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:workflowapi="http://eclipse.org/fennec/model/atlas/workflow/api/1.0.0">
  <scopes name="sensors" description="Sensor-Modelle"/>
  <scopes name="playground"/>
</workflowapi:ScopeListResponse>`;

/** Mock-Atlas: Schema-Inhalte nach nsURI, Rest der API simuliert. */
function mockFetch(schemas: Record<string, string>) {
  return vi.fn(async (url: string | URL) => {
    const u = String(url);
    const ok = (body: string) => new Response(body, { status: 200 });
    if (u.endsWith('/scopes')) return ok(scopeListXmi);
    if (u.includes('/schema/stages/release/content?nsUri=')) {
      const nsUri = decodeURIComponent(u.split('nsUri=')[1]);
      const content = schemas[nsUri];
      return content ? ok(content) : new Response('not found', { status: 404 });
    }
    if (u.includes('/schema/search?')) {
      const params = new URLSearchParams(u.split('?')[1]);
      const exact = params.get('nsUriExact');
      if (exact) {
        return schemas[exact]
          ? ok(metadataListXmi([{ nsUri: exact, name: exact.split('/').pop()! }]))
          : ok(metadataListXmi([]));
      }
      const name = (params.get('name') ?? '').toLowerCase();
      const hits = Object.keys(schemas)
        .filter((ns) => ns.toLowerCase().includes(name))
        .map((ns) => ({ nsUri: ns, name: ns.split('/').pop()! }));
      return ok(metadataListXmi(hits));
    }
    if (u.includes('/schema/stages/release')) {
      return ok(
        metadataListXmi(
          Object.keys(schemas).map((ns) => ({ nsUri: ns, name: ns.split('/').pop()!, version: '1.0' })),
        ),
      );
    }
    return new Response('not found', { status: 404 });
  });
}

let em310Xml: string;
let lorawanXml: string;

beforeAll(() => {
  registerEcorePackage();
  registerAtlasApiPackages(
    readFileSync(path.join(ASSETS, 'atlas-management.ecore'), 'utf-8'),
    readFileSync(path.join(ASSETS, 'atlas-workflow-api.ecore'), 'utf-8'),
  );
  em310Xml = readFileSync(path.join(FIXTURES, 'em310udl-message.ecore'), 'utf-8')
    // Fixture referenziert per relativem Datei-href — im Atlas-Szenario
    // referenzieren Schemas einander per nsURI.
    .replaceAll('lorawan-uplink.ecore#', `${LORAWAN_NS}#`);
  lorawanXml = readFileSync(path.join(FIXTURES, 'lorawan-uplink.ecore'), 'utf-8');
});

beforeEach(() => {
  // Registrierte Sensor-Packages zwischen Tests entfernen (Isolation)
  for (const ns of [LORAWAN_NS, EM310_NS]) {
    (EPackageRegistry.INSTANCE as unknown as { delete?: (k: string) => void }).delete?.(ns);
  }
});

describe('decodeSchemaNsUri', () => {
  it('dekodiert Base64-objectIds und lässt Klartext durch', () => {
    expect(decodeSchemaNsUri(b64(LORAWAN_NS))).toBe(LORAWAN_NS);
    expect(decodeSchemaNsUri('kein-base64:wert')).toBe('kein-base64:wert');
  });
});

describe('Antwort-Parsing', () => {
  it('parst Scope-Listen', () => {
    expect(parseScopeNames(scopeListXmi)).toEqual(['sensors', 'playground']);
  });

  it('parst Schema-Metadaten-Listen (Container)', () => {
    const xmi = metadataListXmi([
      { nsUri: EM310_NS, name: 'em310udl', version: '1.0' },
      { nsUri: LORAWAN_NS, name: 'lorawan' },
    ]);
    const infos = parseSchemaList(xmi);
    expect(infos).toHaveLength(2);
    expect(infos[0]).toMatchObject({ name: 'em310udl', nsUri: EM310_NS, stage: 'release', version: '1.0' });
  });

  it('liefert leere Liste bei leerer Antwort', () => {
    expect(parseSchemaList('')).toEqual([]);
  });
});

describe('AtlasModelSource (gegen Mock-Fetch)', () => {
  let source: AtlasModelSource;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch({ [EM310_NS]: em310Xml, [LORAWAN_NS]: lorawanXml }));
    source = new AtlasModelSource(
      new ModelAtlasClient({ baseUrl: 'http://atlas.test/rest' }),
      'sensors',
      'release',
    );
  });

  it('listet Scopes und Schemas', async () => {
    expect(await source.listScopes()).toEqual(['sensors', 'playground']);
    const schemas = await source.listSchemas();
    expect(schemas.map((s) => s.nsUri).sort()).toEqual([EM310_NS, LORAWAN_NS].sort());
  });

  it('sucht nach Namen', async () => {
    const hits = await source.searchSchemas('em310');
    expect(hits).toHaveLength(1);
    expect(hits[0].nsUri).toBe(EM310_NS);
  });

  it('meldet nicht verfügbare Schemas verständlich', async () => {
    await expect(source.loadSchemaPackages('http://unbekannt/ns')).rejects.toThrow(
      /nicht verfügbar/,
    );
  });
});

describe('collectReferencedDocuments', () => {
  it('findet href-, eSuperTypes- und eType-Referenzen ohne Lokales/Ecore', () => {
    const refs = collectReferencedDocuments(em310Xml);
    expect(refs).toEqual([LORAWAN_NS]);
  });
});

describe('loadSchemaWithDependencies (T11)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch({ [EM310_NS]: em310Xml, [LORAWAN_NS]: lorawanXml }));
  });

  it('lädt referenzierte Modelle automatisch nach', async () => {
    const source = new AtlasModelSource(
      new ModelAtlasClient({ baseUrl: 'http://atlas.test/rest' }),
      'sensors',
      'release',
    );
    const result = await loadSchemaWithDependencies(source, EM310_NS);

    expect(result.loadedDependencies).toEqual([LORAWAN_NS]);
    expect(result.unresolved).toEqual([]);
    expect((result.rootPackage as EPackage).getNsURI()).toBe(EM310_NS);

    // Geerbte Felder aus dem nachgeladenen lorawan-Package sind navigierbar
    const uplink = result.rootPackage.getEClassifier('EM310UDLUplink') as EClass;
    const labels = enumerateFeaturePaths(uplink).map((p) => p.label);
    expect(labels).toContain('deviceInfo → deviceName');
    expect(labels).toContain('object → battery');
  });

  it('meldet nicht auflösbare Referenzen statt zu scheitern', async () => {
    const source = new AtlasModelSource(
      new ModelAtlasClient({ baseUrl: 'http://atlas.test/rest' }),
      'sensors',
      'release',
    );
    vi.stubGlobal('fetch', mockFetch({ [EM310_NS]: em310Xml })); // lorawan fehlt
    const result = await loadSchemaWithDependencies(source, EM310_NS);
    expect(result.unresolved).toEqual([LORAWAN_NS]);
    expect(result.rootPackage.getNsURI()).toBe(EM310_NS);
  });
});

describe('findMissingReferences (Upload-Hinweis)', () => {
  it('erkennt fehlende Begleitdateien', () => {
    const em310Local = readFileSync(path.join(FIXTURES, 'em310udl-message.ecore'), 'utf-8');
    expect(findMissingReferences([{ name: 'em310udl-message.ecore', content: em310Local }])).toEqual([
      'lorawan-uplink.ecore',
    ]);
    expect(
      findMissingReferences([
        { name: 'em310udl-message.ecore', content: em310Local },
        { name: 'lorawan-uplink.ecore', content: lorawanXml },
      ]),
    ).toEqual([]);
  });
});

describe('Veröffentlichen im Atlas (T17)', () => {
  const scopeWithRegistriesXmi = `<?xml version="1.0" encoding="UTF-8"?>
<workflowapi:Scope xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:workflowapi="http://eclipse.org/fennec/model/atlas/workflow/api/1.0.0"
    name="sensors">
  <registries name="schema" description="Ecore-Schemas">
    <stages name="draft" writable="true" final="false"/>
    <stages name="release" writable="false" final="true"/>
  </registries>
  <registries name="mappings" description="SensiNact-Mappings">
    <stages name="draft" writable="true" final="false"/>
    <stages name="release" writable="true" final="true"/>
  </registries>
</workflowapi:Scope>`;

  it('parst Registries samt Stage-Flags', () => {
    const registries = parseScopeRegistries(scopeWithRegistriesXmi);
    expect(registries.map((r) => r.name)).toEqual(['schema', 'mappings']);
    const mappings = registries[1];
    expect(mappings.description).toBe('SensiNact-Mappings');
    expect(mappings.stages).toEqual([
      { name: 'draft', writable: true, final: false },
      { name: 'release', writable: true, final: true },
    ]);
    // schema/release ist nicht beschreibbar → für Uploads ausgeschlossen
    expect(registries[0].stages.filter((st) => st.writable).map((st) => st.name)).toEqual(['draft']);
  });

  it('lädt ein Objekt mit Content-Type application/xmi hoch', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init: RequestInit) => {
        calls.push({ url: String(url), init });
        if (String(url).endsWith('/scopes/sensors')) return new Response(scopeWithRegistriesXmi, { status: 200 });
        return new Response('<ok/>', { status: 201 });
      }),
    );
    const source = new AtlasModelSource(
      new ModelAtlasClient({ baseUrl: 'http://atlas.test/rest', token: 'geheim' }),
      'sensors',
      'release',
    );
    expect(source.canPublish).toBe(true);
    expect((await source.listRegistries()).map((r) => r.name)).toEqual(['schema', 'mappings']);

    await source.publishObject('mappings', 'draft', 'demo-mapping.xmi', '<mapping:ProviderMapping/>', {
      name: 'Mapping Demo',
      override: true,
    });
    const upload = calls.find((c) => c.init?.method === 'POST')!;
    expect(upload.url).toBe(
      'http://atlas.test/rest/sensors/registries/mappings/stages/draft/demo-mapping.xmi?name=Mapping+Demo&override=true',
    );
    const headers = upload.init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/xmi');
    expect(headers.Authorization).toBe('Bearer geheim');
    expect(upload.init.body).toBe('<mapping:ProviderMapping/>');
  });

  it('meldet Server-Fehler verständlich', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('stage is read-only', { status: 409 })),
    );
    const source = new AtlasModelSource(
      new ModelAtlasClient({ baseUrl: 'http://atlas.test/rest' }),
      'sensors',
      'release',
    );
    await expect(
      source.publishObject('mappings', 'release', 'x.xmi', '<x/>'),
    ).rejects.toThrow(/HTTP 409.*read-only/);
  });
});

/**
 * Echte Antwort eines Fennec-Atlas (Scope „jena"): objectId ist eine UUID, die
 * nsURI steckt Java-serialisiert in der Property `nsUri`. Wird sie nicht
 * dekodiert, adressiert der Content-Endpunkt ins Leere (HTTP 204).
 */
describe('parseSchemaList mit UUID-objectIds', () => {
  it('liest die nsURI aus der Property statt aus der objectId', () => {
    const xmi = readFileSync(path.join(FIXTURES, 'atlas-schema-list-uuid.xml'), 'utf-8');
    const schemas = parseSchemaList(xmi);

    expect(schemas.length).toBeGreaterThanOrEqual(2);
    const waterpark = schemas.find((s) => s.name === 'waterpark_domain')!;
    expect(waterpark.objectId).toMatch(/^[0-9a-f-]{36}$/);
    expect(waterpark.nsUri).toBe('http://data-in-motion.biz/waterparc/domain');

    const m5airq = schemas.find((s) => s.name === 'm5airq')!;
    expect(m5airq.nsUri).toBe('https://datainmotion.de/demo/m5airq/1.0');
  });
});
