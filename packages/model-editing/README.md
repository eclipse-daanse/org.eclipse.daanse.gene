# model-editing

Modellbearbeitung, die mehrere Bäume teilen: welche Containment-Referenz ein
Element aufnehmen kann, und wie ein Teilbaum kopiert wird.

Bewusst ohne Vue und ohne TSM — reine Funktionen auf EMF-Objekten, damit sie
sich testen lassen und beide Bäume (Instanzen wie Metamodell) dieselbe Antwort
bekommen. Die Zwischenablage bleibt bei den Bäumen: Ecore-Elemente in einen
Instanzbaum einzufügen ergibt keinen Sinn, ein gemeinsamer Speicher wäre also
eher eine Fehlerquelle als ein Nutzen.
