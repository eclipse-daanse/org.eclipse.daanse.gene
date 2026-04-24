/**
 * Global Settings Composable
 *
 * Manages application-wide settings: theme, language, primary color.
 */

import { reactive, watch, onMounted } from 'tsm:vue'

const STORAGE_KEY = 'gene-global-settings'

export type Theme = 'light' | 'dark' | 'auto'
export type Language = 'de' | 'en'

export interface GlobalSettings {
  theme: Theme
  language: Language
  primaryColor: string
}

// Color presets with hover and text colors
export const COLOR_PRESETS = {
  blue: { color: '#3B82F6', hover: '#2563EB', text: '#ffffff' },
  green: { color: '#10B981', hover: '#059669', text: '#ffffff' },
  purple: { color: '#8B5CF6', hover: '#7C3AED', text: '#ffffff' },
  orange: { color: '#F97316', hover: '#EA580C', text: '#ffffff' },
  pink: { color: '#EC4899', hover: '#DB2777', text: '#ffffff' },
  teal: { color: '#14B8A6', hover: '#0D9488', text: '#ffffff' },
  red: { color: '#EF4444', hover: '#DC2626', text: '#ffffff' },
  indigo: { color: '#6366F1', hover: '#4F46E5', text: '#ffffff' }
} as const

const DEFAULT_SETTINGS: GlobalSettings = {
  theme: 'dark',
  language: 'de',
  primaryColor: 'blue'
}

let sharedSettings: GlobalSettings | null = null
let initialized = false

function loadSettings(): GlobalSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
    }
  } catch (e) {
    console.warn('Failed to load settings:', e)
  }
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(settings: GlobalSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (e) {
    console.warn('Failed to save settings:', e)
  }
}

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  const effective = theme === 'auto' ? getSystemTheme() : theme
  document.documentElement.classList.toggle('dark-theme', effective === 'dark')
  document.documentElement.classList.toggle('light-theme', effective === 'light')
}

function applyColor(colorKey: string) {
  const preset = COLOR_PRESETS[colorKey as keyof typeof COLOR_PRESETS] || COLOR_PRESETS.blue
  const root = document.documentElement

  root.style.setProperty('--primary-color', preset.color)
  root.style.setProperty('--primary-color-hover', preset.hover)
  root.style.setProperty('--primary-color-text', preset.text)

  // PrimeVue specific variables
  root.style.setProperty('--p-primary-color', preset.color)
  root.style.setProperty('--p-primary-hover-color', preset.hover)
  root.style.setProperty('--p-primary-active-color', preset.hover)
  root.style.setProperty('--p-primary-text-color', preset.text)
  root.style.setProperty('--p-button-primary-background', preset.color)
  root.style.setProperty('--p-button-primary-hover-background', preset.hover)
  root.style.setProperty('--p-button-primary-active-background', preset.hover)
  root.style.setProperty('--p-button-primary-border-color', preset.color)
  root.style.setProperty('--p-button-primary-hover-border-color', preset.hover)
  root.style.setProperty('--p-button-primary-color', preset.text)
}

function applyLanguage(lang: Language) {
  document.documentElement.lang = lang
}

function getSharedSettings(): GlobalSettings {
  if (!sharedSettings) {
    sharedSettings = reactive(loadSettings())
  }
  return sharedSettings
}

/**
 * Initialize theme immediately when module loads
 * This ensures dark mode is applied before any rendering
 */
function initializeTheme() {
  if (initialized) return
  initialized = true

  const settings = loadSettings()
  applyTheme(settings.theme)
  applyColor(settings.primaryColor)
  applyLanguage(settings.language)
}

// Apply theme immediately on module load
if (typeof document !== 'undefined') {
  initializeTheme()
}

export function useGlobalSettings() {
  const settings = getSharedSettings()

  onMounted(() => {
    applyTheme(settings.theme)
    applyColor(settings.primaryColor)
    applyLanguage(settings.language)

    // Listen for system theme changes
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (settings.theme === 'auto') applyTheme('auto')
    })
  })

  watch(() => ({ ...settings }), (s) => {
    saveSettings(s)
    applyTheme(s.theme)
    applyColor(s.primaryColor)
    applyLanguage(s.language)
  }, { deep: true })

  return {
    settings,
    setTheme: (t: Theme) => { settings.theme = t },
    setLanguage: (l: Language) => { settings.language = l },
    setPrimaryColor: (c: string) => { settings.primaryColor = c },
    COLOR_PRESETS
  }
}
