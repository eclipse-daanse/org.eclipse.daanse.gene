# Modul: OCL - Überblick

## 1. Zielsetzung

Die OCL-Unterstützung (Object Constraint Language) ermöglicht es, Constraints und Berechnungen modellgetrieben zu definieren und auszuführen. OCL wird in drei Rollen eingesetzt:

- **Validierung**: Prüfung von Instanzen gegen definierte Regeln
- **Derived Values**: Berechnung von abgeleiteten Attributen, Referenzen und Operationen
- **Referenz-Filter**: Einschränkung der Auswahl bei Referenzsetzung

---

## 2. OCL-Quellen

OCL-Ausdrücke können aus mehreren, gleichwertigen Quellen stammen:

### 2.1 Ecore-intern

- OCL-Ausdrücke sind direkt im Ecore-Modell hinterlegt
- Als Annotationen an:
  - EClass
  - EAttribute
  - EReference
  - EOperation
- Typischer Ursprung: Model Registry / EMF-Projekte
- Zweck: Modellnahe, standardisierte Constraints

### 2.2 Custom OCL (C-OCL)

- Externe, projektspezifische OCL-Definitionen
- Eigenes Metamodell mit Dateiendung `*.c-ocl`
- Zweck:
  - Erweiterung bestehender Modelle
  - Überschreibung oder Ergänzung von Ecore-OCL
  - Projekt- oder kontextabhängige Validierung

---

## 3. C-OCL Metamodell

### 3.1 Ecore-Definition (XMI)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="cocl" nsURI="http://www.gme.org/cocl/1.0" nsPrefix="cocl">

  <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
    <details key="documentation" value="Custom OCL (C-OCL) Metamodell zur Definition von projektspezifischen OCL-Constraints, die unabhängig vom Ecore-Modell verwaltet werden können."/>
  </eAnnotations>

  <!-- Enumeration: Severity -->
  <eClassifiers xsi:type="ecore:EEnum" name="Severity">
    <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
      <details key="documentation" value="Schweregrad einer OCL-Constraint-Verletzung. Bestimmt die Darstellung in der Log-Tabelle und das Verhalten bei Validierungsfehlern."/>
    </eAnnotations>
    <eLiterals name="TRACE" value="0">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Rein diagnostisch, nicht standardmäßig sichtbar. Für Entwickler und Debugging-Zwecke."/>
      </eAnnotations>
    </eLiterals>
    <eLiterals name="INFO" value="1">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Hinweis ohne Handlungsbedarf. Informiert den Nutzer über einen Zustand."/>
      </eAnnotations>
    </eLiterals>
    <eLiterals name="WARN" value="2">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Potenzielles Problem, das geprüft werden sollte. Blockiert keine Aktionen."/>
      </eAnnotations>
    </eLiterals>
    <eLiterals name="ERROR" value="3">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Fachlich ungültiger Zustand. Die Instanz entspricht nicht den definierten Regeln."/>
      </eAnnotations>
    </eLiterals>
    <eLiterals name="FATAL" value="4">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Kritischer Zustand. Weitere Verarbeitung sollte abgebrochen werden."/>
      </eAnnotations>
    </eLiterals>
  </eClassifiers>

  <!-- Enumeration: OclRole -->
  <eClassifiers xsi:type="ecore:EEnum" name="OclRole">
    <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
      <details key="documentation" value="Definiert die Rolle/Verwendung eines OCL-Ausdrucks im System."/>
    </eAnnotations>
    <eLiterals name="VALIDATION" value="0">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="OCL wird zur Validierung von Instanzen verwendet."/>
      </eAnnotations>
    </eLiterals>
    <eLiterals name="DERIVED" value="1">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="OCL wird zur Berechnung von Derived Values verwendet."/>
      </eAnnotations>
    </eLiterals>
    <eLiterals name="REFERENCE_FILTER" value="2">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="OCL wird zur Filterung von Referenzzielen verwendet."/>
      </eAnnotations>
    </eLiterals>
  </eClassifiers>

  <!-- Zentrale Klasse: OclConstraint -->
  <eClassifiers xsi:type="ecore:EClass" name="OclConstraint">
    <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
      <details key="documentation" value="Zentrale Klasse zur Definition eines OCL-Constraints. Enthält den OCL-Ausdruck, Metadaten und optionale Einschränkungen auf Zielobjekte."/>
    </eAnnotations>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="name" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Eindeutiger, sprechender Name des Constraints. Wird in der Log-Tabelle und in Fehlermeldungen angezeigt."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="description"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Fachliche Beschreibung des Constraints. Erklärt den Zweck und die Auswirkungen bei Verletzung."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="expression" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Der OCL-Ausdruck selbst. Muss syntaktisch korrekt sein und zum Kontexttyp passen."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="severity" lowerBound="1"
        eType="#//Severity" defaultValueLiteral="ERROR">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Schweregrad bei Constraint-Verletzung. Bestimmt Darstellung und Verhalten."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="role" lowerBound="1"
        eType="#//OclRole" defaultValueLiteral="VALIDATION">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Definiert die Verwendung des OCL-Ausdrucks (Validierung, Derived, Filter)."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="contextClass" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Vollqualifizierter Name der EClass, auf die sich dieser Constraint bezieht. Format: packageName.ClassName"/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="active" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EBoolean"
        defaultValueLiteral="true">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Gibt an, ob der Constraint aktiv ist. Inaktive Constraints werden bei der Validierung übersprungen."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="overrides"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EBoolean"
        defaultValueLiteral="false">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Wenn true, überschreibt dieser Constraint einen gleichnamigen Constraint aus einer Quelle mit niedrigerer Priorität (z.B. Ecore)."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EReference" name="targets" upperBound="-1"
        eType="ecore:EClass http://www.eclipse.org/emf/2002/Ecore#//EObject">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Optionale Liste von konkreten EObjects, auf die sich der Constraint beschränkt. Wenn leer, gilt der Constraint für alle Instanzen der contextClass."/>
      </eAnnotations>
    </eStructuralFeatures>
  </eClassifiers>

  <!-- Container: OclConstraintSet -->
  <eClassifiers xsi:type="ecore:EClass" name="OclConstraintSet">
    <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
      <details key="documentation" value="Container für eine Sammlung von OCL-Constraints. Entspricht einer *.c-ocl Datei."/>
    </eAnnotations>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="name" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Name des Constraint-Sets. Wird zur Identifikation und im Log verwendet."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="version"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"
        defaultValueLiteral="1.0">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Versionsnummer des Constraint-Sets für Kompatibilitätsprüfungen."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EReference" name="constraints" upperBound="-1"
        eType="#//OclConstraint" containment="true">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Liste der enthaltenen OCL-Constraints."/>
      </eAnnotations>
    </eStructuralFeatures>
  </eClassifiers>

</ecore:EPackage>
```

### 3.2 Beispiel: C-OCL Instanz (XMI)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<cocl:OclConstraintSet xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:cocl="http://www.gme.org/cocl/1.0"
    name="PersonConstraints" version="1.0">

  <constraints name="PersonMustHaveName"
      description="Jede Person muss einen Vornamen und Nachnamen haben."
      expression="not self.firstName.oclIsUndefined() and not self.lastName.oclIsUndefined() and self.firstName.size() > 0 and self.lastName.size() > 0"
      severity="ERROR"
      role="VALIDATION"
      contextClass="company.Person"
      active="true"/>

  <constraints name="AgeInValidRange"
      description="Das Alter einer Person muss zwischen 0 und 150 liegen."
      expression="self.age >= 0 and self.age <= 150"
      severity="ERROR"
      role="VALIDATION"
      contextClass="company.Person"
      active="true"/>

  <constraints name="EmailFormat"
      description="Die E-Mail-Adresse muss ein gültiges Format haben."
      expression="self.email.oclIsUndefined() or self.email.matches('[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}')"
      severity="WARN"
      role="VALIDATION"
      contextClass="company.Person"
      active="true"/>

</cocl:OclConstraintSet>
```

### 3.3 Attributübersicht

| Attribut | Typ | Pflicht | Beschreibung |
|----------|-----|---------|--------------|
| `name` | String | Ja | Eindeutiger, sprechender Name des Constraints |
| `description` | String | Nein | Fachliche Beschreibung / Zweck |
| `expression` | String | Ja | OCL-Ausdruck |
| `severity` | Severity | Ja | Log-/Fehlerstufe (Default: ERROR) |
| `role` | OclRole | Ja | Verwendungszweck (Default: VALIDATION) |
| `contextClass` | String | Ja | Vollqualifizierter Klassenname |
| `active` | Boolean | Ja | Constraint aktiv (Default: true) |
| `overrides` | Boolean | Nein | Überschreibt gleichnamigen Constraint |
| `targets` | EObject [0..*] | Nein | Optionale Einschränkung auf konkrete Objekte |

---

## 4. Geltungsbereich & Zielobjekte

Ein OCL-Constraint kann:

### 4.1 Implizit gelten

- Über seinen Kontext (`contextClass` im OCL-Ausdruck)
- Gilt für alle passenden Instanzen

### 4.2 Explizit eingeschränkt sein

- Über `targets: EObject[*]`
- Gilt nur für die referenzierten Objekte

**Regeln:**
- Ist `targets` leer → Constraint gilt für alle passenden Instanzen
- Ist `targets` gesetzt → Constraint gilt nur für diese konkreten Objekte
- Kombination mit Workspace/Perspektive möglich

---

## 5. Lade- und Aggregationslogik

Der Workspace lädt OCL-Definitionen aus drei Quellen:

```
┌─────────────────┐
│ Ecore-Dateien   │ ──▶ OCL aus EMF-Annotations
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ C-OCL-Dateien   │ ──▶ Explizit referenzierte *.c-ocl
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ C-OCL-Objekte   │ ──▶ Workspace-spezifisch (UI-Editor, In-Memory)
└─────────────────┘
        │
        ▼
┌─────────────────┐
│   Aggregiert    │ ──▶ Alle OCL verfügbar für Ausführung
└─────────────────┘
```

### 5.1 Zusammenführungsstrategie

Reihenfolge (aufsteigende Priorität):

1. **Ecore-OCL** (Basis)
2. **C-OCL-Dateien** (Projekt)
3. **Workspace-spezifische C-OCL-Objekte**

Spätere Quellen können frühere ergänzen oder überschreiben.

### 5.2 Konfliktbehandlung

- **Gleicher Name + gleicher Kontext**: Workspace > C-OCL-Datei > Ecore
- Konflikte werden geloggt (Severity INFO oder WARN)
- Konflikte sind im Meldungsbereich sichtbar
- Optional: Explizite Override-Markierung im C-OCL (`overrides="true"`)

---

## 6. UI-Darstellung

### 6.1 Meldungstabelle (unten)

Alle OCL-Ergebnisse erscheinen in der Meldungstabelle:

| Spalte | Beschreibung |
|--------|--------------|
| Severity | TRACE / INFO / WARN / ERROR / FATAL |
| Name | Name des OCL-Constraints |
| Beschreibung | Fachliche Beschreibung oder Fehlermeldung |
| Quelle | Ecore / C-OCL / Workspace |
| Betroffene Instanz | Referenz auf das Objekt |
| Pfad | Attribut- oder Referenzpfad |

### 6.2 Navigation & Interaktion

- **Klick auf Zeile**: Springe zur Instanz
- **Tooltip**: OCL-Ausdruck anzeigen
- **Filter**: Nach Severity, Constraint, Instanz/Klasse

---

## 7. Gemeinsame Komponenten

### 7.1 OCL-Editor

- Syntaxprüfung
- Auto-Completion (Kontextklassen, Attribute)
- Fehlermarkierung

### 7.2 OCL-Runtime

- Isolierte Ausführungsumgebung
- Timeout-Konfiguration
- Fehlerbehandlung ohne Systemabsturz

### 7.3 Fehlermeldungen

- Einheitliches Format
- Referenz auf Quelle und betroffene Instanz
- Kategorisierung nach Severity

---

## 8. Abgrenzungen

| Status | Beschreibung |
|--------|--------------|
| **Nicht im Scope** | Vollständiger OCL-Debugger |
| **Nicht im Scope** | Serverseitige OCL-Ausführung |
| **Nicht im Scope** | Automatische Änderung von Instanzen durch Validierungs-OCL |
| **Im Scope** | Read-only-Ausführung |
| **Im Scope** | Deterministisches, reproduzierbares Verhalten |

---

## 9. Sicherheits- und Stabilitätsanforderungen

- Keine Endlosschleifen (Timeout)
- Ressourcengrenzen (Memory, CPU)
- Fehlerhafte OCL darf System nicht stoppen
- Isolierte Ausführung

---

## 10. Anforderungstabelle

| ID | Priorität | Beschreibung | Akzeptanzkriterium |
|----|-----------|--------------|---------------------|
| GME-OCL-001 | MUSS | Der Workspace MUSS OCL-Ausdrücke aus Ecore-Dateien laden | Ecore-Annotationen werden erkannt und ausgeführt |
| GME-OCL-002 | MUSS | Der Workspace MUSS C-OCL-Dateien laden können | *.c-ocl wird gelesen, Constraints werden ausgeführt |
| GME-OCL-003 | MUSS | Das C-OCL-Metamodell MUSS Name, Beschreibung, Expression und Severity enthalten | Modellvalidierung schlägt fehl, wenn Attribute fehlen |
| GME-OCL-004 | MUSS | Severity MUSS die Werte TRACE, INFO, WARN, ERROR, FATAL unterstützen | UI zeigt alle Stufen korrekt an |
| GME-OCL-005 | MUSS | Constraints KÖNNEN optional auf konkrete EObjects eingeschränkt werden | Constraint greift nur für referenzierte Objekte |
| GME-OCL-006 | MUSS | Der Workspace MUSS OCL aus mehreren Quellen aggregieren | Alle Quellen sind gleichzeitig aktiv |
| GME-OCL-007 | MUSS | Die Quelle eines Constraints MUSS im UI sichtbar sein | Spalte "Quelle" vorhanden |
| GME-OCL-008 | MUSS | Konflikte zwischen OCL-Quellen MÜSSEN geloggt werden | Log-Eintrag bei Konflikt |
| GME-OCL-009 | MUSS | OCL-Ausführung MUSS ein Timeout haben | Konfigurierbare Zeitgrenze |
| GME-OCL-010 | SOLL | OCL-Ausdrücke SOLLEN im Tooltip angezeigt werden | Hover zeigt Expression |

---

## 11. Testfälle

| ID | Testfall | Erwartetes Ergebnis |
|----|----------|---------------------|
| T-OCL-001 | Ecore mit OCL-Annotation laden | Constraint wird erkannt |
| T-OCL-002 | C-OCL-Datei mit 5 Constraints laden | Alle 5 Constraints aktiv |
| T-OCL-003 | Constraint mit `targets` auf 2 Objekte | Nur diese 2 werden geprüft |
| T-OCL-004 | Konflikt: Gleicher Name in Ecore und C-OCL | C-OCL überschreibt, Warnung im Log |
| T-OCL-005 | OCL mit Endlosschleife | Timeout greift, Fehler im Log |
| T-OCL-006 | Fehlerhafte OCL-Syntax | Fehler im Log, System stabil |
