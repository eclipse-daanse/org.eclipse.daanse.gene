/**
 * Transformer: Fassadenmodell (AtlasSetup) → DataAtlasConfiguration-XMI.
 *
 * Gebaut wird das **Zielmodell**, serialisiert wird mit `saveToString()`
 * (Plan, Abschnitt 4). Escaping, Namespaces, `xsi:type`, Elementreihenfolge
 * und die Referenzformate macht damit der Serializer; die beiden Stellen, an
 * denen emf.ts von Java EMF abweicht, sitzen in `dataAtlasResource.ts`.
 *
 * Querverweise werden als **Objekte** gesetzt, nicht als ID-Strings — der
 * Serializer bildet daraus `dataInput="persons-file"` usw.
 */
import type { EClass, EObject, EPackage } from '@emfts/core';
import { getConfigurationPackage } from '../emf/setup';
import {
  ConfigMode,
  ExportKind,
  InputKind,
  MappingKind,
  type AtlasSetup,
  type DatasetConfig,
  type ExportConfig,
} from '../generated';
import { ECORE_NS_URI, createDataAtlasResource, type ModelFileMap } from './dataAtlasResource';
import { assertValid, findWarnings } from './validate';

/** Der Dateiname, unter dem der Data Atlas die Konfiguration erwartet. */
export const DEFAULT_FILE_NAME = 'dataatlas.xmi';

export interface DataAtlasResult {
  xmi: string;
  fileName: string;
  warnings: string[];
}

/** Kleiner Helfer, damit die Bauvorschrift lesbar bleibt. */
function makeBuilder(pkg: EPackage) {
  const factory = pkg.getEFactoryInstance() as unknown as { create(eClass: EClass): EObject };
  return {
    create(className: string): EObject {
      const eClass = pkg.getEClassifier(className) as EClass | null;
      if (!eClass) throw new Error(`Zielmetamodell kennt „${className}" nicht`);
      return factory.create(eClass);
    },
    set(obj: EObject, featureName: string, value: unknown): void {
      const feature = obj.eClass().getEStructuralFeature(featureName);
      if (!feature) {
        throw new Error(`${obj.eClass().getName()} hat kein Feature „${featureName}"`);
      }
      obj.eSet(feature, value);
    },
    add(obj: EObject, featureName: string, value: unknown): void {
      const feature = obj.eClass().getEStructuralFeature(featureName);
      if (!feature) {
        throw new Error(`${obj.eClass().getName()} hat kein Feature „${featureName}"`);
      }
      (obj.eGet(feature) as unknown as { add(v: unknown): void }).add(value);
    },
  };
}

/** Karte nsURI → Dateiname für den FILE-Href-Dialekt. */
export function modelFileMap(setup: AtlasSetup): ModelFileMap {
  const karte = new Map<string, string>();
  for (const ref of setup.modelFiles) {
    const nsURI = ref.modelPackage?.getNsURI();
    if (nsURI && ref.fileName) karte.set(nsURI, ref.fileName);
  }
  return karte;
}

/** JSON und XML tragen ihren mediaType, CSV seine Trennzeichen-Angaben. */
const MEDIA_TYPES: Partial<Record<ExportKind, string>> = {
  [ExportKind.JSON]: 'application/json',
  [ExportKind.XML]: 'application/xml',
};

function buildExport(builder: ReturnType<typeof makeBuilder>, config: ExportConfig): EObject {
  const istCsv = config.kind === ExportKind.CSV || config.kind === ExportKind.CSV_ZIP;
  const exportObj = builder.create(istCsv ? 'CSVDistributionExport' : 'DistributionExport');
  builder.set(exportObj, 'id', config.id);
  builder.set(exportObj, 'name', config.name);
  builder.set(exportObj, 'description', config.description);
  if (istCsv) {
    builder.set(exportObj, 'separator', config.separator);
    builder.set(exportObj, 'includeTypeHeader', config.includeTypeHeader);
    if (config.kind === ExportKind.CSV_ZIP) builder.set(exportObj, 'compressed', true);
  } else {
    const mediaType = MEDIA_TYPES[config.kind];
    if (mediaType) builder.set(exportObj, 'mediaType', mediaType);
  }
  return exportObj;
}

function buildDataSet(
  builder: ReturnType<typeof makeBuilder>,
  config: DatasetConfig,
): EObject {
  const dataSet = builder.create('DataSet');
  builder.set(dataSet, 'id', config.id);
  builder.set(dataSet, 'name', config.name);
  builder.set(dataSet, 'description', config.description);
  builder.set(dataSet, 'inputType', config.targetClass);
  builder.set(dataSet, 'outputType', config.targetClass);
  return dataSet;
}

/**
 * Baut die Konfiguration und serialisiert sie.
 *
 * `dataInput` und `distributionExport` stehen am **Service**, nicht an jedem
 * Datensatz: die Fassade kennt genau eine Datenquelle und einen Satz Formate,
 * und der Data Atlas löst die Trias override-else-default auf — der
 * Service-Wert gilt also für alle Datensätze. Muster:
 * `tests/fixtures/dataatlas-servicedefault.xmi`.
 */
export function buildDataAtlasXmi(setup: AtlasSetup): DataAtlasResult {
  assertValid(setup);
  const warnings = findWarnings(setup);

  const config = getConfigurationPackage();
  const builder = makeBuilder(config);
  const datasets = setup.datasets.filter((d) => d.selected);
  const exports = setup.exports.filter((e) => e.selected);

  const root = builder.create('DataAtlasConfiguration');
  builder.set(root, 'name', setup.instanceName);
  if (setup.instanceDescription?.trim()) {
    builder.set(root, 'description', setup.instanceDescription.trim());
  }

  // ── Datenquelle ──────────────────────────────────────────────────────────
  let dataInput: EObject;
  let hatEingebettetesMapping = false;
  if (setup.inputKind === InputKind.FILE) {
    const quelle = setup.fileSource!;
    dataInput = builder.create('FileDataInput');
    builder.set(dataInput, 'id', quelle.id);
    builder.set(dataInput, 'uri', quelle.fileUri);
  } else {
    const quelle = setup.databaseSource!;
    const dataSource = builder.create('JdbcDataSource');
    builder.set(dataSource, 'id', quelle.dataSourceId);
    builder.set(dataSource, 'name', quelle.dataSourceName);
    builder.set(dataSource, 'filter', quelle.dataSourceFilter);
    builder.add(root, 'dataSources', dataSource);

    dataInput = builder.create('JPADataInput');
    builder.set(dataInput, 'id', quelle.id);
    builder.set(dataInput, 'dataSource', dataSource);
    if (quelle.mappingKind === MappingKind.IMPORTED) {
      builder.set(dataInput, 'persistenceConfig', loadEntityMappings(quelle.eormXmi!));
      hatEingebettetesMapping = true;
    }
  }
  // Die Klassen, die dieser Input liefern kann.
  for (const dataset of datasets) {
    builder.add(dataInput, 'supportedEClasses', dataset.targetClass);
  }
  builder.add(root, 'dataInputs', dataInput);

  // ── Datensätze ───────────────────────────────────────────────────────────
  const dataSetObjekte = new Map<DatasetConfig, EObject>();
  for (const dataset of datasets) {
    const dataSet = buildDataSet(builder, dataset);
    dataSetObjekte.set(dataset, dataSet);
    builder.add(root, 'dataSets', dataSet);
  }

  // ── Endpunkt ─────────────────────────────────────────────────────────────
  const service = builder.create('RestDataService');
  builder.set(service, 'id', setup.serviceId);
  builder.set(service, 'name', setup.serviceName);
  builder.set(service, 'description', setup.serviceDescription);
  builder.set(service, 'urlContext', setup.urlContext);
  builder.set(service, 'openAPI', setup.openApi);
  builder.set(service, 'dataInput', dataInput);
  builder.set(service, 'paginationOffsetParameterName', setup.paginationOffsetParameterName);
  builder.set(service, 'paginationSizeParameterName', setup.paginationSizeParameterName);

  for (const [dataset, dataSet] of dataSetObjekte) {
    const serviceConfig = builder.create('RestDataServiceConfiguration');
    // Der Wert bedeutet fachlich nichts und wird deshalb abgeleitet.
    builder.set(serviceConfig, 'id', `${dataset.id}-config`);
    builder.set(serviceConfig, 'dataSet', dataSet);
    // path ist lowerBound=1; ohne Wert griffe der Name des Datensatzes, und
    // der ist Title Case — als URL-Segment nicht gewollt.
    builder.set(serviceConfig, 'path', dataset.path);
    // -1 heisst "nicht gesetzt" und ist auch im Zielmodell der Vorgabewert —
    // dann bleibt das Attribut weg.
    const batchSize = dataset.batchSize ?? -1;
    const batchSizeLimit = dataset.batchSizeLimit ?? -1;
    if (batchSize > -1) builder.set(serviceConfig, 'batchSize', batchSize);
    if (batchSizeLimit > -1) builder.set(serviceConfig, 'batchSizeLimit', batchSizeLimit);
    builder.add(service, 'configuration', serviceConfig);
  }
  builder.add(root, 'services', service);

  // ── Formate ──────────────────────────────────────────────────────────────
  // Leer lassen heißt: die Vorgaben des Data Atlas (JSON und XML) gelten.
  // Ein einziger Eintrag ersetzt sie vollständig.
  for (const exportConfig of exports) {
    const exportObj = buildExport(builder, exportConfig);
    builder.add(root, 'exports', exportObj);
    builder.add(service, 'distributionExport', exportObj);
  }

  const resource = createDataAtlasResource(DEFAULT_FILE_NAME, {
    mode: setup.configMode,
    modelFiles: setup.configMode === ConfigMode.FILE ? modelFileMap(setup) : undefined,
    // Ein eingebettetes Mapping verweist mit Typpräfix auf Ecore-Features
    // (`feature="ecore:EAttribute …"`); ohne die Deklaration wäre das Präfix
    // unbekannt (emf.ts#87). Ohne Mapping bleibt der Kopf schlank.
    extraNamespaces: hatEingebettetesMapping ? { ecore: ECORE_NS_URI } : undefined,
  });
  resource.getContents().add(root);

  return { xmi: resource.saveToString(), fileName: DEFAULT_FILE_NAME, warnings };
}

/**
 * Das importierte eorm-Dokument als Objekt — der Serializer schreibt es dann
 * als `persistenceConfig`-Containment, samt Namespaces und den Hrefs im
 * Inneren. Deshalb braucht es keine Textchirurgie am fremden Dokument.
 */
function loadEntityMappings(eormXmi: string): EObject {
  const resource = createDataAtlasResource('imported.eorm', { mode: ConfigMode.ATLAS });
  resource.loadFromString(eormXmi);
  const wurzel = resource.getContents().get(0);
  if (!wurzel) throw new Error('Das importierte JPA-Mapping ist leer.');
  // Aus seiner Resource lösen, sonst bliebe es ein Cross-Document-Verweis.
  resource.getContents().remove(wurzel);
  return wurzel;
}
