#!/usr/bin/env python3
"""Wrap the hand-drawn glyphs from glyphs.json in the package chrome.

Decided system:
  * package  -> border colour (and the glyph ink), transparent fill
  * class    -> the hand-drawn central glyph
  * abstract -> dashed border
  * inheritance is NOT encoded visually.

Abstract flags come from cwm.ecore, so the drawing never disagrees with the model.

    python3 assemble.py            # -> svg/<packagePath>/<Class>.svg
"""
import json
import os
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ECORE = os.path.normpath(os.path.join(HERE, "../../model/cwm/model/cwm.ecore"))
XSI = "{http://www.w3.org/2001/XMLSchema-instance}type"

# package -> (stroke light, stroke dark).  Hue = branch, shade = subpackage.
PKG_STROKE = {
    "objectmodel/core":                    ("#3730A3", "#C7D2FE"),
    "objectmodel/behavioral":              ("#4338CA", "#A5B4FC"),
    "objectmodel/instance":                ("#4F46E5", "#818CF8"),
    "objectmodel/relationships":           ("#6366F1", "#6366F1"),
    "foundation/businessinformation":      ("#155E75", "#A5F3FC"),
    "foundation/softwaredeployment":       ("#0E7490", "#67E8F9"),
    "foundation/keysindexes":              ("#0891B2", "#22D3EE"),
    "foundation/datatypes":                ("#06B6D4", "#06B6D4"),
    "resource/relational":                 ("#115E59", "#99F6E4"),
    "resource/record":                     ("#0F766E", "#5EEAD4"),
    "analysis/olap":                       ("#5B21B6", "#DDD6FE"),
    "analysis/businessnomenclature":       ("#6D28D9", "#C4B5FD"),
    "analysis/transformation":             ("#7C3AED", "#A78BFA"),
    "management/warehouseprocess":         ("#9A3412", "#FED7AA"),
    "management/warehouseprocess/events":  ("#C2410C", "#FDBA74"),
    "management/warehouseoperation":       ("#EA580C", "#FB923C"),
}

FRAME = ("M5.5 1.5h13a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4h-13a4 4 0 0 1-4-4"
         "v-13a4 4 0 0 1 4-4z")


def load_model():
    root = ET.parse(ECORE).getroot()
    rn = root.get("name")
    cls = {}

    def walk(pkg, path):
        nm = pkg.get("name")
        p = path + [nm] if nm else path
        for c in pkg:
            if c.tag == "eClassifiers" and c.get(XSI) == "ecore:EClass":
                cls["/".join(p + [c.get("name")])] = dict(
                    abstract=c.get("abstract") == "true")
        for sp in pkg:
            if sp.tag == "eSubpackages":
                walk(sp, p)

    walk(root, [])
    cut = lambda s: s[len(rn) + 1:] if s.startswith(rn + "/") else s
    return {cut(k): v for k, v in cls.items()}


SVG = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" '
       'height="24" role="img" aria-labelledby="t">\n'
       '<title id="t">{title}</title>\n<style>{css}</style>\n{body}</svg>\n')


def build(fqn, glyph, is_abstract):
    pkg, name = fqn.rsplit("/", 1)
    sl, sd = PKG_STROKE[pkg]
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
        sys.exit("ERROR: not in cwm.ecore: " + ", ".join(missing))

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
