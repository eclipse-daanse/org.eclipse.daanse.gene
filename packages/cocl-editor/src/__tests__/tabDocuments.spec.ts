/**
 * One document per tab - the second file of a kind no longer overwrites the first.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { setTabDocument, tabDocument, closeTabDocument, openTabIds } from '../composables/tabDocuments'

afterEach(() => { for (const id of openTabIds()) closeTabDocument(id) })

describe('Documents per tab', () => {
  it('keeps two files apart', () => {
    setTabDocument('cocl:a', { content: '<a/>', filePath: 'a.c-ocl' })
    setTabDocument('cocl:b', { content: '<b/>', filePath: 'b.c-ocl' })

    expect(tabDocument('cocl:a')?.content).toBe('<a/>')
    expect(tabDocument('cocl:b')?.content).toBe('<b/>')
  })

  it('answers the same document again when the tab is rebuilt', () => {
    setTabDocument('cocl:a', { content: '<a/>', filePath: 'a.c-ocl' })
    expect(tabDocument('cocl:a')).toBe(tabDocument('cocl:a'))
  })

  it('forgets a closed tab', () => {
    setTabDocument('cocl:a', { content: '<a/>', filePath: 'a.c-ocl' })
    closeTabDocument('cocl:a')
    expect(tabDocument('cocl:a')).toBeUndefined()
    expect(openTabIds()).not.toContain('cocl:a')
  })
})
