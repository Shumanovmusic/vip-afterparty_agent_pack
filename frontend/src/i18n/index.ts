/**
 * i18n Setup for VIP Afterparty
 * Uses vue-i18n v11 with type-safe message schema
 */
import { createI18n } from 'vue-i18n'
import type { MessageSchema } from './schema'

import en from '../locales/en.json'
import ru from '../locales/ru.json'

/** Detect user's preferred locale */
function detectLocale(): 'en' | 'ru' {
  const browserLang = navigator.language.toLowerCase()
  if (browserLang.startsWith('ru')) {
    return 'ru'
  }
  return 'en'
}

/** Create i18n instance */
export const i18n = createI18n<[MessageSchema], 'en' | 'ru'>({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: {
    en,
    ru
  },
  missing: (locale, key) => {
    // In dev/test: warn loudly; in production: silent fallback + telemetry if available
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing key: "${key}" for locale "${locale}"`)
    }
    return key // Fallback to key itself
  }
})

/** Composable for type-safe translations */
export function useI18n() {
  return i18n.global
}

export default i18n
