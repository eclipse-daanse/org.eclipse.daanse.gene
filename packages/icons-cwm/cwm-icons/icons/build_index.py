#!/usr/bin/env python3
"""Regenerate index.html from the ecore models and glyphs.json.

The page chrome (CSS, header, search bar, footer, script) lives in
_head.html / _tail.html; this script fills in the package sections and
patches the counts.  Tooltip text comes from the ecore documentation
annotation of the class; where the model has none, the glyph's design
note from glyphs.json steps in.

    python3 build_index.py        # -> index.html
"""
import html
import json
import os
import re

import assemble

HERE = os.path.dirname(os.path.abspath(__file__))

# display order of the packages; anything new appends alphabetically
ORDER = [
    "objectmodel/core", "objectmodel/behavioral", "objectmodel/instance",
    "objectmodel/relationships",
    "foundation/businessinformation", "foundation/softwaredeployment",
    "foundation/keysindexes", "foundation/datatypes",
    "foundation/expressions", "foundation/typemapping",
    "resource/relational", "resource/record", "resource/multidimensional",
    "resource/xml",
    "analysis/olap", "analysis/businessnomenclature", "analysis/transformation",
    "analysis/datamining/miningcore/entrypoint",
    "analysis/datamining/miningcore/miningdata",
    "analysis/datamining/miningcore/miningfunctionsettings",
    "analysis/datamining/miningcore/miningmodel",
    "analysis/datamining/miningcore/miningresult",
    "analysis/datamining/miningcore/miningtask",
    "analysis/datamining/approximation",
    "analysis/datamining/associationrules",
    "analysis/datamining/attributeimportance",
    "analysis/datamining/classification",
    "analysis/datamining/clustering",
    "analysis/datamining/supervised",
    "analysis/informationvisualization",
    "management/warehouseprocess", "management/warehouseprocess/events",
    "management/warehouseoperation",
    "cwmx/foundation/er",
    "cwmx/analysis/informationreporting", "cwmx/analysis/informationset",
    "cwmx/resource/cobol", "cwmx/resource/dmsii", "cwmx/resource/essbase",
    "cwmx/resource/express", "cwmx/resource/ims",
    "daanse/dcat", "daanse/tabular", "daanse/orm", "daanse/orm/map",
    "daanse/sql", "daanse/sql/select",
    "daanse/etl/flow", "daanse/etl/status",
    "daanse/governance/criticality",
    "daanse/governance/gdpr/assessment", "daanse/governance/gdpr/processing",
    "daanse/governance/transparency",
    "daanse/resource/calc", "daanse/resource/json", "daanse/resource/r",
    "daanse/resource/relational/privilege",
]

PRETTY = {
    "objectmodel": "ObjectModel", "businessinformation": "BusinessInformation",
    "softwaredeployment": "SoftwareDeployment", "keysindexes": "KeysIndexes",
    "datatypes": "DataTypes", "olap": "OLAP",
    "businessnomenclature": "BusinessNomenclature",
    "warehouseprocess": "WarehouseProcess",
    "warehouseoperation": "WarehouseOperation", "cwmx": "cwmx",
    "er": "ER", "informationreporting": "InformationReporting",
    "informationset": "InformationSet", "cobol": "COBOL", "dmsii": "DMSII",
    "essbase": "Essbase", "express": "Express", "ims": "IMS",
    "daanse": "daanse", "dcat": "DCAT", "orm": "ORM", "sql": "SQL",
    "etl": "ETL", "gdpr": "GDPR", "json": "JSON", "r": "R",
    "informationvisualization": "InformationVisualization",
    "miningcore": "MiningCore", "miningdata": "MiningData",
    "miningfunctionsettings": "MiningFunctionSettings",
    "miningmodel": "MiningModel", "miningresult": "MiningResult",
    "miningtask": "MiningTask", "entrypoint": "EntryPoint",
    "attributeimportance": "AttributeImportance",
    "associationrules": "AssociationRules",
    "datamining": "DataMining", "typemapping": "TypeMapping",
}


def pretty(pkg):
    return " · ".join(PRETTY.get(p, p.capitalize()) for p in pkg.split("/"))


def main():
    with open(os.path.join(HERE, "glyphs.json")) as fh:
        glyphs = json.load(fh)["glyphs"]
    cls = assemble.load_model()

    by_pkg = {}
    for fqn, entry in glyphs.items():
        pkg, name = fqn.rsplit("/", 1)
        by_pkg.setdefault(pkg, []).append((name, fqn, entry))
    order = ORDER + sorted(p for p in by_pkg if p not in ORDER)
    total = len(glyphs)

    out = []
    for pkg in order:
        if pkg not in by_pkg:
            continue
        sl, sd = assemble.stroke_for(pkg)
        tiles = []
        for name, fqn, entry in sorted(by_pkg[pkg]):
            meta = cls[fqn]
            doc = (meta.get("doc") or entry.get("note") or "").strip()
            doc = re.sub(r"\s+", " ", doc)[:240]
            dots = fqn.replace("/", ".")
            search = html.escape(f"{dots.lower()} {name.lower()}", quote=True)
            title = html.escape(doc, quote=True)
            ab = " abstract" if meta["abstract"] else ""
            tiles.append(
                f'<a class="tile" href="svg/{fqn}.svg" target="_blank" '
                f'data-search="{search}" title="{title}">'
                f'<svg class="ico{ab}" viewBox="0 0 24 24" '
                f'style="--sl:{sl};--sd:{sd}" aria-hidden="true">'
                f'<path class="frame" d="{assemble.FRAME}"/>'
                f'<g class="glyph">{entry["g"]}</g></svg>'
                f'<span class="nm">{name}</span>'
                f'<code class="fq">{dots}</code></a>')
        out.append(
            f'<section class="pkg" data-pkg="{pkg}"><header>'
            f'<span class="chip" style="--sl:{sl};--sd:{sd}"></span>'
            f'<h2>{pretty(pkg)}</h2><code>{pkg.replace("/", ".")}</code>'
            f'<span class="count">{len(tiles)}</span></header>'
            f'<div class="tiles">{"".join(tiles)}</div></section>')

    head = open(os.path.join(HERE, "_head.html")).read()
    tail = open(os.path.join(HERE, "_tail.html")).read()
    head = head.replace("<title>CWM 1.1 — 143 Klassen-Icons</title>",
                        f"<title>CWM · cwmx · daanse — {total} Klassen-Icons</title>")
    head = head.replace("<h1>CWM 1.1 — Klassen-Icons</h1>",
                        "<h1>CWM · cwmx · daanse — Klassen-Icons</h1>")
    head = head.replace(
        '<p class="lede">143 Icons, eines je Klasse des Common Warehouse Metamodel.',
        f'<p class="lede">{total} Icons, eines je Klasse des Common Warehouse '
        'Metamodel samt der cwmx- und daanse-Erweiterungsmodelle.')
    head = head.replace('<span class="hits" id="hits">143 / 143</span>',
                        f'<span class="hits" id="hits">{total} / {total}</span>')
    tail = tail.replace("n+' / 143'", f"n+' / {total}'")
    tail = tail.replace("Quelle: model/cwm/model/cwm.ecore",
                        "Quelle: model/cwm · model/cwmx · model/daanse (Ecore-Modelle)")

    with open(os.path.join(HERE, "index.html"), "w") as fh:
        fh.write(head + "\n".join(out) + "\n" + tail)
    print(f"index.html: {total} tiles in {sum(1 for p in order if p in by_pkg)} packages")


if __name__ == "__main__":
    main()
