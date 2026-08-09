# Plan: UiModel-basierte Property-Ansicht im Instance-Editor

**Status (2026-08-08):** Phasen 0–4 umgesetzt. Flag-Default ist AN
(`localStorage gene.uimodelProperties='false'` schaltet auf den alten Pfad).
Nachher-Abgleich bestanden: die Baseline-Suite laeuft mit `UIMODEL_FLAG=true`
(Composer-Pfad) identisch gruen inkl. Screenshots.
Bewusste Abweichung von Phase 4: **Operationen** bleiben beim Panel-Rahmen —
`uimodel.ecore` kennt nur Feature-basierte Widgets (`WidgetComponent.feature:
EStructuralFeature [1]`), EOperations sind damit nicht abbildbar. Kandidat
fuer eine uimodel.ecore-Erweiterung im EMFTs-Projekt (Entscheidung F4),
zusammen mit C-OCL-only-Derived (constraint- statt feature-basiert).
Ebenfalls beim Panel-Rahmen: XMI-ID/Primary-Key-Zeile, Breadcrumb,
OCL-Constraint-Formular (wie geplant).

**Branch:** `feat/uimodel`
**Ziel:** Die Property-Anzeige des Instance-Editors (heute: fest kodierte Sektionen in
`packages/ui-properties-panel/src/components/PropertiesPanel.vue`) wird durch den
**`@emfts/uimodel-composer`** (`/mnt/.../EMFTs/uimodel-composer`) ersetzt: Die Oberfläche wird
als UIModel (Ecore/XMI) beschrieben und zur Laufzeit interpretiert.

---

## 1. Ausgangslage

### uimodel-composer (Quelle)

- `UIModelComposer.vue`: rendert aus `(uiModel: UIModel, model: EObject)` reaktiv die
  Komponenten-Hierarchie. Optional `composerRegistry` (eigene/ersetzende Composer) und
  `styleSheets` (CSS-Modell).
- **Metamodell** `model/uimodel.ecore` (`http://uimodel/1.0`):
  - `UIModel`: `targetClasses` (EClass-Refs, leer = alle), `priority`, `filterExpression`
    (OCL/JS auf Instanzebene), `components`
  - Views: `FormView`, `SectionView`, `TabView`, `TableView`, `SummaryView`, `MasterDetail`
  - `WidgetComponent.feature` → **typisierte Ecore-Referenz** auf `EStructuralFeature`;
    Widgets: Input, TextArea, Number, Checkbox, Date, Combobox, Select, ReferenceLink
  - `Expression`/`ValidationExpression` (JS/OCL, `registerOclEvaluator`)
- **Widget-Auflösung** über `@emfts/vue-registry`: `getComponentForFeature(feature, model)`;
  registrierte Widgets bekommen Props `{ eObject, feature, eClass, custom }`.
- Erweiterungen (separate EPackages, optional): Vega, Maps, **CSS-Styling-Modell**.
- `editor/`: eigenständige Editor-App (Baum + Live-Preview + Property-Panel) für UI-Modelle.
- **Nicht auf npm veröffentlicht** (Stand heute: 404 für `@emfts/uimodel-composer`).

### gene (Ziel)

- `PropertiesPanel.vue` rendert heute hart kodiert: Sektionen Attributes / References /
  Derived Values / Operations, XMI-ID-Zeile, Breadcrumb, OCL-Constraint-Formular.
- Feld-Komponenten liegen in `packages/instance-builder` (`PropertyField`, `AttributeField`,
  `EnumField`, `ReferenceField`, `DerivedField`, `CoclDerivedField`, `OperationField`, …).
- `@emfts/vue-registry` ist **bereits** als Shared-Lib im TSM registriert (`src/main.ts`),
  und `instance-builder/usePropertyRegistry.ts` nutzt dieselbe `ComponentRegistry`-Klasse —
  `PropertyField.vue` prüft die Registry schon heute vor der eingebauten v-if-Kette.
  → Die Widget-Brücke hat also einen natürlichen Andockpunkt.
- `@emfts/core` ^0.1.1-next.16 (Composer verlangt ^0.1.1-next.7 → Range kompatibel).
- Zentrale `EPackageRegistry` als TSM-Service (Vorsicht: Singleton-Identität!).

---

## 2. Architektur-Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| E1 | **Neues Plugin-Package `packages/ui-uimodel-forms`** statt Code direkt in `ui-properties-panel` | Plugin-Modularität; ui-properties-panel konsumiert nur einen TSM-Service |
| E2 | **Entwicklung: lokal linken** (`npm link`, erzeugt nur einen node_modules-Symlink — package.json/Lockfile bleiben unangetastet). **Vor dem Merge nach main** wird `@emfts/uimodel-composer` veröffentlicht und als reguläre Dependency eingetragen | Kein `file:`-Pfad im Lockfile (siehe früheres Problem fix/package-lock-local-paths); kein Code-Kopieren wie im verworfenen ui-forms-diagramms-Ansatz |
| E3 | **Eine** @emfts/core-Instanz für App + Composer (vite `resolve.dedupe` / Alias; Composer als Shared-Lib im TSM registrieren wie vue-registry) | `EPackageRegistry.INSTANCE`, `eClass`-Identitäten und Adapter funktionieren nur bei geteilter Instanz |
| E4 | **Default-UIModel-Generator** in gene (nicht im Composer vorhanden): erzeugt zur Laufzeit aus einer EClass ein FormView-UIModel (ein Widget je Feature, Gruppen Attributes/References) | Ohne autoriertes UIModel muss sich das Panel wie heute verhalten — kein Big Bang |
| E5 | Gene-Feldkomponenten werden als **Widgets in der vue-registry registriert** (Bridge), der Composer rendert sie | ReferenceField & Co. (Create-Child, Suche, Navigation, OCL-Filter) bleiben erhalten; kein Doppel-Implementieren |
| E6 | **Feature-Flag** `uimodelProperties` (Workspace-/Editor-Config): alte Anzeige bleibt während der Migration als Fallback umschaltbar | Risikoarme Migration, E2E-Tests können beide Pfade vergleichen |
| E7 | **Zweistufige UIModel-Quellen:** (1) **app-weite Defaults** (mit der App ausgeliefert, z. B. `public/uimodels/`), (2) **Workspace-Definitionen** (`*.uimodel.xmi` neben den Metamodellen), die die Defaults **feature- oder klassenspezifisch überschreiben**. Auflösung: Workspace vor App-Default vor generiertem Fallback (E4); innerhalb einer Stufe entscheidet `targetClasses`-Spezifität + `priority` | App funktioniert out-of-the-box; Nutzer verfeinern pro Workspace, versionierbar beim Nutzer |

---

## 3. Phasen

### Phase 0 — Voraussetzungen (außerhalb von gene bzw. Setup)

1. Composer **lokal linken** (noch nicht veröffentlicht):
   `cd /mnt/.../EMFTs/uimodel-composer && npm run build && npm link`, dann in gene
   `npm link @emfts/uimodel-composer`. Kein Eintrag in package.json/Lockfile;
   Hinweis: jedes volle `npm install` entfernt den Link → Re-Link nötig
   (kleines Skript/README-Notiz im Package). Veröffentlichung erst vor dem Merge.
2. In gene: `vite.config.ts`: `dedupe`/Alias für `vue` und
   `@emfts/core` prüfen (beim Link zeigt der Composer sonst auf sein eigenes
   node_modules!); Composer in `src/main.ts` als TSM-Shared-Lib registrieren
   (analog `@emfts/vue-registry`).
3. `UimodelPackage` + `UimodelFactory` beim App-Start in der zentralen `EPackageRegistry`
   (TSM-Service) registrieren.

**Akzeptanz:** App startet unverändert; `UimodelPackage.eINSTANCE` ist über die zentrale
Registry auflösbar.

### Phase 0b — Referenzmodell & Baseline (VOR jedem Umbau, siehe Abschnitt 6)

1. Test-Metamodell + Referenz-Instanz anlegen (6.1).
2. Screenshot-Baseline-Suite `e2e/properties-baseline.spec.ts` gegen den
   **unveränderten** alten Property-View aufnehmen und einchecken (6.2).
3. Interaktions-Inventar der Absprungpunkte dokumentieren und per E2E absichern (6.3).

**Akzeptanz:** Baseline-Suite läuft grün gegen den Ist-Stand; Screenshots und
Inventar sind eingecheckt, bevor Phase 1 beginnt.

### Phase 1 — Durchstich (hinter Feature-Flag)

1. Neues Package `packages/ui-uimodel-forms` (manifest.json, TSM-Service
   `ui.uimodel.forms`).
2. **Default-UIModel-Generator** `buildDefaultUiModel(eClass, opts)`:
   FormView mit einem `WidgetComponent` je editierbarem Attribut, Gruppe/Section je
   Kategorie (Attributes, References). Derived/Operations zunächst ausgenommen
   (rendert weiterhin der alte Pfad, s. Phase 4).
3. **Widget-Bridge v1**: `AttributeField`/`EnumField` als Widgets in der vue-registry
   registrieren; Adapter-Komponente mappt Composer-Props (`{eObject, feature, custom}`)
   auf die gene-Props und bindet Write-back an den Editor-Kontext
   (`markDirty`/`triggerUpdate`/`version` — Fokus-Erhalt beim Tippen beachten,
   vgl. Kommentar zu `modelVersion` in PropertiesPanel.vue).
4. `PropertiesPanel.vue`: Wenn Flag aktiv, ersetzt `<UIModelComposer>` die Sektionen
   Attributes/References; XMI-ID-Zeile, Breadcrumb, Constraint-Editor, Derived,
   Operations bleiben unverändert außen herum.

**Akzeptanz:** Mit Flag an sind einfache Attribute (String/Number/Boolean/Enum/Date) über
den Composer editierbar; Dirty-Tracking, Undo des Flags und alte Anzeige unverändert.

### Phase 2 — Referenzen & Parität der Widgets

1. `ReferenceField` als Widget registrieren (Containment- und Non-Containment-Referenzen):
   Create-Child, Suche (`openSearchDialog`), Navigation, `availableObjects`,
   OCL-Referenz-Filter (`getOclFilter`) — Bereitstellung über den bereits per
   `provide(GENE_EDITOR_CONTEXT_KEY, …)` existierenden Kontext.
2. Validierung: **Ziel ist eine einzige Validierungsquelle auf OCL-Basis**
   (`ValidationExpression` im UIModel, OCL-Adapter via `registerOclEvaluator` mit
   gene's `@emfts/ocl.engine`). Übergangsweise reicht die Bridge die Fehler aus
   `useInstanceEditor.errors` durch; die dortigen strukturellen Checks
   (required/multiplicity) wandern schrittweise in generierte
   ValidationExpressions des Default-UIModels, bis `useInstanceEditor` nur noch
   Wert-Lese/Schreib-Schicht ist.
3. `visibilityCondition` (OCL/JS) über denselben OCL-Adapter aktivieren.

**Akzeptanz:** Instanz-Editieren (Bücher-Beispiel aus den E2E-Tests) funktioniert über den
Composer-Pfad vollständig; bestehende Playwright-E2E laufen mit Flag an grün.

### Phase 3 — UIModel-Registry, App-Defaults & Workspace-Overrides

1. Service `UiModelRegistry` (in `ui-uimodel-forms`) mit **zwei Quellen** (E7):
   app-weite Default-UIModels (z. B. `public/uimodels/*.uimodel.xmi`, beim Start
   geladen) und alle `*.uimodel.xmi` des Workspace über das bestehende
   Storage/ResourceSet (Querverweise auf die Metamodelle auflösen — nsURI-hrefs,
   vgl. bekannte Crossref-Problematik beim Save).
2. **Auswahllogik** je selektiertem Objekt: Workspace-UIModels schlagen App-Defaults;
   je Stufe über `targetClasses` (inkl. Supertypen) filtern → `filterExpression` auf
   der Instanz auswerten → höchste `priority` gewinnt → sonst Default-Generator
   (Phase 1). Ausbaustufe (nach dieser Iteration): Overrides nicht nur je Klasse,
   sondern **feature-spezifisch** (Workspace-Definition ersetzt einzelne Widgets
   eines Default-FormViews statt des ganzen UIModels).
3. File-Explorer: `*.uimodel.xmi` erkennen (Icon, Doppelklick öffnet zunächst den
   normalen Instance-Editor — uimodel.ecore ist ja als Package registriert:
   **UIModels lassen sich mit gene selbst editieren**, Dogfooding).
4. Reaktivität: Registry invalidiert bei Workspace-Änderungen (Datei gespeichert/gelöscht).

**Akzeptanz:** Ein im Workspace abgelegtes `person.uimodel.xmi` mit `targetClasses=Person`
verändert die Property-Anzeige für Person-Instanzen; andere Klassen fallen auf den
Default zurück.

### Phase 4 — Vollständige Ablösung der Alt-Anzeige

1. Restliche Bausteine als Widgets/Composer:
   - `DerivedField`/`CoclDerivedField` (read-only Widgets),
   - `OperationField` + Parameter-Dialog,
   - XMI-ID-Zeile und Primary-Key als kleine Spezial-Widgets bzw. fester Panel-Header,
   - OCL-Constraint-Formular (Metamodel-Modus) bleibt ggf. dauerhaft außerhalb des
     Composers (ist ein Editor für EAnnotation-Map-Entries, kein Feature-Formular).
2. Default-Generator um Derived/Operations-Sektionen erweitern, damit das
   Default-UIModel die heutige Anzeige 1:1 abbildet.
3. Flag-Default auf „an“; nach Stabilisierung: alte Template-Sektionen aus
   `PropertiesPanel.vue` entfernen, Flag ausbauen.
4. Metamodeler-Modus (`ctx.mode === 'metamodel'`) bleibt **in dieser Iteration beim
   alten Pfad** und wird erst in einer Folge-Iteration umgestellt (Entscheidung F3).

**Akzeptanz:** `PropertiesPanel.vue` enthält keine fest kodierte Feature-Iteration mehr;
alle bisherigen E2E-Tests grün ohne Flag.

### Phase 5 (optional, später)

- **Styles**: `uimodel-css`-StyleSheets (`styles.xmi`) aus dem Workspace an den Composer
  geben (Theming/Design-Tokens, Dark-Mode).
- **UIModel-Editor-Perspektive** in gene: Baum + Live-Preview (Anleihen am `editor/` des
  Composer-Projekts) statt nur generischem Instance-Editor.
- TableView/MasterDetail für Collections, SummaryView für Read-only-Ansichten,
  Vega/Maps-Erweiterungen bei Bedarf.

---

## 4. Risiken & Stolpersteine

| Risiko | Gegenmaßnahme |
|---|---|
| **Doppelte @emfts/core-Instanz** → Packages/Features aus fremder Registry werden nicht gefunden (bekanntes Muster, vgl. zentrale EPackageRegistry als TSM-Service) | vite `dedupe`, Composer als TSM-Shared-Lib, Smoke-Test in Phase 0 |
| **Vue-Instanz doppelt** (Composer importiert `vue`, gene nutzt `tsm:vue`) | dedupe auf gene's Vue; prüfen, dass provide/inject über die Grenze funktioniert |
| `WidgetComponent.feature` referenziert `EStructuralFeature` des Nutzer-Metamodells → **Proxy-Auflösung** beim Laden der UIModel-XMI (nsURI-href vs. `#//`-Fragment, bekannte Identitäts-Problematik) | Laden über dasselbe ResourceSet/Registry wie die Metamodelle; `resolveCrossResourceProxies` des Composers nutzen |
| Fokus-Verlust beim Tippen, wenn UIModel/Editor bei jeder Mutation neu erzeugt wird | Muster aus heutigem Panel übernehmen: `version` nur an Wert-Lese-Stellen, Editor/UIModel-Identität stabil halten |
| Reaktivität dynamischer EMF-Objekte (Composer erwartet reaktive Updates) | EContentAdapter/`triggerUpdate`-Anbindung in der Bridge; gezielt testen (EEnum-Literal-Fall aus fix/metamodeler-new-datatype) |
| Referenz-Widgets brauchen App-Kontext (Suche-Dialog, Instance-Tree) | Kontext ausschließlich über TSM-Services/`GENE_EDITOR_CONTEXT_KEY` injizieren, keine window-Zugriffe |

---

## 5. Entschiedene Fragen (2026-08-07)

- **F1:** Noch nicht veröffentlichen — für die Entwicklung wird **lokal gelinkt**
  (`npm link`, s. Phase 0). Veröffentlichung erst vor dem Merge nach main.
- **F2:** Es gibt **app-weite Default-UIModels**; später sollen Workspace-Definitionen
  die Konfiguration **feature- oder klassenspezifisch überschreiben** können
  (→ E7, Phase 3).
- **F3:** Metamodeler-Modus **ja, aber erst nach dieser Iteration** — diese Iteration
  betrifft nur den Instance-Modus.
- **F4:** **Gene-Widgets nutzen, wo sinnvoll**; andernfalls die Primitive des
  uimodel-composers. Wenn wir auf Beschränkungen stoßen, die sich damit nicht abbilden
  lassen, wird das **uimodel.ecore erweitert** (im EMFTs-Projekt, nicht per Hack in gene).
- **F5:** Validierung wird **auf eine Validierungs-Expression zusammengeführt**
  (OCL via ValidationExpression im UIModel, s. Phase 2 Punkt 2).

---

## 6. Referenzmodell & Verhaltens-Baseline (vor der Implementierung!)

Bevor umgebaut wird, wird der Ist-Zustand mit einem definierten Testmodell
festgeschrieben. Der Umbau gilt erst als abgenommen, wenn der Nachher-Stand
**an Ort und Stelle ist, genauso aussieht und sich genauso verhält**.

### 6.1 Test-Metamodell + Referenz-Instanz

Ein eigenes Test-Metamodell (`test-data/uimodel-baseline/…`) deckt **alle
Komponenten-Typen des Property-Views** ab; daraus wird eine feste Referenz-Instanz
(XMI) erstellt. Abgedeckt werden mindestens:

- Attribute aller Datentypen: EString, EInt, EDouble, EBoolean, EEnum, EDate,
  mehrwertiges Attribut, Pflichtfeld (`lowerBound=1`), iD-Attribut (Primary Key)
- Referenzen: Containment (konkret + abstrakter Typ mit mehreren Subklassen),
  Non-Containment (einwertig + mehrwertig), Referenz mit OCL-Referenzfilter
- Derived: Ecore-derived Attribut + Referenz, C-OCL-only Derived Feature
- Operationen: ohne Parameter + mit Parametern (→ Parameter-Dialog)
- Verschachtelung über mehrere Ebenen (Root → Kind → Enkel) für Breadcrumb/Navigation

Getestet wird der Property-View je **selektiertem Element-Typ**: Root-Objekt,
verschachteltes Kind-Objekt, Objekt jeder Klasse des Testmodells — d. h. jede
Widget-/Sektion-Ausprägung erscheint mindestens einmal.

### 6.2 Visuelle Baseline (Screenshots)

Vor der Implementierung nimmt eine eigene E2E-Suite
(`e2e/properties-baseline.spec.ts`) mit der Referenz-Instanz **Screenshots** des
Property-Panels auf — je Selektion aus 6.1 einen (Playwright
`toHaveScreenshot`-Snapshots, eingecheckt). Diese Bilder sind der
Vorher-Stand („so sah es vor dem Umbau aus").

### 6.3 Interaktions-Inventar („Absprungpunkte")

Ebenfalls vorab wird dokumentiert (Tabelle im Test-Ordner,
`test-data/uimodel-baseline/interaktions-inventar.md`) und per E2E abgesichert,
**welche Interaktionen aus dem Panel herausführen** — jeder Absprungpunkt mit
Auslöser und erwartetem Effekt:

- Dialoge, die sich öffnen: Such-Dialog (Referenz), Klassenauswahl bei
  Containment-Create (abstrakter Typ), Operation-Parameter-Dialog
- Actions, die angestoßen werden: Kind anlegen (Baum expandiert + selektiert neu),
  Save/Reset, XMI-ID editieren/generieren, Operation ausführen
- Navigation: Breadcrumb-Klick, Referenz-Navigation (Selektion springt im Baum),
  OCL-blockierte Zuweisung → Problems-Panel öffnet sich
- Reaktive Effekte nach außen: markDirty (Tab-`*`), triggerUpdate (Baum-Refresh)

### 6.4 Nachher-Abgleich

Nach der Umsetzung (Flag an) laufen dieselben Suites gegen dieselbe
Referenz-Instanz:

1. **Optik:** Screenshots aus 6.2 matchen (bzw. bewusst freigegebene, minimale
   Abweichungen werden einzeln begründet und als neue Baseline übernommen).
2. **Verhalten:** Jeder Absprungpunkt aus 6.3 ist vorhanden, öffnet dasselbe
   Ziel und hat denselben Effekt.
3. **Vollständigkeit:** Kein Feature der Referenz-Instanz fehlt im Panel, keine
   Sektion verschwindet, Reihenfolge/Gruppierung entspricht dem Default (solange
   kein autoriertes UIModel etwas anderes definiert).

---

## 7. Abnahmekriterien

Gelten für den Abschluss dieser Iteration (Phasen 0–4, Instance-Modus).
Nachweis per E2E gegen die Referenz-Instanz aus Abschnitt 6, sofern nicht anders
vermerkt.

### A — Funktional

| # | Kriterium |
|---|---|
| A1 | **Parität zum Ist-Stand:** Nachher-Abgleich aus 6.4 vollständig erfüllt — Screenshots matchen, alle Absprungpunkte (Dialoge, Actions, Navigation) vorhanden und verhaltensgleich. |
| A2 | **Modellgetriebenes Rendering nachweisbar:** Für eine Klasse des Referenzmodells existiert ein UIModel-XMI. Ändert man **nur das XMI** (Widget-Reihenfolge, Section-Zuordnung, Label), ändert sich die Anzeige entsprechend — ohne Codeänderung/Build. |
| A3 | **Editing-Roundtrip:** Werte aller Attribut-Typen und Referenz-Arten aus 6.1 sind über den Composer-Pfad änderbar und stehen nach Save korrekt im serialisierten XMI. |
| A4 | **Fallback:** Klassen ohne autoriertes UIModel rendern über den Default-Generator funktional äquivalent zur heutigen Anzeige (inkl. Pflichtfeld-`*`, Label-Ableitung, Sektionen). |
| A5 | **Override-Hierarchie:** Workspace-UIModel gewinnt gegen App-Default, App-Default gegen generierten Fallback; Löschen der Workspace-Datei reaktiviert den App-Default ohne App-Neustart. |
| A6 | **Auswahllogik:** Höhere `priority` gewinnt bei mehreren Treffern; `filterExpression` wählt instanzabhängig; `visibilityCondition` blendet Widgets reaktiv ein/aus. |
| A7 | **Validierung aus einer Quelle:** Fehler kommen aus OCL-`ValidationExpression` (am Feld sichtbar, mit Severity); keine Doppelmeldung aus altem und neuem Pfad. |

### B — Qualität / Nicht-funktional

| # | Kriterium |
|---|---|
| B1 | **Fokus-Stabilität:** Beim Tippen bleibt der Fokus über mehrere Zeichen erhalten; externe Modelländerungen (z. B. Umbenennen im Baum) aktualisieren die Anzeige trotzdem reaktiv. |
| B2 | **Feature-Flag:** Flag „aus" = exakt heutiges Verhalten. Alle bestehenden E2E-Suiten (`full-roundtrip`, `instance-move`, `metamodeler`, `perspectives`, `workspace`, `layout`, `app-bootstrap`) grün **mit Flag an und aus**. |
| B3 | **Metamodeler unberührt:** EClass/EPackage-Properties und Constraint-Editor laufen weiter über den alten Pfad; `metamodeler.spec.ts` ohne Anpassung grün. |
| B4 | **Eine Core-Instanz:** `UimodelPackage` ist über die zentrale `EPackageRegistry` (TSM-Service) auflösbar; ein geladenes UIModel referenziert die **identischen** `EStructuralFeature`-Objekte wie der Instance-Tree (Identitätsvergleich, kein Name-Matching). |
| B5 | **Projektregeln:** `vue-tsc`/ESLint sauber; keine `window.*`-Zugriffe (TSM/DI); keine Änderungen im EMFTs-Projekt aus gene heraus; auf dem Merge-Stand keine `file:`/lokalen Pfade in package.json oder Lockfile (npm link nur lokal während der Entwicklung). |
| B6 | **Plugin-Modularität:** `ui-uimodel-forms` hängt von keinem anderen UI-Plugin statisch ab; `ui-properties-panel` konsumiert es ausschließlich über den TSM-Service. |

### C — Manuelles Abnahme-Szenario (Nutzer)

1. Workspace mit Referenzmodell + Instanz öffnen → Default-Anzeige prüfen (A4),
   Werte editieren, speichern, XMI kontrollieren (A3).
2. Mitgeliefertes App-Default-UIModel ansehen → Anzeige folgt dem Modell (A2).
3. Kopie ins Workspace legen, Reihenfolge/Labels ändern → Panel übernimmt die
   Workspace-Variante (A5); alle Absprungpunkte durchklicken (A1).
4. Feature-Flag ausschalten → alte Anzeige, gleiche Daten (B2).

---

## 8. Erweiterungs-Spezifikation: Generische Layouts via `AllFeatures` (Folge-Iteration, EMFTs-Projekt)

**Eingereicht als Feature Request:** https://github.com/eclipse-fennec/emf.ts.ui/issues/2

**Motivation (Diskussion 2026-08-09):** Autorierte UIModels binden Widgets per
`feature href` an konkrete Features konkreter Klassen — klassenuebergreifende
Layouts („Id, dann alle Attribute, dann alle Referenzen") und Regeln
(„Feature `description` ueberall als Multiline-Editor") sind damit nicht
abbildbar. Der heutige Default-Generator in gene kodiert genau so ein Layout
hart — diese Semantik gehoert ins Metamodell und in den Composer, damit sie
fuer JEDEN Konsumenten gilt, nicht nur fuer gene.

### 8.1 Metamodell-Erweiterung (`uimodel.ecore`, Entscheidung F4)

```
EClass AllFeatures extends Component {
  with:     EStructuralFeature[*]    — explizite Auswahl, definierte Reihenfolge
  eType:    EClassifier[*]           — Typ-Filter (strukturierter Shortcut)
  filter:   Expression[0..1] (containment) — OCL/JS-Query GEGEN DAS FEATURE
  template: WidgetComponent[0..1]    — Widget-Prototyp (href, z. B. templates.uimodel.xmi)
  priority: EInt = 0                 — Konfliktaufloesung zwischen Bloecken
}
```

- **Kein Kategorie-Enum** (ATTRIBUTES/REFERENCES/DERIVED/…): Kategorien sind
  reflektiv am Feature ablesbar und werden als `filter`-Expression formuliert —
  `self` ist dabei das `EStructuralFeature` (Meta-Ebene!), im Unterschied zu
  `visibilityCondition`/`validations` (dort: Domaenenobjekt). Beispiele:
  `self.oclIsKindOf(ecore::EAttribute) and not self.derived`,
  `self.derived`, `self.iD`, `self.name = 'description'`, `self.containment`.
- **`template`**: `WidgetComponent` ohne gebundenes `feature` (dafuer
  `WidgetComponent.feature` auf `[0..1]` lockern + Constraint „ungebunden nur
  als Prototyp"). Pro Treffer: `EcoreUtil.copy`, `feature` binden, Label aus
  dem Feature ableiten, sofern der Prototyp keins vorgibt. Kein `template` →
  eingebautes Typ-Mapping (EBoolean→Checkbox, EInt→Number, EDate→Date,
  EEnum→Select, sonst Input; Referenzen→ReferenceLink).
- **Vorlagen-Bibliotheken**: eigenstaendige XMI-Dateien mit benannten
  Prototypen (`templates.uimodel.xmi#multiline`), workspace- und app-weit teilbar.

### 8.2 Auswahl- und Konflikt-Semantik

1. Grundmenge = alle Features der EClass (inkl. geerbte), in Feature-Reihenfolge.
2. `with` gesetzt → genau diese Features in dieser Reihenfolge; sonst schneiden
   `eType` und `filter` die Grundmenge zu (beide gesetzt = UND).
3. Treffen mehrere `AllFeatures`-Bloecke dasselbe Feature:
   `priority` (hoechste gewinnt) → Spezifitaet (`with` > gefiltert) →
   Dokument-Reihenfolge (first-match-wins). Das entscheidet die ZUORDNUNG des
   Features zu einem Block; die Block-Reihenfolge im Panel bleibt
   Dokument-Reihenfolge der `components`.
4. `Component.group` liefert wie gehabt die Sektions-Ueberschrift.

### 8.3 Renderer (uimodel-composer)

- **`AllFeaturesComposer`** als regulaerer Eintrag der ComposerRegistry
  (Muster: Komponente, die sich selbst enthalten kann — rendert pro Treffer
  `WidgetComposer`, fuer verschachtelte Faelle auch rekursiv Dispatcher).
- **Reiner Kern `expandFeatures(eClass, allFeatures, siblings): WidgetComponent[]`**
  als exportierte Utility — dieselbe Semantik fuer Renderer, UIModel-Editor
  (Live-Preview des effektiven Layouts) und Tests.
- Damit funktionieren Template-UIModels in ALLEN Composer-Konsumenten;
  gene ist reiner Konsument.

### 8.4 Beispiele

Generisches Default-Layout (ersetzt gene's hart kodierten Generator; wird als
`public/uimodels/generic-default.uimodel.xmi` App-Default):

```xml
<uimodel:UIModel name="generic-default">
  <components xsi:type="uimodel:AllFeatures" name="id" group="Identification">
    <filter language="OCL" body="self.iD"/>
  </components>
  <components xsi:type="uimodel:AllFeatures" name="attribute" group="Attributes">
    <filter language="OCL" body="self.oclIsKindOf(ecore::EAttribute) and not self.derived"/>
  </components>
  <components xsi:type="uimodel:AllFeatures" name="referenzen" group="References">
    <filter language="OCL" body="self.oclIsKindOf(ecore::EReference) and not self.derived"/>
  </components>
  <components xsi:type="uimodel:AllFeatures" name="derived" group="Derived Values">
    <filter language="OCL" body="self.derived"/>
  </components>
</uimodel:UIModel>
```

Klassenuebergreifende Verfeinerung (Workspace-Datei, eine Regel):

```xml
<uimodel:UIModel name="my-refinements" priority="10">
  <components xsi:type="uimodel:AllFeatures" name="beschreibungen" group="Attributes"
              template="templates.uimodel.xmi#multiline">
    <filter language="OCL" body="self.name = 'description'"/>
  </components>
</uimodel:UIModel>
```

### 8.5 Offene Entscheidungspunkte (EMFTs-Session)

- O1: Kann die OCL-Engine Meta-Level-Ausdruecke (`oclIsKindOf(ecore::EAttribute)`)?
  Fallback: JS-Expressions (`self.eClass().getName() === 'EAttribute'`) gehen sofort.
- O2: Duerfen Prototyp-`validations` Platzhalter (`self.${feature}`) enthalten
  (Substitution beim Klonen) oder bleibt v1 auf Widget-Typ/Konfiguration beschraenkt?
- O3: Dedup-Scope von first-match-wins: pro UIModel oder pro Sektion?
- O4: Validierung von `with` gegen `targetClasses` (Analogon zu
  `featureBelongsToTargetClasses`) oder stilles Leer-Matchen bei fremden Klassen?

### 8.6 Folgearbeiten in gene (nach der Composer-Erweiterung)

1. `generic-default.uimodel.xmi` + `templates.uimodel.xmi` nach `public/uimodels/`.
2. Default-Generator (`defaultUiModel.ts`) entfernen; Minimal-Fallback nur fuer
   „keine UIModel-Quelle verfuegbar".
3. `UimodelPropertiesView`: eigene ComposerRegistry um `AllFeaturesComposer`
   ergaenzen (oder auf Default-Registry des Composers umstellen).
4. Nachher-Abgleich wiederholen (Baseline mit UIMODEL_FLAG=true muss
   pixelidentisch bleiben, wenn das Template das heutige Layout abbildet).
