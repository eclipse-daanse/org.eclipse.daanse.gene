/**
 * OCL LSP Worker entry point for Vite bundling.
 *
 * Receives serialized EPackage data via postMessage and reconstructs
 * proxy objects that satisfy the OclEmfBridge's EPackage/EClass interface.
 */
import { EmptyFileSystem } from 'langium'
import { startLanguageServer } from 'langium/lsp'
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
} from 'vscode-languageserver/browser.js'
import { createOclLspServices } from '@emfts/ocl.langium'

declare const self: DedicatedWorkerGlobalScope

export interface WorkerMessage {
  type: 'registerPackage' | 'setContext' | 'init'
  data?: unknown
}

// --- Serialized data types (must match useOclLanguageClient.ts) ---

interface SerializedFeature {
  name: string
  typeName: string
  isMany: boolean
  kind: 'attribute' | 'reference'
  isContainment?: boolean
  referenceTypeName?: string
}

interface SerializedOperation {
  name: string
}

interface SerializedClass {
  name: string
  isAbstract: boolean
  isInterface: boolean
  features: SerializedFeature[]
  operations: SerializedOperation[]
  superTypeNames: string[]
}

interface SerializedPackage {
  nsURI: string
  name: string
  nsPrefix: string
  classes: SerializedClass[]
}

// --- Proxy EList that mimics EMF's EList interface ---

function makeList<T>(items: T[]) {
  return {
    size() { return items.length },
    get(i: number) { return items[i] },
    [Symbol.iterator]() { return items[Symbol.iterator]() },
  }
}

// --- Reconstruct proxy objects from serialized data ---

function makeTypeProxy(typeName: string) {
  return {
    getName() { return typeName },
  }
}

function makeAttributeProxy(feat: SerializedFeature) {
  const typeProxy = makeTypeProxy(feat.typeName)
  return {
    getName() { return feat.name },
    getEType() { return typeProxy },
    isMany() { return feat.isMany },
    isRequired() { return false },
    isDerived() { return false },
    isTransient() { return false },
  }
}

function makeReferenceProxy(feat: SerializedFeature, classLookup: Map<string, any>) {
  const typeProxy = makeTypeProxy(feat.typeName)
  return {
    getName() { return feat.name },
    getEType() { return typeProxy },
    getEReferenceType() {
      return classLookup.get(feat.referenceTypeName ?? feat.typeName) ?? typeProxy
    },
    isMany() { return feat.isMany },
    isRequired() { return false },
    isContainment() { return feat.isContainment ?? false },
    getEOpposite() { return null },
  }
}

function makeOperationProxy(op: SerializedOperation) {
  return {
    getName() { return op.name },
  }
}

function makeClassProxy(cls: SerializedClass, classLookup: Map<string, any>) {
  const attrs = cls.features.filter(f => f.kind === 'attribute').map(f => makeAttributeProxy(f))
  const refs = cls.features.filter(f => f.kind === 'reference').map(f => makeReferenceProxy(f, classLookup))
  const ops = cls.operations.map(o => makeOperationProxy(o))
  const allFeatures = [...attrs, ...refs]

  const proxy = {
    getName() { return cls.name },
    isAbstract() { return cls.isAbstract },
    isInterface() { return cls.isInterface },
    // Required by isEClass check in OclEmfBridge
    getEStructuralFeatures() { return allFeatures },
    getEAllStructuralFeatures() { return allFeatures },
    getEAttributes() { return attrs },
    getEAllAttributes() { return attrs },
    getEReferences() { return refs },
    getEAllReferences() { return refs },
    getEOperations() { return ops },
    getEAllOperations() { return ops },
    getEAllSuperTypes() { return cls.superTypeNames.map(n => classLookup.get(n)).filter(Boolean) },
    getESuperTypes() { return cls.superTypeNames.map(n => classLookup.get(n)).filter(Boolean) },
  }

  return proxy
}

function makePackageProxy(data: SerializedPackage) {
  // Build class lookup map for cross-references
  const classLookup = new Map<string, any>()

  // First pass: create stub proxies
  for (const cls of data.classes) {
    classLookup.set(cls.name, { getName() { return cls.name } })
  }

  // Second pass: create full proxies
  const classProxies: any[] = []
  for (const cls of data.classes) {
    const proxy = makeClassProxy(cls, classLookup)
    classLookup.set(cls.name, proxy)
    classProxies.push(proxy)
  }

  return {
    getName() { return data.name },
    getNsURI() { return data.nsURI },
    getNsPrefix() { return data.nsPrefix },
    getEClassifiers() { return makeList(classProxies) },
    getESubpackages() { return makeList([]) },
    getESuperPackage() { return null },
  }
}

// --- LSP Server Setup ---

const messageReader = new BrowserMessageReader(self)
const messageWriter = new BrowserMessageWriter(self)

const connection = createConnection(messageReader, messageWriter)

const { shared, ocl } = createOclLspServices({
  connection,
  ...EmptyFileSystem,
})

// Handle custom messages from the main thread
self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data
  if (!msg || !msg.type) return

  switch (msg.type) {
    case 'registerPackage': {
      if (msg.data) {
        // Reconstruct proxy EPackage from serialized data
        const packageProxy = makePackageProxy(msg.data as SerializedPackage)
        ocl.emfBridge.registerPackage(packageProxy as any)
      }
      break
    }
  }
})

startLanguageServer(shared)
