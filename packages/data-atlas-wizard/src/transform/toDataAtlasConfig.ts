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
  ExportKind,
  InputKind,
  MappingKind,
  type AtlasSetup,
  type DataSourceConfig,
  type DatasetConfig,
  type ExportConfig,
} from '../generated';
import { ECORE_NS_URI, createDataAtlasResource } from './dataAtlasResource';
import { assertValid, findWarnings } from './validate';
import { commonValue, sourceOf } from '../wizard/context';

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

/** Ein Eintrag der Eingangsliste → FileDataInput bzw. JdbcDataSource + JPADataInput. */
function buildDataInput(
  builder: ReturnType<typeof makeBuilder>,
  root: EObject,
  quelle: DataSourceConfig,
): EObject {
  if (quelle.kind === InputKind.FILE) {
    const dataInput = builder.create('FileDataInput');
    builder.set(dataInput, 'id', quelle.id);
    builder.set(dataInput, 'uri', quelle.fileUri);
    return dataInput;
  }

  const dataSource = builder.create('JdbcDataSource');
  builder.set(dataSource, 'id', quelle.dataSourceId);
  builder.set(dataSource, 'name', quelle.dataSourceName);
  builder.set(dataSource, 'filter', quelle.dataSourceFilter);
  builder.add(root, 'dataSources', dataSource);

  const dataInput = builder.create('JPADataInput');
  builder.set(dataInput, 'id', quelle.id);
  builder.set(dataInput, 'dataSource', dataSource);
  if (quelle.mappingKind === MappingKind.IMPORTED) {
    builder.set(dataInput, 'persistenceConfig', loadEntityMappings(quelle.eormXmi!));
  }
  return dataInput;
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

  // ── Dateneingänge ────────────────────────────────────────────────────────
  let hatEingebettetesMapping = false;
  const inputObjekte = new Map<string, EObject>();
  for (const quelle of setup.dataSources) {
    const dataInput = buildDataInput(builder, root, quelle);
    if (quelle.kind === InputKind.DATABASE && quelle.mappingKind === MappingKind.IMPORTED) {
      hatEingebettetesMapping = true;
    }
    inputObjekte.set(quelle.id, dataInput);
    builder.add(root, 'dataInputs', dataInput);
  }

  /*
   * supportedEClasses je Eingang: die Klassen der Datensätze, die aus ihm
   * lesen. Ein Eingang, den niemand benutzt, bleibt leer — das ist zulässig
   * und sagt dem Data Atlas nur, dass er nichts liefern muss.
   */
  for (const dataset of datasets) {
    const quelle = sourceOf(setup, dataset);
    const dataInput = quelle ? inputObjekte.get(quelle.id) : undefined;
    if (dataInput) builder.add(dataInput, 'supportedEClasses', dataset.targetClass);
  }

  // ── Formate ──────────────────────────────────────────────────────────────
  // Zuerst, weil Datensätze und Service sie referenzieren. Leer lassen heißt:
  // die Vorgaben des Data Atlas (JSON und XML) gelten.
  const exportObjekte = new Map<string, EObject>();
  for (const exportConfig of exports) {
    const exportObj = buildExport(builder, exportConfig);
    exportObjekte.set(exportConfig.id, exportObj);
    builder.add(root, 'exports', exportObj);
  }
  const exportObjekteVon = (dataset: DatasetConfig): EObject[] =>
    dataset.exportIds
      .map((id) => exportObjekte.get(id))
      .filter((o): o is EObject => !!o);

  /*
   * Sind alle Datensätze einig, wandert der Wert an den Service — einmal statt
   * n-mal, und genau so lesen die Vorlagen des data.atlas-Repos. Sonst steht
   * er an jedem Datensatz (override-else-default).
   */
  const gemeinsamerEingang = commonValue(datasets, (d) => d.sourceId);
  const gemeinsameFormate = commonValue(
    datasets,
    (d) => [...d.exportIds].sort().join(' '),
  );

  // ── Datensätze ───────────────────────────────────────────────────────────
  const dataSetObjekte = new Map<DatasetConfig, EObject>();
  for (const dataset of datasets) {
    const dataSet = buildDataSet(builder, dataset);
    if (!gemeinsamerEingang) {
      const dataInput = inputObjekte.get(dataset.sourceId);
      if (dataInput) builder.set(dataSet, 'dataInput', dataInput);
    }
    if (gemeinsameFormate === undefined) {
      for (const exportObj of exportObjekteVon(dataset)) {
        builder.add(dataSet, 'distributionExport', exportObj);
      }
    }
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
  if (gemeinsamerEingang) {
    const vorgabe = inputObjekte.get(gemeinsamerEingang);
    if (vorgabe) builder.set(service, 'dataInput', vorgabe);
  }
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

  // Die gemeinsamen Formate am Service — sonst stehen sie an den Datensätzen.
  if (gemeinsameFormate !== undefined && datasets.length > 0) {
    for (const exportObj of exportObjekteVon(datasets[0])) {
      builder.add(service, 'distributionExport', exportObj);
    }
  }

  const resource = createDataAtlasResource(DEFAULT_FILE_NAME, {
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
  const resource = createDataAtlasResource('imported.eorm');
  resource.loadFromString(eormXmi);
  const wurzel = resource.getContents().get(0);
  if (!wurzel) throw new Error('Das importierte JPA-Mapping ist leer.');
  // Aus seiner Resource lösen, sonst bliebe es ein Cross-Document-Verweis.
  resource.getContents().remove(wurzel);
  return wurzel;
}
