<script setup lang="ts">
/**
 * Asks for the secret of an Atlas connection.
 *
 * Opened by the credential store when a request needs a secret it does not
 * hold, and again after a 401. Whatever is entered stays in the session store
 * — it is never written to a file (see `storage-model-atlas/auth.ts`).
 */
import { ref, computed, watch } from 'tsm:vue'
import { Dialog, Button, InputText } from 'tsm:primevue'
import type { AtlasCredentialRequest } from 'storage-model-atlas'

const props = defineProps<{
  visible: boolean
  request: AtlasCredentialRequest | null
}>()

const emit = defineEmits<{
  'submit': [secret: string | null]
}>()

const secret = ref('')

const isBasic = computed(() => props.request?.auth.kind === 'basic')
const host = computed(() => {
  const url = props.request?.baseUrl ?? ''
  try {
    return new URL(url, window.location.origin).host
  } catch {
    return url
  }
})

// Never carry a secret over into the next request
watch(
  () => props.visible,
  (open) => {
    if (open) secret.value = ''
  },
)

function submit() {
  if (!secret.value) return
  emit('submit', secret.value)
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="(v: boolean) => { if (!v) emit('submit', null) }"
    :header="isBasic ? 'Anmeldung am Model Atlas' : 'Token für den Model Atlas'"
    :modal="true"
    :closable="true"
    :style="{ width: '420px' }"
  >
    <div class="login-form">
      <p class="login-server">
        <i class="pi pi-server" aria-hidden="true"></i>
        {{ host }}
        <span v-if="isBasic && request?.auth.user" class="login-user">
          als <strong>{{ request?.auth.user }}</strong>
        </span>
      </p>

      <div v-if="request?.retry" class="login-retry">
        <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
        Der Server hat die Anmeldung abgelehnt. Bitte erneut eingeben.
      </div>

      <div class="form-field">
        <label for="atlas-secret">{{ isBasic ? 'Passwort' : 'Token' }}</label>
        <InputText
          id="atlas-secret"
          v-model="secret"
          type="password"
          autocomplete="off"
          class="w-full"
          @keyup.enter="submit"
        />
      </div>

      <small class="login-hint">
        Gilt nur für diese Sitzung — gespeichert wird nichts.
      </small>
    </div>

    <template #footer>
      <Button label="Abbrechen" severity="secondary" @click="emit('submit', null)" />
      <Button label="Anmelden" icon="pi pi-sign-in" :disabled="!secret" @click="submit" />
    </template>
  </Dialog>
</template>

<style scoped>
.login-form { display: flex; flex-direction: column; gap: 12px; }
.login-server { margin: 0; display: flex; align-items: baseline; gap: 6px; font-family: ui-monospace, monospace; }
.login-user { font-family: inherit; color: var(--text-color-secondary, #888); }
.login-retry {
  display: flex; align-items: baseline; gap: 6px;
  padding: 8px; border-radius: 6px;
  background: var(--red-50, #fff1f0); color: var(--red-700, #a8071a);
  font-size: 0.85rem;
}
.form-field { display: flex; flex-direction: column; gap: 4px; }
.form-field label { font-size: 0.85rem; color: var(--text-color-secondary, #666); }
.w-full { width: 100%; }
.login-hint { color: var(--text-color-secondary, #888); }
</style>
