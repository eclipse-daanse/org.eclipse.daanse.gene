/**
 * The file views this application brings along.
 *
 * Each declares itself under `gene.editor.art`; the loader registers them and
 * the collector in ui-instance-tree takes them. Nothing here is listed anywhere
 * else - exporting the class is the registration.
 *
 * They live here for now because their `open` still goes through the actions of
 * App.vue. The plan has each one moving to the plugin it belongs to, which is a
 * move of the file and nothing more.
 */
export { MetamodelView } from './metamodelView'
export { InstanceView } from './instanceView'
export { EormView } from './eormView'
export { SensinactMappingView } from './sensinactMappingView'
export { TransformationView } from './transformationView'
export { ConstraintsView } from './constraintsView'
export { DataGeneratorView } from './dataGeneratorView'
export { DmnView } from './dmnView'
export { XmlView } from './xmlView'
