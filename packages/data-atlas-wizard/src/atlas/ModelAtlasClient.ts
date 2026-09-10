/**
 * Minimaler, read-only REST-Client für den Modelatlas.
 *
 * Signaturkompatible Teilmenge des gene-Clients
 * (gene/packages/storage-model-atlas/src/ModelAtlasClient.ts) — im
 * gene-Plugin-Betrieb kann der Original-Client injiziert werden
 * (siehe docs/PLAN-gene-plugin.md, Laufzeit- statt Build-Kopplung).
 *
 * Alle Methoden liefern rohe XMI-Strings; das Parsen übernimmt
 * atlasSource.ts über das dynamische EMF (management/workflow-api-Ecores).
 */

export interface ModelAtlasClientOptions {
  /** Basis-URL der Modelatlas-REST-API, z. B. http://localhost:8185/rest */
  baseUrl: string;
  /** Optionaler Bearer-Token */
  token?: string;
}

/** Vom Wizard genutzte Teilmenge der Client-API (Strings = rohes XMI). */
export interface AtlasReadClient {
  listScopes(): Promise<string>;
  listSchemas(scopeName: string, stage: string): Promise<string>;
  listAllSchemas(scopeName: string): Promise<string>;
  searchSchemas(scopeName: string, params: AtlasSearchParams): Promise<string>;
  getSchemaContent(scopeName: string, stage: string, nsUri: string): Promise<string | null>;
  /** Scope-Beschreibung (Registries + Stages) — optional, für die Ziel-Auswahl. */
  getScope?(scopeName: string): Promise<string | null>;
  /**
   * Lädt ein Objekt (Mapping, Profil, Regeln) in eine Registry.
   * Signaturgleich zum gene-Client, damit dieser injiziert werden kann.
   */
  uploadObject?(
    scopeName: string,
    registryName: string,
    stage: string,
    objectId: string,
    content: string,
    options?: { name?: string; version?: string; override?: boolean },
  ): Promise<string>;
  /**
   * Objekte einer Registry-Stage auflisten (rohes ObjectMetadata-XMI) —
   * Grundlage für „Bestehendes Mapping öffnen“ (T18/#189).
   */
  listObjects?(scopeName: string, registryName: string, stage: string): Promise<string>;
  /** Inhalt eines Registry-Objekts; null, wenn es dort nicht existiert. */
  getObjectContent?(
    scopeName: string,
    registryName: string,
    stage: string,
    objectId: string,
  ): Promise<string | null>;
  /**
   * Schema-Metadaten einer Stage; null, wenn dort keins liegt. Grundlage der
   * Existenzprüfung im Publish-Flow.
   */
  getSchema?(scopeName: string, stage: string, nsUri: string): Promise<string | null>;
  /** Lädt ein Schema (.ecore) in eine Stage. */
  uploadSchema?(
    scopeName: string,
    stage: string,
    content: string,
    options?: { nsUri?: string; name?: string; version?: string; overwrite?: boolean },
  ): Promise<string>;
  /** Schiebt ein Objekt in die nächste Stage. */
  transitionObject?(
    scopeName: string,
    registryName: string,
    fromStage: string,
    objectId: string,
    targetStage: string,
  ): Promise<string | null>;
}

export interface AtlasSearchParams {
  nsUri?: string;
  nsUriExact?: string;
  name?: string;
  prefix?: string;
  classifier?: string;
  featureName?: string;
  stage?: string;
  limit?: number;
  offset?: number;
}

const enc = encodeURIComponent;

export class ModelAtlasClient implements AtlasReadClient {
  private baseUrl: string;
  private token?: string;

  constructor(options: ModelAtlasClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
  }

  async listScopes(): Promise<string> {
    const resp = await this.get('/scopes');
    return resp.status === 200 ? resp.text() : '';
  }

  async listSchemas(scopeName: string, stage: string): Promise<string> {
    const resp = await this.get(`/${enc(scopeName)}/schema/stages/${enc(stage)}`);
    return resp.status === 200 ? resp.text() : '';
  }

  async listAllSchemas(scopeName: string): Promise<string> {
    const resp = await this.get(`/${enc(scopeName)}/schema/all`);
    return resp.status === 200 ? resp.text() : '';
  }

  async searchSchemas(scopeName: string, params: AtlasSearchParams): Promise<string> {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) qs.set(key, String(value));
    }
    const resp = await this.get(`/${enc(scopeName)}/schema/search?${qs.toString()}`);
    return resp.status === 200 ? resp.text() : '';
  }

  async getSchemaContent(scopeName: string, stage: string, nsUri: string): Promise<string | null> {
    const resp = await this.get(
      `/${enc(scopeName)}/schema/stages/${enc(stage)}/content?nsUri=${enc(nsUri)}`,
    );
    return resp.status === 200 ? resp.text() : null;
  }

  async getScope(scopeName: string): Promise<string | null> {
    const resp = await this.get(`/scopes/${enc(scopeName)}`);
    return resp.status === 200 ? resp.text() : null;
  }

  /**
   * Veröffentlicht ein Objekt in einer Registry-Stage.
   * Content-Type ist `application/xmi` — so empfiehlt es der SensiNact-
   * User-Guide für Mapping-XMIs (ältere Atlas-Server stolpern über
   * `application/xml` in Verbindung mit relativem xsi:schemaLocation; der
   * Wizard emittiert ohnehin keins).
   */
  async uploadObject(
    scopeName: string,
    registryName: string,
    stage: string,
    objectId: string,
    content: string,
    options?: { name?: string; version?: string; override?: boolean },
  ): Promise<string> {
    const params = new URLSearchParams();
    if (options?.name) params.set('name', options.name);
    if (options?.version) params.set('version', options.version);
    if (options?.override) params.set('override', 'true');
    const qs = params.toString();
    const path = `/${enc(scopeName)}/registries/${enc(registryName)}/stages/${enc(stage)}/${enc(objectId)}${qs ? '?' + qs : ''}`;

    const headers: Record<string, string> = {
      Accept: 'application/xml',
      'Content-Type': 'application/xmi',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const resp = await fetch(`${this.baseUrl}${path}`, { method: 'POST', headers, body: content });
    if (resp.status === 200 || resp.status === 201) return resp.text();
    throw new Error(`Upload fehlgeschlagen (HTTP ${resp.status}): ${await resp.text()}`);
  }

  /** Schema-Metadaten einer Stage; null heißt „dort ist keins". */
  async getSchema(scopeName: string, stage: string, nsUri: string): Promise<string | null> {
    const resp = await this.get(
      `/${enc(scopeName)}/schema/stages/${enc(stage)}?nsUri=${enc(nsUri)}`,
    );
    if (resp.status === 200) return resp.text();
    return null;
  }

  /**
   * Lädt ein Schema in eine Stage. Der Kurzweg `/schema/stages/<stage>` gilt
   * für alle Scopes; die Registry-Variante des gene-Clients braucht es hier
   * nicht, weil Schemas im Atlas eine eigene Registry haben.
   */
  async uploadSchema(
    scopeName: string,
    stage: string,
    content: string,
    options?: { nsUri?: string; name?: string; version?: string; overwrite?: boolean },
  ): Promise<string> {
    const params = new URLSearchParams();
    if (options?.nsUri) params.set('nsUri', options.nsUri);
    if (options?.name) params.set('name', options.name);
    if (options?.version) params.set('version', options.version);
    if (options?.overwrite) params.set('overwrite', 'true');
    const qs = params.toString();
    const path = `/${enc(scopeName)}/schema/stages/${enc(stage)}${qs ? '?' + qs : ''}`;

    const headers: Record<string, string> = {
      Accept: 'application/xml',
      'Content-Type': 'application/xml',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const resp = await fetch(`${this.baseUrl}${path}`, { method: 'POST', headers, body: content });
    if (resp.status === 200 || resp.status === 201) return resp.text();
    throw new Error(`Schema-Upload fehlgeschlagen (HTTP ${resp.status}): ${await resp.text()}`);
  }

  /**
   * Schiebt ein Objekt in die nächste Stage.
   *
   * Der Rumpf ist handgebautes XMI: mit JSON antwortet der Atlas mit 500.
   */
  async transitionObject(
    scopeName: string,
    registryName: string,
    fromStage: string,
    objectId: string,
    targetStage: string,
  ): Promise<string | null> {
    const esc = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<rest:StageTransitionRequest xmlns:rest="http://eclipse.org/fennec/model/atlas/rest/1.0"` +
      ` objectId="${esc(objectId)}" targetStage="${esc(targetStage)}"/>`;

    const headers: Record<string, string> = {
      Accept: 'application/xml',
      'Content-Type': 'application/xmi',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const resp = await fetch(
      `${this.baseUrl}/${enc(scopeName)}/registries/${enc(registryName)}/stages/${enc(fromStage)}/actions/transition`,
      { method: 'POST', headers, body },
    );
    if (resp.status === 204) return '';
    if (resp.ok) return resp.text();
    throw new Error(`Transition fehlgeschlagen (HTTP ${resp.status}): ${await resp.text()}`);
  }

  /** Objekte einer Registry-Stage (rohes ObjectMetadata-XMI, '' wenn leer). */
  async listObjects(scopeName: string, registryName: string, stage: string): Promise<string> {
    const resp = await this.get(
      `/${enc(scopeName)}/registries/${enc(registryName)}/stages/${enc(stage)}`,
    );
    return resp.status === 200 ? resp.text() : '';
  }

  /**
   * Inhalt eines Registry-Objekts. Der objectId steht als Query-Parameter,
   * nicht im Pfad — Serverkonvention, vgl. gene-Client `getObjectContent`.
   */
  async getObjectContent(
    scopeName: string,
    registryName: string,
    stage: string,
    objectId: string,
  ): Promise<string | null> {
    const resp = await this.get(
      `/${enc(scopeName)}/registries/${enc(registryName)}/stages/${enc(stage)}/content?objectId=${enc(objectId)}`,
    );
    return resp.status === 200 ? resp.text() : null;
  }

  /** Erreichbarkeits-Check für das Verbindungsformular. */
  async isReachable(): Promise<boolean> {
    try {
      const resp = await this.get('/scopes');
      return resp.ok;
    } catch {
      return false;
    }
  }

  private async get(path: string): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/xml' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return fetch(`${this.baseUrl}${path}`, { headers });
  }
}
