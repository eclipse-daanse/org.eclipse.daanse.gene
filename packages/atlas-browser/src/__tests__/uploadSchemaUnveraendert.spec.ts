/**
 * Der Schema-Upload darf den Inhalt nicht anfassen (#137).
 *
 * Monatelang wurde vor dem Senden ` eType="` durch ` _type="` ersetzt. '_type'
 * ist die Typangabe der JSON-Form des Atlas; gene sendet aber
 * Content-Type application/xml, wo Ecore das Attribut nicht kennt. Der Server
 * verwarf es beim Parsen und legte die Schemas typlos ab — ein Modell mit 25
 * typisierten Features kam als 0 von 25 wieder heraus.
 *
 * Kein Test hat das bemerkt, weil der Upload Erfolg meldete und der Schaden
 * erst Wochen spaeter an ganz anderer Stelle auffiel (leere Auswahllisten,
 * weil getEAttributeType() ueberall null lieferte).
 *
 * Geprueft wird deshalb die ganze Kette bis zum HTTP-Request: Was gesendet
 * wird, muss byte-gleich dem sein, was hineingegeben wurde.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAtlasBrowser } from '../composables/useAtlasBrowser'

const ECORE = `<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmlns:xmi="http://www.omg.org/XMI" xmi:version="2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="test" nsURI="test-upload" nsPrefix="test">
  <eClassifiers xsi:type="ecore:EClass" name="Sensor">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="name"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="wert"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EDouble"/>
  </eClassifiers>
</ecore:EPackage>`

/** Merkt sich alle abgesetzten Requests und beantwortet sie unauffaellig. */
function fetchAufzeichnen() {
  const requests: Array<{ url: string; method: string; body: string; headers: Record<string, string> }> = []
  const stub = vi.fn(async (url: unknown, init?: any) => {
    requests.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : '',
      headers: (init?.headers ?? {}) as Record<string, string>
    })
    // getScope soll scheitern: Die Verbindung landet dann im Fehlerzustand,
    // der Client steht aber schon in der Map — genau das brauchen wir.
    return { ok: true, status: 201, text: async () => 'ok' } as unknown as Response
  })
  globalThis.fetch = stub as unknown as typeof fetch
  return requests
}

describe('Schema-Upload sendet den Inhalt unveraendert (#137)', () => {
  const original = globalThis.fetch
  let requests: ReturnType<typeof fetchAufzeichnen>

  beforeEach(() => { requests = fetchAufzeichnen() })
  afterEach(() => { globalThis.fetch = original })

  async function hochladen() {
    const browser = useAtlasBrowser()
    // connect scheitert an der leeren Scope-Antwort und wirft — der Client
    // steht danach trotzdem bereit, denn er wird vor der Scope-Abfrage
    // registriert. Genau das brauchen wir, ohne eine Scope-XMI nachzubauen.
    await browser.connect({
      baseUrl: 'https://atlas.example/rest', scopeName: 'jena', token: ''
    }).catch(() => undefined)

    const verbindungsId = browser.connections.value.at(-1)?.id
    expect(verbindungsId, 'keine Verbindung angelegt').toBeDefined()

    requests.length = 0   // die Requests aus connect interessieren nicht
    const ergebnis = await browser.uploadSchema(verbindungsId!, 'draft', ECORE, { name: 'test' })
    return { ergebnis, hochgeladen: requests.find(r => r.method === 'POST') }
  }

  it('der gesendete Rumpf ist byte-gleich der Eingabe', async () => {
    const { hochgeladen } = await hochladen()
    expect(hochgeladen, 'kein POST abgesetzt').toBeDefined()
    expect(hochgeladen!.body).toBe(ECORE)
  })

  it('die Typangaben bleiben vollstaendig erhalten', async () => {
    const { hochgeladen } = await hochladen()
    const zaehle = (s: string, muster: RegExp) => (s.match(muster) ?? []).length
    // Genau das ging verloren: eType wurde zu _type umgeschrieben
    expect(zaehle(hochgeladen!.body, / eType="/g)).toBe(zaehle(ECORE, / eType="/g))
    expect(hochgeladen!.body).not.toContain('_type=')
  })

  it('als XML gesendet, nicht als JSON', async () => {
    const { hochgeladen } = await hochladen()
    const contentType = hochgeladen!.headers['Content-Type'] ?? hochgeladen!.headers['content-type']
    expect(contentType).toBe('application/xml')
  })
})
