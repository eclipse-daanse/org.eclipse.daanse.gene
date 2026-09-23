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
import { registerUsedModels } from '../services/atlasResolution'

const NS = 'urn:issue155:cfg'

const ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="cfg" nsURI="${NS}" nsPrefix="cfg">
  <eClassifiers xsi:type="ecore:EClass" name="Config"/>
</ecore:EPackage>`

/** A resource as the instance tree holds it: objects, and their packages. */
function fakeResource(nsUris: string[]) {
  const objectOf = (nsURI: string) => ({
    eClass: () => ({ getEPackage: () => ({ getNsURI: () => nsURI }) }),
    eContents: () => [],
  })
  return { getContents: () => nsUris.map(objectOf) }
}

/** The metadata listing and the content, as the Atlas answers them. */
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
</management:ObjectMetadataContainer>`,
      getObjectContent: async () => ECORE,
    },
  }
}

describe('registerUsedModels (#155)', () => {
  let loadEcoreFile: ReturnType<typeof vi.fn>
  let known: Array<{ nsURI: string }>

  beforeEach(() => {
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
    const registered = await registerUsedModels(fakeResource([NS]), [atlasProvider()], deps())
    expect(registered).toEqual([NS])
    expect(loadEcoreFile).toHaveBeenCalledWith(ECORE, NS)
  })

  it('was schon Modell ist, wird nicht noch einmal geladen', async () => {
    known.push({ nsURI: NS })
    const registered = await registerUsedModels(fakeResource([NS]), [atlasProvider()], deps())
    expect(registered).toEqual([])
    expect(loadEcoreFile).not.toHaveBeenCalled()
  })

  it('ohne Fundstelle passiert nichts', async () => {
    const registered = await registerUsedModels(fakeResource([NS]), [], deps())
    expect(registered).toEqual([])
    expect(loadEcoreFile).not.toHaveBeenCalled()
  })

  it('auch die Packages der Kindobjekte zählen', async () => {
    // Ein Dokument kann Objekte aus mehreren Modellen tragen
    const resource = {
      getContents: () => [
        {
          eClass: () => ({ getEPackage: () => ({ getNsURI: () => NS }) }),
          eContents: () => [
            {
              eClass: () => ({ getEPackage: () => ({ getNsURI: () => 'urn:issue155:other' }) }),
              eContents: () => [],
            },
          ],
        },
      ],
    }
    await registerUsedModels(resource, [atlasProvider()], deps())
    // Beide wurden gesucht; geliefert hat der Stellvertreter nur das eine
    expect(loadEcoreFile).toHaveBeenCalledTimes(1)
  })
})
