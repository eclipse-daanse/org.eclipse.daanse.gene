/**
 * Opening an instance from the Model Atlas: where its metamodel comes from.
 *
 * The explorer route delivers the content of a registry file, and the instance
 * tree loads it. When the matching Ecore lives only in the Model Atlas — and
 * it does, in the same scope, under exactly the nsURI from the instance
 * document — the loader used to stop at "Package not found for prefix".
 *
 * Since @emfts/core 0.3 the loader fetches it itself (emf.ts#88): it collects
 * the unknown nsURIs, gets them through the resource set's URI converter and
 * parses again. `prepareAtlasResolution` only installs the Atlas converter for
 * that — with the providers of the scope the file came from, including its
 * inherited parents. See #152.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFileSystem } from 'ui-file-explorer'
import { loadInstancesFromXMI } from 'ui-instance-tree'
import { setPackageURIConverter } from 'ui-instance-tree'
import { prepareAtlasResolution } from '../services/atlasResolution'

const NS = 'https://example.org/person/1.0.0'
/** Its own nsURI for the inheritance case — NS is long registered by then. */
const NS_INHERITED = 'https://example.org/inherited/1.0.0'

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

/** A scope with one schema and one object registry. */
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
 * The same scope, but with an inherited platform scope — and without a schema
 * of its own. Exactly the situation in production: shared metamodels live one
 * level up.
 */
const SCOPE_MIT_ELTERN = SCOPE_XMI.replace('name="jena"', 'name="jena" parentScope="platform"')

const PLATFORM_SCOPE_XMI = `<?xml version="1.0" encoding="UTF-8"?>
<workflowapi:Scope xmlns:workflowapi="http://eclipse.org/fennec/model/atlas/workflow/api/1.0.0"
    xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0" name="platform">
  <registries name="atlas-schema-registry" type="SCHEMA">
    <stages name="release"/>
  </registries>
</workflowapi:Scope>`

function metadataListing(objectId: string, objectName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<management:ObjectMetadataContainer xmlns:management="http://eclipse.org/fennec/model/atlas/management/1.0.0"
    xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0">
  <metadata objectId="${objectId}" objectName="${objectName}"/>
</management:ObjectMetadataContainer>`
}

/** Every URL the explorer asked for — the assertions hang on it. */
let requested: string[] = []
/** Does the schema live in the parent scope instead of this one? */
let inherited = false

/** A Model Atlas that answers its documented routes only. */
function fakeAtlas(url: string): Response {
  requested.push(url)
  const u = new URL(url, 'http://atlas.local')
  const p = u.pathname
  const q = (name: string) => u.searchParams.get(name)

  if (p === '/atlas/rest/scopes/jena') {
    return new Response(inherited ? SCOPE_MIT_ELTERN : SCOPE_XMI, { status: 200 })
  }
  if (p === '/atlas/rest/scopes/platform') {
    return new Response(PLATFORM_SCOPE_XMI, { status: 200 })
  }
  if (p === '/atlas/rest/jena/registries/atlas-schema-registry/stages/draft') {
    // In the inherited setup the scope itself does not hold the schema
    return new Response(inherited ? metadataListing('', '') : metadataListing(NS, 'person'), { status: 200 })
  }
  if (p === '/atlas/rest/platform/registries/atlas-schema-registry/stages/release') {
    return new Response(metadataListing(NS_INHERITED, 'inherited'), { status: 200 })
  }
  if (p === '/atlas/rest/platform/registries/atlas-schema-registry/stages/release/content') {
    return q('objectId') === NS_INHERITED
      ? new Response(PERSON_ECORE.replace(NS, NS_INHERITED).replace('name="person"', 'name="inherited"'), {
          status: 200,
        })
      : new Response('not found', { status: 404 })
  }
  if (p === '/atlas/rest/jena/registries/configurations/stages/draft') {
    return new Response(metadataListing('persons', 'persons'), { status: 200 })
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

/** Installs the Atlas converter for this entry, the way the app does. */
async function installConverter(entry: unknown) {
  return prepareAtlasResolution(entry, {
    instanceTreeComposables: { setPackageURIConverter },
  })
}

/** The scope in the explorer, as after "Add Source → Model Atlas". */
async function atlasSource() {
  const fs = useFileSystem()
  const source = fs.addAtlasSource(`jena-${Math.random()}`, '/atlas/rest', 'jena')
  await fs.refreshSource(source.id)
  return { fs, source }
}

describe('instance from the Model Atlas', () => {
  beforeEach(() => {
    requested = []
    inherited = false
    vi.stubGlobal('fetch', vi.fn(async (input: any) => fakeAtlas(String(input))))
  })

  it('the scope carries both schema and instance', async () => {
    const { fs, source } = await atlasSource()

    const ecoreEntry = fs.getFileByPath(source.id, 'atlas-schema-registry/draft/person.ecore')
    const instance = fs.getFileByPath(source.id, 'configurations/draft/persons.xmi')
    expect(ecoreEntry?.extension).toBe('.ecore')
    expect(instance?.extension).toBe('.xmi')

    // Both are retrievable — gene has everything it needs
    expect(await fs.readTextFile(ecoreEntry as never)).toContain(`nsURI="${NS}"`)
    expect(await fs.readTextFile(instance as never)).toContain(`xmlns:person="${NS}"`)
  })

  it('without an installed converter the load stops', async () => {
    const { fs, source } = await atlasSource()
    const instance = fs.getFileByPath(source.id, 'configurations/draft/persons.xmi')
    const content = await fs.readTextFile(instance as never)

    // Only the providers are missing — at least the loader names the nsURI now
    await expect(loadInstancesFromXMI(content, instance!.path)).rejects.toThrow(
      new RegExp(`Package not found for prefix 'person' \\(nsURI '${NS}'\\)`),
    )
  })

  it('with the converter installed the loader fetches the schema itself', async () => {
    const { fs, source } = await atlasSource()
    const instance = fs.getFileByPath(source.id, 'configurations/draft/persons.xmi')
    const content = await fs.readTextFile(instance as never)

    const setup = await installConverter(instance)
    expect(setup.searched).toContain('jena/atlas-schema-registry/draft')

    const result = await loadInstancesFromXMI(content, instance!.path)
    expect(result.loadedCount).toBe(1)
    expect(result.errors).toEqual([])
    expect(result.missingPackages).toEqual([])
    // The schema came through the Atlas, not out of nowhere
    expect(requested.some((u) => u.includes('atlas-schema-registry') && u.includes('/content'))).toBe(
      true,
    )
  })

  it('an nsURI nobody knows is reported with its nsURI', async () => {
    const { fs, source } = await atlasSource()
    const instance = fs.getFileByPath(source.id, 'configurations/draft/persons.xmi')
    const fremd = PERSONS_XMI.replace(NS, 'https://example.org/unbekannt/1.0.0')

    await installConverter(instance)
    // The loader tries, finds nothing and names the nsURI — not just the
    // prefix, from which nothing could be fetched
    await expect(loadInstancesFromXMI(fremd, 'unbekannt.xmi')).rejects.toThrow(
      /nsURI 'https:\/\/example\.org\/unbekannt\/1\.0\.0'/,
    )
  })

  it('without an origin nothing is installed — with a reason', async () => {
    // Exactly the Atlas browser's case, before it passed its origin along
    const setup = await installConverter({ name: 'x.xmi', path: 'atlas://x.xmi' })
    expect(setup.searched).toEqual([])
    expect(setup.note).toMatch(/keine Fundstelle/)
  })

  it('the schema may live in the inherited platform scope', async () => {
    // The scope itself does not hold it — its registry listing does not carry
    // inherited schemas. Without the parent chain it would stay unfindable.
    inherited = true
    const { fs, source } = await atlasSource()
    const instance = fs.getFileByPath(source.id, 'configurations/draft/persons.xmi')
    const content = PERSONS_XMI.replace(NS, NS_INHERITED)

    const setup = await installConverter(instance)
    expect(setup.searched).toContain('platform/atlas-schema-registry/release')

    const result = await loadInstancesFromXMI(content, 'inherited.xmi')
    expect(result.loadedCount).toBe(1)
    expect(result.missingPackages).toEqual([])
  })
})
