/**
 * Which classes get a diagram area (PH-10, CON-4.2).
 *
 * A registry per EClass name: plugins may add or remove classes through the
 * service `ui.cwm-editor.diagrams`. Description and Document never get one.
 * First stage: the area shows only the diagram's name; how diagrams come
 * about is still open (AS-6).
 */
import { reactive } from 'tsm:vue'
import { className } from './documentation'

const DEFAULT_CLASSES = [
  'Catalog', 'Schema', 'Table', 'View', 'Column', 'Index', 'Trigger',
  'SQLSimpleType', 'SQLDistinctType', 'SQLStructuredType', 'PrimaryKey', 'ForeignKey',
  'Class', 'Association', 'Generalization'
]

const classes = reactive(new Set<string>(DEFAULT_CLASSES))

export const diagramRegistry = {
  register(eClassName: string): void { classes.add(eClassName) },
  unregister(eClassName: string): void { classes.delete(eClassName) },
  has(eClassName: string): boolean { return classes.has(eClassName) }
}

export function hasDiagram(object: any): boolean {
  return diagramRegistry.has(className(object))
}
