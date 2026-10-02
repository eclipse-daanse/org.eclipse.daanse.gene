/**
 * „Öffnen mit" merkt sich die Wahl am Modell.
 *
 * Wer ein eorm-Mapping lieber als Instanzbaum sieht, meint damit alle Mappings
 * dieses Modells, nicht nur die eine Datei. Deshalb wird am nsURI gebunden,
 * wenn einer erkennbar ist — sonst am Pfad.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerEditorArt,
  unregisterEditorArt,
  alleEditorArten,
  setEditorZuordnungen,
  editorFuer,
  wurzelNsUri
} from '../context/editorRegistry'

const EORM_NS = 'https://eclipse.org/fennec/persistence/eorm/1.0.0'

const MAPPING = `<?xml version="1.0" encoding="UTF-8"?>
<eorm:EntityMappings xmlns:eorm="${EORM_NS}" name="history"/>`

const ANDERES_MAPPING = `<?xml version="1.0" encoding="UTF-8"?>
<eorm:EntityMappings xmlns:eorm="${EORM_NS}" name="playground"/>`

beforeEach(() => {
  for (const art of alleEditorArten()) unregisterEditorArt(art.id)
  setEditorZuordnungen([])
  registerEditorArt({ id: 'instance', name: 'Instanz-Editor', extensions: ['.xmi'], priority: 10 })
  registerEditorArt({ id: 'eorm', name: 'eorm-Ansicht', extensions: [], nsURIs: [EORM_NS] })
})

describe('Die gemerkte Wahl', () => {
  it('gilt fuer alle Dateien desselben Modells', () => {
    // Ohne Zutun gewinnt die Ansicht, die das Metamodell kennt
    expect(editorFuer('a/history.xmi', MAPPING)?.id).toBe('eorm')

    // Der Nutzer waehlt einmal den Instanzbaum — gebunden an das Modell
    setEditorZuordnungen([{ nsURI: wurzelNsUri(MAPPING)!, editorId: 'instance' }])

    expect(editorFuer('a/history.xmi', MAPPING)?.id).toBe('instance')
    // und zwar auch fuer das naechste Mapping desselben Modells
    expect(editorFuer('b/playground.xmi', ANDERES_MAPPING)?.id).toBe('instance')
  })

  it('bleibt bei einer Datei, wenn kein Modell erkennbar war', () => {
    setEditorZuordnungen([{ pattern: 'a/history.xmi', editorId: 'instance' }])

    expect(editorFuer('a/history.xmi', MAPPING)?.id).toBe('instance')
    // Andere Dateien bleiben unberuehrt
    expect(editorFuer('b/playground.xmi', ANDERES_MAPPING)?.id).toBe('eorm')
  })

  it('laesst sich wieder aendern', () => {
    setEditorZuordnungen([{ nsURI: EORM_NS, editorId: 'instance' }])
    expect(editorFuer('a/history.xmi', MAPPING)?.id).toBe('instance')

    setEditorZuordnungen([{ nsURI: EORM_NS, editorId: 'eorm' }])
    expect(editorFuer('a/history.xmi', MAPPING)?.id).toBe('eorm')
  })
})
