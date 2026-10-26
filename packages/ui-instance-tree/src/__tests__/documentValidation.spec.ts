/**
 * Validation of the documents open in instance tabs.
 *
 * Two things had come apart: the menu's "Validate OCL" sent a request nobody
 * answered, and a document's resources were never handed to the problems
 * service - so nothing was validated after the tabs came, neither on request
 * nor on change. These tests hold the wiring together.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Resource } from '@emfts/core'
import {
  instanzTabIdFuer,
  instanzTabDokument,
  instanzTabGeschlossen,
  offeneInstanzTabIds,
  setDocumentResourceWatcher,
} from '../composables/tabDokumente'
import { validateDocument } from '../composables/validateDocument'
import { activate, deactivate } from '../index'

/** A stand-in resource - the watcher only cares about identity */
const resource = (name: string) => ({ name }) as unknown as Resource

afterEach(() => {
  setDocumentResourceWatcher(null)
  for (const id of offeneInstanzTabIds()) instanzTabGeschlossen(id)
})

describe('resources of the open documents', () => {
  function recordingWatcher() {
    const log: string[] = []
    setDocumentResourceWatcher({
      attach: (r) => log.push(`+${(r as any).name}`),
      detach: (r) => log.push(`-${(r as any).name}`),
    })
    return log
  }

  it('hands each resource over as it comes and goes', () => {
    const log = recordingWatcher()
    const dokument = instanzTabDokument(instanzTabIdFuer('a.xmi'))
    const a = resource('a')
    const b = resource('b')

    dokument.resources.value = [a]
    dokument.resources.value.push(b)
    dokument.resources.value = [b]

    expect(log).toEqual(['+a', '+b', '-a'])
  })

  it('lets go of the resources when the tab closes', () => {
    const log = recordingWatcher()
    const id = instanzTabIdFuer('a.xmi')
    instanzTabDokument(id).resources.value = [resource('a')]

    instanzTabGeschlossen(id)

    expect(log).toEqual(['+a', '-a'])
  })

  it('a watcher that comes later still gets the documents already open', () => {
    instanzTabDokument(instanzTabIdFuer('a.xmi')).resources.value = [resource('a')]

    const log = recordingWatcher()

    expect(log).toEqual(['+a'])
  })
})

describe('validating a document', () => {
  it('validates every resource it holds and opens the problems on errors', async () => {
    const a = resource('a')
    const b = resource('b')
    const problems = { validateResource: vi.fn(async (_resource: Resource) => {}), hasErrors: { value: true } }
    const bus = { emit: vi.fn() }

    const count = await validateDocument([a, b], problems, bus)

    expect(count).toBe(2)
    expect(problems.validateResource.mock.calls.map((c) => c[0])).toEqual([a, b])
    expect(bus.emit).toHaveBeenCalledWith('show-problems')
  })
})

describe('the instance tree plugin', () => {
  /** Just enough of a module context: a service registry that can be waited on */
  function moduleContext() {
    const services = new Map<string, any>()
    const waiting = new Map<string, Array<(v: any) => void>>()
    return {
      log: { info() {}, warn() {}, error() {}, debug() {} },
      services: {
        get: (id: string) => services.get(id),
        register: (id: string, value: any) => {
          services.set(id, value)
          for (const resolve of waiting.get(id) ?? []) resolve(value)
          waiting.delete(id)
        },
        unregister: (id: string) => services.delete(id),
        whenAvailable: (id: string) =>
          services.has(id)
            ? Promise.resolve(services.get(id))
            : new Promise((resolve) => waiting.set(id, [...(waiting.get(id) ?? []), resolve])),
        addListener() {},
        removeListener() {},
      },
    } as any
  }

  function eventBus() {
    const handlers = new Map<string, Set<(p?: unknown) => unknown>>()
    return {
      on: (e: string, h: any) => { handlers.set(e, new Set([...(handlers.get(e) ?? []), h])) },
      off: (e: string, h: any) => { handlers.get(e)?.delete(h) },
      emit: (e: string, p?: unknown) => [...(handlers.get(e) ?? [])].map((h) => h(p)),
      listeners: (e: string) => handlers.get(e)?.size ?? 0,
    }
  }

  it('answers "Validate OCL" with the document in front, and validates documents live', async () => {
    const context = moduleContext()
    await activate(context)

    const tabId = instanzTabIdFuer('uni/university-instance.xmi')
    const doc = resource('university-instance')
    instanzTabDokument(tabId).resources.value = [doc]

    const problems = {
      attachTo: vi.fn(async () => true),
      detachFrom: vi.fn(async () => true),
      validateResource: vi.fn(async () => {}),
      hasErrors: { value: false },
    }
    const bus = eventBus()
    context.services.register('gene.editor.front', { frontTabId: () => tabId })
    context.services.register('gene.problems', problems)
    context.services.register('gene.eventbus', bus)
    await vi.waitFor(() => expect(bus.listeners('validate-ocl-request')).toBe(1))

    // Live: the open document was handed over, validated at once
    expect(problems.attachTo).toHaveBeenCalledWith(doc, { validateImmediately: true })

    // On request: the document in front
    await Promise.all(bus.emit('validate-ocl-request'))
    expect(problems.validateResource).toHaveBeenCalledWith(doc)

    await deactivate(context)
    expect(bus.listeners('validate-ocl-request')).toBe(0)
  })
})
