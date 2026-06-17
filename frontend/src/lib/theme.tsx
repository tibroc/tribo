import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'
// User preference; 'system' follows the OS setting.
export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'tribo-theme'

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

function loadPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'system'
}

interface ThemeContextValue {
  theme: Theme              // resolved (what's actually applied)
  preference: ThemePreference
  setPreference: (p: ThemePreference) => void
  toggle: () => void
}

const Ctx = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>(loadPreference)
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme)

  const theme: Theme = preference === 'system' ? systemTheme : preference

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, preference)
  }, [preference])

  // Track OS preference so 'system' resolves live.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const setPreference = useCallback((p: ThemePreference) => setPref(p), [])
  // Toggling pins an explicit light/dark preference relative to what's showing.
  const toggle = useCallback(() => setPref(theme === 'dark' ? 'light' : 'dark'), [theme])

  return <Ctx.Provider value={{ theme, preference, setPreference, toggle }}>{children}</Ctx.Provider>
}

export function useTheme(): ThemeContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTheme must be used within ThemeProvider')
  return v
}
