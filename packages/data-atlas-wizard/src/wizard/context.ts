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
import {
  ConfigMode,
  DataatlaswizardFactory,
  InputKind,
  type AtlasSetup,
  type DatasetConfig,
} from '../generated';

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
 * Wohin der Data Atlas im Atlas-Modus schaut. Im Compose-Setup ist das
 * Datenverzeichnis unter diesem Pfad gemountet — belegt durch
 * `example/dataatlas-atlas.xmi`, das `/opt/dataatlas/runtime/data/data/persons.xmi`
 * trägt, wo die Datei-Variante `data/persons.xmi` sagt.
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

/** Der Ort der Datendatei — im Atlas-Modus absolut, im Datei-Modus relativ. */
export function defaultFileUri(pkg: EPackage, mode: ConfigMode): string {
  const relativ = `data/${pkg.getName() ?? 'data'}.xmi`;
  return mode === ConfigMode.ATLAS ? `${ATLAS_DATA_PREFIX}${relativ}` : relativ;
}

/** Der Pfad, unter dem die .ecore neben der Konfiguration liegt. */
export function defaultModelFileName(pkg: EPackage): string {
  return `model/${pkg.getName() ?? 'model'}.ecore`;
}

/**
 * Legt das Fassadenmodell für ein EPackage an: Identität, beide Datenquellen
 * als Vorschlag, ein Datensatz je konkreter Klasse, und der REST-Endpunkt.
 *
 * `exports` bleibt bewusst leer — der Data Atlas liefert dann seine Vorgaben
 * JSON und XML. Ein einziger Eintrag würde sie vollständig ersetzen.
 */
export function initSetup(pkg: EPackage, mode: ConfigMode = ConfigMode.FILE): AtlasSetup {
  const factory = DataatlaswizardFactory.eINSTANCE;
  const instanceName = pkg.getName() ?? 'data-atlas';
  const slug = slugOf(instanceName);

  const s = factory.createAtlasSetup();
  s.instanceName = instanceName;
  s.instanceDescription = documentationOf(pkg) ?? '';
  s.configMode = mode;
  s.modelPackage = pkg;
  s.inputKind = InputKind.FILE;

  // Serialisierungskontext für den FILE-Modus. Weitere Packages kommen über
  // addModelFile() dazu, wenn das Laden sie mitbringt (Cascade/Upload).
  s.modelFiles.push(buildModelFileRef(pkg));

  const fileSource = factory.createFileSourceConfig();
  fileSource.id = `${slug}-file`;
  fileSource.fileUri = defaultFileUri(pkg, mode);
  s.fileSource = fileSource;

  // Auch die Datenbank-Variante wird vorbereitet: der Schritt „Datenquelle"
  // schaltet nur um, statt beim Wechsel erst etwas anzulegen.
  const databaseSource = factory.createDatabaseSourceConfig();
  databaseSource.id = `${slug}-jpa`;
  databaseSource.dataSourceId = `${slug}-db`;
  databaseSource.dataSourceName = `${titleCase(instanceName)} DB`;
  databaseSource.dataSourceFilter = `(dataSourceName=${lowerCamel(slug)}Ds)`;
  s.databaseSource = databaseSource;

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

/** Ein Eintrag für die nsURI-zu-Dateiname-Karte des FILE-Modus. */
export function buildModelFileRef(pkg: EPackage) {
  const ref = DataatlaswizardFactory.eINSTANCE.createModelFileRef();
  ref.modelPackage = pkg;
  ref.fileName = defaultModelFileName(pkg);
  return ref;
}

/**
 * Nimmt ein weiteres Package in die Karte auf — nötig, sobald ein Modell auf
 * ein anderes verweist, weil der Href sonst im FILE-Modus falsch wäre.
 * Idempotent, damit mehrfaches Laden keine Doppel erzeugt.
 */
export function addModelFile(pkg: EPackage, fileName?: string): void {
  const s = setup.value;
  if (!s) return;
  if (s.modelFiles.some((ref) => ref.modelPackage === pkg)) return;
  const ref = buildModelFileRef(pkg);
  if (fileName) ref.fileName = fileName;
  s.modelFiles.push(ref);
  if (!modelPackages.value.includes(pkg)) {
    modelPackages.value = [...modelPackages.value, pkg];
  }
  touch();
}

/**
 * Wechselt den Modus und zieht die Datei-URI mit — aber nur, wenn sie noch der
 * Vorgabe des alten Modus entspricht. Eine von Hand eingetragene URI bleibt
 * stehen; sie zu überschreiben wäre ein stiller Datenverlust.
 */
export function setConfigMode(mode: ConfigMode): void {
  const s = setup.value;
  if (!s || s.configMode === mode) return;
  const pkg = s.modelPackage;
  const alteVorgabe = pkg ? defaultFileUri(pkg, s.configMode) : undefined;
  s.configMode = mode;
  if (pkg && s.fileSource && s.fileSource.fileUri === alteVorgabe) {
    s.fileSource.fileUri = defaultFileUri(pkg, mode);
  }
  touch();
}

/** Die ausgewählten Datensätze — was der Transformer schreibt. */
export const selectedDatasets = computed<DatasetConfig[]>(() => {
  void version.value;
  return setup.value?.datasets.filter((d) => d.selected) ?? [];
});
