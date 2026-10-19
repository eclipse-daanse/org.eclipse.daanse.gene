/**
 * Database privileges (daanse privilege.ecore, resource.relational.privilege):
 * a responsible party owns its privileges as ownedElement - the grantee is
 * its namespace. A TablePrivilege grants an action (SELECT, INSERT, UPDATE,
 * DELETE, REFERENCES) on a table or view, optionally only on some of its
 * columns; a ProcedurePrivilege grants EXECUTE on a procedure or function;
 * a RolePrivilege makes the party a member of another one.
 */
import { toRaw } from 'tsm:vue'
import { attr, className, many } from './documentation'
import { createIn, setByName } from './creation'

export const PRIVILEGE_NS = 'https://www.daanse.org/spec/org.eclipse.daanse.cwm.model.daanse.resource.relational.privilege'

export const TABLE_ACTIONS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REFERENCES']

/** The class or one of its supertypes has this name */
function isKindOf(o: any, name: string): boolean {
  const c = toRaw(o)?.eClass?.()
  if (!c) return false
  return c.getName?.() === name || many(c.getEAllSuperTypes?.()).some((s: any) => s.getName?.() === name)
}

export function isPrivilege(o: any): boolean {
  return isKindOf(o, 'Privilege') && toRaw(o).eClass().getEPackage?.()?.getNsURI?.() === PRIVILEGE_NS
}

export function isTablePrivilege(o: any): boolean {
  return isPrivilege(o) && className(o) === 'TablePrivilege'
}

export function isProcedurePrivilege(o: any): boolean {
  return isPrivilege(o) && className(o) === 'ProcedurePrivilege'
}

export function isRolePrivilege(o: any): boolean {
  return isPrivilege(o) && className(o) === 'RolePrivilege'
}

/** Tables and views */
export function isColumnSet(o: any): boolean {
  return isKindOf(o, 'NamedColumnSet')
}

export function isColumnOfSet(o: any): boolean {
  return isKindOf(o, 'Column') && isColumnSet(toRaw(o)?.eContainer?.())
}

export function isProcedure(o: any): boolean {
  return className(o) === 'Procedure'
}

/** What can carry privileges: tables, views, their columns, procedures */
export function isPrivilegeTarget(o: any): boolean {
  return isColumnSet(o) || isColumnOfSet(o) || isProcedure(o)
}

/** The party holding a privilege */
export function granteeOf(privilege: any): any | null {
  const c = toRaw(privilege)?.eContainer?.()
  return c && className(c) === 'ResponsibleParty' ? toRaw(c) : null
}

/* ── finding privileges ──────────────────────────────────────────── */

export interface PrivilegeView {
  privilege: any
  grantee: any | null
  kind: 'table' | 'procedure' | 'role'
  /** SELECT …, EXECUTE, or "Mitglied" */
  action: string
  /** Table, view, procedure or the role a membership grants */
  target: any | null
  /** Columns a table privilege is limited to; empty = the whole table */
  columns: any[]
  grantable: boolean | null
  grantor: any | null
}

function literalOf(v: any): string {
  const x = toRaw(v)
  if (x == null) return ''
  return String(typeof x === 'object' ? x.getLiteral?.() ?? x.getName?.() ?? x : x)
}

export function viewOf(privilege: any): PrivilegeView {
  const p = toRaw(privilege)
  const kind = isTablePrivilege(p) ? 'table' : isProcedurePrivilege(p) ? 'procedure' : 'role'
  const g = attr(p, 'grantable')
  return {
    privilege: p,
    grantee: granteeOf(p),
    kind,
    action: kind === 'table' ? literalOf(attr(p, 'action')) : kind === 'procedure' ? 'EXECUTE' : 'Mitglied',
    target: toRaw(attr(p, kind === 'table' ? 'table' : kind === 'procedure' ? 'procedure' : 'role')) ?? null,
    columns: kind === 'table' ? many(attr(p, 'column')) : [],
    grantable: g == null ? null : !!g,
    grantor: toRaw(attr(p, 'grantor')) ?? null
  }
}

/* One index per objects list: target -> privileges on it */
const indexes = new WeakMap<any[], Map<any, any[]>>()

function indexOf(objects: any[]): Map<any, any[]> {
  let index = indexes.get(objects)
  if (index) return index
  index = new Map()
  const add = (target: any, p: any) => {
    if (!target) return
    const list = index!.get(target) ?? []
    list.push(p)
    index!.set(target, list)
  }
  for (const o of objects) {
    if (!isPrivilege(o)) continue
    const v = viewOf(o)
    if (v.kind !== 'role') add(v.target, o)
  }
  indexes.set(objects, index)
  return index
}

/**
 * The privileges on a table, view or procedure - and on a column those of
 * its table that cover it: limited to it, or to no column (the whole table).
 */
export function privilegesOn(objects: any[], target: any): PrivilegeView[] {
  const t = toRaw(target)
  const index = indexOf(objects)
  if (isColumnOfSet(t)) {
    return (index.get(toRaw(t.eContainer())) ?? []).map(viewOf)
      .filter(v => !v.columns.length || v.columns.includes(t))
  }
  return (index.get(t) ?? []).map(viewOf)
}

/** The privileges a party holds: those it owns */
export function privilegesOf(party: any): PrivilegeView[] {
  return many(toRaw(party)?.eContents?.()).filter(isPrivilege).map(viewOf)
}

/** A party's privileges show in its row, so they get no rows of their own */
export function shownPrivileges(party: any): Set<any> {
  return new Set(many(toRaw(party)?.eContents?.()).filter(isPrivilege))
}

/* ── making privileges ───────────────────────────────────────────── */

/** The name a privilege gets: "SELECT flurstueck (uuid, name)", "EXECUTE berechne" */
export function privilegeName(action: string, target: any, columns: any[] = []): string {
  const cols = columns.length ? ` (${columns.map(c => String(attr(c, 'name') ?? '')).join(', ')})` : ''
  return `${action} ${String(attr(target, 'name') ?? '')}${cols}`
}

function classOf(name: string, near: any): any | null {
  const registry = toRaw(near)?.eResource?.()?.getResourceSet?.()?.getPackageRegistry?.()
  return registry?.getEPackage?.(PRIVILEGE_NS)?.getEClassifier?.(name) ?? null
}

/** Privileges can be made: the package is registered in the model's resource set */
export function privilegesAvailable(near: any): boolean {
  return !!classOf('TablePrivilege', near)
}

function setLiteral(o: any, featureName: string, literal: string): void {
  const f = toRaw(o).eClass().getEStructuralFeature(featureName)
  const lit = many(f?.getEType?.()?.getELiterals?.()).find((l: any) => String(l.getLiteral?.() ?? l.getName?.()) === literal)
  if (lit) toRaw(o).eSet(f, lit)
}

/**
 * Grants a party `action` on a table or view (all columns, or only
 * `columns`), or EXECUTE on a procedure. An equal privilege it holds
 * already is kept. Returns the privilege.
 */
export function grantPrivilege(
  party: any,
  target: any,
  action: string,
  columns: any[] = [],
  grantable = false
): any | null {
  const t = toRaw(target)
  const procedure = isProcedure(t)
  const same = privilegesOf(party).find(v =>
    v.target === t && (procedure || (v.action === action && v.columns.length === columns.length && columns.every(c => v.columns.includes(toRaw(c))))))
  if (same) return same.privilege
  const eClass = classOf(procedure ? 'ProcedurePrivilege' : 'TablePrivilege', party)
  if (!eClass) return null
  const p = createIn(party, 'ownedElement', eClass)
  if (!p) return null
  const raw = toRaw(p)
  if (procedure) {
    raw.eSet(raw.eClass().getEStructuralFeature('procedure'), t)
    setByName(p, 'name', privilegeName('EXECUTE', t))
  } else {
    raw.eSet(raw.eClass().getEStructuralFeature('table'), t)
    setLiteral(p, 'action', action)
    const list = raw.eGet(raw.eClass().getEStructuralFeature('column'))
    for (const c of columns) list.add(toRaw(c))
    setByName(p, 'name', privilegeName(action, t, columns))
  }
  if (grantable) setByName(p, 'grantable', true)
  return p
}

/** Sets a table privilege's action; the name follows */
export function setAction(privilege: any, action: string): void {
  setLiteral(privilege, 'action', action)
  const v = viewOf(privilege)
  setByName(privilege, 'name', privilegeName(action, v.target, v.columns))
}
