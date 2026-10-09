/**
 * The wizard reads Atlas answers with the management model gene takes 1:1 from
 * eclipse-fennec/model.atlas (kept by storage-model-atlas, see its SOURCE).
 * The listing is a real answer of model.modelatlas.cloud, shortened - objects
 * with diagnostics, which the wizard's own former copy did not know.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { registerAtlasApiPackages, parseObjectList } from '../src/atlas/atlasSource';

const ATLAS_MODEL = path.join(__dirname, '..', '..', 'storage-model-atlas', 'src');

describe('Atlas management model in the wizard', () => {
  it('reads a real object listing with diagnostics without complaints', () => {
    const complaints: string[] = [];
    const error = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { complaints.push(a.map(String).join(' ')); });
    const warn = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { complaints.push(a.map(String).join(' ')); });
    try {
      registerAtlasApiPackages(
        readFileSync(path.join(ATLAS_MODEL, 'model', 'management.ecore'), 'utf-8'),
        readFileSync(path.join(__dirname, '..', 'src', 'assets', 'atlas-workflow-api.ecore'), 'utf-8'),
      );
      const objects = parseObjectList(
        readFileSync(path.join(ATLAS_MODEL, '__tests__', 'fixtures', 'transformations-release.xml'), 'utf-8'),
      );
      expect(objects).toHaveLength(2);
      expect(objects.map((o) => o.objectId)).toContain('KarteninhaberToHistorie');
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
    expect(complaints.filter((c) => /diagnostics|children|Unknown feature/.test(c))).toEqual([]);
  });
});
