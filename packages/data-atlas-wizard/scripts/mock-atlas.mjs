/** Mock-Modelatlas für den E2E-Test des Wizards (Port 8199). */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('../test/fixtures', import.meta.url).pathname;
const LORAWAN_NS = 'https://eclipse.org/fennec/lorawan';
const EM310_NS = 'http://www.example.org/lorawan/specific/em310udl';

const TESTDATA = new URL('../test-data', import.meta.url).pathname;
const schemas = {
  [LORAWAN_NS]: readFileSync(`${FIXTURES}/lorawan-uplink.ecore`, 'utf-8'),
  [EM310_NS]: readFileSync(`${FIXTURES}/em310udl-message.ecore`, 'utf-8')
    .replaceAll('lorawan-uplink.ecore#', `${LORAWAN_NS}#`),
  'https://example.org/dragino': readFileSync(`${FIXTURES}/dragino-message.ecore`, 'utf-8')
    .replaceAll('lorawan-uplink.ecore#', `${LORAWAN_NS}#`),
  // Multi-Nachrichtentyp-Demo (B1/#146): zwei Uplink-Typen desselben Geräts
  'https://example.org/demo/multisensor/base': readFileSync(`${TESTDATA}/multisensor-base.ecore`, 'utf-8'),
  'https://example.org/demo/multisensor/measurement': readFileSync(`${TESTDATA}/multisensor-measurement.ecore`, 'utf-8'),
  'https://example.org/demo/multisensor/status': readFileSync(`${TESTDATA}/multisensor-status.ecore`, 'utf-8'),
  'http://cdc.dwd.de/common/weather': readFileSync(new URL('../../emf.util/org.eclipse.fennec.sensinact.mapping/model/dwd-weather.ecore', import.meta.url).pathname, 'utf-8'),
};

/** Hochgeladene Objekte: registry → stage → objectId → {content, name, contentType} */
const objects = new Map();

const b64 = (s) => Buffer.from(s, 'utf-8').toString('base64');
const metadataXmi = (entries) => `<?xml version="1.0" encoding="UTF-8"?>
<mgmt:ObjectMetadataContainer xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:mgmt="http://eclipse.org/fennec/model/atlas/management/1.0.0">
${entries.map((ns) => `  <metadata objectId="${b64(ns)}" objectName="${ns.split('/').pop()}" objectType="EPackage" stage="release" scope="sensors" registry="schema" version="1.0" contentHash="x" uploadUser="mock" uploadTime="now" sourceChannel="mock"/>`).join('\n')}
</mgmt:ObjectMetadataContainer>`;

const scopesXmi = `<?xml version="1.0" encoding="UTF-8"?>
<workflowapi:ScopeListResponse xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:workflowapi="http://eclipse.org/fennec/model/atlas/workflow/api/1.0.0">
  <scopes name="sensors" description="Sensor-Modelle (Mock)"/>
</workflowapi:ScopeListResponse>`;

const scopeXmi = `<?xml version="1.0" encoding="UTF-8"?>
<workflowapi:Scope xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:workflowapi="http://eclipse.org/fennec/model/atlas/workflow/api/1.0.0"
    name="sensors" description="Sensor-Modelle (Mock)">
  <registries name="schema" description="Ecore-Schemas">
    <stages name="draft" writable="true" final="false"/>
    <stages name="release" writable="false" final="true"/>
    <allowedTransitions fromStage="draft" toStage="release"/>
  </registries>
  <registries name="mappings" description="SensiNact-Mappings">
    <stages name="draft" writable="true" final="false"/>
    <stages name="release" writable="true" final="true"/>
    <allowedTransitions fromStage="draft" toStage="release"/>
  </registries>
</workflowapi:Scope>`;

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Content-Type', 'application/xml');

  // CORS-Preflight: Ein POST mit Content-Type application/xmi ist kein
  // „simple request" — der Browser fragt vorher per OPTIONS. Ohne Antwort
  // hier scheitert das Veröffentlichen aus der Web-UI mit „Failed to fetch".
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  const ok = (body) => { res.statusCode = 200; res.end(body); };
  const notFound = () => { res.statusCode = 404; res.end('not found'); };

  console.log(req.method, req.url);

  // Upload: POST /rest/{scope}/registries/{registry}/stages/{stage}/{objectId}
  const uploadMatch = url.pathname.match(
    /^\/rest\/([^/]+)\/registries\/([^/]+)\/stages\/([^/]+)\/([^/]+)$/,
  );
  if (req.method === 'POST' && uploadMatch) {
    const [, scope, registry, stage, objectId] = uploadMatch.map(decodeURIComponent);
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const key = `${registry}/${stage}`;
      if (!objects.has(key)) objects.set(key, new Map());
      objects.get(key).set(objectId, {
        content: body,
        name: url.searchParams.get('name') ?? objectId,
        contentType: req.headers['content-type'] ?? '',
      });
      console.log(
        `  → gespeichert: ${scope}/${registry}/${stage}/${objectId} ` +
          `(${body.length} B, ${req.headers['content-type']})`,
      );
      res.statusCode = 201;
      res.end(`<?xml version="1.0" encoding="UTF-8"?><ok objectId="${objectId}"/>`);
    });
    return;
  }

  // Liste hochgeladener Objekte einer Registry-Stage
  const listMatch = url.pathname.match(/^\/rest\/([^/]+)\/registries\/([^/]+)\/stages\/([^/]+)$/);
  if (req.method === 'GET' && listMatch) {
    const [, , registry, stage] = listMatch.map(decodeURIComponent);
    const stored = objects.get(`${registry}/${stage}`) ?? new Map();
    const entries = [...stored.entries()].map(
      ([id, o]) =>
        `  <metadata objectId="${id}" objectName="${o.name}" objectType="ProviderMapping" stage="${stage}" scope="sensors" registry="${registry}" version="1.0" contentHash="x" uploadUser="mock" uploadTime="now" sourceChannel="mock"/>`,
    );
    return ok(`<?xml version="1.0" encoding="UTF-8"?>
<mgmt:ObjectMetadataContainer xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:mgmt="http://eclipse.org/fennec/model/atlas/management/1.0.0">
${entries.join('\n')}
</mgmt:ObjectMetadataContainer>`);
  }

  if (url.pathname === '/rest/scopes') return ok(scopesXmi);
  if (url.pathname === '/rest/scopes/sensors') return ok(scopeXmi);
  if (url.pathname === '/rest/sensors/schema/stages/release/content') {
    const nsUri = url.searchParams.get('nsUri');
    return schemas[nsUri] ? ok(schemas[nsUri]) : notFound();
  }
  if (url.pathname === '/rest/sensors/schema/search') {
    const exact = url.searchParams.get('nsUriExact');
    if (exact) return ok(metadataXmi(schemas[exact] ? [exact] : []));
    const name = (url.searchParams.get('name') ?? '').toLowerCase();
    return ok(metadataXmi(Object.keys(schemas).filter((ns) => ns.toLowerCase().includes(name))));
  }
  if (url.pathname === '/rest/sensors/schema/stages/release') {
    return ok(metadataXmi(Object.keys(schemas)));
  }
  notFound();
}).listen(8199, () => console.log('Mock-Atlas auf http://localhost:8199/rest'));
