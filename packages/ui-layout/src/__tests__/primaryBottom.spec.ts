/**
 * Die linke Seite ist zweigeteilt.
 *
 * Oben der Navigator — Explorer oder Model Atlas —, unten die Ansicht zur
 * offenen Datei, meist ihr Baum. Beide sind gleichzeitig sichtbar, deshalb eine
 * eigene Zone und nicht ein weiterer Reiter oben.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { useLayoutState } from '../composables/useLayoutState'

const leer = defineComponent({ render: () => null })

function panel(id: string, location: 'primary' | 'primary-bottom') {
  return { id, title: id, icon: 'pi pi-circle', component: leer, location }
}

describe('Zweigeteilte linke Seite', () => {
  let layout: ReturnType<typeof useLayoutState>

  beforeEach(() => {
    layout = useLayoutState()
    layout.clearAll()
  })

  it('haelt Navigator und Dateiansicht auseinander', () => {
    layout.registerPanel(panel('explorer', 'primary'))
    layout.registerPanel(panel('metamodell-baum', 'primary-bottom'))

    expect(layout.primaryPanels.value.map((p: { id: string }) => p.id)).toEqual(['explorer'])
    expect(layout.primaryBottomPanels.value.map((p: { id: string }) => p.id)).toEqual(['metamodell-baum'])
  })

  it('zeigt unten nichts, solange keine Datei es verlangt', () => {
    // Anmelden heisst nicht anzeigen: Die Zone gehoert der offenen Datei, und
    // ohne eine stand hier sonst der Instanzbaum, obwohl nichts geladen war
    layout.registerPanel(panel('instanz-baum', 'primary-bottom'))
    expect(layout.activePrimaryBottomPanel.value).toBeNull()

    layout.selectPanel('instanz-baum', 'primary-bottom')
    expect(layout.activePrimaryBottomPanel.value?.id).toBe('instanz-baum')
  })

  it('raeumt die untere Haelfte wieder, wenn die Datei geht', () => {
    layout.registerPanel(panel('instanz-baum', 'primary-bottom'))
    layout.selectPanel('instanz-baum', 'primary-bottom')

    layout.selectPanel(null, 'primary-bottom')
    expect(layout.activePrimaryBottomPanel.value).toBeNull()
  })

  it('waehlt unten um, ohne oben etwas zu veraendern', () => {
    layout.registerPanel(panel('explorer', 'primary'))
    layout.registerPanel(panel('baum-a', 'primary-bottom'))
    layout.registerPanel(panel('baum-b', 'primary-bottom'))
    layout.selectPanel('explorer', 'primary')

    layout.selectPanel('baum-b', 'primary-bottom')
    expect(layout.activePrimaryBottomPanel.value?.id).toBe('baum-b')
    expect(layout.activePrimaryPanel.value?.id).toBe('explorer')
  })

  it('haelt die Hoehe der unteren Haelfte in Grenzen', () => {
    const min = layout.state.dimensions.primaryBottomMinHeight

    layout.setPrimaryBottomHeight(420)
    expect(layout.state.dimensions.primaryBottomHeight).toBe(420)

    // Zu weit nach unten gezogen: es bleibt bei der Mindesthoehe
    layout.setPrimaryBottomHeight(10)
    expect(layout.state.dimensions.primaryBottomHeight).toBe(min)
  })

  it('kommt ohne untere Ansicht aus', () => {
    layout.registerPanel(panel('explorer', 'primary'))
    expect(layout.primaryBottomPanels.value).toEqual([])
    expect(layout.activePrimaryBottomPanel.value).toBeNull()
  })
})
