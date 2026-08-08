/**
 * Feature-Flag fuer das UiModel-basierte Property-Rendering (Plan E6).
 *
 * Persistenz in localStorage, damit das Flag Reloads ueberlebt und in
 * E2E-Tests vor dem App-Start gesetzt werden kann.
 * Default: AN (Phase 4) — abschaltbar mit localStorage 'false'.
 */

import { ref } from 'tsm:vue'
import type { Ref } from 'tsm:vue'

const STORAGE_KEY = 'gene.uimodelProperties'

const enabled: Ref<boolean> = ref(readInitial())

function readInitial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export function useUimodelPropertiesFlag(): {
  enabled: Ref<boolean>
  setEnabled: (value: boolean) => void
} {
  return {
    enabled,
    setEnabled(value: boolean) {
      enabled.value = value
      try {
        localStorage.setItem(STORAGE_KEY, String(value))
      } catch { /* Persistenz optional */ }
    }
  }
}
