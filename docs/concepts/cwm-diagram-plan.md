# CWM-Diagramme modellgetrieben – Plan

Stand: 2026-10-11

## Entscheidung

Die Diagramme im CWM-Editor bleiben **modellgetrieben**: Eine Diagrammdefinition
(Instanz von `diagrammodel.ecore`) beschreibt, was gezeichnet wird; ein
generischer Interpreter (`packages/ui-diagram-preview`) führt sie gegen ein
beliebiges EMF-Modell aus, ELK legt aus, ein SVG-Renderer zeichnet. Es gibt
keinen Code je Diagrammart.

Vorlage für Inhalt und Aussehen sind die Diagramme des daanse-Projekts
(`org.eclipse.daanse.cwm.diagram.*`, Exporte unter
`/home/markus/doc/diagram_all_src_exports/diagram`: Doku
`documentation/diagram-types.md`, `documentation/visualization-rules.md`,
SVGs unter `examples/`). Was dort ein Java-Konverter mit einem
`*DiagramFeatures`-Record leistet, muss sich bei uns als Definition ausdrücken
lassen. Dafür wird das Framework erweitert – generisch, nicht CWM-spezifisch.

## Stand

- `ui-diagram-preview` (vom Branch `ui-forms-diagramms`) und `tsrouter` sind
  übernommen und im CWM-Editor eingebunden: Diagrammbereich je Zeile,
  „anzeigen“, Vollbild, Klick auf einen Knoten wählt das Objekt.
- Definitionen `cwm-erd-diagram.xmi` (Schema, Tabellen, Views),
  `cwm-class-diagram.xmi` (Package, Klassen, Assoziationen) und
  `cwm-nomenclature-diagram.xmi` (Business Nomenclature: BusinessDomain,
  Taxonomy, Glossary als Rahmen mit Concepts und Terms, zwei Ebenen; Kanten
  „bedeutet“ Term → Concept, Unterbegriff, bevorzugt, verwandt (gestrichelt),
  Taxonomien eines Glossars; Concept und Term als Fokusdiagramm mit ihren
  Nachbarn im Rahmen ihrer nächsten Sammlung; Varianten „Voll“ und „Nur
  Begriffshierarchie“).
- Erste Erweiterungen: Varianten (minimal … mit Objekten) mit Auswahl im
  Diagramm, farbige Abschnitte, Badges mit Farbe, PK/FK-Symbol,
  Kardinalitäten an Kantenenden. Abgeleitete Information (PK/FK, Indizes
  einer Tabelle, Trigger) steht noch als **JS-Ausdruck** in der Definition –
  das wird durch deklarative Konstrukte ersetzt.

## Lücken und Erweiterungen des Frameworks

### A. Navigation deklarativ statt JS

CWM legt vieles nur auf einer Seite ab (Index → Tabelle, PrimaryKey → Spalten,
Trigger → Tabelle). Die Definition braucht dafür Pfade, die mehr können als
Referenzen vorwärts:

- Pfadschritte: Referenz vorwärts, **invers** (Objekte, deren Referenz auf das
  aktuelle zeigt, gesucht im Diagramm-Umfang), **Container**, Klassenfilter je
  Schritt.
- Bedingungen: *existiert* (Pfad nicht leer), Attribut gleich Wert/Literal,
  gesetzt, und/oder/nicht.
- Werte: Text aus einem Pfad + Feature (Typname, `initialValue.body`),
  Multiplizität aus `multiplicity.range` (lower..upper).

Damit werden z. B. ausdrückbar: Spalte ist im PrimaryKey (invers über
`UniqueKey.feature`, Klasse PrimaryKey, existiert), Indizes einer Tabelle
(invers über `Index.spannedClass`), Trigger einer Tabelle (invers über
`Trigger.table`).

### B. Schalter und Voreinstellungen statt fester Varianten

Wie die daanse-Records (`DatabaseDiagram.Features`, `ClassDiagramFeatures`):

- **Schalter** in der Definition: boolesch (Spalten, Spaltentypen, PK-Symbole,
  Kardinalitäten …) oder Aufzählung – für Indizes, Uniques, Checks, Trigger die
  Darstellung `HIDDEN | INLINE | OBJECT | BOTH`.
- Knoten, Abschnitte, Badges, Symbole und Kanten hängen an Schaltern
  („nur wenn Indizes = INLINE oder BOTH“).
- **Voreinstellungen** (minimal, Schlüssel & Beziehungen, Spalten, voll, mit
  Objekten) sind Belegungen der Schalter. Die Auswahl im Diagramm wählt eine
  Voreinstellung; einzelne Schalter sind später einzeln umstellbar.

### C. Knoten

- Badges im Kopf (TMP, SYS, abstract) mit Bedingung.
- Kursiver Titel (abstrakte Klassen), Stereotyp-Zeile (`«…»`).
- Hauptobjekt: grauer Rahmen + Badge „main“ statt Leuchten
  (visualization-rules „Main-object focus“).
- Container um das eigene Objekt (Package, Schema, Catalog) und
  verschachtelte Container (Schemas im Catalog, Pakete im Paket).

### D. Zeilen

- Führende Symbole mit Bedingung (PK, FK, Parameterrichtung in/out/inout).
- Beschriftung aus Teilen: Präfix (Sichtbarkeit `+ # - ~`), Name, Suffix
  (`= Default`), Typ, Multiplizität; unterstrichen (static).
- Verbinder innerhalb des Knotens: Index-/Unique-/Check-/Trigger-Zeile zu den
  Spaltenzeilen, die sie betreffen (die Klammern rechts in den daanse-Bildern).

### E. Kanten

- Linienstil je Kante (durchgezogen, gestrichelt, «usage»).
- Kardinalitäten aus Features (Multiplizität der Enden) oder fest.
- Enden-Dekoration aus einem Literal (Aggregation: none/shared/composite →
  ohne/hohle/gefüllte Raute), Navigierbarkeit als Pfeil.
- Endbeschriftungen (Rollennamen), Kantenname.
- Hyperkanten für zusammengesetzte Fremdschlüssel.

### F. Bindungen: welches Objekt zeigt welches Diagramm

Heute in Code (`cwmDiagram.ts`). Künftig in der Definition: je Quellklasse
der Weg zur Diagrammwurzel und was hervorgehoben wird – inklusive
**Fokusdiagrammen** (Klasse + Assoziations-/Vererbungspartner je in ihrem
Paket; Datentyp + verwendende Klassen, nur die betroffenen Zeilen).

## Iterationen

1. **Framework-Kern:** A (Pfade, Bedingungen, Werte) und B (Schalter,
   Voreinstellungen), C (Kopf-Badges, Hauptobjekt). ERD-Definition ohne JS
   neu schreiben.
2. **Datenbankdiagramm** auf daanse-Stand: D (Verbinder), E (Hyperkanten,
   Linienstile), Container für Schema/Catalog, Prozeduren und Funktionen.
3. **Klassendiagramm** auf daanse-Stand: Sichtbarkeit, Multiplizitäten,
   Aggregation/Komposition, Enumerationen, Interfaces, geerbte Features.
4. **Bindungen und Fokusdiagramme** (F).
5. Weitere Diagrammarten nach `diagram-types.md` (Instanzen, Nomenklatur,
   Deployment, …).

Jede Iteration: Definition erweitern → mit dem Showcase-Modell
(`cwm-xmi-uebergabe/06-showcases/diagram-showcase.xmi`) gegen die daanse-SVGs
vergleichen → Abnahme durch den Nutzer → nächste Iteration.
