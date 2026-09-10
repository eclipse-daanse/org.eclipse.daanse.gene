/**
 * Publish-Flow (Umsetzungsschritt 10, Plan Abschnitt 5).
 *
 * Geprüft wird gegen einen Stellvertreter für `AtlasModelSource`: die
 * Reihenfolge der Schemas in **beiden** Stages, die Wiederholung bei 5xx, der
 * Stage-Wechsel und der Abbruch, wenn ein Schema fehlt und nicht geladen
 * werden darf. Alles Regeln, die sich am Referenz-Setup des data.atlas-Repos
 * ablesen und im Browser nur schwer nachstellen lassen.
 */
import { describe, expect, it, vi } from 'vitest';
import type { AtlasModelSource } from '../src/atlas/atlasSource';
import {
  PublishError,
  publishConfiguration,
  type PublishTarget,
  type RequiredSchema,
} from '../src/atlas/publish';

const SCHEMAS: RequiredSchema[] = [
  { nsUri: 'https://eclipse.org/fennec/persistence/eorm/1.0.0', name: 'eorm', content: '<eorm/>' },
  {
    nsUri: 'https://eclipse.org/fennec/data/atlas/configuration/1.0.0',
    name: 'configuration',
    content: '<configuration/>',
  },
  {
    nsUri: 'https://eclipse.org/fennec/data/atlas/example/person/1.0.0',
    name: 'person',
    content: '<person/>',
  },
];

const ZIEL: PublishTarget = {
  registry: 'configurations',
  stage: 'draft',
  targetStage: 'release',
  objectId: 'dataatlas',
  objectName: 'dataatlas',
};

/** Aufzeichnender Stellvertreter — nur was publish.ts wirklich benutzt. */
function fakeSource(overrides: Partial<Record<string, unknown>> = {}) {
  const aufrufe: string[] = [];
  const source = {
    aufrufe,
    canUploadSchemas: true,
    canTransition: true,
    hasSchema: vi.fn(async (stage: string, nsUri: string) => {
      aufrufe.push(`has:${stage}:${kurz(nsUri)}`);
      return false;
    }),
    uploadSchema: vi.fn(async (stage: string, _content: string, options?: { nsUri?: string }) => {
      aufrufe.push(`schema:${stage}:${kurz(options?.nsUri ?? '')}`);
    }),
    publishObject: vi.fn(async (registry: string, stage: string, objectId: string) => {
      aufrufe.push(`upload:${registry}/${stage}/${objectId}`);
    }),
    transitionObject: vi.fn(async (registry: string, from: string, id: string, to: string) => {
      aufrufe.push(`transition:${registry}/${from}->${to}/${id}`);
    }),
    ...overrides,
  };
  return source as unknown as AtlasModelSource & { aufrufe: string[] };
}

const kurz = (nsUri: string) =>
  nsUri.includes('eorm') ? 'eorm' : nsUri.includes('configuration') ? 'config' : 'person';

describe('Reihenfolge', () => {
  it('Schemas in beide Stages, eorm zuerst, dann configuration, dann Domäne', async () => {
    const source = fakeSource();
    await publishConfiguration(source, ZIEL, SCHEMAS, '<xmi/>', { retryDelayMs: 0 });

    expect(source.aufrufe).toEqual([
      'has:draft:eorm',
      'schema:draft:eorm',
      'has:draft:config',
      'schema:draft:config',
      'has:draft:person',
      'schema:draft:person',
      'has:release:eorm',
      'schema:release:eorm',
      'has:release:config',
      'schema:release:config',
      'has:release:person',
      'schema:release:person',
      'upload:configurations/draft/dataatlas',
      'transition:configurations/draft->release/dataatlas',
    ]);
  });

  it('ohne Stage-Wechsel bleibt es bei einer Stage', async () => {
    const source = fakeSource();
    await publishConfiguration(
      source,
      { ...ZIEL, targetStage: undefined },
      SCHEMAS,
      '<xmi/>',
      { retryDelayMs: 0 },
    );
    expect(source.aufrufe.filter((a) => a.startsWith('has:release'))).toEqual([]);
    expect(source.aufrufe.some((a) => a.startsWith('transition:'))).toBe(false);
  });

  it('vorhandene Schemas werden nicht erneut geladen', async () => {
    const source = fakeSource({
      hasSchema: vi.fn(async (_stage: string, nsUri: string) => nsUri.includes('eorm')),
    });
    const schritte = await publishConfiguration(source, ZIEL, SCHEMAS, '<xmi/>', {
      retryDelayMs: 0,
    });
    const eorm = schritte.filter((s) => s.label.includes('eorm'));
    expect(eorm.every((s) => s.state === 'uebersprungen')).toBe(true);
    expect(eorm[0].detail).toMatch(/liegt bereits/);
  });
});

describe('Wiederholung', () => {
  it('5xx wird wiederholt — die Stage-Sicht holt asynchron auf', async () => {
    let versuche = 0;
    const source = fakeSource({
      publishObject: vi.fn(async () => {
        versuche++;
        if (versuche < 3) throw new Error('Upload fehlgeschlagen (HTTP 500): Error de-serializing incoming data');
      }),
    });
    const schritte = await publishConfiguration(source, ZIEL, SCHEMAS, '<xmi/>', {
      retryDelayMs: 0,
    });
    expect(versuche).toBe(3);
    expect(schritte.find((s) => s.label.startsWith('Konfiguration'))?.detail).toMatch(/3\. Versuch/);
  });

  it('nach der letzten Wiederholung wird geworfen', async () => {
    const source = fakeSource({
      publishObject: vi.fn(async () => {
        throw new Error('Upload fehlgeschlagen (HTTP 503)');
      }),
    });
    await expect(
      publishConfiguration(source, ZIEL, SCHEMAS, '<xmi/>', { retryDelayMs: 0, maxAttempts: 3 }),
    ).rejects.toBeInstanceOf(PublishError);
    expect((source as unknown as { publishObject: { mock: { calls: unknown[] } } }).publishObject.mock.calls).toHaveLength(3);
  });

  it('ein 4xx wird nicht wiederholt — das wird nicht besser', async () => {
    const source = fakeSource({
      publishObject: vi.fn(async () => {
        throw new Error('Upload fehlgeschlagen (HTTP 403): read-only stage');
      }),
    });
    await expect(
      publishConfiguration(source, ZIEL, SCHEMAS, '<xmi/>', { retryDelayMs: 0 }),
    ).rejects.toThrow(/403/);
    expect((source as unknown as { publishObject: { mock: { calls: unknown[] } } }).publishObject.mock.calls).toHaveLength(1);
  });
});

describe('Abbruch', () => {
  it('fehlendes Schema und kein Schreibrecht: Abbruch vor dem Instanz-Upload', async () => {
    const source = fakeSource({ canUploadSchemas: false });
    await expect(
      publishConfiguration(source, ZIEL, SCHEMAS, '<xmi/>', { retryDelayMs: 0 }),
    ).rejects.toThrow(/fehlt in der Stage draft/);
    // Der Instanz-Upload darf dann nicht passiert sein
    expect(source.aufrufe.some((a) => a.startsWith('upload:'))).toBe(false);
  });

  it('der Fehler nennt das fehlende Schema und trägt die Schritte', async () => {
    const source = fakeSource({ canUploadSchemas: false });
    try {
      await publishConfiguration(source, ZIEL, SCHEMAS, '<xmi/>', { retryDelayMs: 0 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PublishError);
      const fehler = e as PublishError;
      expect(fehler.message).toMatch(/eorm/);
      expect(fehler.steps.at(-1)?.state).toBe('fehler');
    }
  });

  it('ein fehlgeschlagener Stage-Wechsel meldet sich, der Upload bleibt bestehen', async () => {
    const source = fakeSource({
      transitionObject: vi.fn(async () => {
        throw new Error('Transition fehlgeschlagen (HTTP 409)');
      }),
    });
    try {
      await publishConfiguration(source, ZIEL, SCHEMAS, '<xmi/>', { retryDelayMs: 0 });
      expect.unreachable();
    } catch (e) {
      const fehler = e as PublishError;
      expect(fehler.message).toMatch(/Stage-Wechsel/);
      expect(fehler.steps.find((s) => s.label.startsWith('Konfiguration'))?.state).toBe('fertig');
    }
  });
});

describe('Fortschritt', () => {
  it('jede Änderung wird gemeldet', async () => {
    const source = fakeSource();
    const meldungen: number[] = [];
    await publishConfiguration(source, ZIEL, SCHEMAS, '<xmi/>', {
      retryDelayMs: 0,
      onProgress: (steps) => meldungen.push(steps.length),
    });
    // 6 Schemas + Upload + Transition = 8 Schritte, jeder mindestens zweimal
    expect(Math.max(...meldungen)).toBe(8);
    expect(meldungen.length).toBeGreaterThanOrEqual(16);
  });
});

describe('requiredSchemas', () => {
  it('Reihenfolge und Inhalte', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { registerEcoreFromString, setupPackages } = await import('../src/emf/setup');
    const { initSetup, setup } = await import('../src/wizard/context');
    const { requiredSchemas } = await import('../src/transform/requiredSchemas');

    await setupPackages();
    const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
    const person = registerEcoreFromString(
      readFileSync(join(fixtures, 'person.ecore'), 'utf-8'),
      'model/person.ecore',
    );
    initSetup(person);

    const schemas = requiredSchemas(setup.value!);
    // eorm zuerst: configuration.ecore verweist darauf
    expect(schemas.map((s) => s.name)).toEqual(['eorm', 'configuration', 'person']);
    expect(schemas[0].nsUri).toBe('https://eclipse.org/fennec/persistence/eorm/1.0.0');
    expect(schemas[1].content).toContain('name="DataAtlasConfiguration"');
    // Das Domänenmodell kommt aus seiner Resource zurück
    expect(schemas[2].content).toContain('name="Person"');
  });

  it('ein Modell ohne Quelltext wird gemeldet, nicht stillschweigend ausgelassen', async () => {
    const { setupPackages } = await import('../src/emf/setup');
    const { requiredSchemas } = await import('../src/transform/requiredSchemas');
    await setupPackages();

    const ohneResource = {
      getNsURI: () => 'http://ohne/quelle/1.0',
      getName: () => 'ohnequelle',
      eResource: () => null,
    };
    const setupAttrappe = {
      modelFiles: [{ modelPackage: ohneResource, fileName: 'model/x.ecore' }],
    };
    expect(() => requiredSchemas(setupAttrappe as never)).toThrowError(/kein Quelltext/);
  });
});
