import i18n from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en.json'
import de from './locales/de.json'
import ptBR from './locales/ptBR.json'

// Supported UI languages. Stored per-device (localStorage 'tribo-lang'); the
// switcher lives in Family → App settings.
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt-BR', label: 'Português (BR)' },
] as const

export type LangCode = (typeof LANGUAGES)[number]['code']

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      de: { translation: de },
      'pt-BR': { translation: ptBR },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'de', 'pt-BR'],
    nonExplicitSupportedLngs: true, // map 'de-DE' → 'de', 'pt' → 'pt-BR' fallback
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'tribo-lang',
      caches: ['localStorage'],
    },
  })

// BCP-47 locale for Intl date/number formatting, derived from the active UI
// language ('en' → 'en-US' so clock shows 12h; de/pt-BR are 24h).
export function intlLocale(lang: string): string {
  if (lang.startsWith('de')) return 'de-DE'
  if (lang.startsWith('pt')) return 'pt-BR'
  return 'en-US'
}

// The active Intl locale; re-renders the caller when the language changes.
export function useLocale(): string {
  const { i18n: inst } = useTranslation()
  return intlLocale(inst.language)
}

export default i18n
