/**
 * Metamodelle aus dem Atlas gehören auch in die Modell-Liste (#155).
 *
 * Der Loader braucht ein Package nur in der EPackageRegistry, und genau
 * dorthin legt es sein URIConverter. Der Editor fragt aber den Model Browser,
 * welche Klassen zu einer Referenz passen — steht das Metamodell dort nicht,
 * bleibt "Add Child" bei jedem abstrakten Typ leer: keine Auswahl zwischen
 * JdbcDataSource und MongoDataSource, obwohl beide im Modell stehen.
 *
 * Eingetragen wird dabei **die Instanz, auf der die Objekte stehen**. Ein
 * zweites Parsen desselben Ecore ergäbe ein gleich aussehendes, aber anderes
 * EPackage — und jede Untertyp-Prüfung vergleicht über Identität, fände also
 * wieder nichts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  BasicResourceSet,
  EPackageRegistry,
  URI,
  XMIResource,
  type EPackage,
} from '@emfts/core'
import { registerUsedModels } from '../services/atlasResolution'

const NS = 'urn:issue155:cfg'

const NS_OTHER = 'urn:issue155:other'

const ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="cfg" nsURI="${NS}" nsPrefix="cfg">
  <eClassifiers xsi:type="ecore:EClass" name="Config">
    <eStructuralFeatures xsi:type="ecore:EReference" name="parts" upperBound="-1"
        eType="${NS_OTHER}#//Part" containment="true"/>
  </eClassifiers>
</ecore:EPackage>`

const ECORE_OTHER = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="other" nsURI="${NS_OTHER}" nsPrefix="other">
  <eClassifiers xsi:type="ecore:EClass" name="Part"/>
</ecore:EPackage>`

/** Loads an .ecore the way the app does, into the global registry. */
function registerPackage(ecore: string, name: string): EPackage {
  const rs = new BasicResourceSet(EPackageRegistry.INSTANCE as never)
  const resource = new XMIResource(URI.createURI(name))
  resource.setResourceSet(rs)
  resource.loadFromString(ecore)
  const pkg = resource.getContents().get(0) as unknown as EPackage
  EPackageRegistry.INSTANCE.set(pkg.getNsURI()!, pkg)
  return pkg
}

/**
 * A real instance document, as the tree holds it after loading: a Config with
 * a Part from a second model inside. `packagesOf` walks it through
 * `eClass()`/`eContents()`, so an object graph built by hand would prove
 * nothing about the real one.
 */
function instanceResource(): XMIResource {
  const rs = new BasicResourceSet(EPackageRegistry.INSTANCE as never)
  const resource = new XMIResource(URI.createURI('instances.xmi'))
  resource.setResourceSet(rs)
  resource.loadFromString(`<?xml version="1.0" encoding="UTF-8"?>
<cfg:Config xmlns:cfg="${NS}" xmlns:other="${NS_OTHER}" xmlns:xmi="http://www.omg.org/XMI"
    xmi:version="2.0">
  <parts/>
</cfg:Config>`)
  return resource
}

describe('registerUsedModels (#155)', () => {
  let registerLoadedPackage: ReturnType<typeof vi.fn>
  let known: Array<{ nsURI: string }>
  let cfgPackage: EPackage
  let otherPackage: EPackage

  beforeEach(() => {
    otherPackage = registerPackage(ECORE_OTHER, 'model/other.ecore')
    cfgPackage = registerPackage(ECORE, 'model/cfg.ecore')
    known = [{ nsURI: 'http://www.eclipse.org/emf/2002/Ecore' }]
    registerLoadedPackage = vi.fn((pkg: unknown, sourceFile: string) => {
      known.push({ nsURI: sourceFile })
      return pkg
    }) as unknown as ReturnType<typeof vi.fn>
  })

  const deps = () => ({
    modelBrowserComposables: {
      registerLoadedPackage: registerLoadedPackage as (p: unknown, s: string) => unknown,
      useSharedModelRegistry: () => ({ allPackages: { value: known } }),
    },
  })

  it('trägt das Metamodell der geladenen Objekte ein', () => {
    const registered = registerUsedModels(instanceResource(), deps())
    expect(registered).toContain(NS)
  })

  it('und zwar dieselbe Instanz, auf der die Objekte stehen', () => {
    /*
     * Der Kern von #155: Ein zweites Parsen ergäbe ein anderes EPackage, und
     * `getValidChildClasses` vergleicht Klassen über Identität — die Auswahl
     * bliebe leer, obwohl das Modell in der Liste steht.
     */
    registerUsedModels(instanceResource(), deps())
    const eingetragen = registerLoadedPackage.mock.calls.find((c) => c[1] === NS)?.[0]
    expect(eingetragen).toBe(cfgPackage)
  })

  it('auch das Modell eines Kindobjekts', () => {
    // Ein Dokument trägt Objekte aus mehreren Modellen; `parts` steht im
    // zweiten. Ohne den Abstieg bliebe es ungenannt.
    const registered = registerUsedModels(instanceResource(), deps())
    expect(registered).toContain(NS_OTHER)
    const eingetragen = registerLoadedPackage.mock.calls.find((c) => c[1] === NS_OTHER)?.[0]
    expect(eingetragen).toBe(otherPackage)
  })

  it('was schon Modell ist, wird nicht noch einmal eingetragen', () => {
    known.push({ nsURI: NS }, { nsURI: NS_OTHER })
    const registered = registerUsedModels(instanceResource(), deps())
    expect(registered).toEqual([])
    expect(registerLoadedPackage).not.toHaveBeenCalled()
  })

  it('ohne den Haken des Model Browsers passiert nichts', () => {
    const registered = registerUsedModels(instanceResource(), { modelBrowserComposables: {} })
    expect(registered).toEqual([])
  })
})
