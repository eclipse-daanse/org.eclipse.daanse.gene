# Explizite Resource-Verwaltung im (Instanz-/Metamodell-)Editor

> Status: geplant · Konzept/Architektur · gilt für `ui-instance-tree` (Instanz- **und** Metamodell-Modus)

## Kontext / Warum

Der gemeinsame Baum-Editor (`ui-instance-tree`, genutzt für Instanz- **und** Metamodell-Modus)
ist heute **Single-Resource**: es gibt genau *eine* geteilte `XMIResource`, der Baum zeigt direkt
deren Wurzelobjekte, mehrere geladene Dateien werden hineingemerged (Herkunft nur via `objectSourceMap`-
WeakMap). Es fehlen: echte Resource-Ebene, „Resource anlegen", Verschieben zwischen Resources,
pro-Resource-/Alle-Speichern, Resource→Datei-Bindung und Auflösung von Referenzen über Resource-Grenzen.

Ziel: Resources als **erstklassige, explizit verwaltbare** Objekte — anlegen, befüllen, Elemente
zwischen ihnen verschieben, einzeln/als Ganzes speichern; beim Laden bewusst entscheiden, ob eine XMI
allein (inkl. referenzierter Resources) oder additiv geöffnet wird.

## Anforderungen (bestätigt)

**Funktional:**
1. Editor verwaltet **eine oder mehrere Resources** gleichzeitig.
2. **Resources anlegen** (neue, benannte Resource).
3. **Objekte/Elemente zwischen Resources verschieben** (Instanz: EObjects samt Kinder; Metamodell:
   EClasses/EFeatures).
4. An einer Resource **speichern** + **„Alle speichern"**.
5. **Resource-Name bestimmt die Datei** (`<name>.xmi`).
6. Beim **XMI-Laden** fragen: **allein öffnen** (ggf. inkl. **referenzierter Resources**) **oder**
   der **bestehenden Ansicht hinzufügen**.

**Entscheidungen:**
- **Geltungsbereich:** Instanz- **und** Metamodell-Modus → Umbau in der gemeinsamen Tree-/Context-Schicht.
- **Cross-Resource-Referenzen:** aufgelöst **über nsURI/Identitäts-URI** → korrekte In-Memory-Resource,
  kein Auflösen auf fremde/duplizierte Instanz (Identity-Split vermeiden).
- **Datei-Mapping:** **1 Resource = 1 Datei** (Name = Dateiname).
- **Jetzt im Umfang:** referenzierte Resources beim Standalone-Öffnen **automatisch nachladen**;
  **pro-Resource Dirty-Anzeige**.
- **Später:** `indexeddb`/`git`-Persistenz (`writeTextFile` wirft dort „not implemented"; nur
  `local`/`model-atlas` persistieren real).

## Ist-Architektur (Kurzbefund)

- Single-Resource-Singleton: `ui-instance-tree/src/composables/useInstanceTree.ts` — `SharedState.resource:
  Ref<Resource|null>`; `treeNodes` mappt `resource.getContents()`. `ResourceSet` (`getResourceSet()`) nur
  Wegwerf-Factory. Adapter hängt an *einer* Resource (`:210`, kein `setTarget`).
- Laden merged (`loadInstancesFromXMI:1032`, Transfer-Loop `:1082-1100`); Herkunft `objectSourceMap:111`.
- Speichern in `ui-layout/.../SaveInstancesDialog.vue` (`serializeAllInstances:799`/`serializeInstances:829`
  + `copyChildIds:816`), schreibt via `gene.filesystem` (`ui-file-explorer/.../useFileSystem.ts:writeTextFile:516`).
- Context-Fassade `context/editorContext.ts` (+ `instanceContext.ts`, `metamodelContext.ts`) ohne
  Resource-Dimension; `instanceContext.ts:129` liest ein `dirty`, das die Composable nie liefert (Bug:
  Instanz-Modus gilt immer als „clean").
- Cross-Resource-Refs heute nicht aufgelöst → dangling Proxies (`checkDanglingReferences` in `index.ts:171`).
  Ecore-Muster vorhanden: `configureCascadeResolver` (`gene-app/src/App.vue:875`) +
  `atlas-browser/.../atlasURIConverter.ts`.
- **@emfts/core-Nahtstellen** (nur lesen): `BasicResourceSet.getResource` (Member-First → Registry →
  fire-and-forget-Load), `getResourceAsync`, `resolveProxiesAsync` (eingebauter Fixpunkt-Autoloader),
  `setURIConverter`; `XMLHandler.resolveReference` (Paket-Registry **zuerst** → Identity-Split-Einfallstor);
  `XMLSave.getHref` (Cross-Ref → `targetResource.getURI()#frag`, sonst Paket-nsURI). `Resource` hat
  `setURI/getURI` + `isModified/setModified` → **Name = URI**, **Dirty intrinsisch**.
- Bekannter Bug (Memory): Save schreibt teils nsURI-hrefs auf fremde Paket-Instanz; ModelRegistry kann
  veralten → falsche `eResource()`/href-Basis.

## Ziel-Architektur

1. **ResourceSet = getracktes reaktives Modell.** `SharedState` erhält `resourceSet`, `resources:
   Ref<Resource[]>`, `activeResource: Ref<Resource|null>`, `version`, `dirtyVersion`. Resource-Identität =
   eigene **Identitäts-URI** `gene-resource://<name>` (disjunkt zu Paket-nsURIs → umgeht die Paket-zuerst-
   Auflösung und den Identity-Split); Zieldatei `<name>.xmi` via URIConverter-Map. `objectSourceMap`
   entfällt → Herkunft = `eObject.eResource()`. Immer `toRaw()` für ResourceSet-/`eResource`-Operationen.
2. **Reaktivität:** ein `EContentAdapter.setTarget(resourceSet)` (propagiert auf alle Resources/Objekte;
   behebt zugleich die fehlende Tiefen-Reaktivität im Instanz-Modus). `notifyChanged` → betroffene Resource
   `setModified(true)`, `dirtyVersion++`, `triggerUpdate`. Add/Remove von Resources manuell in
   `resources.value` + `version` (Array benachrichtigt nicht selbst).
3. **Tree:** Resource-Ebene über Objekt-Ebene. `InstanceTreeNode` (`types.ts:15`) um `kind:'resource'|'object'`,
   `resource`, `dirty` erweitern (rückwärtskompatibel). `treeNodes` wrappt je Resource das unveränderte
   `buildTreeNode`; Objekt-Keys bleiben stabil.
4. **EditorContext-API (mode-agnostisch):** `resources`, `activeResource`, `setActiveResource`,
   `createResource(name)`, `renameResource`, `deleteResource`, `moveToResource(obj,target)`,
   `saveResource(r)→{filename,content}`, `saveAll()`, `isResourceDirty(r)`. Save-Methoden liefern nur
   `{filename,content}` (FS-Schreiben bleibt in `SaveInstancesDialog`/`App.vue`). Gemeinsame Kern-Composable
   **`useResourceSetTree`** (owns resources/adapter/dirty/tree-wrap/move) für Instanz **und** Metamodell.
5. **Cross-Resource-Referenzen (nsURI):** Identitäts-URIs disjunkt zu Paket-nsURIs → `getResource`-Member-
   First liefert die kanonische Resource (kein Duplikat). App-seitiger `setURIConverter` auf dem
   Instanz-ResourceSet (analog `atlasURIConverter`/`configureCascadeResolver`): `normalize`
   Identity-URI→Pfad, `createInputStream`/`exists` via `gene.filesystem`. Kanonische Paket-Registry
   unangetastet (Metamodell-Classifier-Proxies).
6. **Laden:** neuer `loadResourceStandalone` — primär parsen (eigene Resource, **kein** Merge) → Proxy-Bases
   sammeln (Reuse `checkDanglingReferences`, gefiltert `!packageRegistry.has(base)`) → referenzierte Dateien
   via URIConverter/`gene.filesystem` in **denselben** ResourceSet laden → `resolveProxiesAsync` → Rest =
   echte dangling → WARN. Zyklen/Diamanten via Member-Dedup + Progress-Flag abgedeckt.
7. **Speichern:** pro-Resource `resource.saveToString()` → Datei = Resource-Name (`sanitizeFilename`);
   `serializeInstances`/`copyChildIds`/Gruppierung entfallen. Neu: `instance.saveAll` (Command + Event
   `save-all-instances-request`) neben bestehendem `save-instances-request`. `instanceSources` je Resource
   via `addInstanceSource`/`removeInstanceSource`/`saveToFileSystem` (`src/services/useEditorConfig.ts`).
8. **Move:** Containment-Transfer (`A.getContents().remove(raw)` → `B.getContents().add(raw)`, `eResource()`
   flippt), IDs erhalten (`copyChildIds` in Ziel-ID-Map + `assignXmiId` für Lücken). Dirty auf A, B **und**
   alle Referrer-Resources (Reverse-Ref-Scan, deren Datei neue href-Basis bekommt). hrefs werden erst beim
   Save via `getHref` berechnet — kein manuelles Umschreiben. Identity-Split-Guard: nach Transfer
   `eResource()===B`, kein Rest-Duplikat in A/fremder Resource.

## Umsetzungsschritte (Phasen, mit Datei:Stelle)

**Phase 0 — Kern-ResourceSet reaktiv (keine UI)** · `useInstanceTree.ts`
- `SharedState`/`getOrCreateSharedState:949/959`: `resourceSet`, `resources`, `activeResource`, `dirtyVersion`.
- Adapter: `setupAdapter`/`contentAdapter:178-226` → ein `EContentAdapter.setTarget(resourceSet)`; Dirty in
  `notifyChanged` (Notifier→`eResource()` bzw. Notifier ist Resource).
- Neu: `createResource/renameResource/deleteResource/setActiveResource/moveToResource/isResourceDirty/
  serializeResource/listResources`; `resources.value`+`version` bei Add/Remove pflegen.
- `getObjectSourcePath:117` → `toRaw(obj).eResource()?.getURI()`; `objectSourceMap:111`/`setObjectSourcePath:126`
  löschen. `addRootObject:673` → `activeResource` (Default-Resource anlegen, falls keine).
- `loadInstancesFromXMI:1032`: Transfer-Loop `:1082-1100` + `setObjectSourcePath:1064` entfernen; geladene
  Resource als Member behalten. `getObjectByXmiId:1250`/`generateMissingXmiIds:1268` über `resources` iterieren.
- Compat-Shims: `getSharedResource/setSharedResource:989-1001` (aktive/erste Resource) + neu `getSharedResources`.

**Phase 1 — Resource-Ebene im Tree** · `useInstanceTree.ts`, `types.ts`
- `types.ts:15` um `kind|resource|dirty`; `treeNodes:231-265` je Resource `buildTreeNode:292` wrappen
  (Filter `filterTreeNodes:270` je Resource).

**Phase 2 — EditorContext-API** · `context/editorContext.ts:176`, `instanceContext.ts:72`
- Interface + `ResourceInfo`; Instanz-Context verdrahten; **Dirty-Bug** `instanceContext.ts:129` fixen
  (`resources.some(r=>r.isModified())`).

**Phase 3 — Cross-Resource-Refs + URIConverter + Auto-Load** · `useInstanceTree.ts`, `gene-app/src/App.vue`
- Identitäts-URI-Schema; `getResourceSet().setURIConverter(...)` (Muster `atlasURIConverter.ts`), installiert
  analog `configureCascadeResolver:875`. `loadResourceStandalone` (Reuse `checkDanglingReferences:171`,
  `resolveProxiesAsync`).

**Phase 4 — Laden-UX** · `ui-actions/.../XmiImportDialog.vue`, `ui-instance-tree/src/index.ts`, `App.vue`, `ui-file-explorer/.../FileExplorer.vue`
- 3. Radio `STANDALONE` (Default `open()`); `importXmi:413` Branch `STANDALONE`→`loadResourceStandalone`;
  REPLACE/MERGE→`clearResources`/Add-Resource. Explorer-Öffnen `handleInstanceAdd:1267` über
  `instance:showImportDialog` statt stillem MERGE.

**Phase 5 — Speichern** · `SaveInstancesDialog.vue`, `index.ts`, `src/services/useEditorConfig.ts`
- `handleSave:337`/`sourceFileGroups:111` → über `ctx.resources` iterieren (`saveResource`→geneFS→Modified
  löschen). Save-All-Menü (`index.ts:538`) + Event. `instanceSources` add/remove/persist.

**Phase 6 — Move + Kontextmenü/Drag** · `InstanceTree.vue`, `useInstanceTree.ts`
- `contextMenuItems:350`: Resource-Menü (New/Save/Save As/Rename/Delete) + Objekt-„Move to Resource →";
  `handleDrop:575` auf Resource-Knoten = Add-Root; `handleNodeSelect:522` Resource-Knoten → `activeResource`,
  kein Objekt-Select; Empty-State über `resources.length`.

**Phase 7 — Metamodeler-Parität** · `metamodeler/src/composables/useMetamodeler.ts`, `MetamodelerTree.vue`
> ⚠️ **ZURÜCKGESTELLT.** `useMetamodeler.ts` erzwingt bewusst eine **Ein-Resource-Invariante**
> (Kommentar bei `:94`; Fix `16613f0`) gegen den Cross-Ref-Identity-Split
> ([[project_metamodeler_crossref_identity_split]]) und ModelRegistry-Reaktivitätsbugs
> ([[project_metamodeler_reactivity_registry]]). Multi-Resource widerspricht dieser Invariante direkt
> und würde diese kürzlich behobenen Bugs riskieren. Daher separater, später abgesicherter Schritt
> (mit Cross-Ref-Regressionstests) — **nicht** Teil dieser Umsetzung.
- Geplant (bei Wiederaufnahme): `resource:171`→`resources[]`/`activeResource`; `rootPackage:443`→aktive
  Resource-Root; `treeNodes:460` Resource-Ebene; `setupAdapter:404`→`setTarget`;
  `createNewPackage:757`/`loadFromEcoreString:966` Add-as-Resource; editierbare Roots in
  `importedPackages:195` reconcilen; `moveToResource` über `EClassifiers`/`ESubpackages`.

## Kritische Dateien

- `packages/ui-instance-tree/src/composables/useInstanceTree.ts` (Kern: ResourceSet, Tree, Load, Save, Move)
- `packages/ui-instance-tree/src/context/{editorContext,instanceContext,metamodelContext}.ts` (API + Dirty-Fix)
- `packages/ui-instance-tree/src/components/InstanceTree.vue` (Resource-Tier-UI, Menü, Drag)
- `packages/ui-instance-tree/src/index.ts` (importXmi-Modi, Save/Save-All, checkDanglingReferences)
- `packages/ui-actions/src/components/XmiImportDialog.vue` (3. Lade-Option)
- `packages/ui-layout/src/components/SaveInstancesDialog.vue` (pro-Resource-Save)
- `packages/gene-app/src/App.vue` (URIConverter installieren, Explorer-Routing) + `atlas-browser/.../atlasURIConverter.ts` (Muster)
- `src/services/useEditorConfig.ts` (instanceSources-Sync)
- `packages/metamodeler/src/composables/useMetamodeler.ts`, `MetamodelerTree.vue` (Parität)

## Hauptrisiken

- Identitäts-URI **muss** disjunkt zu Paket-nsURIs sein, sonst kehrt der Identity-Split zurück
  (`resolveReference` Paket-zuerst).
- `getResource` synchroner fire-and-forget-Load liefert leer → vor Zugriff via `resolveProxiesAsync`/preload
  auflösen (sonst transiente dangling Refs beim ersten Paint).
- Single-Resource-Annahmen an vielen Stellen (`checkDanglingReferences`, Live-OCL `App.vue:906`,
  Suche `App.vue:2445`, `PropertiesPanel.vue`, `atlas-browser/src/index.ts:303`) → auf `getResources()` umstellen.
- Mode-Switch-Singletons: `resources`/`activeResource` in modul-globalem State; kanonische Paket-Registry
  zwischen Instanz- und Metamodell-ResourceSet **geteilt** halten.
- Vue-Proxy vs. `toRaw` bei `eResource`/ResourceSet-Ops (Identity-Split-Vektor).
- Auswahl über gemischte Knotenarten: `selectedObject=null` bei Resource-Knoten; `PropertiesPanel` tolerant.

## Verifikation

- Mehrere Resources anlegen; Objekte zwischen ihnen verschieben; jede Resource = eigener Baum-Knoten mit
  Dirty-Marker.
- Speichern je Resource → Datei = Name; „Alle speichern".
- XMI laden in beiden Modi (Standalone inkl. referenzierter Resources / Hinzufügen); referenzierte Datei
  wird nachgeladen, Cross-Resource-Ref nach Verschieben bleibt via nsURI auflösbar (kein Duplikat).
- Metamodell-Modus: dieselben Aktionen für EClasses/EFeatures über mehrere .ecore-Resources.
- End-to-end im echten App-Lauf.

## Lieferung / Status

- **Phasen 0–6 umgesetzt** (Branch `feat/multi-resource-management`): Multi-Resource-Kern + Resource-Ebene
  im Tree, EditorContext-Resource-API + Dirty, Cross-Resource-nsURI + Auto-Load referenzierter Resources,
  Lade-Dialog (Standalone/Add/Replace), pro-Resource-Speichern, Resource-Kontextmenü + Move + Drop-to-Root.
  → Die **Instanz-Editor-User-Story ist damit vollständig**.
- **Phase 7 (Metamodeler-Parität) zurückgestellt** — siehe Warnhinweis oben (Ein-Resource-Invariante).
- Noch nicht verifiziert (Typecheck/App-Test ausstehend).
