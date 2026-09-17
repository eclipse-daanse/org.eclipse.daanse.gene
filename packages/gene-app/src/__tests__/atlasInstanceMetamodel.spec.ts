/**
 * Instanz aus dem Model Atlas oeffnen: das Metamodell wird nicht aufgeloest.
 *
 * Der Assistent-Weg im Explorer liefert den Inhalt einer Registry-Datei, und
 * der Instanzbaum laedt ihn. Steht das zugehoerige Ecore nur im Model Atlas —
 * und dort steht es, im selben Scope, unter genau dem nsURI aus dem
 * Instanzdokument — dann bricht das Laden mit „Package not found for prefix"
 * ab. gene fragt das Schema nie nach.
 *
 * Der Test haelt beides fest: was heute passiert, und was passieren muesste
 * (`it.fails`, schlaegt um, sobald es behoben ist). Siehe Issue zur
 * Schema-Aufloesung aus dem Model Atlas (#152).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFileSystem } from 'ui-file-explorer'
import { loadInstancesFromXMI } from 'ui-instance-tree'

const NS = 'https://example.org/person/1.0.0'

const PERSON_ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="person" nsURI="${NS}" nsPrefix="person">
  <eClassifiers xsi:type="ecore:EClass" name="Person">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="firstName"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
  </eClassifiers>
</ecore:EPackage>`

const PERSONS_XMI = `<?xml version="1.0" encoding="UTF-8"?>
<person:Person xmlns:person="${NS}" xmlns:xmi="http://www.omg.org/XMI"
    xmi:version="2.0" firstName="Ada"/>`

/** Ein Scope mit einer Schema- und einer Objekt-Registry. */
const SCOPE_XMI = `<?xml version="1.0" encoding="UTF-8"?>
<workflowapi:Scope xmlns:workflowapi="http://eclipse.org/fennec/model/atlas/workflow/api/1.0.0"
    xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0" name="jena">
  <registries name="atlas-schema-registry" type="SCHEMA">
    <stages name="draft"/>
  </registries>
  <registries name="configurations" type="OBJECT">
    <stages name="draft"/>
  </registries>
</workflowapi:Scope>`

function metaListe(objectId: string, objectName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<management:ObjectMetadataContainer xmlns:management="http://eclipse.org/fennec/model/atlas/management/1.0.0"
    xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0">
  <metadata objectId="${objectId}" objectName="${objectName}"/>
</management:ObjectMetadataContainer>`
}

/** Alle URLs, die der Explorer angefragt hat — daran haengt die Aussage. */
let gefragt: string[] = []

/** Ein Model Atlas, der nur seine dokumentierten Wege beantwortet. */
function fakeAtlas(url: string): Response {
  gefragt.push(url)
  const u = new URL(url, 'http://atlas.local')
  const p = u.pathname
  const q = (name: string) => u.searchParams.get(name)

  if (p === '/atlas/rest/scopes/jena') return new Response(SCOPE_XMI, { status: 200 })
  if (p === '/atlas/rest/jena/registries/atlas-schema-registry/stages/draft') {
    return new Response(metaListe(NS, 'person'), { status: 200 })
  }
  if (p === '/atlas/rest/jena/registries/configurations/stages/draft') {
    return new Response(metaListe('persons', 'persons'), { status: 200 })
  }
  if (p === '/atlas/rest/jena/registries/atlas-schema-registry/stages/draft/content') {
    return q('objectId') === NS
      ? new Response(PERSON_ECORE, { status: 200 })
      : new Response('not found', { status: 404 })
  }
  if (p === '/atlas/rest/jena/registries/configurations/stages/draft/content') {
    return q('objectId') === 'persons'
      ? new Response(PERSONS_XMI, { status: 200 })
      : new Response('not found', { status: 404 })
  }
  return new Response('not found', { status: 404 })
}

/** Der Scope im Explorer, wie nach „Add Source → Model Atlas". */
async function atlasQuelle() {
  const fs = useFileSystem()
  const quelle = fs.addAtlasSource(`jena-${Math.random()}`, '/atlas/rest', 'jena')
  await fs.refreshSource(quelle.id)
  return { fs, quelle }
}

describe('Instanz aus dem Model Atlas', () => {
  beforeEach(() => {
    gefragt = []
    vi.stubGlobal('fetch', vi.fn(async (input: any) => fakeAtlas(String(input))))
  })

  it('der Scope bringt Schema und Instanz mit', async () => {
    const { fs, quelle } = await atlasQuelle()

    const ecore = fs.getFileByPath(quelle.id, 'atlas-schema-registry/draft/person.ecore')
    const instanz = fs.getFileByPath(quelle.id, 'configurations/draft/persons.xmi')
    expect(ecore?.extension).toBe('.ecore')
    expect(instanz?.extension).toBe('.xmi')

    // Beides ist abrufbar — gene hat alles, was es braucht
    expect(await fs.readTextFile(ecore as never)).toContain(`nsURI="${NS}"`)
    expect(await fs.readTextFile(instanz as never)).toContain(`xmlns:person="${NS}"`)
  })

  it('das Laden bricht ab, weil das Metamodell fehlt', async () => {
    const { fs, quelle } = await atlasQuelle()
    const instanz = fs.getFileByPath(quelle.id, 'configurations/draft/persons.xmi')
    const inhalt = await fs.readTextFile(instanz as never)

    await expect(loadInstancesFromXMI(inhalt, instanz!.path)).rejects.toThrow(
      /Package not found for prefix 'person'/,
    )
  })

  it('und niemand hat das Schema dafuer angefragt', async () => {
    const { fs, quelle } = await atlasQuelle()
    const instanz = fs.getFileByPath(quelle.id, 'configurations/draft/persons.xmi')
    const inhalt = await fs.readTextFile(instanz as never)
    await loadInstancesFromXMI(inhalt, instanz!.path).catch(() => undefined)

    const schemaAbrufe = gefragt.filter((u) => u.includes('atlas-schema-registry') && u.includes('/content'))
    expect(schemaAbrufe).toEqual([])
  })

  it.fails('Soll: das Schema aus demselben Scope wird nachgeladen', async () => {
    const { fs, quelle } = await atlasQuelle()
    const instanz = fs.getFileByPath(quelle.id, 'configurations/draft/persons.xmi')
    const inhalt = await fs.readTextFile(instanz as never)

    const ergebnis = await loadInstancesFromXMI(inhalt, instanz!.path)
    expect(ergebnis.loadedCount).toBe(1)
  })
})
