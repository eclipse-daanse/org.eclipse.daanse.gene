/**
 * Gerüst-Test (Umsetzungsschritt 1).
 *
 * Hält die Verdrahtung fest, die man sonst erst im laufenden gene bemerkt:
 * Manifest-Id, Einstiegspunkt und die beiden eingecheckten Metamodell-Kopien.
 * Nebenbei hält er das vitest-Projekt nicht-leer — ein Projekt ohne Testdatei
 * lässt den Gesamtlauf scheitern.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf-8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

describe('Paketgerüst', () => {
  it('Manifest-Id und Paketname stimmen überein', () => {
    // Der TSM-Loader adressiert das Modul über die Manifest-Id; startupModules
    // in repositories.config.ts und public/config.xmi nennen denselben Namen.
    expect(manifest.id).toBe('data-atlas-wizard');
    expect(pkg.name).toBe(manifest.id);
  });

  it('der Einstiegspunkt existiert', () => {
    expect(existsSync(join(root, manifest.entry))).toBe(true);
  });

  it('das Paket endet auf -wizard', () => {
    // Das gene-vitest-Projekt exkludiert `packages/*-wizard/**`; ohne diese
    // Endung liefen die Tests zweimal, einmal mit der falschen Umgebung.
    expect(pkg.name.endsWith('-wizard')).toBe(true);
  });

  it('die Metamodell-Kopien liegen bereit', () => {
    const konfiguration = readFileSync(join(root, 'src/assets/configuration.ecore'), 'utf-8');
    expect(konfiguration).toContain('nsURI="https://eclipse.org/fennec/data/atlas/configuration/1.0.0"');
    expect(konfiguration).toContain('name="DataAtlasConfiguration"');

    const eorm = readFileSync(join(root, 'src/assets/eorm.ecore'), 'utf-8');
    expect(eorm).toContain('name="EntityMappings"');
  });

  it('gene-Module stehen nicht in den dependencies', () => {
    // Cross-Plugin-Zugriff läuft über TSM-Services, nicht über Imports —
    // sonst zöge der Plugin-Build fremde Module ins Bundle.
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const verboten of ['gene-app', 'ui-layout', 'ui-model-browser', 'storage-model-atlas']) {
      expect(deps).not.toContain(verboten);
    }
  });
});
