/**
 * Regression: das Feld, aus dem der Fennec-Codec den Payload-Typ liest, ist je
 * EClass konstant und darf im Namens-Picker nicht oben stehen.
 *
 * Der Anlass war ein über den Assistenten erzeugtes Mapping, das
 * `deduplicationId` als Provider-Namen wählte: alle vier Beckensensoren fielen
 * im Twin auf einen Provider zusammen und überschrieben sich gegenseitig.
 * `deduplicationId`, `sensor_id` und `area_id` trafen den Namens-Hint "id"
 * gleich stark, sodass die Modell-Reihenfolge entschied.
 */
import { describe, it, expect, beforeAll } from 'vitest';
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
import type { EClass, EPackage, XMIResource } from '@emfts/core';
import { discriminatorPathOf, enumerateFeaturePaths } from '../src/emf/featurePaths';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

let qualityClass: EClass;
let temperatureClass: EClass;
let draginoClass: EClass | null;

/**
 * Ein gemeinsames ResourceSet für alle Fixtures: dragino-message.ecore
 * referenziert seine Oberklasse **dateirelativ**
 * (`lorawan-uplink.ecore#//UplinkMessage`), die Auflösung braucht also beide
 * Dateien im selben Set — die Registrierung im EPackageRegistry genügt nicht.
 */
const rs = new BasicResourceSet();

function loadResource(fileName: string, content: string): XMIResource {
  rs.getResourceFactoryRegistry().getExtensionToFactoryMap().set('ecore', new XMIResourceFactory());
  const resource = rs.createResource(URI.createURI(fileName)) as XMIResource;
  resource.loadFromString(content);
  return resource;
}

beforeAll(() => {
  registerEcorePackage();

  const waterparkPkg = loadResource(
    'waterparc-domain.ecore',
    readFileSync(path.join(FIXTURES, 'waterparc-domain.ecore'), 'utf-8'),
  )
    .getContents()
    .get(0) as unknown as EPackage;
  EPackageRegistry.INSTANCE.set(waterparkPkg.getNsURI()!, waterparkPkg);

  qualityClass = waterparkPkg.getEClassifier('WaterQuality') as EClass;
  temperatureClass = waterparkPkg.getEClassifier('WaterTemperature') as EClass;

  // Oberklasse von DraginoLSE01Uplink — ohne dieses Paket bleibt sie ein
  // unaufgelöster Proxy und getEAllAttributes() der Bibliothek wirft.
  const lorawanPkg = loadResource(
    'lorawan-uplink.ecore',
    readFileSync(path.join(FIXTURES, 'lorawan-uplink.ecore'), 'utf-8'),
  )
    .getContents()
    .get(0) as unknown as EPackage;
  EPackageRegistry.INSTANCE.set(lorawanPkg.getNsURI()!, lorawanPkg);

  const draginoPkg = loadResource(
    'dragino-message.ecore',
    readFileSync(path.join(FIXTURES, 'dragino-message.ecore'), 'utf-8'),
  )
    .getContents()
    .get(0) as unknown as EPackage;
  EPackageRegistry.INSTANCE.set(draginoPkg.getNsURI()!, draginoPkg);
  draginoClass = (draginoPkg.getEClassifier('DraginoLSE01Uplink') ??
    draginoPkg.getEClassifier('DraginoMessage')) as EClass | null;
});

describe('discriminatorPathOf', () => {
  it('liest den Diskriminator-Pfad aus der Codec-Annotation der EClass', () => {
    // Die Annotation-Quelle traegt die mapId als variablen Suffix
    // (…/typeMapping/jena-sensors), muss also per Präfix gefunden werden.
    expect(discriminatorPathOf(qualityClass)).toBe('deduplicationId');
    expect(discriminatorPathOf(temperatureClass)).toBe('deduplicationId');
  });

  it('liefert undefined für Modelle ohne Typmapping-Annotation', () => {
    if (!draginoClass) return; // Fixture ohne passende EClass — nichts zu prüfen
    expect(discriminatorPathOf(draginoClass)).toBeUndefined();
  });

  it('faellt nicht aus, wenn eine Oberklasse unaufgelöst ist', () => {
    // Modelle aus dem Model Atlas können auf ein nicht registriertes Paket
    // verweisen; die Oberklasse ist dann ein Proxy ohne EClass-API, auf dem
    // getEAllSuperTypes() der Bibliothek wirft. Die eigene Traversierung
    // überspringt den Ast, statt den Picker ausfallen zu lassen.
    const brokenSuperType = {} as EClass;
    const stub = {
      getEAnnotations: () => [],
      getESuperTypes: () => [brokenSuperType],
    } as unknown as EClass;
    expect(() => discriminatorPathOf(stub)).not.toThrow();
    expect(discriminatorPathOf(stub)).toBeUndefined();
  });
});

describe('enumerateFeaturePaths markiert konstante Felder', () => {
  it('kennzeichnet nur den Diskriminator als konstant', () => {
    const paths = enumerateFeaturePaths(qualityClass);
    const byLabel = new Map(paths.map((p) => [p.label, p]));

    expect(byLabel.get('deduplicationId')?.constant).toBe(true);
    expect(byLabel.get('sensor_id')?.constant).toBeFalsy();
    expect(byLabel.get('area_id')?.constant).toBeFalsy();
  });

  it('markiert nichts, wenn das Modell keinen Diskriminator deklariert', () => {
    if (!draginoClass) return;
    expect(enumerateFeaturePaths(draginoClass).some((p) => p.constant)).toBe(false);
  });
});
