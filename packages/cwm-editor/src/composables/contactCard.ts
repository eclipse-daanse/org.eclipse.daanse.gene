/**
 * A ResponsibleParty as a business card: its contacts with their e-mail
 * addresses, telephone numbers, locations and URLs. The contact objects the
 * party contains show on the card, so they get no rows of their own.
 */
import { onBeforeUnmount, ref, shallowRef, toRaw } from 'tsm:vue'
import { attr, className, many } from './documentation'
import { createIn, setByName } from './creation'

export type ContactPartKind = 'email' | 'telephone' | 'location' | 'url'

/** The class of each part, and the attributes the card shows - the first is the main one */
export const CONTACT_PARTS: Record<ContactPartKind, { className: string; fields: string[]; label: string }> = {
  email: { className: 'Email', fields: ['emailAddress', 'emailType'], label: 'E-Mail' },
  telephone: { className: 'Telephone', fields: ['phoneNumber', 'phoneType'], label: 'Telefon' },
  location: { className: 'Location', fields: ['address', 'postCode', 'city', 'country', 'locationType'], label: 'Adresse' },
  url: { className: 'ResourceLocator', fields: ['url'], label: 'Web' }
}

export function isResponsibleParty(o: any): boolean {
  return className(o) === 'ResponsibleParty'
}

/** The party's contacts: those it refers to, then contained ones it does not refer to yet */
export function partyContacts(party: any): any[] {
  const referred = many(attr(party, 'contact'))
  const contained = many(toRaw(party)?.eContents?.()).filter(c => className(c) === 'Contact' && !referred.includes(c))
  return [...referred, ...contained]
}

export function contactParts(contact: any, kind: ContactPartKind): any[] {
  return many(attr(contact, kind))
}

/**
 * Objects the party's row shows itself: contacts and their parts on the card,
 * access roles (with their grants) as the party's "Zugriffe"
 */
export function shownByParty(party: any): Set<any> {
  const p = toRaw(party)
  const shown = new Set<any>()
  const mark = (o: any) => { if (toRaw(o?.eContainer?.()) === p) shown.add(o) }
  for (const c of partyContacts(p)) {
    mark(c)
    for (const kind of Object.keys(CONTACT_PARTS) as ContactPartKind[]) contactParts(c, kind).forEach(mark)
  }
  for (const o of many(p?.eContents?.())) if (className(o) === 'AccessRole') shown.add(o)
  return shown
}

/** Adds to a many-valued reference unless there already; EMF keeps the opposite end */
function link(owner: any, featureName: string, target: any): void {
  const o = toRaw(owner)
  const feature = o.eClass().getEStructuralFeature(featureName)
  if (!feature) return
  const list = o.eGet(feature)
  if (!many(list).includes(toRaw(target))) list.add(target)
}

function classIn(party: any, name: string): any | null {
  return toRaw(party).eClass().getEPackage()?.getEClassifier?.(name) ?? null
}

/** A new contact in the party, linked to it */
export function addContact(party: any): any | null {
  const eClass = classIn(party, 'Contact')
  if (!eClass) return null
  const contact = createIn(party, 'ownedElement', eClass)
  if (!contact) return null
  setByName(contact, 'name', `Kontakt ${String(attr(party, 'name') ?? '')}`.trim())
  link(party, 'contact', contact)
  return contact
}

/** A new e-mail, telephone, location or URL of a contact, kept in the party */
export function addContactPart(party: any, contact: any, kind: ContactPartKind): any | null {
  const eClass = classIn(party, CONTACT_PARTS[kind].className)
  if (!eClass) return null
  const part = createIn(party, 'ownedElement', eClass)
  if (!part) return null
  link(contact, kind, part)
  return part
}

/**
 * Writes an attribute of a part. The main attribute is the part's name too,
 * so the tree shows the address or number.
 */
export function setPartValue(part: any, kind: ContactPartKind, field: string, value: string): void {
  setByName(part, field, value)
  if (field === CONTACT_PARTS[kind].fields[0]) setByName(part, 'name', value)
}

export function mailHref(address: string): string {
  return `mailto:${address.trim()}`
}

export function telHref(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '')}`
}

export function urlHref(url: string): string {
  return /^[a-z]+:/i.test(url) ? url : `https://${url}`
}

/**
 * The business card shown while the pointer is over a party's entry - and
 * while it moves onto the card. `show` takes the entry's mouseenter.
 */
export function useCardHover(width = 560) {
  const card = shallowRef<any>(null)
  const at = ref({ top: 0, left: 0 })
  let timer = 0
  function show(o: any, event: MouseEvent): void {
    if (!isResponsibleParty(o)) return
    clearTimeout(timer)
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect()
    at.value = { top: r.bottom + 4, left: Math.max(8, Math.min(r.left + 24, window.innerWidth - width - 8)) }
    card.value = o
  }
  function hide(): void {
    clearTimeout(timer)
    timer = window.setTimeout(() => { card.value = null }, 200)
  }
  function keep(): void {
    clearTimeout(timer)
  }
  onBeforeUnmount(() => clearTimeout(timer))
  return { card, at, show, hide, keep }
}
