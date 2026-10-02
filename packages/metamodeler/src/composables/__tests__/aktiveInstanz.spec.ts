/**
 * Mehrere .ecore gleichzeitig offen: jeder Tab bringt seine eigene Instanz mit.
 *
 * Baum und Eigenschaften liegen im Seitenbereich und werden beim Tab-Wechsel
 * nicht neu aufgebaut. Sie halten deshalb die Fassade von
 * `useSharedMetamodeler()`, die bei jedem Zugriff zur vorderen Instanz
 * durchreicht — und weil sie dafür ein Ref liest, rechnen computeds mit.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { computed } from 'vue'
import {
  useMetamodeler,
  useSharedMetamodeler,
  setActiveMetamodeler,
  clearActiveMetamodeler
} from '../useMetamodeler'

const fassade = useSharedMetamodeler()

afterEach(() => {
  // Jede Instanz wieder freigeben, sonst faerbt ein Test in den naechsten
  clearActiveMetamodeler(fassade as never)
})

describe('Fassade auf die vordere Metamodeler-Instanz', () => {
  it('reicht ohne gemeldeten Tab an die gemeinsame Instanz durch', () => {
    // Ohne Tab ist das Feld lesbar und leer — nicht undefined
    expect(fassade.filePath.value).toBeNull()
    expect(typeof fassade.loadFromEcoreString).toBe('function')
  })

  it('zeigt auf die Instanz, die vorn liegt', () => {
    const a = useMetamodeler()
    const b = useMetamodeler()
    a.filePath.value = 'model/shop.ecore'
    b.filePath.value = 'model/lager.ecore'

    setActiveMetamodeler(a)
    expect(fassade.filePath.value).toBe('model/shop.ecore')

    setActiveMetamodeler(b)
    expect(fassade.filePath.value).toBe('model/lager.ecore')

    clearActiveMetamodeler(b)
  })

  it('zieht ein computed beim Tab-Wechsel mit', () => {
    const a = useMetamodeler()
    const b = useMetamodeler()
    a.filePath.value = 'a.ecore'
    b.filePath.value = 'b.ecore'

    // So liest der Baum: ueber die Fassade, innerhalb eines computed
    const angezeigt = computed(() => fassade.filePath.value)

    setActiveMetamodeler(a)
    expect(angezeigt.value).toBe('a.ecore')

    setActiveMetamodeler(b)
    expect(angezeigt.value).toBe('b.ecore')

    clearActiveMetamodeler(b)
  })

  it('faellt nach dem Schliessen auf die gemeinsame Instanz zurueck', () => {
    const a = useMetamodeler()
    a.filePath.value = 'nur-kurz.ecore'

    setActiveMetamodeler(a)
    expect(fassade.filePath.value).toBe('nur-kurz.ecore')

    clearActiveMetamodeler(a)
    expect(fassade.filePath.value).toBeNull()
  })

  it('haelt die Instanzen auseinander', () => {
    const a = useMetamodeler()
    const b = useMetamodeler()
    a.dirty.value = true

    expect(b.dirty.value).toBe(false)
    expect(a.resource.value).toBeNull()
    expect(b.resource.value).toBeNull()
    expect(a.resource).not.toBe(b.resource)
  })
})
