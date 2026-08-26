#!/usr/bin/env python3
"""Wrap the hand-drawn glyphs from glyphs.json in the package chrome.

Decided system:
  * package  -> border colour (and the glyph ink), transparent fill
  * class    -> the hand-drawn central glyph
  * abstract -> dashed border
  * inheritance is NOT encoded visually.

Abstract flags come from the ecore models, so the drawing never disagrees
with the model.  The models are the split ecores of this repository:

    model/cwm/<pkg>/model/*.ecore        -> objectmodel/..., foundation/..., ...
    model/cwmx/<pkg>/model/*.ecore       -> cwmx/...
    model/daanse/<pkg>[/<sub>]/model/*.ecore -> daanse/...

The fully-qualified icon path is <branch>/<package-path>/<Class>; for the
cwm branch the leading "cwm" is dropped (it is the default namespace).

    python3 assemble.py            # -> svg/<packagePath>/<Class>.svg
"""
import glob
import json
import os
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "../.."))
ECORE_GLOBS = [
    "model/cwm/*/model/*.ecore",
    "model/cwmx/*/model/*.ecore",
    "model/daanse/*/model/*.ecore",
    "model/daanse/*/*/model/*.ecore",
]
XSI = "{http://www.w3.org/2001/XMLSchema-instance}type"

# package -> (stroke light, stroke dark).  Hue = branch, shade = subpackage.
# Lookup walks up the package path, so subpackages inherit their parent's
# colour unless listed themselves (e.g. everything under analysis/datamining).
PKG_STROKE = {
    # cwm - objectmodel: indigo
    "objectmodel/core":                    ("#3730A3", "#C7D2FE"),
    "objectmodel/behavioral":              ("#4338CA", "#A5B4FC"),
    "objectmodel/instance":                ("#4F46E5", "#818CF8"),
    "objectmodel/relationships":           ("#6366F1", "#6366F1"),
    # cwm - foundation: cyan (typemapping borrows the sky neighbour)
    "foundation/businessinformation":      ("#155E75", "#A5F3FC"),
    "foundation/softwaredeployment":       ("#0E7490", "#67E8F9"),
    "foundation/keysindexes":              ("#0891B2", "#22D3EE"),
    "foundation/datatypes":                ("#06B6D4", "#06B6D4"),
    "foundation/expressions":              ("#164E63", "#CFFAFE"),
    "foundation/typemapping":              ("#0369A1", "#7DD3FC"),
    # cwm - resource: teal/emerald
    "resource/relational":                 ("#115E59", "#99F6E4"),
    "resource/record":                     ("#0F766E", "#5EEAD4"),
    "resource/multidimensional":           ("#0D9488", "#2DD4BF"),
    "resource/xml":                        ("#047857", "#6EE7B7"),
    # cwm - analysis: violet/purple
    "analysis/olap":                       ("#5B21B6", "#DDD6FE"),
    "analysis/businessnomenclature":       ("#6D28D9", "#C4B5FD"),
    "analysis/transformation":             ("#7C3AED", "#A78BFA"),
    "analysis/datamining":                 ("#7E22CE", "#D8B4FE"),
    "analysis/informationvisualization":   ("#A855F7", "#E9D5FF"),
    # cwm - management: orange
    "management/warehouseprocess":         ("#9A3412", "#FED7AA"),
    "management/warehouseprocess/events":  ("#C2410C", "#FDBA74"),
    "management/warehouseoperation":       ("#EA580C", "#FB923C"),
    # cwmx: blue (analysis = sky, foundation/resource = blue)
    "cwmx/analysis/informationreporting":  ("#0C4A6E", "#BAE6FD"),
    "cwmx/analysis/informationset":        ("#075985", "#7DD3FC"),
    "cwmx/foundation/er":                  ("#0284C7", "#38BDF8"),
    "cwmx/resource/cobol":                 ("#1E3A8A", "#BFDBFE"),
    "cwmx/resource/dmsii":                 ("#1E40AF", "#93C5FD"),
    "cwmx/resource/essbase":               ("#1D4ED8", "#60A5FA"),
    "cwmx/resource/express":               ("#2563EB", "#3B82F6"),
    "cwmx/resource/ims":                   ("#172554", "#DBEAFE"),
    # daanse: rose/pink/fuchsia/red
    "daanse/dcat":                         ("#9F1239", "#FDA4AF"),
    "daanse/orm":                          ("#BE123C", "#FB7185"),
    "daanse/orm/map":                      ("#E11D48", "#FECDD3"),
    "daanse/sql":                          ("#831843", "#F9A8D4"),
    "daanse/sql/select":                   ("#9D174D", "#F472B6"),
    "daanse/tabular":                      ("#A21CAF", "#E879F9"),
    "daanse/etl/flow":                     ("#DB2777", "#F9A8D4"),
    "daanse/etl/status":                   ("#EC4899", "#FBCFE8"),
    "daanse/governance/criticality":       ("#B91C1C", "#FCA5A5"),
    "daanse/governance/gdpr":              ("#991B1B", "#F87171"),
    "daanse/governance/transparency":      ("#7F1D1D", "#FECACA"),
    "daanse/resource/calc":                ("#C026D3", "#F0ABFC"),
    "daanse/resource/json":                ("#86198F", "#D946EF"),
    "daanse/resource/r":                   ("#701A75", "#F5D0FE"),
    "daanse/resource/relational/privilege": ("#4A044E", "#F0ABFC"),
}

FRAME = ("M5.5 1.5h13a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4h-13a4 4 0 0 1-4-4"
         "v-13a4 4 0 0 1 4-4z")


def stroke_for(pkg):
    """Longest-prefix colour lookup: subpackages inherit their parent."""
    p = pkg
    while p:
        if p in PKG_STROKE:
            return PKG_STROKE[p]
        p = p.rpartition("/")[0]
    sys.exit(f"ERROR: no colour defined for package {pkg}")


def load_model():
    """All EClasses of all split ecores -> {fqn: {abstract: bool, doc: str}}."""
    cls = {}
    for pat in ECORE_GLOBS:
        for f in sorted(glob.glob(os.path.join(REPO, pat))):
            module_dir = f.split(os.sep + "model" + os.sep)[-1]
            rel = os.path.relpath(f, REPO).split("/")
            # rel = model/<branch>/<mod...>/model/<file>.ecore
            branch, mods = rel[1], rel[2:-2]
            prefix = [] if branch == "cwm" else [branch]
            for m in mods:
                prefix += m.split(".")
            root = ET.parse(f).getroot()

            def walk(pkg, path):
                for c in pkg:
                    if c.tag == "eClassifiers" and c.get(XSI) == "ecore:EClass":
                        doc = ""
                        for d in c.iter("details"):
                            if d.get("key") == "documentation":
                                doc = d.get("value") or ""
                                break
                        cls["/".join(path + [c.get("name")])] = dict(
                            abstract=c.get("abstract") == "true", doc=doc)
                    if c.tag == "eSubpackages":
                        walk(c, path + [c.get("name")])

            walk(root, prefix)
    return cls


SVG = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" '
       'height="24" role="img" aria-labelledby="t">\n'
       '<title id="t">{title}</title>\n<style>{css}</style>\n{body}</svg>\n')


def build(fqn, glyph, is_abstract):
    pkg, name = fqn.rsplit("/", 1)
    sl, sd = stroke_for(pkg)
    dash = ' stroke-dasharray="3 2"' if is_abstract else ""
    css = (f":root{{--stroke:{sl}}}"
           f"@media(prefers-color-scheme:dark){{:root{{--stroke:{sd}}}}}")
    body = (f'<path d="{FRAME}" fill="none" stroke="var(--stroke)" '
            f'stroke-width="1.5"{dash}/>\n'
            f'<g style="color:var(--stroke)" fill="none" stroke="var(--stroke)" '
            f'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
            f'{glyph}</g>\n')
    return SVG.format(title=fqn.replace("/", "."), css=css, body=body)


def main():
    with open(os.path.join(HERE, "glyphs.json")) as fh:
        data = json.load(fh)
    cls = load_model()
    out_root = os.path.join(HERE, "svg")

    missing = [f for f in data["glyphs"] if f not in cls]
    if missing:
        sys.exit("ERROR: not in the ecore models: " + ", ".join(missing))
    undrawn = sorted(f for f in cls if f not in data["glyphs"])
    if undrawn:
        print(f"note: {len(undrawn)} model classes have no glyph yet",
              file=sys.stderr)

    n = 0
    for fqn, entry in data["glyphs"].items():
        svg = build(fqn, entry["g"], cls[fqn]["abstract"])
        ET.fromstring(svg)  # fail fast on malformed markup
        path = os.path.join(out_root, *fqn.split("/")) + ".svg"
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as fh:
            fh.write(svg)
        n += 1
    print(f"{n} icons written to {out_root}/")


if __name__ == "__main__":
    main()
