import { describe, it, expect } from 'vitest'
import { oclContextName } from '../composables/oclContext'

describe('context class as OCL writes it', () => {
  it('dotted package path becomes ::', () => {
    expect(oclContextName('university.Student')).toBe('university::Student')
    expect(oclContextName('a.b.C')).toBe('a::b::C')
  })

  it('a bare class name stays', () => {
    expect(oclContextName('Student')).toBe('Student')
  })

  it('URI form: the class after #//', () => {
    expect(oclContextName('http://example.com/university#//Student')).toBe('Student')
  })

  it('nothing set: nothing', () => {
    expect(oclContextName('')).toBe('')
    expect(oclContextName(undefined)).toBe('')
  })
})
