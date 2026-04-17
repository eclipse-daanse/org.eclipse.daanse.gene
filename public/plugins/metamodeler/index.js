import { shallowRef, ref, computed, toRaw, triggerRef, defineComponent, resolveDirective, openBlock, createElementBlock, createElementVNode, createTextVNode, unref, createCommentVNode, withDirectives, createBlock, createVNode, withCtx, withModifiers, normalizeClass, toDisplayString, readonly, getCurrentInstance, onMounted, nextTick, watch, useId, mergeProps, resolveComponent, normalizeStyle, renderSlot, toHandlers, resolveDynamicComponent, markRaw } from 'vue';
import { getEcorePackage, BasicEReference, BasicEClass, BasicEAttribute, URI, XMIResource, BasicEPackage, BasicEFactory, BasicResourceSet, EContentAdapter } from '@emfts/core';
import Tree from 'primevue/tree';
import Button from 'primevue/button';
import ContextMenu from 'primevue/contextmenu';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import Dropdown from 'primevue/dropdown';

const META_ICONS = {
  package: "pi pi-box",
  class: "pi pi-file",
  abstractClass: "pi pi-file-o",
  interface: "pi pi-share-alt",
  attribute: "pi pi-minus",
  reference: "pi pi-arrow-right",
  containment: "pi pi-inbox",
  constraint: "pi pi-check-circle",
  datatype: "pi pi-hashtag",
  operation: "pi pi-bolt"
};
const OCL_ANNOTATION_SOURCES = {
  EMF_OCL: "http://www.eclipse.org/emf/2002/Ecore/OCL",
  OCL_PIVOT: "http://www.eclipse.org/OCL/Pivot"
};
function getClassifierIcon(eClass) {
  if (eClass.isInterface()) {
    return META_ICONS.interface;
  }
  if (eClass.isAbstract()) {
    return META_ICONS.abstractClass;
  }
  return META_ICONS.class;
}

let resourceSet = null;
function getResourceSet() {
  if (!resourceSet) {
    resourceSet = new BasicResourceSet();
  }
  return resourceSet;
}
class MetamodelerContentAdapter extends EContentAdapter {
  resourceRef;
  onChanged;
  constructor(resourceRef, onChanged) {
    super();
    this.resourceRef = resourceRef;
    this.onChanged = onChanged;
  }
  /**
   * Called when any change occurs in the observed model tree
   */
  notifyChanged(notification) {
    super.notifyChanged(notification);
    console.log("[MetamodelerContentAdapter] Model changed:", notification.toString?.() || notification);
    this.onChanged();
  }
}
let objectIdCounter = 0;
const objectIdMap = /* @__PURE__ */ new WeakMap();
function getObjectId(obj) {
  const rawObj = toRaw(obj);
  let id = objectIdMap.get(rawObj);
  if (!id) {
    id = `meta_${++objectIdCounter}`;
    objectIdMap.set(rawObj, id);
  }
  return id;
}
function useMetamodeler() {
  const resource = shallowRef(null);
  const selectedElement = shallowRef(null);
  const dirty = ref(false);
  const filePath = ref(null);
  const fileHandle = shallowRef(null);
  const version = ref(0);
  const expandedKeys = ref({});
  const nodeCache = /* @__PURE__ */ new Map();
  let contentAdapter = null;
  const importedPackages = ref(/* @__PURE__ */ new Map());
  function initializeRegistry() {
    const ecorePkg = getEcorePackage();
    const nsURI = ecorePkg.getNsURI() || "http://www.eclipse.org/emf/2002/Ecore";
    importedPackages.value.set(nsURI, {
      nsURI,
      name: ecorePkg.getName() || "ecore",
      nsPrefix: ecorePkg.getNsPrefix() || "ecore",
      ePackage: ecorePkg,
      sourceFile: null,
      isBuiltIn: true
    });
    console.log("[Metamodeler] Registry initialized with Ecore.ecore");
  }
  initializeRegistry();
  async function importPackage(ecoreContent, sourceFile) {
    try {
      console.log("[Metamodeler] Importing package from:", sourceFile);
      const rs = getResourceSet();
      const uri = URI.createURI(sourceFile);
      const res = rs.createResource(uri);
      if (!res) {
        console.error("[Metamodeler] Failed to create resource");
        return null;
      }
      await res.loadFromString(ecoreContent);
      const contents = res.getContents();
      if (contents.length === 0) {
        console.error("[Metamodeler] No contents in .ecore file");
        return null;
      }
      const ePackage = contents.get(0);
      if (!ePackage.getNsURI || !ePackage.getName) {
        console.error("[Metamodeler] Root element is not an EPackage");
        return null;
      }
      const info = {
        nsURI: ePackage.getNsURI() || "",
        name: ePackage.getName() || "unnamed",
        nsPrefix: ePackage.getNsPrefix() || "",
        ePackage,
        sourceFile,
        isBuiltIn: false
      };
      importedPackages.value.set(info.nsURI, info);
      console.log("[Metamodeler] Package imported:", info.name, info.nsURI);
      return info;
    } catch (error) {
      console.error("[Metamodeler] Failed to import package:", error);
      return null;
    }
  }
  function unimportPackage(nsURI) {
    const info = importedPackages.value.get(nsURI);
    if (!info || info.isBuiltIn) {
      console.warn("[Metamodeler] Cannot remove built-in or non-existent package:", nsURI);
      return false;
    }
    return importedPackages.value.delete(nsURI);
  }
  const allImportedPackages = computed(() => {
    return Array.from(importedPackages.value.values());
  });
  const availableSuperTypes = computed(() => {
    const result = [];
    for (const pkgInfo of importedPackages.value.values()) {
      const classifiers = pkgInfo.ePackage.getEClassifiers?.() || [];
      for (const classifier of classifiers) {
        if ("isAbstract" in classifier && "isInterface" in classifier) {
          result.push({
            eClass: classifier,
            packageInfo: pkgInfo
          });
        }
      }
    }
    return result;
  });
  const modelTreeNodes = computed(() => {
    const nodes = [];
    for (const pkgInfo of importedPackages.value.values()) {
      const classChildren = [];
      const dataTypeChildren = [];
      const classifiers = pkgInfo.ePackage.getEClassifiers?.() || [];
      console.log("[Metamodeler] Package", pkgInfo.name, "has", classifiers.length, "classifiers");
      for (const classifier of classifiers) {
        const name = classifier.getName?.() || "Unknown";
        if (typeof classifier.isAbstract === "function") {
          const eClass = classifier;
          const isAbstract = eClass.isAbstract();
          const isInterface = eClass.isInterface();
          classChildren.push({
            key: `cls:${pkgInfo.nsPrefix}:${name}`,
            label: name,
            icon: isInterface ? "pi pi-circle" : isAbstract ? "pi pi-circle-off" : "pi pi-file",
            data: {
              qualifiedName: `${pkgInfo.nsPrefix}:${name}`,
              name,
              isAbstract,
              isInterface,
              eClass,
              packageInfo: pkgInfo
            },
            type: "class",
            leaf: true,
            selectable: true,
            draggable: !isAbstract && !isInterface
          });
        } else if (typeof classifier.getInstanceClassName === "function") {
          const isEnum = typeof classifier.getELiterals === "function";
          dataTypeChildren.push({
            key: `dtype:${pkgInfo.nsPrefix}:${name}`,
            label: name,
            icon: isEnum ? "pi pi-list" : "pi pi-tag",
            data: {
              qualifiedName: `${pkgInfo.nsPrefix}:${name}`,
              name,
              isDataType: true,
              isEnum,
              classifier,
              packageInfo: pkgInfo
            },
            type: "datatype",
            leaf: true,
            selectable: true,
            draggable: false
          });
        }
      }
      console.log("[Metamodeler] Package", pkgInfo.name, "- classes:", classChildren.length, "datatypes:", dataTypeChildren.length);
      const children = [...classChildren, ...dataTypeChildren];
      nodes.push({
        key: `pkg:${pkgInfo.nsURI}`,
        label: pkgInfo.name,
        icon: "pi pi-box",
        data: pkgInfo,
        type: "package",
        leaf: children.length === 0,
        selectable: true,
        children
      });
    }
    return nodes;
  });
  function triggerUpdate() {
    const newVersion = version.value + 1;
    console.log("[Metamodeler] triggerUpdate called, version:", version.value, "->", newVersion);
    version.value = newVersion;
    triggerRef(resource);
  }
  function setupAdapter(res, oldRes) {
    if (oldRes && contentAdapter) {
      try {
        const adapters = oldRes.eAdapters?.();
        if (adapters) {
          const idx = adapters.indexOf(contentAdapter);
          if (idx >= 0) {
            adapters.splice(idx, 1);
          }
        }
        contentAdapter.unsetTarget(oldRes);
      } catch (e) {
        console.warn("[Metamodeler] Failed to remove adapter from old resource:", e);
      }
    }
    if (res) {
      contentAdapter = new MetamodelerContentAdapter(resource, triggerUpdate);
      try {
        const adapters = res.eAdapters?.();
        if (adapters) {
          adapters.push(contentAdapter);
          contentAdapter.setTarget(res);
          console.log("[Metamodeler] Content adapter attached to resource and propagated to contents");
        } else {
          console.warn("[Metamodeler] Resource does not support eAdapters, falling back to manual updates");
        }
      } catch (e) {
        console.warn("[Metamodeler] Failed to add adapter to resource:", e);
      }
    }
  }
  const rootPackage = computed(() => {
    version.value;
    if (!resource.value) return null;
    const contents = resource.value.getContents();
    if (contents.length === 0) return null;
    const root = contents.get(0);
    if (root && "getNsURI" in root && "getEClassifiers" in root) {
      return root;
    }
    return null;
  });
  const treeNodes = computed(() => {
    const currentVersion = version.value;
    console.log("[Metamodeler] treeNodes recomputing, version:", currentVersion);
    nodeCache.clear();
    if (!resource.value) return [];
    const rawResource = toRaw(resource.value);
    const contents = toRaw(rawResource.getContents());
    console.log("[Metamodeler] Building tree, contents:", contents.length);
    const validContents = Array.from(contents).filter((obj) => {
      const rawObj = toRaw(obj);
      return rawObj && typeof rawObj.eClass === "function";
    });
    return validContents.map((obj) => buildTreeNode(obj));
  });
  function buildTreeNode(obj, parent, containmentRef) {
    const rawObj = toRaw(obj);
    const eClass = rawObj.eClass();
    const id = getObjectId(rawObj);
    const typeName = eClass.getName() || "EObject";
    const nodeType = getNodeType(typeName);
    const icon = getNodeIcon(rawObj, typeName);
    const label = getNodeLabel(rawObj, typeName);
    const node = {
      key: id,
      label,
      icon,
      type: nodeType,
      data: rawObj,
      selectable: true
    };
    const children = [];
    const containmentRefs = getContainmentReferences(eClass);
    for (const ref2 of containmentRefs) {
      const value = toRaw(rawObj.eGet(ref2));
      if (value) {
        if (Array.isArray(value) || value[Symbol.iterator]) {
          const items = Array.from(value);
          for (const child of items) {
            if (child && typeof child.eClass === "function") {
              children.push(buildTreeNode(child));
            }
          }
        } else if (typeof value.eClass === "function") {
          children.push(buildTreeNode(value));
        }
      }
    }
    if (children.length > 0) {
      node.children = children;
    }
    nodeCache.set(id, node);
    return node;
  }
  function getContainmentReferences(eClass) {
    const features = eClass.getEAllStructuralFeatures();
    return features.filter((f) => {
      if ("isContainment" in f) {
        return f.isContainment();
      }
      return false;
    });
  }
  function getNodeType(className) {
    switch (className) {
      case "EPackage":
        return "package";
      case "EClass":
        return "class";
      case "EAttribute":
        return "attribute";
      case "EReference":
        return "reference";
      case "EDataType":
        return "datatype";
      case "EEnum":
        return "datatype";
      case "EOperation":
        return "operation";
      case "EAnnotation":
        return "constraint";
      default:
        return "class";
    }
  }
  function getNodeIcon(obj, className) {
    switch (className) {
      case "EPackage":
        return META_ICONS.package;
      case "EClass":
        return getClassifierIcon(obj);
      case "EAttribute":
        return META_ICONS.attribute;
      case "EReference":
        return obj.isContainment() ? META_ICONS.containment : META_ICONS.reference;
      case "EDataType":
      case "EEnum":
        return META_ICONS.datatype;
      case "EOperation":
        return META_ICONS.operation;
      case "EAnnotation":
        return META_ICONS.constraint;
      default:
        return "pi pi-file";
    }
  }
  function getNodeLabel(obj, className) {
    if ("getName" in obj && typeof obj.getName === "function") {
      const name = obj.getName();
      if (name) {
        if (className === "EAttribute") {
          const type = obj.getEAttributeType()?.getName() || "?";
          return `${name}: ${type}`;
        }
        if (className === "EReference") {
          let type = "?";
          try {
            type = obj.getEReferenceType()?.getName() || "?";
          } catch {
          }
          return `${name}: ${type}`;
        }
        return name;
      }
    }
    return `(${className})`;
  }
  const selectedClass = computed(() => {
    const el = selectedElement.value;
    if (el && "isAbstract" in el && "isInterface" in el) {
      return el;
    }
    return null;
  });
  const selectedAttribute = computed(() => {
    const el = selectedElement.value;
    if (el && "getEAttributeType" in el) {
      return el;
    }
    return null;
  });
  const selectedReference = computed(() => {
    const el = selectedElement.value;
    if (el && "getEReferenceType" in el && "isContainment" in el) {
      return el;
    }
    return null;
  });
  function createNewPackage(name, nsURI, nsPrefix) {
    const oldResource = resource.value;
    const pkg = new BasicEPackage(nsURI);
    pkg.setName(name);
    pkg.setNsPrefix(nsPrefix);
    const factory = new BasicEFactory();
    factory.setEPackage(pkg);
    pkg.setEFactoryInstance(factory);
    const rs = getResourceSet();
    const uri = URI.createURI("metamodel.ecore");
    const newResource = new XMIResource(uri);
    rs.getResources().push(newResource);
    newResource.setResourceSet(rs);
    const contents = newResource.getContents();
    if (typeof contents.add === "function") {
      contents.add(pkg);
    } else {
      contents.push(pkg);
    }
    resource.value = newResource;
    dirty.value = true;
    setupAdapter(newResource, oldResource);
    return pkg;
  }
  function loadPackage(pkg, path) {
    const oldResource = resource.value;
    const rs = getResourceSet();
    const uri = URI.createURI(path || "metamodel.ecore");
    const newResource = new XMIResource(uri);
    rs.getResources().push(newResource);
    newResource.setResourceSet(rs);
    const contents = newResource.getContents();
    if (typeof contents.add === "function") {
      contents.add(pkg);
    } else {
      contents.push(pkg);
    }
    resource.value = newResource;
    filePath.value = path ?? null;
    dirty.value = false;
    selectedElement.value = null;
    setupAdapter(newResource, oldResource);
  }
  async function loadFromEcoreString(ecoreContent, sourceFile, handle) {
    try {
      console.log("[Metamodeler] Loading .ecore for editing from:", sourceFile);
      const oldResource = resource.value;
      const rs = getResourceSet();
      const uri = URI.createURI(sourceFile);
      const existingRes = rs.getResource(uri, false);
      if (existingRes) {
        const resources = rs.getResources();
        const idx = resources.indexOf(existingRes);
        if (idx >= 0) {
          resources.splice(idx, 1);
        }
      }
      const newResource = rs.createResource(uri);
      if (!newResource) {
        console.error("[Metamodeler] Failed to create resource");
        return null;
      }
      await newResource.loadFromString(ecoreContent);
      const contents = newResource.getContents();
      if (contents.length === 0) {
        console.error("[Metamodeler] No contents in .ecore file");
        return null;
      }
      const ePackage = contents.get(0);
      if (!ePackage.getNsURI || !ePackage.getName) {
        console.error("[Metamodeler] Root element is not an EPackage");
        return null;
      }
      const name = ePackage.getName() || "unnamed";
      const nsURI = ePackage.getNsURI() || "";
      resource.value = newResource;
      filePath.value = sourceFile;
      fileHandle.value = handle ?? null;
      dirty.value = false;
      selectedElement.value = null;
      expandedKeys.value = {};
      setupAdapter(newResource, oldResource);
      console.log("[Metamodeler] Metamodel loaded for editing:", name, nsURI);
      triggerUpdate();
      return { name, nsURI };
    } catch (error) {
      console.error("[Metamodeler] Failed to load .ecore file:", error);
      return null;
    }
  }
  async function saveToEcoreString() {
    if (!resource.value) {
      console.error("[Metamodeler] No resource to save");
      return null;
    }
    try {
      const xmiResource = resource.value;
      if (typeof xmiResource.saveToString === "function") {
        const content = await xmiResource.saveToString();
        dirty.value = false;
        console.log("[Metamodeler] Metamodel saved to string");
        return content;
      } else {
        console.error("[Metamodeler] Resource does not support saveToString");
        return null;
      }
    } catch (error) {
      console.error("[Metamodeler] Failed to save metamodel:", error);
      return null;
    }
  }
  function isFileSystemAccessSupported() {
    return typeof window.showSaveFilePicker === "function";
  }
  async function promptSaveFilePicker(suggestedName) {
    if (!isFileSystemAccessSupported()) {
      console.error("[Metamodeler] File System Access API not supported");
      return null;
    }
    const picker = window.showSaveFilePicker;
    return await picker({
      suggestedName: `${suggestedName}.ecore`,
      types: [{
        description: "Ecore Files",
        accept: { "application/xml": [".ecore"] }
      }]
    });
  }
  async function saveToFile() {
    const content = await saveToEcoreString();
    if (!content) {
      return false;
    }
    try {
      let handle = fileHandle.value;
      if (!handle) {
        const suggestedName = rootPackage.value?.getName() || "metamodel";
        handle = await promptSaveFilePicker(suggestedName);
        if (!handle) {
          return false;
        }
        fileHandle.value = handle;
        filePath.value = handle.name;
      }
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      dirty.value = false;
      console.log("[Metamodeler] Metamodel saved to file:", handle.name);
      return true;
    } catch (error) {
      if (error.name === "AbortError") {
        return false;
      }
      console.error("[Metamodeler] Failed to save to file:", error);
      return false;
    }
  }
  async function saveAsFile() {
    const content = await saveToEcoreString();
    if (!content) {
      return false;
    }
    try {
      const suggestedName = rootPackage.value?.getName() || "metamodel";
      const handle = await promptSaveFilePicker(suggestedName);
      if (!handle) {
        return false;
      }
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      fileHandle.value = handle;
      filePath.value = handle.name;
      dirty.value = false;
      console.log("[Metamodeler] Metamodel saved as:", handle.name);
      return true;
    } catch (error) {
      if (error.name === "AbortError") {
        return false;
      }
      console.error("[Metamodeler] Failed to save as file:", error);
      return false;
    }
  }
  function addRootObject(obj) {
    console.log("[Metamodeler] addRootObject:", obj);
    if (!resource.value) {
      const rs = getResourceSet();
      const uri = URI.createURI("metamodel.ecore");
      const newResource = new XMIResource(uri);
      rs.getResources().push(newResource);
      newResource.setResourceSet(rs);
      resource.value = newResource;
      setupAdapter(newResource, null);
    }
    const contents = resource.value.getContents();
    if (typeof contents.add === "function") {
      contents.add(obj);
    } else {
      contents.push(obj);
    }
    dirty.value = true;
    triggerUpdate();
    console.log("[Metamodeler] Root object added, contents now:", contents.length);
  }
  function createChild(parent, containmentRef, eClass) {
    const rawParent = toRaw(parent);
    console.log("[Metamodeler] createChild:", eClass.getName(), "in", containmentRef.getName());
    const ecorePkg = getEcorePackage();
    const factory = ecorePkg.getEFactoryInstance();
    const newObj = factory.create(eClass);
    console.log("[Metamodeler] Created new instance:", newObj);
    const value = toRaw(rawParent.eGet(containmentRef));
    if (value && typeof value.add === "function") {
      value.add(newObj);
      console.log("[Metamodeler] Added to EList");
    } else if (Array.isArray(value)) {
      value.push(newObj);
      console.log("[Metamodeler] Fallback to array.push()");
    } else {
      rawParent.eSet(containmentRef, newObj);
    }
    triggerUpdate();
    dirty.value = true;
    return newObj;
  }
  function addClass(pkg, name, options) {
    const eClass = new BasicEClass();
    eClass.setName(name);
    eClass.setAbstract(options?.isAbstract ?? false);
    eClass.setInterface(options?.isInterface ?? false);
    console.log("[Metamodeler] addClass:", name, "to package:", pkg.getName());
    const classifiers = pkg.getEClassifiers();
    console.log("[Metamodeler] classifiers before add:", classifiers.length);
    classifiers.add(eClass);
    console.log("[Metamodeler] classifiers after add:", classifiers.length);
    dirty.value = true;
    triggerUpdate();
    return eClass;
  }
  function updateClass(eClass, updates) {
    if (updates.name !== void 0) {
      eClass.setName(updates.name);
    }
    if (updates.isAbstract !== void 0) {
      eClass.setAbstract(updates.isAbstract);
    }
    if (updates.isInterface !== void 0) {
      eClass.setInterface(updates.isInterface);
    }
    dirty.value = true;
    triggerUpdate();
  }
  function addSuperType(eClass, superType) {
    if (eClass instanceof BasicEClass) {
      eClass.addSuperType(superType);
      dirty.value = true;
    }
  }
  function removeSuperType(eClass, superType) {
    const superTypes = eClass.getESuperTypes();
    const idx = superTypes.indexOf(superType);
    if (idx >= 0) {
      superTypes.splice(idx, 1);
      dirty.value = true;
    }
  }
  function addAttribute(eClass, name, typeName, options) {
    const attr = new BasicEAttribute();
    attr.setName(name);
    attr.setLowerBound(options?.lowerBound ?? 0);
    attr.setUpperBound(options?.upperBound ?? 1);
    attr.setDerived(options?.isDerived ?? false);
    if (eClass instanceof BasicEClass) {
      eClass.addFeature(attr);
    }
    dirty.value = true;
    triggerUpdate();
    return attr;
  }
  function updateAttribute(attr, updates) {
    if (updates.name !== void 0) {
      attr.setName(updates.name);
    }
    if (updates.lowerBound !== void 0) {
      attr.setLowerBound(updates.lowerBound);
    }
    if (updates.upperBound !== void 0) {
      attr.setUpperBound(updates.upperBound);
    }
    dirty.value = true;
    triggerUpdate();
  }
  function addReference(eClass, name, options) {
    const ref2 = new BasicEReference();
    ref2.setName(name);
    ref2.setLowerBound(options?.lowerBound ?? 0);
    ref2.setUpperBound(options?.upperBound ?? 1);
    ref2.setContainment(options?.isContainment ?? false);
    if (eClass instanceof BasicEClass) {
      eClass.addFeature(ref2);
    }
    dirty.value = true;
    triggerUpdate();
    return ref2;
  }
  function updateReference(ref2, updates) {
    if (updates.name !== void 0) {
      ref2.setName(updates.name);
    }
    if (updates.lowerBound !== void 0) {
      ref2.setLowerBound(updates.lowerBound);
    }
    if (updates.upperBound !== void 0) {
      ref2.setUpperBound(updates.upperBound);
    }
    if (updates.isContainment !== void 0) {
      ref2.setContainment(updates.isContainment);
    }
    dirty.value = true;
    triggerUpdate();
  }
  function addOclConstraint(eClass, name, expression) {
    const annotation = eClass.getEAnnotation(OCL_ANNOTATION_SOURCES.EMF_OCL);
    if (!annotation) {
      console.warn("Cannot add OCL constraint: No OCL annotation exists on class", eClass.getName());
      return null;
    }
    const details = annotation.getDetails();
    details.set(name, expression);
    dirty.value = true;
    triggerUpdate();
    return annotation;
  }
  function updateOclConstraint(eClass, oldName, newName, expression) {
    const annotation = eClass.getEAnnotation(OCL_ANNOTATION_SOURCES.EMF_OCL);
    if (!annotation) return;
    const details = annotation.getDetails();
    if (oldName !== newName) {
      details.delete(oldName);
    }
    details.set(newName, expression);
    dirty.value = true;
    triggerUpdate();
  }
  function removeOclConstraint(eClass, name) {
    const annotation = eClass.getEAnnotation(OCL_ANNOTATION_SOURCES.EMF_OCL);
    if (!annotation) return;
    const details = annotation.getDetails();
    details.delete(name);
    dirty.value = true;
    triggerUpdate();
  }
  function getOclConstraints(eClass) {
    const constraints = [];
    const annotation = eClass.getEAnnotation(OCL_ANNOTATION_SOURCES.EMF_OCL);
    if (annotation) {
      const details = annotation.getDetails();
      for (const [name, expression] of details) {
        if (!["body", "derivation", "documentation", "_body"].includes(name)) {
          constraints.push({
            name,
            expression,
            contextClassName: eClass.getName() || "",
            annotation
          });
        }
      }
    }
    return constraints;
  }
  function deleteElement(element) {
    if ("isAbstract" in element && "isInterface" in element) {
      const eClass = element;
      const pkg = eClass.getEPackage();
      if (pkg) {
        const classifiers = pkg.getEClassifiers();
        if (typeof classifiers.remove === "function") {
          classifiers.remove(eClass);
        } else if (typeof classifiers.removeAt === "function") {
          const idx = classifiers.indexOf(eClass);
          if (idx >= 0) {
            classifiers.removeAt(idx);
          }
        }
      }
    } else if ("getEContainingClass" in element) {
      const feature = element;
      const containingClass = feature.getEContainingClass();
      if (containingClass) {
        const features = containingClass.getEStructuralFeatures();
        if (typeof features.remove === "function") {
          features.remove(feature);
        } else if (typeof features.removeAt === "function") {
          const idx = features.indexOf(feature);
          if (idx >= 0) {
            features.removeAt(idx);
          }
        }
      }
    }
    if (selectedElement.value === element) {
      selectedElement.value = null;
    }
    dirty.value = true;
    triggerUpdate();
  }
  function selectElement(element) {
    selectedElement.value = element;
  }
  function getAvailableContainmentRefs() {
    if (!selectedElement.value) return [];
    const obj = selectedElement.value;
    if (typeof obj.eClass !== "function") return [];
    return getContainmentReferences(obj.eClass());
  }
  function getValidChildClasses(ref2) {
    const refType = ref2.getEType();
    if (!refType) return [];
    const ecorePkg = getEcorePackage();
    const result = [];
    const typeName = refType.getName();
    if (typeName === "EClassifier") {
      result.push(ecorePkg.getEClassClass());
      result.push(ecorePkg.getEDataTypeClass());
      result.push(ecorePkg.getEEnumClass());
    } else if (typeName === "EStructuralFeature") {
      result.push(ecorePkg.getEAttributeClass());
      result.push(ecorePkg.getEReferenceClass());
    } else if (!refType.isAbstract() && !refType.isInterface()) {
      result.push(refType);
    }
    return result;
  }
  function markClean() {
    dirty.value = false;
  }
  function reset() {
    resource.value = null;
    selectedElement.value = null;
    dirty.value = false;
    filePath.value = null;
    fileHandle.value = null;
    expandedKeys.value = {};
    nodeCache.clear();
  }
  return {
    // State
    resource,
    rootPackage,
    selectedElement,
    dirty,
    filePath,
    fileHandle,
    expandedKeys,
    // Computed
    treeNodes,
    selectedClass,
    selectedAttribute,
    selectedReference,
    // Imported Packages Registry (for supertypes from other .ecore files)
    importedPackages,
    allImportedPackages,
    availableSuperTypes,
    modelTreeNodes,
    // Tree nodes for Model Browser showing imported packages
    importPackage,
    unimportPackage,
    // Package operations
    createNewPackage,
    loadPackage,
    loadFromEcoreString,
    saveToEcoreString,
    saveToFile,
    saveAsFile,
    addRootObject,
    // Generic child creation (Instance Tree pattern)
    createChild,
    getAvailableContainmentRefs,
    getValidChildClasses,
    // Class operations
    addClass,
    updateClass,
    addSuperType,
    removeSuperType,
    // Attribute operations
    addAttribute,
    updateAttribute,
    // Reference operations
    addReference,
    updateReference,
    // OCL operations
    addOclConstraint,
    updateOclConstraint,
    removeOclConstraint,
    getOclConstraints,
    // Delete
    deleteElement,
    // Selection
    selectElement,
    // State management
    markClean,
    reset,
    // Reactivity
    triggerUpdate
  };
}
const GLOBAL_KEY = "__GENE_METAMODELER_STATE__";
function getOrCreateSharedState() {
  if (typeof window !== "undefined" && window[GLOBAL_KEY]) {
    console.log("[Metamodeler] Using existing global shared state");
    return window[GLOBAL_KEY];
  }
  console.log("[Metamodeler] Creating new global shared state");
  const state = {
    instance: useMetamodeler()
  };
  if (typeof window !== "undefined") {
    window[GLOBAL_KEY] = state;
  }
  return state;
}
function useSharedMetamodeler() {
  const state = getOrCreateSharedState();
  return state.instance;
}

const _hoisted_1$4 = { class: "metamodeler-tree" };
const _hoisted_2$3 = { class: "tree-header" };
const _hoisted_3$3 = { class: "header-title" };
const _hoisted_4$3 = {
  key: 0,
  class: "dirty-indicator"
};
const _hoisted_5$3 = { class: "header-actions" };
const _hoisted_6$3 = {
  key: 0,
  class: "empty-state"
};
const _hoisted_7$2 = {
  key: 1,
  class: "tree-container"
};
const _hoisted_8$2 = ["onContextmenu"];
const _hoisted_9$1 = { class: "node-label" };
const _hoisted_10$1 = {
  key: 0,
  class: "badge interface"
};
const _hoisted_11$1 = {
  key: 1,
  class: "badge abstract"
};
const _hoisted_12$1 = {
  key: 2,
  class: "badge containment"
};
const _hoisted_13$1 = { class: "dialog-content" };
const _hoisted_14$1 = { class: "field" };
const _hoisted_15$1 = { class: "field" };
const _hoisted_16$1 = { class: "field" };
const _hoisted_17$1 = { class: "dialog-content" };
const _hoisted_18$1 = { class: "field" };
const _hoisted_19$1 = { class: "field-checkbox" };
const _hoisted_20$1 = { class: "field-checkbox" };
const _hoisted_21$1 = { class: "dialog-content" };
const _hoisted_22$1 = { class: "field" };
const _hoisted_23$1 = { class: "field" };
const _hoisted_24$1 = { class: "dialog-content" };
const _hoisted_25$1 = { class: "field" };
const _hoisted_26$1 = { class: "field-checkbox" };
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "MetamodelerTree",
  emits: ["element-select"],
  setup(__props, { emit: __emit }) {
    const emit = __emit;
    const metamodeler = useSharedMetamodeler();
    const selectedKey = ref({});
    const expandedKeys = ref({});
    const contextMenu = ref(null);
    const selectedNode = ref(null);
    const showNewPackageDialog = ref(false);
    const showNewClassDialog = ref(false);
    const showNewAttributeDialog = ref(false);
    const showNewReferenceDialog = ref(false);
    const newPackageName = ref("");
    const newPackageNsURI = ref("");
    const newPackageNsPrefix = ref("");
    const newClassName = ref("");
    const newClassAbstract = ref(false);
    const newClassInterface = ref(false);
    const newAttributeName = ref("");
    const newAttributeType = ref("EString");
    const newReferenceName = ref("");
    const newReferenceContainment = ref(false);
    const contextMenuItems = computed(() => {
      if (!selectedNode.value) return [];
      const node = selectedNode.value;
      if (node.type === "package") {
        return [
          {
            label: "Add Class",
            icon: "pi pi-plus",
            command: () => openNewClassDialog()
          },
          {
            label: "Add Subpackage",
            icon: "pi pi-folder-plus",
            command: () => openNewPackageDialog()
          },
          { separator: true },
          {
            label: "Delete Package",
            icon: "pi pi-trash",
            disabled: true,
            // Can't delete root package
            command: () => {
            }
          }
        ];
      }
      if (node.type === "class") {
        return [
          {
            label: "Add Attribute",
            icon: "pi pi-plus",
            command: () => openNewAttributeDialog()
          },
          {
            label: "Add Reference",
            icon: "pi pi-plus",
            command: () => openNewReferenceDialog()
          },
          {
            label: "Add Constraint",
            icon: "pi pi-check-circle",
            command: () => handleAddConstraint()
          },
          { separator: true },
          {
            label: "Delete Class",
            icon: "pi pi-trash",
            command: () => handleDelete()
          }
        ];
      }
      if (node.type === "attribute" || node.type === "reference" || node.type === "constraint") {
        return [
          {
            label: "Delete",
            icon: "pi pi-trash",
            command: () => handleDelete()
          }
        ];
      }
      return [];
    });
    function handleNodeSelect(node) {
      const metaNode = node;
      selectedNode.value = metaNode;
      emit("element-select", metaNode.data);
      metamodeler.selectElement(metaNode.data);
    }
    function handleContextMenu(event, node) {
      selectedNode.value = node;
      contextMenu.value?.show(event);
    }
    function openNewPackageDialog() {
      newPackageName.value = "";
      newPackageNsURI.value = "";
      newPackageNsPrefix.value = "";
      showNewPackageDialog.value = true;
    }
    function createNewPackage() {
      if (!newPackageName.value || !newPackageNsURI.value) return;
      metamodeler.createNewPackage(
        newPackageName.value,
        newPackageNsURI.value,
        newPackageNsPrefix.value || newPackageName.value.toLowerCase()
      );
      showNewPackageDialog.value = false;
    }
    function openNewClassDialog() {
      newClassName.value = "";
      newClassAbstract.value = false;
      newClassInterface.value = false;
      showNewClassDialog.value = true;
    }
    function createNewClass() {
      if (!newClassName.value || !selectedNode.value) return;
      const pkg = selectedNode.value.data;
      metamodeler.addClass(pkg, newClassName.value, {
        isAbstract: newClassAbstract.value,
        isInterface: newClassInterface.value
      });
      showNewClassDialog.value = false;
    }
    function openNewAttributeDialog() {
      newAttributeName.value = "";
      newAttributeType.value = "EString";
      showNewAttributeDialog.value = true;
    }
    function createNewAttribute() {
      if (!newAttributeName.value || !selectedNode.value) return;
      const eClass = selectedNode.value.data;
      metamodeler.addAttribute(eClass, newAttributeName.value, newAttributeType.value);
      showNewAttributeDialog.value = false;
    }
    function openNewReferenceDialog() {
      newReferenceName.value = "";
      newReferenceContainment.value = false;
      showNewReferenceDialog.value = true;
    }
    function createNewReference() {
      if (!newReferenceName.value || !selectedNode.value) return;
      const eClass = selectedNode.value.data;
      console.log("Creating reference on", eClass.getName());
      showNewReferenceDialog.value = false;
    }
    function handleAddConstraint() {
      if (!selectedNode.value || selectedNode.value.type !== "class") return;
      const eClass = selectedNode.value.data;
      const constraintName = `constraint${Date.now()}`;
      metamodeler.addOclConstraint(eClass, constraintName, "self.name.size() > 0");
    }
    function handleDelete() {
      if (!selectedNode.value) return;
      const element = selectedNode.value.data;
      metamodeler.deleteElement(element);
    }
    function handleCreateInitialPackage() {
      openNewPackageDialog();
    }
    async function handleSave() {
      const success = await metamodeler.saveToFile();
      if (success) {
        console.log("[MetamodelerTree] Metamodel saved");
      }
    }
    async function handleSaveAs() {
      const success = await metamodeler.saveAsFile();
      if (success) {
        console.log("[MetamodelerTree] Metamodel saved as new file");
      }
    }
    return (_ctx, _cache) => {
      const _directive_tooltip = resolveDirective("tooltip");
      return openBlock(), createElementBlock("div", _hoisted_1$4, [
        createElementVNode("div", _hoisted_2$3, [
          createElementVNode("span", _hoisted_3$3, [
            _cache[20] || (_cache[20] = createTextVNode(" Metamodel ", -1)),
            unref(metamodeler).dirty.value ? (openBlock(), createElementBlock("span", _hoisted_4$3, "*")) : createCommentVNode("", true)
          ]),
          createElementVNode("div", _hoisted_5$3, [
            !unref(metamodeler).rootPackage.value ? withDirectives((openBlock(), createBlock(unref(Button), {
              key: 0,
              icon: "pi pi-plus",
              text: "",
              rounded: "",
              size: "small",
              onClick: handleCreateInitialPackage
            }, null, 512)), [
              [
                _directive_tooltip,
                "New Package",
                void 0,
                { bottom: true }
              ]
            ]) : createCommentVNode("", true),
            withDirectives(createVNode(unref(Button), {
              icon: "pi pi-save",
              text: "",
              rounded: "",
              size: "small",
              disabled: !unref(metamodeler).rootPackage.value || !unref(metamodeler).dirty.value,
              onClick: handleSave
            }, null, 8, ["disabled"]), [
              [
                _directive_tooltip,
                "Save Metamodel",
                void 0,
                { bottom: true }
              ]
            ]),
            withDirectives(createVNode(unref(Button), {
              icon: "pi pi-file-export",
              text: "",
              rounded: "",
              size: "small",
              disabled: !unref(metamodeler).rootPackage.value,
              onClick: handleSaveAs
            }, null, 8, ["disabled"]), [
              [
                _directive_tooltip,
                "Save As...",
                void 0,
                { bottom: true }
              ]
            ])
          ])
        ]),
        !unref(metamodeler).rootPackage.value ? (openBlock(), createElementBlock("div", _hoisted_6$3, [
          _cache[21] || (_cache[21] = createElementVNode("i", { class: "pi pi-box" }, null, -1)),
          _cache[22] || (_cache[22] = createElementVNode("p", null, "No metamodel loaded", -1)),
          createVNode(unref(Button), {
            label: "Create Package",
            icon: "pi pi-plus",
            size: "small",
            onClick: handleCreateInitialPackage
          })
        ])) : (openBlock(), createElementBlock("div", _hoisted_7$2, [
          createVNode(unref(Tree), {
            value: unref(metamodeler).treeNodes.value,
            selectionKeys: selectedKey.value,
            "onUpdate:selectionKeys": _cache[0] || (_cache[0] = ($event) => selectedKey.value = $event),
            expandedKeys: expandedKeys.value,
            "onUpdate:expandedKeys": _cache[1] || (_cache[1] = ($event) => expandedKeys.value = $event),
            selectionMode: "single",
            onNodeSelect: handleNodeSelect,
            class: "meta-tree"
          }, {
            default: withCtx(({ node }) => [
              createElementVNode("div", {
                class: normalizeClass(["tree-node", {
                  "is-abstract": node.type === "class" && node.data.isAbstract?.(),
                  "is-interface": node.type === "class" && node.data.isInterface?.(),
                  "is-attribute": node.type === "attribute",
                  "is-reference": node.type === "reference",
                  "is-containment": node.type === "reference" && node.data.isContainment?.(),
                  "is-constraint": node.type === "constraint"
                }]),
                onContextmenu: withModifiers(($event) => handleContextMenu($event, node), ["prevent"])
              }, [
                createElementVNode("span", _hoisted_9$1, toDisplayString(node.label), 1),
                node.type === "class" && node.data.isInterface?.() ? (openBlock(), createElementBlock("span", _hoisted_10$1, "I")) : node.type === "class" && node.data.isAbstract?.() ? (openBlock(), createElementBlock("span", _hoisted_11$1, "A")) : createCommentVNode("", true),
                node.type === "reference" && node.data.isContainment?.() ? (openBlock(), createElementBlock("span", _hoisted_12$1, "C")) : createCommentVNode("", true)
              ], 42, _hoisted_8$2)
            ]),
            _: 1
          }, 8, ["value", "selectionKeys", "expandedKeys"])
        ])),
        createVNode(unref(ContextMenu), {
          ref_key: "contextMenu",
          ref: contextMenu,
          model: contextMenuItems.value
        }, null, 8, ["model"]),
        createVNode(unref(Dialog), {
          visible: showNewPackageDialog.value,
          "onUpdate:visible": _cache[6] || (_cache[6] = ($event) => showNewPackageDialog.value = $event),
          header: "New Package",
          modal: true,
          style: { width: "400px" }
        }, {
          footer: withCtx(() => [
            createVNode(unref(Button), {
              label: "Cancel",
              severity: "secondary",
              onClick: _cache[5] || (_cache[5] = ($event) => showNewPackageDialog.value = false)
            }),
            createVNode(unref(Button), {
              label: "Create",
              onClick: createNewPackage,
              disabled: !newPackageName.value || !newPackageNsURI.value
            }, null, 8, ["disabled"])
          ]),
          default: withCtx(() => [
            createElementVNode("div", _hoisted_13$1, [
              createElementVNode("div", _hoisted_14$1, [
                _cache[23] || (_cache[23] = createElementVNode("label", { for: "pkgName" }, "Name", -1)),
                createVNode(unref(InputText), {
                  id: "pkgName",
                  modelValue: newPackageName.value,
                  "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => newPackageName.value = $event),
                  class: "w-full",
                  placeholder: "MyPackage"
                }, null, 8, ["modelValue"])
              ]),
              createElementVNode("div", _hoisted_15$1, [
                _cache[24] || (_cache[24] = createElementVNode("label", { for: "pkgNsURI" }, "Namespace URI", -1)),
                createVNode(unref(InputText), {
                  id: "pkgNsURI",
                  modelValue: newPackageNsURI.value,
                  "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => newPackageNsURI.value = $event),
                  class: "w-full",
                  placeholder: "http://example.org/mypackage"
                }, null, 8, ["modelValue"])
              ]),
              createElementVNode("div", _hoisted_16$1, [
                _cache[25] || (_cache[25] = createElementVNode("label", { for: "pkgNsPrefix" }, "Namespace Prefix", -1)),
                createVNode(unref(InputText), {
                  id: "pkgNsPrefix",
                  modelValue: newPackageNsPrefix.value,
                  "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => newPackageNsPrefix.value = $event),
                  class: "w-full",
                  placeholder: "mypackage"
                }, null, 8, ["modelValue"])
              ])
            ])
          ]),
          _: 1
        }, 8, ["visible"]),
        createVNode(unref(Dialog), {
          visible: showNewClassDialog.value,
          "onUpdate:visible": _cache[11] || (_cache[11] = ($event) => showNewClassDialog.value = $event),
          header: "New Class",
          modal: true,
          style: { width: "400px" }
        }, {
          footer: withCtx(() => [
            createVNode(unref(Button), {
              label: "Cancel",
              severity: "secondary",
              onClick: _cache[10] || (_cache[10] = ($event) => showNewClassDialog.value = false)
            }),
            createVNode(unref(Button), {
              label: "Create",
              onClick: createNewClass,
              disabled: !newClassName.value
            }, null, 8, ["disabled"])
          ]),
          default: withCtx(() => [
            createElementVNode("div", _hoisted_17$1, [
              createElementVNode("div", _hoisted_18$1, [
                _cache[26] || (_cache[26] = createElementVNode("label", { for: "className" }, "Name", -1)),
                createVNode(unref(InputText), {
                  id: "className",
                  modelValue: newClassName.value,
                  "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => newClassName.value = $event),
                  class: "w-full",
                  placeholder: "MyClass"
                }, null, 8, ["modelValue"])
              ]),
              createElementVNode("div", _hoisted_19$1, [
                createVNode(unref(Checkbox), {
                  modelValue: newClassAbstract.value,
                  "onUpdate:modelValue": _cache[8] || (_cache[8] = ($event) => newClassAbstract.value = $event),
                  inputId: "classAbstract",
                  binary: true
                }, null, 8, ["modelValue"]),
                _cache[27] || (_cache[27] = createElementVNode("label", { for: "classAbstract" }, "Abstract", -1))
              ]),
              createElementVNode("div", _hoisted_20$1, [
                createVNode(unref(Checkbox), {
                  modelValue: newClassInterface.value,
                  "onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => newClassInterface.value = $event),
                  inputId: "classInterface",
                  binary: true
                }, null, 8, ["modelValue"]),
                _cache[28] || (_cache[28] = createElementVNode("label", { for: "classInterface" }, "Interface", -1))
              ])
            ])
          ]),
          _: 1
        }, 8, ["visible"]),
        createVNode(unref(Dialog), {
          visible: showNewAttributeDialog.value,
          "onUpdate:visible": _cache[15] || (_cache[15] = ($event) => showNewAttributeDialog.value = $event),
          header: "New Attribute",
          modal: true,
          style: { width: "400px" }
        }, {
          footer: withCtx(() => [
            createVNode(unref(Button), {
              label: "Cancel",
              severity: "secondary",
              onClick: _cache[14] || (_cache[14] = ($event) => showNewAttributeDialog.value = false)
            }),
            createVNode(unref(Button), {
              label: "Create",
              onClick: createNewAttribute,
              disabled: !newAttributeName.value
            }, null, 8, ["disabled"])
          ]),
          default: withCtx(() => [
            createElementVNode("div", _hoisted_21$1, [
              createElementVNode("div", _hoisted_22$1, [
                _cache[29] || (_cache[29] = createElementVNode("label", { for: "attrName" }, "Name", -1)),
                createVNode(unref(InputText), {
                  id: "attrName",
                  modelValue: newAttributeName.value,
                  "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => newAttributeName.value = $event),
                  class: "w-full",
                  placeholder: "myAttribute"
                }, null, 8, ["modelValue"])
              ]),
              createElementVNode("div", _hoisted_23$1, [
                _cache[30] || (_cache[30] = createElementVNode("label", { for: "attrType" }, "Type", -1)),
                createVNode(unref(InputText), {
                  id: "attrType",
                  modelValue: newAttributeType.value,
                  "onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => newAttributeType.value = $event),
                  class: "w-full",
                  placeholder: "EString"
                }, null, 8, ["modelValue"])
              ])
            ])
          ]),
          _: 1
        }, 8, ["visible"]),
        createVNode(unref(Dialog), {
          visible: showNewReferenceDialog.value,
          "onUpdate:visible": _cache[19] || (_cache[19] = ($event) => showNewReferenceDialog.value = $event),
          header: "New Reference",
          modal: true,
          style: { width: "400px" }
        }, {
          footer: withCtx(() => [
            createVNode(unref(Button), {
              label: "Cancel",
              severity: "secondary",
              onClick: _cache[18] || (_cache[18] = ($event) => showNewReferenceDialog.value = false)
            }),
            createVNode(unref(Button), {
              label: "Create",
              onClick: createNewReference,
              disabled: !newReferenceName.value
            }, null, 8, ["disabled"])
          ]),
          default: withCtx(() => [
            createElementVNode("div", _hoisted_24$1, [
              createElementVNode("div", _hoisted_25$1, [
                _cache[31] || (_cache[31] = createElementVNode("label", { for: "refName" }, "Name", -1)),
                createVNode(unref(InputText), {
                  id: "refName",
                  modelValue: newReferenceName.value,
                  "onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => newReferenceName.value = $event),
                  class: "w-full",
                  placeholder: "myReference"
                }, null, 8, ["modelValue"])
              ]),
              createElementVNode("div", _hoisted_26$1, [
                createVNode(unref(Checkbox), {
                  modelValue: newReferenceContainment.value,
                  "onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => newReferenceContainment.value = $event),
                  inputId: "refContainment",
                  binary: true
                }, null, 8, ["modelValue"]),
                _cache[32] || (_cache[32] = createElementVNode("label", { for: "refContainment" }, "Containment", -1))
              ])
            ])
          ]),
          _: 1
        }, 8, ["visible"])
      ]);
    };
  }
});

const _export_sfc = (sfc, props) => {
  const target = sfc.__vccOpts || sfc;
  for (const [key, val] of props) {
    target[key] = val;
  }
  return target;
};

const MetamodelerTree = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["__scopeId", "data-v-2d5a7e7c"]]);

function f(...e){if(e){let t=[];for(let i=0;i<e.length;i++){let n=e[i];if(!n)continue;let s=typeof n;if(s==="string"||s==="number")t.push(n);else if(s==="object"){let c=Array.isArray(n)?[f(...n)]:Object.entries(n).map(([r,o])=>o?r:void 0);t=c.length?t.concat(c.filter(r=>!!r)):t;}}return t.join(" ").trim()}}

function y(t){if(t){let e=t.parentNode;return e&&e instanceof ShadowRoot&&e.host&&(e=e.host),e}return null}function T(t){return !!(t!==null&&typeof t!="undefined"&&t.nodeName&&y(t))}function c$1(t){return typeof Element!="undefined"?t instanceof Element:t!==null&&typeof t=="object"&&t.nodeType===1&&typeof t.nodeName=="string"}function pt(){if(window.getSelection){let t=window.getSelection()||{};t.empty?t.empty():t.removeAllRanges&&t.rangeCount>0&&t.getRangeAt(0).getClientRects().length>0&&t.removeAllRanges();}}function A(t,e={}){if(c$1(t)){let o=(n,r)=>{var l,d;let i=(l=t==null?void 0:t.$attrs)!=null&&l[n]?[(d=t==null?void 0:t.$attrs)==null?void 0:d[n]]:[];return [r].flat().reduce((s,a)=>{if(a!=null){let u=typeof a;if(u==="string"||u==="number")s.push(a);else if(u==="object"){let p=Array.isArray(a)?o(n,a):Object.entries(a).map(([f,g])=>n==="style"&&(g||g===0)?`${f.replace(/([a-z])([A-Z])/g,"$1-$2").toLowerCase()}:${g}`:g?f:void 0);s=p.length?s.concat(p.filter(f=>!!f)):s;}}return s},i)};Object.entries(e).forEach(([n,r])=>{if(r!=null){let i=n.match(/^on(.+)/);i?t.addEventListener(i[1].toLowerCase(),r):n==="p-bind"||n==="pBind"?A(t,r):(r=n==="class"?[...new Set(o("class",r))].join(" ").trim():n==="style"?o("style",r).join(";").trim():r,(t.$attrs=t.$attrs||{})&&(t.$attrs[n]=r),t.setAttribute(n,r));}});}}function z$1(t,e){return c$1(t)?t.matches(e)?t:t.querySelector(e):null}function Mt(){if(window.getSelection)return window.getSelection().toString();if(document.getSelection)return document.getSelection().toString()}function tt(){return !!(typeof window!="undefined"&&window.document&&window.document.createElement)}function _t(t,e="",o){c$1(t)&&o!==null&&o!==void 0&&t.setAttribute(e,o);}

function s$1(){let r=new Map;return {on(e,t){let n=r.get(e);return n?n.push(t):n=[t],r.set(e,n),this},off(e,t){let n=r.get(e);return n&&n.splice(n.indexOf(t)>>>0,1),this},emit(e,t){let n=r.get(e);n&&n.forEach(i=>{i(t);});},clear(){r.clear();}}}

function l(e){return e==null||e===""||Array.isArray(e)&&e.length===0||!(e instanceof Date)&&typeof e=="object"&&Object.keys(e).length===0}function c(e){return typeof e=="function"&&"call"in e&&"apply"in e}function s(e){return !l(e)}function i(e,t=true){return e instanceof Object&&e.constructor===Object&&(t||Object.keys(e).length!==0)}function m(e,...t){return c(e)?e(...t):e}function a(e,t=true){return typeof e=="string"&&(t||e!=="")}function g(e){return a(e)?e.replace(/(-|_)/g,"").toLowerCase():e}function F$1(e,t="",n={}){let o=g(t).split("."),r=o.shift();if(r){if(i(e)){let u=Object.keys(e).find(f=>g(f)===r)||"";return F$1(m(e[u],n),o.join("."),n)}return}return m(e,n)}function C$1(e,t=true){return Array.isArray(e)&&(t||e.length!==0)}function z(e){return s(e)&&!isNaN(e)}function G(e,t){if(t){let n=t.test(e);return t.lastIndex=0,n}return  false}function Y$1(e){return e&&e.replace(/\/\*(?:(?!\*\/)[\s\S])*\*\/|[\r\n\t]+/g,"").replace(/ {2,}/g," ").replace(/ ([{:}]) /g,"$1").replace(/([;,]) /g,"$1").replace(/ !/g,"!").replace(/: /g,":").trim()}function re(e){return a(e)?e.replace(/(_)/g,"-").replace(/([a-z])([A-Z])/g,"$1-$2").toLowerCase():e}

var rt=Object.defineProperty,st=Object.defineProperties;var nt=Object.getOwnPropertyDescriptors;var F=Object.getOwnPropertySymbols;var xe=Object.prototype.hasOwnProperty,be=Object.prototype.propertyIsEnumerable;var _e=(e,t,r)=>t in e?rt(e,t,{enumerable:true,configurable:true,writable:true,value:r}):e[t]=r,h=(e,t)=>{for(var r in t||(t={}))xe.call(t,r)&&_e(e,r,t[r]);if(F)for(var r of F(t))be.call(t,r)&&_e(e,r,t[r]);return e},$=(e,t)=>st(e,nt(t));var v=(e,t)=>{var r={};for(var s in e)xe.call(e,s)&&t.indexOf(s)<0&&(r[s]=e[s]);if(e!=null&&F)for(var s of F(e))t.indexOf(s)<0&&be.call(e,s)&&(r[s]=e[s]);return r};var at=s$1(),N=at;var k=/{([^}]*)}/g,ne=/(\d+\s+[\+\-\*\/]\s+\d+)/g,ie=/var\([^)]+\)/g;function oe(e){return a(e)?e.replace(/[A-Z]/g,(t,r)=>r===0?t:"."+t.toLowerCase()).toLowerCase():e}function ve(e){return i(e)&&e.hasOwnProperty("$value")&&e.hasOwnProperty("$type")?e.$value:e}function dt(e){return e.replaceAll(/ /g,"").replace(/[^\w]/g,"-")}function Q(e="",t=""){return dt(`${a(e,false)&&a(t,false)?`${e}-`:e}${t}`)}function ae(e="",t=""){return `--${Q(e,t)}`}function ht(e=""){let t=(e.match(/{/g)||[]).length,r=(e.match(/}/g)||[]).length;return (t+r)%2!==0}function Y(e,t="",r="",s$1=[],i){if(a(e)){let a=e.trim();if(ht(a))return;if(G(a,k)){let n=a.replaceAll(k,l=>{let c=l.replace(/{|}/g,"").split(".").filter(m=>!s$1.some(d=>G(m,d)));return `var(${ae(r,re(c.join("-")))}${s(i)?`, ${i}`:""})`});return G(n.replace(ie,"0"),ne)?`calc(${n})`:n}return a}else if(z(e))return e}function Re(e,t,r){a(t,false)&&e.push(`${t}:${r};`);}function C(e,t){return e?`${e}{${t}}`:""}function le(e,t){if(e.indexOf("dt(")===-1)return e;function r(n,l){let o=[],c=0,m="",d=null,u=0;for(;c<=n.length;){let g=n[c];if((g==='"'||g==="'"||g==="`")&&n[c-1]!=="\\"&&(d=d===g?null:g),!d&&(g==="("&&u++,g===")"&&u--,(g===","||c===n.length)&&u===0)){let f=m.trim();f.startsWith("dt(")?o.push(le(f,l)):o.push(s(f)),m="",c++;continue}g!==void 0&&(m+=g),c++;}return o}function s(n){let l=n[0];if((l==='"'||l==="'"||l==="`")&&n[n.length-1]===l)return n.slice(1,-1);let o=Number(n);return isNaN(o)?n:o}let i=[],a=[];for(let n=0;n<e.length;n++)if(e[n]==="d"&&e.slice(n,n+3)==="dt(")a.push(n),n+=2;else if(e[n]===")"&&a.length>0){let l=a.pop();a.length===0&&i.push([l,n]);}if(!i.length)return e;for(let n=i.length-1;n>=0;n--){let[l,o]=i[n],c=e.slice(l+3,o),m=r(c,t),d=t(...m);e=e.slice(0,l)+d+e.slice(o+1);}return e}var E=(...e)=>ue(S.getTheme(),...e),ue=(e={},t,r,s)=>{if(t){let{variable:i,options:a}=S.defaults||{},{prefix:n,transform:l$1}=(e==null?void 0:e.options)||a||{},o=G(t,k)?t:`{${t}}`;return s==="value"||l(s)&&l$1==="strict"?S.getTokenValue(t):Y(o,void 0,n,[i.excludedKeyRegex],r)}return ""};function ar(e,...t){if(e instanceof Array){let r=e.reduce((s,i,a)=>{var n;return s+i+((n=m(t[a],{dt:E}))!=null?n:"")},"");return le(r,E)}return m(e,{dt:E})}function de(e,t={}){let r=S.defaults.variable,{prefix:s=r.prefix,selector:i$1=r.selector,excludedKeyRegex:a=r.excludedKeyRegex}=t,n=[],l=[],o=[{node:e,path:s}];for(;o.length;){let{node:m,path:d}=o.pop();for(let u in m){let g=m[u],f=ve(g),p=G(u,a)?Q(d):Q(d,re(u));if(i(f))o.push({node:f,path:p});else {let y=ae(p),R=Y(f,p,s,[a]);Re(l,y,R);let T=p;s&&T.startsWith(s+"-")&&(T=T.slice(s.length+1)),n.push(T.replace(/-/g,"."));}}}let c=l.join("");return {value:l,tokens:n,declarations:c,css:C(i$1,c)}}var b={regex:{rules:{class:{pattern:/^\.([a-zA-Z][\w-]*)$/,resolve(e){return {type:"class",selector:e,matched:this.pattern.test(e.trim())}}},attr:{pattern:/^\[(.*)\]$/,resolve(e){return {type:"attr",selector:`:root${e},:host${e}`,matched:this.pattern.test(e.trim())}}},media:{pattern:/^@media (.*)$/,resolve(e){return {type:"media",selector:e,matched:this.pattern.test(e.trim())}}},system:{pattern:/^system$/,resolve(e){return {type:"system",selector:"@media (prefers-color-scheme: dark)",matched:this.pattern.test(e.trim())}}},custom:{resolve(e){return {type:"custom",selector:e,matched:true}}}},resolve(e){let t=Object.keys(this.rules).filter(r=>r!=="custom").map(r=>this.rules[r]);return [e].flat().map(r=>{var s;return (s=t.map(i=>i.resolve(r)).find(i=>i.matched))!=null?s:this.rules.custom.resolve(r)})}},_toVariables(e,t){return de(e,{prefix:t==null?void 0:t.prefix})},getCommon({name:e="",theme:t={},params:r,set:s$1,defaults:i}){var R,T,j,O,M,z,V;let{preset:a,options:n}=t,l,o,c,m$1,d,u,g;if(s(a)&&n.transform!=="strict"){let{primitive:L,semantic:te,extend:re}=a,f=te||{},{colorScheme:K}=f,A=v(f,["colorScheme"]),x=re||{},{colorScheme:X}=x,G=v(x,["colorScheme"]),p=K||{},{dark:U}=p,B=v(p,["dark"]),y=X||{},{dark:I}=y,H=v(y,["dark"]),W=s(L)?this._toVariables({primitive:L},n):{},q=s(A)?this._toVariables({semantic:A},n):{},Z=s(B)?this._toVariables({light:B},n):{},pe=s(U)?this._toVariables({dark:U},n):{},fe=s(G)?this._toVariables({semantic:G},n):{},ye=s(H)?this._toVariables({light:H},n):{},Se=s(I)?this._toVariables({dark:I},n):{},[Me,ze]=[(R=W.declarations)!=null?R:"",W.tokens],[Ke,Xe]=[(T=q.declarations)!=null?T:"",q.tokens||[]],[Ge,Ue]=[(j=Z.declarations)!=null?j:"",Z.tokens||[]],[Be,Ie]=[(O=pe.declarations)!=null?O:"",pe.tokens||[]],[He,We]=[(M=fe.declarations)!=null?M:"",fe.tokens||[]],[qe,Ze]=[(z=ye.declarations)!=null?z:"",ye.tokens||[]],[Fe,Je]=[(V=Se.declarations)!=null?V:"",Se.tokens||[]];l=this.transformCSS(e,Me,"light","variable",n,s$1,i),o=ze;let Qe=this.transformCSS(e,`${Ke}${Ge}`,"light","variable",n,s$1,i),Ye=this.transformCSS(e,`${Be}`,"dark","variable",n,s$1,i);c=`${Qe}${Ye}`,m$1=[...new Set([...Xe,...Ue,...Ie])];let et=this.transformCSS(e,`${He}${qe}color-scheme:light`,"light","variable",n,s$1,i),tt=this.transformCSS(e,`${Fe}color-scheme:dark`,"dark","variable",n,s$1,i);d=`${et}${tt}`,u=[...new Set([...We,...Ze,...Je])],g=m(a.css,{dt:E});}return {primitive:{css:l,tokens:o},semantic:{css:c,tokens:m$1},global:{css:d,tokens:u},style:g}},getPreset({name:e="",preset:t={},options:r,params:s$1,set:i,defaults:a,selector:n}){var f,x,p;let l,o,c;if(s(t)&&r.transform!=="strict"){let y=e.replace("-directive",""),m$1=t,{colorScheme:R,extend:T,css:j}=m$1,O=v(m$1,["colorScheme","extend","css"]),d=T||{},{colorScheme:M}=d,z=v(d,["colorScheme"]),u=R||{},{dark:V}=u,L=v(u,["dark"]),g=M||{},{dark:te}=g,re=v(g,["dark"]),K=s(O)?this._toVariables({[y]:h(h({},O),z)},r):{},A=s(L)?this._toVariables({[y]:h(h({},L),re)},r):{},X=s(V)?this._toVariables({[y]:h(h({},V),te)},r):{},[G,U]=[(f=K.declarations)!=null?f:"",K.tokens||[]],[B,I]=[(x=A.declarations)!=null?x:"",A.tokens||[]],[H,W]=[(p=X.declarations)!=null?p:"",X.tokens||[]],q=this.transformCSS(y,`${G}${B}`,"light","variable",r,i,a,n),Z=this.transformCSS(y,H,"dark","variable",r,i,a,n);l=`${q}${Z}`,o=[...new Set([...U,...I,...W])],c=m(j,{dt:E});}return {css:l,tokens:o,style:c}},getPresetC({name:e="",theme:t={},params:r,set:s,defaults:i}){var o;let{preset:a,options:n}=t,l=(o=a==null?void 0:a.components)==null?void 0:o[e];return this.getPreset({name:e,preset:l,options:n,params:r,set:s,defaults:i})},getPresetD({name:e="",theme:t={},params:r,set:s,defaults:i}){var c,m;let a=e.replace("-directive",""),{preset:n,options:l}=t,o=((c=n==null?void 0:n.components)==null?void 0:c[a])||((m=n==null?void 0:n.directives)==null?void 0:m[a]);return this.getPreset({name:a,preset:o,options:l,params:r,set:s,defaults:i})},applyDarkColorScheme(e){return !(e.darkModeSelector==="none"||e.darkModeSelector===false)},getColorSchemeOption(e,t){var r;return this.applyDarkColorScheme(e)?this.regex.resolve(e.darkModeSelector===true?t.options.darkModeSelector:(r=e.darkModeSelector)!=null?r:t.options.darkModeSelector):[]},getLayerOrder(e,t={},r,s){let{cssLayer:i}=t;return i?`@layer ${m(i.order||i.name||"primeui",r)}`:""},getCommonStyleSheet({name:e="",theme:t={},params:r,props:s={},set:i$1,defaults:a}){let n=this.getCommon({name:e,theme:t,params:r,set:i$1,defaults:a}),l=Object.entries(s).reduce((o,[c,m])=>o.push(`${c}="${m}"`)&&o,[]).join(" ");return Object.entries(n||{}).reduce((o,[c,m])=>{if(i(m)&&Object.hasOwn(m,"css")){let d=Y$1(m.css),u=`${c}-variables`;o.push(`<style type="text/css" data-primevue-style-id="${u}" ${l}>${d}</style>`);}return o},[]).join("")},getStyleSheet({name:e="",theme:t={},params:r,props:s={},set:i,defaults:a}){var c;let n={name:e,theme:t,params:r,set:i,defaults:a},l=(c=e.includes("-directive")?this.getPresetD(n):this.getPresetC(n))==null?void 0:c.css,o=Object.entries(s).reduce((m,[d,u])=>m.push(`${d}="${u}"`)&&m,[]).join(" ");return l?`<style type="text/css" data-primevue-style-id="${e}-variables" ${o}>${Y$1(l)}</style>`:""},createTokens(e={},t,r="",s="",i$1={}){let a=function(l$1,o={},c=[]){if(c.includes(this.path))return console.warn(`Circular reference detected at ${this.path}`),{colorScheme:l$1,path:this.path,paths:o,value:void 0};c.push(this.path),o.name=this.path,o.binding||(o.binding={});let m=this.value;if(typeof this.value=="string"&&k.test(this.value)){let u=this.value.trim().replace(k,g=>{var y;let f=g.slice(1,-1),x=this.tokens[f];if(!x)return console.warn(`Token not found for path: ${f}`),"__UNRESOLVED__";let p=x.computed(l$1,o,c);return Array.isArray(p)&&p.length===2?`light-dark(${p[0].value},${p[1].value})`:(y=p==null?void 0:p.value)!=null?y:"__UNRESOLVED__"});m=ne.test(u.replace(ie,"0"))?`calc(${u})`:u;}return l(o.binding)&&delete o.binding,c.pop(),{colorScheme:l$1,path:this.path,paths:o,value:m.includes("__UNRESOLVED__")?void 0:m}},n=(l,o,c)=>{Object.entries(l).forEach(([m,d])=>{let u=G(m,t.variable.excludedKeyRegex)?o:o?`${o}.${oe(m)}`:oe(m),g=c?`${c}.${m}`:m;i(d)?n(d,u,g):(i$1[u]||(i$1[u]={paths:[],computed:(f,x={},p=[])=>{if(i$1[u].paths.length===1)return i$1[u].paths[0].computed(i$1[u].paths[0].scheme,x.binding,p);if(f&&f!=="none")for(let y=0;y<i$1[u].paths.length;y++){let R=i$1[u].paths[y];if(R.scheme===f)return R.computed(f,x.binding,p)}return i$1[u].paths.map(y=>y.computed(y.scheme,x[y.scheme],p))}}),i$1[u].paths.push({path:g,value:d,scheme:g.includes("colorScheme.light")?"light":g.includes("colorScheme.dark")?"dark":"none",computed:a,tokens:i$1}));});};return n(e,r,s),i$1},getTokenValue(e,t,r){var l;let i=(o=>o.split(".").filter(m=>!G(m.toLowerCase(),r.variable.excludedKeyRegex)).join("."))(t),a=t.includes("colorScheme.light")?"light":t.includes("colorScheme.dark")?"dark":void 0,n=[(l=e[i])==null?void 0:l.computed(a)].flat().filter(o=>o);return n.length===1?n[0].value:n.reduce((o={},c)=>{let u=c,{colorScheme:m}=u,d=v(u,["colorScheme"]);return o[m]=d,o},void 0)},getSelectorRule(e,t,r,s$1){return r==="class"||r==="attr"?C(s(t)?`${e}${t},${e} ${t}`:e,s$1):C(e,C(t!=null?t:":root,:host",s$1))},transformCSS(e,t,r,s$1,i$1={},a,n,l){if(s(t)){let{cssLayer:o}=i$1;if(s$1!=="style"){let c=this.getColorSchemeOption(i$1,n);t=r==="dark"?c.reduce((m,{type:d,selector:u})=>(s(u)&&(m+=u.includes("[CSS]")?u.replace("[CSS]",t):this.getSelectorRule(u,l,d,t)),m),""):C(l!=null?l:":root,:host",t);}if(o){let c={name:"primeui"};i(o)&&(c.name=m(o.name,{name:e,type:s$1})),s(c.name)&&(t=C(`@layer ${c.name}`,t),a==null||a.layerNames(c.name));}return t}return ""}};var S={defaults:{variable:{prefix:"p",selector:":root,:host",excludedKeyRegex:/^(primitive|semantic|components|directives|variables|colorscheme|light|dark|common|root|states|extend|css)$/gi},options:{prefix:"p",darkModeSelector:"system",cssLayer:false}},_theme:void 0,_layerNames:new Set,_loadedStyleNames:new Set,_loadingStyles:new Set,_tokens:{},update(e={}){let{theme:t}=e;t&&(this._theme=$(h({},t),{options:h(h({},this.defaults.options),t.options)}),this._tokens=b.createTokens(this.preset,this.defaults),this.clearLoadedStyleNames());},get theme(){return this._theme},get preset(){var e;return ((e=this.theme)==null?void 0:e.preset)||{}},get options(){var e;return ((e=this.theme)==null?void 0:e.options)||{}},get tokens(){return this._tokens},getTheme(){return this.theme},setTheme(e){this.update({theme:e}),N.emit("theme:change",e);},getPreset(){return this.preset},setPreset(e){this._theme=$(h({},this.theme),{preset:e}),this._tokens=b.createTokens(e,this.defaults),this.clearLoadedStyleNames(),N.emit("preset:change",e),N.emit("theme:change",this.theme);},getOptions(){return this.options},setOptions(e){this._theme=$(h({},this.theme),{options:e}),this.clearLoadedStyleNames(),N.emit("options:change",e),N.emit("theme:change",this.theme);},getLayerNames(){return [...this._layerNames]},setLayerNames(e){this._layerNames.add(e);},getLoadedStyleNames(){return this._loadedStyleNames},isStyleNameLoaded(e){return this._loadedStyleNames.has(e)},setLoadedStyleName(e){this._loadedStyleNames.add(e);},deleteLoadedStyleName(e){this._loadedStyleNames.delete(e);},clearLoadedStyleNames(){this._loadedStyleNames.clear();},getTokenValue(e){return b.getTokenValue(this.tokens,e,this.defaults)},getCommon(e="",t){return b.getCommon({name:e,theme:this.theme,params:t,defaults:this.defaults,set:{layerNames:this.setLayerNames.bind(this)}})},getComponent(e="",t){let r={name:e,theme:this.theme,params:t,defaults:this.defaults,set:{layerNames:this.setLayerNames.bind(this)}};return b.getPresetC(r)},getDirective(e="",t){let r={name:e,theme:this.theme,params:t,defaults:this.defaults,set:{layerNames:this.setLayerNames.bind(this)}};return b.getPresetD(r)},getCustomPreset(e="",t,r,s){let i={name:e,preset:t,options:this.options,selector:r,params:s,defaults:this.defaults,set:{layerNames:this.setLayerNames.bind(this)}};return b.getPreset(i)},getLayerOrderCSS(e=""){return b.getLayerOrder(e,this.options,{names:this.getLayerNames()},this.defaults)},transformCSS(e="",t,r="style",s){return b.transformCSS(e,t,s,r,this.options,{layerNames:this.setLayerNames.bind(this)},this.defaults)},getCommonStyleSheet(e="",t,r={}){return b.getCommonStyleSheet({name:e,theme:this.theme,params:t,props:r,defaults:this.defaults,set:{layerNames:this.setLayerNames.bind(this)}})},getStyleSheet(e,t,r={}){return b.getStyleSheet({name:e,theme:this.theme,params:t,props:r,defaults:this.defaults,set:{layerNames:this.setLayerNames.bind(this)}})},onStyleMounted(e){this._loadingStyles.add(e);},onStyleUpdated(e){this._loadingStyles.add(e);},onStyleLoaded(e,{name:t}){this._loadingStyles.size&&(this._loadingStyles.delete(t),N.emit(`theme:${t}:load`,e),!this._loadingStyles.size&&N.emit("theme:load"));}};

var Base = {
  _loadedStyleNames: new Set(),
  getLoadedStyleNames: function getLoadedStyleNames() {
    return this._loadedStyleNames;
  },
  isStyleNameLoaded: function isStyleNameLoaded(name) {
    return this._loadedStyleNames.has(name);
  },
  setLoadedStyleName: function setLoadedStyleName(name) {
    this._loadedStyleNames.add(name);
  },
  deleteLoadedStyleName: function deleteLoadedStyleName(name) {
    this._loadedStyleNames["delete"](name);
  },
  clearLoadedStyleNames: function clearLoadedStyleNames() {
    this._loadedStyleNames.clear();
  }
};

var style$2="\n    *,\n    ::before,\n    ::after {\n        box-sizing: border-box;\n    }\n\n    .p-collapsible-enter-active {\n        animation: p-animate-collapsible-expand 0.2s ease-out;\n        overflow: hidden;\n    }\n\n    .p-collapsible-leave-active {\n        animation: p-animate-collapsible-collapse 0.2s ease-out;\n        overflow: hidden;\n    }\n\n    @keyframes p-animate-collapsible-expand {\n        from {\n            grid-template-rows: 0fr;\n        }\n        to {\n            grid-template-rows: 1fr;\n        }\n    }\n\n    @keyframes p-animate-collapsible-collapse {\n        from {\n            grid-template-rows: 1fr;\n        }\n        to {\n            grid-template-rows: 0fr;\n        }\n    }\n\n    .p-disabled,\n    .p-disabled * {\n        cursor: default;\n        pointer-events: none;\n        user-select: none;\n    }\n\n    .p-disabled,\n    .p-component:disabled {\n        opacity: dt('disabled.opacity');\n    }\n\n    .pi {\n        font-size: dt('icon.size');\n    }\n\n    .p-icon {\n        width: dt('icon.size');\n        height: dt('icon.size');\n    }\n\n    .p-overlay-mask {\n        background: var(--px-mask-background, dt('mask.background'));\n        color: dt('mask.color');\n        position: fixed;\n        top: 0;\n        left: 0;\n        width: 100%;\n        height: 100%;\n    }\n\n    .p-overlay-mask-enter-active {\n        animation: p-animate-overlay-mask-enter dt('mask.transition.duration') forwards;\n    }\n\n    .p-overlay-mask-leave-active {\n        animation: p-animate-overlay-mask-leave dt('mask.transition.duration') forwards;\n    }\n\n    @keyframes p-animate-overlay-mask-enter {\n        from {\n            background: transparent;\n        }\n        to {\n            background: var(--px-mask-background, dt('mask.background'));\n        }\n    }\n    @keyframes p-animate-overlay-mask-leave {\n        from {\n            background: var(--px-mask-background, dt('mask.background'));\n        }\n        to {\n            background: transparent;\n        }\n    }\n\n    .p-anchored-overlay-enter-active {\n        animation: p-animate-anchored-overlay-enter 300ms cubic-bezier(.19,1,.22,1);\n    }\n\n    .p-anchored-overlay-leave-active {\n        animation: p-animate-anchored-overlay-leave 300ms cubic-bezier(.19,1,.22,1);\n    }\n\n    @keyframes p-animate-anchored-overlay-enter {\n        from {\n            opacity: 0;\n            transform: scale(0.93);\n        }\n    }\n\n    @keyframes p-animate-anchored-overlay-leave {\n        to {\n            opacity: 0;\n            transform: scale(0.93);\n        }\n    }\n";

function _typeof$4(o) { "@babel/helpers - typeof"; return _typeof$4 = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof$4(o); }
function ownKeys$4(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread$4(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys$4(Object(t), true).forEach(function (r) { _defineProperty$4(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys$4(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty$4(e, r, t) { return (r = _toPropertyKey$4(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: true, configurable: true, writable: true }) : e[r] = t, e; }
function _toPropertyKey$4(t) { var i = _toPrimitive$4(t, "string"); return "symbol" == _typeof$4(i) ? i : i + ""; }
function _toPrimitive$4(t, r) { if ("object" != _typeof$4(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r); if ("object" != _typeof$4(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function tryOnMounted(fn) {
  var sync = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
  if (getCurrentInstance() && getCurrentInstance().components) onMounted(fn);else if (sync) fn();else nextTick(fn);
}
var _id = 0;
function useStyle(css) {
  var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var isLoaded = ref(false);
  var cssRef = ref(css);
  var styleRef = ref(null);
  var defaultDocument = tt() ? window.document : undefined;
  var _options$document = options.document,
    document = _options$document === void 0 ? defaultDocument : _options$document,
    _options$immediate = options.immediate,
    immediate = _options$immediate === void 0 ? true : _options$immediate,
    _options$manual = options.manual,
    manual = _options$manual === void 0 ? false : _options$manual,
    _options$name = options.name,
    name = _options$name === void 0 ? "style_".concat(++_id) : _options$name,
    _options$id = options.id,
    id = _options$id === void 0 ? undefined : _options$id,
    _options$media = options.media,
    media = _options$media === void 0 ? undefined : _options$media,
    _options$nonce = options.nonce,
    nonce = _options$nonce === void 0 ? undefined : _options$nonce,
    _options$first = options.first,
    first = _options$first === void 0 ? false : _options$first,
    _options$onMounted = options.onMounted,
    onStyleMounted = _options$onMounted === void 0 ? undefined : _options$onMounted,
    _options$onUpdated = options.onUpdated,
    onStyleUpdated = _options$onUpdated === void 0 ? undefined : _options$onUpdated,
    _options$onLoad = options.onLoad,
    onStyleLoaded = _options$onLoad === void 0 ? undefined : _options$onLoad,
    _options$props = options.props,
    props = _options$props === void 0 ? {} : _options$props;
  var stop = function stop() {};

  /* @todo: Improve _options params */
  var load = function load(_css) {
    var _props = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    if (!document) return;
    var _styleProps = _objectSpread$4(_objectSpread$4({}, props), _props);
    var _name = _styleProps.name || name,
      _id = _styleProps.id || id,
      _nonce = _styleProps.nonce || nonce;
    styleRef.value = document.querySelector("style[data-primevue-style-id=\"".concat(_name, "\"]")) || document.getElementById(_id) || document.createElement('style');
    if (!styleRef.value.isConnected) {
      cssRef.value = _css || css;
      A(styleRef.value, {
        type: 'text/css',
        id: _id,
        media: media,
        nonce: _nonce
      });
      first ? document.head.prepend(styleRef.value) : document.head.appendChild(styleRef.value);
      _t(styleRef.value, 'data-primevue-style-id', _name);
      A(styleRef.value, _styleProps);
      styleRef.value.onload = function (event) {
        return onStyleLoaded === null || onStyleLoaded === void 0 ? void 0 : onStyleLoaded(event, {
          name: _name
        });
      };
      onStyleMounted === null || onStyleMounted === void 0 || onStyleMounted(_name);
    }
    if (isLoaded.value) return;
    stop = watch(cssRef, function (value) {
      styleRef.value.textContent = value;
      onStyleUpdated === null || onStyleUpdated === void 0 || onStyleUpdated(_name);
    }, {
      immediate: true
    });
    isLoaded.value = true;
  };
  var unload = function unload() {
    if (!document || !isLoaded.value) return;
    stop();
    T(styleRef.value) && document.head.removeChild(styleRef.value);
    isLoaded.value = false;
    styleRef.value = null;
  };
  if (immediate && !manual) tryOnMounted(load);

  /*if (!manual)
    tryOnScopeDispose(unload)*/

  return {
    id: id,
    name: name,
    el: styleRef,
    css: cssRef,
    unload: unload,
    load: load,
    isLoaded: readonly(isLoaded)
  };
}

function _typeof$3(o) { "@babel/helpers - typeof"; return _typeof$3 = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof$3(o); }
var _templateObject, _templateObject2, _templateObject3, _templateObject4;
function _slicedToArray$1(r, e) { return _arrayWithHoles$1(r) || _iterableToArrayLimit$1(r, e) || _unsupportedIterableToArray$5(r, e) || _nonIterableRest$1(); }
function _nonIterableRest$1() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray$5(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray$5(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray$5(r, a) : void 0; } }
function _arrayLikeToArray$5(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _iterableToArrayLimit$1(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = true, o = false; try { if (i = (t = t.call(r)).next, 0 === l) ; else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = true, n = r; } finally { try { if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles$1(r) { if (Array.isArray(r)) return r; }
function ownKeys$3(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread$3(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys$3(Object(t), true).forEach(function (r) { _defineProperty$3(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys$3(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty$3(e, r, t) { return (r = _toPropertyKey$3(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: true, configurable: true, writable: true }) : e[r] = t, e; }
function _toPropertyKey$3(t) { var i = _toPrimitive$3(t, "string"); return "symbol" == _typeof$3(i) ? i : i + ""; }
function _toPrimitive$3(t, r) { if ("object" != _typeof$3(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r); if ("object" != _typeof$3(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _taggedTemplateLiteral(e, t) { return t || (t = e.slice(0)), Object.freeze(Object.defineProperties(e, { raw: { value: Object.freeze(t) } })); }
var css$1 = function css(_ref) {
  var dt = _ref.dt;
  return "\n.p-hidden-accessible {\n    border: 0;\n    clip: rect(0 0 0 0);\n    height: 1px;\n    margin: -1px;\n    opacity: 0;\n    overflow: hidden;\n    padding: 0;\n    pointer-events: none;\n    position: absolute;\n    white-space: nowrap;\n    width: 1px;\n}\n\n.p-overflow-hidden {\n    overflow: hidden;\n    padding-right: ".concat(dt('scrollbar.width'), ";\n}\n");
};
var classes$2 = {};
var inlineStyles = {};
var BaseStyle = {
  name: 'base',
  css: css$1,
  style: style$2,
  classes: classes$2,
  inlineStyles: inlineStyles,
  load: function load(style) {
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    var transform = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : function (cs) {
      return cs;
    };
    var computedStyle = transform(ar(_templateObject || (_templateObject = _taggedTemplateLiteral(["", ""])), style));
    return s(computedStyle) ? useStyle(Y$1(computedStyle), _objectSpread$3({
      name: this.name
    }, options)) : {};
  },
  loadCSS: function loadCSS() {
    var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    return this.load(this.css, options);
  },
  loadStyle: function loadStyle() {
    var _this = this;
    var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var style = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
    return this.load(this.style, options, function () {
      var computedStyle = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
      return S.transformCSS(options.name || _this.name, "".concat(computedStyle).concat(ar(_templateObject2 || (_templateObject2 = _taggedTemplateLiteral(["", ""])), style)));
    });
  },
  getCommonTheme: function getCommonTheme(params) {
    return S.getCommon(this.name, params);
  },
  getComponentTheme: function getComponentTheme(params) {
    return S.getComponent(this.name, params);
  },
  getDirectiveTheme: function getDirectiveTheme(params) {
    return S.getDirective(this.name, params);
  },
  getPresetTheme: function getPresetTheme(preset, selector, params) {
    return S.getCustomPreset(this.name, preset, selector, params);
  },
  getLayerOrderThemeCSS: function getLayerOrderThemeCSS() {
    return S.getLayerOrderCSS(this.name);
  },
  getStyleSheet: function getStyleSheet() {
    var extendedCSS = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
    var props = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    if (this.css) {
      var _css = m(this.css, {
        dt: E
      }) || '';
      var _style = Y$1(ar(_templateObject3 || (_templateObject3 = _taggedTemplateLiteral(["", "", ""])), _css, extendedCSS));
      var _props = Object.entries(props).reduce(function (acc, _ref2) {
        var _ref3 = _slicedToArray$1(_ref2, 2),
          k = _ref3[0],
          v = _ref3[1];
        return acc.push("".concat(k, "=\"").concat(v, "\"")) && acc;
      }, []).join(' ');
      return s(_style) ? "<style type=\"text/css\" data-primevue-style-id=\"".concat(this.name, "\" ").concat(_props, ">").concat(_style, "</style>") : '';
    }
    return '';
  },
  getCommonThemeStyleSheet: function getCommonThemeStyleSheet(params) {
    var props = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    return S.getCommonStyleSheet(this.name, params, props);
  },
  getThemeStyleSheet: function getThemeStyleSheet(params) {
    var props = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    var css = [S.getStyleSheet(this.name, params, props)];
    if (this.style) {
      var name = this.name === 'base' ? 'global-style' : "".concat(this.name, "-style");
      var _css = ar(_templateObject4 || (_templateObject4 = _taggedTemplateLiteral(["", ""])), m(this.style, {
        dt: E
      }));
      var _style = Y$1(S.transformCSS(name, _css));
      var _props = Object.entries(props).reduce(function (acc, _ref4) {
        var _ref5 = _slicedToArray$1(_ref4, 2),
          k = _ref5[0],
          v = _ref5[1];
        return acc.push("".concat(k, "=\"").concat(v, "\"")) && acc;
      }, []).join(' ');
      s(_style) && css.push("<style type=\"text/css\" data-primevue-style-id=\"".concat(name, "\" ").concat(_props, ">").concat(_style, "</style>"));
    }
    return css.join('');
  },
  extend: function extend(inStyle) {
    return _objectSpread$3(_objectSpread$3({}, this), {}, {
      css: undefined,
      style: undefined
    }, inStyle);
  }
};

function useAttrSelector() {
  var prefix = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'pc';
  var idx = useId();
  return "".concat(prefix).concat(idx.replace('v-', '').replaceAll('-', '_'));
}

var BaseComponentStyle = BaseStyle.extend({
  name: 'common'
});

function _typeof$2(o) { "@babel/helpers - typeof"; return _typeof$2 = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof$2(o); }
function _toArray(r) { return _arrayWithHoles(r) || _iterableToArray$4(r) || _unsupportedIterableToArray$4(r) || _nonIterableRest(); }
function _iterableToArray$4(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _slicedToArray(r, e) { return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray$4(r, e) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray$4(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray$4(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray$4(r, a) : void 0; } }
function _arrayLikeToArray$4(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = true, o = false; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = true, n = r; } finally { try { if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(r) { if (Array.isArray(r)) return r; }
function ownKeys$2(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread$2(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys$2(Object(t), true).forEach(function (r) { _defineProperty$2(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys$2(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty$2(e, r, t) { return (r = _toPropertyKey$2(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: true, configurable: true, writable: true }) : e[r] = t, e; }
function _toPropertyKey$2(t) { var i = _toPrimitive$2(t, "string"); return "symbol" == _typeof$2(i) ? i : i + ""; }
function _toPrimitive$2(t, r) { if ("object" != _typeof$2(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r); if ("object" != _typeof$2(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var script$9 = {
  name: 'BaseComponent',
  props: {
    pt: {
      type: Object,
      "default": undefined
    },
    ptOptions: {
      type: Object,
      "default": undefined
    },
    unstyled: {
      type: Boolean,
      "default": undefined
    },
    dt: {
      type: Object,
      "default": undefined
    }
  },
  inject: {
    $parentInstance: {
      "default": undefined
    }
  },
  watch: {
    isUnstyled: {
      immediate: true,
      handler: function handler(newValue) {
        N.off('theme:change', this._loadCoreStyles);
        if (!newValue) {
          this._loadCoreStyles();
          this._themeChangeListener(this._loadCoreStyles); // update styles with theme settings
        }
      }
    },
    dt: {
      immediate: true,
      handler: function handler(newValue, oldValue) {
        var _this = this;
        N.off('theme:change', this._themeScopedListener);
        if (newValue) {
          this._loadScopedThemeStyles(newValue);
          this._themeScopedListener = function () {
            return _this._loadScopedThemeStyles(newValue);
          };
          this._themeChangeListener(this._themeScopedListener);
        } else {
          this._unloadScopedThemeStyles();
        }
      }
    }
  },
  scopedStyleEl: undefined,
  rootEl: undefined,
  uid: undefined,
  $attrSelector: undefined,
  beforeCreate: function beforeCreate() {
    var _this$pt, _this$pt2, _this$pt3, _ref, _ref$onBeforeCreate, _this$$primevueConfig, _this$$primevue, _this$$primevue2, _this$$primevue3, _ref2, _ref2$onBeforeCreate;
    var _usept = (_this$pt = this.pt) === null || _this$pt === void 0 ? void 0 : _this$pt['_usept'];
    var originalValue = _usept ? (_this$pt2 = this.pt) === null || _this$pt2 === void 0 || (_this$pt2 = _this$pt2.originalValue) === null || _this$pt2 === void 0 ? void 0 : _this$pt2[this.$.type.name] : undefined;
    var value = _usept ? (_this$pt3 = this.pt) === null || _this$pt3 === void 0 || (_this$pt3 = _this$pt3.value) === null || _this$pt3 === void 0 ? void 0 : _this$pt3[this.$.type.name] : this.pt;
    (_ref = value || originalValue) === null || _ref === void 0 || (_ref = _ref.hooks) === null || _ref === void 0 || (_ref$onBeforeCreate = _ref['onBeforeCreate']) === null || _ref$onBeforeCreate === void 0 || _ref$onBeforeCreate.call(_ref);
    var _useptInConfig = (_this$$primevueConfig = this.$primevueConfig) === null || _this$$primevueConfig === void 0 || (_this$$primevueConfig = _this$$primevueConfig.pt) === null || _this$$primevueConfig === void 0 ? void 0 : _this$$primevueConfig['_usept'];
    var originalValueInConfig = _useptInConfig ? (_this$$primevue = this.$primevue) === null || _this$$primevue === void 0 || (_this$$primevue = _this$$primevue.config) === null || _this$$primevue === void 0 || (_this$$primevue = _this$$primevue.pt) === null || _this$$primevue === void 0 ? void 0 : _this$$primevue.originalValue : undefined;
    var valueInConfig = _useptInConfig ? (_this$$primevue2 = this.$primevue) === null || _this$$primevue2 === void 0 || (_this$$primevue2 = _this$$primevue2.config) === null || _this$$primevue2 === void 0 || (_this$$primevue2 = _this$$primevue2.pt) === null || _this$$primevue2 === void 0 ? void 0 : _this$$primevue2.value : (_this$$primevue3 = this.$primevue) === null || _this$$primevue3 === void 0 || (_this$$primevue3 = _this$$primevue3.config) === null || _this$$primevue3 === void 0 ? void 0 : _this$$primevue3.pt;
    (_ref2 = valueInConfig || originalValueInConfig) === null || _ref2 === void 0 || (_ref2 = _ref2[this.$.type.name]) === null || _ref2 === void 0 || (_ref2 = _ref2.hooks) === null || _ref2 === void 0 || (_ref2$onBeforeCreate = _ref2['onBeforeCreate']) === null || _ref2$onBeforeCreate === void 0 || _ref2$onBeforeCreate.call(_ref2);
    this.$attrSelector = useAttrSelector();
    this.uid = this.$attrs.id || this.$attrSelector.replace('pc', 'pv_id_');
  },
  created: function created() {
    this._hook('onCreated');
  },
  beforeMount: function beforeMount() {
    var _this$$el;
    // @deprecated - remove in v5
    this.rootEl = z$1(c$1(this.$el) ? this.$el : (_this$$el = this.$el) === null || _this$$el === void 0 ? void 0 : _this$$el.parentElement, "[".concat(this.$attrSelector, "]"));
    if (this.rootEl) {
      this.rootEl.$pc = _objectSpread$2({
        name: this.$.type.name,
        attrSelector: this.$attrSelector
      }, this.$params);
    }
    this._loadStyles();
    this._hook('onBeforeMount');
  },
  mounted: function mounted() {
    this._hook('onMounted');
  },
  beforeUpdate: function beforeUpdate() {
    this._hook('onBeforeUpdate');
  },
  updated: function updated() {
    this._hook('onUpdated');
  },
  beforeUnmount: function beforeUnmount() {
    this._hook('onBeforeUnmount');
  },
  unmounted: function unmounted() {
    this._removeThemeListeners();
    this._unloadScopedThemeStyles();
    this._hook('onUnmounted');
  },
  methods: {
    _hook: function _hook(hookName) {
      if (!this.$options.hostName) {
        var selfHook = this._usePT(this._getPT(this.pt, this.$.type.name), this._getOptionValue, "hooks.".concat(hookName));
        var defaultHook = this._useDefaultPT(this._getOptionValue, "hooks.".concat(hookName));
        selfHook === null || selfHook === void 0 || selfHook();
        defaultHook === null || defaultHook === void 0 || defaultHook();
      }
    },
    _mergeProps: function _mergeProps(fn) {
      for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key2 = 1; _key2 < _len; _key2++) {
        args[_key2 - 1] = arguments[_key2];
      }
      return c(fn) ? fn.apply(void 0, args) : mergeProps.apply(void 0, args);
    },
    _load: function _load() {
      // @todo
      if (!Base.isStyleNameLoaded('base')) {
        BaseStyle.loadCSS(this.$styleOptions);
        this._loadGlobalStyles();
        Base.setLoadedStyleName('base');
      }
      this._loadThemeStyles();
    },
    _loadStyles: function _loadStyles() {
      this._load();
      this._themeChangeListener(this._load);
    },
    _loadCoreStyles: function _loadCoreStyles() {
      var _this$$style, _this$$style2;
      if (!Base.isStyleNameLoaded((_this$$style = this.$style) === null || _this$$style === void 0 ? void 0 : _this$$style.name) && (_this$$style2 = this.$style) !== null && _this$$style2 !== void 0 && _this$$style2.name) {
        BaseComponentStyle.loadCSS(this.$styleOptions);
        this.$options.style && this.$style.loadCSS(this.$styleOptions);
        Base.setLoadedStyleName(this.$style.name);
      }
    },
    _loadGlobalStyles: function _loadGlobalStyles() {
      /*
       * @todo Add self custom css support;
       * <Panel :pt="{ css: `...` }" .../>
       *
       * const selfCSS = this._getPTClassValue(this.pt, 'css', this.$params);
       * const defaultCSS = this._getPTClassValue(this.defaultPT, 'css', this.$params);
       * const mergedCSS = mergeProps(selfCSS, defaultCSS);
       * isNotEmpty(mergedCSS?.class) && this.$css.loadCustomStyle(mergedCSS?.class);
       */

      var globalCSS = this._useGlobalPT(this._getOptionValue, 'global.css', this.$params);
      s(globalCSS) && BaseStyle.load(globalCSS, _objectSpread$2({
        name: 'global'
      }, this.$styleOptions));
    },
    _loadThemeStyles: function _loadThemeStyles() {
      var _this$$style4, _this$$style5;
      if (this.isUnstyled || this.$theme === 'none') return;

      // common
      if (!S.isStyleNameLoaded('common')) {
        var _this$$style3, _this$$style3$getComm;
        var _ref3 = ((_this$$style3 = this.$style) === null || _this$$style3 === void 0 || (_this$$style3$getComm = _this$$style3.getCommonTheme) === null || _this$$style3$getComm === void 0 ? void 0 : _this$$style3$getComm.call(_this$$style3)) || {},
          primitive = _ref3.primitive,
          semantic = _ref3.semantic,
          global = _ref3.global,
          style = _ref3.style;
        BaseStyle.load(primitive === null || primitive === void 0 ? void 0 : primitive.css, _objectSpread$2({
          name: 'primitive-variables'
        }, this.$styleOptions));
        BaseStyle.load(semantic === null || semantic === void 0 ? void 0 : semantic.css, _objectSpread$2({
          name: 'semantic-variables'
        }, this.$styleOptions));
        BaseStyle.load(global === null || global === void 0 ? void 0 : global.css, _objectSpread$2({
          name: 'global-variables'
        }, this.$styleOptions));
        BaseStyle.loadStyle(_objectSpread$2({
          name: 'global-style'
        }, this.$styleOptions), style);
        S.setLoadedStyleName('common');
      }

      // component
      if (!S.isStyleNameLoaded((_this$$style4 = this.$style) === null || _this$$style4 === void 0 ? void 0 : _this$$style4.name) && (_this$$style5 = this.$style) !== null && _this$$style5 !== void 0 && _this$$style5.name) {
        var _this$$style6, _this$$style6$getComp, _this$$style7, _this$$style8;
        var _ref4 = ((_this$$style6 = this.$style) === null || _this$$style6 === void 0 || (_this$$style6$getComp = _this$$style6.getComponentTheme) === null || _this$$style6$getComp === void 0 ? void 0 : _this$$style6$getComp.call(_this$$style6)) || {},
          css = _ref4.css,
          _style = _ref4.style;
        (_this$$style7 = this.$style) === null || _this$$style7 === void 0 || _this$$style7.load(css, _objectSpread$2({
          name: "".concat(this.$style.name, "-variables")
        }, this.$styleOptions));
        (_this$$style8 = this.$style) === null || _this$$style8 === void 0 || _this$$style8.loadStyle(_objectSpread$2({
          name: "".concat(this.$style.name, "-style")
        }, this.$styleOptions), _style);
        S.setLoadedStyleName(this.$style.name);
      }

      // layer order
      if (!S.isStyleNameLoaded('layer-order')) {
        var _this$$style9, _this$$style9$getLaye;
        var layerOrder = (_this$$style9 = this.$style) === null || _this$$style9 === void 0 || (_this$$style9$getLaye = _this$$style9.getLayerOrderThemeCSS) === null || _this$$style9$getLaye === void 0 ? void 0 : _this$$style9$getLaye.call(_this$$style9);
        BaseStyle.load(layerOrder, _objectSpread$2({
          name: 'layer-order',
          first: true
        }, this.$styleOptions));
        S.setLoadedStyleName('layer-order');
      }
    },
    _loadScopedThemeStyles: function _loadScopedThemeStyles(preset) {
      var _this$$style0, _this$$style0$getPres, _this$$style1;
      var _ref5 = ((_this$$style0 = this.$style) === null || _this$$style0 === void 0 || (_this$$style0$getPres = _this$$style0.getPresetTheme) === null || _this$$style0$getPres === void 0 ? void 0 : _this$$style0$getPres.call(_this$$style0, preset, "[".concat(this.$attrSelector, "]"))) || {},
        css = _ref5.css;
      var scopedStyle = (_this$$style1 = this.$style) === null || _this$$style1 === void 0 ? void 0 : _this$$style1.load(css, _objectSpread$2({
        name: "".concat(this.$attrSelector, "-").concat(this.$style.name)
      }, this.$styleOptions));
      this.scopedStyleEl = scopedStyle.el;
    },
    _unloadScopedThemeStyles: function _unloadScopedThemeStyles() {
      var _this$scopedStyleEl;
      (_this$scopedStyleEl = this.scopedStyleEl) === null || _this$scopedStyleEl === void 0 || (_this$scopedStyleEl = _this$scopedStyleEl.value) === null || _this$scopedStyleEl === void 0 || _this$scopedStyleEl.remove();
    },
    _themeChangeListener: function _themeChangeListener() {
      var callback = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : function () {};
      Base.clearLoadedStyleNames();
      N.on('theme:change', callback);
    },
    _removeThemeListeners: function _removeThemeListeners() {
      N.off('theme:change', this._loadCoreStyles);
      N.off('theme:change', this._load);
      N.off('theme:change', this._themeScopedListener);
    },
    _getHostInstance: function _getHostInstance(instance) {
      return instance ? this.$options.hostName ? instance.$.type.name === this.$options.hostName ? instance : this._getHostInstance(instance.$parentInstance) : instance.$parentInstance : undefined;
    },
    _getPropValue: function _getPropValue(name) {
      var _this$_getHostInstanc;
      return this[name] || ((_this$_getHostInstanc = this._getHostInstance(this)) === null || _this$_getHostInstanc === void 0 ? void 0 : _this$_getHostInstanc[name]);
    },
    _getOptionValue: function _getOptionValue(options) {
      var key = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
      var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      return F$1(options, key, params);
    },
    _getPTValue: function _getPTValue() {
      var _this$$primevueConfig2;
      var obj = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      var key = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
      var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      var searchInDefaultPT = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : true;
      var searchOut = /./g.test(key) && !!params[key.split('.')[0]];
      var _ref6 = this._getPropValue('ptOptions') || ((_this$$primevueConfig2 = this.$primevueConfig) === null || _this$$primevueConfig2 === void 0 ? void 0 : _this$$primevueConfig2.ptOptions) || {},
        _ref6$mergeSections = _ref6.mergeSections,
        mergeSections = _ref6$mergeSections === void 0 ? true : _ref6$mergeSections,
        _ref6$mergeProps = _ref6.mergeProps,
        useMergeProps = _ref6$mergeProps === void 0 ? false : _ref6$mergeProps;
      var global = searchInDefaultPT ? searchOut ? this._useGlobalPT(this._getPTClassValue, key, params) : this._useDefaultPT(this._getPTClassValue, key, params) : undefined;
      var self = searchOut ? undefined : this._getPTSelf(obj, this._getPTClassValue, key, _objectSpread$2(_objectSpread$2({}, params), {}, {
        global: global || {}
      }));
      var datasets = this._getPTDatasets(key);
      return mergeSections || !mergeSections && self ? useMergeProps ? this._mergeProps(useMergeProps, global, self, datasets) : _objectSpread$2(_objectSpread$2(_objectSpread$2({}, global), self), datasets) : _objectSpread$2(_objectSpread$2({}, self), datasets);
    },
    _getPTSelf: function _getPTSelf() {
      var obj = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key3 = 1; _key3 < _len2; _key3++) {
        args[_key3 - 1] = arguments[_key3];
      }
      return mergeProps(this._usePT.apply(this, [this._getPT(obj, this.$name)].concat(args)),
      // Exp; <component :pt="{}"
      this._usePT.apply(this, [this.$_attrsPT].concat(args)) // Exp; <component :pt:[passthrough_key]:[attribute]="{value}" or <component :pt:[passthrough_key]="() =>{value}"
      );
    },
    _getPTDatasets: function _getPTDatasets() {
      var _this$pt4, _this$pt5;
      var key = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
      var datasetPrefix = 'data-pc-';
      var isExtended = key === 'root' && s((_this$pt4 = this.pt) === null || _this$pt4 === void 0 ? void 0 : _this$pt4['data-pc-section']);
      return key !== 'transition' && _objectSpread$2(_objectSpread$2({}, key === 'root' && _objectSpread$2(_objectSpread$2(_defineProperty$2({}, "".concat(datasetPrefix, "name"), g(isExtended ? (_this$pt5 = this.pt) === null || _this$pt5 === void 0 ? void 0 : _this$pt5['data-pc-section'] : this.$.type.name)), isExtended && _defineProperty$2({}, "".concat(datasetPrefix, "extend"), g(this.$.type.name))), {}, _defineProperty$2({}, "".concat(this.$attrSelector), ''))), {}, _defineProperty$2({}, "".concat(datasetPrefix, "section"), g(key)));
    },
    _getPTClassValue: function _getPTClassValue() {
      var value = this._getOptionValue.apply(this, arguments);
      return a(value) || C$1(value) ? {
        "class": value
      } : value;
    },
    _getPT: function _getPT(pt) {
      var _this2 = this;
      var key = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
      var callback = arguments.length > 2 ? arguments[2] : undefined;
      var getValue = function getValue(value) {
        var _ref8;
        var checkSameKey = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
        var computedValue = callback ? callback(value) : value;
        var _key = g(key);
        var _cKey = g(_this2.$name);
        return (_ref8 = checkSameKey ? _key !== _cKey ? computedValue === null || computedValue === void 0 ? void 0 : computedValue[_key] : undefined : computedValue === null || computedValue === void 0 ? void 0 : computedValue[_key]) !== null && _ref8 !== void 0 ? _ref8 : computedValue;
      };
      return pt !== null && pt !== void 0 && pt.hasOwnProperty('_usept') ? {
        _usept: pt['_usept'],
        originalValue: getValue(pt.originalValue),
        value: getValue(pt.value)
      } : getValue(pt, true);
    },
    _usePT: function _usePT(pt, callback, key, params) {
      var fn = function fn(value) {
        return callback(value, key, params);
      };
      if (pt !== null && pt !== void 0 && pt.hasOwnProperty('_usept')) {
        var _this$$primevueConfig3;
        var _ref9 = pt['_usept'] || ((_this$$primevueConfig3 = this.$primevueConfig) === null || _this$$primevueConfig3 === void 0 ? void 0 : _this$$primevueConfig3.ptOptions) || {},
          _ref9$mergeSections = _ref9.mergeSections,
          mergeSections = _ref9$mergeSections === void 0 ? true : _ref9$mergeSections,
          _ref9$mergeProps = _ref9.mergeProps,
          useMergeProps = _ref9$mergeProps === void 0 ? false : _ref9$mergeProps;
        var originalValue = fn(pt.originalValue);
        var value = fn(pt.value);
        if (originalValue === undefined && value === undefined) return undefined;else if (a(value)) return value;else if (a(originalValue)) return originalValue;
        return mergeSections || !mergeSections && value ? useMergeProps ? this._mergeProps(useMergeProps, originalValue, value) : _objectSpread$2(_objectSpread$2({}, originalValue), value) : value;
      }
      return fn(pt);
    },
    _useGlobalPT: function _useGlobalPT(callback, key, params) {
      return this._usePT(this.globalPT, callback, key, params);
    },
    _useDefaultPT: function _useDefaultPT(callback, key, params) {
      return this._usePT(this.defaultPT, callback, key, params);
    },
    ptm: function ptm() {
      var key = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
      var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      return this._getPTValue(this.pt, key, _objectSpread$2(_objectSpread$2({}, this.$params), params));
    },
    ptmi: function ptmi() {
      var _attrs$id;
      var key = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
      var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      // inheritAttrs:true
      var attrs = mergeProps(this.$_attrsWithoutPT, this.ptm(key, params));
      (attrs === null || attrs === void 0 ? void 0 : attrs.hasOwnProperty('id')) && ((_attrs$id = attrs.id) !== null && _attrs$id !== void 0 ? _attrs$id : attrs.id = this.$id);
      return attrs;
    },
    ptmo: function ptmo() {
      var obj = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      var key = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';
      var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      return this._getPTValue(obj, key, _objectSpread$2({
        instance: this
      }, params), false);
    },
    cx: function cx() {
      var key = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
      var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      return !this.isUnstyled ? this._getOptionValue(this.$style.classes, key, _objectSpread$2(_objectSpread$2({}, this.$params), params)) : undefined;
    },
    sx: function sx() {
      var key = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
      var when = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
      var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      if (when) {
        var self = this._getOptionValue(this.$style.inlineStyles, key, _objectSpread$2(_objectSpread$2({}, this.$params), params));
        var base = this._getOptionValue(BaseComponentStyle.inlineStyles, key, _objectSpread$2(_objectSpread$2({}, this.$params), params));
        return [base, self];
      }
      return undefined;
    }
  },
  computed: {
    globalPT: function globalPT() {
      var _this$$primevueConfig4,
        _this3 = this;
      return this._getPT((_this$$primevueConfig4 = this.$primevueConfig) === null || _this$$primevueConfig4 === void 0 ? void 0 : _this$$primevueConfig4.pt, undefined, function (value) {
        return m(value, {
          instance: _this3
        });
      });
    },
    defaultPT: function defaultPT() {
      var _this$$primevueConfig5,
        _this4 = this;
      return this._getPT((_this$$primevueConfig5 = this.$primevueConfig) === null || _this$$primevueConfig5 === void 0 ? void 0 : _this$$primevueConfig5.pt, undefined, function (value) {
        return _this4._getOptionValue(value, _this4.$name, _objectSpread$2({}, _this4.$params)) || m(value, _objectSpread$2({}, _this4.$params));
      });
    },
    isUnstyled: function isUnstyled() {
      var _this$$primevueConfig6;
      return this.unstyled !== undefined ? this.unstyled : (_this$$primevueConfig6 = this.$primevueConfig) === null || _this$$primevueConfig6 === void 0 ? void 0 : _this$$primevueConfig6.unstyled;
    },
    $id: function $id() {
      return this.$attrs.id || this.uid;
    },
    $inProps: function $inProps() {
      var _this$$$vnode;
      var nodePropKeys = Object.keys(((_this$$$vnode = this.$.vnode) === null || _this$$$vnode === void 0 ? void 0 : _this$$$vnode.props) || {});
      return Object.fromEntries(Object.entries(this.$props).filter(function (_ref0) {
        var _ref1 = _slicedToArray(_ref0, 1),
          k = _ref1[0];
        return nodePropKeys === null || nodePropKeys === void 0 ? void 0 : nodePropKeys.includes(k);
      }));
    },
    $theme: function $theme() {
      var _this$$primevueConfig7;
      return (_this$$primevueConfig7 = this.$primevueConfig) === null || _this$$primevueConfig7 === void 0 ? void 0 : _this$$primevueConfig7.theme;
    },
    $style: function $style() {
      return _objectSpread$2(_objectSpread$2({
        classes: undefined,
        inlineStyles: undefined,
        load: function load() {},
        loadCSS: function loadCSS() {},
        loadStyle: function loadStyle() {}
      }, (this._getHostInstance(this) || {}).$style), this.$options.style);
    },
    $styleOptions: function $styleOptions() {
      var _this$$primevueConfig8;
      return {
        nonce: (_this$$primevueConfig8 = this.$primevueConfig) === null || _this$$primevueConfig8 === void 0 || (_this$$primevueConfig8 = _this$$primevueConfig8.csp) === null || _this$$primevueConfig8 === void 0 ? void 0 : _this$$primevueConfig8.nonce
      };
    },
    $primevueConfig: function $primevueConfig() {
      var _this$$primevue4;
      return (_this$$primevue4 = this.$primevue) === null || _this$$primevue4 === void 0 ? void 0 : _this$$primevue4.config;
    },
    $name: function $name() {
      return this.$options.hostName || this.$.type.name;
    },
    $params: function $params() {
      var parentInstance = this._getHostInstance(this) || this.$parent;
      return {
        instance: this,
        props: this.$props,
        state: this.$data,
        attrs: this.$attrs,
        parent: {
          instance: parentInstance,
          props: parentInstance === null || parentInstance === void 0 ? void 0 : parentInstance.$props,
          state: parentInstance === null || parentInstance === void 0 ? void 0 : parentInstance.$data,
          attrs: parentInstance === null || parentInstance === void 0 ? void 0 : parentInstance.$attrs
        }
      };
    },
    $_attrsPT: function $_attrsPT() {
      return Object.entries(this.$attrs || {}).filter(function (_ref10) {
        var _ref11 = _slicedToArray(_ref10, 1),
          key = _ref11[0];
        return key === null || key === void 0 ? void 0 : key.startsWith('pt:');
      }).reduce(function (result, _ref12) {
        var _ref13 = _slicedToArray(_ref12, 2),
          key = _ref13[0],
          value = _ref13[1];
        var _key$split = key.split(':'),
          _key$split2 = _toArray(_key$split),
          rest = _arrayLikeToArray$4(_key$split2).slice(1);
        rest === null || rest === void 0 || rest.reduce(function (currentObj, nestedKey, index, array) {
          !currentObj[nestedKey] && (currentObj[nestedKey] = index === array.length - 1 ? value : {});
          return currentObj[nestedKey];
        }, result);
        return result;
      }, {});
    },
    $_attrsWithoutPT: function $_attrsWithoutPT() {
      return Object.entries(this.$attrs || {}).filter(function (_ref14) {
        var _ref15 = _slicedToArray(_ref14, 1),
          key = _ref15[0];
        return !(key !== null && key !== void 0 && key.startsWith('pt:'));
      }).reduce(function (acc, _ref16) {
        var _ref17 = _slicedToArray(_ref16, 2),
          key = _ref17[0],
          value = _ref17[1];
        acc[key] = value;
        return acc;
      }, {});
    }
  }
};

var css = "\n.p-icon {\n    display: inline-block;\n    vertical-align: baseline;\n    flex-shrink: 0;\n}\n\n.p-icon-spin {\n    -webkit-animation: p-icon-spin 2s infinite linear;\n    animation: p-icon-spin 2s infinite linear;\n}\n\n@-webkit-keyframes p-icon-spin {\n    0% {\n        -webkit-transform: rotate(0deg);\n        transform: rotate(0deg);\n    }\n    100% {\n        -webkit-transform: rotate(359deg);\n        transform: rotate(359deg);\n    }\n}\n\n@keyframes p-icon-spin {\n    0% {\n        -webkit-transform: rotate(0deg);\n        transform: rotate(0deg);\n    }\n    100% {\n        -webkit-transform: rotate(359deg);\n        transform: rotate(359deg);\n    }\n}\n";
var BaseIconStyle = BaseStyle.extend({
  name: 'baseicon',
  css: css
});

function _typeof$1(o) { "@babel/helpers - typeof"; return _typeof$1 = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof$1(o); }
function ownKeys$1(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread$1(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys$1(Object(t), true).forEach(function (r) { _defineProperty$1(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys$1(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty$1(e, r, t) { return (r = _toPropertyKey$1(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: true, configurable: true, writable: true }) : e[r] = t, e; }
function _toPropertyKey$1(t) { var i = _toPrimitive$1(t, "string"); return "symbol" == _typeof$1(i) ? i : i + ""; }
function _toPrimitive$1(t, r) { if ("object" != _typeof$1(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r); if ("object" != _typeof$1(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var script$8 = {
  name: 'BaseIcon',
  "extends": script$9,
  props: {
    label: {
      type: String,
      "default": undefined
    },
    spin: {
      type: Boolean,
      "default": false
    }
  },
  style: BaseIconStyle,
  provide: function provide() {
    return {
      $pcIcon: this,
      $parentInstance: this
    };
  },
  methods: {
    pti: function pti() {
      var isLabelEmpty = l(this.label);
      return _objectSpread$1(_objectSpread$1({}, !this.isUnstyled && {
        "class": ['p-icon', {
          'p-icon-spin': this.spin
        }]
      }), {}, {
        role: !isLabelEmpty ? 'img' : undefined,
        'aria-label': !isLabelEmpty ? this.label : undefined,
        'aria-hidden': isLabelEmpty
      });
    }
  }
};

var script$7 = {
  name: 'AngleDownIcon',
  "extends": script$8
};

function _toConsumableArray$3(r) { return _arrayWithoutHoles$3(r) || _iterableToArray$3(r) || _unsupportedIterableToArray$3(r) || _nonIterableSpread$3(); }
function _nonIterableSpread$3() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray$3(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray$3(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray$3(r, a) : void 0; } }
function _iterableToArray$3(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles$3(r) { if (Array.isArray(r)) return _arrayLikeToArray$3(r); }
function _arrayLikeToArray$3(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function render$4(_ctx, _cache, $props, $setup, $data, $options) {
  return openBlock(), createElementBlock("svg", mergeProps({
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg"
  }, _ctx.pti()), _toConsumableArray$3(_cache[0] || (_cache[0] = [createElementVNode("path", {
    d: "M3.58659 4.5007C3.68513 4.50023 3.78277 4.51945 3.87379 4.55723C3.9648 4.59501 4.04735 4.65058 4.11659 4.7207L7.11659 7.7207L10.1166 4.7207C10.2619 4.65055 10.4259 4.62911 10.5843 4.65956C10.7427 4.69002 10.8871 4.77074 10.996 4.88976C11.1049 5.00877 11.1726 5.15973 11.1889 5.32022C11.2052 5.48072 11.1693 5.6422 11.0866 5.7807L7.58659 9.2807C7.44597 9.42115 7.25534 9.50004 7.05659 9.50004C6.85784 9.50004 6.66722 9.42115 6.52659 9.2807L3.02659 5.7807C2.88614 5.64007 2.80725 5.44945 2.80725 5.2507C2.80725 5.05195 2.88614 4.86132 3.02659 4.7207C3.09932 4.64685 3.18675 4.58911 3.28322 4.55121C3.37969 4.51331 3.48305 4.4961 3.58659 4.5007Z",
    fill: "currentColor"
  }, null, -1)])), 16);
}

script$7.render = render$4;

var script$6 = {
  name: 'AngleUpIcon',
  "extends": script$8
};

function _toConsumableArray$2(r) { return _arrayWithoutHoles$2(r) || _iterableToArray$2(r) || _unsupportedIterableToArray$2(r) || _nonIterableSpread$2(); }
function _nonIterableSpread$2() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray$2(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray$2(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray$2(r, a) : void 0; } }
function _iterableToArray$2(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles$2(r) { if (Array.isArray(r)) return _arrayLikeToArray$2(r); }
function _arrayLikeToArray$2(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function render$3(_ctx, _cache, $props, $setup, $data, $options) {
  return openBlock(), createElementBlock("svg", mergeProps({
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg"
  }, _ctx.pti()), _toConsumableArray$2(_cache[0] || (_cache[0] = [createElementVNode("path", {
    d: "M10.4134 9.49931C10.3148 9.49977 10.2172 9.48055 10.1262 9.44278C10.0352 9.405 9.95263 9.34942 9.88338 9.27931L6.88338 6.27931L3.88338 9.27931C3.73811 9.34946 3.57409 9.3709 3.41567 9.34044C3.25724 9.30999 3.11286 9.22926 3.00395 9.11025C2.89504 8.99124 2.82741 8.84028 2.8111 8.67978C2.79478 8.51928 2.83065 8.35781 2.91338 8.21931L6.41338 4.71931C6.55401 4.57886 6.74463 4.49997 6.94338 4.49997C7.14213 4.49997 7.33276 4.57886 7.47338 4.71931L10.9734 8.21931C11.1138 8.35994 11.1927 8.55056 11.1927 8.74931C11.1927 8.94806 11.1138 9.13868 10.9734 9.27931C10.9007 9.35315 10.8132 9.41089 10.7168 9.44879C10.6203 9.48669 10.5169 9.5039 10.4134 9.49931Z",
    fill: "currentColor"
  }, null, -1)])), 16);
}

script$6.render = render$3;

var script$5 = {
  name: 'TimesIcon',
  "extends": script$8
};

function _toConsumableArray$1(r) { return _arrayWithoutHoles$1(r) || _iterableToArray$1(r) || _unsupportedIterableToArray$1(r) || _nonIterableSpread$1(); }
function _nonIterableSpread$1() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray$1(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray$1(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray$1(r, a) : void 0; } }
function _iterableToArray$1(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles$1(r) { if (Array.isArray(r)) return _arrayLikeToArray$1(r); }
function _arrayLikeToArray$1(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function render$2(_ctx, _cache, $props, $setup, $data, $options) {
  return openBlock(), createElementBlock("svg", mergeProps({
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg"
  }, _ctx.pti()), _toConsumableArray$1(_cache[0] || (_cache[0] = [createElementVNode("path", {
    d: "M8.01186 7.00933L12.27 2.75116C12.341 2.68501 12.398 2.60524 12.4375 2.51661C12.4769 2.42798 12.4982 2.3323 12.4999 2.23529C12.5016 2.13827 12.4838 2.0419 12.4474 1.95194C12.4111 1.86197 12.357 1.78024 12.2884 1.71163C12.2198 1.64302 12.138 1.58893 12.0481 1.55259C11.9581 1.51625 11.8617 1.4984 11.7647 1.50011C11.6677 1.50182 11.572 1.52306 11.4834 1.56255C11.3948 1.60204 11.315 1.65898 11.2488 1.72997L6.99067 5.98814L2.7325 1.72997C2.59553 1.60234 2.41437 1.53286 2.22718 1.53616C2.03999 1.53946 1.8614 1.61529 1.72901 1.74767C1.59663 1.88006 1.5208 2.05865 1.5175 2.24584C1.5142 2.43303 1.58368 2.61419 1.71131 2.75116L5.96948 7.00933L1.71131 11.2675C1.576 11.403 1.5 11.5866 1.5 11.7781C1.5 11.9696 1.576 12.1532 1.71131 12.2887C1.84679 12.424 2.03043 12.5 2.2219 12.5C2.41338 12.5 2.59702 12.424 2.7325 12.2887L6.99067 8.03052L11.2488 12.2887C11.3843 12.424 11.568 12.5 11.7594 12.5C11.9509 12.5 12.1346 12.424 12.27 12.2887C12.4053 12.1532 12.4813 11.9696 12.4813 11.7781C12.4813 11.5866 12.4053 11.403 12.27 11.2675L8.01186 7.00933Z",
    fill: "currentColor"
  }, null, -1)])), 16);
}

script$5.render = render$2;

var script$4 = {
  name: 'BaseEditableHolder',
  "extends": script$9,
  emits: ['update:modelValue', 'value-change'],
  props: {
    modelValue: {
      type: null,
      "default": undefined
    },
    defaultValue: {
      type: null,
      "default": undefined
    },
    name: {
      type: String,
      "default": undefined
    },
    invalid: {
      type: Boolean,
      "default": undefined
    },
    disabled: {
      type: Boolean,
      "default": false
    },
    formControl: {
      type: Object,
      "default": undefined
    }
  },
  inject: {
    $parentInstance: {
      "default": undefined
    },
    $pcForm: {
      "default": undefined
    },
    $pcFormField: {
      "default": undefined
    }
  },
  data: function data() {
    return {
      d_value: this.defaultValue !== undefined ? this.defaultValue : this.modelValue
    };
  },
  watch: {
    modelValue: {
      deep: true,
      handler: function handler(newValue) {
        this.d_value = newValue;
      }
    },
    defaultValue: function defaultValue(newValue) {
      this.d_value = newValue;
    },
    $formName: {
      immediate: true,
      handler: function handler(newValue) {
        var _this$$pcForm, _this$$pcForm$registe;
        this.formField = ((_this$$pcForm = this.$pcForm) === null || _this$$pcForm === void 0 || (_this$$pcForm$registe = _this$$pcForm.register) === null || _this$$pcForm$registe === void 0 ? void 0 : _this$$pcForm$registe.call(_this$$pcForm, newValue, this.$formControl)) || {};
      }
    },
    $formControl: {
      immediate: true,
      handler: function handler(newValue) {
        var _this$$pcForm2, _this$$pcForm2$regist;
        this.formField = ((_this$$pcForm2 = this.$pcForm) === null || _this$$pcForm2 === void 0 || (_this$$pcForm2$regist = _this$$pcForm2.register) === null || _this$$pcForm2$regist === void 0 ? void 0 : _this$$pcForm2$regist.call(_this$$pcForm2, this.$formName, newValue)) || {};
      }
    },
    $formDefaultValue: {
      immediate: true,
      handler: function handler(newValue) {
        this.d_value !== newValue && (this.d_value = newValue);
      }
    },
    $formValue: {
      immediate: false,
      handler: function handler(newValue) {
        var _this$$pcForm3;
        if ((_this$$pcForm3 = this.$pcForm) !== null && _this$$pcForm3 !== void 0 && _this$$pcForm3.getFieldState(this.$formName) && newValue !== this.d_value) {
          this.d_value = newValue;
        }
      }
    }
  },
  formField: {},
  methods: {
    writeValue: function writeValue(value, event) {
      var _this$formField$onCha, _this$formField;
      if (this.controlled) {
        this.d_value = value;
        this.$emit('update:modelValue', value);
      }
      this.$emit('value-change', value);
      (_this$formField$onCha = (_this$formField = this.formField).onChange) === null || _this$formField$onCha === void 0 || _this$formField$onCha.call(_this$formField, {
        originalEvent: event,
        value: value
      });
    },
    // @todo move to @primeuix/utils
    findNonEmpty: function findNonEmpty() {
      for (var _len = arguments.length, values = new Array(_len), _key = 0; _key < _len; _key++) {
        values[_key] = arguments[_key];
      }
      return values.find(s);
    }
  },
  computed: {
    $filled: function $filled() {
      return s(this.d_value);
    },
    $invalid: function $invalid() {
      var _this$$pcFormField, _this$$pcForm4;
      return !this.$formNovalidate && this.findNonEmpty(this.invalid, (_this$$pcFormField = this.$pcFormField) === null || _this$$pcFormField === void 0 || (_this$$pcFormField = _this$$pcFormField.$field) === null || _this$$pcFormField === void 0 ? void 0 : _this$$pcFormField.invalid, (_this$$pcForm4 = this.$pcForm) === null || _this$$pcForm4 === void 0 || (_this$$pcForm4 = _this$$pcForm4.getFieldState(this.$formName)) === null || _this$$pcForm4 === void 0 ? void 0 : _this$$pcForm4.invalid);
    },
    $formName: function $formName() {
      var _this$$formControl;
      return !this.$formNovalidate ? this.name || ((_this$$formControl = this.$formControl) === null || _this$$formControl === void 0 ? void 0 : _this$$formControl.name) : undefined;
    },
    $formControl: function $formControl() {
      var _this$$pcFormField2;
      return this.formControl || ((_this$$pcFormField2 = this.$pcFormField) === null || _this$$pcFormField2 === void 0 ? void 0 : _this$$pcFormField2.formControl);
    },
    $formNovalidate: function $formNovalidate() {
      var _this$$formControl2;
      return (_this$$formControl2 = this.$formControl) === null || _this$$formControl2 === void 0 ? void 0 : _this$$formControl2.novalidate;
    },
    $formDefaultValue: function $formDefaultValue() {
      var _this$$pcFormField3, _this$$pcForm5;
      return this.findNonEmpty(this.d_value, (_this$$pcFormField3 = this.$pcFormField) === null || _this$$pcFormField3 === void 0 ? void 0 : _this$$pcFormField3.initialValue, (_this$$pcForm5 = this.$pcForm) === null || _this$$pcForm5 === void 0 || (_this$$pcForm5 = _this$$pcForm5.initialValues) === null || _this$$pcForm5 === void 0 ? void 0 : _this$$pcForm5[this.$formName]);
    },
    $formValue: function $formValue() {
      var _this$$pcFormField4, _this$$pcForm6;
      return this.findNonEmpty((_this$$pcFormField4 = this.$pcFormField) === null || _this$$pcFormField4 === void 0 || (_this$$pcFormField4 = _this$$pcFormField4.$field) === null || _this$$pcFormField4 === void 0 ? void 0 : _this$$pcFormField4.value, (_this$$pcForm6 = this.$pcForm) === null || _this$$pcForm6 === void 0 || (_this$$pcForm6 = _this$$pcForm6.getFieldState(this.$formName)) === null || _this$$pcForm6 === void 0 ? void 0 : _this$$pcForm6.value);
    },
    controlled: function controlled() {
      return this.$inProps.hasOwnProperty('modelValue') || !this.$inProps.hasOwnProperty('modelValue') && !this.$inProps.hasOwnProperty('defaultValue');
    },
    // @deprecated use $filled instead
    filled: function filled() {
      return this.$filled;
    }
  }
};

var script$3 = {
  name: 'BaseInput',
  "extends": script$4,
  props: {
    size: {
      type: String,
      "default": null
    },
    fluid: {
      type: Boolean,
      "default": null
    },
    variant: {
      type: String,
      "default": null
    }
  },
  inject: {
    $parentInstance: {
      "default": undefined
    },
    $pcFluid: {
      "default": undefined
    }
  },
  computed: {
    $variant: function $variant() {
      var _this$variant;
      return (_this$variant = this.variant) !== null && _this$variant !== void 0 ? _this$variant : this.$primevue.config.inputStyle || this.$primevue.config.inputVariant;
    },
    $fluid: function $fluid() {
      var _this$fluid;
      return (_this$fluid = this.fluid) !== null && _this$fluid !== void 0 ? _this$fluid : !!this.$pcFluid;
    },
    // @deprecated use $fluid instead
    hasFluid: function hasFluid() {
      return this.$fluid;
    }
  }
};

var style$1="\n    .p-inputnumber {\n        display: inline-flex;\n        position: relative;\n    }\n\n    .p-inputnumber-button {\n        display: flex;\n        align-items: center;\n        justify-content: center;\n        flex: 0 0 auto;\n        cursor: pointer;\n        background: dt('inputnumber.button.background');\n        color: dt('inputnumber.button.color');\n        width: dt('inputnumber.button.width');\n        transition:\n            background dt('inputnumber.transition.duration'),\n            color dt('inputnumber.transition.duration'),\n            border-color dt('inputnumber.transition.duration'),\n            outline-color dt('inputnumber.transition.duration');\n    }\n\n    .p-inputnumber-button:disabled {\n        cursor: auto;\n    }\n\n    .p-inputnumber-button:not(:disabled):hover {\n        background: dt('inputnumber.button.hover.background');\n        color: dt('inputnumber.button.hover.color');\n    }\n\n    .p-inputnumber-button:not(:disabled):active {\n        background: dt('inputnumber.button.active.background');\n        color: dt('inputnumber.button.active.color');\n    }\n\n    .p-inputnumber-stacked .p-inputnumber-button {\n        position: relative;\n        flex: 1 1 auto;\n        border: 0 none;\n    }\n\n    .p-inputnumber-stacked .p-inputnumber-button-group {\n        display: flex;\n        flex-direction: column;\n        position: absolute;\n        inset-block-start: 1px;\n        inset-inline-end: 1px;\n        height: calc(100% - 2px);\n        z-index: 1;\n    }\n\n    .p-inputnumber-stacked .p-inputnumber-increment-button {\n        padding: 0;\n        border-start-end-radius: calc(dt('inputnumber.button.border.radius') - 1px);\n    }\n\n    .p-inputnumber-stacked .p-inputnumber-decrement-button {\n        padding: 0;\n        border-end-end-radius: calc(dt('inputnumber.button.border.radius') - 1px);\n    }\n\n    .p-inputnumber-stacked .p-inputnumber-input {\n        padding-inline-end: calc(dt('inputnumber.button.width') + dt('form.field.padding.x'));\n    }\n\n    .p-inputnumber-horizontal .p-inputnumber-button {\n        border: 1px solid dt('inputnumber.button.border.color');\n    }\n\n    .p-inputnumber-horizontal .p-inputnumber-button:hover {\n        border-color: dt('inputnumber.button.hover.border.color');\n    }\n\n    .p-inputnumber-horizontal .p-inputnumber-button:active {\n        border-color: dt('inputnumber.button.active.border.color');\n    }\n\n    .p-inputnumber-horizontal .p-inputnumber-increment-button {\n        order: 3;\n        border-start-end-radius: dt('inputnumber.button.border.radius');\n        border-end-end-radius: dt('inputnumber.button.border.radius');\n        border-inline-start: 0 none;\n    }\n\n    .p-inputnumber-horizontal .p-inputnumber-input {\n        order: 2;\n        border-radius: 0;\n    }\n\n    .p-inputnumber-horizontal .p-inputnumber-decrement-button {\n        order: 1;\n        border-start-start-radius: dt('inputnumber.button.border.radius');\n        border-end-start-radius: dt('inputnumber.button.border.radius');\n        border-inline-end: 0 none;\n    }\n\n    .p-floatlabel:has(.p-inputnumber-horizontal) label {\n        margin-inline-start: dt('inputnumber.button.width');\n    }\n\n    .p-inputnumber-vertical {\n        flex-direction: column;\n    }\n\n    .p-inputnumber-vertical .p-inputnumber-button {\n        border: 1px solid dt('inputnumber.button.border.color');\n        padding: dt('inputnumber.button.vertical.padding');\n    }\n\n    .p-inputnumber-vertical .p-inputnumber-button:hover {\n        border-color: dt('inputnumber.button.hover.border.color');\n    }\n\n    .p-inputnumber-vertical .p-inputnumber-button:active {\n        border-color: dt('inputnumber.button.active.border.color');\n    }\n\n    .p-inputnumber-vertical .p-inputnumber-increment-button {\n        order: 1;\n        border-start-start-radius: dt('inputnumber.button.border.radius');\n        border-start-end-radius: dt('inputnumber.button.border.radius');\n        width: 100%;\n        border-block-end: 0 none;\n    }\n\n    .p-inputnumber-vertical .p-inputnumber-input {\n        order: 2;\n        border-radius: 0;\n        text-align: center;\n    }\n\n    .p-inputnumber-vertical .p-inputnumber-decrement-button {\n        order: 3;\n        border-end-start-radius: dt('inputnumber.button.border.radius');\n        border-end-end-radius: dt('inputnumber.button.border.radius');\n        width: 100%;\n        border-block-start: 0 none;\n    }\n\n    .p-inputnumber-input {\n        flex: 1 1 auto;\n    }\n\n    .p-inputnumber-fluid {\n        width: 100%;\n    }\n\n    .p-inputnumber-fluid .p-inputnumber-input {\n        width: 1%;\n    }\n\n    .p-inputnumber-fluid.p-inputnumber-vertical .p-inputnumber-input {\n        width: 100%;\n    }\n\n    .p-inputnumber:has(.p-inputtext-sm) .p-inputnumber-button .p-icon {\n        font-size: dt('form.field.sm.font.size');\n        width: dt('form.field.sm.font.size');\n        height: dt('form.field.sm.font.size');\n    }\n\n    .p-inputnumber:has(.p-inputtext-lg) .p-inputnumber-button .p-icon {\n        font-size: dt('form.field.lg.font.size');\n        width: dt('form.field.lg.font.size');\n        height: dt('form.field.lg.font.size');\n    }\n\n    .p-inputnumber-clear-icon {\n        position: absolute;\n        top: 50%;\n        margin-top: -0.5rem;\n        cursor: pointer;\n        inset-inline-end: dt('form.field.padding.x');\n        color: dt('form.field.icon.color');\n    }\n\n    .p-inputnumber:has(.p-inputnumber-clear-icon) .p-inputnumber-input {\n        padding-inline-end: calc((dt('form.field.padding.x') * 2) + dt('icon.size'));\n    }\n\n    .p-inputnumber-stacked .p-inputnumber-clear-icon {\n        inset-inline-end: calc(dt('inputnumber.button.width') + dt('form.field.padding.x'));\n    }\n\n    .p-inputnumber-stacked:has(.p-inputnumber-clear-icon) .p-inputnumber-input {\n        padding-inline-end: calc(dt('inputnumber.button.width') + (dt('form.field.padding.x') * 2) + dt('icon.size'));\n    }\n\n    .p-inputnumber-horizontal .p-inputnumber-clear-icon {\n        inset-inline-end: calc(dt('inputnumber.button.width') + dt('form.field.padding.x'));\n    }\n";

var classes$1 = {
  root: function root(_ref) {
    var instance = _ref.instance,
      props = _ref.props;
    return ['p-inputnumber p-component p-inputwrapper', {
      'p-invalid': instance.$invalid,
      'p-inputwrapper-filled': instance.$filled || props.allowEmpty === false,
      'p-inputwrapper-focus': instance.focused,
      'p-inputnumber-stacked': props.showButtons && props.buttonLayout === 'stacked',
      'p-inputnumber-horizontal': props.showButtons && props.buttonLayout === 'horizontal',
      'p-inputnumber-vertical': props.showButtons && props.buttonLayout === 'vertical',
      'p-inputnumber-fluid': instance.$fluid
    }];
  },
  pcInputText: 'p-inputnumber-input',
  clearIcon: 'p-inputnumber-clear-icon',
  buttonGroup: 'p-inputnumber-button-group',
  incrementButton: function incrementButton(_ref2) {
    var instance = _ref2.instance,
      props = _ref2.props;
    return ['p-inputnumber-button p-inputnumber-increment-button', {
      'p-disabled': props.showButtons && props.max !== null && instance.maxBoundry()
    }];
  },
  decrementButton: function decrementButton(_ref3) {
    var instance = _ref3.instance,
      props = _ref3.props;
    return ['p-inputnumber-button p-inputnumber-decrement-button', {
      'p-disabled': props.showButtons && props.min !== null && instance.minBoundry()
    }];
  }
};
var InputNumberStyle = BaseStyle.extend({
  name: 'inputnumber',
  style: style$1,
  classes: classes$1
});

var script$1$1 = {
  name: 'BaseInputNumber',
  "extends": script$3,
  props: {
    format: {
      type: Boolean,
      "default": true
    },
    showButtons: {
      type: Boolean,
      "default": false
    },
    buttonLayout: {
      type: String,
      "default": 'stacked'
    },
    incrementButtonClass: {
      type: String,
      "default": null
    },
    decrementButtonClass: {
      type: String,
      "default": null
    },
    incrementButtonIcon: {
      type: String,
      "default": undefined
    },
    incrementIcon: {
      type: String,
      "default": undefined
    },
    decrementButtonIcon: {
      type: String,
      "default": undefined
    },
    decrementIcon: {
      type: String,
      "default": undefined
    },
    locale: {
      type: String,
      "default": undefined
    },
    localeMatcher: {
      type: String,
      "default": undefined
    },
    mode: {
      type: String,
      "default": 'decimal'
    },
    prefix: {
      type: String,
      "default": null
    },
    suffix: {
      type: String,
      "default": null
    },
    currency: {
      type: String,
      "default": undefined
    },
    currencyDisplay: {
      type: String,
      "default": undefined
    },
    useGrouping: {
      type: Boolean,
      "default": true
    },
    minFractionDigits: {
      type: Number,
      "default": undefined
    },
    maxFractionDigits: {
      type: Number,
      "default": undefined
    },
    roundingMode: {
      type: String,
      "default": 'halfExpand',
      validator: function validator(value) {
        return ['ceil', 'floor', 'expand', 'trunc', 'halfCeil', 'halfFloor', 'halfExpand', 'halfTrunc', 'halfEven'].includes(value);
      }
    },
    min: {
      type: Number,
      "default": null
    },
    max: {
      type: Number,
      "default": null
    },
    step: {
      type: Number,
      "default": 1
    },
    allowEmpty: {
      type: Boolean,
      "default": true
    },
    highlightOnFocus: {
      type: Boolean,
      "default": false
    },
    showClear: {
      type: Boolean,
      "default": false
    },
    readonly: {
      type: Boolean,
      "default": false
    },
    placeholder: {
      type: String,
      "default": null
    },
    inputId: {
      type: String,
      "default": null
    },
    inputClass: {
      type: [String, Object],
      "default": null
    },
    inputStyle: {
      type: Object,
      "default": null
    },
    ariaLabelledby: {
      type: String,
      "default": null
    },
    ariaLabel: {
      type: String,
      "default": null
    },
    required: {
      type: Boolean,
      "default": false
    }
  },
  style: InputNumberStyle,
  provide: function provide() {
    return {
      $pcInputNumber: this,
      $parentInstance: this
    };
  }
};

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), true).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: true, configurable: true, writable: true }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _toConsumableArray(r) { return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _iterableToArray(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles(r) { if (Array.isArray(r)) return _arrayLikeToArray(r); }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
var script$2 = {
  name: 'InputNumber',
  "extends": script$1$1,
  inheritAttrs: false,
  emits: ['input', 'focus', 'blur'],
  inject: {
    $pcFluid: {
      "default": null
    }
  },
  numberFormat: null,
  _numeral: null,
  _decimal: null,
  _group: null,
  _minusSign: null,
  _currency: null,
  _suffix: null,
  _prefix: null,
  _index: null,
  groupChar: '',
  isSpecialChar: null,
  prefixChar: null,
  suffixChar: null,
  timer: null,
  data: function data() {
    return {
      // @deprecated
      d_modelValue: this.d_value,
      focused: false
    };
  },
  watch: {
    d_value: {
      immediate: true,
      handler: function handler(newValue) {
        var _this$$refs$clearIcon;
        // @deprecated since v4.2.0
        this.d_modelValue = newValue;
        if ((_this$$refs$clearIcon = this.$refs.clearIcon) !== null && _this$$refs$clearIcon !== void 0 && (_this$$refs$clearIcon = _this$$refs$clearIcon.$el) !== null && _this$$refs$clearIcon !== void 0 && _this$$refs$clearIcon.style) {
          this.$refs.clearIcon.$el.style.display = l(newValue) ? 'none' : 'block';
        }
      }
    },
    locale: function locale(newValue, oldValue) {
      this.updateConstructParser(newValue, oldValue);
    },
    localeMatcher: function localeMatcher(newValue, oldValue) {
      this.updateConstructParser(newValue, oldValue);
    },
    mode: function mode(newValue, oldValue) {
      this.updateConstructParser(newValue, oldValue);
    },
    currency: function currency(newValue, oldValue) {
      this.updateConstructParser(newValue, oldValue);
    },
    currencyDisplay: function currencyDisplay(newValue, oldValue) {
      this.updateConstructParser(newValue, oldValue);
    },
    useGrouping: function useGrouping(newValue, oldValue) {
      this.updateConstructParser(newValue, oldValue);
    },
    minFractionDigits: function minFractionDigits(newValue, oldValue) {
      this.updateConstructParser(newValue, oldValue);
    },
    maxFractionDigits: function maxFractionDigits(newValue, oldValue) {
      this.updateConstructParser(newValue, oldValue);
    },
    suffix: function suffix(newValue, oldValue) {
      this.updateConstructParser(newValue, oldValue);
    },
    prefix: function prefix(newValue, oldValue) {
      this.updateConstructParser(newValue, oldValue);
    }
  },
  created: function created() {
    this.constructParser();
  },
  mounted: function mounted() {
    var _this$$refs$clearIcon2;
    if ((_this$$refs$clearIcon2 = this.$refs.clearIcon) !== null && _this$$refs$clearIcon2 !== void 0 && (_this$$refs$clearIcon2 = _this$$refs$clearIcon2.$el) !== null && _this$$refs$clearIcon2 !== void 0 && _this$$refs$clearIcon2.style) {
      this.$refs.clearIcon.$el.style.display = !this.$filled ? 'none' : 'block';
    }
  },
  methods: {
    getOptions: function getOptions() {
      return {
        localeMatcher: this.localeMatcher,
        style: this.mode,
        currency: this.currency,
        currencyDisplay: this.currencyDisplay,
        useGrouping: this.useGrouping,
        minimumFractionDigits: this.minFractionDigits,
        maximumFractionDigits: this.maxFractionDigits,
        roundingMode: this.roundingMode
      };
    },
    constructParser: function constructParser() {
      this.numberFormat = new Intl.NumberFormat(this.locale, this.getOptions());
      var numerals = _toConsumableArray(new Intl.NumberFormat(this.locale, {
        useGrouping: false
      }).format(9876543210)).reverse();
      var index = new Map(numerals.map(function (d, i) {
        return [d, i];
      }));
      this._numeral = new RegExp("[".concat(numerals.join(''), "]"), 'g');
      this._group = this.getGroupingExpression();
      this._minusSign = this.getMinusSignExpression();
      this._currency = this.getCurrencyExpression();
      this._decimal = this.getDecimalExpression();
      this._suffix = this.getSuffixExpression();
      this._prefix = this.getPrefixExpression();
      this._index = function (d) {
        return index.get(d);
      };
    },
    updateConstructParser: function updateConstructParser(newValue, oldValue) {
      if (newValue !== oldValue) {
        this.constructParser();
      }
    },
    escapeRegExp: function escapeRegExp(text) {
      return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    },
    getDecimalExpression: function getDecimalExpression() {
      var formatter = new Intl.NumberFormat(this.locale, _objectSpread(_objectSpread({}, this.getOptions()), {}, {
        useGrouping: false
      }));
      return new RegExp("[".concat(formatter.format(1.1).replace(this._currency, '').trim().replace(this._numeral, ''), "]"), 'g');
    },
    getGroupingExpression: function getGroupingExpression() {
      var formatter = new Intl.NumberFormat(this.locale, {
        useGrouping: true
      });
      this.groupChar = formatter.format(1000000).trim().replace(this._numeral, '').charAt(0);
      return new RegExp("[".concat(this.groupChar, "]"), 'g');
    },
    getMinusSignExpression: function getMinusSignExpression() {
      var formatter = new Intl.NumberFormat(this.locale, {
        useGrouping: false
      });
      return new RegExp("[".concat(formatter.format(-1).trim().replace(this._numeral, ''), "]"), 'g');
    },
    getCurrencyExpression: function getCurrencyExpression() {
      if (this.currency) {
        var formatter = new Intl.NumberFormat(this.locale, {
          style: 'currency',
          currency: this.currency,
          currencyDisplay: this.currencyDisplay,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
          roundingMode: this.roundingMode
        });
        return new RegExp("[".concat(formatter.format(1).replace(/\s/g, '').replace(this._numeral, '').replace(this._group, ''), "]"), 'g');
      }
      return new RegExp("[]", 'g');
    },
    getPrefixExpression: function getPrefixExpression() {
      if (this.prefix) {
        this.prefixChar = this.prefix;
      } else {
        var formatter = new Intl.NumberFormat(this.locale, {
          style: this.mode,
          currency: this.currency,
          currencyDisplay: this.currencyDisplay
        });
        this.prefixChar = formatter.format(1).split('1')[0];
      }
      return new RegExp("".concat(this.escapeRegExp(this.prefixChar || '')), 'g');
    },
    getSuffixExpression: function getSuffixExpression() {
      if (this.suffix) {
        this.suffixChar = this.suffix;
      } else {
        var formatter = new Intl.NumberFormat(this.locale, {
          style: this.mode,
          currency: this.currency,
          currencyDisplay: this.currencyDisplay,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
          roundingMode: this.roundingMode
        });
        this.suffixChar = formatter.format(1).split('1')[1];
      }
      return new RegExp("".concat(this.escapeRegExp(this.suffixChar || '')), 'g');
    },
    formatValue: function formatValue(value) {
      if (value != null) {
        if (value === '-') {
          // Minus sign
          return value;
        }
        if (this.format) {
          var formatter = new Intl.NumberFormat(this.locale, this.getOptions());
          var formattedValue = formatter.format(value);
          if (this.prefix) {
            formattedValue = this.prefix + formattedValue;
          }
          if (this.suffix) {
            formattedValue = formattedValue + this.suffix;
          }
          return formattedValue;
        }
        return value.toString();
      }
      return '';
    },
    parseValue: function parseValue(text) {
      var filteredText = text.replace(this._suffix, '').replace(this._prefix, '').trim().replace(/\s/g, '').replace(this._currency, '').replace(this._group, '').replace(this._minusSign, '-').replace(this._decimal, '.').replace(this._numeral, this._index);
      if (filteredText) {
        if (filteredText === '-')
          // Minus sign
          return filteredText;
        var parsedValue = +filteredText;
        return isNaN(parsedValue) ? null : parsedValue;
      }
      return null;
    },
    repeat: function repeat(event, interval, dir) {
      var _this = this;
      if (this.readonly) {
        return;
      }
      var i = interval || 500;
      this.clearTimer();
      this.timer = setTimeout(function () {
        _this.repeat(event, 40, dir);
      }, i);
      this.spin(event, dir);
    },
    addWithPrecision: function addWithPrecision(base, increment) {
      var baseStr = base.toString();
      var stepStr = increment.toString();
      var baseDecimalPlaces = baseStr.includes('.') ? baseStr.split('.')[1].length : 0;
      var stepDecimalPlaces = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;
      var maxDecimalPlaces = Math.max(baseDecimalPlaces, stepDecimalPlaces);
      var precision = Math.pow(10, maxDecimalPlaces);
      return Math.round((base + increment) * precision) / precision;
    },
    spin: function spin(event, dir) {
      if (this.$refs.input) {
        var step = this.step * dir;
        var currentValue = this.parseValue(this.$refs.input.$el.value) || 0;
        var newValue = this.validateValue(this.addWithPrecision(currentValue, step));
        this.updateInput(newValue, null, 'spin');
        this.updateModel(event, newValue);
        this.handleOnInput(event, currentValue, newValue);
      }
    },
    onUpButtonMouseDown: function onUpButtonMouseDown(event) {
      if (!this.disabled) {
        this.$refs.input.$el.focus();
        this.repeat(event, null, 1);
        event.preventDefault();
      }
    },
    onUpButtonMouseUp: function onUpButtonMouseUp() {
      if (!this.disabled) {
        this.clearTimer();
      }
    },
    onUpButtonMouseLeave: function onUpButtonMouseLeave() {
      if (!this.disabled) {
        this.clearTimer();
      }
    },
    onUpButtonKeyUp: function onUpButtonKeyUp() {
      if (!this.disabled) {
        this.clearTimer();
      }
    },
    onUpButtonKeyDown: function onUpButtonKeyDown(event) {
      if (event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter') {
        this.repeat(event, null, 1);
      }
    },
    onDownButtonMouseDown: function onDownButtonMouseDown(event) {
      if (!this.disabled) {
        this.$refs.input.$el.focus();
        this.repeat(event, null, -1);
        event.preventDefault();
      }
    },
    onDownButtonMouseUp: function onDownButtonMouseUp() {
      if (!this.disabled) {
        this.clearTimer();
      }
    },
    onDownButtonMouseLeave: function onDownButtonMouseLeave() {
      if (!this.disabled) {
        this.clearTimer();
      }
    },
    onDownButtonKeyUp: function onDownButtonKeyUp() {
      if (!this.disabled) {
        this.clearTimer();
      }
    },
    onDownButtonKeyDown: function onDownButtonKeyDown(event) {
      if (event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter') {
        this.repeat(event, null, -1);
      }
    },
    onUserInput: function onUserInput() {
      if (this.isSpecialChar) {
        this.$refs.input.$el.value = this.lastValue;
      }
      this.isSpecialChar = false;
    },
    onInputKeyDown: function onInputKeyDown(event) {
      if (this.readonly) {
        return;
      }

      // block composition input
      if (event.isComposing) {
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) {
        this.isSpecialChar = true;
        this.lastValue = this.$refs.input.$el.value;
        return;
      }
      this.lastValue = event.target.value;
      var selectionStart = event.target.selectionStart;
      var selectionEnd = event.target.selectionEnd;
      var selectionRange = selectionEnd - selectionStart;
      var inputValue = event.target.value;
      var newValueStr = null;
      var code = event.code || event.key;
      switch (code) {
        case 'ArrowUp':
          this.spin(event, 1);
          event.preventDefault();
          break;
        case 'ArrowDown':
          this.spin(event, -1);
          event.preventDefault();
          break;
        case 'ArrowLeft':
          if (selectionRange > 1) {
            var cursorPosition = this.isNumeralChar(inputValue.charAt(selectionStart)) ? selectionStart + 1 : selectionStart + 2;
            this.$refs.input.$el.setSelectionRange(cursorPosition, cursorPosition);
          } else if (!this.isNumeralChar(inputValue.charAt(selectionStart - 1))) {
            event.preventDefault();
          }
          break;
        case 'ArrowRight':
          if (selectionRange > 1) {
            var _cursorPosition = selectionEnd - 1;
            this.$refs.input.$el.setSelectionRange(_cursorPosition, _cursorPosition);
          } else if (!this.isNumeralChar(inputValue.charAt(selectionStart))) {
            event.preventDefault();
          }
          break;
        case 'Tab':
        case 'Enter':
        case 'NumpadEnter':
          newValueStr = this.validateValue(this.parseValue(inputValue));
          this.$refs.input.$el.value = this.formatValue(newValueStr);
          this.$refs.input.$el.setAttribute('aria-valuenow', newValueStr);
          this.updateModel(event, newValueStr);
          break;
        case 'Backspace':
          {
            event.preventDefault();
            if (selectionStart === selectionEnd) {
              if (selectionStart >= inputValue.length && this.suffixChar !== null) {
                selectionStart = inputValue.length - this.suffixChar.length;
                this.$refs.input.$el.setSelectionRange(selectionStart, selectionStart);
              }
              var deleteChar = inputValue.charAt(selectionStart - 1);
              var _this$getDecimalCharI = this.getDecimalCharIndexes(inputValue),
                decimalCharIndex = _this$getDecimalCharI.decimalCharIndex,
                decimalCharIndexWithoutPrefix = _this$getDecimalCharI.decimalCharIndexWithoutPrefix;
              if (this.isNumeralChar(deleteChar)) {
                var decimalLength = this.getDecimalLength(inputValue);
                if (this._group.test(deleteChar)) {
                  this._group.lastIndex = 0;
                  newValueStr = inputValue.slice(0, selectionStart - 2) + inputValue.slice(selectionStart - 1);
                } else if (this._decimal.test(deleteChar)) {
                  this._decimal.lastIndex = 0;
                  if (decimalLength) {
                    this.$refs.input.$el.setSelectionRange(selectionStart - 1, selectionStart - 1);
                  } else {
                    newValueStr = inputValue.slice(0, selectionStart - 1) + inputValue.slice(selectionStart);
                  }
                } else if (decimalCharIndex > 0 && selectionStart > decimalCharIndex) {
                  var insertedText = this.isDecimalMode() && (this.minFractionDigits || 0) < decimalLength ? '' : '0';
                  newValueStr = inputValue.slice(0, selectionStart - 1) + insertedText + inputValue.slice(selectionStart);
                } else if (decimalCharIndexWithoutPrefix === 1) {
                  newValueStr = inputValue.slice(0, selectionStart - 1) + '0' + inputValue.slice(selectionStart);
                  newValueStr = this.parseValue(newValueStr) > 0 ? newValueStr : '';
                } else {
                  newValueStr = inputValue.slice(0, selectionStart - 1) + inputValue.slice(selectionStart);
                }
              }
              this.updateValue(event, newValueStr, null, 'delete-single');
            } else {
              newValueStr = this.deleteRange(inputValue, selectionStart, selectionEnd);
              this.updateValue(event, newValueStr, null, 'delete-range');
            }
            break;
          }
        case 'Delete':
          event.preventDefault();
          if (selectionStart === selectionEnd) {
            var _deleteChar = inputValue.charAt(selectionStart);
            var _this$getDecimalCharI2 = this.getDecimalCharIndexes(inputValue),
              _decimalCharIndex = _this$getDecimalCharI2.decimalCharIndex,
              _decimalCharIndexWithoutPrefix = _this$getDecimalCharI2.decimalCharIndexWithoutPrefix;
            if (this.isNumeralChar(_deleteChar)) {
              var _decimalLength = this.getDecimalLength(inputValue);
              if (this._group.test(_deleteChar)) {
                this._group.lastIndex = 0;
                newValueStr = inputValue.slice(0, selectionStart) + inputValue.slice(selectionStart + 2);
              } else if (this._decimal.test(_deleteChar)) {
                this._decimal.lastIndex = 0;
                if (_decimalLength) {
                  this.$refs.input.$el.setSelectionRange(selectionStart + 1, selectionStart + 1);
                } else {
                  newValueStr = inputValue.slice(0, selectionStart) + inputValue.slice(selectionStart + 1);
                }
              } else if (_decimalCharIndex > 0 && selectionStart > _decimalCharIndex) {
                var _insertedText = this.isDecimalMode() && (this.minFractionDigits || 0) < _decimalLength ? '' : '0';
                newValueStr = inputValue.slice(0, selectionStart) + _insertedText + inputValue.slice(selectionStart + 1);
              } else if (_decimalCharIndexWithoutPrefix === 1) {
                newValueStr = inputValue.slice(0, selectionStart) + '0' + inputValue.slice(selectionStart + 1);
                newValueStr = this.parseValue(newValueStr) > 0 ? newValueStr : '';
              } else {
                newValueStr = inputValue.slice(0, selectionStart) + inputValue.slice(selectionStart + 1);
              }
            }
            this.updateValue(event, newValueStr, null, 'delete-back-single');
          } else {
            newValueStr = this.deleteRange(inputValue, selectionStart, selectionEnd);
            this.updateValue(event, newValueStr, null, 'delete-range');
          }
          break;
        case 'Home':
          event.preventDefault();
          if (s(this.min)) {
            this.updateModel(event, this.min);
          }
          break;
        case 'End':
          event.preventDefault();
          if (s(this.max)) {
            this.updateModel(event, this.max);
          }
          break;
      }
    },
    onInputKeyPress: function onInputKeyPress(event) {
      if (this.readonly) {
        return;
      }
      var _char = event.key;
      var isDecimalSign = this.isDecimalSign(_char);
      var isMinusSign = this.isMinusSign(_char);
      if (event.code !== 'Enter') {
        event.preventDefault();
      }
      if (Number(_char) >= 0 && Number(_char) <= 9 || isMinusSign || isDecimalSign) {
        this.insert(event, _char, {
          isDecimalSign: isDecimalSign,
          isMinusSign: isMinusSign
        });
      }
    },
    onPaste: function onPaste(event) {
      if (this.readonly) {
        return;
      }
      event.preventDefault();
      var data = (event.clipboardData || window['clipboardData']).getData('Text');
      if (this.inputId === 'integeronly' && /[^\d-]/.test(data)) {
        return;
      }
      if (data) {
        var filteredData = this.parseValue(data);
        if (filteredData != null) {
          this.insert(event, filteredData.toString());
        }
      }
    },
    onClearClick: function onClearClick(event) {
      this.updateModel(event, null);
      this.$refs.input.$el.focus();
    },
    allowMinusSign: function allowMinusSign() {
      return this.min === null || this.min < 0;
    },
    isMinusSign: function isMinusSign(_char2) {
      if (this._minusSign.test(_char2) || _char2 === '-') {
        this._minusSign.lastIndex = 0;
        return true;
      }
      return false;
    },
    isDecimalSign: function isDecimalSign(_char3) {
      var _this$locale;
      if ((_this$locale = this.locale) !== null && _this$locale !== void 0 && _this$locale.includes('fr') && ['.', ','].includes(_char3) || this._decimal.test(_char3)) {
        this._decimal.lastIndex = 0;
        return true;
      }
      return false;
    },
    isDecimalMode: function isDecimalMode() {
      return this.mode === 'decimal';
    },
    getDecimalCharIndexes: function getDecimalCharIndexes(val) {
      var decimalCharIndex = val.search(this._decimal);
      this._decimal.lastIndex = 0;
      var filteredVal = val.replace(this._prefix, '').trim().replace(/\s/g, '').replace(this._currency, '');
      var decimalCharIndexWithoutPrefix = filteredVal.search(this._decimal);
      this._decimal.lastIndex = 0;
      return {
        decimalCharIndex: decimalCharIndex,
        decimalCharIndexWithoutPrefix: decimalCharIndexWithoutPrefix
      };
    },
    getCharIndexes: function getCharIndexes(val) {
      var decimalCharIndex = val.search(this._decimal);
      this._decimal.lastIndex = 0;
      var minusCharIndex = val.search(this._minusSign);
      this._minusSign.lastIndex = 0;
      var suffixCharIndex = val.search(this._suffix);
      this._suffix.lastIndex = 0;
      var currencyCharIndex = val.search(this._currency);
      this._currency.lastIndex = 0;
      return {
        decimalCharIndex: decimalCharIndex,
        minusCharIndex: minusCharIndex,
        suffixCharIndex: suffixCharIndex,
        currencyCharIndex: currencyCharIndex
      };
    },
    insert: function insert(event, text) {
      var sign = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {
        isDecimalSign: false,
        isMinusSign: false
      };
      var minusCharIndexOnText = text.search(this._minusSign);
      this._minusSign.lastIndex = 0;
      if (!this.allowMinusSign() && minusCharIndexOnText !== -1) {
        return;
      }
      var selectionStart = this.$refs.input.$el.selectionStart;
      var selectionEnd = this.$refs.input.$el.selectionEnd;
      var inputValue = this.$refs.input.$el.value.trim();
      var _this$getCharIndexes = this.getCharIndexes(inputValue),
        decimalCharIndex = _this$getCharIndexes.decimalCharIndex,
        minusCharIndex = _this$getCharIndexes.minusCharIndex,
        suffixCharIndex = _this$getCharIndexes.suffixCharIndex,
        currencyCharIndex = _this$getCharIndexes.currencyCharIndex;
      var newValueStr;
      if (sign.isMinusSign) {
        var isNewMinusSign = minusCharIndex === -1;
        if (selectionStart === 0 || selectionStart === currencyCharIndex + 1) {
          newValueStr = inputValue;
          if (isNewMinusSign || selectionEnd !== 0) {
            newValueStr = this.insertText(inputValue, text, 0, selectionEnd);
          }
          this.updateValue(event, newValueStr, text, 'insert');
        }
      } else if (sign.isDecimalSign) {
        if (decimalCharIndex > 0 && selectionStart === decimalCharIndex) {
          this.updateValue(event, inputValue, text, 'insert');
        } else if (decimalCharIndex > selectionStart && decimalCharIndex < selectionEnd) {
          newValueStr = this.insertText(inputValue, text, selectionStart, selectionEnd);
          this.updateValue(event, newValueStr, text, 'insert');
        } else if (decimalCharIndex === -1 && this.maxFractionDigits) {
          newValueStr = this.insertText(inputValue, text, selectionStart, selectionEnd);
          this.updateValue(event, newValueStr, text, 'insert');
        }
      } else {
        var maxFractionDigits = this.numberFormat.resolvedOptions().maximumFractionDigits;
        var operation = selectionStart !== selectionEnd ? 'range-insert' : 'insert';
        if (decimalCharIndex > 0 && selectionStart > decimalCharIndex) {
          if (selectionStart + text.length - (decimalCharIndex + 1) <= maxFractionDigits) {
            var charIndex = currencyCharIndex >= selectionStart ? currencyCharIndex - 1 : suffixCharIndex >= selectionStart ? suffixCharIndex : inputValue.length;
            newValueStr = inputValue.slice(0, selectionStart) + text + inputValue.slice(selectionStart + text.length, charIndex) + inputValue.slice(charIndex);
            this.updateValue(event, newValueStr, text, operation);
          }
        } else {
          newValueStr = this.insertText(inputValue, text, selectionStart, selectionEnd);
          this.updateValue(event, newValueStr, text, operation);
        }
      }
    },
    insertText: function insertText(value, text, start, end) {
      var textSplit = text === '.' ? text : text.split('.');
      if (textSplit.length === 2) {
        var decimalCharIndex = value.slice(start, end).search(this._decimal);
        this._decimal.lastIndex = 0;
        return decimalCharIndex > 0 ? value.slice(0, start) + this.formatValue(text) + value.slice(end) : this.formatValue(text) || value;
      } else if (end - start === value.length) {
        return this.formatValue(text);
      } else if (start === 0) {
        return text + value.slice(end);
      } else if (end === value.length) {
        return value.slice(0, start) + text;
      } else {
        return value.slice(0, start) + text + value.slice(end);
      }
    },
    deleteRange: function deleteRange(value, start, end) {
      var newValueStr;
      if (end - start === value.length) newValueStr = '';else if (start === 0) newValueStr = value.slice(end);else if (end === value.length) newValueStr = value.slice(0, start);else newValueStr = value.slice(0, start) + value.slice(end);
      return newValueStr;
    },
    initCursor: function initCursor() {
      var selectionStart = this.$refs.input.$el.selectionStart;
      var inputValue = this.$refs.input.$el.value;
      var valueLength = inputValue.length;
      var index = null;

      // remove prefix
      var prefixLength = (this.prefixChar || '').length;
      inputValue = inputValue.replace(this._prefix, '');
      selectionStart = selectionStart - prefixLength;
      var _char4 = inputValue.charAt(selectionStart);
      if (this.isNumeralChar(_char4)) {
        return selectionStart + prefixLength;
      }

      //left
      var i = selectionStart - 1;
      while (i >= 0) {
        _char4 = inputValue.charAt(i);
        if (this.isNumeralChar(_char4)) {
          index = i + prefixLength;
          break;
        } else {
          i--;
        }
      }
      if (index !== null) {
        this.$refs.input.$el.setSelectionRange(index + 1, index + 1);
      } else {
        i = selectionStart;
        while (i < valueLength) {
          _char4 = inputValue.charAt(i);
          if (this.isNumeralChar(_char4)) {
            index = i + prefixLength;
            break;
          } else {
            i++;
          }
        }
        if (index !== null) {
          this.$refs.input.$el.setSelectionRange(index, index);
        }
      }
      return index || 0;
    },
    onInputClick: function onInputClick() {
      var currentValue = this.$refs.input.$el.value;
      if (!this.readonly && currentValue !== Mt()) {
        this.initCursor();
      }
    },
    isNumeralChar: function isNumeralChar(_char5) {
      if (_char5.length === 1 && (this._numeral.test(_char5) || this._decimal.test(_char5) || this._group.test(_char5) || this._minusSign.test(_char5))) {
        this.resetRegex();
        return true;
      }
      return false;
    },
    resetRegex: function resetRegex() {
      this._numeral.lastIndex = 0;
      this._decimal.lastIndex = 0;
      this._group.lastIndex = 0;
      this._minusSign.lastIndex = 0;
    },
    updateValue: function updateValue(event, valueStr, insertedValueStr, operation) {
      var currentValue = this.$refs.input.$el.value;
      var newValue = null;
      if (valueStr != null) {
        newValue = this.parseValue(valueStr);
        newValue = !newValue && !this.allowEmpty ? 0 : newValue;
        this.updateInput(newValue, insertedValueStr, operation, valueStr);
        this.handleOnInput(event, currentValue, newValue);
      }
    },
    handleOnInput: function handleOnInput(event, currentValue, newValue) {
      if (this.isValueChanged(currentValue, newValue)) {
        var _this$formField$onInp, _this$formField;
        this.$emit('input', {
          originalEvent: event,
          value: newValue,
          formattedValue: currentValue
        });
        (_this$formField$onInp = (_this$formField = this.formField).onInput) === null || _this$formField$onInp === void 0 || _this$formField$onInp.call(_this$formField, {
          originalEvent: event,
          value: newValue
        });
      }
    },
    isValueChanged: function isValueChanged(currentValue, newValue) {
      if (newValue === null && currentValue !== null) {
        return true;
      }
      if (newValue != null) {
        var parsedCurrentValue = typeof currentValue === 'string' ? this.parseValue(currentValue) : currentValue;
        return newValue !== parsedCurrentValue;
      }
      return false;
    },
    validateValue: function validateValue(value) {
      if (value === '-' || value == null) {
        return null;
      }
      if (this.min != null && value < this.min) {
        return this.min;
      }
      if (this.max != null && value > this.max) {
        return this.max;
      }
      return value;
    },
    updateInput: function updateInput(value, insertedValueStr, operation, valueStr) {
      var _this$$refs$clearIcon3;
      insertedValueStr = insertedValueStr || '';
      var inputValue = this.$refs.input.$el.value;
      var newValue = this.formatValue(value);
      var currentLength = inputValue.length;
      if (newValue !== valueStr) {
        newValue = this.concatValues(newValue, valueStr);
      }
      if (currentLength === 0) {
        this.$refs.input.$el.value = newValue;
        this.$refs.input.$el.setSelectionRange(0, 0);
        var index = this.initCursor();
        var selectionEnd = index + insertedValueStr.length;
        this.$refs.input.$el.setSelectionRange(selectionEnd, selectionEnd);
      } else {
        var selectionStart = this.$refs.input.$el.selectionStart;
        var _selectionEnd = this.$refs.input.$el.selectionEnd;
        this.$refs.input.$el.value = newValue;
        var newLength = newValue.length;
        if (operation === 'range-insert') {
          var startValue = this.parseValue((inputValue || '').slice(0, selectionStart));
          var startValueStr = startValue !== null ? startValue.toString() : '';
          var startExpr = startValueStr.split('').join("(".concat(this.groupChar, ")?"));
          var sRegex = new RegExp(startExpr, 'g');
          sRegex.test(newValue);
          var tExpr = insertedValueStr.split('').join("(".concat(this.groupChar, ")?"));
          var tRegex = new RegExp(tExpr, 'g');
          tRegex.test(newValue.slice(sRegex.lastIndex));
          _selectionEnd = sRegex.lastIndex + tRegex.lastIndex;
          this.$refs.input.$el.setSelectionRange(_selectionEnd, _selectionEnd);
        } else if (newLength === currentLength) {
          if (operation === 'insert' || operation === 'delete-back-single') {
            this.$refs.input.$el.setSelectionRange(_selectionEnd + 1, _selectionEnd + 1);
          } else if (operation === 'delete-single') {
            this.$refs.input.$el.setSelectionRange(_selectionEnd - 1, _selectionEnd - 1);
          } else if (operation === 'delete-range' || operation === 'spin') {
            this.$refs.input.$el.setSelectionRange(_selectionEnd, _selectionEnd);
          }
        } else if (operation === 'delete-back-single') {
          var prevChar = inputValue.charAt(_selectionEnd - 1);
          var nextChar = inputValue.charAt(_selectionEnd);
          var diff = currentLength - newLength;
          var isGroupChar = this._group.test(nextChar);
          if (isGroupChar && diff === 1) {
            _selectionEnd += 1;
          } else if (!isGroupChar && this.isNumeralChar(prevChar)) {
            _selectionEnd += -1 * diff + 1;
          }
          this._group.lastIndex = 0;
          this.$refs.input.$el.setSelectionRange(_selectionEnd, _selectionEnd);
        } else if (inputValue === '-' && operation === 'insert') {
          this.$refs.input.$el.setSelectionRange(0, 0);
          var _index = this.initCursor();
          var _selectionEnd2 = _index + insertedValueStr.length + 1;
          this.$refs.input.$el.setSelectionRange(_selectionEnd2, _selectionEnd2);
        } else {
          _selectionEnd = _selectionEnd + (newLength - currentLength);
          this.$refs.input.$el.setSelectionRange(_selectionEnd, _selectionEnd);
        }
      }
      this.$refs.input.$el.setAttribute('aria-valuenow', value);
      if ((_this$$refs$clearIcon3 = this.$refs.clearIcon) !== null && _this$$refs$clearIcon3 !== void 0 && (_this$$refs$clearIcon3 = _this$$refs$clearIcon3.$el) !== null && _this$$refs$clearIcon3 !== void 0 && _this$$refs$clearIcon3.style) {
        this.$refs.clearIcon.$el.style.display = l(newValue) ? 'none' : 'block';
      }
    },
    concatValues: function concatValues(val1, val2) {
      if (val1 && val2) {
        var decimalCharIndex = val2.search(this._decimal);
        this._decimal.lastIndex = 0;
        if (this.suffixChar) {
          return decimalCharIndex !== -1 ? val1.replace(this.suffixChar, '').split(this._decimal)[0] + val2.replace(this.suffixChar, '').slice(decimalCharIndex) + this.suffixChar : val1;
        } else {
          return decimalCharIndex !== -1 ? val1.split(this._decimal)[0] + val2.slice(decimalCharIndex) : val1;
        }
      }
      return val1;
    },
    getDecimalLength: function getDecimalLength(value) {
      if (value) {
        var valueSplit = value.split(this._decimal);
        if (valueSplit.length === 2) {
          return valueSplit[1].replace(this._suffix, '').trim().replace(/\s/g, '').replace(this._currency, '').length;
        }
      }
      return 0;
    },
    updateModel: function updateModel(event, value) {
      this.writeValue(value, event);
    },
    onInputFocus: function onInputFocus(event) {
      this.focused = true;
      if (!this.disabled && !this.readonly && this.$refs.input.$el.value !== Mt() && this.highlightOnFocus) {
        event.target.select();
      }
      this.$emit('focus', event);
    },
    onInputBlur: function onInputBlur(event) {
      var _this$formField$onBlu, _this$formField2;
      this.focused = false;
      var input = event.target;
      var newValue = this.validateValue(this.parseValue(input.value));
      this.$emit('blur', {
        originalEvent: event,
        value: input.value
      });
      (_this$formField$onBlu = (_this$formField2 = this.formField).onBlur) === null || _this$formField$onBlu === void 0 || _this$formField$onBlu.call(_this$formField2, event);
      input.value = this.formatValue(newValue);
      input.setAttribute('aria-valuenow', newValue);
      this.updateModel(event, newValue);
      if (!this.disabled && !this.readonly && this.highlightOnFocus) {
        pt();
      }
    },
    clearTimer: function clearTimer() {
      if (this.timer) {
        clearTimeout(this.timer);
      }
    },
    maxBoundry: function maxBoundry() {
      return this.d_value >= this.max;
    },
    minBoundry: function minBoundry() {
      return this.d_value <= this.min;
    }
  },
  computed: {
    upButtonListeners: function upButtonListeners() {
      var _this2 = this;
      return {
        mousedown: function mousedown(event) {
          return _this2.onUpButtonMouseDown(event);
        },
        mouseup: function mouseup(event) {
          return _this2.onUpButtonMouseUp(event);
        },
        mouseleave: function mouseleave(event) {
          return _this2.onUpButtonMouseLeave(event);
        },
        keydown: function keydown(event) {
          return _this2.onUpButtonKeyDown(event);
        },
        keyup: function keyup(event) {
          return _this2.onUpButtonKeyUp(event);
        }
      };
    },
    downButtonListeners: function downButtonListeners() {
      var _this3 = this;
      return {
        mousedown: function mousedown(event) {
          return _this3.onDownButtonMouseDown(event);
        },
        mouseup: function mouseup(event) {
          return _this3.onDownButtonMouseUp(event);
        },
        mouseleave: function mouseleave(event) {
          return _this3.onDownButtonMouseLeave(event);
        },
        keydown: function keydown(event) {
          return _this3.onDownButtonKeyDown(event);
        },
        keyup: function keyup(event) {
          return _this3.onDownButtonKeyUp(event);
        }
      };
    },
    formattedValue: function formattedValue() {
      var val = !this.d_value && !this.allowEmpty ? 0 : this.d_value;
      return this.formatValue(val);
    },
    getFormatter: function getFormatter() {
      return this.numberFormat;
    },
    dataP: function dataP() {
      return f(_defineProperty(_defineProperty({
        invalid: this.$invalid,
        fluid: this.$fluid,
        filled: this.$variant === 'filled'
      }, this.size, this.size), this.buttonLayout, this.showButtons && this.buttonLayout));
    }
  },
  components: {
    InputText: InputText,
    AngleUpIcon: script$6,
    AngleDownIcon: script$7,
    TimesIcon: script$5
  }
};

var _hoisted_1$3 = ["data-p"];
var _hoisted_2$2 = ["data-p"];
var _hoisted_3$2 = ["disabled", "data-p"];
var _hoisted_4$2 = ["disabled", "data-p"];
var _hoisted_5$2 = ["disabled", "data-p"];
var _hoisted_6$2 = ["disabled", "data-p"];
function render$1(_ctx, _cache, $props, $setup, $data, $options) {
  var _component_InputText = resolveComponent("InputText");
  var _component_TimesIcon = resolveComponent("TimesIcon");
  return openBlock(), createElementBlock("span", mergeProps({
    "class": _ctx.cx('root')
  }, _ctx.ptmi('root'), {
    "data-p": $options.dataP
  }), [createVNode(_component_InputText, {
    ref: "input",
    id: _ctx.inputId,
    name: _ctx.$formName,
    role: "spinbutton",
    "class": normalizeClass([_ctx.cx('pcInputText'), _ctx.inputClass]),
    style: normalizeStyle(_ctx.inputStyle),
    defaultValue: $options.formattedValue,
    "aria-valuemin": _ctx.min,
    "aria-valuemax": _ctx.max,
    "aria-valuenow": _ctx.d_value,
    inputmode: _ctx.mode === 'decimal' && !_ctx.minFractionDigits ? 'numeric' : 'decimal',
    disabled: _ctx.disabled,
    readonly: _ctx.readonly,
    placeholder: _ctx.placeholder,
    "aria-labelledby": _ctx.ariaLabelledby,
    "aria-label": _ctx.ariaLabel,
    required: _ctx.required,
    size: _ctx.size,
    invalid: _ctx.invalid,
    variant: _ctx.variant,
    onInput: $options.onUserInput,
    onKeydown: $options.onInputKeyDown,
    onKeypress: $options.onInputKeyPress,
    onPaste: $options.onPaste,
    onClick: $options.onInputClick,
    onFocus: $options.onInputFocus,
    onBlur: $options.onInputBlur,
    pt: _ctx.ptm('pcInputText'),
    unstyled: _ctx.unstyled,
    "data-p": $options.dataP
  }, null, 8, ["id", "name", "class", "style", "defaultValue", "aria-valuemin", "aria-valuemax", "aria-valuenow", "inputmode", "disabled", "readonly", "placeholder", "aria-labelledby", "aria-label", "required", "size", "invalid", "variant", "onInput", "onKeydown", "onKeypress", "onPaste", "onClick", "onFocus", "onBlur", "pt", "unstyled", "data-p"]), _ctx.showClear && _ctx.buttonLayout !== 'vertical' ? renderSlot(_ctx.$slots, "clearicon", {
    key: 0,
    "class": normalizeClass(_ctx.cx('clearIcon')),
    clearCallback: $options.onClearClick
  }, function () {
    return [createVNode(_component_TimesIcon, mergeProps({
      ref: "clearIcon",
      "class": [_ctx.cx('clearIcon')],
      onClick: $options.onClearClick
    }, _ctx.ptm('clearIcon')), null, 16, ["class", "onClick"])];
  }) : createCommentVNode("", true), _ctx.showButtons && _ctx.buttonLayout === 'stacked' ? (openBlock(), createElementBlock("span", mergeProps({
    key: 1,
    "class": _ctx.cx('buttonGroup')
  }, _ctx.ptm('buttonGroup'), {
    "data-p": $options.dataP
  }), [renderSlot(_ctx.$slots, "incrementbutton", {
    listeners: $options.upButtonListeners
  }, function () {
    return [createElementVNode("button", mergeProps({
      "class": [_ctx.cx('incrementButton'), _ctx.incrementButtonClass]
    }, toHandlers($options.upButtonListeners, true), {
      disabled: _ctx.disabled,
      tabindex: -1,
      "aria-hidden": "true",
      type: "button"
    }, _ctx.ptm('incrementButton'), {
      "data-p": $options.dataP
    }), [renderSlot(_ctx.$slots, _ctx.$slots.incrementicon ? 'incrementicon' : 'incrementbuttonicon', {}, function () {
      return [(openBlock(), createBlock(resolveDynamicComponent(_ctx.incrementIcon || _ctx.incrementButtonIcon ? 'span' : 'AngleUpIcon'), mergeProps({
        "class": [_ctx.incrementIcon, _ctx.incrementButtonIcon]
      }, _ctx.ptm('incrementIcon'), {
        "data-pc-section": "incrementicon"
      }), null, 16, ["class"]))];
    })], 16, _hoisted_3$2)];
  }), renderSlot(_ctx.$slots, "decrementbutton", {
    listeners: $options.downButtonListeners
  }, function () {
    return [createElementVNode("button", mergeProps({
      "class": [_ctx.cx('decrementButton'), _ctx.decrementButtonClass]
    }, toHandlers($options.downButtonListeners, true), {
      disabled: _ctx.disabled,
      tabindex: -1,
      "aria-hidden": "true",
      type: "button"
    }, _ctx.ptm('decrementButton'), {
      "data-p": $options.dataP
    }), [renderSlot(_ctx.$slots, _ctx.$slots.decrementicon ? 'decrementicon' : 'decrementbuttonicon', {}, function () {
      return [(openBlock(), createBlock(resolveDynamicComponent(_ctx.decrementIcon || _ctx.decrementButtonIcon ? 'span' : 'AngleDownIcon'), mergeProps({
        "class": [_ctx.decrementIcon, _ctx.decrementButtonIcon]
      }, _ctx.ptm('decrementIcon'), {
        "data-pc-section": "decrementicon"
      }), null, 16, ["class"]))];
    })], 16, _hoisted_4$2)];
  })], 16, _hoisted_2$2)) : createCommentVNode("", true), renderSlot(_ctx.$slots, "incrementbutton", {
    listeners: $options.upButtonListeners
  }, function () {
    return [_ctx.showButtons && _ctx.buttonLayout !== 'stacked' ? (openBlock(), createElementBlock("button", mergeProps({
      key: 0,
      "class": [_ctx.cx('incrementButton'), _ctx.incrementButtonClass]
    }, toHandlers($options.upButtonListeners, true), {
      disabled: _ctx.disabled,
      tabindex: -1,
      "aria-hidden": "true",
      type: "button"
    }, _ctx.ptm('incrementButton'), {
      "data-p": $options.dataP
    }), [renderSlot(_ctx.$slots, _ctx.$slots.incrementicon ? 'incrementicon' : 'incrementbuttonicon', {}, function () {
      return [(openBlock(), createBlock(resolveDynamicComponent(_ctx.incrementIcon || _ctx.incrementButtonIcon ? 'span' : 'AngleUpIcon'), mergeProps({
        "class": [_ctx.incrementIcon, _ctx.incrementButtonIcon]
      }, _ctx.ptm('incrementIcon'), {
        "data-pc-section": "incrementicon"
      }), null, 16, ["class"]))];
    })], 16, _hoisted_5$2)) : createCommentVNode("", true)];
  }), renderSlot(_ctx.$slots, "decrementbutton", {
    listeners: $options.downButtonListeners
  }, function () {
    return [_ctx.showButtons && _ctx.buttonLayout !== 'stacked' ? (openBlock(), createElementBlock("button", mergeProps({
      key: 0,
      "class": [_ctx.cx('decrementButton'), _ctx.decrementButtonClass]
    }, toHandlers($options.downButtonListeners, true), {
      disabled: _ctx.disabled,
      tabindex: -1,
      "aria-hidden": "true",
      type: "button"
    }, _ctx.ptm('decrementButton'), {
      "data-p": $options.dataP
    }), [renderSlot(_ctx.$slots, _ctx.$slots.decrementicon ? 'decrementicon' : 'decrementbuttonicon', {}, function () {
      return [(openBlock(), createBlock(resolveDynamicComponent(_ctx.decrementIcon || _ctx.decrementButtonIcon ? 'span' : 'AngleDownIcon'), mergeProps({
        "class": [_ctx.decrementIcon, _ctx.decrementButtonIcon]
      }, _ctx.ptm('decrementIcon'), {
        "data-pc-section": "decrementicon"
      }), null, 16, ["class"]))];
    })], 16, _hoisted_6$2)) : createCommentVNode("", true)];
  })], 16, _hoisted_1$3);
}

script$2.render = render$1;

const _hoisted_1$2 = { class: "metamodeler-editor" };
const _hoisted_2$1 = { class: "editor-header" };
const _hoisted_3$1 = {
  key: 0,
  class: "dirty-indicator"
};
const _hoisted_4$1 = {
  key: 0,
  class: "empty-state"
};
const _hoisted_5$1 = {
  key: 1,
  class: "editor-content"
};
const _hoisted_6$1 = { class: "editor-section" };
const _hoisted_7$1 = { class: "field" };
const _hoisted_8$1 = { class: "field" };
const _hoisted_9 = { class: "field" };
const _hoisted_10 = {
  key: 2,
  class: "editor-content"
};
const _hoisted_11 = { class: "editor-section" };
const _hoisted_12 = { class: "field" };
const _hoisted_13 = { class: "field-checkbox" };
const _hoisted_14 = { class: "field-checkbox" };
const _hoisted_15 = { class: "field" };
const _hoisted_16 = { class: "hint" };
const _hoisted_17 = { class: "editor-actions" };
const _hoisted_18 = {
  key: 3,
  class: "editor-content"
};
const _hoisted_19 = { class: "editor-section" };
const _hoisted_20 = { class: "field" };
const _hoisted_21 = { class: "field" };
const _hoisted_22 = { class: "field-row" };
const _hoisted_23 = { class: "field" };
const _hoisted_24 = { class: "field" };
const _hoisted_25 = { class: "field-checkbox" };
const _hoisted_26 = { class: "editor-actions" };
const _hoisted_27 = {
  key: 4,
  class: "editor-content"
};
const _hoisted_28 = { class: "editor-section" };
const _hoisted_29 = { class: "field" };
const _hoisted_30 = { class: "field" };
const _hoisted_31 = { class: "field-row" };
const _hoisted_32 = { class: "field" };
const _hoisted_33 = { class: "field" };
const _hoisted_34 = { class: "field-checkbox" };
const _hoisted_35 = { class: "editor-actions" };
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "MetamodelerEditor",
  setup(__props) {
    const metamodeler = useSharedMetamodeler();
    const elementType = computed(() => {
      const el = metamodeler.selectedElement.value;
      if (!el) return "none";
      if ("getNsURI" in el && "getEClassifiers" in el) return "package";
      if ("isAbstract" in el && "isInterface" in el && "getEAttributes" in el) return "class";
      if ("getEAttributeType" in el) return "attribute";
      if ("getEReferenceType" in el && "isContainment" in el) return "reference";
      return "none";
    });
    const pkgName = ref("");
    const pkgNsURI = ref("");
    const pkgNsPrefix = ref("");
    const className = ref("");
    const classAbstract = ref(false);
    const classInterface = ref(false);
    const attrName = ref("");
    const attrType = ref("");
    const attrLowerBound = ref(0);
    const attrUpperBound = ref(1);
    const attrDerived = ref(false);
    const refName = ref("");
    const refType = ref("");
    const refLowerBound = ref(0);
    const refUpperBound = ref(1);
    const refContainment = ref(false);
    const dataTypes = [
      { label: "EString", value: "EString" },
      { label: "EInt", value: "EInt" },
      { label: "EBoolean", value: "EBoolean" },
      { label: "EDouble", value: "EDouble" },
      { label: "EFloat", value: "EFloat" },
      { label: "ELong", value: "ELong" },
      { label: "EDate", value: "EDate" },
      { label: "EBigDecimal", value: "EBigDecimal" },
      { label: "EBigInteger", value: "EBigInteger" }
    ];
    watch(() => metamodeler.selectedElement.value, (el) => {
      if (!el) return;
      if (elementType.value === "package") {
        const pkg = el;
        pkgName.value = pkg.getName() || "";
        pkgNsURI.value = pkg.getNsURI() || "";
        pkgNsPrefix.value = pkg.getNsPrefix() || "";
      } else if (elementType.value === "class") {
        const eClass = el;
        className.value = eClass.getName() || "";
        classAbstract.value = eClass.isAbstract();
        classInterface.value = eClass.isInterface();
      } else if (elementType.value === "attribute") {
        const attr = el;
        attrName.value = attr.getName() || "";
        attrType.value = attr.getEAttributeType()?.getName() || "EString";
        attrLowerBound.value = attr.getLowerBound();
        attrUpperBound.value = attr.getUpperBound();
        attrDerived.value = attr.isDerived();
      } else if (elementType.value === "reference") {
        const ref2 = el;
        refName.value = ref2.getName() || "";
        try {
          refType.value = ref2.getEReferenceType()?.getName() || "";
        } catch {
          refType.value = "";
        }
        refLowerBound.value = ref2.getLowerBound();
        refUpperBound.value = ref2.getUpperBound();
        refContainment.value = ref2.isContainment();
      }
    }, { immediate: true });
    function savePackage() {
      const pkg = metamodeler.selectedElement.value;
      if (!pkg) return;
      pkg.setName(pkgName.value);
      pkg.setNsURI(pkgNsURI.value);
      pkg.setNsPrefix(pkgNsPrefix.value);
      metamodeler.dirty.value = true;
    }
    function saveClass() {
      const eClass = metamodeler.selectedElement.value;
      if (!eClass) return;
      metamodeler.updateClass(eClass, {
        name: className.value,
        isAbstract: classAbstract.value,
        isInterface: classInterface.value
      });
    }
    function saveAttribute() {
      const attr = metamodeler.selectedElement.value;
      if (!attr) return;
      metamodeler.updateAttribute(attr, {
        name: attrName.value,
        lowerBound: attrLowerBound.value,
        upperBound: attrUpperBound.value
      });
    }
    function saveReference() {
      const ref2 = metamodeler.selectedElement.value;
      if (!ref2) return;
      metamodeler.updateReference(ref2, {
        name: refName.value,
        lowerBound: refLowerBound.value,
        upperBound: refUpperBound.value,
        isContainment: refContainment.value
      });
    }
    function deleteElement() {
      const el = metamodeler.selectedElement.value;
      if (el) {
        metamodeler.deleteElement(el);
      }
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$2, [
        createElementVNode("div", _hoisted_2$1, [
          _cache[16] || (_cache[16] = createElementVNode("span", { class: "header-title" }, "Properties", -1)),
          unref(metamodeler).dirty.value ? (openBlock(), createElementBlock("span", _hoisted_3$1, "*")) : createCommentVNode("", true)
        ]),
        elementType.value === "none" ? (openBlock(), createElementBlock("div", _hoisted_4$1, [..._cache[17] || (_cache[17] = [
          createElementVNode("i", { class: "pi pi-info-circle" }, null, -1),
          createElementVNode("p", null, "Select an element to edit its properties", -1)
        ])])) : elementType.value === "package" ? (openBlock(), createElementBlock("div", _hoisted_5$1, [
          createElementVNode("div", _hoisted_6$1, [
            _cache[21] || (_cache[21] = createElementVNode("h3", null, "EPackage", -1)),
            createElementVNode("div", _hoisted_7$1, [
              _cache[18] || (_cache[18] = createElementVNode("label", { for: "pkgName" }, "Name", -1)),
              createVNode(unref(InputText), {
                id: "pkgName",
                modelValue: pkgName.value,
                "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => pkgName.value = $event),
                class: "w-full",
                onChange: savePackage
              }, null, 8, ["modelValue"])
            ]),
            createElementVNode("div", _hoisted_8$1, [
              _cache[19] || (_cache[19] = createElementVNode("label", { for: "pkgNsURI" }, "Namespace URI", -1)),
              createVNode(unref(InputText), {
                id: "pkgNsURI",
                modelValue: pkgNsURI.value,
                "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => pkgNsURI.value = $event),
                class: "w-full",
                onChange: savePackage
              }, null, 8, ["modelValue"])
            ]),
            createElementVNode("div", _hoisted_9, [
              _cache[20] || (_cache[20] = createElementVNode("label", { for: "pkgNsPrefix" }, "Namespace Prefix", -1)),
              createVNode(unref(InputText), {
                id: "pkgNsPrefix",
                modelValue: pkgNsPrefix.value,
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => pkgNsPrefix.value = $event),
                class: "w-full",
                onChange: savePackage
              }, null, 8, ["modelValue"])
            ])
          ])
        ])) : elementType.value === "class" ? (openBlock(), createElementBlock("div", _hoisted_10, [
          createElementVNode("div", _hoisted_11, [
            _cache[26] || (_cache[26] = createElementVNode("h3", null, "EClass", -1)),
            createElementVNode("div", _hoisted_12, [
              _cache[22] || (_cache[22] = createElementVNode("label", { for: "className" }, "Name", -1)),
              createVNode(unref(InputText), {
                id: "className",
                modelValue: className.value,
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => className.value = $event),
                class: "w-full",
                onChange: saveClass
              }, null, 8, ["modelValue"])
            ]),
            createElementVNode("div", _hoisted_13, [
              createVNode(unref(Checkbox), {
                modelValue: classAbstract.value,
                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => classAbstract.value = $event),
                inputId: "classAbstract",
                binary: true,
                onChange: saveClass
              }, null, 8, ["modelValue"]),
              _cache[23] || (_cache[23] = createElementVNode("label", { for: "classAbstract" }, "Abstract", -1))
            ]),
            createElementVNode("div", _hoisted_14, [
              createVNode(unref(Checkbox), {
                modelValue: classInterface.value,
                "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => classInterface.value = $event),
                inputId: "classInterface",
                binary: true,
                onChange: saveClass
              }, null, 8, ["modelValue"]),
              _cache[24] || (_cache[24] = createElementVNode("label", { for: "classInterface" }, "Interface", -1))
            ]),
            createElementVNode("div", _hoisted_15, [
              _cache[25] || (_cache[25] = createElementVNode("label", null, "Super Types", -1)),
              createElementVNode("p", _hoisted_16, toDisplayString(unref(metamodeler).selectedElement.value?.getESuperTypes?.()?.map((st) => st.getName()).join(", ") || "None"), 1)
            ])
          ]),
          createElementVNode("div", _hoisted_17, [
            createVNode(unref(Button), {
              label: "Delete Class",
              icon: "pi pi-trash",
              severity: "danger",
              size: "small",
              onClick: deleteElement
            })
          ])
        ])) : elementType.value === "attribute" ? (openBlock(), createElementBlock("div", _hoisted_18, [
          createElementVNode("div", _hoisted_19, [
            _cache[32] || (_cache[32] = createElementVNode("h3", null, "EAttribute", -1)),
            createElementVNode("div", _hoisted_20, [
              _cache[27] || (_cache[27] = createElementVNode("label", { for: "attrName" }, "Name", -1)),
              createVNode(unref(InputText), {
                id: "attrName",
                modelValue: attrName.value,
                "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => attrName.value = $event),
                class: "w-full",
                onChange: saveAttribute
              }, null, 8, ["modelValue"])
            ]),
            createElementVNode("div", _hoisted_21, [
              _cache[28] || (_cache[28] = createElementVNode("label", { for: "attrType" }, "Type", -1)),
              createVNode(unref(Dropdown), {
                id: "attrType",
                modelValue: attrType.value,
                "onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => attrType.value = $event),
                options: dataTypes,
                optionLabel: "label",
                optionValue: "value",
                class: "w-full",
                placeholder: "Select type"
              }, null, 8, ["modelValue"])
            ]),
            createElementVNode("div", _hoisted_22, [
              createElementVNode("div", _hoisted_23, [
                _cache[29] || (_cache[29] = createElementVNode("label", { for: "attrLower" }, "Lower Bound", -1)),
                createVNode(unref(script$2), {
                  id: "attrLower",
                  modelValue: attrLowerBound.value,
                  "onUpdate:modelValue": [
                    _cache[8] || (_cache[8] = ($event) => attrLowerBound.value = $event),
                    saveAttribute
                  ],
                  min: 0,
                  class: "w-full"
                }, null, 8, ["modelValue"])
              ]),
              createElementVNode("div", _hoisted_24, [
                _cache[30] || (_cache[30] = createElementVNode("label", { for: "attrUpper" }, "Upper Bound", -1)),
                createVNode(unref(script$2), {
                  id: "attrUpper",
                  modelValue: attrUpperBound.value,
                  "onUpdate:modelValue": [
                    _cache[9] || (_cache[9] = ($event) => attrUpperBound.value = $event),
                    saveAttribute
                  ],
                  min: -1,
                  class: "w-full"
                }, null, 8, ["modelValue"])
              ])
            ]),
            createElementVNode("div", _hoisted_25, [
              createVNode(unref(Checkbox), {
                modelValue: attrDerived.value,
                "onUpdate:modelValue": _cache[10] || (_cache[10] = ($event) => attrDerived.value = $event),
                inputId: "attrDerived",
                binary: true
              }, null, 8, ["modelValue"]),
              _cache[31] || (_cache[31] = createElementVNode("label", { for: "attrDerived" }, "Derived", -1))
            ])
          ]),
          createElementVNode("div", _hoisted_26, [
            createVNode(unref(Button), {
              label: "Delete Attribute",
              icon: "pi pi-trash",
              severity: "danger",
              size: "small",
              onClick: deleteElement
            })
          ])
        ])) : elementType.value === "reference" ? (openBlock(), createElementBlock("div", _hoisted_27, [
          createElementVNode("div", _hoisted_28, [
            _cache[39] || (_cache[39] = createElementVNode("h3", null, "EReference", -1)),
            createElementVNode("div", _hoisted_29, [
              _cache[33] || (_cache[33] = createElementVNode("label", { for: "refName" }, "Name", -1)),
              createVNode(unref(InputText), {
                id: "refName",
                modelValue: refName.value,
                "onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => refName.value = $event),
                class: "w-full",
                onChange: saveReference
              }, null, 8, ["modelValue"])
            ]),
            createElementVNode("div", _hoisted_30, [
              _cache[34] || (_cache[34] = createElementVNode("label", { for: "refType" }, "Target Type", -1)),
              createVNode(unref(InputText), {
                id: "refType",
                modelValue: refType.value,
                "onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => refType.value = $event),
                class: "w-full",
                disabled: ""
              }, null, 8, ["modelValue"]),
              _cache[35] || (_cache[35] = createElementVNode("p", { class: "hint" }, "Set via context menu on the tree", -1))
            ]),
            createElementVNode("div", _hoisted_31, [
              createElementVNode("div", _hoisted_32, [
                _cache[36] || (_cache[36] = createElementVNode("label", { for: "refLower" }, "Lower Bound", -1)),
                createVNode(unref(script$2), {
                  id: "refLower",
                  modelValue: refLowerBound.value,
                  "onUpdate:modelValue": [
                    _cache[13] || (_cache[13] = ($event) => refLowerBound.value = $event),
                    saveReference
                  ],
                  min: 0,
                  class: "w-full"
                }, null, 8, ["modelValue"])
              ]),
              createElementVNode("div", _hoisted_33, [
                _cache[37] || (_cache[37] = createElementVNode("label", { for: "refUpper" }, "Upper Bound", -1)),
                createVNode(unref(script$2), {
                  id: "refUpper",
                  modelValue: refUpperBound.value,
                  "onUpdate:modelValue": [
                    _cache[14] || (_cache[14] = ($event) => refUpperBound.value = $event),
                    saveReference
                  ],
                  min: -1,
                  class: "w-full"
                }, null, 8, ["modelValue"])
              ])
            ]),
            createElementVNode("div", _hoisted_34, [
              createVNode(unref(Checkbox), {
                modelValue: refContainment.value,
                "onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => refContainment.value = $event),
                inputId: "refContainment",
                binary: true,
                onChange: saveReference
              }, null, 8, ["modelValue"]),
              _cache[38] || (_cache[38] = createElementVNode("label", { for: "refContainment" }, "Containment", -1))
            ])
          ]),
          createElementVNode("div", _hoisted_35, [
            createVNode(unref(Button), {
              label: "Delete Reference",
              icon: "pi pi-trash",
              severity: "danger",
              size: "small",
              onClick: deleteElement
            })
          ])
        ])) : createCommentVNode("", true)
      ]);
    };
  }
});

const MetamodelerEditor = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-951d60d1"]]);

var style="\n    .p-toolbar {\n        display: flex;\n        align-items: center;\n        justify-content: space-between;\n        flex-wrap: wrap;\n        padding: dt('toolbar.padding');\n        background: dt('toolbar.background');\n        border: 1px solid dt('toolbar.border.color');\n        color: dt('toolbar.color');\n        border-radius: dt('toolbar.border.radius');\n        gap: dt('toolbar.gap');\n    }\n\n    .p-toolbar-start,\n    .p-toolbar-center,\n    .p-toolbar-end {\n        display: flex;\n        align-items: center;\n    }\n";

var classes = {
  root: 'p-toolbar p-component',
  start: 'p-toolbar-start',
  center: 'p-toolbar-center',
  end: 'p-toolbar-end'
};
var ToolbarStyle = BaseStyle.extend({
  name: 'toolbar',
  style: style,
  classes: classes
});

var script$1 = {
  name: 'BaseToolbar',
  "extends": script$9,
  props: {
    ariaLabelledby: {
      type: String,
      "default": null
    }
  },
  style: ToolbarStyle,
  provide: function provide() {
    return {
      $pcToolbar: this,
      $parentInstance: this
    };
  }
};

var script = {
  name: 'Toolbar',
  "extends": script$1,
  inheritAttrs: false
};

var _hoisted_1$1 = ["aria-labelledby"];
function render(_ctx, _cache, $props, $setup, $data, $options) {
  return openBlock(), createElementBlock("div", mergeProps({
    "class": _ctx.cx('root'),
    role: "toolbar",
    "aria-labelledby": _ctx.ariaLabelledby
  }, _ctx.ptmi('root')), [createElementVNode("div", mergeProps({
    "class": _ctx.cx('start')
  }, _ctx.ptm('start')), [renderSlot(_ctx.$slots, "start")], 16), createElementVNode("div", mergeProps({
    "class": _ctx.cx('center')
  }, _ctx.ptm('center')), [renderSlot(_ctx.$slots, "center")], 16), createElementVNode("div", mergeProps({
    "class": _ctx.cx('end')
  }, _ctx.ptm('end')), [renderSlot(_ctx.$slots, "end")], 16)], 16, _hoisted_1$1);
}

script.render = render;

const _hoisted_1 = { class: "metamodeler-perspective" };
const _hoisted_2 = { class: "toolbar-title" };
const _hoisted_3 = {
  key: 0,
  class: "unsaved-indicator"
};
const _hoisted_4 = { class: "toolbar-actions" };
const _hoisted_5 = { class: "toolbar-info" };
const _hoisted_6 = {
  key: 0,
  class: "info-text"
};
const _hoisted_7 = { class: "perspective-content" };
const _hoisted_8 = { class: "editor-panel" };
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "MetamodelerPerspective",
  setup(__props) {
    const metamodeler = useSharedMetamodeler();
    const treePanelWidth = ref(300);
    const hasUnsavedChanges = computed(() => metamodeler.dirty.value);
    const packageName = computed(() => metamodeler.rootPackage.value?.getName() || "New Metamodel");
    function handleNew() {
      if (hasUnsavedChanges.value) {
        console.log("Unsaved changes!");
      }
      metamodeler.reset();
    }
    async function handleSave() {
      console.log("Saving metamodel...");
      const success = await metamodeler.saveToFile();
      if (success) {
        console.log("Metamodel saved successfully");
      } else {
        console.warn("Failed to save metamodel or save was cancelled");
      }
    }
    async function handleSaveAs() {
      console.log("Save metamodel as...");
      const success = await metamodeler.saveAsFile();
      if (success) {
        console.log("Metamodel saved successfully");
      } else {
        console.warn("Failed to save metamodel or save was cancelled");
      }
    }
    function handleUndo() {
      console.log("Undo");
    }
    function handleRedo() {
      console.log("Redo");
    }
    return (_ctx, _cache) => {
      const _directive_tooltip = resolveDirective("tooltip");
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createVNode(unref(script), { class: "perspective-toolbar" }, {
          start: withCtx(() => [
            createElementVNode("div", _hoisted_2, [
              _cache[0] || (_cache[0] = createElementVNode("i", { class: "pi pi-sitemap" }, null, -1)),
              createElementVNode("span", null, toDisplayString(packageName.value), 1),
              hasUnsavedChanges.value ? (openBlock(), createElementBlock("span", _hoisted_3, "*")) : createCommentVNode("", true)
            ])
          ]),
          center: withCtx(() => [
            createElementVNode("div", _hoisted_4, [
              withDirectives(createVNode(unref(Button), {
                icon: "pi pi-file",
                text: "",
                rounded: "",
                size: "small",
                onClick: handleNew
              }, null, 512), [
                [
                  _directive_tooltip,
                  "New Metamodel",
                  void 0,
                  { bottom: true }
                ]
              ]),
              withDirectives(createVNode(unref(Button), {
                icon: "pi pi-save",
                text: "",
                rounded: "",
                size: "small",
                disabled: !hasUnsavedChanges.value && !!unref(metamodeler).fileHandle.value,
                onClick: handleSave
              }, null, 8, ["disabled"]), [
                [
                  _directive_tooltip,
                  "Save (Ctrl+S)",
                  void 0,
                  { bottom: true }
                ]
              ]),
              withDirectives(createVNode(unref(Button), {
                icon: "pi pi-file-export",
                text: "",
                rounded: "",
                size: "small",
                disabled: !unref(metamodeler).rootPackage.value,
                onClick: handleSaveAs
              }, null, 8, ["disabled"]), [
                [
                  _directive_tooltip,
                  "Save As...",
                  void 0,
                  { bottom: true }
                ]
              ]),
              _cache[1] || (_cache[1] = createElementVNode("span", { class: "toolbar-separator" }, null, -1)),
              withDirectives(createVNode(unref(Button), {
                icon: "pi pi-undo",
                text: "",
                rounded: "",
                size: "small",
                disabled: "",
                onClick: handleUndo
              }, null, 512), [
                [
                  _directive_tooltip,
                  "Undo (Ctrl+Z)",
                  void 0,
                  { bottom: true }
                ]
              ]),
              withDirectives(createVNode(unref(Button), {
                icon: "pi pi-refresh",
                text: "",
                rounded: "",
                size: "small",
                disabled: "",
                onClick: handleRedo
              }, null, 512), [
                [
                  _directive_tooltip,
                  "Redo (Ctrl+Y)",
                  void 0,
                  { bottom: true }
                ]
              ])
            ])
          ]),
          end: withCtx(() => [
            createElementVNode("div", _hoisted_5, [
              unref(metamodeler).rootPackage.value ? (openBlock(), createElementBlock("span", _hoisted_6, toDisplayString(unref(metamodeler).rootPackage.value.getEClassifiers?.()?.length || 0) + " classes ", 1)) : createCommentVNode("", true)
            ])
          ]),
          _: 1
        }),
        createElementVNode("div", _hoisted_7, [
          createElementVNode("div", {
            class: "tree-panel",
            style: normalizeStyle({ width: treePanelWidth.value + "px" })
          }, [
            createVNode(MetamodelerTree)
          ], 4),
          _cache[2] || (_cache[2] = createElementVNode("div", { class: "panel-resizer" }, null, -1)),
          createElementVNode("div", _hoisted_8, [
            createVNode(MetamodelerEditor)
          ])
        ])
      ]);
    };
  }
});

const MetamodelerPerspective = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-88b62732"]]);

async function activate(context) {
  context.log.info("Activating Metamodeler plugin...");
  context.services.register("ui.metamodeler.components", {
    MetamodelerPerspective,
    MetamodelerTree,
    MetamodelerEditor
  });
  context.services.register("ui.metamodeler.composables", {
    useMetamodeler: useMetamodeler,
    useSharedMetamodeler: useSharedMetamodeler
  });
  const panelRegistry = context.services.get("ui.registry.panels");
  if (panelRegistry) {
    panelRegistry.register({
      id: "metamodeler",
      title: "Metamodeler",
      icon: "pi pi-sitemap",
      component: markRaw(MetamodelerPerspective),
      perspectives: ["metamodeler"],
      defaultLocation: "center",
      defaultOrder: 0,
      closable: false
    });
    context.log.info("Metamodeler panel registered");
  }
  const activityRegistry = context.services.get("ui.registry.activities");
  if (activityRegistry) {
    activityRegistry.register({
      id: "metamodeler",
      icon: "pi pi-sitemap",
      label: "Metamodeler",
      tooltip: "Ecore Metamodel Editor",
      panelId: "metamodeler",
      perspectiveId: "metamodeler",
      order: 30,
      perspectives: ["metamodeler"]
    });
    context.log.info("Metamodeler activity registered");
  }
  const openMetamodeler = () => {
    const perspectiveService = context.services.get("ui.perspectives");
    if (perspectiveService?.usePerspective) {
      const perspective = perspectiveService.usePerspective();
      perspective.switchTo("metamodeler");
      context.log.info("Switched to Metamodeler perspective");
    } else {
      context.log.warn("Perspective service not available");
    }
  };
  if (typeof window !== "undefined") {
    window.openMetamodeler = openMetamodeler;
  }
  context.services.register("ui.metamodeler.open", openMetamodeler);
  context.log.info("Metamodeler plugin activated");
}
async function deactivate(context) {
  context.log.info("Deactivating Metamodeler plugin...");
  if (typeof window !== "undefined") {
    delete window.openMetamodeler;
  }
  context.services.unregister("ui.metamodeler.open");
  context.services.unregister("ui.metamodeler.components");
  context.services.unregister("ui.metamodeler.composables");
  context.log.info("Metamodeler plugin deactivated");
}

export { META_ICONS, MetamodelerEditor, MetamodelerPerspective, MetamodelerTree, OCL_ANNOTATION_SOURCES, activate, deactivate, getClassifierIcon, useMetamodeler, useSharedMetamodeler };
//# sourceMappingURL=index.js.map
