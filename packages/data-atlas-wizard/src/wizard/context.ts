/**
 * Zentraler, reaktiver Zustand des Data-Atlas-Assistenten — samt der
 * Ableitungsregeln, die aus einem EPackage brauchbare Vorschläge machen
 * (Plan, Abschnitt 2).
 *
 * Die Vorschläge orientieren sich an den Beispielen des data.atlas-Repos
 * (`example/dataatlas*.xmi`), mit einer bewussten Abweichung: die Namen werden
 * **nicht** pluralisiert. Die handgeschriebenen Vorlagen nennen den Datensatz
 * einer EClass `Person` „Persons" mit id `persons`; eine Pluralregel für
 * beliebige Modellnamen wäre geraten und in der Oberfläche ohnehin mit einem
 * Klick zu ändern. Abgeleitet wird deshalb `person` / `Person`.
 */
import { computed, ref, shallowRef, triggerRef } from 'vue';
import type { EClass, EPackage } from '@emfts/core';
import type { AtlasModelSource } from '../atlas/atlasSource';
import {
  DataatlaswizardFactory,
  InputKind,
  MappingKind,
  type AtlasSetup,
  type DataSourceConfig,
  type DatasetConfig,
} from '../generated';

/**
 * Die aktive Atlas-Verbindung. Der Modell-Schritt setzt sie, das
 * Veröffentlichen benutzt sie später.
 */
export const atlasSource = shallowRef<AtlasModelSource | undefined>(undefined);

/** Die geladenen Domänen-Packages (das erste ist das gewählte). */
export const modelPackages = shallowRef<EPackage[]>([]);
export const setup = shallowRef<AtlasSetup | undefined>(undefined);
export const version = ref(0);

export const ready = computed(() => {
  void version.value;
  return !!setup.value;
});

/**
 * Manuelles Re-Rendern anstoßen. EMF-Objekte sind nicht deep-reaktiv, deshalb
 * `shallowRef` + Zähler: jedes `computed`, das am Modell liest, beginnt mit
 * `void version.value;`.
 */
export function touch(): void {
  version.value++;
  triggerRef(setup);
}

const GEN_MODEL_ANNOTATION = 'http://www.eclipse.org/emf/2002/GenModel';

/**
 * Wohin der Data Atlas schaut. Im Compose-Setup ist das Datenverzeichnis unter
 * diesem Pfad gemountet — belegt durch `example/dataatlas-atlas.xmi`, das
 * `/opt/dataatlas/runtime/data/data/persons.xmi` trägt.
 */
export const ATLAS_DATA_PREFIX = '/opt/dataatlas/runtime/data/';

/** `WaterQuality` → `water-quality`, `person` → `person`. */
export function slugOf(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** `WaterQuality` → `waterQuality`, `water-quality` → `waterQuality`. */
export function lowerCamel(name: string): string {
  const teile = slugOf(name).split('-').filter(Boolean);
  if (teile.length === 0) return '';
  return teile[0] + teile.slice(1).map((t) => t[0].toUpperCase() + t.slice(1)).join('');
}

/** `WaterQuality` → `Water Quality`. */
export function titleCase(name: string): string {
  return slugOf(name)
    .split('-')
    .filter(Boolean)
    .map((t) => t[0].toUpperCase() + t.slice(1))
    .join(' ');
}

type AnnotationLike = { getSource?: () => string | null; getDetails?: () => { getByKey?: (key: string) => unknown } };

/**
 * Die Annotationen eines Modellelements.
 *
 * Bei einem EPackage sieht der typisierte Getter die geladenen Annotationen
 * nicht — `BasicEPackage` führt dafür zwei getrennte Behälter, und der Loader
 * schreibt in den reflektiven (emf.ts#86). Deshalb hier beide Wege: erst der
 * Getter, dann `eGet`. Bei EClass und EAttribute genügt der Getter.
 */
function annotationsOf(element: object): AnnotationLike[] {
  const typisiert = (element as { getEAnnotations?: () => Iterable<AnnotationLike> })
    .getEAnnotations?.();
  const ausGetter = typisiert ? [...typisiert] : [];
  if (ausGetter.length > 0) return ausGetter;

  const reflektiv = element as {
    eClass?: () => { getEStructuralFeature(name: string): unknown } | null;
    eGet?: (feature: unknown) => unknown;
  };
  const feature = reflektiv.eClass?.()?.getEStructuralFeature('eAnnotations');
  if (!feature || !reflektiv.eGet) return [];
  const werte = reflektiv.eGet(feature) as Iterable<AnnotationLike> | null;
  return werte ? [...werte] : [];
}

/**
 * Beschreibung aus der GenModel-Annotation — dieselbe, die der Data Atlas
 * serverseitig für die DCAT-Beschreibungen heranzieht. Fehlt sie, wird ein
 * Satz gebildet, denn `description` ist an `DataProvider` `lowerBound=1`.
 */
export function documentationOf(element: object): string | null {
  for (const annotation of annotationsOf(element)) {
    if (annotation.getSource?.() !== GEN_MODEL_ANNOTATION) continue;
    const value = annotation.getDetails?.()?.getByKey?.('documentation');
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Die Klassen, aus denen ein Datensatz werden kann: konkret und instanziierbar. */
export function concreteClasses(pkg: EPackage): EClass[] {
  const klassen: EClass[] = [];
  for (const classifier of pkg.getEClassifiers()) {
    const eClass = classifier as EClass;
    if (typeof eClass.isAbstract !== 'function') continue; // EDataType/EEnum
    if (eClass.isAbstract() || eClass.isInterface?.()) continue;
    klassen.push(eClass);
  }
  return klassen;
}

/** Eine EClass → Datensatz-Vorschlag. */
export function buildDataset(eClass: EClass): DatasetConfig {
  const factory = DataatlaswizardFactory.eINSTANCE;
  const dataset = factory.createDatasetConfig();
  const name = eClass.getName() ?? 'dataset';
  dataset.selected = true;
  dataset.targetClass = eClass;
  dataset.id = lowerCamel(name);
  dataset.name = titleCase(name);
  dataset.path = dataset.id;
  dataset.description = documentationOf(eClass) ?? `Alle ${name}-Objekte.`;
  return dataset;
}

/**
 * Der Ort der Datendatei — immer absolut. Die Konfiguration kommt über HTTP
 * aus dem Model Atlas, ein relativer Pfad hätte dort keinen Bezugspunkt.
 */
export function defaultFileUri(pkg: EPackage): string {
  return `${ATLAS_DATA_PREFIX}data/${pkg.getName() ?? 'data'}.xmi`;
}

/** Ein Datei-Eingang. */
export function buildFileSource(slug: string, fileUri: string): DataSourceConfig {
  const quelle = DataatlaswizardFactory.eINSTANCE.createDataSourceConfig();
  quelle.id = `${slug}-file`;
  quelle.kind = InputKind.FILE;
  quelle.fileUri = fileUri;
  return quelle;
}

/** Ein Datenbank-Eingang samt JdbcDataSource-Angaben. */
export function buildDatabaseSource(slug: string, name: string): DataSourceConfig {
  const quelle = DataatlaswizardFactory.eINSTANCE.createDataSourceConfig();
  quelle.id = `${slug}-jpa`;
  quelle.kind = InputKind.DATABASE;
  quelle.dataSourceId = `${slug}-db`;
  quelle.dataSourceName = `${titleCase(name)} DB`;
  quelle.dataSourceFilter = `(dataSourceName=${lowerCamel(slug)}Ds)`;
  quelle.mappingKind = MappingKind.DERIVED;
  return quelle;
}

/**
 * Nimmt einen weiteren Eingang auf. Die id wird bei Bedarf durchnummeriert —
 * doppelte ids wären im Zieldokument nicht auflösbar.
 */
export function addDataSource(quelle: DataSourceConfig): DataSourceConfig | undefined {
  const s = setup.value;
  if (!s) return undefined;
  const vergeben = new Set(s.dataSources.map((q) => q.id));
  if (vergeben.has(quelle.id)) {
    let i = 2;
    while (vergeben.has(`${quelle.id}-${i}`)) i++;
    quelle.id = `${quelle.id}-${i}`;
  }
  s.dataSources.push(quelle);
  touch();
  return quelle;
}

/** Entfernt einen Eingang und räumt die Verweise darauf auf. */
export function removeDataSource(quelle: DataSourceConfig): void {
  const s = setup.value;
  if (!s) return;
  s.dataSources = s.dataSources.filter((q) => q !== quelle);
  for (const d of s.datasets) {
    if (d.sourceId === quelle.id) d.sourceId = '';
  }
  if (s.defaultSourceId === quelle.id) s.defaultSourceId = s.dataSources[0]?.id ?? '';
  touch();
}

/** Der Eingang, aus dem ein Datensatz liest — eigener Wert oder die Vorgabe. */
export function sourceOf(setupValue: AtlasSetup, dataset: DatasetConfig): DataSourceConfig | undefined {
  const id = dataset.sourceId?.trim() || setupValue.defaultSourceId;
  return setupValue.dataSources.find((q) => q.id === id);
}

/**
 * Legt das Fassadenmodell für ein EPackage an: Identität, beide Datenquellen
 * als Vorschlag, ein Datensatz je konkreter Klasse, und der REST-Endpunkt.
 *
 * `exports` bleibt bewusst leer — der Data Atlas liefert dann seine Vorgaben
 * JSON und XML. Ein einziger Eintrag würde sie vollständig ersetzen.
 */
export function initSetup(pkg: EPackage): AtlasSetup {
  const factory = DataatlaswizardFactory.eINSTANCE;
  const instanceName = pkg.getName() ?? 'data-atlas';
  const slug = slugOf(instanceName);

  const s = factory.createAtlasSetup();
  s.instanceName = instanceName;
  s.instanceDescription = documentationOf(pkg) ?? '';
  s.modelPackage = pkg;

  // Ein Eingang als Vorschlag; weitere kommen über addDataSource() dazu.
  const quelle = buildFileSource(slug, defaultFileUri(pkg));
  s.dataSources.push(quelle);
  s.defaultSourceId = quelle.id;

  for (const eClass of concreteClasses(pkg)) {
    s.datasets.push(buildDataset(eClass));
  }

  s.serviceId = `${slug}-rest`;
  s.serviceName = `${instanceName} REST`;
  s.serviceDescription = `REST-Endpunkt für ${instanceName}.`;
  s.urlContext = `/${slug}`;

  modelPackages.value = [pkg];
  setup.value = s;
  touch();
  return s;
}

/** Die ausgewählten Datensätze — was der Transformer schreibt. */
export const selectedDatasets = computed<DatasetConfig[]>(() => {
  void version.value;
  return setup.value?.datasets.filter((d) => d.selected) ?? [];
});
