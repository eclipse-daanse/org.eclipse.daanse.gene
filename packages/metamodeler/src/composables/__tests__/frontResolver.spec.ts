/**
 * The facade answers with the metamodel in front - asked, not switched.
 *
 * Commands (save, validate, the menu) go through `useSharedMetamodeler()`. Which
 * instance that is comes from a resolver the module registers from the front
 * service; without one it is the shared instance.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { useMetamodeler, useSharedMetamodeler, setMetamodelerFrontResolver } from '../useMetamodeler'

afterEach(() => setMetamodelerFrontResolver(null))

describe('The facade', () => {
  it('answers with whatever the resolver names', () => {
    const a = useMetamodeler()
    const b = useMetamodeler()
    const facade = useSharedMetamodeler()

    setMetamodelerFrontResolver(() => a)
    expect(facade.rootPackage).toBe(a.rootPackage)

    setMetamodelerFrontResolver(() => b)
    expect(facade.rootPackage).toBe(b.rootPackage)
  })

  it('falls back to the shared instance when nothing is in front', () => {
    const a = useMetamodeler()
    const facade = useSharedMetamodeler()

    setMetamodelerFrontResolver(() => null)
    expect(facade.rootPackage).not.toBe(a.rootPackage)
    // and stays the same shared one from call to call
    expect(useSharedMetamodeler().rootPackage).toBe(facade.rootPackage)
  })

  it('asks the resolver on every access, not once', () => {
    const a = useMetamodeler()
    const b = useMetamodeler()
    const facade = useSharedMetamodeler()
    let front = a
    setMetamodelerFrontResolver(() => front)

    expect(facade.rootPackage).toBe(a.rootPackage)
    front = b
    expect(facade.rootPackage).toBe(b.rootPackage)
  })
})
