import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { registerEcorePackage } from '@emfts/core';
import type { EClass } from '@emfts/core';
import { newResourceSet, registerEcoreFromString } from '../src/emf/setup';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

beforeAll(() => registerEcorePackage());

/**
 * Modelle aus dem Atlas referenzieren einander teils per Dateiname
 * (`lorawan-uplink.ecore#//UplinkMessage`). Die Resources liegen unter ihrer
 * nsURI; der URI-Converter des ResourceSets kennt die Dateinamen als Aliase
 * (emf/setup.ts) — egal, unter welchem Namen ein Modell registriert wurde.
 */
describe('Datei-Querverweise zwischen Atlas-Modellen', () => {
  const lorawan = () => readFileSync(path.join(FIXTURES, 'lorawan-uplink.ecore'), 'utf-8');
  const em310 = () => readFileSync(path.join(FIXTURES, 'em310udl-message.ecore'), 'utf-8');

  it('löst mit Paketnamen als Resource-URI auf', () => {
    const rs = newResourceSet();
    registerEcoreFromString(lorawan(), 'lorawan-uplink.ecore', rs);
    const pkg = registerEcoreFromString(em310(), 'em310udl-message.ecore', rs);
    const uplink = pkg.getEClassifier('EM310UDLUplink') as EClass;
    expect(uplink.getEAllSuperTypes().length).toBeGreaterThan(0);
    expect(uplink.getEStructuralFeature('object')).toBeTruthy();
  });

  it('löst auch mit url-kodierten nsURIs als Resource-Namen auf', () => {
    const rs = newResourceSet();
    registerEcoreFromString(lorawan(), `atlas/${encodeURIComponent('https://eclipse.org/fennec/lorawan')}.ecore`, rs);
    const pkg = registerEcoreFromString(em310(), `atlas/${encodeURIComponent('http://www.example.org/lorawan/specific/em310udl')}.ecore`, rs);
    const uplink = pkg.getEClassifier('EM310UDLUplink') as EClass;
    const [superType] = [...uplink.getESuperTypes()] as Array<EClass & { eIsProxy?: () => boolean }>;
    expect(superType?.eIsProxy?.()).toBe(false);
    expect(superType?.getName()).toBe('UplinkMessage');
    expect(uplink.getEStructuralFeature('object')).toBeTruthy();
  });
});
