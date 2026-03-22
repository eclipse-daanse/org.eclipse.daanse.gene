/**
Copyright (c) 2025 Contributors to the  Eclipse Foundation.
This program and the accompanying materials are made
available under the terms of the Eclipse Public License 2.0
which is available at https://www.eclipse.org/legal/epl-2.0/
SPDX-License-Identifier: EPL-2.0

Contributors: Smart City Jena
*/

import { describe, it, expect } from 'vitest'
import { GeneService } from '../src/GeneService'
import { greet } from '../src/utils'

describe('GeneService', () => {
  it('should return a greeting', () => {
    const service = new GeneService({ name: 'Daanse', version: '1.0.0' })
    expect(service.getGreeting()).toBe('Hello, Daanse! Welcome to Eclipse Daanse Gene.')
  })

  it('should return info string', () => {
    const service = new GeneService({ name: 'Gene', version: '2.0.0' })
    expect(service.getInfo()).toBe('Gene v2.0.0')
  })

  it('should default debug to false', () => {
    const service = new GeneService({ name: 'Test', version: '0.1.0' })
    expect(service.isDebug()).toBe(false)
  })

  it('should respect debug flag', () => {
    const service = new GeneService({ name: 'Test', version: '0.1.0', debug: true })
    expect(service.isDebug()).toBe(true)
  })
})

describe('greet', () => {
  it('should greet by name', () => {
    expect(greet('World')).toBe('Hello, World! Welcome to Eclipse Daanse Gene.')
  })
})
