/**
 * Selecting several rows of the explorer tree, and which of them are models.
 */
import { describe, it, expect } from 'vitest'
import { ecoreFilesBelow, rangeKeys, selectedEcoreFiles, visibleKeys } from '../selection'
import type { FileTreeNode } from '../types'

function file(path: string): FileTreeNode {
  const name = path.split('/').pop()!
  return {
    key: `s:${path}`,
    label: name,
    icon: '',
    leaf: true,
    type: name.endsWith('.xmi') ? 'workspace' : 'file',
    data: { name, path, isDirectory: false, sourceId: 's', extension: `.${name.split('.').pop()}` },
  }
}

function folder(path: string, children: FileTreeNode[]): FileTreeNode {
  return {
    key: `s:${path}`,
    label: path.split('/').pop()!,
    icon: '',
    leaf: false,
    type: 'directory',
    data: { name: path, path, isDirectory: true, sourceId: 's' },
    children,
  }
}

const tree: FileTreeNode[] = [
  folder('cwm', [
    file('cwm/core.ecore'),
    folder('cwm/olap', [file('cwm/olap/olap.ecore')]),
    file('cwm/data.xmi'),
  ]),
  file('readme.md'),
  file('university.ecore'),
]

describe('explorer selection', () => {
  it('visible rows skip the children of collapsed folders', () => {
    expect(visibleKeys(tree, {})).toEqual(['s:cwm', 's:readme.md', 's:university.ecore'])
    expect(visibleKeys(tree, { 's:cwm': true })).toEqual([
      's:cwm', 's:cwm/core.ecore', 's:cwm/olap', 's:cwm/data.xmi', 's:readme.md', 's:university.ecore',
    ])
  })

  it('a Shift range covers both ends, in either direction', () => {
    const order = ['a', 'b', 'c', 'd']
    expect(rangeKeys(order, 'b', 'd')).toEqual({ b: true, c: true, d: true })
    expect(rangeKeys(order, 'd', 'b')).toEqual({ b: true, c: true, d: true })
    // The anchor scrolled out of sight: only the row clicked
    expect(rangeKeys(order, 'x', 'c')).toEqual({ c: true })
  })

  it('only the selected .ecore files count, in tree order', () => {
    const keys = { 's:university.ecore': true, 's:readme.md': true, 's:cwm/core.ecore': true, 's:cwm/data.xmi': true }
    expect(selectedEcoreFiles(tree, keys).map((e) => e.path)).toEqual(['cwm/core.ecore', 'university.ecore'])
  })

  it('a folder brings all models below it, subfolders included', () => {
    expect(ecoreFilesBelow(tree[0]!).map((e) => e.path)).toEqual(['cwm/core.ecore', 'cwm/olap/olap.ecore'])
  })
})
