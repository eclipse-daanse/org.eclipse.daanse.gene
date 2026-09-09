/**
 * Spike 2: Serializer anpassen statt XMI von Hand bauen.
 * - setID() fuer jedes Objekt mit iD="true"-Attribut  → IDREFs statt /0/0
 * - XMISave-Unterklasse ueberschreibt getHref()        → Href-Dialekt
 */
import { readFileSync } from 'node:fs'
import * as emf from '@emfts/core'

const { BasicResourceSet, XMIResourceFactory, XMIResource, XMISave, URI,
        registerEcorePackage, EPackageRegistry } = emf

const ATLAS = '/mnt/be46e9e8-fa36-463c-8885-99892ace2ab9/data.atlas/org.eclipse.fennec.data.atlas.configuration.model'

/** Href-Dialekt: FILE → model/x.ecore#//Y, ATLAS → nsURI#//Y */
class DataAtlasSave extends XMISave {
  setDialect(mode, fileByNsUri) { this.mode = mode; this.fileByNsUri = fileByNsUri; return this }
  getHref(obj) {
    if (this.mode === 'FILE' && typeof obj?.getEPackage === 'function') {
      const pkg = obj.getEPackage()
      const datei = this.fileByNsUri?.get(pkg?.getNsURI?.())
      if (datei) return `${datei}#//${obj.getName()}`
    }
    return super.getHref(obj)
  }
}

class DataAtlasResource extends XMIResource {
  configure(mode, fileByNsUri) { this.mode = mode; this.fileByNsUri = fileByNsUri; return this }
  createXMLSave() {
    return new DataAtlasSave(this.xmlHelper).setDialect(this.mode, this.fileByNsUri)
  }
  /**
   * Fragment = Wert des iD="true"-Attributs, wie EMF es tut. Ueber setID()
   * wuerde zusaetzlich ein xmi:id geschrieben, das die Vorlagen nicht haben.
   */
  getURIFragment(obj) {
    for (const a of obj.eClass().getEAllAttributes()) {
      if (a.isID?.()) {
        const v = obj.eGet(a)
        if (v !== null && v !== undefined && v !== '') return String(v)
        break
      }
    }
    return super.getURIFragment(obj)
  }
}

registerEcorePackage()
const rs = new BasicResourceSet()
const f = new XMIResourceFactory()
const map = rs.getResourceFactoryRegistry().getExtensionToFactoryMap()
map.set('xmi', f); map.set('ecore', f)

const cfgRes = rs.createResource(URI.createURI('configuration.ecore'))
cfgRes.loadFromString(readFileSync(`${ATLAS}/model/configuration.ecore`, 'utf8'))
const cfgPkg = cfgRes.getContents().get(0)
EPackageRegistry.INSTANCE.set(cfgPkg.getNsURI(), cfgPkg)

const personRes = rs.createResource(URI.createURI('model/person.ecore'))
personRes.loadFromString(readFileSync(`${ATLAS}/example/model/person.ecore`, 'utf8'))
const personPkg = personRes.getContents().get(0)
EPackageRegistry.INSTANCE.set(personPkg.getNsURI(), personPkg)
const person = personPkg.getEClassifier('Person')

const factory = cfgPkg.getEFactoryInstance()
const create = n => factory.create(cfgPkg.getEClassifier(n))
const set = (o, name, v) => o.eSet(o.eClass().getEStructuralFeature(name), v)
const add = (o, name, v) => o.eGet(o.eClass().getEStructuralFeature(name)).add(v)

const root = create('DataAtlasConfiguration')
set(root, 'name', 'example')
set(root, 'description', 'Example Data Atlas instance: one file-based input served over REST (the Milestone 1 vertical slice).')

const input = create('FileDataInput')
set(input, 'id', 'persons-file'); set(input, 'uri', 'data/persons.xmi')
add(input, 'supportedEClasses', person)
add(root, 'dataInputs', input)

const dataSet = create('DataSet')
set(dataSet, 'id', 'persons'); set(dataSet, 'name', 'Persons')
set(dataSet, 'description', 'All persons of the example data set.')
set(dataSet, 'dataInput', input); set(dataSet, 'inputType', person); set(dataSet, 'outputType', person)
add(root, 'dataSets', dataSet)

const service = create('RestDataService')
set(service, 'id', 'persons-rest'); set(service, 'name', 'Persons REST')
set(service, 'description', 'REST endpoint publishing the example persons.')
set(service, 'urlContext', '/example'); set(service, 'openAPI', false)
const svcCfg = create('RestDataServiceConfiguration')
set(svcCfg, 'id', 'persons-rest-config'); set(svcCfg, 'dataSet', dataSet); set(svcCfg, 'path', 'persons')
add(service, 'configuration', svcCfg)
add(root, 'services', service)

// Ausgabe-Resource mit Dialekt
const out = new DataAtlasResource(URI.createURI('dataatlas.xmi'))
  .configure('FILE', new Map([[personPkg.getNsURI(), 'model/person.ecore']]))
rs.getResources().push?.(out)
out.getContents().add(root)


const xmi = out.saveToString()
const golden = readFileSync(`${ATLAS}/example/dataatlas.xmi`, 'utf8')
console.log('===== ERZEUGT ====='); console.log(xmi)
const norm = s => s.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
console.log('zeichengleich:', xmi.trim() === golden.trim())
console.log('normalisiert gleich:', norm(xmi) === norm(golden))

// Round-Trip: laesst sich das Erzeugte wieder laden und aufloesen?
const back = rs.createResource(URI.createURI('roundtrip.xmi'))
back.loadFromString(xmi)
const r2 = back.getContents().get(0)
const ds = r2.eGet(r2.eClass().getEStructuralFeature('dataSets')).get(0)
const di = ds.eGet(ds.eClass().getEStructuralFeature('dataInput'))
const it = ds.eGet(ds.eClass().getEStructuralFeature('inputType'))
console.log('\n===== ROUND-TRIP =====')
console.log('dataInput aufgeloest:', di && typeof di.eGet === 'function'
  ? di.eGet(di.eClass().getEStructuralFeature('id')) : `NICHT aufgeloest (${typeof di}: ${di})`)
console.log('inputType aufgeloest:', it && typeof it.getName === 'function'
  ? it.getName() : `NICHT aufgeloest (${typeof it}: ${it})`)
