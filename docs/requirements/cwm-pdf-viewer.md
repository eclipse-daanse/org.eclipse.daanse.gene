# Ticket: PDF-Viewer in der CWM-Dokumentansicht

## Ausgangslage

`RowDocumentView.vue` zeigt die Dateien des Workspace an, die einem Dokument zugeordnet sind. Bilder (png, svg, jpg …) erscheinen inline. Ein PDF wird dagegen nur als Link „*Datei* öffnen“ angeboten und öffnet sich in einem neuen Browser-Tab (`documentFiles.ts`, `DocumentKind = 'pdf'`). Dabei verlässt man den Editor-Kontext.

## Ziel

PDFs werden wie Bilder direkt in der Zeile bzw. Dokumentansicht angezeigt.

## Anforderungen

- **PDF-1** Ein PDF wird inline in der Dokumentansicht gerendert, mit Blättern, Seitenzahl und Zoom (Breite anpassen / ganze Seite / Prozent).
- **PDF-2** Die Datei wird über den Storage-Layer des Workspace geladen (FileSystemHandle, IndexedDB, Git …), nicht über eine öffentliche URL.
- **PDF-3** Die Höhe des Viewers ist begrenzt und lässt sich in der Größe ändern. Lange PDFs scrollen innerhalb des Viewers, nicht in der ganzen Zeile.
- **PDF-4** „In neuem Tab öffnen“ und „Herunterladen“ bleiben als Aktionen erhalten.
- **PDF-5** Ist die Zeile eingeklappt, wird das PDF nicht geladen (Lazy Loading). Bei großen Dateien gibt es eine Ladeanzeige.
- **PDF-6** Fehlerfälle: Datei fehlt, ist beschädigt oder kein PDF. In diesen Fällen erscheint eine verständliche Meldung statt einer leeren Fläche.
- **PDF-7** Dark Mode: Die Bedienelemente des Viewers folgen dem Theme. Die Seite selbst bleibt hell.

## Umsetzungshinweise

- Variante A: das native `<iframe>`/`<embed>` mit einer Blob-URL. Das ist minimal, aber die Bedienung hängt vom Browser ab.
- Variante B: `pdfjs-dist`, gerendert auf Canvas mit eigener Werkzeugleiste. Das Ergebnis ist einheitlich und theme-fähig. Der Worker muss für TSM/Vite passend eingebunden werden.
- Empfehlung: Variante B als eigenes Plugin oder Shared Library, damit auch andere Plugins den Viewer nutzen können. `cwm-editor` greift über TSM/DI darauf zu, nicht über `window`.

## Akzeptanzkriterien

- Ein PDF aus dem Workspace erscheint in der Dokumentansicht inline und lässt sich blättern und zoomen.
- Bilder werden weiterhin unverändert angezeigt.
- Kein neuer Tab ist nötig, er bleibt aber optional verfügbar.

## Umsetzung (Stand 2026-10-29)

Umgesetzt ist Variante A, ohne neue Abhängigkeit. Der PDF-Viewer des Browsers läuft in einem `<iframe>` mit Blob-URL (`RowDocumentView.vue`). Blättern und Zoom kommen damit vom Browser. Darüber liegt eine Leiste mit „In neuem Tab öffnen“ und „Herunterladen“. Die Höhe lässt sich an der Unterkante ziehen (`resize: vertical`). Fehlt der MIME-Typ, setzt `documentFiles.ts` beim Blob `application/pdf`. PDF-7 (Theme) gilt nur für die Leiste. Variante B (`pdfjs-dist`) bleibt offen.
