/**
 * The O/R mapping of an orm mapping set (EntityMappings of the daanse orm
 * model) as two sides and the lines between them: the classes with their
 * attributes and association ends, the column sets (tables, views) with their
 * columns, per managed type (Entity, MappedSuperclass, Embeddable) the column
 * sets it is stored in, and per attribute mapping (Id, Basic, Version,
 * ManyToOne, ...) the columns it lands in.
 *
 * The mapping only references CWM elements (cwmClass, cwmTable, cwmAttribute,
 * cwmColumn ...) - names and types always come from those. Editing here
 * creates, retargets and removes the mapping objects; new columns and
 * attributes are made in the referenced table and class.
 */
import { toRaw } from 'tsm:vue'
import { attr, className, many } from './documentation'
import { children } from './contextView'
import { createIn, setByName } from './creation'
import { inherits, isAssociationEnd, rangeBounds } from './attributes'
import { setPrimaryKey } from './columnsEdit'

const ORM = 'daanse.orm'

function nsUri(o: any): string {
  return toRaw(o)?.eClass?.()?.getEPackage?.()?.getNsURI?.() ?? ''
}

/** The kinds of attribute mapping, each in the managed type's feature of that name */
export const MAPPING_KINDS = [
  'Id', 'Basic', 'Version', 'Transient', 'ManyToOne', 'OneToOne', 'OneToMany', 'ManyToMany',
  'Embedded', 'EmbeddedId', 'ElementCollection'
] as const
export type MappingKind = typeof MAPPING_KINDS[number]

const FEATURE_OF: Record<MappingKind, string> = {
  Id: 'id', Basic: 'basic', Version: 'version', Transient: 'transient', ManyToOne: 'manyToOne',
  OneToOne: 'oneToOne', OneToMany: 'oneToMany', ManyToMany: 'manyToMany', Embedded: 'embedded',
  EmbeddedId: 'embeddedId', ElementCollection: 'elementCollection'
}

/** Kinds a plain attribute can switch between - each keeps one column */
export const VALUE_KINDS: MappingKind[] = ['Id', 'Basic', 'Version', 'Transient']
/** Kinds an association end can switch between - each keeps its join columns */
export const RELATION_KINDS: MappingKind[] = ['ManyToOne', 'OneToOne', 'OneToMany', 'ManyToMany']

/** One colour per kind: line, chip and the dots of both ends */
export const KIND_COLORS: Record<MappingKind, string> = {
  Id: '#d97706',
  Basic: '#2563eb',
  Version: '#0d9488',
  Transient: '#94a3b8',
  ManyToOne: '#7c3aed',
  OneToOne: '#9333ea',
  OneToMany: '#db2777',
  ManyToMany: '#be185d',
  Embedded: '#16a34a',
  EmbeddedId: '#ca8a04',
  ElementCollection: '#059669'
}

export const KIND_LABELS: Record<MappingKind, string> = {
  Id: 'Id', Basic: 'Basic', Version: 'Version', Transient: 'Transient', ManyToOne: 'n:1',
  OneToOne: '1:1', OneToMany: '1:n', ManyToMany: 'n:m', Embedded: 'Embedded', EmbeddedId: 'EmbeddedId',
  ElementCollection: 'Collection'
}

function valuesOf(o: any, featureName: string): any[] {
  const v = attr(o, featureName)
  if (v == null) return []
  return typeof v.toArray === 'function' || typeof v[Symbol.iterator] === 'function' ? many(v) : [toRaw(v)]
}

function featureOf(o: any, name: string): any {
  return toRaw(o).eClass().getEStructuralFeature(name)
}

function ormClass(context: any, name: string): any {
  return toRaw(context).eClass().getEPackage().getEClassifier(name)
}

function remove(o: any): void {
  const raw = toRaw(o)
  const container = raw?.eContainer?.()
  const feature = raw?.eContainingFeature?.()
  if (!container || !feature) return
  const value = toRaw(container.eGet(feature))
  if (value && typeof value.remove === 'function') value.remove(raw)
  else container.eSet(feature, null)
}

function name(o: any): string {
  return String(attr(o, 'name') ?? '')
}

/* ── the two sides ───────────────────────────────────────────────── */

export interface ClassMember {
  /** core::Attribute or relationships::AssociationEnd */
  feature: any
  name: string
  typeName: string
  /** The member's type - a class on the board makes an embedding (or a reference) line */
  typeObject: any | null
  isEnd: boolean
  /** An end that leads to many objects */
  toMany: boolean
}

export interface ColumnEntry {
  column: any
  name: string
  typeName: string
  primaryKey: boolean
  foreignKey: boolean
}

export interface ColumnSetEntry {
  set: any
  name: string
  /** Table, View, ... - the CWM class */
  kind: string
  /** Primary or secondary table of the entity */
  role: 'primary' | 'secondary'
  /** The SecondaryTable mapping object for a secondary table */
  holder: any | null
  columns: ColumnEntry[]
}

/** A column a mapping holds: through a Column/JoinColumn object, or an embedding's AttributeOverride */
export interface MappedColumn {
  /** Removing it removes the line */
  holder: any
  column: any
  /** For a join column: the column it refers to */
  referenced: any | null
  /** For an attribute override: the embedded attribute's path */
  path?: string
}

export interface MappingEntry {
  mapping: any
  kind: MappingKind
  /** cwmAttribute or cwmAssociationEnd */
  feature: any | null
  columns: MappedColumn[]
}

export interface MappingModel {
  type: any
  cls: any | null
  members: ClassMember[]
  sets: ColumnSetEntry[]
  mappings: MappingEntry[]
}

export function kindOfMapping(m: any): MappingKind | null {
  const n = className(m)
  return (MAPPING_KINDS as readonly string[]).includes(n) ? n as MappingKind : null
}

/** Association ends the class can navigate: the other ends of the associations one of whose ends is the class */
function navigableEnds(cls: any, objects: any[]): any[] {
  const out: any[] = []
  for (const a of objects) {
    if (className(a) !== 'Association') continue
    const ends = many(attr(a, 'feature')).filter(isAssociationEnd)
    if (!ends.some(e => toRaw(attr(e, 'type')) === cls)) continue
    for (const e of ends) {
      // The end whose type is the class itself belongs to the other side - unless both are the class
      if (toRaw(attr(e, 'type')) !== cls || ends.every(x => toRaw(attr(x, 'type')) === cls)) out.push(e)
    }
  }
  return out
}

function members(cls: any, objects: any[]): ClassMember[] {
  if (!cls) return []
  const attributes = many(attr(cls, 'feature')).filter(f => inherits(f, 'Attribute') && !isAssociationEnd(f))
  const ends = navigableEnds(cls, objects)
  return [
    ...attributes.map(a => {
      const type = toRaw(attr(a, 'type')) ?? null
      return { feature: a, name: name(a), typeName: name(type), typeObject: type, isEnd: false, toMany: false }
    }),
    ...ends.map(e => {
      const upper = rangeBounds(e).upper
      const type = toRaw(attr(e, 'type')) ?? null
      return { feature: e, name: name(e), typeName: name(type), typeObject: type, isEnd: true, toMany: upper === '*' || Number(upper) > 1 }
    })
  ]
}

function columnSet(set: any, role: 'primary' | 'secondary', holder: any | null): ColumnSetEntry {
  const owned = children(set)
  const keys = owned.filter(e => className(e) === 'PrimaryKey')
  const fks = owned.filter(e => className(e) === 'ForeignKey')
  const inKey = (k: any, c: any) => many(attr(k, 'feature')).includes(c)
  return {
    set,
    name: name(set),
    kind: className(set),
    role,
    holder,
    columns: many(attr(set, 'feature')).filter(c => className(c) === 'Column').map(c => ({
      column: c,
      name: name(c),
      typeName: name(toRaw(attr(c, 'type'))),
      primaryKey: keys.some(k => inKey(k, c)),
      foreignKey: fks.some(k => inKey(k, c))
    }))
  }
}

function mappedColumns(m: any): MappedColumn[] {
  const out: MappedColumn[] = []
  const col = toRaw(attr(m, 'column'))
  if (col && attr(col, 'cwmColumn')) out.push({ holder: col, column: toRaw(attr(col, 'cwmColumn')), referenced: null })
  for (const jc of valuesOf(m, 'joinColumn')) {
    const c = toRaw(attr(jc, 'cwmColumn'))
    if (c) out.push({ holder: jc, column: c, referenced: toRaw(attr(jc, 'cwmReferencedColumn')) ?? null })
  }
  // An embedding's overrides: the embedded attribute (by its path) lands in another column
  for (const ao of valuesOf(m, 'attributeOverride')) {
    const c = toRaw(attr(toRaw(attr(ao, 'column')), 'cwmColumn'))
    if (c) out.push({ holder: ao, column: c, referenced: null, path: name(ao) })
  }
  // The further columns of a relationship or collection: order and map key, shared primary key,
  // and those of its join or collection table
  const columnOf = (holder: any, path: string) => {
    const c = toRaw(attr(holder, 'cwmColumn'))
    if (c) out.push({ holder, column: c, referenced: toRaw(attr(holder, 'cwmReferencedColumn')) ?? null, path })
  }
  for (const h of valuesOf(m, 'orderColumn')) columnOf(h, 'order')
  for (const h of valuesOf(m, 'mapKeyColumn')) columnOf(h, 'map key')
  for (const h of valuesOf(m, 'mapKeyJoinColumn')) columnOf(h, 'map key')
  for (const h of valuesOf(m, 'primaryKeyJoinColumn')) columnOf(h, 'primary key')
  for (const table of [...valuesOf(m, 'joinTable'), ...valuesOf(m, 'collectionTable')]) {
    for (const h of valuesOf(table, 'joinColumn')) columnOf(h, 'join')
    for (const h of valuesOf(table, 'inverseJoinColumn')) columnOf(h, 'inverse join')
  }
  return out
}

export function mappingModel(type: any, objects: any[]): MappingModel {
  const t = toRaw(type)
  const cls = toRaw(attr(t, 'cwmClass')) ?? null
  const sets: ColumnSetEntry[] = []
  const table = toRaw(attr(t, 'cwmTable'))
  if (table) sets.push(columnSet(table, 'primary', null))
  for (const st of valuesOf(t, 'secondaryTable')) {
    const s = toRaw(attr(st, 'cwmTable'))
    if (s) sets.push(columnSet(s, 'secondary', st))
  }
  const mappings: MappingEntry[] = []
  for (const kind of MAPPING_KINDS) {
    for (const m of valuesOf(t, FEATURE_OF[kind])) {
      mappings.push({
        mapping: m,
        kind,
        feature: toRaw(attr(m, 'cwmAttribute') ?? attr(m, 'cwmAssociationEnd')) ?? null,
        columns: mappedColumns(m)
      })
    }
  }
  return { type: t, cls, members: members(cls, objects), sets, mappings }
}

/* ── candidates for the two sides ────────────────────────────────── */

/** The EntityMappings around the managed type, whose anchors narrow the choice */
function entityMappings(type: any): any | null {
  for (let p = toRaw(type)?.eContainer?.(); p; p = p.eContainer?.()) if (className(p) === 'EntityMappings') return toRaw(p)
  return null
}

function isWithin(o: any, ancestor: any): boolean {
  for (let p = toRaw(o); p; p = p.eContainer?.()) if (toRaw(p) === ancestor) return true
  return false
}

/** Classes to map: those in the mapping set's object package when it names one */
export function classCandidates(type: any, objects: any[], em: any = entityMappings(type)): any[] {
  const pkg = toRaw(attr(em, 'cwmObjectPackage'))
  return objects
    .filter(o => className(o) === 'Class' && inherits(o, 'Classifier') && !inherits(o, 'NamedColumnSet'))
    .filter(o => !pkg || isWithin(o, pkg))
    .sort((a, b) => name(a).localeCompare(name(b)))
}

/** Tables and views to store in: those in the mapping set's schema (or catalog) when it names one */
export function columnSetCandidates(type: any, objects: any[], em: any = entityMappings(type)): any[] {
  const scope = toRaw(attr(em, 'cwmSchema')) ?? toRaw(attr(em, 'cwmCatalog'))
  return objects
    .filter(o => inherits(o, 'NamedColumnSet'))
    .filter(o => !scope || isWithin(o, scope))
    .sort((a, b) => name(a).localeCompare(name(b)))
}

export function addSecondaryTable(type: any, set: any): void {
  const t = toRaw(type)
  const st = createIn(t, 'secondaryTable', ormClass(t, 'SecondaryTable'))
  if (st) st.eSet(featureOf(st, 'cwmTable'), toRaw(set))
}

/* ── editing the lines ───────────────────────────────────────────── */

function primaryKeyOf(column: any): any | null {
  const set = toRaw(column)?.eContainer?.()
  return children(set).find(e => className(e) === 'PrimaryKey' && many(attr(e, 'feature')).includes(toRaw(column)))
    ?? children(set).find(e => className(e) === 'PrimaryKey')
    ?? null
}

function newColumnHolder(m: any, column: any): void {
  const holder = createIn(m, 'column', ormClass(m, 'Column'))
  if (holder) holder.eSet(featureOf(holder, 'cwmColumn'), toRaw(column))
}

function newJoinColumn(m: any, column: any): void {
  const holder = createIn(m, 'joinColumn', ormClass(m, 'JoinColumn'))
  if (holder) holder.eSet(featureOf(holder, 'cwmColumn'), toRaw(column))
}

/** Creates a mapping of `kind` for the class member, named like it */
function newMapping(type: any, kind: MappingKind, member: any): any | null {
  const t = toRaw(type)
  const m = createIn(t, FEATURE_OF[kind], ormClass(t, kind))
  if (!m) return null
  setByName(m, 'name', name(member))
  const ref = featureOf(m, 'cwmAttribute') ?? featureOf(m, 'cwmAssociationEnd')
  if (ref) m.eSet(ref, toRaw(member))
  return m
}

/** Takes the column out of every mapping of the type that holds it (one column, one line) */
function release(model: MappingModel, column: any, except?: any): void {
  for (const e of model.mappings) {
    if (e.mapping === except) continue
    for (const c of e.columns) if (c.column === toRaw(column)) remove(c.holder)
  }
}

/**
 * Connects a class member with a column: its mapping, made if missing, now
 * holds the column - an Id when the column is in the primary key, a Basic
 * otherwise; an association end gets a ManyToOne (to one) or OneToMany with
 * a join column. A Transient becomes a Basic. The column leaves any other
 * mapping of the type.
 */
export function connect(model: MappingModel, member: ClassMember, column: any): void {
  const col = toRaw(column)
  let entry = model.mappings.find(e => e.feature === toRaw(member.feature))
  if (entry?.kind === 'Transient') {
    remove(entry.mapping)
    entry = undefined
  }
  release(model, col, entry?.mapping)
  if (!entry) {
    const pk = !member.isEnd && primaryKeyOf(col) && many(attr(primaryKeyOf(col), 'feature')).includes(col)
    const kind: MappingKind = member.isEnd ? (member.toMany ? 'OneToMany' : 'ManyToOne') : (pk ? 'Id' : 'Basic')
    const m = newMapping(model.type, kind, member.feature)
    if (!m) return
    if (kind === 'Id') {
      const key = primaryKeyOf(col)
      const f = featureOf(m, 'cwmPrimaryKey')
      if (key && f) m.eSet(f, key)
    }
    if (member.isEnd) newJoinColumn(m, col)
    else newColumnHolder(m, col)
    return
  }
  holdColumn(entry.mapping, col)
}

/** The mapping now holds the column: a relationship one more join column (its only one moves), a value mapping its column */
function holdColumn(mapping: any, column: any): void {
  const m = toRaw(mapping)
  const col = toRaw(column)
  if (featureOf(m, 'joinColumn')) {
    const list = valuesOf(m, 'joinColumn')
    if (list.some(jc => toRaw(attr(jc, 'cwmColumn')) === col)) return
    if (list.length === 1) list[0].eSet(featureOf(list[0], 'cwmColumn'), col)
    else newJoinColumn(m, col)
  } else if (featureOf(m, 'column')) {
    const holder = toRaw(attr(m, 'column'))
    if (holder) holder.eSet(featureOf(holder, 'cwmColumn'), col)
    else newColumnHolder(m, col)
  }
}

/** A mapping onto a column: it holds the column, which leaves any other mapping of the type */
export function connectMapping(model: MappingModel, entry: MappingEntry, column: any): void {
  release(model, column, entry.mapping)
  holdColumn(entry.mapping, column)
}

/** A mapping onto a class member: it maps that member now */
export function bindMember(entry: MappingEntry, member: ClassMember): void {
  const m = toRaw(entry.mapping)
  const ref = featureOf(m, member.isEnd ? 'cwmAssociationEnd' : 'cwmAttribute')
  if (!ref) return
  m.eSet(ref, toRaw(member.feature))
  setByName(m, 'name', member.name)
}

/** Removes a line between a mapping and a column: the column holder only - the mapping stays */
export function disconnect(column: MappedColumn): void {
  remove(column.holder)
}

/** Removes the mapping with its column holders */
export function removeMapping(entry: MappingEntry): void {
  remove(entry.mapping)
}

/** Removes the managed type with all its mappings */
export function removeType(type: any): void {
  remove(type)
}

/** Kinds the mapping can turn into without losing its columns */
export function kindChoices(entry: MappingEntry): MappingKind[] {
  if (VALUE_KINDS.includes(entry.kind)) return VALUE_KINDS
  if (RELATION_KINDS.includes(entry.kind)) return RELATION_KINDS
  return [entry.kind]
}

/** Turns the mapping into another kind: a new object with its name, description, member and columns */
export function changeKind(model: MappingModel, entry: MappingEntry, kind: MappingKind): any | null {
  if (kind === entry.kind || !entry.feature) return null
  const old = entry.mapping
  const m = newMapping(model.type, kind, entry.feature)
  if (!m) return null
  setByName(m, 'name', name(old))
  const description = attr(old, 'description')
  if (description) setByName(m, 'description', description)
  if (kind !== 'Transient') {
    for (const c of entry.columns) {
      if (featureOf(m, 'joinColumn')) newJoinColumn(m, c.column)
      else if (featureOf(m, 'column') && !attr(m, 'column')) newColumnHolder(m, c.column)
    }
    if (kind === 'Id' && entry.columns[0]) {
      const key = primaryKeyOf(entry.columns[0].column)
      const f = featureOf(m, 'cwmPrimaryKey')
      if (key && f) m.eSet(f, key)
    }
  }
  remove(old)
  return m
}

/* ── creating the other side ─────────────────────────────────────── */

/** bookTitle -> BOOK_TITLE */
export function columnNameFor(attributeName: string): string {
  return attributeName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()
}

/** BOOK_TITLE -> bookTitle */
export function attributeNameFor(columnName: string): string {
  const parts = columnName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  return parts.map((p, i) => i === 0 ? p : p[0].toUpperCase() + p.slice(1)).join('')
}

/** Java-ish type name -> SQL type names to look for, best first */
const SQL_FOR: [RegExp, string[]][] = [
  [/^(string|char(acter)?)$/i, ['VARCHAR', 'CHAR', 'TEXT', 'CLOB']],
  [/^(int|integer|short)$/i, ['INTEGER', 'INT', 'SMALLINT']],
  [/^long$/i, ['BIGINT', 'INTEGER', 'NUMERIC']],
  [/^(double|float|bigdecimal|decimal)$/i, ['DECIMAL', 'NUMERIC', 'DOUBLE', 'FLOAT', 'REAL']],
  [/^boolean$/i, ['BOOLEAN', 'BIT', 'SMALLINT']],
  [/^(date|localdate)$/i, ['DATE']],
  [/^(localdatetime|instant|timestamp|datetime)$/i, ['TIMESTAMP']],
  [/^(time|localtime)$/i, ['TIME']],
  [/^(uuid)$/i, ['UUID', 'VARCHAR']],
  [/^byte\[\]|blob$/i, ['BLOB', 'VARBINARY']]
]

function bestType(candidates: any[], wanted: string[]): any | null {
  for (const w of wanted) {
    const hit = candidates.find(c => name(c).toUpperCase() === w)
    if (hit) return hit
  }
  return null
}

/** A new column in the column set for the member, typed after it, and connected */
export function createColumnFor(model: MappingModel | null, member: ClassMember, set: any, dataTypes: any[]): any | null {
  const s = toRaw(set)
  const column = createIn(s, 'feature', s.eClass().getEPackage().getEClassifier('Column'))
  if (!column) return null
  const base = member.isEnd ? `${columnNameFor(member.name)}_ID` : columnNameFor(member.name)
  setByName(column, 'name', base)
  const wanted = member.isEnd ? ['BIGINT', 'INTEGER'] : SQL_FOR.find(([re]) => re.test(member.typeName))?.[1] ?? ['VARCHAR']
  const type = bestType(dataTypes, wanted)
  if (type) setByName(column, 'type', toRaw(type))
  if (model) connect(model, member, column)
  return column
}

/** A new attribute in the class for the column, typed after it from the class's data types, and connected */
export function createAttributeFor(model: MappingModel | null, cls: any, column: ColumnEntry, objects: any[]): any | null {
  if (!cls) return null
  const attributeClass = many(attr(cls, 'feature')).find(f => inherits(f, 'Attribute') && !isAssociationEnd(f))?.eClass?.()
    ?? cls.eClass().getEPackage().getEClassifier('Attribute')
  const a = createIn(cls, 'feature', attributeClass)
  if (!a) return null
  setByName(a, 'name', attributeNameFor(column.name))
  const sql = column.typeName.toUpperCase()
  const javaNames = SQL_FOR.filter(([, s]) => s.includes(sql)).map(([re]) => re)
  const pkg = cls.eContainer?.()
  const dataTypes = objects.filter(o => className(o) === 'DataType' && (!pkg || toRaw(o.eContainer?.()) === toRaw(pkg)))
  const type = dataTypes.find(d => javaNames.some(re => re.test(name(d))))
  if (type) setByName(a, 'type', toRaw(type))
  const member: ClassMember = { feature: a, name: name(a), typeName: name(type), typeObject: type ?? null, isEnd: false, toMany: false }
  if (model) connect(model, member, column.column)
  return a
}

/* ── matching by name ────────────────────────────────────────────── */

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Pairs of unmapped members and unmapped columns whose names match (an end also as <name>_ID) */
export function autoMatches(model: MappingModel): { member: ClassMember; column: ColumnEntry }[] {
  const mappedMembers = new Set(model.mappings.map(e => e.feature))
  const mappedColumns = new Set(model.mappings.flatMap(e => e.columns.map(c => c.column)))
  const free = model.sets.flatMap(s => s.columns).filter(c => !mappedColumns.has(c.column))
  const out: { member: ClassMember; column: ColumnEntry }[] = []
  for (const m of model.members) {
    if (mappedMembers.has(m.feature)) continue
    const names = m.isEnd ? [norm(m.name) + 'id', norm(m.name)] : [norm(m.name)]
    const hit = names.map(n => free.find(c => norm(c.name) === n)).find(Boolean)
    if (!hit) continue
    out.push({ member: m, column: hit })
    free.splice(free.indexOf(hit), 1)
  }
  return out
}

/* ── the whole mapping set: all classes, all column sets ─────────── */

/** An EntityMappings of the orm model - the mapping set ("library") the board belongs to */
export function isOrmEntityMappings(o: any): boolean {
  return nsUri(o).includes(ORM) && className(o) === 'EntityMappings'
}

/** The managed types the board shows itself, so they get no row of their own */
export function shownByEntityMappings(em: any): Set<any> {
  const e = toRaw(em)
  return new Set([...valuesOf(e, 'entity'), ...valuesOf(e, 'mappedSuperclass'), ...valuesOf(e, 'embeddable')])
}

export type ManagedKind = 'Entity' | 'MappedSuperclass' | 'Embeddable'

export interface ClassCard {
  cls: any
  name: string
  members: ClassMember[]
  /** The managed type mapping the class, if any */
  type: any | null
  kind: ManagedKind | null
  /** The managed type's mapping (attribute lines), if any */
  model: MappingModel | null
  /** The class it specializes on the board (Generalization), and how deep it sits below the topmost */
  parent: ClassCard | null
  depth: number
}

/** A managed type (Entity, MappedSuperclass, Embeddable) between its class and its column sets */
export interface TypeCard {
  type: any
  kind: ManagedKind
  name: string
  /** The class it maps, when shown on the board */
  card: ClassCard | null
  model: MappingModel
}

/** A managed type stored in a column set: its primary or a secondary table */
export interface TypeLink {
  tcard: TypeCard
  set: any
  role: 'primary' | 'secondary'
  holder: any | null
}

export interface BoardModel {
  em: any
  classes: ClassCard[]
  /** The managed types, in the order of their classes - those without a class last */
  types: TypeCard[]
  sets: ColumnSetEntry[]
  links: TypeLink[]
}

export function boardModel(em: any, objects: any[]): BoardModel {
  const e = toRaw(em)
  const types = [...shownByEntityMappings(e)]
  const typeOf = new Map<any, any>()
  for (const t of types) {
    const c = toRaw(attr(t, 'cwmClass'))
    if (c && !typeOf.has(c)) typeOf.set(c, t)
  }
  const clsList = classCandidates(types[0] ?? e, objects, e)
  // Mapped classes from elsewhere still show
  for (const c of typeOf.keys()) if (!clsList.includes(c)) clsList.push(c)
  const classes: ClassCard[] = clsList.map(cls => {
    const type = typeOf.get(cls) ?? null
    return {
      cls,
      name: name(cls),
      members: members(cls, objects),
      type,
      kind: type ? className(type) as ManagedKind : null,
      model: type ? mappingModel(type, objects) : null,
      parent: null,
      depth: 0
    } as ClassCard
  })
  const cardOf = new Map(classes.map(c => [c.cls, c]))
  // Inheritance: each class below the class it specializes, indented - subclasses in their order
  for (const g of objects) {
    if (className(g) !== 'Generalization') continue
    const child = cardOf.get(toRaw(attr(g, 'child')))
    const parent = cardOf.get(toRaw(attr(g, 'parent')))
    if (child && parent && child !== parent && !child.parent) child.parent = parent
  }
  const tree: ClassCard[] = []
  const place = (c: ClassCard, depth: number) => {
    if (tree.includes(c) || depth > 20) return
    c.depth = depth
    tree.push(c)
    for (const sub of classes) if (sub.parent === c) place(sub, depth + 1)
  }
  for (const c of classes) if (!c.parent || !classes.includes(c.parent)) place(c, 0)
  // A cycle of generalizations leaves its classes unplaced - they come last, flat
  for (const c of classes) if (!tree.includes(c)) { c.parent = null; place(c, 0) }
  classes.splice(0, classes.length, ...tree)
  const typeCards: TypeCard[] = types
    .map(t => {
      const card = cardOf.get(toRaw(attr(t, 'cwmClass'))) ?? null
      return {
        type: t,
        kind: className(t) as ManagedKind,
        name: name(t),
        card,
        model: card && card.type === t && card.model ? card.model : mappingModel(t, objects)
      }
    })
    .sort((a, b) => (a.card ? classes.indexOf(a.card) : classes.length) - (b.card ? classes.indexOf(b.card) : classes.length))
  const links: TypeLink[] = []
  for (const tcard of typeCards) {
    for (const s of tcard.model.sets) links.push({ tcard, set: s.set, role: s.role, holder: s.holder })
  }
  // Column sets in the order of the classes stored in them - their lines run straight across - then the rest
  const all = columnSetCandidates(types[0] ?? e, objects, e)
  for (const l of links) if (!all.includes(l.set)) all.push(l.set)
  const ordered: any[] = []
  for (const l of links) if (!ordered.includes(l.set)) ordered.push(l.set)
  for (const s of all) if (!ordered.includes(s)) ordered.push(s)
  const sets = ordered.map(s => columnSet(s, 'primary', null))
  return { em: e, classes, types: typeCards, sets, links }
}

/** The managed type for the class - made as an Entity stored in `set` when missing */
function ensureEntity(board: BoardModel, card: ClassCard, set: any | null): any | null {
  if (card.type) return card.type
  const em = board.em
  const t = createIn(em, 'entity', ormClass(em, 'Entity'))
  if (!t) return null
  setByName(t, 'name', card.name)
  t.eSet(featureOf(t, 'cwmClass'), toRaw(card.cls))
  if (set) t.eSet(featureOf(t, 'cwmTable'), toRaw(set))
  // Further members of the same change find it
  card.type = t
  card.kind = 'Entity'
  return t
}

/** Stores the managed type in the column set: as its primary table, or - when it has one - as a secondary table */
export function linkType(type: any, set: any): void {
  storeIn(type, set)
}

/** The managed type maps the class now - or none */
export function setTypeClass(type: any, cls: any | null): void {
  const t = toRaw(type)
  const f = featureOf(t, 'cwmClass')
  if (!f) return
  if (cls) t.eSet(f, toRaw(cls))
  else t.eUnset?.(f)
}

function storeIn(type: any, set: any): void {
  const t = toRaw(type)
  const primary = featureOf(t, 'cwmTable')
  if (!primary) return
  const current = toRaw(attr(t, 'cwmTable'))
  if (!current) { t.eSet(primary, toRaw(set)); return }
  if (current === toRaw(set)) return
  if (valuesOf(t, 'secondaryTable').some(st => toRaw(attr(st, 'cwmTable')) === toRaw(set))) return
  addSecondaryTable(t, set)
}

/** A class onto a table or view: its entity (made if missing) is stored there */
export function linkClass(board: BoardModel, card: ClassCard, set: any): void {
  const t = ensureEntity(board, card, set)
  if (t) storeIn(t, set)
}

/** Takes the class out of the column set: the primary table is unset, a secondary table removed */
export function unlinkClass(link: TypeLink): void {
  if (link.role === 'secondary') { remove(link.holder); return }
  const t = toRaw(link.tcard.type)
  const f = featureOf(t, 'cwmTable')
  if (f) t.eUnset?.(f)
}

/**
 * A member onto a column: the class's entity (made if missing, stored in the
 * column's table) maps the member to it. A column in a table the entity is not
 * stored in makes that a secondary table - except for a to-many end, whose
 * join column lies in the target's table.
 */
export function connectOnBoard(board: BoardModel, card: ClassCard, member: ClassMember, column: any, objects: any[]): void {
  const set = toRaw(column)?.eContainer?.()
  const t = ensureEntity(board, card, set)
  if (!t) return
  if (set && !(member.isEnd && member.toMany)) storeIn(t, set)
  connect(mappingModel(t, objects), member, column)
}

/** class name -> TABLE_NAME, TABLE_NAME -> ClassName */
export function tableNameFor(className: string): string {
  return columnNameFor(className)
}

export function classNameFor(tableName: string): string {
  const a = attributeNameFor(tableName)
  return a ? a[0].toUpperCase() + a.slice(1) : a
}

/** A new table in the mapping set's schema for the class: one column per attribute, an "id" as primary key, all connected */
export function createTableFor(board: BoardModel, card: ClassCard, dataTypes: any[], objects: any[]): any | null {
  const schema = toRaw(attr(board.em, 'cwmSchema'))
  if (!schema) return null
  const table = createIn(schema, 'ownedElement', schema.eClass().getEPackage().getEClassifier('Table'))
  if (!table) return null
  setByName(table, 'name', tableNameFor(card.name))
  const t = ensureEntity(board, card, table)
  if (!t) return table
  storeIn(t, table)
  for (const m of card.members.filter(x => !x.isEnd)) {
    const column = createColumnFor(null, m, table, dataTypes)
    if (!column) continue
    if (m.name.toLowerCase() === 'id') setPrimaryKey(table, column, true)
    connect(mappingModel(t, objects), m, column)
  }
  return table
}

/** A new class in the mapping set's object package for the table or view: one attribute per column, all connected */
export function createClassFor(board: BoardModel, set: ColumnSetEntry, objects: any[]): any | null {
  const pkg = toRaw(attr(board.em, 'cwmObjectPackage'))
  if (!pkg) return null
  const cls = createIn(pkg, 'ownedElement', pkg.eClass().getEPackage().getEClassifier('Class'))
  if (!cls) return null
  setByName(cls, 'name', classNameFor(set.name))
  const card: ClassCard = { cls, name: name(cls), members: [], type: null, kind: null, model: null, parent: null, depth: 0 }
  const t = ensureEntity(board, card, set.set)
  for (const c of set.columns) {
    createAttributeFor(t ? mappingModel(t, objects) : null, cls, c, objects)
  }
  return cls
}

/** Classes and column sets of the same name not yet linked, and per entity its members and columns of the same name */
export function boardMatches(board: BoardModel): { classes: { card: ClassCard; set: ColumnSetEntry }[]; members: { card: ClassCard; member: ClassMember; column: ColumnEntry }[] } {
  const linked = new Set(board.links.map(l => l.set))
  const freeSets = board.sets.filter(s => !linked.has(s.set))
  const classes: { card: ClassCard; set: ColumnSetEntry }[] = []
  for (const card of board.classes) {
    if (card.model?.sets.length || card.kind === 'Embeddable' || card.kind === 'MappedSuperclass') continue
    const hit = freeSets.find(s => norm(s.name) === norm(card.name))
    if (!hit) continue
    classes.push({ card, set: hit })
    freeSets.splice(freeSets.indexOf(hit), 1)
  }
  const membersOut: { card: ClassCard; member: ClassMember; column: ColumnEntry }[] = []
  for (const card of board.classes) {
    if (!card.model) continue
    for (const m of autoMatches(card.model)) membersOut.push({ card, member: m.member, column: m.column })
  }
  return { classes, members: membersOut }
}
