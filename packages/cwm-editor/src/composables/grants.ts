/**
 * Access grants (daanse rolap.mapping, package access): an AccessRole holds
 * per catalog the grants on cubes, dimensions, hierarchies, database schemas,
 * tables and columns. The role's row shows them as one table; every object a
 * grant points at shows which roles may access it - the way back.
 */
import { toRaw } from 'tsm:vue'
import { attr, className, many } from './documentation'
import { createIn, setByName } from './creation'

/** Per grant class: the reference to its object, the access attribute, a label for the level */
export const GRANT_KINDS: Record<string, { target: string | null; access: string; level: string }> = {
  AccessCatalogGrant: { target: null, access: 'catalogAccess', level: 'Katalog' },
  AccessCubeGrant: { target: 'cube', access: 'cubeAccess', level: 'Cube' },
  AccessDimensionGrant: { target: 'dimension', access: 'dimensionAccess', level: 'Dimension' },
  AccessHierarchyGrant: { target: 'hierarchy', access: 'hierarchyAccess', level: 'Hierarchie' },
  AccessMemberGrant: { target: null, access: 'memberAccess', level: 'Member' },
  AccessDatabaseSchemaGrant: { target: 'databaseSchema', access: 'databaseSchemaAccess', level: 'Schema' },
  AccessTableGrant: { target: 'table', access: 'tableAccess', level: 'Tabelle' },
  AccessColumnGrant: { target: 'column', access: 'columnAccess', level: 'Spalte' }
}

export function isGrant(o: any): boolean {
  return className(o) in GRANT_KINDS
}

export function isAccessRole(o: any): boolean {
  return className(o) === 'AccessRole'
}

export interface GrantRow {
  grant: any
  /** 0 for a catalog grant, deeper for what it holds */
  depth: number
  level: string
  /** The object the grant is on; null for catalog and member grants */
  target: any | null
  targetName: string
  /** The access literal: all, none, custom … */
  access: string
  /** The access attribute, for editing */
  accessFeature: any
  role: any | null
}

function literalOf(value: any): string {
  const v = toRaw(value)
  if (v == null) return ''
  return String(typeof v === 'object' ? v.getLiteral?.() ?? v.getName?.() ?? v : v)
}

/** The role a grant belongs to */
export function roleOf(grant: any): any | null {
  for (let p = toRaw(grant)?.eContainer?.(); p; p = p.eContainer?.()) if (isAccessRole(p)) return toRaw(p)
  return null
}

function rowOf(grant: any, depth: number): GrantRow {
  const kind = GRANT_KINDS[className(grant)]!
  const target = kind.target ? toRaw(attr(grant, kind.target)) ?? null : null
  return {
    grant,
    depth,
    level: kind.level,
    target,
    targetName: target ? String(attr(target, 'name') ?? '') || '(ohne Namen)' : '',
    access: literalOf(attr(grant, kind.access)),
    accessFeature: toRaw(grant).eClass().getEStructuralFeature(kind.access),
    role: roleOf(grant)
  }
}

/** The grants of a role, depth first: catalog, then cubes and schemas with what they hold */
export function roleGrantRows(role: any): GrantRow[] {
  const rows: GrantRow[] = []
  const walk = (o: any, depth: number) => {
    for (const c of many(toRaw(o)?.eContents?.())) {
      if (!isGrant(c)) continue
      rows.push(rowOf(c, depth))
      walk(c, depth + 1)
    }
  }
  walk(role, 0)
  return rows
}

/** Everything a role's grant table shows, so it gets no rows of its own */
export function shownByRole(role: any): Set<any> {
  const shown = new Set<any>()
  const walk = (o: any) => {
    for (const c of many(toRaw(o)?.eContents?.())) {
      if (!isGrant(c)) continue
      shown.add(c)
      walk(c)
    }
  }
  walk(role)
  return shown
}

export type GrantIndex = Map<any, any[]>

/** object -> the grants on it */
export function buildGrantIndex(objects: any[]): GrantIndex {
  const index: GrantIndex = new Map()
  const add = (grant: any) => {
    const kind = GRANT_KINDS[className(grant)]
    const target = kind?.target ? toRaw(attr(grant, kind.target)) : null
    if (!target) return
    const list = index.get(target) ?? []
    list.push(grant)
    index.set(target, list)
  }
  const walk = (o: any) => {
    for (const c of many(toRaw(o)?.eContents?.())) {
      if (isGrant(c)) add(c)
      walk(c)
    }
  }
  for (const role of objects.filter(isAccessRole)) walk(role)
  return index
}

/** The grants on an object - for a table also those on its columns */
export function grantsOn(index: GrantIndex, object: any): GrantRow[] {
  const o = toRaw(object)
  const grants = [...(index.get(o) ?? [])]
  for (const c of many(attr(o, 'feature'))) grants.push(...(index.get(toRaw(c)) ?? []))
  return grants.map(g => rowOf(g, 0))
}

export function accessOptions(row: GrantRow): string[] {
  return many(row.accessFeature?.getEType?.()?.getELiterals?.()).map((l: any) => String(l.getLiteral?.() ?? l.getName?.()))
}

/* ── creating grants ─────────────────────────────────────────────── */

/** The class or one of its supertypes has this name */
export function isKindOf(o: any, name: string): boolean {
  const c = toRaw(o)?.eClass?.()
  if (!c) return false
  return c.getName?.() === name || many(c.getEAllSuperTypes?.()).some((s: any) => s.getName?.() === name)
}

/** What a grant can hold: the containment feature, the level, and the objects it may point at */
export interface GrantChildKind {
  feature: string
  level: string
  /** Candidates for the new grant's object; none for levels without one */
  targets: (parent: any, objects: any[]) => any[]
}

const ofKind = (name: string) => (_: any, objects: any[]) => objects.filter(o => isKindOf(o, name))

/** Tables and views of the schema a schema grant is on (all, while it has none) */
function tablesOf(schemaGrant: any, objects: any[]): any[] {
  const schema = toRaw(attr(schemaGrant, 'databaseSchema'))
  const all = objects.filter(o => isKindOf(o, 'NamedColumnSet'))
  return schema ? all.filter(t => toRaw(t.eContainer?.()) === schema) : all
}

function columnsOf(tableGrant: any, objects: any[]): any[] {
  const table = toRaw(attr(tableGrant, 'table'))
  return table ? many(attr(table, 'feature')).filter(c => isKindOf(c, 'Column')) : objects.filter(o => isKindOf(o, 'Column'))
}

export const GRANT_CHILDREN: Record<string, GrantChildKind[]> = {
  AccessRole: [{ feature: 'accessCatalogGrants', level: 'Katalog', targets: () => [] }],
  AccessCatalogGrant: [
    { feature: 'databaseSchemaGrants', level: 'Schema', targets: ofKind('Schema') },
    { feature: 'cubeGrants', level: 'Cube', targets: ofKind('Cube') }
  ],
  AccessDatabaseSchemaGrant: [{ feature: 'tableGrants', level: 'Tabelle', targets: tablesOf }],
  AccessTableGrant: [{ feature: 'columnGrants', level: 'Spalte', targets: columnsOf }],
  AccessCubeGrant: [
    { feature: 'dimensionGrants', level: 'Dimension', targets: ofKind('Dimension') },
    { feature: 'hierarchyGrants', level: 'Hierarchie', targets: ofKind('Hierarchy') }
  ],
  AccessHierarchyGrant: [{ feature: 'memberGrants', level: 'Member', targets: () => [] }]
}

/** The kinds of grant the object can hold */
export function grantChildKinds(o: any): GrantChildKind[] {
  return GRANT_CHILDREN[className(o)] ?? []
}

function featureOf(o: any, name: string): any {
  return toRaw(o).eClass().getEStructuralFeature(name)
}

function typeOf(feature: any): any {
  try {
    return feature.getEReferenceType?.() ?? feature.getEType?.()
  } catch {
    return feature.getEType?.()
  }
}

function setLiteral(o: any, featureName: string, literal: string): void {
  const f = featureOf(o, featureName)
  const lit = many(f?.getEType?.()?.getELiterals?.()).find((l: any) => String(l.getLiteral?.() ?? l.getName?.()) === literal)
  if (lit) toRaw(o).eSet(f, lit)
}

/**
 * A new grant in `parent`'s feature, on `target`, with `access`. A
 * hierarchy grant gets a rollup policy (required) - "full".
 */
export function addGrant(parent: any, featureName: string, target: any | null, access: string): any | null {
  const p = toRaw(parent)
  const feature = featureOf(p, featureName)
  if (!feature) return null
  // Through createIn, so the new grant gets its xmi:id like any new object
  const grant = createIn(p, featureName, typeOf(feature))
  if (!grant) return null
  const kind = GRANT_KINDS[className(grant)]
  if (kind?.target && target) toRaw(grant).eSet(featureOf(grant, kind.target), toRaw(target))
  if (kind) setLiteral(grant, kind.access, access)
  if (className(grant) === 'AccessHierarchyGrant') setLiteral(grant, 'rollupPolicy', 'full')
  return grant
}

/* ── the assistant: grants kept under a responsible party ────────── */

/*
 * Design decision (Stefan, 2026-10-19 10:45): grants made with the assistant
 * always lie under the responsible party chosen - in an AccessRole the party
 * contains. Made through the tree or the + of the structure they can lie
 * anywhere.
 */

/** Objects the assistant can grant access to */
export function grantableTargets(objects: any[]): any[] {
  return objects.filter(o => ['Schema', 'NamedColumnSet', 'Column', 'Cube'].some(k => isKindOf(o, k)))
}

export function isGrantable(o: any): boolean {
  return grantableTargets([o]).length > 0
}

const ACCESS_COMMON_NS = 'https://www.daanse.org/spec/org.eclipse.daanse.rolap.mapping/access/common'

function accessRoleClass(party: any, objects: any[]): any | null {
  const existing = objects.find(isAccessRole)
  if (existing) return toRaw(existing).eClass()
  const registry = toRaw(party)?.eResource?.()?.getResourceSet?.()?.getPackageRegistry?.()
  return registry?.getEPackage?.(ACCESS_COMMON_NS)?.getEClassifier?.('AccessRole') ?? null
}

/** The party's role for the assistant's grants: the first it contains, else a new one named after it */
export function roleOfParty(party: any, objects: any[]): any | null {
  const p = toRaw(party)
  const own = many(attr(p, 'ownedElement')).find(isAccessRole)
  if (own) return own
  const eClass = accessRoleClass(p, objects)
  if (!eClass) return null
  const role = createIn(p, 'ownedElement', eClass)
  if (role) setByName(role, 'name', String(attr(p, 'name') ?? 'Rolle'))
  return role
}

/** The grant in `parent`'s feature on `target` - found, or made with `access` */
function grantOn(parent: any, featureName: string, target: any | null, access: string): any | null {
  const found = many(attr(parent, featureName)).find(g => {
    const kind = GRANT_KINDS[className(g)]
    return !kind?.target || toRaw(attr(g, kind.target)) === toRaw(target)
  })
  return found ?? addGrant(parent, featureName, target, access)
}

/**
 * Grants a responsible party `access` to a schema, table, column or cube:
 * under the party's role, with the grants in between (catalog, schema,
 * table) made as "custom" where missing. Returns the grant on the target.
 */
export function grantForParty(party: any, target: any, access: string, objects: any[]): any | null {
  const role = roleOfParty(party, objects)
  return role ? grantInRole(role, target, access) : null
}

/**
 * Grants `access` to a schema, table, column or cube in the given role, with
 * the grants in between (catalog, schema, table) made as "custom" where
 * missing. Returns the grant on the target.
 */
export function grantInRole(role: any, target: any, access: string): any | null {
  const catalogGrant = grantOn(role, 'accessCatalogGrants', null, 'custom')
  if (!catalogGrant) return null
  const set = (g: any) => {
    const kind = GRANT_KINDS[className(g)]
    if (g && kind) setLiteral(g, kind.access, access)
    return g
  }
  const t = toRaw(target)
  if (isKindOf(t, 'Cube')) return set(grantOn(catalogGrant, 'cubeGrants', t, access))
  if (isKindOf(t, 'Schema')) return set(grantOn(catalogGrant, 'databaseSchemaGrants', t, access))
  const table = isKindOf(t, 'Column') ? toRaw(t.eContainer?.()) : t
  const schema = toRaw(table?.eContainer?.())
  const schemaGrant = grantOn(catalogGrant, 'databaseSchemaGrants', schema, 'custom')
  if (!schemaGrant) return null
  if (t === table) return set(grantOn(schemaGrant, 'tableGrants', table, access))
  const tableGrant = grantOn(schemaGrant, 'tableGrants', table, 'custom')
  return tableGrant ? set(grantOn(tableGrant, 'columnGrants', t, access)) : null
}

/** The access roles a party contains */
export function rolesOfParty(party: any): any[] {
  return many(toRaw(party)?.eContents?.()).filter(isAccessRole)
}

/** The grants of all roles a party contains, as one table */
export function partyGrantRows(party: any): GrantRow[] {
  return rolesOfParty(party).flatMap(r => roleGrantRows(r))
}

/** The party a role lies under, if any */
export function partyOfRole(role: any): any | null {
  const c = toRaw(role)?.eContainer?.()
  return c && className(c) === 'ResponsibleParty' ? toRaw(c) : null
}
