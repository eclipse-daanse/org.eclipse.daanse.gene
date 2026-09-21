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
  EndpointKind,
  ExportKind,
  InputKind,
  MappingKind,
  type AtlasSetup,
  type DataSourceConfig,
  type DatasetConfig,
  type EndpointConfig,
  type ExportConfig,
} from '../generated';
import { createDataAtlasResource } from './dataAtlasResource';
import { assertValid, findWarnings } from './validate';
import { effectiveSource, endpointChains, endpointShape, resolvedEntries } from '../wizard/context';

/** Der Dateiname, unter dem der Data Atlas die Konfiguration erwartet. */
export const DEFAULT_FILE_NAME = 'dataatlas.xmi';

export interface DataAtlasResult {
  xmi: string;
  fileName: string;
  warnings: string[];
}

/** Der Wert, auf den sich alle einigen — oder `undefined`. */
function commonValue<T>(werte: T[]): T | undefined {
  if (werte.length === 0) return undefined;
  return werte.every((w) => w === werte[0]) ? werte[0] : undefined;
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
  const root = builder.create('DataAtlasConfiguration');
  builder.set(root, 'name', setup.instanceName);
  if (setup.instanceDescription?.trim()) {
    builder.set(root, 'description', setup.instanceDescription.trim());
  }

  /*
   * Die Ketten werden hier ausgeflacht: das Zielmodell führt Register, in
   * denen alles einmal steht und mehrfach referenziert wird. Eine geteilte
   * Quelle wird deshalb genau ein DataInput, und gleiche Exportvorlagen
   * werden zu einem Eintrag zusammengefasst.
   */
  // ── Dateneingänge ────────────────────────────────────────────────────────
  const inputObjekte = new Map<DataSourceConfig, EObject>();
  for (const chain of setup.chains) {
    const quelle = effectiveSource(chain);
    if (!quelle || inputObjekte.has(quelle)) continue;
    const dataInput = buildDataInput(builder, root, quelle);
    inputObjekte.set(quelle, dataInput);
    builder.add(root, 'dataInputs', dataInput);
  }

  // ── Formate ──────────────────────────────────────────────────────────────
  // Gleiche Vorlagen aus mehreren Ketten werden ein Eintrag; verglichen wird
  // über id und Einstellungen.
  const exportObjekte = new Map<string, EObject>();
  const exportSchluessel = (e: ExportConfig) =>
    [e.id, e.kind, e.name, e.description, e.separator, e.includeTypeHeader].join('|');
  const exportVon = new Map<ExportConfig, EObject>();
  for (const chain of setup.chains) {
    for (const exportConfig of chain.exports.filter((e) => e.selected)) {
      const schluessel = exportSchluessel(exportConfig);
      let exportObj = exportObjekte.get(schluessel);
      if (!exportObj) {
        exportObj = buildExport(builder, exportConfig);
        exportObjekte.set(schluessel, exportObj);
        builder.add(root, 'exports', exportObj);
      }
      exportVon.set(exportConfig, exportObj);
    }
  }

  // ── Datensätze ───────────────────────────────────────────────────────────
  const eintraege = setup.chains.flatMap((chain) =>
    chain.datasets.filter((d) => d.selected).map((dataset) => ({ chain, dataset })),
  );

  /*
   * Sind sich alle Wege einig, wandert der Wert an den Service — einmal statt
   * n-mal, und genau so lesen die Vorlagen des data.atlas-Repos. Sonst steht
   * er an jedem Datensatz (override-else-default).
   */
  const gemeinsameQuelle = commonValue(eintraege.map((e) => effectiveSource(e.chain)));
  const gemeinsameFormate = commonValue(
    eintraege.map((e) =>
      e.chain.exports
        .filter((x) => x.selected)
        .map(exportSchluessel)
        .sort()
        .join(' '),
    ),
  );

  const dataSetObjekte: { dataset: DatasetConfig; dataSet: EObject }[] = [];
  for (const { chain, dataset } of eintraege) {
    const dataSet = buildDataSet(builder, dataset);
    if (!gemeinsameQuelle) {
      const quelle = effectiveSource(chain);
      const dataInput = quelle ? inputObjekte.get(quelle) : undefined;
      if (dataInput) builder.set(dataSet, 'dataInput', dataInput);
    }
    if (gemeinsameFormate === undefined) {
      for (const exportConfig of chain.exports.filter((e) => e.selected)) {
        const exportObj = exportVon.get(exportConfig);
        if (exportObj) builder.add(dataSet, 'distributionExport', exportObj);
      }
    }
    dataSetObjekte.push({ dataset, dataSet });
    builder.add(root, 'dataSets', dataSet);
  }

  /*
   * supportedEClasses je Eingang: die Klassen der Datensätze, die aus ihm
   * lesen — jede einmal. Teilen sich zwei Wege eine Quelle und lesen dieselbe
   * Klasse, stünde sie sonst doppelt im Eingang.
   */
  const klassenJeEingang = new Map<EObject, Set<EClass>>();
  for (const { chain, dataset } of eintraege) {
    const quelle = effectiveSource(chain);
    const dataInput = quelle ? inputObjekte.get(quelle) : undefined;
    if (!dataInput || !dataset.targetClass) continue;
    let klassen = klassenJeEingang.get(dataInput);
    if (!klassen) {
      klassen = new Set();
      klassenJeEingang.set(dataInput, klassen);
    }
    if (klassen.has(dataset.targetClass)) continue;
    klassen.add(dataset.targetClass);
    builder.add(dataInput, 'supportedEClasses', dataset.targetClass);
  }

  // ── Endpoints ────────────────────────────────────────────────────────────
  for (const endpoint of setup.endpoints) {
    buildService(builder, root, setup, endpoint, {
      dataSetObjekte,
      inputObjekte,
      exportVon,
    });
  }

  const resource = createDataAtlasResource(DEFAULT_FILE_NAME);
  resource.getContents().add(root);

  return { xmi: resource.saveToString(), fileName: DEFAULT_FILE_NAME, warnings };
}

/** The target class each endpoint kind maps to. */
const SERVICE_CLASSES: Record<EndpointKind, { service: string; configuration?: string }> = {
  [EndpointKind.REST]: { service: 'RestDataService', configuration: 'RestDataServiceConfiguration' },
  [EndpointKind.GEOJSON]: {
    service: 'GeoJsonDataService',
    configuration: 'GeoJsonDataServiceConfiguration',
  },
  [EndpointKind.XMLA]: { service: 'XMLADataService', configuration: 'XMLADataServiceConfiguration' },
  [EndpointKind.QGIS]: { service: 'QGisDataService', configuration: 'QGisDataServiceConfiguration' },
  [EndpointKind.GRAPHQL]: {
    service: 'GraphQLDataService',
    configuration: 'GraphQLDataServiceConfiguration',
  },
  [EndpointKind.ODATA]: {
    service: 'ODataDataService',
    configuration: 'ODataDataServiceConfiguration',
  },
  // These two have no configuration reference at all — they publish what their
  // data input holds.
  [EndpointKind.OGC_FEATURES]: { service: 'OgcFeaturesDataService' },
  [EndpointKind.OGC_SENSORTHINGS]: { service: 'OgcSensorThingsDataService' },
};

/**
 * One endpoint → one DataService with its configurations.
 *
 * The trias moves to the service when the chains it publishes agree, and stays
 * on the data set otherwise — the same override-else-default as before, only
 * now asked per endpoint instead of globally.
 */
function buildService(
  builder: ReturnType<typeof makeBuilder>,
  root: EObject,
  setup: AtlasSetup,
  endpoint: EndpointConfig,
  objekte: {
    dataSetObjekte: { dataset: DatasetConfig; dataSet: EObject }[];
    inputObjekte: Map<DataSourceConfig, EObject>;
    exportVon: Map<ExportConfig, EObject>;
  },
): void {
  const shape = endpointShape(endpoint.kind);
  const classes = SERVICE_CLASSES[endpoint.kind];
  const service = builder.create(classes.service);

  builder.set(service, 'id', endpoint.id);
  builder.set(service, 'name', endpoint.name);
  builder.set(service, 'description', endpoint.description);
  builder.set(service, 'urlContext', endpoint.urlContext);
  if (shape.hasOpenApi) builder.set(service, 'openAPI', endpoint.openApi);
  if (shape.hasPagination) {
    builder.set(service, 'paginationOffsetParameterName', endpoint.paginationOffsetParameterName);
    builder.set(service, 'paginationSizeParameterName', endpoint.paginationSizeParameterName);
  }

  // The chains this endpoint publishes decide its trias
  const chains = endpointChains(setup, endpoint);
  const sources = commonValue(chains.map((c) => effectiveSource(c)));
  if (sources) {
    const dataInput = objekte.inputObjekte.get(sources);
    if (dataInput) builder.set(service, 'dataInput', dataInput);
  }
  const formats = commonValue(
    chains.map((c) =>
      c.exports
        .filter((e) => e.selected)
        .map((e) => e.id)
        .sort()
        .join(' '),
    ),
  );
  if (formats !== undefined && chains.length > 0) {
    for (const exportConfig of chains[0].exports.filter((e) => e.selected)) {
      const exportObj = objekte.exportVon.get(exportConfig);
      if (exportObj) builder.add(service, 'distributionExport', exportObj);
    }
  }

  if (classes.configuration) {
    for (const entry of resolvedEntries(setup, endpoint)) {
      const dataSet = objekte.dataSetObjekte.find((d) => d.dataset === entry.dataset)?.dataSet;
      if (!dataSet) continue;
      const configuration = builder.create(classes.configuration);
      // The value means nothing in itself, so it is derived.
      builder.set(configuration, 'id', `${endpoint.id}-${entry.dataset.id}-config`);
      builder.set(configuration, 'dataSet', dataSet);

      if (shape.hasPath) {
        // path is lowerBound=1; without a value the data set's name would
        // apply, and that is Title Case — not what belongs in a URL.
        builder.set(configuration, 'path', entry.path || entry.dataset.id);
        // -1 means "not set" and is the target model's default too, so the
        // attribute stays away.
        const batchSize = entry.batchSize ?? -1;
        const batchSizeLimit = entry.batchSizeLimit ?? -1;
        if (batchSize > -1) builder.set(configuration, 'batchSize', batchSize);
        if (batchSizeLimit > -1) builder.set(configuration, 'batchSizeLimit', batchSizeLimit);
      }
      if (shape.hasGeometry) {
        for (const feature of [
          'longitudeFeature',
          'latitudeFeature',
          'elevationFeature',
          'geometryFeature',
          'idFeature',
        ] as const) {
          const value = entry[feature];
          if (value) builder.set(configuration, feature, value);
        }
      }
      if (shape.classFeature) {
        const value = shape.classFeature === 'mapping' ? entry.mapping : entry.layer;
        if (value) builder.set(configuration, shape.classFeature, value);
      }

      builder.add(service, 'configuration', configuration);
    }
  }

  builder.add(root, 'services', service);
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
