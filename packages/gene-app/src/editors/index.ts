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
 *
 * Each view holds a mandatory reference to the plugin that carries it out. A
 * view whose plugin is not installed is therefore not registered at all, and
 * neither "Open with" nor a click on the file can reach an editor that is not
 * there - the TSM runtime withdraws and restores it as the plugin goes and comes.
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
