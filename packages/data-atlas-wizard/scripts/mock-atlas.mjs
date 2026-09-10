/**
 * Mock-Model-Atlas für den Handbetrieb des Assistenten (Port 8199).
 *
 * Genug, um den ganzen Weg ohne Docker durchzuspielen: Scope mit Registry und
 * zwei Stages, das Beispielmodell als Schema, und die Schreibpfade des
 * Publish-Flows — Schema-Upload, Objekt-Upload und Stage-Wechsel. Was
 * hochgeladen wird, bleibt im Speicher und wird protokolliert.
 *
 *   npm run mock:atlas
 *   # im Assistenten als baseUrl eintragen: http://localhost:8199/rest
 *
 * Die Antworten sind dieselben Metamodelle, die der echte Atlas benutzt
 * (workflow/api für Scopes, management für Objekt-Metadaten) — der Wizard
 * parst sie mit denselben Funktionen wie im Ernstfall.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('../test/fixtures', import.meta.url).pathname;
const PERSON_NS = 'https://eclipse.org/fennec/data/atlas/example/person/1.0.0';
const SCOPE = 'jena';

/** Schemas je Stage: stage → nsUri → Inhalt. */
const schemas = {
  draft: {},
  release: { [PERSON_NS]: readFileSync(`${FIXTURES}/person.ecore`, 'utf-8') },
};

/** Objekte: registry → stage → objectId → { content, name } */
const objects = new Map();

const b64 = (s) => Buffer.from(s, 'utf-8').toString('base64');

const scopesXmi = `<?xml version="1.0" encoding="UTF-8"?>
<workflowapi:ScopeListResponse xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:workflowapi="http://eclipse.org/fennec/model/atlas/workflow/api/1.0.0">
  <scopes name="${SCOPE}" description="Data-Atlas-Konfigurationen (Mock)"/>
</workflowapi:ScopeListResponse>`;

const scopeXmi = `<?xml version="1.0" encoding="UTF-8"?>
<workflowapi:Scope xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:workflowapi="http://eclipse.org/fennec/model/atlas/workflow/api/1.0.0"
    name="${SCOPE}" description="Data-Atlas-Konfigurationen (Mock)">
  <registries name="schema" description="Ecore-Schemas">
    <stages name="draft" writable="true" final="false"/>
    <stages name="release" writable="true" final="true"/>
    <allowedTransitions fromStage="draft" toStage="release"/>
  </registries>
  <registries name="configurations" description="Data-Atlas-Konfigurationen">
    <stages name="draft" writable="true" final="false"/>
    <stages name="release" writable="true" final="true"/>
    <allowedTransitions fromStage="draft" toStage="release"/>
  </registries>
</workflowapi:Scope>`;

const metadataXmi = (nsUris, stage) => `<?xml version="1.0" encoding="UTF-8"?>
<mgmt:ObjectMetadataContainer xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:mgmt="http://eclipse.org/fennec/model/atlas/management/1.0.0">
${nsUris
  .map(
    (ns) =>
      `  <metadata objectId="${b64(ns)}" objectName="${ns.split('/').slice(-2)[0]}" objectType="EPackage"` +
      ` stage="${stage}" scope="${SCOPE}" registry="schema" version="1.0" contentHash="x"` +
      ` uploadUser="mock" uploadTime="now" sourceChannel="mock"/>`,
  )
  .join('\n')}
</mgmt:ObjectMetadataContainer>`;

const leseRumpf = (req) =>
  new Promise((resolve) => {
    let daten = '';
    req.on('data', (teil) => (daten += teil));
    req.on('end', () => resolve(daten));
  });

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pfad = url.pathname.replace(/^\/rest/, '');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Content-Type', 'application/xml');

  // CORS-Preflight: Ein POST mit Content-Type application/xmi ist kein
  // „simple request" — ohne Antwort hier scheitert das Veröffentlichen aus
  // dem Browser mit „Failed to fetch".
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const ok = (body, status = 200) => {
    res.statusCode = status;
    res.end(body ?? '');
  };
  const notFound = () => {
    res.statusCode = 404;
    res.end('not found');
  };

  console.log(req.method, req.url);

  // ── Scopes ───────────────────────────────────────────────────────────────
  if (pfad === '/scopes') return ok(scopesXmi);
  if (pfad === `/scopes/${SCOPE}`) return ok(scopeXmi);

  // ── Schemas ──────────────────────────────────────────────────────────────
  const schemaStage = pfad.match(new RegExp(`^/${SCOPE}/schema/stages/([^/]+)$`));
  if (schemaStage) {
    const stage = schemaStage[1];
    schemas[stage] ??= {};
    if (req.method === 'POST') {
      const nsUri = url.searchParams.get('nsUri');
      if (!nsUri) return ok('nsUri fehlt', 400);
      schemas[stage][nsUri] = await leseRumpf(req);
      console.log(`   → Schema ${nsUri} in ${stage} abgelegt`);
      return ok('', 201);
    }
    const nsUri = url.searchParams.get('nsUri');
    if (nsUri) {
      return schemas[stage][nsUri] ? ok(metadataXmi([nsUri], stage)) : notFound();
    }
    return ok(metadataXmi(Object.keys(schemas[stage]), stage));
  }

  const schemaContent = pfad.match(new RegExp(`^/${SCOPE}/schema/stages/([^/]+)/content$`));
  if (schemaContent) {
    const inhalt = schemas[schemaContent[1]]?.[url.searchParams.get('nsUri')];
    return inhalt ? ok(inhalt) : notFound();
  }

  if (pfad === `/${SCOPE}/schema/search`) {
    const exakt = url.searchParams.get('nsUriExact');
    const alle = [...new Set(Object.values(schemas).flatMap((s) => Object.keys(s)))];
    const treffer = exakt ? alle.filter((ns) => ns === exakt) : alle;
    return ok(metadataXmi(treffer, 'release'));
  }

  // ── Stage-Wechsel ────────────────────────────────────────────────────────
  const transition = pfad.match(
    new RegExp(`^/${SCOPE}/registries/([^/]+)/stages/([^/]+)/actions/transition$`),
  );
  if (transition && req.method === 'POST') {
    const rumpf = await leseRumpf(req);
    const id = /objectId="([^"]+)"/.exec(rumpf)?.[1];
    const ziel = /targetStage="([^"]+)"/.exec(rumpf)?.[1];
    const [, registry, von] = transition;
    const eintrag = objects.get(registry)?.[von]?.[id];
    if (!eintrag) return notFound();
    objects.get(registry)[ziel] ??= {};
    objects.get(registry)[ziel][id] = eintrag;
    console.log(`   → ${id} von ${von} nach ${ziel} geschoben`);
    return ok('', 204);
  }

  // ── Objekte ──────────────────────────────────────────────────────────────
  const objekt = pfad.match(new RegExp(`^/${SCOPE}/registries/([^/]+)/stages/([^/]+)/([^/]+)$`));
  if (objekt) {
    const [, registry, stage, objectId] = objekt;
    if (req.method === 'POST') {
      const content = await leseRumpf(req);
      if (!objects.has(registry)) objects.set(registry, {});
      objects.get(registry)[stage] ??= {};
      objects.get(registry)[stage][objectId] = {
        content,
        name: url.searchParams.get('name') ?? objectId,
      };
      console.log(`   → Objekt ${objectId} in ${registry}/${stage} (${content.length} Bytes)`);
      return ok('', 201);
    }
    const eintrag = objects.get(registry)?.[stage]?.[objectId];
    return eintrag ? ok(eintrag.content) : notFound();
  }

  const objektListe = pfad.match(new RegExp(`^/${SCOPE}/registries/([^/]+)/stages/([^/]+)$`));
  if (objektListe) {
    const [, registry, stage] = objektListe;
    return ok(metadataXmi(Object.keys(objects.get(registry)?.[stage] ?? {}), stage));
  }

  return notFound();
}).listen(8199, () =>
  console.log(
    `Mock-Model-Atlas auf http://localhost:8199/rest\n` +
      `  Scope „${SCOPE}", Registries „schema" und „configurations", Stages draft/release\n` +
      `  ${PERSON_NS} liegt in release`,
  ),
);
