import { LogIn } from 'lucide-react'
import { useSession } from '../lib/session'
import { Wordmark } from '../components/chrome'
import PersonAvatar from '../components/PersonAvatar'
import Button from '../components/Button'

// Full-screen wrapper centering an auth card.
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full font-body flex items-center justify-center p-4" style={{ background: 'var(--t-bg)', color: 'var(--t-text)' }}>
      <div className="w-full max-w-sm p-6" style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 'var(--t-radius-lg)' }}>
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
      <div className="text-sm text-center mb-5" style={{ color: 'var(--t-text-soft)' }}>Sign in to your family organizer.</div>
      <Button onClick={login} style={{ width: '100%' }}>
        <LogIn size={16} /> Sign in with Authentik
      </Button>
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
      <div className="text-sm text-center mb-5" style={{ color: 'var(--t-text-soft)' }}>Link your account to a family member.</div>
      <div className="space-y-2">
        {session.members.map((m, i) => {
          const claimed = m.mapped
          return (
            <button
              key={m.id}
              disabled={claimed}
              onClick={() => mapProfile(m.id)}
              className="w-full flex items-center gap-3 p-2.5 text-left disabled:opacity-40"
              style={{ border: '1px solid var(--t-line)', borderRadius: 'var(--t-radius-md)' }}
            >
              <PersonAvatar name={m.name} color={m.color} index={i} size={36} />
              <div className="flex-1">
                <div className="text-sm font-semibold">{m.name}</div>
                <div className="text-xs capitalize" style={{ color: 'var(--t-text-soft)' }}>{claimed ? 'Already linked' : m.role}</div>
              </div>
            </button>
          )
        })}
      </div>
    </AuthShell>
  )
}
