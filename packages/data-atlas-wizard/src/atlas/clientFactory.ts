/**
 * Hinweis zum Veröffentlichen: Der injizierte gene-`ModelAtlasClient` sendet
 * beim Upload `application/xml`, unser eigener Client `application/xmi` (so
 * empfiehlt es der SensiNact-User-Guide). Beides funktioniert gegen aktuelle
 * Atlas-Server; kritisch war `application/xml` nur bei älteren Servern in
 * Verbindung mit relativem `xsi:schemaLocation`, das der Wizard nicht
 * erzeugt. Ein contentType-Parameter im gene-Client wäre der saubere Weg.
 *
 * Austauschbare Client-Fabrik: Standalone nutzt den eigenen minimalen
 * ModelAtlasClient; im gene-Plugin-Betrieb injiziert activate() die Fabrik
 * des Original-Clients aus dem TSM-Modul `storage-model-atlas`
 * (Laufzeit- statt Build-Kopplung, siehe docs/PLAN-gene-plugin.md).
 */
import type { AtlasReadClient, ModelAtlasClientOptions } from './ModelAtlasClient';
import { ModelAtlasClient } from './ModelAtlasClient';

export type AtlasClientFactory = (options: ModelAtlasClientOptions) => AtlasReadClient;

let factory: AtlasClientFactory = (options) => new ModelAtlasClient(options);

export function setAtlasClientFactory(newFactory: AtlasClientFactory): void {
  factory = newFactory;
}

export function resetAtlasClientFactory(): void {
  factory = (options) => new ModelAtlasClient(options);
}

export function createAtlasClient(options: ModelAtlasClientOptions): AtlasReadClient {
  return factory(options);
}
