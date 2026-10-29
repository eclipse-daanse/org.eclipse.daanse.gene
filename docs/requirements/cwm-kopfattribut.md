# Ticket: Konfigurierbarer Kopf (Titel) für Objekte im CWM-Doc-Viewer

## Ausgangslage

Im CWM-Doc-Viewer (`CwmContextView` / `ContextObjectRow.vue`) zeigt der Kopf jeder Zeile heute fest den `name` des Objekts. Auch die Funktion „Bearbeiten“ (Umbenennen) wirkt nur auf `name`. Bei vielen Klassen ist ein anderes Attribut aussagekräftiger, etwa ein Label, ein Code oder ein Business-Name.

## Ziel

Pro Klasse lässt sich einstellen, welches Element als Kopf angezeigt wird. Konfiguration und Vererbung folgen derselben Logik wie die Feldregeln (`fieldDefaults.ts`, `FieldRulesDialog.vue`).

## Anforderungen

- **HEAD-1** Pro EClass lässt sich ein Kopf-Attribut festlegen (EAttribute der Klasse, auch geerbt). Ohne Regel bleibt `name` der Kopf.
- **HEAD-2** Die Regel ist optional vererbbar (`includeSubclasses`), wie bei den Feldregeln. Gelten mehrere Regeln, gewinnt die spezifischste Klasse, also die nächste in der Supertyp-Kette.
- **HEAD-3** Die Regeln werden wie die Feldregeln in einem eigenen Modell neben dem bearbeiteten Modell gespeichert. Vorschlag: Erweiterung von `model/fielddefaults.ecore` um eine `HeadRule`, gespeichert in `*.fielddefaults.xmi`. Klasse und Attribut werden per Referenz benannt, der Abgleich erfolgt über nsURI und Name, nicht über die Objektidentität.
- **HEAD-4** Ist das Kopf-Attribut leer, wird auf `name` und danach auf den Typnamen zurückgefallen. Der Kopf ist nie leer.
- **HEAD-5** „Bearbeiten“ im Kopf ändert das konfigurierte Attribut, nicht fest `name`. Ein leerer Wert setzt das Attribut zurück (unset), wie heute bei `name`.
- **HEAD-6** Ist ein Attribut als Kopf eingestellt, wird es unter den Feldern der Zeile nicht noch einmal angezeigt (optional abschaltbar).
- **HEAD-7** Der Kopf wird überall gleich verwendet: eingeklappte Köpfe, Nummerierung, Brotkrumen/Outline, Querverweise auf das Objekt (Referenzfelder) und Suche im Instanzbaum.
- **HEAD-8** Konfiguriert wird im bestehenden Feldregel-Dialog, entweder über einen eigenen Abschnitt „Kopf“ oder über die Option „Als Kopf anzeigen“ pro Attribut. Einen neuen Dialog gibt es nicht.
- **HEAD-9** Reaktiv: Wird die Regel oder der Attributwert geändert, aktualisiert sich der Kopf sofort.

## Offene Punkte

- Soll statt eines einzelnen Attributs auch ein Muster möglich sein, z. B. `{code} – {name}`? Vorschlag: zunächst nur ein Attribut, ein Muster später als Erweiterung.
- Sind auch Referenzen als Kopf zulässig, z. B. der Name eines referenzierten Objekts? Vorschlag: nein, nur EAttributes.

## Akzeptanzkriterien

- Für eine Klasse X wird Attribut `a` als Kopf gesetzt, mit Vererbung. Dann zeigen X und alle Unterklassen `a` als Titel, und die Regel bleibt nach einem Neuladen erhalten.
- Hat eine Unterklasse Y eine eigene Regel, überschreibt diese die Regel von X.
- Ohne Regel zeigt der Kopf wie bisher `name`.

## Umsetzung (Stand 2026-10-29)

- `fielddefaults.ecore`: `FieldRule` hat ein neues Flag `head`. Zusammen mit `includeSubclasses` ergibt sich die Vererbung. Wird `head` gesetzt, entfernt `setRuleValue` das Flag bei den übrigen Regeln derselben Klasse in dieser Datei.
- `headAttributeName(object)` in `fieldDefaults.ts` liefert das Kopf-Attribut aus der spezifischsten Klasse. Fehlt eine passende Regel, ist es `name`.
- `displayName` in `contextView.ts` zeigt nur das Kopf-Attribut. Ist es leer, bleibt der Kopf leer, ohne Rückfall auf `name` oder den Typnamen. Das ersetzt HEAD-4. Über `displayName` gilt der Kopf auch für eingeklappte Köpfe, Referenzfelder, Dialoge und die Suche (HEAD-7).
- `fieldsOf` blendet das Kopf-Attribut unter den Feldern aus. `name` erscheint als Feld, sobald ein anderes Attribut der Kopf ist. Abschalten lässt sich das noch nicht (HEAD-6).
- `ContextObjectRow.vue`: „Bearbeiten“ ändert das Kopf-Attribut (HEAD-5).
- `FieldRulesDialog.vue`: neue Spalte „Kopf“ (HEAD-8). Bei Referenzen ist sie ausgeblendet.
