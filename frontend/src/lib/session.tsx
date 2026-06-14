import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  getSession, switchProfile as apiSwitch, mapProfile as apiMap, logout as apiLogout,
  type SessionInfo, type SessionMember,
} from './api'

interface SessionContextValue {
  session: SessionInfo | null // null while loading
  activeMember: SessionMember | null
  refresh: () => void
  login: () => void
  logout: () => Promise<void>
  switchProfile: (memberId: string, pin?: string) => Promise<void>
  mapProfile: (memberId: string) => Promise<void>
}

const Ctx = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null)

  const refresh = useCallback(() => {
    getSession().then(setSession).catch(() => setSession(null))
  }, [])

  useEffect(refresh, [refresh])

  const value: SessionContextValue = {
    session,
    activeMember: session?.members.find((m) => m.id === session.activeMemberId) ?? null,
    refresh,
    login: () => { window.location.href = '/auth/login' },
    logout: async () => { await apiLogout(); refresh() },
    switchProfile: async (memberId, pin) => { await apiSwitch(memberId, pin); refresh() },
    mapProfile: async (memberId) => { await apiMap(memberId); refresh() },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession must be used within SessionProvider')
  return v
}
