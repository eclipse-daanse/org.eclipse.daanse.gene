/**
 * Instanz aus dem Model Atlas oeffnen: das Metamodell wird nicht aufgeloest.
 *
 * Der Weg im Explorer liefert den Inhalt einer Registry-Datei, und der
 * Instanzbaum laedt ihn. Steht das zugehoerige Ecore nur im Model Atlas — und
 * dort steht es, im selben Scope, unter genau dem nsURI aus dem
 * Instanzdokument — dann bricht der Loader mit „Package not found for prefix"
 * ab: er holt sich fehlende Packages nicht selbst (emf.ts#88).
 *
 * Seit @emfts/core 0.3 macht das Nachladen der Loader selbst (emf.ts#88): er
 * sammelt die unbekannten nsURIs, holt sie ueber den URIConverter des
 * ResourceSet und parst erneut. `prepareAtlasResolution` haengt dafuer nur den
 * Atlas-Converter ein — mit den Fundstellen des Scopes, aus dem die Datei
 * stammt, samt seiner geerbten Eltern. Siehe #152.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFileSystem } from 'ui-file-explorer'
import { loadInstancesFromXMI } from 'ui-instance-tree'
import { setPackageURIConverter } from 'ui-instance-tree'
import { prepareAtlasResolution } from '../services/atlasResolution'

const NS = 'https://example.org/person/1.0.0'
/** Eigener nsURI fuer den Vererbungsfall — NS ist da laengst registriert. */
const NS_GEERBT = 'https://example.org/geerbt/1.0.0'

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

/**
 * Derselbe Scope, aber mit geerbtem Plattform-Scope — und ohne eigenes
 * Schema. Genau die Lage im Betrieb: gemeinsame Metamodelle liegen oben.
 */
const SCOPE_MIT_ELTERN = SCOPE_XMI.replace('name="jena"', 'name="jena" parentScope="platform"')

const PLATFORM_SCOPE_XMI = `<?xml version="1.0" encoding="UTF-8"?>
<workflowapi:Scope xmlns:workflowapi="http://eclipse.org/fennec/model/atlas/workflow/api/1.0.0"
    xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0" name="platform">
  <registries name="atlas-schema-registry" type="SCHEMA">
    <stages name="release"/>
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
/** Liegt das Schema im Elternscope statt im eigenen? */
let geerbt = false

/** Ein Model Atlas, der nur seine dokumentierten Wege beantwortet. */
function fakeAtlas(url: string): Response {
  gefragt.push(url)
  const u = new URL(url, 'http://atlas.local')
  const p = u.pathname
  const q = (name: string) => u.searchParams.get(name)

  if (p === '/atlas/rest/scopes/jena') {
    return new Response(geerbt ? SCOPE_MIT_ELTERN : SCOPE_XMI, { status: 200 })
  }
  if (p === '/atlas/rest/scopes/platform') {
    return new Response(PLATFORM_SCOPE_XMI, { status: 200 })
  }
  if (p === '/atlas/rest/jena/registries/atlas-schema-registry/stages/draft') {
    // Im geerbten Aufbau fuehrt der eigene Scope das Schema nicht
    return new Response(geerbt ? metaListe('', '') : metaListe(NS, 'person'), { status: 200 })
  }
  if (p === '/atlas/rest/platform/registries/atlas-schema-registry/stages/release') {
    return new Response(metaListe(NS_GEERBT, 'geerbt'), { status: 200 })
  }
  if (p === '/atlas/rest/platform/registries/atlas-schema-registry/stages/release/content') {
    return q('objectId') === NS_GEERBT
      ? new Response(PERSON_ECORE.replace(NS, NS_GEERBT).replace('name="person"', 'name="geerbt"'), {
          status: 200,
        })
      : new Response('not found', { status: 404 })
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

/** Haengt den Atlas-Converter fuer diesen Eintrag ein, wie die App es tut. */
async function haengeEin(entry: unknown) {
  return prepareAtlasResolution(entry, {
    instanceTreeComposables: { setPackageURIConverter },
  })
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
    geerbt = false
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

  it('ohne eingehängten Converter bricht das Laden ab', async () => {
    const { fs, quelle } = await atlasQuelle()
    const instanz = fs.getFileByPath(quelle.id, 'configurations/draft/persons.xmi')
    const inhalt = await fs.readTextFile(instanz as never)

    // Nur die Fundstellen fehlen — der Loader nennt jetzt immerhin den nsURI
    await expect(loadInstancesFromXMI(inhalt, instanz!.path)).rejects.toThrow(
      new RegExp(`Package not found for prefix 'person' \\(nsURI '${NS}'\\)`),
    )
  })

  it('mit eingehängtem Converter holt der Loader das Schema selbst', async () => {
    const { fs, quelle } = await atlasQuelle()
    const instanz = fs.getFileByPath(quelle.id, 'configurations/draft/persons.xmi')
    const inhalt = await fs.readTextFile(instanz as never)

    const setup = await haengeEin(instanz)
    expect(setup.searched).toContain('jena/atlas-schema-registry/draft')

    const ergebnis = await loadInstancesFromXMI(inhalt, instanz!.path)
    expect(ergebnis.loadedCount).toBe(1)
    expect(ergebnis.errors).toEqual([])
    expect(ergebnis.missingPackages).toEqual([])
    // Das Schema kam über den Atlas, nicht aus dem Nichts
    expect(gefragt.some((u) => u.includes('atlas-schema-registry') && u.includes('/content'))).toBe(
      true,
    )
  })

  it('ein nsURI, den niemand kennt, wird mit nsURI gemeldet', async () => {
    const { fs, quelle } = await atlasQuelle()
    const instanz = fs.getFileByPath(quelle.id, 'configurations/draft/persons.xmi')
    const fremd = PERSONS_XMI.replace(NS, 'https://example.org/unbekannt/1.0.0')

    await haengeEin(instanz)
    // Der Loader versucht es, findet nichts und nennt den nsURI — nicht nur
    // das Präfix, aus dem sich nichts nachladen liesse
    await expect(loadInstancesFromXMI(fremd, 'unbekannt.xmi')).rejects.toThrow(
      /nsURI 'https:\/\/example\.org\/unbekannt\/1\.0\.0'/,
    )
  })

  it('ohne Herkunft wird gar nicht erst eingehängt — mit Begründung', async () => {
    // Genau der Fall des Atlas-Browsers, bevor er seine Herkunft mitgab
    const setup = await haengeEin({ name: 'x.xmi', path: 'atlas://x.xmi' })
    expect(setup.searched).toEqual([])
    expect(setup.note).toMatch(/keine Fundstelle/)
  })

  it('das Schema darf im geerbten Plattform-Scope liegen', async () => {
    // Der eigene Scope fuehrt es nicht — seine Registry-Liste nennt geerbte
    // Schemas nicht mit. Ohne die Elternkette bliebe es unauffindbar.
    geerbt = true
    const { fs, quelle } = await atlasQuelle()
    const instanz = fs.getFileByPath(quelle.id, 'configurations/draft/persons.xmi')
    const inhalt = PERSONS_XMI.replace(NS, NS_GEERBT)

    const setup = await haengeEin(instanz)
    expect(setup.searched).toContain('platform/atlas-schema-registry/release')

    const ergebnis = await loadInstancesFromXMI(inhalt, 'geerbt.xmi')
    expect(ergebnis.loadedCount).toBe(1)
    expect(ergebnis.missingPackages).toEqual([])
  })
})
