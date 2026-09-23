/**
 * Metamodelle aus dem Atlas gehören auch in die Modell-Liste (#155).
 *
 * Der Loader braucht ein Package nur in der EPackageRegistry, und genau
 * dorthin legt es sein URIConverter. Der Editor fragt aber den Model Browser,
 * welche Klassen zu einer Referenz passen — steht das Metamodell dort nicht,
 * bleibt "Add Child" bei jedem abstrakten Typ leer: keine Auswahl zwischen
 * JdbcDataSource und MongoDataSource, obwohl beide im Modell stehen.
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

/**
 * The metadata listing and the content, as the Atlas answers them. Only the
 * HTTP boundary is stood in for — everything above it is the real code.
 */
function atlasProvider() {
  return {
    scopeName: 'jena',
    stage: 'release',
    registryName: 'schemas',
    client: {
      listObjects: async () => `<?xml version="1.0" encoding="UTF-8"?>
<management:ObjectMetadataContainer xmlns:management="http://eclipse.org/fennec/model/atlas/management/1.0.0"
    xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0">
  <metadata objectId="${NS}" objectName="cfg"/>
  <metadata objectId="${NS_OTHER}" objectName="other"/>
</management:ObjectMetadataContainer>`,
      getObjectContent: async (_scope: string, _registry: string, _stage: string, objectId: string) =>
        objectId === NS ? ECORE : ECORE_OTHER,
    },
  }
}

describe('registerUsedModels (#155)', () => {
  let loadEcoreFile: ReturnType<typeof vi.fn>
  let known: Array<{ nsURI: string }>

  beforeEach(() => {
    registerPackage(ECORE_OTHER, 'model/other.ecore')
    registerPackage(ECORE, 'model/cfg.ecore')
    known = [{ nsURI: 'http://www.eclipse.org/emf/2002/Ecore' }]
    loadEcoreFile = vi.fn(async (_content: string, path: string) => {
      known.push({ nsURI: path })
      return {}
    })
  })

  const deps = () => ({
    modelBrowserComposables: {
      loadEcoreFile,
      useSharedModelRegistry: () => ({ allPackages: { value: known } }),
    },
  })

  it('holt das Metamodell nach und trägt es als Modell ein', async () => {
    const registered = await registerUsedModels(instanceResource(), [atlasProvider()], deps())
    expect(registered).toContain(NS)
    expect(loadEcoreFile).toHaveBeenCalledWith(ECORE, NS)
  })

  it('auch das Modell eines Kindobjekts', async () => {
    // Ein Dokument trägt Objekte aus mehreren Modellen; `parts` steht im
    // zweiten. Ohne den Abstieg bliebe es ungenannt.
    const registered = await registerUsedModels(instanceResource(), [atlasProvider()], deps())
    expect(registered).toContain(NS_OTHER)
    expect(loadEcoreFile).toHaveBeenCalledWith(ECORE_OTHER, NS_OTHER)
  })

  it('was schon Modell ist, wird nicht noch einmal geladen', async () => {
    known.push({ nsURI: NS }, { nsURI: NS_OTHER })
    const registered = await registerUsedModels(instanceResource(), [atlasProvider()], deps())
    expect(registered).toEqual([])
    expect(loadEcoreFile).not.toHaveBeenCalled()
  })

  it('ohne Fundstelle passiert nichts', async () => {
    const registered = await registerUsedModels(instanceResource(), [], deps())
    expect(registered).toEqual([])
    expect(loadEcoreFile).not.toHaveBeenCalled()
  })
})
