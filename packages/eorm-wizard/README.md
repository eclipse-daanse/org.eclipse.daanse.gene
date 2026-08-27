# eorm-wizard

Web-Assistent, der aus einem **EMF-Modell** ein **eorm-Mapping** erzeugt — die
Beschreibung, wie EClasses auf Datenbank-Tabellen abgebildet werden
(Metamodell `eorm.ecore`, nsURI
`https://eclipse.org/fennec/persistence/eorm/1.0.0` aus
[`emf.persistence-jpa`](../../dim_xdp/emf.persistence-jpa)).

Bisher entstand die `.eorm`-Datei über eine Java-Main-Methode und wurde danach
laut Projektdoku „von Hand getunt" (Tabellennamen, Spaltentypen, Fetch-Modi).
Genau das macht dieser Assistent in Fachsprache: **Welche Klassen werden
gespeichert, unter welchem Tabellennamen, welche Spalte ist der Schlüssel, wie
werden Beziehungen abgelegt.**

## Ablauf

| Schritt | Inhalt |
|---|---|
| Modell | EMF-Modell aus Modelatlas, Workspace oder Datei laden |
| Klassen | Welche Klassen werden Tabellen — Tabellenname, Vererbungsart |
| Spalten | Spaltenname, Rolle (Schlüssel/Wert/Versionszähler), Schlüsselstrategie, Pflichtfeld, Länge |
| Beziehungen | 1:1 / 1:n / n:1 / n:m, Fremdschlüssel oder Zwischentabelle, Ladeverhalten, Kaskadierung |
| Zusammenfassung | Review, Bezeichner-Quoting, Download der `.eorm` oder Veröffentlichen im Modelatlas |

## Ableitungsregeln

Die Vorschläge sind der Java-Pipeline nachgebaut
(`org.eclipse.fennec.persistence.orm/.../processor/MappingProcessor` und die
Processor-Klassen) — siehe `src/wizard/context.ts`:

- Tabellenname = Klassenname in Großbuchstaben; Spaltenname aus der
  XSD-Annotation (`ExtendedMetaData/name`, z. B. `firstName` → `first_name`),
  sonst der Feature-Name
- Schlüssel = das `iD`-Attribut der EClass; Strategie: Zahl → Sequenz, Text → UUID
- `nullable` = Attribut ist nicht `required`
- Enthaltene Objekte (containment) → 1:n bzw. 1:1 mit Fremdschlüssel, sofort
  laden, Kaskadierung inkl. Löschen; freie Referenzen → n:1 bzw. n:m,
  bei Bedarf laden, ohne Kaskadierung
- Zweiseitige Beziehungen: Die Sammlungsseite verweist per `mappedBy` auf die
  Gegenseite (JPA-Standard)

**Zwei bewusste Abweichungen vom Java-Generator** (beide in `context.ts`
dokumentiert):

1. `unique` ist bei normalen Spalten **false**. Der Generator übernimmt
   `feature.isUnique()`, was bei EMF-Attributen fast immer `true` ist und zu
   falschen UNIQUE-Constraints führt — in den Referenzdateien `citizen.eorm`
   und `glt.eorm` trägt dadurch *jede* Spalte `unique="true"`.
2. Das Schlüssel-Attribut wird nur als `<id>` ausgegeben, nicht zusätzlich als
   `<basic>` (die Referenzdateien enthalten beides).

## Validierung

Der Assistent prüft, was laut Projektdoku sonst erst zur Laufzeit auffällt
(offenes Issue #29 „eorm model-level validation"):

- Jede gewählte Klasse braucht einen Schlüssel (sonst kein Weiterkommen)
- Tabellen- und Spaltennamen, die SQL-Schlüsselwörter sind (`order`, `user`,
  `year` …) → Warnung mit Hinweis auf das Bezeichner-Quoting (Issue #8)

## Entwicklung

```bash
npm install
npm run generate      # TS-Klassen aus model/eorm-wizard.ecore
npm run dev           # Vite-Dev-Server (Port 5599)
npm run test:run      # Transformer-/Ableitungstests (vitest)
npm run build         # Typprüfung + Produktions-Build
npm run build:plugin  # TSM-Plugin-Bundle für die gene-Shell
npm run mock:atlas    # Mock-Modelatlas für lokale Tests
```

Die Tests laufen gegen die echte Referenz aus dem Persistence-Projekt
(`test/fixtures/glt.ecore` + `glt.eorm`) und laden das erzeugte XMI im
Round-Trip gegen das dynamisch geladene `eorm.ecore` zurück.

## Modell-Synchronisation

`src/assets/eorm.ecore` und `epersistence.ecore` sind **Kopien**; Quelle der
Wahrheit ist `emf.persistence-jpa/org.eclipse.fennec.persistence.orm/model/`.
Nach Änderungen am Metamodell:

```bash
npm run sync:eorm-model
```

## Betrieb in gene

Wie der [SensiNact-Mapping-Assistent](../sensinact-mapping-wizard) läuft dieser
Wizard auch als TSM-Plugin in der gene-Shell (eigene Perspective
„eorm-Assistent"). Plugin-Repository auf Port 5499:

```bash
npm run build:plugin && npm run serve:plugin
```

## Lizenz

[EPL-2.0](https://www.eclipse.org/legal/epl-2.0/)
