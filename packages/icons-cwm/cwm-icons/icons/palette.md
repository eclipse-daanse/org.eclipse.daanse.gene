# CWM Icon System — Visual Tokens

Design tokens for the 630 hand-drawn class icons of the CWM metamodel and the
cwmx/daanse extension models (the split ecores under `model/cwm`, `model/cwmx`
and `model/daanse`). The German README carries the full colour table and the
extended motif families; this file keeps the design rationale.

## 1. The encoding

| Signal | Channel |
|---|---|
| **What the class *is*** | the central **glyph** |
| **Which package it lives in** | the **border colour** (and the glyph ink) |
| abstract vs. concrete | **dashed** vs. solid border |

Inheritance carries **no dedicated channel**. Related classes are recognisable
because they share glyph *construction* — see §4. This was a deliberate call: a
separate family mark pushed every glyph off-centre for a signal that was only ever
a nice-to-have.

The fill stays transparent. The package lives entirely in the stroke.

## 2. Colour follows the namespace hierarchy

Hue = top-level branch. Shade = subpackage, walking a ramp inside that hue.
Subpackages of one branch *are* siblings, so they *should* look alike.

| Package | Stroke (light) | Stroke (dark) |
|---|---|---|
| `objectmodel/core` | `#3730A3` | `#C7D2FE` |
| `objectmodel/behavioral` | `#4338CA` | `#A5B4FC` |
| `objectmodel/instance` | `#4F46E5` | `#818CF8` |
| `objectmodel/relationships` | `#6366F1` | `#6366F1` |
| `foundation/businessinformation` | `#155E75` | `#A5F3FC` |
| `foundation/softwaredeployment` | `#0E7490` | `#67E8F9` |
| `foundation/keysindexes` | `#0891B2` | `#22D3EE` |
| `foundation/datatypes` | `#06B6D4` | `#06B6D4` |
| `resource/relational` | `#115E59` | `#99F6E4` |
| `resource/record` | `#0F766E` | `#5EEAD4` |
| `analysis/olap` | `#5B21B6` | `#DDD6FE` |
| `analysis/businessnomenclature` | `#6D28D9` | `#C4B5FD` |
| `analysis/transformation` | `#7C3AED` | `#A78BFA` |
| `management/warehouseprocess` | `#9A3412` | `#FED7AA` |
| `management/warehouseprocess/events` | `#C2410C` | `#FDBA74` |
| `management/warehouseoperation` | `#EA580C` | `#FB923C` |

The extension branches continue the scheme with their own hue worlds — cwmx is
blue (analysis subpackages in sky), daanse is rose/pink/fuchsia with governance
in red. Subpackages without their own entry inherit the parent's colour via
longest-prefix lookup in `assemble.py`; the complete table lives in README.md.

> **Known trade-off.** `resource/relational` and `resource/record` differ only in
> stroke shade, as do `analysis/olap` and `analysis/businessnomenclature`. If that
> reads too weakly, promote the subpackage to its own hue and drop the branch signal.

## 3. Geometry

* `viewBox="0 0 24 24"`. Frame: rounded rect inset at 1.5, radius 4, stroke 1.5.
* **Every glyph is centred on (12,12)** inside the 12×12 field `x 6..18, y 6..18`.
* Glyph stroke 1.5, `stroke-linecap="round" stroke-linejoin="round"`.
* Abstract classes: frame `stroke-dasharray="3 2"` — exactly the `abstract="true"`
  EClasses in the ecores (currently 37), verified at build time.
* 48×48 is an exact 2× scale of the same paths.

Centring of the original 143 was verified with a bbox checker (worst offset 0.30,
median 0.00); the merged extension batches were bounds-checked coarsely and
proofed visually. A glyph that drifts should be fixed in glyphs.json.

## 4. Inheritance rides on shared construction

Related classes reuse the same base drawing, so kinship reads without a badge:

| Base motif | Shared by |
|---|---|
| **Folder** | `Package` → Model, Catalog, Schema, RecordFile, Extent, ProcessPackage, BusinessDomain, DeploymentGroup … |
| **Note card** | `Instance` → Object, DataValue, Row, Record, ColumnValue, FieldValue |
| **Marker + bar** | `Feature` → StructuralFeature (cored marker) → Attribute (solid marker) → Column, Field, Measure |
| **Hexagon** | `BehavioralFeature` → Method (solid core), Operation (hollow core), Procedure (play) |
| **Key** | `UniqueKey` (hollow bow) → UniqueConstraint, PrimaryKey (solid bow), ForeignKey (ring) |
| **Type tag** | `DataType` → TypeAlias, SQLDataType, SQLSimpleType, SQLDistinctType, SQLStructuredType |
| **Grid** | `ColumnSet` → NamedColumnSet, Table (solid header), View (dashed body), Column, Row |
| **Burst** | `Event` → WarehouseEvent → ExternalEvent, InternalEvent → CascadeEvent, RetryEvent |
| **Clock** | `ScheduleEvent` → PointInTimeEvent, IntervalEvent, RecurringPointInTimeEvent |
| **Cube** | `Cube` → CubeRegion, CubeDeployment, CubeDimensionAssociation |
| **Braces** | `Constraint` → CheckConstraint |
| **Book** | `Nomenclature` → Glossary, Taxonomy |

Some pairs are drawn identically and separated only by colour — `Index`/`SQLIndex`,
`Parameter`/`SQLParameter`, `IndexedFeature`/`SQLIndexColumn`, `DataType`/`SQLDataType`.
They are the same concept in a different resource layer, so that is correct, not a clash.

## 5. Theming

One file serves both themes:

```svg
<style>
  :root { --stroke: #115E59 }
  @media (prefers-color-scheme: dark) { :root { --stroke: #99F6E4 } }
</style>
```

## 6. Files

```
cwm-icons/icons/
  palette.md                       this file
  glyphs.json                      the hand-drawn artwork (630 entries)
  assemble.py                      wraps artwork in the frame; reads abstract= from the ecores
  build_index.py                   regenerates index.html from models + artwork
  svg/<packagePath>/<Class>.svg    630 generated icons
```

Regenerate with `python3 assemble.py && python3 build_index.py`. assemble fails if a
glyph names a class that does not exist in the models, and lists model classes that
still lack a glyph.
