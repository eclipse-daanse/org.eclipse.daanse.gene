/**
 * Adding several models at once: all loaded, declared together, saved once.
 */
import { describe, it, expect, vi } from 'vitest'
import { addModels, type AddModelsDeps, type ModelToAdd } from '../services/addModels'

function model(path: string, sourceId = 's'): ModelToAdd {
  return { entry: { name: path.split('/').pop()!, path, sourceId }, content: `<${path}>` }
}

function deps(over: Partial<AddModelsDeps> = {}): AddModelsDeps & { declared: string[] } {
  const declared: string[] = []
  return {
    declared,
    isDeclared: () => false,
    load: async (_content, path) => ({ name: path.replace(/\.ecore$/, ''), ePackage: { path } }),
    register: vi.fn(async () => {}),
    declare: (path) => { declared.push(path) },
    save: vi.fn(async () => {}),
    reloadInstances: vi.fn(async () => {}),
    ...over,
  }
}

describe('adding several models', () => {
  it('declares all, saves once, retries instances once per source', async () => {
    const d = deps()
    const result = await addModels([model('a.ecore'), model('b.ecore'), model('c.ecore', 't')], d)
    expect(result.added).toEqual(['a.ecore', 'b.ecore', 'c.ecore'])
    expect(d.declared).toEqual(['a.ecore', 'b.ecore', 'c.ecore'])
    expect(d.register).toHaveBeenCalledTimes(3)
    expect(d.save).toHaveBeenCalledTimes(1)
    expect(d.reloadInstances).toHaveBeenCalledWith(['s', 't'])
  })

  it('a throwing load is reported with its message', async () => {
    const d = deps({ load: async () => { throw new Error('unexpected token') } })
    const result = await addModels([model('bad.ecore')], d)
    expect(result.failed).toEqual([{ path: 'bad.ecore', error: 'unexpected token' }])
    expect(d.save).not.toHaveBeenCalled()
  })

  it('reports what does not load, keeps the rest', async () => {
    const d = deps({
      load: async (_content, path) => (path === 'broken.ecore' ? null : { name: path }),
    })
    const result = await addModels([model('ok.ecore'), model('broken.ecore')], d)
    expect(result.added).toEqual(['ok.ecore'])
    expect(result.failed).toEqual([{ path: 'broken.ecore', error: 'Modell konnte nicht geladen werden' }])
  })

  it('skips models already in the workspace, and doubles in the selection', async () => {
    const d = deps({ isDeclared: (path) => path === 'old.ecore' })
    const result = await addModels([model('old.ecore'), model('new.ecore'), model('new.ecore')], d)
    expect(result.skipped).toEqual(['old.ecore', 'new.ecore'])
    expect(d.declared).toEqual(['new.ecore'])
  })

  it('nothing added, nothing saved', async () => {
    const d = deps({ isDeclared: () => true })
    await addModels([model('a.ecore')], d)
    expect(d.save).not.toHaveBeenCalled()
    expect(d.reloadInstances).not.toHaveBeenCalled()
  })
})
