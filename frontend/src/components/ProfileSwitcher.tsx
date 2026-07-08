import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LogOut, Check } from 'lucide-react'
import { palette } from '../lib/tokens'
import { useSession } from '../lib/session'
import PersonAvatar from './PersonAvatar'

// The active-profile avatar + dropdown. Switching is PIN-gated when the target
// member has a PIN. Shown in the nav rail (desktop) and bottom bar (mobile).
export default function ProfileSwitcher({ mobile }: { mobile?: boolean }) {
  const { t } = useTranslation()
  const { session, activeMember, switchProfile, logout } = useSession()
  const [open, setOpen] = useState(false)
  const [pinFor, setPinFor] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!session) return null

  const choose = async (memberId: string, hasPin: boolean) => {
    if (hasPin) { setPinFor(memberId); setPin(''); setError(null); return }
    await switchProfile(memberId)
    setOpen(false)
  }

  const submitPin = async () => {
    if (!pinFor) return
    try { await switchProfile(pinFor, pin); setPinFor(null); setOpen(false) }
    catch { setError(t('profile.incorrectPin')) }
  }

  const avatarSize = mobile ? 24 : 32
  // Dropdown anchor: rail opens up-right, mobile floats.
  const dropdownPos = mobile
    ? 'fixed bottom-20 left-1/2 -translate-x-1/2 w-64'
    : 'absolute left-14 bottom-0 w-60'

  return (
    <div className={mobile ? '' : 'relative'}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={mobile ? 'flex flex-col items-center justify-center gap-1 px-3 py-1' : 'flex items-center justify-center'}
        aria-label={t('profile.switch')}
      >
        {activeMember
          ? <PersonAvatar name={activeMember.name} color={activeMember.color} size={avatarSize} />
          : <div className="rounded-full" style={{ width: avatarSize, height: avatarSize, backgroundColor: palette.line }} />}
        {mobile && <span className="text-xs font-medium" style={{ color: palette.inkSoft }}>{t('profile.you')}</span>}
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setPinFor(null) }} />
          <div
            className={`z-50 rounded-2xl p-2 shadow-xl ${dropdownPos}`}
            style={{ backgroundColor: palette.surface, border: `1px solid ${palette.line}` }}
          >
            <div className="text-xs font-semibold uppercase px-2 py-1" style={{ color: palette.inkSoft }}>{t('profile.viewingAs')}</div>
            {session.members.map((m) => {
              const active = m.id === session.activeMemberId
              if (pinFor === m.id) {
                return (
                  <div key={m.id} className="p-2">
                    <div className="text-sm font-semibold mb-1">{t('profile.pinPrompt', { name: m.name })}</div>
                    <input
                      type="password" value={pin} autoFocus
                      onChange={(e) => setPin(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitPin()}
                      className="w-full text-sm rounded-lg px-2 py-1.5 outline-hidden"
                      style={{ border: `1px solid ${palette.line}` }}
                    />
                    {error && <div className="text-xs mt-1" style={{ color: '#9b1c1c' }}>{error}</div>}
                    <button onClick={submitPin} className="w-full mt-2 rounded-lg py-1.5 text-sm font-semibold" style={{ backgroundColor: palette.brand, color: '#fff' }}>{t('profile.unlock')}</button>
                  </div>
                )
              }
              return (
                <button key={m.id} onClick={() => choose(m.id, m.hasPin)} className="w-full flex items-center gap-2 rounded-xl p-2 text-left hover:opacity-80">
                  <PersonAvatar name={m.name} color={m.color} size={28} />
                  <span className="text-sm flex-1">{m.name}</span>
                  {active && <Check size={16} style={{ color: palette.brand }} />}
                </button>
              )
            })}
            {session.authEnabled && (
              <button onClick={logout} className="w-full flex items-center gap-2 rounded-xl p-2 text-left mt-1" style={{ borderTop: `1px solid ${palette.line}`, color: palette.inkSoft }}>
                <LogOut size={16} /> <span className="text-sm">{t('profile.signOut')}</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
