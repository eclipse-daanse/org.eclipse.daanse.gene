/**
 * Welche Ansicht eine Datei öffnet.
 *
 * Eine Datei hat mehrere mögliche Ansichten. Entschieden wird über eine Regel
 * aus dem Workspace, sonst über das Metamodell der Wurzel, sonst über die
 * Endung. „Öffnen mit" zeigt die übrigen Kandidaten.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerEditorArt,
  unregisterEditorArt,
  alleEditorArten,
  setEditorZuordnungen,
  kandidatenFuer,
  editorFuer,
  wurzelNsUri,
  endungVon
} from '../context/editorRegistry'

const EORM_NS = 'https://eclipse.org/fennec/persistence/eorm/1.0.0'

const EORM_XMI = `<?xml version="1.0" encoding="UTF-8"?>
<eorm:EntityMappings xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:eorm="${EORM_NS}" name="sensinact-history"/>`

const SHOP_ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="shop" nsURI="http://example.org/shop" nsPrefix="shop"/>`

beforeEach(() => {
  for (const art of alleEditorArten()) unregisterEditorArt(art.id)
  setEditorZuordnungen([])
  registerEditorArt({ id: 'instance', name: 'Instanzen', extensions: ['.xmi'] })
  registerEditorArt({ id: 'metamodel', name: 'Metamodell', extensions: ['.ecore'] })
  registerEditorArt({ id: 'xmi', name: 'XMI-Text', extensions: ['.xmi', '.ecore', '.xml'], priority: -10 })
  registerEditorArt({ id: 'eorm', name: 'eorm-Mapping', extensions: [], nsURIs: [EORM_NS] })
})

describe('Endung und Metamodell lesen', () => {
  it('liest die Endung aus dem Pfad', () => {
    expect(endungVon('instances/Mapping WaterQuality.xmi')).toBe('.xmi')
    expect(endungVon('model/shop.ECORE')).toBe('.ecore')
    expect(endungVon('LIESMICH')).toBe('')
  })

  it('liest den nsURI der Wurzel aus einer Instanz', () => {
    expect(wurzelNsUri(EORM_XMI)).toBe(EORM_NS)
  })

  it('liest den nsURI einer .ecore aus ihrem eigenen Attribut', () => {
    expect(wurzelNsUri(SHOP_ECORE)).toBe('http://example.org/shop')
  })

  it('kommt mit Inhalt ohne Namensraum zurecht', () => {
    expect(wurzelNsUri('<einfach/>')).toBeNull()
  })
})

describe('Kandidaten einer Datei', () => {
  it('nennt alle, die die Endung oeffnen koennen — beste zuerst', () => {
    const ids = kandidatenFuer('instances/a.xmi').map((a) => a.id)
    expect(ids[0]).toBe('instance')
    expect(ids).toContain('xmi')
    expect(ids).not.toContain('metamodel')
  })

  it('zieht die Ansicht fuer das Metamodell vor', () => {
    const ids = kandidatenFuer('instances/mapping.xmi', EORM_XMI).map((a) => a.id)
    expect(ids[0]).toBe('eorm')
    // Der Instanzbaum bleibt waehlbar — darum geht es bei „Oeffnen mit"
    expect(ids).toContain('instance')
  })

  it('ohne Inhalt entscheidet die Endung allein', () => {
    const ids = kandidatenFuer('instances/mapping.xmi').map((a) => a.id)
    expect(ids[0]).toBe('instance')
    expect(ids).not.toContain('eorm')
  })
})

describe('Die Ansicht, mit der geoeffnet wird', () => {
  it('nimmt ohne Regel den besten Kandidaten', () => {
    expect(editorFuer('model/shop.ecore', SHOP_ECORE)?.id).toBe('metamodel')
    expect(editorFuer('instances/mapping.xmi', EORM_XMI)?.id).toBe('eorm')
  })

  it('folgt einer Regel auf das Metamodell aus dem Workspace', () => {
    setEditorZuordnungen([{ nsURI: EORM_NS, editorId: 'instance' }])
    expect(editorFuer('instances/mapping.xmi', EORM_XMI)?.id).toBe('instance')
  })

  it('folgt einer Regel auf den Pfad, und die geht der auf das Metamodell vor', () => {
    setEditorZuordnungen([
      { nsURI: EORM_NS, editorId: 'instance' },
      { pattern: 'instances/*.xmi', editorId: 'xmi' }
    ])
    expect(editorFuer('instances/mapping.xmi', EORM_XMI)?.id).toBe('xmi')
    // Andere Pfade bleiben bei der Metamodell-Regel
    expect(editorFuer('anderswo/mapping.xmi', EORM_XMI)?.id).toBe('instance')
  })

  it('uebergeht eine Regel, deren Ansicht es nicht gibt', () => {
    setEditorZuordnungen([{ pattern: '*.xmi', editorId: 'gibtsnicht' }])
    expect(editorFuer('instances/a.xmi')?.id).toBe('instance')
  })

  it('sagt nichts, wenn keine Ansicht passt', () => {
    expect(editorFuer('notizen.txt')).toBeNull()
  })
})
