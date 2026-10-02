/**
 * Eine Instanzdatei je Tab — und sie überlebt den Wechsel.
 *
 * Der Editor-Bereich baut die Tab-Komponente bei jedem Wechsel neu auf. Die
 * Bäume liegen deshalb an der Tab-Id und nicht in der Komponente.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { XMIResource, URI } from '@emfts/core'
import {
  instanzTabIdFuer,
  instanzTabDokument,
  instanzTabIstGeladen,
  instanzTabNachVorn,
  instanzTabGeschlossen,
  offeneInstanzTabIds
} from '../composables/tabDokumente'
import { useSharedInstanceTree } from '../composables/useInstanceTree'

afterEach(() => {
  for (const id of offeneInstanzTabIds()) instanzTabGeschlossen(id)
})

describe('Instanzen je Tab', () => {
  it('leitet die Tab-Id aus dem Pfad ab — eine Datei, ein Tab', () => {
    expect(instanzTabIdFuer('instances/a.xmi')).toBe(instanzTabIdFuer('instances/a.xmi'))
    expect(instanzTabIdFuer('instances/a.xmi')).not.toBe(instanzTabIdFuer('instances/b.xmi'))
  })

  it('gibt beim Wiederaufbau dasselbe Dokument zurueck', () => {
    const id = instanzTabIdFuer('instances/a.xmi')
    const zuerst = instanzTabDokument(id)
    zuerst.resources.value = [new XMIResource(URI.createURI('instances/a.xmi'))]

    const danach = instanzTabDokument(id)
    expect(danach.instance).toBe(zuerst.instance)
    expect(danach.resources.value).toHaveLength(1)
  })

  it('haelt zwei Dateien auseinander', () => {
    const a = instanzTabDokument(instanzTabIdFuer('instances/a.xmi'))
    const b = instanzTabDokument(instanzTabIdFuer('instances/b.xmi'))
    a.resources.value = [new XMIResource(URI.createURI('instances/a.xmi'))]

    expect(b.resources.value).toHaveLength(0)
    expect(a.instance).not.toBe(b.instance)
    expect(instanzTabIstGeladen(instanzTabIdFuer('instances/a.xmi'))).toBe(true)
    expect(instanzTabIstGeladen(instanzTabIdFuer('instances/b.xmi'))).toBe(false)
  })

  it('zeigt der Fassade den Tab, der vorn liegt', () => {
    const fassade = useSharedInstanceTree()
    const aId = instanzTabIdFuer('instances/a.xmi')
    const bId = instanzTabIdFuer('instances/b.xmi')
    instanzTabDokument(aId).resources.value = [new XMIResource(URI.createURI('instances/a.xmi'))]
    instanzTabDokument(bId).resources.value = [
      new XMIResource(URI.createURI('instances/b1.xmi')),
      new XMIResource(URI.createURI('instances/b2.xmi'))
    ]

    instanzTabNachVorn(aId)
    expect(fassade.resources.value).toHaveLength(1)

    instanzTabNachVorn(bId)
    expect(fassade.resources.value).toHaveLength(2)
  })

  it('vergisst den Tab beim Schliessen', () => {
    const id = instanzTabIdFuer('instances/a.xmi')
    instanzTabDokument(id).resources.value = [new XMIResource(URI.createURI('instances/a.xmi'))]

    instanzTabGeschlossen(id)
    expect(offeneInstanzTabIds()).not.toContain(id)
    expect(instanzTabDokument(id).resources.value).toHaveLength(0)
  })
})
