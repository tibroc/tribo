import { LogIn } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  return (
    <AuthShell>
      <div className="font-display text-lg font-bold text-center mb-1">{t('auth.welcomeHome')}</div>
      <div className="text-sm text-center mb-5" style={{ color: 'var(--t-text-soft)' }}>{t('auth.loginSubtitle')}</div>
      <Button onClick={login} style={{ width: '100%' }}>
        <LogIn size={16} /> {t('auth.signInWithAuthentik')}
      </Button>
    </AuthShell>
  )
}

// First-login: link the signed-in account to a family member.
export function MapProfileScreen() {
  const { session, mapProfile } = useSession()
  const { t } = useTranslation()
  if (!session) return null
  return (
    <AuthShell>
      <div className="font-display text-lg font-bold text-center mb-1">{t('auth.whoAreYou')}</div>
      <div className="text-sm text-center mb-5" style={{ color: 'var(--t-text-soft)' }}>{t('auth.mapSubtitle')}</div>
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
                <div className="text-xs" style={{ color: 'var(--t-text-soft)' }}>{claimed ? t('auth.alreadyLinked') : t(`forms.role.${m.role}`)}</div>
              </div>
            </button>
          )
        })}
      </div>
    </AuthShell>
  )
}
