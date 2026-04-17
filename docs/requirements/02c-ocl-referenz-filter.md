# Modul: OCL - Referenz-Selektion (Filter)

## 1. Zielsetzung

Ziel dieses Funktionsbereichs ist es, beim Setzen von Referenzen nur fachlich zulässige Zielobjekte zur Auswahl anzubieten, indem eine OCL-Expression als Filterkriterium verwendet wird.

Dadurch wird:
- Die Auswahlmenge reduziert
- Fehlzuweisungen vermieden
- Die Benutzerführung verbessert

Die Filterung erfolgt **vor der Auswahl**, nicht erst als nachgelagerte Validierung.

---

## 2. Anwendungsfall

Beim Setzen einer Referenz (z.B. über Dialog, Dropdown oder Suchauswahl):

```
┌─────────────────┐
│ 1. Ermittlung   │
│    aller möglichen│
│    Referenzziele │
│    (nach Typ)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Anwendung    │
│    der OCL-     │
│    Expression   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Entfernung   │
│    nicht valider │
│    Referenzziele │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Anzeige der  │
│    gefilterten  │
│    Liste        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. Auswahl und  │
│    Setzen der   │
│    Referenz     │
└─────────────────┘
```

---

## 3. Beispiel-Modell: Organisation mit Referenz-Filtern

### 3.1 Ecore-Definition (XMI)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="organization" nsURI="http://www.gme.org/organization/1.0" nsPrefix="org">

  <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
    <details key="documentation" value="Beispiel-Modell zur Demonstration von OCL-basierten Referenz-Filtern bei der Auswahl von Zielobjekten."/>
  </eAnnotations>

  <!-- Enumeration: Status -->
  <eClassifiers xsi:type="ecore:EEnum" name="Status">
    <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
      <details key="documentation" value="Aktivitätsstatus eines Elements."/>
    </eAnnotations>
    <eLiterals name="ACTIVE" value="0">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Element ist aktiv und kann referenziert werden."/>
      </eAnnotations>
    </eLiterals>
    <eLiterals name="INACTIVE" value="1">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Element ist inaktiv und sollte nicht mehr referenziert werden."/>
      </eAnnotations>
    </eLiterals>
    <eLiterals name="ARCHIVED" value="2">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Element ist archiviert und darf nicht mehr referenziert werden."/>
      </eAnnotations>
    </eLiterals>
  </eClassifiers>

  <!-- Klasse: Organization -->
  <eClassifiers xsi:type="ecore:EClass" name="Organization">
    <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
      <details key="documentation" value="Wurzelelement einer Organisation. Enthält Abteilungen und Mitarbeiter."/>
    </eAnnotations>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="name" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Name der Organisation."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EReference" name="departments" upperBound="-1"
        eType="#//Department" containment="true">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Alle Abteilungen dieser Organisation."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EReference" name="employees" upperBound="-1"
        eType="#//Employee" containment="true">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Alle Mitarbeiter dieser Organisation."/>
      </eAnnotations>
    </eStructuralFeatures>
  </eClassifiers>

  <!-- Klasse: Department -->
  <eClassifiers xsi:type="ecore:EClass" name="Department">
    <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
      <details key="documentation" value="Eine Abteilung innerhalb der Organisation."/>
    </eAnnotations>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="name" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Name der Abteilung."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="status" lowerBound="1"
        eType="#//Status" defaultValueLiteral="ACTIVE">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Aktivitätsstatus der Abteilung."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="maxCapacity"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EInt"
        defaultValueLiteral="10">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Maximale Anzahl von Mitarbeitern in dieser Abteilung."/>
      </eAnnotations>
    </eStructuralFeatures>

    <!-- Referenz mit OCL-Filter: manager -->
    <eStructuralFeatures xsi:type="ecore:EReference" name="manager"
        eType="#//Employee">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Der Manager dieser Abteilung. Muss ein aktiver Mitarbeiter mit Manager-Level sein."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="referenceFilter" value="target.status = Status::ACTIVE and target.level >= 3"/>
      </eAnnotations>
    </eStructuralFeatures>

    <!-- Referenz mit OCL-Filter: members -->
    <eStructuralFeatures xsi:type="ecore:EReference" name="members" upperBound="-1"
        eType="#//Employee">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Mitarbeiter dieser Abteilung. Nur aktive Mitarbeiter können hinzugefügt werden. Kapazitätsgrenze wird geprüft."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="referenceFilter" value="target.status = Status::ACTIVE and self.members->size() &lt; self.maxCapacity and not self.members->includes(target)"/>
      </eAnnotations>
    </eStructuralFeatures>
  </eClassifiers>

  <!-- Klasse: Employee -->
  <eClassifiers xsi:type="ecore:EClass" name="Employee">
    <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
      <details key="documentation" value="Ein Mitarbeiter der Organisation."/>
    </eAnnotations>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="firstName" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Vorname des Mitarbeiters."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="lastName" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Nachname des Mitarbeiters."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="email"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="E-Mail-Adresse des Mitarbeiters."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="status" lowerBound="1"
        eType="#//Status" defaultValueLiteral="ACTIVE">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Aktivitätsstatus des Mitarbeiters."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="level"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EInt"
        defaultValueLiteral="1">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Hierarchie-Level des Mitarbeiters. 1=Junior, 2=Senior, 3=Lead, 4=Manager, 5=Director."/>
      </eAnnotations>
    </eStructuralFeatures>

    <!-- Referenz mit OCL-Filter: supervisor -->
    <eStructuralFeatures xsi:type="ecore:EReference" name="supervisor"
        eType="#//Employee">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Vorgesetzter dieses Mitarbeiters. Muss ein höheres Level haben und darf nicht die Person selbst sein."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="referenceFilter" value="target &lt;&gt; self and target.status = Status::ACTIVE and target.level > self.level"/>
      </eAnnotations>
    </eStructuralFeatures>

    <!-- Referenz mit OCL-Filter: mentor -->
    <eStructuralFeatures xsi:type="ecore:EReference" name="mentor"
        eType="#//Employee">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Mentor für diesen Mitarbeiter. Muss mindestens Senior-Level (2) haben und aktiv sein."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="referenceFilter" value="target &lt;&gt; self and target.status = Status::ACTIVE and target.level >= 2"/>
      </eAnnotations>
    </eStructuralFeatures>

    <!-- Derived: fullName -->
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="fullName"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"
        changeable="false" volatile="true" transient="true" derived="true">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Vollständiger Name des Mitarbeiters."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="derivation" value="self.firstName.concat(' ').concat(self.lastName)"/>
      </eAnnotations>
    </eStructuralFeatures>
  </eClassifiers>

  <!-- Klasse: Project -->
  <eClassifiers xsi:type="ecore:EClass" name="Project">
    <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
      <details key="documentation" value="Ein Projekt innerhalb der Organisation."/>
    </eAnnotations>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="name" lowerBound="1"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Name des Projekts."/>
      </eAnnotations>
    </eStructuralFeatures>

    <eStructuralFeatures xsi:type="ecore:EAttribute" name="status" lowerBound="1"
        eType="#//Status" defaultValueLiteral="ACTIVE">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Status des Projekts."/>
      </eAnnotations>
    </eStructuralFeatures>

    <!-- Referenz mit OCL-Filter: lead -->
    <eStructuralFeatures xsi:type="ecore:EReference" name="lead"
        eType="#//Employee">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Projektleiter. Muss mindestens Lead-Level (3) haben."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="referenceFilter" value="target.status = Status::ACTIVE and target.level >= 3"/>
      </eAnnotations>
    </eStructuralFeatures>

    <!-- Referenz mit OCL-Filter: teamMembers -->
    <eStructuralFeatures xsi:type="ecore:EReference" name="teamMembers" upperBound="-1"
        eType="#//Employee">
      <eAnnotations source="http://www.eclipse.org/emf/2002/GenModel">
        <details key="documentation" value="Teammitglieder des Projekts. Nur aktive Mitarbeiter, die nicht bereits Projektleiter sind."/>
      </eAnnotations>
      <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
        <details key="referenceFilter" value="target.status = Status::ACTIVE and target &lt;&gt; self.lead"/>
      </eAnnotations>
    </eStructuralFeatures>
  </eClassifiers>

</ecore:EPackage>
```

### 3.2 Beispiel-Instanz (XMI)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<org:Organization xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:org="http://www.gme.org/organization/1.0"
    name="ACME Corp">

  <departments name="Engineering" status="ACTIVE" maxCapacity="20">
    <manager xsi:nil="true"/> <!-- Wird über Referenz-Selektion gesetzt -->
  </departments>

  <departments name="Sales" status="ACTIVE" maxCapacity="15"/>

  <departments name="Legacy Support" status="INACTIVE" maxCapacity="5"/>

  <employees firstName="Anna" lastName="Schmidt" email="anna.schmidt@acme.com"
      status="ACTIVE" level="4"/>

  <employees firstName="Max" lastName="Müller" email="max.mueller@acme.com"
      status="ACTIVE" level="3"/>

  <employees firstName="Lisa" lastName="Weber" email="lisa.weber@acme.com"
      status="ACTIVE" level="2"/>

  <employees firstName="Tom" lastName="Bauer" email="tom.bauer@acme.com"
      status="ACTIVE" level="1"/>

  <employees firstName="Eva" lastName="Fischer" email="eva.fischer@acme.com"
      status="INACTIVE" level="3"/>

  <employees firstName="Paul" lastName="Koch" email="paul.koch@acme.com"
      status="ARCHIVED" level="2"/>

</org:Organization>
```

### 3.3 Filter-Ergebnisse (Beispiel)

Für die obige Instanz ergeben sich folgende Filter-Ergebnisse:

| Referenz | OCL-Filter | Valide Kandidaten |
|----------|------------|-------------------|
| `Department.manager` | `target.status = ACTIVE and target.level >= 3` | Anna Schmidt (4), Max Müller (3) |
| `Department.members` | `target.status = ACTIVE and size < maxCapacity` | Anna, Max, Lisa, Tom (alle aktiven, Kapazität prüfen) |
| `Employee.supervisor` | `target <> self and target.status = ACTIVE and target.level > self.level` | Für Tom: Anna, Max, Lisa |
| `Employee.mentor` | `target <> self and target.status = ACTIVE and target.level >= 2` | Für Tom: Anna, Max, Lisa |
| `Project.lead` | `target.status = ACTIVE and target.level >= 3` | Anna Schmidt, Max Müller |

**Ausgefilterte Kandidaten:**
- Eva Fischer (status = INACTIVE)
- Paul Koch (status = ARCHIVED)

---

## 4. OCL-Filterdefinition am Referenzattribut

### 4.1 Herkunft der OCL-Expression

Die OCL-Expression zur Referenzfilterung kann stammen aus:

- **Ecore** (Annotation am EReference mit Key `referenceFilter`)
- **Custom OCL (C-OCL)** (mit `role="REFERENCE_FILTER"`)
- **Workspace-spezifischer Definition**

### 4.2 Ecore-Annotation für Referenz-Filter

```xml
<eStructuralFeatures xsi:type="ecore:EReference" name="manager" eType="#//Employee">
  <eAnnotations source="http://www.eclipse.org/emf/2002/OCL">
    <details key="referenceFilter" value="target.status = Status::ACTIVE and target.level >= 3"/>
  </eAnnotations>
</eStructuralFeatures>
```

### 4.3 C-OCL-Definition für Referenz-Filter

```xml
<cocl:OclConstraintSet xmi:version="2.0" xmlns:xmi="http://www.omg.org/XMI"
    xmlns:cocl="http://www.gme.org/cocl/1.0"
    name="OrganizationFilters" version="1.0">

  <constraints name="ManagerFilter"
      description="Manager müssen aktiv sein und mindestens Level 3 haben."
      expression="target.status = Status::ACTIVE and target.level >= 3"
      severity="INFO"
      role="REFERENCE_FILTER"
      contextClass="organization.Department"
      active="true"/>

  <constraints name="SupervisorFilter"
      description="Vorgesetzte müssen ein höheres Level haben als der Mitarbeiter."
      expression="target &lt;&gt; self and target.status = Status::ACTIVE and target.level > self.level"
      severity="INFO"
      role="REFERENCE_FILTER"
      contextClass="organization.Employee"
      active="true"/>

</cocl:OclConstraintSet>
```

### 4.4 Semantik

- **Kontext der OCL-Auswertung**: Quellinstanz (`self` = das Objekt, an dem die Referenz gesetzt wird)
- **Geprüftes Objekt**: `target` = das potentielle Zielobjekt
- **Ergebnis**:
  - `true` → Referenzziel ist zulässig
  - `false` → Referenzziel wird ausgefiltert

---

## 5. Filterablauf (fachlich)

### 5.1 Initiale Kandidatenmenge

- Alle Instanzen des Referenztyps
- Optional eingeschränkt durch:
  - Projekt
  - Workspace
  - Sichtbarkeit / Perspektive

### 5.2 OCL-Auswertung

Für jedes Kandidatenobjekt:
- Ausführung der OCL-Expression
- Übergabe: Quellobjekt (`self`), Zielobjekt (`target`)
- Nicht valide Objekte werden verworfen oder ausgegraut

### 5.3 Ergebnisliste

- Enthält ausschließlich valide Referenzziele (oder alle mit Markierung)
- Sortierung optional (z.B. nach Name)

---

## 6. UI-Darstellung der Referenzauswahl

### 6.1 Auswahldialog / Auswahlansicht

Die Referenzziele werden angezeigt mit:

**Primäre Anzeige:**
- Name / Identifikator des Zielobjekts (aus `fullName` oder `name`)

**Zusätzliche Kontextinformation:**
- Breadcrumb des Parent- bzw. Container-Objekts

**Beispiel:**
```
ACME Corp / Anna Schmidt [Level 4, ACTIVE] ✓
ACME Corp / Max Müller [Level 3, ACTIVE] ✓
ACME Corp / Lisa Weber [Level 2, ACTIVE] ✗ (Level zu niedrig)
ACME Corp / Eva Fischer [Level 3, INACTIVE] ✗ (Inaktiv)
```

### 6.2 Breadcrumb-Regeln

- Breadcrumb wird aus der **Containment-Hierarchie** abgeleitet
- Falls kein Container existiert: Anzeige nur des Zielobjekts
- Breadcrumb dient ausschließlich der Orientierung

### 6.3 Darstellung gefilterter Objekte

| Modus | Beschreibung |
|-------|--------------|
| **Ausblenden** | Nicht-valide Objekte werden nicht angezeigt |
| **Ausgrauen** | Nicht-valide Objekte sind sichtbar, aber nicht auswählbar, mit Tooltip |

---

## 7. Interaktion & Verhalten

| Aktion | Verhalten |
|--------|-----------|
| Auswahl eines Eintrags | Setzt die Referenz am Quellobjekt |
| Abbrechen | Keine Änderung |
| Suche | Innerhalb der (optional gefilterten) Liste |
| Tooltip auf ausgegrautem Objekt | Zeigt Grund der Filterung |

---

## 8. Fehler- & Sonderfälle

| Situation | Verhalten |
|-----------|-----------|
| OCL fehlerhaft | Keine Filterung, Fehler im Log |
| Keine gültigen Ziele | Leere Liste + Hinweis |
| Performanceproblem | Abbruch + Meldung |
| Zyklische Referenz | Objekt wird ausgeschlossen |
| Timeout | Filterung abbrechen, Warnung anzeigen |

---

## 9. Abgrenzungen

| Status | Beschreibung |
|--------|--------------|
| **Nicht im Scope** | Automatische Reparatur ungültiger Referenzen |
| **Nicht im Scope** | Persistierung von Filterergebnissen |
| **Nicht im Scope** | Änderung der Modellstruktur |
| **Im Scope** | Rein selektive Einschränkung der Auswahl |

---

## 10. Anforderungstabelle

| ID | Priorität | Beschreibung | Akzeptanzkriterium |
|----|-----------|--------------|---------------------|
| GME-OCL-REF-001 | MUSS | Beim Setzen einer Referenz MÜSSEN alle möglichen Zielobjekte ermittelt werden | Alle Instanzen des Zieltyps werden geladen |
| GME-OCL-REF-002 | MUSS | Zielobjekte MÜSSEN per OCL-Expression gefiltert werden | Ungültige Objekte erscheinen nicht oder ausgegraut |
| GME-OCL-REF-003 | MUSS | OCL MUSS am Referenzattribut hinterlegt sein können | Ecore-Annotation oder C-OCL |
| GME-OCL-REF-004 | MUSS | Nicht valide Referenzen MÜSSEN markiert oder entfernt werden | Liste zeigt nur gültige Ziele oder markiert ungültige |
| GME-OCL-REF-005 | MUSS | Valide Referenzen MÜSSEN auswählbar sein | Auswahl setzt Referenz korrekt |
| GME-OCL-REF-006 | MUSS | Die Auswahlliste MUSS Breadcrumbs anzeigen | Parent-/Containerpfad sichtbar |
| GME-OCL-REF-007 | MUSS | Breadcrumbs MÜSSEN aus der Containment-Hierarchie stammen | Korrekte Pfade |
| GME-OCL-REF-008 | MUSS | Fehlerhafte OCL MUSS geloggt werden | Eintrag in Log-Tabelle |
| GME-OCL-REF-009 | MUSS | Die Auswahl MUSS abbrechbar sein | Keine Modelländerung |
| GME-OCL-REF-010 | MUSS | Filterung DARF das UI nicht blockieren | Asynchrone Ausführung |
| GME-OCL-REF-011 | SOLL | Suchfunktion SOLL in der Liste verfügbar sein | Inkrementelle Suche funktioniert |
| GME-OCL-REF-012 | SOLL | Gefilterte Objekte SOLLEN optional ausgegraut angezeigt werden | Mit Tooltip für Grund |

---

## 11. Testfälle

| ID | Testfall | Erwartetes Ergebnis |
|----|----------|---------------------|
| T-OCL-REF-001 | Referenz ohne OCL | Vollständige Liste aller Zielobjekte |
| T-OCL-REF-002 | Referenz mit OCL (50% gefiltert) | Reduzierte Liste oder Ausgrauung |
| T-OCL-REF-003 | Objekt ohne Container | Kein Breadcrumb, nur Name |
| T-OCL-REF-004 | Objekt mit Container | Breadcrumb korrekt angezeigt |
| T-OCL-REF-005 | OCL liefert false für alle | Leere Liste + Hinweis |
| T-OCL-REF-006 | OCL fehlerhaft | Log-Eintrag + Fallback (alle anzeigen) |
| T-OCL-REF-007 | Suche innerhalb der Liste | Nur valide Ziele gefunden (bei Ausblenden) |
| T-OCL-REF-008 | Zyklische Referenz (self) | Eigenes Objekt nicht in Liste |
| T-OCL-REF-009 | Abbrechen der Auswahl | Keine Änderung am Modell |
| T-OCL-REF-010 | Performance bei 1000 Objekten | Filterung innerhalb von 2 Sekunden |
| T-OCL-REF-011 | Tooltip auf ausgegrautem Objekt | Zeigt OCL-Filtergrund |
