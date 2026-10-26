/**
 * The constraint files that come with a workspace.
 *
 * The university workspace keeps its reference filter in university.c-ocl,
 * beside uni.wsp. The workspace file cannot name it, so it was never loaded
 * and the courses of other universities were never greyed out.
 */
import { describe, it, expect, vi } from 'vitest'
import { constraintFilesBeside, loadConstraintFilesBeside, type FileLike } from '../services/workspaceConstraints'

const file = (path: string): FileLike => ({ name: path.split('/').pop()!, path })
const folder = (path: string, children: FileLike[]): FileLike => ({ name: path.split('/').pop()!, path, isDirectory: true, children })

/** The explorer tree of the genE folder, as far as it matters here */
const TREE: FileLike[] = [
  file('uni.wsp'),
  file('cocl.ecore'),
  file('root-rules.c-ocl'),
  folder('uni', [
    file('uni/uni.wsp'),
    file('uni/university.ecore'),
    file('uni/university.c-ocl'),
    file('uni/university-instance.xmi'),
    folder('uni/nested', [file('uni/nested/other.c-ocl')]),
  ]),
  folder('example', [file('example/example1.wsp'), file('example/rules.cocl')]),
]

describe('constraint files beside a workspace', () => {
  it('finds the .c-ocl beside the workspace in its folder', () => {
    expect(constraintFilesBeside('uni/uni.wsp', TREE).map((f) => f.path)).toEqual(['uni/university.c-ocl'])
  })

  it('only that folder - neither sub folders nor siblings', () => {
    const found = constraintFilesBeside('uni/uni.wsp', TREE).map((f) => f.path)
    expect(found).not.toContain('uni/nested/other.c-ocl')
    expect(found).not.toContain('root-rules.c-ocl')
  })

  it('a workspace at the root of the source takes the root folder', () => {
    expect(constraintFilesBeside('uni.wsp', TREE).map((f) => f.path)).toEqual(['root-rules.c-ocl'])
  })

  it('knows the .cocl spelling too', () => {
    expect(constraintFilesBeside('example/example1.wsp', TREE).map((f) => f.path)).toEqual(['example/rules.cocl'])
  })

  it('loads what it finds and reports what loaded', async () => {
    const load = vi.fn(async () => true)
    const loaded = await loadConstraintFilesBeside('uni/uni.wsp', TREE, {
      read: async (f) => `<content of ${f.path}>`,
      load,
    })
    expect(loaded).toEqual(['uni/university.c-ocl'])
    expect(load).toHaveBeenCalledWith('<content of uni/university.c-ocl>', 'uni/university.c-ocl')
  })

  it('a file that fails does not stop the workspace from opening', async () => {
    const loaded = await loadConstraintFilesBeside('uni/uni.wsp', TREE, {
      read: async () => { throw new Error('gone') },
      load: async () => true,
    })
    expect(loaded).toEqual([])
  })
})
