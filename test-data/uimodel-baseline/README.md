# uimodel-baseline — Referenzmodell & Verhaltens-Baseline (Phase 0b)

Testdaten fuer die **Vorher/Nachher-Absicherung** des UiModel-Umbaus der
Property-Ansicht (siehe `docs/concepts/uimodel-properties-plan.md`,
Abschnitt 6). Die Suite `e2e/properties-baseline.spec.ts` friert Optik
(Screenshots) und Verhalten (Absprungpunkte) des heutigen Property-Views ein.

## Dateien

| Datei | Zweck |
|---|---|
| `library.ecore` | Baseline-Metamodell (Paket `librarybase`, nsURI `http://www.gene.org/uimodel-baseline/library/1.0`) |
| `library-instance.xmi` | Referenz-Instanz mit **stabilen `xmi:id`s** (`lib1`, `shelf1`, `book1`, ...) |
| `uimodel-baseline.wsp` | Workspace-Datei nach Vorbild `ocl-demo/OCLTest.wsp` (fuer manuelles Oeffnen ueber den File-Explorer) |
| `interaktions-inventar.md` | Tabelle aller Absprungpunkte des Panels mit Code-Referenzen |

## Modelluebersicht (Abdeckung nach Plan 6.1)

```
Library (Root)                         Shelf (Kind)          Medium (abstrakt)
  name      EString [1]  Pflichtfeld     name  EString [1]      name  EString [1]
  code      EString  iD  Primary Key     capacity EInt          genre Genre (EEnum)
  founded   EDate                        media -> Medium [*]   Book (Enkel)   Dvd (Enkel)
  rating    EDouble                        (Containment,         author         runtimeMinutes
  maxMembers EInt                           abstrakter Typ)      pages
  open      EBoolean                    Member
  tags      EString [*]  mehrwertig       name EString [1], email, isStaff EBoolean
  shelves   -> Shelf [*]   Containment, konkret
  members   -> Member [*]  Containment, konkret
  featuredMedium -> Medium [0..1]  Non-Containment, einwertig
  highlights     -> Medium [*]     Non-Containment, mehrwertig
  librarian      -> Member [0..1]  OCL-referenceFilter (nur isStaff=true)
  memberCount EInt   derived (OCL derivation)
  staff -> Member[*] derived Referenz (OCL derivation)
  getShelfCount(): EInt            EOperation ohne Parameter (OCL body)
  hasTag(searchTag: EString): EBoolean  EOperation mit Parameter (OCL body)
```

Verschachtelung ueber 3 Ebenen: `Library (lib1)` → `Shelf (shelf1)` →
`Book (book1)` / `Dvd (dvd1)` — fuer Breadcrumb- und Navigations-Tests.

## Baseline aufnehmen (einmalig, gegen den UNVERAENDERTEN Ist-Stand)

```bash
npx playwright test e2e/properties-baseline.spec.ts --update-snapshots
```

Die Screenshots landen in `e2e/properties-baseline.spec.ts-snapshots/` und
werden **eingecheckt** — sie sind der dokumentierte Vorher-Stand. Der Dev-Server
wird von Playwright automatisch gestartet (`playwright.config.ts`,
`npm run dev`); die Testdaten werden direkt aus `test-data/` gefetcht (der
Vite-Dev-Server liefert Dateien unterhalb des Projekt-Roots aus).

## Nachher-Abgleich (nach jedem Umbauschritt / mit Feature-Flag an)

```bash
npx playwright test e2e/properties-baseline.spec.ts
```

- **Optik:** `toHaveScreenshot` vergleicht gegen die eingecheckte Baseline.
  Bewusst freigegebene Abweichungen einzeln begruenden und per
  `--update-snapshots` als neue Baseline uebernehmen (Plan 6.4).
- **Verhalten:** Die Absprungpunkt-Tests muessen unveraendert gruen bleiben
  (Dialoge, Navigation, Create-Child, XMI-ID, Dirty-/Update-Effekte).

Ein einzelner Test:

```bash
npx playwright test e2e/properties-baseline.spec.ts -g "Breadcrumb"
```

## Hinweise

- Die Screenshots clippen auf das Panel-Element (`.properties-panel`), nicht
  auf die ganze Seite; der Panel-Inhalt scrollt intern, deshalb gibt es fuer
  das Root-Objekt zwei Snapshots (oben/unten).
- Alle Objekte haben feste `xmi:id`s; das Datum (`founded`) ist auf 12:00 UTC
  gesetzt, damit die Anzeige zeitzonenrobust ist. Baseline und Abgleich
  sollten trotzdem auf derselben Maschine/Umgebung laufen (Font-Rendering).
- `Save/Reset` im Panel-Header erscheinen im Instance-Modus nicht, da
  Aenderungen sofort ins Modell persistiert werden — Details und alle
  weiteren Absprungpunkte in `interaktions-inventar.md`.

## Befunde am Ist-Stand (bei der Baseline-Aufnahme entdeckt und behoben)

1. **OCL-Annotation-Source**: gene akzeptiert nur
   `http://www.eclipse.org/emf/2002/Ecore/OCL` (sowie fennec/m2x und
   OCL/Pivot) — `http://www.eclipse.org/emf/2002/OCL` (wie noch in
   `test-data/ocl-demo/company.ecore`) wird ignoriert; Operationen und
   Derived-Auswertung erscheinen dann nicht.
2. **Breadcrumb-Kollaps (App-Bug, behoben)**: PrimeVue styled-mode
   injizierte die Breadcrumb-Styles nichtdeterministisch — das `nav`
   kollabierte teils auf Hoehe 0, die Links waren unsichtbar und
   unklickbar (Hit-Test traf `panel-content`). Fix: explizites
   `display:flex` + `min-height` auf `.instance-breadcrumb` in
   `PropertiesPanel.vue`.
3. **Perspektiven-Race**: `openWorkspace(...)` rendert die Perspektive
   genau einmal; zu frueh aufgerufen fehlen noch nicht registrierte
   Panels dauerhaft. Die Suite wartet deshalb auf `ui.registry.panels`
   (siehe `setupBaseline`). Betrifft potenziell auch andere Specs.
