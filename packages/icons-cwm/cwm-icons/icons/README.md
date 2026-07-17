# CWM 1.1 — Klassen-Icons

143 handgezeichnete SVG-Icons, eines je Klasse des Common Warehouse Metamodel
(OMG CWM 1.1), erzeugt aus `model/cwm/model/cwm.ecore`.

## Inhalt

```
index.html                  Übersicht aller Icons - einfach im Browser öffnen
svg/<paket>/<Klasse>.svg    143 Icons, Paketstruktur des Metamodells gespiegelt
palette.md                  Farb-Tokens, Geometrie, Motivfamilien
glyphs.json                 das Artwork (die gezeichneten Pfade)
assemble.py                 setzt den Rahmen um das Artwork
```

## Ansehen

`index.html` im Browser öffnen — kein Server nötig, läuft direkt von der Platte.
Volltextsuche über Klassen- und Paketnamen, Größenschalter (16/24/32/48 px),
Hell/Dunkel-Umschaltung. Zeiger auf ein Icon zeigt den Beschreibungstext aus der
OMG-Spezifikation, ein Klick öffnet die zugehörige `.svg`-Datei.

## Das Icon liest sich so

| Merkmal | Bedeutung |
|---|---|
| **Glyph** in der Mitte | was die Klasse ist |
| **Randfarbe** | aus welchem Paket sie kommt (Farbton = Zweig, Helligkeit = Unterpaket) |
| **gestrichelter Rand** | die Klasse ist abstrakt (genau die 13 `abstract="true"` im Ecore) |

Verwandte Klassen teilen ihre Zeichnung: `Table` und `View` sind dasselbe Raster,
`PrimaryKey` und `UniqueConstraint` derselbe Schlüssel. Details in `palette.md`.

## Technisches

* `viewBox="0 0 24 24"`, Glyph zentriert auf (12,12), Feld 6..18.
* Beliebig skalierbar; 48×48 ist ein exaktes 2×.
* Jede Datei bedient Hell und Dunkel über `prefers-color-scheme`.
* Transparente Fläche — die Icons liegen auf jedem Hintergrund.

### Einbinden

Als Bild funktioniert es überall, ohne Vorbereitung:

```html
<img src="svg/resource/relational/Table.svg" width="24" alt="Table">
```

> **Achtung beim direkten Inline-Einbetten.** Jede Datei deklariert ihre Farbe als
> `:root { --stroke: … }` in einem eigenen `<style>`-Block. Standalone, per `<img>`,
> `<object>` oder als CSS-Hintergrund ist das korrekt. Kopierst du dagegen mehrere
> SVGs **direkt in dieselbe HTML-Seite**, zielen alle `:root`-Regeln auf dasselbe
> Dokument und die zuletzt eingefügte Farbe gewinnt für alle.
> Für diesen Fall den `<style>`-Block entfernen und die Farbe je Element setzen,
> z. B. `style="--stroke: light-dark(#115E59, #99F6E4)"`.

## Neu erzeugen

```bash
python3 assemble.py
```

Liest `glyphs.json` und holt `abstract="true"` direkt aus `cwm.ecore`; bricht ab,
wenn ein Glyph eine Klasse benennt, die es im Metamodell nicht gibt.

## Lizenz / Herkunft

Die Klassennamen und Beschreibungstexte stammen aus der OMG-Spezifikation
Common Warehouse Metamodel 1.1. Die Zeichnungen sind für Eclipse Daanse entstanden.
