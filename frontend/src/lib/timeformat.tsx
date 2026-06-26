import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// Clock-format preference, independent of UI language: 'system' follows the
// locale's default (e.g. en→12h, de→24h), '24h'/'12h' force it. Stored per-device
// (localStorage 'tribo-timeformat'); the picker lives in Family → App settings.
export type TimeFormatPreference = 'system' | '24h' | '12h'

const STORAGE_KEY = 'tribo-timeformat'

function load(): TimeFormatPreference {
  const s = localStorage.getItem(STORAGE_KEY)
  return s === '24h' || s === '12h' || s === 'system' ? s : 'system'
}

interface TimeFormatContextValue {
  preference: TimeFormatPreference
  setPreference: (p: TimeFormatPreference) => void
}

const Ctx = createContext<TimeFormatContextValue | null>(null)

export function TimeFormatProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<TimeFormatPreference>(load)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, preference)
  }, [preference])
  return <Ctx.Provider value={{ preference, setPreference: setPref }}>{children}</Ctx.Provider>
}

export function useTimeFormat(): TimeFormatContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTimeFormat must be used within TimeFormatProvider')
  return v
}

// Non-throwing accessor for the preference, safe to call anywhere (falls back to
// the stored value when no provider is mounted). Used by useLocale().
export function useTimeFormatPreference(): TimeFormatPreference {
  const v = useContext(Ctx)
  return v ? v.preference : load()
}

// Append a Unicode hour-cycle extension so every Intl formatter honors the
// preference with no per-call changes. 'system' leaves the locale untouched.
export function applyHourCycle(locale: string, pref: TimeFormatPreference): string {
  if (pref === '24h') return `${locale}-u-hc-h23`
  if (pref === '12h') return `${locale}-u-hc-h12`
  return locale
}
