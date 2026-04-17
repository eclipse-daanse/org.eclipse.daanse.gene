# Anforderungen: Speicherung von XMI-Files in Gene

**Datum:** 13. April
**Abgestimmt mit:** Stefan

---

## 1. Grundprinzip

Das Speichern von Instanzen erfolgt **nicht automatisch in eine einzelne Ressource**.
Stattdessen wird ein **Dialog bereitgestellt**, in dem festgelegt werden kann:

* wie Instanzen
* auf mehrere XMI-Dateien

aufgeteilt werden.

---

## 2. Aufteilungslogik mittels OCL

Zur Steuerung der Aufteilung werden **OCL-Constraints** verwendet.

### Variante 1: Mapping im Workspace-File

* Struktur:

  * **Key:** Klassenname
  * **Value:** OCL-Expression
* Die OCL-Expression bestimmt:

  * den **Dateinamen**, in den die Instanz gespeichert wird

**Beispiel (konzeptionell):**

```
Table -> self.name
```

---

### Variante 2: Erweiterte OCL-Logik (COCL / Expressions-Kette)

Alternative Umsetzung über:

* ein erweitertes Feld im Workspace-File
* oder ein externes COCL-Dokument

#### Eigenschaften:

* Mehrere OCL-Expressions möglich
* Ausführung erfolgt **priorisiert und sequentiell**
* Jede Expression kann:

  * Bedingungen prüfen
  * optional einen Dateinamen zurückgeben

#### Beispielhafte Logik:

```
if self.oclIsTypeOf(Table) and not self.name.oclIsUndefined()
then self.name
else null
```

* Expressions werden nacheinander ausgewertet
* Erste passende Expression bestimmt den Dateinamen

---

## 3. Umgang mit nicht gematchten Instanzen

* Instanzen, die **keiner Expression entsprechen**:

  * werden in eine **Rest-Datei** geschrieben
* Diese Datei enthält:

  * alle nicht zugeordneten Elemente

---

## 4. Workspace-Konfiguration

Im Workspace wird zusätzlich definiert:

* welche XMI-Dateien existieren
* welche Pfade verwendet werden
* welche Dateien beim Laden berücksichtigt werden

---

## 5. Laden der Daten

* Beim Laden werden:

  * alle im Workspace definierten Dateien geladen
* Die Auflösung erfolgt weiterhin über:

  * **DNS URI**

---

## 6. Export-Funktion

Zusätzliches Feature:

### "Export als XMI"

* Exportiert **alle Instanzen**
* als **ein einzelnes XMI-File**
* ohne Aufteilungslogik („plain export“)

---

## 7. Zusammenfassung

* Flexible Aufteilung von Instanzen auf mehrere Dateien
* Steuerung über OCL-basierte Regeln
* Zwei alternative Implementierungsansätze:

  1. Einfaches Klassen-Mapping
  2. Priorisierte Expression-Kette
* Fallback-Mechanismus für nicht gematchte Instanzen
* Klare Trennung zwischen:

  * strukturierter Speicherung
  * einfachem Gesamt-Export

---
