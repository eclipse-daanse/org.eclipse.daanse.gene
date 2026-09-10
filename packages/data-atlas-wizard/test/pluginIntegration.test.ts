/**
 * Verdrahtung mit der gene-Shell (Umsetzungsschritt 11).
 *
 * Das Plugin wird vom Dev-Server über `manifest.json` selbst gefunden, aber
 * **geladen** wird es nur, wenn es in den `startupModules` steht — und die
 * werden an zwei Stellen geführt: `src/tsm/repositories.config.ts` und
 * `public/config.xmi`. `src/main.ts` nimmt die Liste aus der XMI und benutzt
 * die TypeScript-Liste nur als Fallback, wenn jene leer ist. Fehlt der
 * Eintrag in der XMI, erscheint die Perspektive nicht — ohne Fehlermeldung.
 * Genau das ist bei drei anderen Modulen passiert.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const paket = join(dirname(fileURLToPath(import.meta.url)), '..');
const gene = join(paket, '..', '..');
const lies = (p: string) => readFileSync(join(gene, p), 'utf-8');

const manifest = JSON.parse(readFileSync(join(paket, 'manifest.json'), 'utf-8'));

describe('startupModules', () => {
  it('steht in repositories.config.ts', () => {
    const inhalt = lies('src/tsm/repositories.config.ts');
    const liste = inhalt.slice(inhalt.indexOf('export const startupModules'));
    expect(liste).toContain(`'${manifest.id}'`);
  });

  it('steht auch in public/config.xmi — sonst lädt es nicht', () => {
    expect(lies('public/config.xmi')).toContain(`<startupModules>${manifest.id}</startupModules>`);
  });

  it('das vitest-Projekt ist eingetragen', () => {
    expect(lies('vitest.config.ts')).toContain(`'packages/${manifest.id}'`);
  });
});

describe('Manifest', () => {
  it('nennt Einstieg, Abhängigkeiten und den Opener-Dienst', () => {
    expect(manifest.entry).toBe('src/plugin/index.ts');
    expect(manifest.dependencies).toContain('gene-app');
    expect(manifest.dependencies).toContain('ui-layout');
    expect(manifest.provides.map((p: { id: string }) => p.id)).toContain(
      'ui.data-atlas-wizard.open',
    );
  });

  it('die Shared Libraries stehen drin, statt gebündelt zu werden', () => {
    const geteilt = manifest.sharedDependencies.map((d: { id: string }) => d.id);
    expect(geteilt).toContain('vue');
    expect(geteilt).toContain('@emfts/core');
    expect(geteilt).toContain('@emfts/uimodel-composer');
  });

  it('die optionalen Abhängigkeiten sind nur optional', () => {
    // atlas-browser und storage-model-atlas liefern den besseren Client,
    // aber der Assistent läuft auch ohne sie.
    expect(manifest.optionalDependencies).toContain('storage-model-atlas');
    expect(manifest.dependencies).not.toContain('storage-model-atlas');
  });
});

describe('Plugin-Einstieg', () => {
  it('exportiert activate und deactivate', async () => {
    const modul = await import('../src/plugin/index');
    expect(typeof modul.activate).toBe('function');
    expect(typeof modul.deactivate).toBe('function');
  });

  it('registriert Perspektive, Panel, Activity und den Opener', async () => {
    const modul = await import('../src/plugin/index');
    const registriert: string[] = [];
    const registry = {
      register: (o: { id: string }) => registriert.push(`registry:${o.id}`),
      unregister: () => undefined,
    };
    const dienste = new Map<string, unknown>([
      ['ui.registry.perspectives', { registry, switchTo: () => undefined }],
      ['ui.registry.panels', registry],
      ['ui.registry.activities', registry],
    ]);
    const context = {
      services: {
        get: (id: string) => dienste.get(id),
        register: (id: string) => registriert.push(`service:${id}`),
        unregister: () => undefined,
      },
      getModule: () => undefined,
      log: { info: () => undefined, warn: () => undefined, error: () => undefined },
    };
    await modul.activate(context as never);

    expect(registriert).toContain('registry:data-atlas-config');
    expect(registriert).toContain('registry:data-atlas-wizard');
    expect(registriert).toContain('registry:data-atlas-config-wizard');
    expect(registriert).toContain('service:ui.data-atlas-wizard.open');
  });
});
