/**
 * Der Publish-Flow über echtes HTTP (Umsetzungsschritt 12, ohne Docker).
 *
 * `publish.test.ts` prüft die Reihenfolge gegen einen Stellvertreter. Hier
 * läuft derselbe Flow durch den **wirklichen** Client gegen einen kleinen
 * HTTP-Server im Test: geprüft werden die Pfade, die Query-Parameter, die
 * Content-Types und der Rumpf des Stage-Wechsels. Genau daran scheitert es
 * gegen den echten Atlas, und ein Stellvertreter würde es nie merken.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AtlasModelSource } from '../src/atlas/atlasSource';
import { ModelAtlasClient } from '../src/atlas/ModelAtlasClient';
import { publishConfiguration, type RequiredSchema } from '../src/atlas/publish';

interface Aufruf {
  method: string;
  path: string;
  contentType?: string;
  body: string;
}

const aufrufe: Aufruf[] = [];
/** nsURIs, die der Server als vorhanden meldet. */
const vorhanden = new Set<string>();
let server: Server;
let baseUrl = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (teil) => (body += teil));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      aufrufe.push({
        method: req.method ?? '',
        path: url.pathname + (url.search || ''),
        contentType: req.headers['content-type'],
        body,
      });
      res.setHeader('Content-Type', 'application/xml');

      // Existenzprüfung: GET /{scope}/schema/stages/{stage}?nsUri=…
      const schemaGet = url.pathname.match(/^\/scope\/schema\/stages\/([^/]+)$/);
      if (schemaGet && req.method === 'GET') {
        const nsUri = url.searchParams.get('nsUri') ?? '';
        if (vorhanden.has(`${schemaGet[1]}|${nsUri}`)) {
          res.statusCode = 200;
          res.end('<metadata/>');
        } else {
          res.statusCode = 404;
          res.end('not found');
        }
        return;
      }
      if (schemaGet && req.method === 'POST') {
        vorhanden.add(`${schemaGet[1]}|${url.searchParams.get('nsUri') ?? ''}`);
        res.statusCode = 201;
        res.end('');
        return;
      }
      res.statusCode = url.pathname.endsWith('/actions/transition') ? 204 : 201;
      res.end('');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const SCHEMAS: RequiredSchema[] = [
  { nsUri: 'https://eclipse.org/fennec/persistence/eorm/1.0.0', name: 'eorm', content: '<eorm/>' },
  {
    nsUri: 'https://eclipse.org/fennec/data/atlas/configuration/1.0.0',
    name: 'configuration',
    content: '<configuration/>',
  },
];

describe('Publish über HTTP', () => {
  it('spricht die Pfade und Header, die der Atlas erwartet', async () => {
    aufrufe.length = 0;
    vorhanden.clear();
    const source = new AtlasModelSource(
      new ModelAtlasClient({ baseUrl }),
      'scope',
      'draft',
    );

    const schritte = await publishConfiguration(
      source,
      {
        registry: 'configurations',
        stage: 'draft',
        targetStage: 'release',
        objectId: 'dataatlas',
        objectName: 'beispiel',
      },
      SCHEMAS,
      '<configuration:DataAtlasConfiguration/>',
      { retryDelayMs: 0 },
    );
    expect(schritte.every((s) => s.state === 'fertig' || s.state === 'uebersprungen')).toBe(true);

    // Existenzprüfung je Stage und Schema
    const pruefungen = aufrufe.filter((a) => a.method === 'GET');
    expect(pruefungen.map((a) => a.path)).toEqual([
      '/scope/schema/stages/draft?nsUri=https%3A%2F%2Feclipse.org%2Ffennec%2Fpersistence%2Feorm%2F1.0.0',
      '/scope/schema/stages/draft?nsUri=https%3A%2F%2Feclipse.org%2Ffennec%2Fdata%2Fatlas%2Fconfiguration%2F1.0.0',
      '/scope/schema/stages/release?nsUri=https%3A%2F%2Feclipse.org%2Ffennec%2Fpersistence%2Feorm%2F1.0.0',
      '/scope/schema/stages/release?nsUri=https%3A%2F%2Feclipse.org%2Ffennec%2Fdata%2Fatlas%2Fconfiguration%2F1.0.0',
    ]);

    // Schema-Upload: Kurzweg mit nsUri, Name und Version, als application/xml
    const schemaUploads = aufrufe.filter(
      (a) => a.method === 'POST' && a.path.includes('/schema/stages/'),
    );
    expect(schemaUploads).toHaveLength(4);
    expect(schemaUploads[0].path).toContain('name=eorm');
    expect(schemaUploads[0].path).toContain('version=1.0.0');
    expect(schemaUploads[0].contentType).toBe('application/xml');
    expect(schemaUploads[0].body).toBe('<eorm/>');

    // Instanz: Registry-Pfad, override, als application/xmi
    const upload = aufrufe.find((a) => a.path.startsWith('/scope/registries/configurations/stages/draft/dataatlas'))!;
    expect(upload.method).toBe('POST');
    expect(upload.path).toContain('name=beispiel');
    expect(upload.path).toContain('override=true');
    expect(upload.contentType).toBe('application/xmi');
    expect(upload.body).toContain('DataAtlasConfiguration');

    // Stage-Wechsel: XMI-Rumpf, nicht JSON — darauf antwortet der Atlas mit 500
    const wechsel = aufrufe.find((a) => a.path.endsWith('/actions/transition'))!;
    expect(wechsel.path).toBe('/scope/registries/configurations/stages/draft/actions/transition');
    expect(wechsel.contentType).toBe('application/xmi');
    expect(wechsel.body).toContain(
      '<rest:StageTransitionRequest xmlns:rest="http://eclipse.org/fennec/model/atlas/rest/1.0"',
    );
    expect(wechsel.body).toContain('objectId="dataatlas"');
    expect(wechsel.body).toContain('targetStage="release"');
  });

  it('ein vorhandenes Schema wird nicht erneut geladen', async () => {
    aufrufe.length = 0;
    vorhanden.clear();
    vorhanden.add('draft|https://eclipse.org/fennec/persistence/eorm/1.0.0');
    const source = new AtlasModelSource(new ModelAtlasClient({ baseUrl }), 'scope', 'draft');
    await publishConfiguration(
      source,
      { registry: 'configurations', stage: 'draft', objectId: 'dataatlas' },
      SCHEMAS,
      '<xmi/>',
      { retryDelayMs: 0 },
    );
    const uploads = aufrufe.filter(
      (a) => a.method === 'POST' && a.path.includes('/schema/stages/'),
    );
    expect(uploads).toHaveLength(1);
    expect(uploads[0].path).toContain('configuration');
  });
});
