/**
 * Diagrams of the diagram area (PH-10, FR-4.2): model-driven, with the
 * generic interpreter of ui-diagram-preview. A diagram definition
 * (diagrammodel) says which CWM objects become nodes, rows and edges - and,
 * through its bindings, which objects show it, from which root, focused on
 * which objects. This module only loads the definitions and asks them.
 */
import { EPackageRegistry, EResourceSetImpl, getEcorePackage, URI, XMIResource } from '@emfts/core'
import { toRaw } from 'tsm:vue'
import { bindingFor, diagrammodelEcore } from 'ui-diagram-preview'
import erdXmi from '../../model/cwm-erd-diagram.xmi?raw'
import classXmi from '../../model/cwm-class-diagram.xmi?raw'

const ECORE_NS_URI = 'http://www.eclipse.org/emf/2002/Ecore'

export type DiagramKind = 'erd' | 'class'

/** The definitions, in the order they are asked */
const DEFINITIONS: Record<DiagramKind, { file: string; xmi: string }> = {
  erd: { file: 'cwm-erd-diagram.xmi', xmi: erdXmi },
  class: { file: 'cwm-class-diagram.xmi', xmi: classXmi }
}

export interface DiagramFor {
  definition: any
  /** The objects the diagram is drawn from - several for a focus spanning top-level packages */
  roots: any[]
  /** Focus diagram: only these objects and their containers; null = everything under the root */
  focus: any[] | null
}

/** The diagram the object shows: the first definition with a binding for its class - or null */
export async function diagramFor(object: any): Promise<DiagramFor | null> {
  const o = toRaw(object)
  for (const kind of Object.keys(DEFINITIONS) as DiagramKind[]) {
    const definition = await diagramDefinition(o, kind)
    const b = definition ? bindingFor(definition, o) : null
    if (b) return { definition, roots: b.roots, focus: b.focus }
  }
  return null
}

/** Loaded definitions, per kind and per package registry they resolve against */
const loaded = new Map<DiagramKind, WeakMap<object, Promise<any | null>>>()

/** Registries the CWM classes can be found in: the model's resource set's, then the global one */
function registriesOf(object: any): any[] {
  const own = toRaw(object)?.eResource?.()?.getResourceSet?.()?.getPackageRegistry?.()
  return [own, EPackageRegistry.INSTANCE].filter(Boolean)
}

async function load(object: any, kind: DiagramKind): Promise<any | null> {
  const rs = new EResourceSetImpl()
  const registry = rs.getPackageRegistry()
  registry.set(ECORE_NS_URI, getEcorePackage())
  // The definition points into CWM by nsURI; it resolves against the model's packages
  for (const source of registriesOf(object)) {
    for (const nsURI of source.keys?.() ?? []) {
      if (!registry.has(nsURI)) {
        const pkg = source.getEPackage?.(nsURI)
        if (pkg) registry.set(nsURI, pkg)
      }
    }
  }
  const meta = new XMIResource(new URI('diagrammodel.ecore'))
  meta.setResourceSet(rs)
  await meta.loadFromString(diagrammodelEcore)
  const pkg = meta.getContents()[0] as any
  if (pkg) registry.set(String(pkg.eGet(pkg.eClass().getEStructuralFeature('nsURI'))), pkg)

  const { file, xmi } = DEFINITIONS[kind]
  const definition = new XMIResource(new URI(file))
  definition.setResourceSet(rs)
  await definition.loadFromString(xmi)
  return definition.getContents()[0] ?? null
}

/** The definition of a diagram kind, resolved against the packages of the object's model */
export function diagramDefinition(object: any, kind: DiagramKind): Promise<any | null> {
  const key = registriesOf(object)[0]
  let perRegistry = loaded.get(kind)
  if (!perRegistry) loaded.set(kind, (perRegistry = new WeakMap()))
  let p = perRegistry.get(key)
  if (!p) {
    p = load(object, kind).catch(e => {
      console.warn(`[cwm-editor] Diagram definition "${kind}" could not be loaded:`, e)
      return null
    })
    perRegistry.set(key, p)
  }
  return p
}
