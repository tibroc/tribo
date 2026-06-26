import i18n from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en.json'
import de from './locales/de.json'
import ptBR from './locales/ptBR.json'
import { useTimeFormatPreference, applyHourCycle } from '../timeformat'

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
    // Region-stripping (load:'all', the default) already maps 'de-DE'→'de' and
    // 'en-US'→'en'. We deliberately do NOT set nonExplicitSupportedLngs: it would
    // resolve lookups for 'pt-BR' down to a base 'pt' (no resource) → English.
    load: 'all',
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'tribo-lang',
      caches: ['localStorage'],
    },
  })

// Keep <html lang> in sync with the UI language so native date/time pickers and
// assistive tech follow it (set on load and on every change).
document.documentElement.lang = i18n.language
i18n.on('languageChanged', (lng) => { document.documentElement.lang = lng })

// BCP-47 locale for Intl date/number formatting, derived from the active UI
// language ('en' → 'en-US' so clock shows 12h; de/pt-BR are 24h).
export function intlLocale(lang: string): string {
  if (lang.startsWith('de')) return 'de-DE'
  if (lang.startsWith('pt')) return 'pt-BR'
  return 'en-US'
}

// The active Intl locale, with the user's clock-format preference applied as a
// Unicode hour-cycle extension. Re-renders the caller when language or the
// time-format preference changes.
export function useLocale(): string {
  const { i18n: inst } = useTranslation()
  const pref = useTimeFormatPreference()
  return applyHourCycle(intlLocale(inst.language), pref)
}

export default i18n
