# GenE - Generischer Editor

## Projektübersicht

GenE ist ein generischer Modell-Editor für das Web, basierend auf **EMF Ts** (TypeScript-Implementierung des Eclipse Modeling Framework).

## Technologie-Stack

- **Frontend**: Vue 3 + TypeScript + Vite
- **Modell-Framework**: EMF Ts (paralleles Projekt)
- **Testing**: Vitest

## Kernfunktionalität

### Modell-Unterstützung

- [ ] ECore-Metamodelle laden und bearbeiten
- [ ] Modell-Instanzen erstellen und bearbeiten
- [ ] Validierung gegen Metamodelle

### Editor-Komponenten

- [ ] **Tree-Editor**: Hierarchische Baumstruktur-Ansicht (ähnlich EMF Reflective Editor)
- [ ] **Properties-View**: Attribut-Bearbeitung über Property-Sheet

### Persistenz

GenE unterstützt drei Persistenz-Mechanismen:

- [ ] **Lokal**: Laden/Speichern von Dateien (JSON/XMI) im Browser
- [ ] **REST-API**: Server-seitige Speicherung via REST-Backend
- [ ] **Git**: Versionierte Speicherung über Git-Integration

## Abhängigkeiten

### EMF Ts (Paralleles Projekt)

**Pfad**: `../EMFTs/emfts`

EMF Ts ist eine TypeScript-Implementierung des Eclipse Modeling Framework mit folgenden Komponenten:

#### Metamodel-Hierarchie
```
EObject (Basis aller Modell-Objekte)
  └─ EModelElement (hat Annotations)
      └─ ENamedElement (hat Name)
          ├─ EClassifier
          │   ├─ EClass (Modellklasse)
          │   ├─ EDataType (Primitive/Datentypen)
          │   └─ EEnum (Aufzählungstypen)
          ├─ EStructuralFeature
          │   ├─ EAttribute (Daten-Attribute)
          │   └─ EReference (Objekt-Referenzen)
          ├─ EPackage (Package-Container)
          └─ EOperation (Klassenoperationen)
```

#### Verfügbare EMF Ts Module
| Modul | Beschreibung |
|-------|--------------|
| `EObject`, `EClass`, `EPackage` | Kern-Metamodell |
| `EAttribute`, `EReference` | Strukturelle Features |
| `Resource`, `ResourceSet` | Persistenz-Layer |
| `URI` | URI-Handling |
| `registry/` | Package Registry, Plugin System |
| `xmi/` | XMI/XML Laden & Speichern |
| `notify/` | Notification System |
| `runtime/` | Runtime-Implementierungen |

#### EMF Ts API Beispiel
```typescript
import { EPackage, EClass, EFactory, EObject } from 'emfts';

// Package aus Registry laden
const pkg: EPackage = EPackage.Registry.INSTANCE.getEPackage('http://example.com/model');

// Instanz erstellen
const factory: EFactory = pkg.getEFactoryInstance();
const person: EObject = factory.create(personClass);

// Reflektive API
person.eSet(nameAttr, 'John Doe');
const name = person.eGet(nameAttr);
```

## GenE Editor-Architektur

```
┌─────────────────────────────────────────────────────────┐
│                    GenE (Vue 3)                         │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ Tree-Editor │  │ Properties  │  │ Toolbar/Actions │ │
│  │   (Vue)     │  │   View      │  │                 │ │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘ │
│         │                │                   │          │
│         └────────────────┼───────────────────┘          │
│                          │                              │
│                    ┌─────▼─────┐                        │
│                    │  EMF Ts   │                        │
│                    │ (EObject) │                        │
│                    └─────┬─────┘                        │
│                          │                              │
│         ┌────────────────┼────────────────┐             │
│         │                │                │             │
│    ┌────▼────┐     ┌─────▼─────┐    ┌────▼────┐        │
│    │  Local  │     │   REST    │    │   Git   │        │
│    │ (XMI/   │     │   API     │    │         │        │
│    │  JSON)  │     │           │    │         │        │
│    └─────────┘     └───────────┘    └─────────┘        │
└─────────────────────────────────────────────────────────┘
```

## Offene Fragen

- [ ] Welches Format für lokale Dateien? (JSON vs. XMI) → EMF Ts hat XMI-Support
- [ ] Git-Integration: Direkt (isomorphic-git) oder über Backend?
- [ ] Authentifizierung für REST/Git?
- [ ] Soll GenE auch Metamodell-Editierung unterstützen (ECore-Editor)?

---

*Dokument erstellt: 2026-01-12*