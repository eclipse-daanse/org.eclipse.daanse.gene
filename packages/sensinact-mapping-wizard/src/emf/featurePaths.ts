/**
 * Enumeriert navigierbare Feld-Pfade eines Sensor-EClass — die Datenbasis für
 * alle "Wählen Sie das Feld …"-Dialoge des Assistenten.
 *
 * Ein Pfad ist eine Folge von EStructuralFeatures (Referenzen bis zum
 * abschließenden Attribut), genau das Format, das das SensiNact-Mapping als
 * featurePath/valueFeature erwartet.
 */
import type { EAttribute, EClass, EDataType, EReference, EStructuralFeature } from '@emfts/core';

/** Fachliche Wertart eines Feldes — steuert, welche Pfade ein Dialog anbietet. */
export type ValueKind = 'STRING' | 'NUMERIC' | 'BOOLEAN' | 'TEMPORAL' | 'OTHER';

export interface FeaturePathCandidate {
  /** Referenz-Segmente + abschließendes Attribut, in Navigationsreihenfolge. */
  segments: EStructuralFeature[];
  /** Anzeigetext, z. B. "deviceInfo → deviceName". */
  label: string;
  kind: ValueKind;
  /** true, wenn der Pfad eine Sammlung durchquert (collectionIndex relevant). */
  crossesCollection: boolean;
  /** Einheit aus der sensinact.mapping-Annotation des Quellattributs, falls vorhanden. */
  unit?: string;
  /** Beschreibung aus Annotationen (sensinact.mapping oder GenModel-documentation). */
  description?: string;
  /**
   * true, wenn das Feld für jede Instanz denselben Wert traegt und als
   * Provider-Name daher untauglich ist: der Codec-Typdiskriminator (siehe
   * `discriminatorPathOf`). Alle Instanzen würden auf einen Twin zusammenfallen.
   */
  constant?: boolean;
}

export interface EnumerateOptions {
  /** Nur Pfade dieser Wertarten liefern (Default: alle). */
  kinds?: ValueKind[];
  /** Maximale Navigationstiefe über Referenzen (Default 3). */
  maxDepth?: number;
}

/** Annotation-Quellen/Keys, siehe SensinactMapperConstants im emf.util-Repo. */
const ANNOTATION_MAPPING = 'sensinact.mapping';
const KEY_UNIT = 'sensinact.mapping.unit';
const KEY_DESCRIPTION = 'sensinact.mapping.description';
const ANNOTATION_GENMODEL = 'http://www.eclipse.org/emf/2002/GenModel';

/**
 * Präfix der Codec-Typmapping-Annotation. Die vollständige Quelle traegt die
 * mapId als variablen Suffix (`…/typeMapping/jena-sensors`), ein Abgleich per
 * `getEAnnotation(source)` greift also nicht — es wird über alle Annotationen
 * der EClass iteriert und auf dieses Präfix geprüft.
 */
const ANNOTATION_TYPE_MAPPING_PREFIX = 'http://eclipse.org/fennec/codec/typeMapping/';
const KEY_TYPE_DISCRIMINATOR_PATH = 'typeDiscriminatorPath';

const NUMERIC_TYPES = new Set([
  'EInt', 'EIntegerObject', 'EDouble', 'EDoubleObject', 'EFloat', 'EFloatObject',
  'ELong', 'ELongObject', 'EShort', 'EShortObject', 'EByte', 'EByteObject',
  'EBigDecimal', 'EBigInteger',
]);
const TEMPORAL_INSTANCE_CLASSES = new Set(['java.time.Instant', 'java.util.Date']);

export function classifyDataType(type: EDataType | null): ValueKind {
  if (!type) return 'OTHER';
  const name = type.getName() ?? '';
  if (name === 'EString') return 'STRING';
  if (name === 'EBoolean' || name === 'EBooleanObject') return 'BOOLEAN';
  if (NUMERIC_TYPES.has(name)) return 'NUMERIC';
  if (name === 'EDate' || TEMPORAL_INSTANCE_CLASSES.has(type.getInstanceClassName?.() ?? '')) {
    return 'TEMPORAL';
  }
  return 'OTHER';
}

function isReference(f: EStructuralFeature): f is EReference {
  return typeof (f as EReference).isContainment === 'function';
}

function annotationDetail(f: EStructuralFeature, source: string, key: string): string | undefined {
  const ann = f.getEAnnotation(source);
  if (!ann) return undefined;
  const details = ann.getDetails?.();
  if (!details) return undefined;
  const value = details.getByKey?.(key);
  return typeof value === 'string' ? value : undefined;
}

/**
 * Der Feldpfad, aus dem der Fennec-Codec den Typ eines JSON-Payloads liest —
 * z. B. `deduplicationId` oder `info.profileName`, punktsepariert relativ zur
 * EClass. Der Wert dort ist je EClass konstant (`typeDiscriminator`), weshalb
 * das Feld als Provider- oder Anzeigename nicht taugt.
 *
 * Rückgabe `undefined`, wenn die EClass (oder eine ihrer Oberklassen) keine
 * Typmapping-Annotation traegt — bei XMI-Payloads der Normalfall.
 */
export function discriminatorPathOf(eClass: EClass): string | undefined {
  for (const candidate of selfAndSuperTypes(eClass)) {
    for (const ann of candidate.getEAnnotations()) {
      if (!ann.getSource()?.startsWith(ANNOTATION_TYPE_MAPPING_PREFIX)) continue;
      const path = ann.getDetails?.()?.getByKey?.(KEY_TYPE_DISCRIMINATOR_PATH);
      if (typeof path === 'string' && path.length > 0) return path;
    }
  }
  return undefined;
}

/**
 * Die EClass selbst und ihre Oberklassen — der Codec sucht die
 * Typmapping-Annotation ebenfalls die Hierarchie hinauf (Basisklasse deklariert
 * `typeDiscriminatorPath`, konkrete Klassen den `typeDiscriminator`).
 *
 * Eigene Traversierung statt `getEAllSuperTypes()`: Modelle aus dem Model Atlas
 * können auf ein Paket verweisen, das (noch) nicht registriert ist. Die
 * Oberklasse ist dann ein unaufgelöster Proxy ohne EClass-API, und
 * `getEAllSuperTypes()` wirft. Der Assistent soll dabei nicht ausfallen, sondern
 * den unerreichbaren Ast überspringen.
 */
function* selfAndSuperTypes(eClass: EClass): Generator<EClass> {
  const seen = new Set<EClass>();
  const queue: EClass[] = [eClass];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current) || typeof current.getEAnnotations !== 'function') continue;
    seen.add(current);
    yield current;
    const supers = typeof current.getESuperTypes === 'function' ? current.getESuperTypes() : [];
    for (const superType of supers ?? []) if (superType) queue.push(superType);
  }
}

/**
 * Alle Attribut-Pfade ab `root`, tiefensuchend über Referenzen.
 * Zyklen werden über die Kette der besuchten EClasses abgeschnitten.
 */
export function enumerateFeaturePaths(root: EClass, opts: EnumerateOptions = {}): FeaturePathCandidate[] {
  const maxDepth = opts.maxDepth ?? 3;
  const result: FeaturePathCandidate[] = [];
  const discriminatorPath = discriminatorPathOf(root);
  walk(root, [], [root], false);

  if (opts.kinds) {
    const kinds = new Set(opts.kinds);
    return result.filter((c) => kinds.has(c.kind));
  }
  return result;

  function walk(eClass: EClass, prefix: EStructuralFeature[], visited: EClass[], crossesCollection: boolean): void {
    for (const attr of eClass.getEAllAttributes()) {
      const kind = classifyDataType((attr as EAttribute).getEAttributeType());
      const segments = [...prefix, attr];
      const dottedPath = segments.map((s) => s.getName() ?? '?').join('.');
      result.push({
        segments,
        label: segments.map((s) => s.getName() ?? '?').join(' → '),
        kind,
        crossesCollection: crossesCollection || attr.isMany(),
        constant: discriminatorPath !== undefined && dottedPath === discriminatorPath,
        unit: annotationDetail(attr, ANNOTATION_MAPPING, KEY_UNIT),
        description:
          annotationDetail(attr, ANNOTATION_MAPPING, KEY_DESCRIPTION) ??
          annotationDetail(attr, ANNOTATION_GENMODEL, 'documentation'),
      });
    }
    if (prefix.length >= maxDepth) return;
    for (const ref of eClass.getEAllReferences()) {
      const target = ref.getEReferenceType();
      if (!target) continue;
      // Zyklus-Guard: dieselbe EClass nicht zweimal auf einem Pfad betreten
      if (visited.includes(target)) continue;
      walk(target, [...prefix, ref], [...visited, target], crossesCollection || ref.isMany());
    }
  }
}

/**
 * Vorschlagsliste für den Messwerte-Schritt: alle numerischen und booleschen
 * Pfade, vorbelegt mit Einheit/Beschreibung aus den Modell-Annotationen.
 */
export function suggestMeasurementPaths(root: EClass, maxDepth = 3): FeaturePathCandidate[] {
  return enumerateFeaturePaths(root, { kinds: ['NUMERIC', 'BOOLEAN'], maxDepth });
}
