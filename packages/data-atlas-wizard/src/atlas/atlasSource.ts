/**
 * Geparste Sicht auf den Modelatlas für den Wizard: Schemas auflisten/suchen
 * und als EPackages in die Registry laden.
 *
 * Die XMI-Antworten werden reflektiv über die dynamisch geladenen
 * API-Metamodelle geparst (src/assets/atlas-management.ecore,
 * atlas-workflow-api.ecore — Kopien aus gene/packages/storage-model-atlas).
 */
import type { EObject, EPackage, XMIResource } from '@emfts/core';
import { URI } from '@emfts/core';
import { newResourceSet, registerEcoreFromString } from '../emf/setup';
import type { AtlasReadClient } from './ModelAtlasClient';

export interface AtlasStageInfo {
  name: string;
  writable: boolean;
  final: boolean;
}

export interface AtlasRegistryInfo {
  name: string;
  description?: string;
  stages: AtlasStageInfo[];
}

export interface AtlasSchemaInfo {
  /** objectId der Registry (bei Schemas: Base64 der nsURI). */
  objectId: string;
  name: string;
  nsUri: string;
  stage: string;
  version?: string;
}

/**
 * Ein Objekt einer Registry-Stage (Mapping, Profil, Regeln). Anders als bei
 * Schemas ist die objectId hier kein Base64 der nsURI, sondern der Dateiname,
 * unter dem der Assistent das Artefakt veröffentlicht hat.
 */
export interface AtlasObjectInfo {
  objectId: string;
  name: string;
  /** Metamodell-Klasse laut Atlas, z. B. „ProviderMapping". */
  objectType?: string;
  stage: string;
  version?: string;
  uploadTime?: string;
  uploadUser?: string;
}

export interface AtlasConnection {
  baseUrl: string;
  scope: string;
  stage: string;
  token?: string;
}

/*
 * Eigener Schlüssel je Assistent. Der eorm-Wizard benutzt versehentlich den
 * des SensiNact-Assistenten und teilt sich mit ihm die Verbindungsdaten —
 * hier nicht.
 */
const STORAGE_KEY = 'data-atlas-wizard.atlas-connection';

export const DEFAULT_CONNECTION: AtlasConnection = {
  baseUrl: 'http://localhost:8185/rest',
  scope: '',
  stage: 'release',
};

export function loadStoredConnection(): AtlasConnection {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_CONNECTION };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_CONNECTION, ...JSON.parse(raw) } : { ...DEFAULT_CONNECTION };
  } catch {
    return { ...DEFAULT_CONNECTION };
  }
}

export function storeConnection(connection: AtlasConnection): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
}

/** Registriert die Atlas-API-Metamodelle (idempotent über die nsURI). */
export function registerAtlasApiPackages(managementXml: string, workflowXml: string): void {
  registerEcoreFromString(managementXml, 'atlas-management.ecore');
  registerEcoreFromString(workflowXml, 'atlas-workflow-api.ecore');
}

let parseCounter = 0;

/** Parst eine XMI-Antwort in EObjects (Wurzel-Inhalte der Resource). */
function parseXmiObjects(xmi: string): EObject[] {
  if (!xmi || !xmi.trim()) return [];
  const rs = newResourceSet();
  const resource = rs.createResource(URI.createURI(`atlas-response-${parseCounter++}.xmi`)) as XMIResource;
  resource.loadFromString(xmi);
  const contents = resource.getContents();
  const result: EObject[] = [];
  for (let i = 0; i < contents.size(); i++) {
    result.push(contents.get(i) as unknown as EObject);
  }
  return result;
}

function eget(obj: EObject, featureName: string): unknown {
  const feature = obj.eClass()?.getEStructuralFeature(featureName);
  return feature ? obj.eGet(feature) : undefined;
}

function egetString(obj: EObject, featureName: string): string {
  const value = eget(obj, featureName);
  return typeof value === 'string' ? value : '';
}

/**
 * Boolean-Attribut robust lesen: Im gene-Betrieb liefert das generierte
 * Atlas-API-Package die Werte als String (`"true"`), weil emfts-codegen die
 * Attribut-eTypes auslässt (siehe wizardPackageFixup) — das dynamisch
 * geladene Package liefert echte Booleans.
 */
function egetBoolean(obj: EObject, featureName: string): boolean {
  const value = eget(obj, featureName);
  return value === true || value === 'true';
}

/**
 * objectId von Schemas ist je nach Server die Base64-kodierte nsURI **oder**
 * eine UUID (so der Fennec-Atlas). Nur dekodieren, was danach wie eine nsURI
 * aussieht — sonst Rohwert.
 */
export function decodeSchemaNsUri(objectId: string): string {
  try {
    const decoded = atob(objectId);
    if (/^[\x20-\x7E]+$/.test(decoded) && decoded.includes(':')) return decoded;
  } catch {
    /* kein Base64 */
  }
  return objectId;
}

/**
 * Die nsURI steht in den Metadaten als Property `nsUri` — Java-serialisiert und
 * hexkodiert (`ACED0005 74 <len:2> <UTF-8>`). Ohne sie adressiert der
 * Content-Endpunkt ins Leere (HTTP 204), weil die objectId dort nicht zählt.
 */
export function decodeJavaSerializedString(hex: string): string | undefined {
  if (!/^[0-9A-Fa-f]+$/.test(hex) || hex.length < 16) return undefined;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  // AC ED 00 05 = Stream-Magic + Version, 74 = TC_STRING
  if (bytes[0] !== 0xac || bytes[1] !== 0xed || bytes[4] !== 0x74) return undefined;
  const length = (bytes[5] << 8) | bytes[6];
  const value = new TextDecoder().decode(bytes.subarray(7, 7 + length));
  return value || undefined;
}

/** nsURI eines Schemas: Property `nsUri` zuerst, sonst die objectId. */
function schemaNsUriOf(metadata: EObject, objectId: string): string {
  const properties = eget(metadata, 'properties');
  if (properties) {
    for (const entry of properties as Iterable<EObject>) {
      if (egetString(entry, 'key') !== 'nsUri') continue;
      const raw = egetString(entry, 'value');
      if (!raw) continue;
      const decoded = decodeJavaSerializedString(raw);
      if (decoded) return decoded;
      if (raw.includes(':')) return raw;
    }
  }
  return decodeSchemaNsUri(objectId);
}

/** Parst eine Schema-Listen-Antwort (ObjectMetadataContainer oder direkte Liste). */
export function parseSchemaList(xmi: string): AtlasSchemaInfo[] {
  const roots = parseXmiObjects(xmi);
  const metadataObjects: EObject[] = [];
  for (const root of roots) {
    const className = root.eClass()?.getName();
    if (className === 'ObjectMetadataContainer') {
      const list = eget(root, 'metadata');
      if (list) {
        for (const entry of list as Iterable<EObject>) metadataObjects.push(entry);
      }
    } else if (className === 'ObjectMetadata') {
      metadataObjects.push(root);
    }
  }
  return metadataObjects.map((m) => {
    const objectId = egetString(m, 'objectId');
    const nsUri = schemaNsUriOf(m, objectId);
    return {
      objectId,
      name: egetString(m, 'objectName') || nsUri,
      nsUri,
      stage: egetString(m, 'stage'),
      version: egetString(m, 'version') || undefined,
    };
  });
}

/**
 * Parst eine Objekt-Listen-Antwort einer Registry-Stage. Gleiches Container-
 * Format wie bei Schemas, aber ohne nsURI-Dekodierung der objectId.
 */
export function parseObjectList(xmi: string): AtlasObjectInfo[] {
  const roots = parseXmiObjects(xmi);
  const metadataObjects: EObject[] = [];
  for (const root of roots) {
    const className = root.eClass()?.getName();
    if (className === 'ObjectMetadataContainer') {
      const list = eget(root, 'metadata');
      if (list) {
        for (const entry of list as Iterable<EObject>) metadataObjects.push(entry);
      }
    } else if (className === 'ObjectMetadata') {
      metadataObjects.push(root);
    }
  }
  return metadataObjects
    .map((m) => {
      const objectId = egetString(m, 'objectId');
      return {
        objectId,
        name: egetString(m, 'objectName') || objectId,
        objectType: egetString(m, 'objectType') || undefined,
        stage: egetString(m, 'stage'),
        version: egetString(m, 'version') || undefined,
        uploadTime: egetString(m, 'uploadTime') || undefined,
        uploadUser: egetString(m, 'uploadUser') || undefined,
      };
    })
    .filter((o) => !!o.objectId);
}

/** Parst die Scope-Liste (ScopeListResponse.scopes bzw. direkte Scope-Objekte). */
export function parseScopeNames(xmi: string): string[] {
  const roots = parseXmiObjects(xmi);
  const names: string[] = [];
  for (const root of roots) {
    if (root.eClass()?.getName() === 'ScopeListResponse') {
      const scopes = eget(root, 'scopes');
      if (scopes) {
        for (const scope of scopes as Iterable<EObject>) names.push(egetString(scope, 'name'));
      }
    } else if (root.eClass()?.getName() === 'Scope') {
      names.push(egetString(root, 'name'));
    }
  }
  return names.filter(Boolean);
}

/** Parst die Scope-Antwort (Registries mit ihren Stages). */
export function parseScopeRegistries(xmi: string): AtlasRegistryInfo[] {
  const roots = parseXmiObjects(xmi);
  const scope = roots.find((r) => r.eClass()?.getName() === 'Scope');
  if (!scope) return [];
  const registries = eget(scope, 'registries');
  if (!registries) return [];
  const result: AtlasRegistryInfo[] = [];
  for (const registry of registries as Iterable<EObject>) {
    const stages: AtlasStageInfo[] = [];
    const stageList = eget(registry, 'stages');
    if (stageList) {
      for (const stage of stageList as Iterable<EObject>) {
        stages.push({
          name: egetString(stage, 'name'),
          writable: egetBoolean(stage, 'writable'),
          final: egetBoolean(stage, 'final'),
        });
      }
    }
    result.push({
      name: egetString(registry, 'name'),
      description: egetString(registry, 'description') || undefined,
      stages,
    });
  }
  return result;
}

/**
 * Fachliche Sicht des Wizards auf einen verbundenen Atlas-Scope/-Stage.
 * Der Client ist austauschbar (im gene-Betrieb: Original-ModelAtlasClient).
 */
export class AtlasModelSource {
  constructor(
    private readonly client: AtlasReadClient,
    private readonly scope: string,
    private readonly stage: string,
  ) {}

  async listScopes(): Promise<string[]> {
    return parseScopeNames(await this.client.listScopes());
  }

  async listSchemas(): Promise<AtlasSchemaInfo[]> {
    return parseSchemaList(await this.client.listSchemas(this.scope, this.stage));
  }

  /** Namens-/Präfix-Suche (Lucene-basiert, serverseitig). */
  async searchSchemas(query: string): Promise<AtlasSchemaInfo[]> {
    const xmi = await this.client.searchSchemas(this.scope, {
      name: query,
      stage: this.stage,
      limit: 50,
    });
    return parseSchemaList(xmi);
  }

  /**
   * Schemas, die einen Klassifizierer dieses Namens enthalten. Wird gebraucht,
   * wenn ein Mapping seine Modelle nur über Dateipfade nennt (T19/#190).
   */
  async searchByClassifier(classifier: string): Promise<AtlasSchemaInfo[]> {
    const xmi = await this.client.searchSchemas(this.scope, {
      classifier,
      stage: this.stage,
      limit: 10,
    });
    return parseSchemaList(xmi);
  }

  /** Exakte nsURI-Suche — Grundlage für das Cascade-Nachladen (T11). */
  async findByNsUri(nsUri: string): Promise<AtlasSchemaInfo | undefined> {
    const xmi = await this.client.searchSchemas(this.scope, {
      nsUriExact: nsUri,
      stage: this.stage,
      limit: 1,
    });
    return parseSchemaList(xmi)[0];
  }

  /** Registries des Scopes samt Stages — Grundlage für die Ziel-Auswahl. */
  async listRegistries(): Promise<AtlasRegistryInfo[]> {
    if (!this.client.getScope) return [];
    const xmi = await this.client.getScope(this.scope);
    return xmi ? parseScopeRegistries(xmi) : [];
  }

  /** Kann dieser Client überhaupt schreiben? */
  get canPublish(): boolean {
    return typeof this.client.uploadObject === 'function';
  }

  /**
   * Veröffentlicht ein Mapping-Artefakt (Mapping, Profil oder Regeln) als
   * Objekt in einer Registry-Stage des Atlas. Die Runtime-Source
   * (`org.eclipse.fennec.sensinact.mapping.atlas`) liest von dort und
   * registriert die Mappings als OSGi-Services.
   */
  async publishObject(
    registry: string,
    stage: string,
    objectId: string,
    content: string,
    options?: { name?: string; version?: string; override?: boolean },
  ): Promise<void> {
    if (!this.client.uploadObject) {
      throw new Error('Der Atlas-Client unterstützt kein Veröffentlichen.');
    }
    await this.client.uploadObject(this.scope, registry, stage, objectId, content, options);
  }

  /** Kann dieser Client bestehende Registry-Objekte lesen? */
  get canBrowseObjects(): boolean {
    return typeof this.client.listObjects === 'function' &&
      typeof this.client.getObjectContent === 'function';
  }

  /**
   * Bestehende Artefakte einer Registry-Stage — Grundlage für
   * „Bestehendes Mapping öffnen" (T18/#189).
   */
  async listObjects(registry: string, stage: string): Promise<AtlasObjectInfo[]> {
    if (!this.client.listObjects) return [];
    return parseObjectList(await this.client.listObjects(this.scope, registry, stage));
  }

  /** Roher Inhalt eines Registry-Objekts (null, wenn nicht vorhanden). */
  async getObjectContent(registry: string, stage: string, objectId: string): Promise<string | null> {
    if (!this.client.getObjectContent) return null;
    return this.client.getObjectContent(this.scope, registry, stage, objectId);
  }

  /** Roher .ecore-Inhalt eines Schemas (null, wenn nicht vorhanden). */
  async getSchemaContent(nsUri: string): Promise<string | null> {
    return this.client.getSchemaContent(this.scope, this.stage, nsUri);
  }

  /**
   * Lädt den .ecore-Inhalt eines Schemas und registriert seine EPackages.
   * @throws Error mit verständlicher Meldung, wenn das Schema nicht ladbar ist.
   */
  async loadSchemaPackages(nsUri: string): Promise<EPackage[]> {
    const content = await this.getSchemaContent(nsUri);
    if (!content) {
      throw new Error(
        `Das Modell „${nsUri}" ist im Atlas (Scope „${this.scope}", Stage „${this.stage}") nicht verfügbar.`,
      );
    }
    const pkg = registerEcoreFromString(content, `atlas/${encodeURIComponent(nsUri)}.ecore`);
    return [pkg];
  }
}
