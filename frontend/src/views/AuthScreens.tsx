import { LogIn } from 'lucide-react'
import { palette } from '../lib/tokens'
import { useSession } from '../lib/session'
import { Wordmark } from '../components/chrome'
import PersonAvatar from '../components/PersonAvatar'

// Full-screen wrapper centering an auth card.
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full font-body flex items-center justify-center p-4" style={{ backgroundColor: palette.mist, color: palette.ink }}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: palette.surface, border: `1px solid ${palette.line}` }}>
        <div className="flex justify-center mb-5"><Wordmark /></div>
        {children}
      </div>
    </div>
  )
}

export function LoginScreen() {
  const { login } = useSession()
  return (
    <AuthShell>
      <div className="font-display text-lg font-bold text-center mb-1">Welcome home</div>
      <div className="text-sm text-center mb-5" style={{ color: palette.inkSoft }}>Sign in to your family organizer.</div>
      <button
        onClick={login}
        className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold"
        style={{ backgroundColor: palette.brand, color: '#fff' }}
      >
        <LogIn size={16} /> Sign in with Authentik
      </button>
    </AuthShell>
  )
}

// First-login: link the signed-in account to a family member.
export function MapProfileScreen() {
  const { session, mapProfile } = useSession()
  if (!session) return null
  return (
    <AuthShell>
      <div className="font-display text-lg font-bold text-center mb-1">Who are you?</div>
      <div className="text-sm text-center mb-5" style={{ color: palette.inkSoft }}>Link your account to a family member.</div>
      <div className="space-y-2">
        {session.members.map((m) => {
          const claimed = m.mapped
          return (
            <button
              key={m.id}
              disabled={claimed}
              onClick={() => mapProfile(m.id)}
              className="w-full flex items-center gap-3 rounded-xl p-2.5 text-left disabled:opacity-40"
              style={{ border: `1px solid ${palette.line}` }}
            >
              <PersonAvatar name={m.name} color={m.color} size={36} />
              <div className="flex-1">
                <div className="text-sm font-semibold">{m.name}</div>
                <div className="text-xs capitalize" style={{ color: palette.inkSoft }}>{claimed ? 'Already linked' : m.role}</div>
              </div>
            </button>
          )
        })}
      </div>
    </AuthShell>
  )
}
