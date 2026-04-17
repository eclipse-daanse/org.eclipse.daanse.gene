# Modul: OCL - Derived Values (Attributes, References, Operations)

## 1. Zielsetzung

Ziel dieses Funktionsbereichs ist es, OCL-Expressions zur Laufzeit auszuführen, um:

- **Derived Attributes**: Abgeleitete Attribute
- **Derived References**: Abgeleitete Referenzen
- **Operations**: Mit und ohne Parameter

zu berechnen und darzustellen, ohne die zugrunde liegenden Instanzen dauerhaft zu verändern.

Die Ausführung erfolgt deterministisch, kontextabhängig und UI-integriert.

---

## 2. Begriffsabgrenzung

| Begriff | Bedeutung |
|---------|-----------|
| **Derived Attribute** | Attribut, dessen Wert ausschließlich über eine OCL-Expression berechnet wird |
| **Derived Reference** | Referenz, deren Ziel(e) über eine OCL-Expression ermittelt werden |
| **Derived Operation** | Operation mit OCL-Body, die ein Ergebnis liefert |
| **Live-Ausführung** | Berechnung erfolgt beim Zugriff, nicht vorab |
| **Persistenz** | Ergebnis wird nicht automatisch gespeichert |

---

## 3. Beispiel-Modell: Person mit Derived Values

### 3.1 Ecore-Definition (XMI)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="company" nsURI="http://www.gme.org/company/1.0" nsPrefix="company">

  <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
    <details key="documentation" value="Beispiel-Modell zur Demonstration von Derived Attributes, Derived References und Operations mit OCL."/>
  </eAnnotations>

  <!-- Enumeration: Gender -->
  <eClassifiers xsi:type="ecore:EEnum" name="Gender">
    <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
      <details key="documentation" value="Geschlecht einer Person."/>
    </eAnnotations>
    <eLiterals name="MALE" value="0"/>
    <eLiterals name="FEMALE" value="1"/>
    <eLiterals name="DIVERSE" value="2"/>
  </eClassifiers>

  <!-- Klasse: Person -->
  <eClassifiers xsi:type="ecore:EClass" name="Person">
    <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
      <details key="documentation" value="Repräsentiert eine Person mit persönlichen Daten, Familienbeziehungen und berechneten Feldern."/>
    </eAnnotations>

    <!-- Reguläre Attribute -->
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="firstName" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Vorname der Person. Pflichtfeld."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="lastName" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Nachname der Person. Pflichtfeld."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="title"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Akademischer Titel (z.B. Dr., Prof.). Optional."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="birthDate"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EDate">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Geburtsdatum der Person. Wird zur Altersberechnung verwendet."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="email"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="E-Mail-Adresse der Person."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="gender"
        eType="#//Gender">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Geschlecht der Person."/>
      </eAnnotations>
    </eStructuralFeatures>

    <!-- DERIVED ATTRIBUTE: fullName -->
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="fullName"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"
        changeable="false" volatile="true" transient="true" derived="true">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Vollständiger Name der Person. Berechnet aus Titel, Vorname und Nachname. Read-only."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="derivation" value="if self.title.oclIsUndefined() or self.title = '' then
  self.firstName.concat(' ').concat(self.lastName)
else
  self.title.concat(' ').concat(self.firstName).concat(' ').concat(self.lastName)
endif"/>
      </eAnnotations>
    </eStructuralFeatures>

    <!-- DERIVED ATTRIBUTE: age -->
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="age"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EInt"
        changeable="false" volatile="true" transient="true" derived="true">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Alter der Person in Jahren. Berechnet aus dem Geburtsdatum. Read-only."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="derivation" value="if self.birthDate.oclIsUndefined() then
  0
else
  (Date::now().year() - self.birthDate.year())
endif"/>
      </eAnnotations>
    </eStructuralFeatures>

    <!-- DERIVED ATTRIBUTE: isAdult -->
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="isAdult"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EBoolean"
        changeable="false" volatile="true" transient="true" derived="true">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Gibt an, ob die Person volljährig ist (>= 18 Jahre). Read-only."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="derivation" value="self.age >= 18"/>
      </eAnnotations>
    </eStructuralFeatures>

    <!-- Reguläre Referenz: children -->
    <eStructuralFeatures xsi:type="ecore:EReference" name="children" upperBound="-1"
        eType="#//Person">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Liste der Kinder dieser Person. Bidirektional mit 'parent'."/>
      </eAnnotations>
    </eStructuralFeatures>

    <!-- Reguläre Referenz: parent -->
    <eStructuralFeatures xsi:type="ecore:EReference" name="parent"
        eType="#//Person" eOpposite="#//Person/children">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Elternteil dieser Person. Bidirektional mit 'children'."/>
      </eAnnotations>
    </eStructuralFeatures>

    <!-- DERIVED REFERENCE: youngestChild -->
    <eStructuralFeatures xsi:type="ecore:EReference" name="youngestChild"
        eType="#//Person"
        changeable="false" volatile="true" transient="true" derived="true">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Das jüngste Kind dieser Person. Berechnet aus der children-Liste basierend auf dem Geburtsdatum. Read-only."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="derivation" value="if self.children->isEmpty() then
  null
else
  self.children->sortedBy(c | c.birthDate)->last()
endif"/>
      </eAnnotations>
    </eStructuralFeatures>

    <!-- DERIVED REFERENCE: oldestChild -->
    <eStructuralFeatures xsi:type="ecore:EReference" name="oldestChild"
        eType="#//Person"
        changeable="false" volatile="true" transient="true" derived="true">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Das älteste Kind dieser Person. Read-only."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="derivation" value="if self.children->isEmpty() then
  null
else
  self.children->sortedBy(c | c.birthDate)->first()
endif"/>
      </eAnnotations>
    </eStructuralFeatures>

    <!-- DERIVED REFERENCE: adultChildren -->
    <eStructuralFeatures xsi:type="ecore:EReference" name="adultChildren" upperBound="-1"
        eType="#//Person"
        changeable="false" volatile="true" transient="true" derived="true">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Alle volljährigen Kinder dieser Person. Read-only."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="derivation" value="self.children->select(c | c.isAdult)"/>
      </eAnnotations>
    </eStructuralFeatures>

    <!-- OPERATION ohne Parameter: getChildCount -->
    <eOperations name="getChildCount"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EInt">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Gibt die Anzahl der Kinder zurück."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="body" value="self.children->size()"/>
      </eAnnotations>
    </eOperations>

    <!-- OPERATION ohne Parameter: getInitials -->
    <eOperations name="getInitials"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Gibt die Initialen der Person zurück (z.B. 'M.M.' für Max Mustermann)."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="body" value="self.firstName.substring(1, 1).concat('.').concat(self.lastName.substring(1, 1)).concat('.')"/>
      </eAnnotations>
    </eOperations>

    <!-- OPERATION mit Parameter: hasChildOlderThan -->
    <eOperations name="hasChildOlderThan"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EBoolean">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Prüft, ob diese Person ein Kind hat, das älter als das angegebene Alter ist."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="body" value="self.children->exists(c | c.age > minAge)"/>
      </eAnnotations>
      <eParameters name="minAge" lowerBound="1"
          eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EInt">
        <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
          <details key="documentation" value="Das Mindestalter zum Vergleich."/>
        </eAnnotations>
      </eParameters>
    </eOperations>

    <!-- OPERATION mit Parameter: findChildByName -->
    <eOperations name="findChildByName" eType="#//Person">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Sucht ein Kind anhand des Vornamens. Gibt null zurück, wenn kein Kind gefunden wird."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="body" value="self.children->any(c | c.firstName = searchName)"/>
      </eAnnotations>
      <eParameters name="searchName" lowerBound="1"
          eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
        <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
          <details key="documentation" value="Der zu suchende Vorname."/>
        </eAnnotations>
      </eParameters>
    </eOperations>

  </eClassifiers>

</ecore:EPackage>
```

### 3.2 Beispiel-Instanz (XMI)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<company:Person xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:company="http://www.gme.org/company/1.0"
    firstName="Max"
    lastName="Mustermann"
    title="Dr."
    birthDate="1980-05-15"
    email="max.mustermann@example.com"
    gender="MALE">

  <children firstName="Anna" lastName="Mustermann" birthDate="2005-03-20" gender="FEMALE"/>
  <children firstName="Tom" lastName="Mustermann" birthDate="2010-08-12" gender="MALE"/>
  <children firstName="Lisa" lastName="Mustermann" birthDate="2015-01-30" gender="FEMALE"/>

</company:Person>
```

### 3.3 Berechnete Werte (Beispiel)

Für die obige Instanz werden folgende Derived Values berechnet:

| Feature | Berechneter Wert |
|---------|------------------|
| `fullName` | "Dr. Max Mustermann" |
| `age` | 45 (bei Ausführung 2025) |
| `isAdult` | true |
| `youngestChild` | Lisa Mustermann |
| `oldestChild` | Anna Mustermann |
| `adultChildren` | [Anna Mustermann] (wenn > 18) |
| `getChildCount()` | 3 |
| `getInitials()` | "M.M." |

---

## 4. Derived Attributes

### 4.1 Fachliches Verhalten

- Derived Attributes besitzen keinen manuell editierbaren Wert
- Ist eine OCL-Expression vorhanden:
  - Wird der Wert sofort berechnet, sobald das Attribut angezeigt oder abgefragt wird
- Die Berechnung erfolgt kontextbezogen auf die aktuelle Instanz

### 4.2 Ecore-Kennzeichnung

Derived Attributes werden in Ecore mit folgenden Flags gekennzeichnet:

```xml
<eStructuralFeatures xsi:type="ecore:EAttribute" name="fullName"
    eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"
    changeable="false"    <!-- Read-only -->
    volatile="true"       <!-- Nicht im Speicher gehalten -->
    transient="true"      <!-- Nicht serialisiert -->
    derived="true">       <!-- Berechnet -->
```

### 4.3 UI-Darstellung

- Derived Attributes sind als **read-only** gekennzeichnet
- Visuelles Icon (z.B. `fx` oder `∑`)
- Tooltip zeigt:
  - OCL-Expression
  - Quelle (Ecore / C-OCL / Workspace)
- Fehlerhafte Berechnung:
  - Anzeige leer oder Fehlerstatus
  - Eintrag in Log-Tabelle

---

## 5. Derived References

### 5.1 Fachliches Verhalten

- Derived References liefern eine oder mehrere Referenzen, die per OCL ermittelt werden
- Sie sind nicht manuell editierbar
- Berechnung erfolgt:
  - Beim Anzeigen
  - Beim expliziten Zugriff

### 5.2 Ecore-Kennzeichnung

Derived References verwenden dieselben Flags wie Derived Attributes:

```xml
<eStructuralFeatures xsi:type="ecore:EReference" name="youngestChild"
    eType="#//Person"
    changeable="false"
    volatile="true"
    transient="true"
    derived="true">
```

### 5.3 UI-Darstellung

- Darstellung wie normale Referenzen
- Kennzeichnung als "Derived"
- Navigation zum referenzierten Objekt möglich
- Tooltip mit:
  - OCL-Expression
  - Anzahl geprüfter Objekte

---

## 6. Operations (OCL-basierte Operationen)

### 6.1 Grundsätzliches

- Operations sind nicht automatisch persistiert
- Sie liefern:
  - Einen Rückgabewert
  - Oder eine berechnete Struktur
- Unterscheidung:
  - **Operations ohne Parameter**
  - **Operations mit Parametern**

### 6.2 Operations ohne Parameter

#### Ausführungsverhalten

- **Workspace-Einstellung**: "Automatische Ausführung parameterloser Operationen"
- **Default: NEIN**
- Wenn JA:
  - Operationen ohne Parameter werden wie Derived Attributes/References behandelt
  - Werden beim Anzeigen ausgeführt
- Wenn NEIN:
  - Operation wird nur manuell ausgeführt

#### UI

- Neben jeder Operation: **Button "Ausführen"**
- Klick führt Operation aus
- Ergebnis wird angezeigt

### 6.3 Operations mit Parametern

#### Ausführungsverhalten

- Operations mit Parametern werden **niemals automatisch** ausgeführt
- Immer manuell über UI

#### UI-Dialog

Beim Klick auf "Ausführen":

1. Modaler Dialog öffnet sich
2. Für jeden Parameter:
   - Name
   - Beschreibung (aus GenModel-Dokumentation)
   - Typ
   - Eingabefeld

**Unterstützte Eingaben:**

| Typ | UI-Element |
|-----|------------|
| Primitive (String, Number, Boolean) | Textfeld / Checkbox |
| Enumeration | Dropdown |
| Referenz | Auswahl aus passenden Objekten mit Such-/Filterfunktion |
| Komplexe Objekte | Auswahl bestehender Instanzen (keine Inline-Erstellung) |

**Aktionen:**
- **OK** → Operation ausführen
- **Abbrechen** → Keine Ausführung

#### Ergebnisdarstellung

- Rückgabewert wird inline oder in separatem Ergebnisbereich angezeigt
- Fehler → Log-Tabelle

---

## 7. Ausführungslogik

```
┌─────────────────┐
│ 1. Kontext      │
│    ermitteln    │
│    (Instanz)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. OCL-Expression│
│    laden        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Prüfung      │
│    - Typkompatibilität│
│    - Parameterbindung │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Ausführung   │
│    (isolierte   │
│    OCL-Runtime) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. Rückgabe     │
│    des Ergebnisses│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 6. Fehlerbehandlung│
│    & Logging    │
└─────────────────┘
```

---

## 8. Performance & Stabilität

### 8.1 Caching

- Derived Values dürfen gecacht werden
- Cache-Invalidierung bei:
  - Änderung abhängiger Attribute/Referenzen

### 8.2 Operations

- Werden nicht gecacht (Default)

### 8.3 Timeouts

- Pro OCL-Ausführung konfigurierbar

### 8.4 Fehlerbehandlung

- Fehlerhafte OCL dürfen UI nicht blockieren

---

## 9. Abgrenzungen

| Status | Beschreibung |
|--------|--------------|
| **Nicht im Scope** | Automatische Persistierung von Ergebnissen |
| **Nicht im Scope** | Seiteneffekte auf das Modell |
| **Nicht im Scope** | Rekursive Endlosschleifen |
| **Im Scope** | Read-only-Berechnung |
| **Im Scope** | UI-getriggerte Ausführung |

---

## 10. Anforderungstabelle

| ID | Priorität | Beschreibung | Akzeptanzkriterium |
|----|-----------|--------------|---------------------|
| GME-OCL-DER-001 | MUSS | Derived Attributes MÜSSEN live berechnet werden | Attributwert aktualisiert sich beim Anzeigen |
| GME-OCL-DER-002 | MUSS | Derived Attributes DÜRFEN nicht editierbar sein | UI verhindert Eingabe |
| GME-OCL-DER-003 | MUSS | Derived References MÜSSEN über OCL berechnet werden | Referenzziel entspricht OCL-Ergebnis |
| GME-OCL-DER-004 | MUSS | Derived References DÜRFEN nicht manuell gesetzt werden | UI ist read-only |
| GME-OCL-DER-005 | MUSS | Operations ohne Parameter DÜRFEN automatisch ausgeführt werden | Workspace-Setting aktiv |
| GME-OCL-DER-006 | MUSS | Default für automatische Operationen MUSS "Nein" sein | Neue Workspaces |
| GME-OCL-DER-007 | MUSS | Operations MÜSSEN manuell ausführbar sein | Button vorhanden |
| GME-OCL-DER-008 | MUSS | Operations mit Parametern MÜSSEN einen Dialog öffnen | Dialog zeigt alle Parameter |
| GME-OCL-DER-009 | MUSS | Parameter MÜSSEN typgerecht erfasst werden | Validierung im Dialog |
| GME-OCL-DER-010 | MUSS | Ergebnisse MÜSSEN dargestellt werden | UI zeigt Rückgabewert |
| GME-OCL-DER-011 | MUSS | Derived Values MÜSSEN als read-only gekennzeichnet sein | Visueller Indikator vorhanden |
| GME-OCL-DER-012 | MUSS | Tooltip MUSS OCL-Expression anzeigen | Hover zeigt Expression |
| GME-OCL-DER-013 | SOLL | Derived Values SOLLEN gecacht werden | Performance bei wiederholtem Zugriff |
| GME-OCL-DER-014 | SOLL | Cache SOLL bei Änderungen invalidiert werden | Wert wird neu berechnet |

---

## 11. Testfälle

| ID | Testfall | Erwartetes Ergebnis |
|----|----------|---------------------|
| T-OCL-DER-001 | Änderung von `firstName` | `fullName` ändert sich sofort |
| T-OCL-DER-002 | Leerer `title` | Korrekte Namensbildung ohne Titel |
| T-OCL-DER-003 | Hinzufügen eines Kindes | `youngestChild` aktualisiert sich |
| T-OCL-DER-004 | Automatische Operationen deaktiviert | Keine Ausführung beim Anzeigen |
| T-OCL-DER-005 | Automatische Operationen aktiviert | Ausführung beim Anzeigen |
| T-OCL-DER-006 | Operation mit Parameter | Dialog korrekt befüllt |
| T-OCL-DER-007 | Ungültiger Parameter | Fehler im Dialog |
| T-OCL-DER-008 | Versuch, Derived Attribute zu editieren | UI blockiert Eingabe |
| T-OCL-DER-009 | Referenzauswahl im Parameter-Dialog | Alle passenden Objekte angezeigt |
| T-OCL-DER-010 | OCL mit Fehler | Fehler in Log-Tabelle, UI stabil |
