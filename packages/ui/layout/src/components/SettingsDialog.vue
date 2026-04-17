<script setup lang="ts">
/**
 * SettingsDialog - Global settings panel
 *
 * Theme (dark/light/auto), Language, Primary Color
 */

import { useGlobalSettings, COLOR_PRESETS, type Theme, type Language } from '../composables/useGlobalSettings'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'close': []
}>()

const { settings, setTheme, setLanguage, setPrimaryColor } = useGlobalSettings()

const themes: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'auto', label: 'Auto' }
]

const languages: { value: Language; label: string }[] = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' }
]

const colors = Object.entries(COLOR_PRESETS).map(([key, value]) => ({
  key,
  color: value.color
}))
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="settings-overlay" @click.self="emit('close')">
      <div class="settings-dialog">
        <div class="settings-header">
          <span class="settings-title">Settings</span>
          <button class="close-btn" @click="emit('close')">
            <i class="pi pi-times"></i>
          </button>
        </div>

        <div class="settings-content">
          <!-- Theme -->
          <div class="settings-section">
            <label class="section-label">Theme</label>
            <div class="theme-options">
              <button
                v-for="theme in themes"
                :key="theme.value"
                class="theme-btn"
                :class="{ active: settings.theme === theme.value }"
                @click="setTheme(theme.value)"
              >
                <i :class="{
                  'pi pi-moon': theme.value === 'dark',
                  'pi pi-sun': theme.value === 'light',
                  'pi pi-desktop': theme.value === 'auto'
                }"></i>
                <span>{{ theme.label }}</span>
              </button>
            </div>
          </div>

          <!-- Language -->
          <div class="settings-section">
            <label class="section-label">Language</label>
            <div class="language-options">
              <button
                v-for="lang in languages"
                :key="lang.value"
                class="lang-btn"
                :class="{ active: settings.language === lang.value }"
                @click="setLanguage(lang.value)"
              >
                {{ lang.label }}
              </button>
            </div>
          </div>

          <!-- Primary Color -->
          <div class="settings-section">
            <label class="section-label">Primary Color</label>
            <div class="color-options">
              <button
                v-for="c in colors"
                :key="c.key"
                class="color-btn"
                :class="{ active: settings.primaryColor === c.key }"
                :style="{ backgroundColor: c.color }"
                :title="c.key"
                @click="setPrimaryColor(c.key)"
              >
                <i v-if="settings.primaryColor === c.key" class="pi pi-check"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-dialog {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  width: 360px;
  max-width: 90vw;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--surface-border);
}

.settings-title {
  font-size: 0.875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-color);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.close-btn:hover {
  color: var(--text-color);
  background: var(--surface-hover);
}

.settings-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-color-secondary);
}

.theme-options {
  display: flex;
  gap: 8px;
}

.theme-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--surface-border);
  background: var(--surface-ground);
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s ease;
}

.theme-btn:hover {
  color: var(--text-color);
  background: var(--surface-hover);
}

.theme-btn.active {
  color: var(--primary-color);
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 10%, var(--surface-ground));
}

.theme-btn i {
  font-size: 1.25rem;
}

.theme-btn span {
  font-size: 0.75rem;
  font-weight: 600;
}

.language-options {
  display: flex;
  gap: 8px;
}

.lang-btn {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid var(--surface-border);
  background: var(--surface-ground);
  color: var(--text-color-secondary);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.15s ease;
}

.lang-btn:hover {
  color: var(--text-color);
  background: var(--surface-hover);
}

.lang-btn.active {
  color: var(--primary-color);
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 10%, var(--surface-ground));
}

.color-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.color-btn {
  width: 36px;
  height: 36px;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.color-btn:hover {
  transform: scale(1.1);
}

.color-btn.active {
  border-color: var(--text-color);
  box-shadow: 0 0 0 2px var(--surface-card);
}

.color-btn i {
  color: white;
  font-size: 0.875rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
</style>
