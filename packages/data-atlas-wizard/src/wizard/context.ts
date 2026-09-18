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
  type DataChain,
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

type AnnotationLike = {
  getSource?: () => string | null;
  getDetails?: () => { getByKey?: (key: string) => unknown };
};

/**
 * Die Annotationen eines Modellelements.
 *
 * Bis @emfts/core 0.2 sah der typisierte Getter am EPackage die geladenen
 * Annotationen nicht — `BasicEPackage` führte zwei getrennte Behälter, und der
 * Loader schrieb in den reflektiven (emf.ts#86). Seit 0.3 ist das behoben, der
 * Getter genügt.
 */
function annotationsOf(element: object): AnnotationLike[] {
  const typisiert = (element as { getEAnnotations?: () => Iterable<AnnotationLike> })
    .getEAnnotations?.();
  return typisiert ? [...typisiert] : [];
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

/** Eine EClass → Datensatz-Vorschlag. Die Kette sagt, woher er liest. */
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
 * Ein Datenweg mit eigener Quelle. Die id wird bei Bedarf durchnummeriert:
 * sie geht in die ids des Zieldokuments ein und muss eindeutig bleiben.
 */
export function buildChain(id: string, source: DataSourceConfig): DataChain {
  const chain = DataatlaswizardFactory.eINSTANCE.createDataChain();
  chain.id = id;
  chain.source = source;
  return chain;
}

/** Nimmt einen Datenweg auf und macht seine id eindeutig. */
export function addChain(chain: DataChain): DataChain | undefined {
  const s = setup.value;
  if (!s) return undefined;
  const vergeben = new Set(s.chains.map((c) => c.id));
  if (vergeben.has(chain.id)) {
    let i = 2;
    while (vergeben.has(`${chain.id}-${i}`)) i++;
    chain.id = `${chain.id}-${i}`;
  }
  s.chains.push(chain);
  touch();
  return chain;
}

/**
 * Entfernt einen Datenweg. Wege, die sich seine Quelle geteilt haben, würden
 * ins Leere zeigen — sie erben die Quelle stattdessen.
 */
export function removeChain(chain: DataChain): void {
  const s = setup.value;
  if (!s) return;
  const quelle = effectiveSource(chain);
  s.chains = s.chains.filter((c) => c !== chain);
  const erben = s.chains.filter((c) => c.sharedSource === quelle);
  if (quelle && chain.source === quelle && erben.length > 0) {
    // Der erste Erbe übernimmt die Quelle, die anderen teilen sich seine.
    erben[0].source = quelle;
    erben[0].sharedSource = undefined as never;
    for (const weiterer of erben.slice(1)) weiterer.sharedSource = quelle;
  }
  touch();
}

/** Die Quelle, aus der ein Weg liest — eigene oder geteilte. */
export function effectiveSource(chain: DataChain): DataSourceConfig | undefined {
  return chain.source ?? chain.sharedSource;
}

/** Alle Quellen, die als geteilte in Frage kommen (die eigenen der Wege). */
export function ownedSources(setupValue: AtlasSetup): DataSourceConfig[] {
  return setupValue.chains
    .map((c) => c.source)
    .filter((q): q is DataSourceConfig => !!q);
}

/** Lässt einen Weg die Quelle eines anderen mitbenutzen. */
export function shareSource(chain: DataChain, quelle: DataSourceConfig): void {
  chain.source = undefined as never;
  chain.sharedSource = quelle;
  touch();
}

/** Gibt dem Weg wieder eine eigene Quelle. */
export function ownSource(chain: DataChain, quelle: DataSourceConfig): void {
  chain.sharedSource = undefined as never;
  chain.source = quelle;
  touch();
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

  // Ein Datenweg als Vorschlag: die Datei und alle konkreten Klassen daraus.
  const chain = buildChain(slug, buildFileSource(slug, defaultFileUri(pkg)));
  for (const eClass of concreteClasses(pkg)) {
    chain.datasets.push(buildDataset(eClass));
  }
  s.chains.push(chain);

  s.serviceId = `${slug}-rest`;
  s.serviceName = `${instanceName} REST`;
  s.serviceDescription = `REST-Endpunkt für ${instanceName}.`;
  s.urlContext = `/${slug}`;

  modelPackages.value = [pkg];
  setup.value = s;
  touch();
  return s;
}

/** Die ausgewählten Datensätze aller Wege — was der Transformer schreibt. */
export const selectedDatasets = computed<DatasetConfig[]>(() => {
  void version.value;
  return (setup.value?.chains ?? []).flatMap((c) => c.datasets.filter((d) => d.selected));
});

/** Alle Datensätze mit ihrem Weg — für Prüfungen und die Zusammenfassung. */
export function datasetsWithChain(setupValue: AtlasSetup): { chain: DataChain; dataset: DatasetConfig }[] {
  return setupValue.chains.flatMap((chain) =>
    chain.datasets.map((dataset) => ({ chain, dataset })),
  );
}
