/**
 * The host's metamodel resolution (`gene.metamodel.resolver`), adopted like the
 * file system and the atlas browser: gene looks in its registry, the workspace's
 * .ecore files and the workspace's Atlas providers - the same chain the
 * instance editor uses. The wizard asks it before it declares a model missing.
 */
export interface MetamodelResolution {
  resolved: string[];
  missing: string[];
  searched: string[];
}

export interface HostMetamodelResolver {
  resolve(nsURIs: string[], entry?: unknown): Promise<MetamodelResolution>;
}

let resolver: HostMetamodelResolver | undefined;

export function setMetamodelResolver(service: HostMetamodelResolver | undefined): void {
  resolver = service;
}

export function getMetamodelResolver(): HostMetamodelResolver | undefined {
  return resolver;
}
