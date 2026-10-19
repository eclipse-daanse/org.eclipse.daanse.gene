<script setup lang="ts">
/**
 * A ResponsibleParty as a business card: initials, name, responsibility and
 * per contact its e-mail addresses (mailto), telephone numbers (tel),
 * addresses and web links. The pencil switches the card to fields: values
 * are edited in place, parts added (+ E-Mail …) or removed (×).
 *
 * `readonly` leaves out the pencil - for the card a tag shows on hover.
 *
 * Test ids: `<testId>` on the card, `.Edit`, `.Contact@<n>`,
 * `.Contact@<n>.<kind>@<m>`, `.Contact@<n>.Add.<kind>`, `.AddContact`.
 */
import { computed, inject, ref } from 'tsm:vue'
import { attr } from '../composables/documentation'
import {
  addContact,
  addContactPart,
  contactParts,
  CONTACT_PARTS,
  mailHref,
  partyContacts,
  setPartValue,
  telHref,
  urlHref,
  type ContactPartKind
} from '../composables/contactCard'
import { setByName } from '../composables/creation'
import { CWM_EDITING } from '../composables/editing'

const props = defineProps<{
  object: any
  testId: string
  version?: number
  /** Shown elsewhere, e.g. as a tag's popover: no editing */
  readonly?: boolean
}>()

const editing = inject(CWM_EDITING)!
const editMode = ref(false)

const KINDS = Object.keys(CONTACT_PARTS) as ContactPartKind[]
const ICONS: Record<ContactPartKind, string> = {
  email: 'pi pi-envelope',
  telephone: 'pi pi-phone',
  location: 'pi pi-map-marker',
  url: 'pi pi-globe'
}

/** Labels of the fields in edit mode */
const FIELD_LABELS: Record<string, string> = {
  emailAddress: 'Adresse',
  emailType: 'Art',
  phoneNumber: 'Nummer',
  phoneType: 'Art',
  address: 'Straße',
  postCode: 'PLZ',
  city: 'Ort',
  country: 'Land',
  locationType: 'Art',
  url: 'URL'
}

const name = computed(() => {
  void props.version
  return String(attr(props.object, 'name') ?? '')
})

const responsibility = computed(() => {
  void props.version
  return String(attr(props.object, 'responsibility') ?? '')
})

const initials = computed(() => {
  const words = name.value.replace(/[–-].*$/, '').trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2)).toUpperCase()
})

interface CardPart { object: any; values: Record<string, string> }
interface CardContact { object: any; name: string; parts: Record<ContactPartKind, CardPart[]> }

const contacts = computed<CardContact[]>(() => {
  void props.version
  return partyContacts(props.object).map(c => ({
    object: c,
    name: String(attr(c, 'name') ?? ''),
    parts: Object.fromEntries(KINDS.map(kind => [kind, contactParts(c, kind).map(p => ({
      object: p,
      values: Object.fromEntries(CONTACT_PARTS[kind].fields.map(f => [f, String(attr(p, f) ?? '')]))
    }))])) as Record<ContactPartKind, CardPart[]>
  }))
})

function locationLines(v: Record<string, string>): string[] {
  return [v.address, [v.postCode, v.city].filter(Boolean).join(' '), v.country].filter(Boolean) as string[]
}

const isEmpty = computed(() => contacts.value.every(c => KINDS.every(k => !c.parts[k].length)))

/* ── changes ─────────────────────────────────────────────────────── */

function setValue(part: CardPart, kind: ContactPartKind, field: string, event: Event): void {
  const value = (event.target as HTMLInputElement).value
  editing.change(() => setPartValue(part.object, kind, field, value))
}

function setResponsibility(event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value
  editing.change(() => setByName(props.object, 'responsibility', value))
}

function addPart(contact: CardContact, kind: ContactPartKind): void {
  editing.change(() => { addContactPart(props.object, contact.object, kind) })
}

function newContact(): void {
  editing.change(() => { addContact(props.object) })
  editMode.value = true
}

function remove(o: any): void {
  editing.deleteObject(o)
}
</script>

<template>
  <div class="card" :class="{ editing: editMode }" :data-testid="testId">
    <div class="avatar" aria-hidden="true">{{ initials }}</div>
    <div class="main">
      <div class="who">
        <strong class="name">{{ name || '(ohne Namen)' }}</strong>
        <button
          v-if="!readonly"
          type="button"
          class="edit"
          :class="{ active: editMode }"
          :title="editMode ? 'Fertig' : 'Visitenkarte bearbeiten'"
          :data-testid="`${testId}.Edit`"
          @click="editMode = !editMode"
        ><i :class="editMode ? 'pi pi-check' : 'pi pi-pencil'"></i></button>
      </div>
      <textarea
        v-if="editMode"
        class="responsibility-input"
        :value="responsibility"
        rows="2"
        placeholder="Zuständigkeit"
        aria-label="Zuständigkeit"
        @change="setResponsibility"
      ></textarea>
      <div v-else-if="responsibility" class="responsibility">{{ responsibility }}</div>

      <div
        v-for="(c, n) in contacts"
        :key="n"
        class="contact"
        :data-testid="`${testId}.Contact@${n}`"
      >
        <div v-if="contacts.length > 1 || editMode" class="contact-name">
          {{ c.name || 'Kontakt' }}
          <button v-if="editMode" type="button" class="remove" title="Kontakt entfernen" @click="remove(c.object)">×</button>
        </div>
        <template v-for="kind in KINDS" :key="kind">
          <div
            v-for="(p, m) in c.parts[kind]"
            :key="m"
            class="part"
            :data-testid="`${testId}.Contact@${n}.${kind}@${m}`"
          >
            <i :class="ICONS[kind]" :title="CONTACT_PARTS[kind].label"></i>
            <template v-if="editMode">
              <label v-for="f in CONTACT_PARTS[kind].fields" :key="f" class="field" :class="`field-${f}`">
                <span>{{ FIELD_LABELS[f] ?? f }}</span>
                <input :value="p.values[f]" :aria-label="FIELD_LABELS[f] ?? f" @change="setValue(p, kind, f, $event)" />
              </label>
              <button type="button" class="remove" :title="`${CONTACT_PARTS[kind].label} entfernen`" @click="remove(p.object)">×</button>
            </template>
            <template v-else>
              <a v-if="kind === 'email'" :href="mailHref(p.values.emailAddress!)" class="value">{{ p.values.emailAddress }}</a>
              <a v-else-if="kind === 'telephone'" :href="telHref(p.values.phoneNumber!)" class="value">{{ p.values.phoneNumber }}</a>
              <span v-else-if="kind === 'location'" class="value address">
                <span v-for="(line, l) in locationLines(p.values)" :key="l">{{ line }}</span>
              </span>
              <a v-else :href="urlHref(p.values.url!)" target="_blank" rel="noopener" class="value">{{ p.values.url }}</a>
              <span v-if="p.values.emailType || p.values.phoneType || p.values.locationType" class="type">
                {{ p.values.emailType || p.values.phoneType || p.values.locationType }}
              </span>
            </template>
          </div>
        </template>
        <div v-if="editMode" class="adds">
          <button
            v-for="kind in KINDS"
            :key="kind"
            type="button"
            :data-testid="`${testId}.Contact@${n}.Add.${kind}`"
            @click="addPart(c, kind)"
          >+ {{ CONTACT_PARTS[kind].label }}</button>
        </div>
      </div>

      <p v-if="isEmpty && !editMode" class="none">Keine Kontaktdaten</p>
      <button
        v-if="!readonly && (editMode || !contacts.length)"
        type="button"
        class="add-contact"
        :data-testid="`${testId}.AddContact`"
        @click="newContact"
      >+ Kontakt</button>
    </div>
  </div>
</template>

<style scoped>
.card {
  display: flex;
  gap: 0.9rem;
  max-width: 34rem;
  margin: 0.4rem 0 0.6rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--surface-border);
  border-left: 3px solid var(--primary-color);
  border-radius: 6px;
  background: var(--surface-card, var(--surface-ground));
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  font-size: 0.8rem;
}

.card.editing {
  max-width: 48rem;
}

.avatar {
  flex: 0 0 2.6rem;
  height: 2.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--primary-color) 18%, transparent);
  color: var(--primary-color);
  font-weight: 700;
  letter-spacing: 0.03em;
}

.main {
  flex: 1 1 auto;
  min-width: 0;
}

.who {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.name {
  font-size: 0.95rem;
}

.edit {
  margin-left: auto;
  border: none;
  background: none;
  padding: 0 0.2rem;
  font-size: 0.65rem;
  color: var(--text-color-secondary);
  cursor: pointer;
  opacity: 0;
}

.card:hover .edit,
.edit.active {
  opacity: 1;
}

.edit:hover,
.edit.active {
  color: var(--primary-color);
}

.responsibility {
  margin-top: 0.15rem;
  color: var(--text-color-secondary);
  font-style: italic;
}

.contact {
  margin-top: 0.55rem;
  padding-top: 0.45rem;
  border-top: 1px dashed var(--surface-border);
}

.contact-name {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-bottom: 0.2rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-color-secondary);
}

.part {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.12rem 0;
}

.part > i {
  flex: 0 0 1rem;
  font-size: 0.75rem;
  color: var(--primary-color);
}

.value {
  color: var(--text-color);
  text-decoration: none;
}

a.value:hover {
  color: var(--primary-color);
  text-decoration: underline;
}

.address {
  display: flex;
  flex-direction: column;
}

.type {
  font-size: 0.7rem;
  color: var(--text-color-secondary);
}

.field {
  display: inline-flex;
  flex-direction: column;
  gap: 0.05rem;
  min-width: 0;
}

.field span {
  font-size: 0.6rem;
  color: var(--text-color-secondary);
}

.field-emailAddress,
.field-phoneNumber,
.field-address,
.field-url {
  flex: 1 1 12rem;
}

.field-postCode {
  flex: 0 0 4.5rem;
}

input,
textarea {
  font: inherit;
  color: var(--text-color);
  background: var(--surface-ground);
  border: 1px solid var(--surface-border);
  border-radius: 3px;
  padding: 0.1rem 0.3rem;
  min-width: 0;
}

input:focus,
textarea:focus {
  outline: none;
  border-color: var(--primary-color);
}

.responsibility-input {
  width: 100%;
  box-sizing: border-box;
  margin-top: 0.3rem;
  resize: vertical;
}

.remove {
  border: none;
  background: none;
  padding: 0 0.2rem;
  color: var(--text-color-secondary);
  cursor: pointer;
  align-self: center;
}

.remove:hover {
  color: var(--red-500, #ef4444);
}

.adds {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.25rem;
}

.adds button,
.add-contact {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 0.75rem;
  color: var(--primary-color);
  cursor: pointer;
}

.add-contact {
  margin-top: 0.5rem;
}

.none {
  margin: 0.4rem 0 0;
  color: var(--text-color-secondary);
  font-style: italic;
}
</style>
