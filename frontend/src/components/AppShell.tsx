import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { NavKey, Intent, EventFocus } from '../lib/calendar'
import { useTheme } from '../lib/theme'
import Icon from './Icon'
import { Wordmark, Weather } from './chrome'
import NotificationBell from './NotificationBell'
import ProfileSwitcher from './ProfileSwitcher'

const NAV: { key: NavKey; icon: string }[] = [
  { key: 'home',     icon: 'home' },
  { key: 'calendar', icon: 'calendar' },
  { key: 'chores',   icon: 'chores' },
  { key: 'todos',    icon: 'todos' },
  { key: 'family',   icon: 'family' },
]

// Two faint organic blobs behind everything — the Salvia "warm sand" backdrop.
const BLOB_PATH =
  'M99 6c34-6 71 8 88 38 16 28 9 64-8 92-18 30-52 44-86 38C56 168 22 150 9 118-4 86 4 46 30 24 49 8 76 10 99 6Z'

function Blobs() {
  return (
    <>
      <svg viewBox="0 0 200 180" aria-hidden className="pointer-events-none absolute"
        style={{ width: 360, height: 320, top: -120, right: 220, opacity: 'var(--t-blob-op, .05)', zIndex: 1 }}>
        <path fill="var(--t-brand)" d={BLOB_PATH} />
      </svg>
      <svg viewBox="0 0 200 180" aria-hidden className="pointer-events-none absolute"
        style={{ width: 300, height: 270, bottom: -110, left: -60, opacity: 'var(--t-blob-op, .05)', zIndex: 1 }}>
        <path fill="var(--t-danger)" d={BLOB_PATH} />
      </svg>
    </>
  )
}

// A single floating-rail nav destination — salvia squircle when active.
function RailNav({ name, label, active, onClick }: { name: string; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex items-center justify-center transition-all"
      style={{
        width: 50, height: 50,
        borderRadius: active ? '18px 18px 18px 6px' : 18,
        background: active ? 'var(--t-brand)' : 'transparent',
        color: active ? 'var(--t-on-brand)' : 'var(--t-text-soft)',
        transform: active ? 'rotate(-3deg)' : undefined,
        boxShadow: active ? '0 6px 16px rgba(62,98,89,.32)' : undefined,
      }}
    >
      <Icon name={name} size={21} strokeWidth={2} />
    </button>
  )
}

// A single mobile bottom-bar destination.
function TabNav({ name, label, active, onClick }: { name: string; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-1"
      style={active ? { color: 'var(--t-brand)' } : { color: 'var(--t-text-soft)' }}
    >
      <Icon name={name} size={20} style={active ? { transform: 'rotate(-3deg)' } : undefined} />
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}

export type FabMenuItem = { label: string; icon: string; onClick: () => void }

export default function AppShell({ active, onNavigate, header, aside, showFab = true, onFabClick, fabMenu, children }: {
  active: NavKey
  onNavigate: (k: NavKey, intent?: Intent, focus?: EventFocus) => void
  header: ReactNode
  aside?: ReactNode
  showFab?: boolean
  onFabClick?: () => void
  fabMenu?: FabMenuItem[]
  children: ReactNode
}) {
  const { t } = useTranslation()
  const { theme, toggle } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)

  const themeBtn = (
    <button
      onClick={toggle}
      className="flex items-center justify-center rounded-full"
      style={{ width: 38, height: 38, border: '1px solid var(--t-line)', background: 'var(--t-shell)', color: 'var(--t-text-soft)' }}
      aria-label={theme === 'dark' ? t('appshell.switchToLight') : t('appshell.switchToDark')}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
    </button>
  )

  const bellBtn = (
    <NotificationBell onOpenEvent={(eventId, date) => onNavigate('calendar', 'open-event', { eventId, date })} />
  )

  return (
    <div className="relative min-h-screen lg:h-screen lg:overflow-hidden lg:flex lg:flex-col w-full font-body" style={{ background: 'var(--t-bg)', color: 'var(--t-text)', overflowX: 'hidden' }}>
      <Blobs />

      {/* ── Desktop header (transparent, floating) ── */}
      <header className="relative hidden lg:flex items-center gap-5 shrink-0" style={{ height: 80, padding: '0 28px', zIndex: 3 }}>
        <Wordmark />
        <div className="flex-1 flex items-center justify-center min-w-0">{header}</div>
        <div className="flex items-center gap-2">
          <Weather />
          {themeBtn}
          {bellBtn}
        </div>
      </header>

      {/* ── Mobile header ── */}
      <header className="lg:hidden relative" style={{ zIndex: 3 }}>
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <Wordmark size="sm" />
          <div className="flex items-center gap-2">
            <Weather size={15} />
            {themeBtn}
            {bellBtn}
          </div>
        </div>
        {header && <div className="px-4 py-2">{header}</div>}
      </header>

      {/* ── Desktop body: rail · main · aside (fixed-height, fills viewport) ── */}
      <div className="relative hidden lg:flex flex-1 min-h-0" style={{ gap: 22, padding: '4px 28px 24px', zIndex: 2 }}>
        <nav
          className="flex flex-col items-center shrink-0"
          style={{
            width: 78, padding: '18px 0', gap: 6,
            background: 'var(--t-shell)', border: '1px solid var(--t-line)',
            borderRadius: 38, boxShadow: 'var(--t-shadow)',
          }}
        >
          {NAV.filter((n) => n.key !== 'family').map((n) => (
            <RailNav key={n.key} name={n.icon} label={t(`nav.${n.key}`)} active={active === n.key} onClick={() => onNavigate(n.key)} />
          ))}
          <div className="flex-1" style={{ minHeight: 24 }} />
          {/* Bottom cluster: Family, then the profile switcher pinned to the very bottom */}
          <RailNav name="family" label={t('nav.family')} active={active === 'family'} onClick={() => onNavigate('family')} />
          <ProfileSwitcher />
        </nav>

        <main
          className="flex-1 min-w-0 flex flex-col"
          style={{
            background: 'var(--t-surface)', border: '1px solid var(--t-line)',
            borderRadius: 30, boxShadow: 'var(--t-shadow)', overflow: 'hidden',
          }}
        >
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">{children}</div>
        </main>

        {aside && (
          <aside className="hidden lg:flex flex-col shrink-0 overflow-y-auto no-scrollbar" style={{ width: 300, gap: 18 }}>
            {aside}
          </aside>
        )}
      </div>

      {/* ── Mobile body ── */}
      <div className="lg:hidden relative px-3 pb-24" style={{ zIndex: 2 }}>
        <main
          style={{
            background: 'var(--t-surface)', border: '1px solid var(--t-line)',
            borderRadius: 24, boxShadow: 'var(--t-shadow)', overflow: 'hidden',
          }}
        >
          {children}
        </main>
        {aside && <div className="mt-4 flex flex-col gap-4">{aside}</div>}
      </div>

      {/* ── Mobile bottom bar ── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around py-2"
        style={{ borderTop: '1px solid var(--t-line)', background: 'var(--t-surface)', zIndex: 20 }}
      >
        {NAV.map((n) => (
          <TabNav key={n.key} name={n.icon} label={t(`nav.${n.key}`)} active={active === n.key} onClick={() => onNavigate(n.key)} />
        ))}
        <ProfileSwitcher mobile />
      </nav>

      {showFab && (
        <>
          {menuOpen && fabMenu && (
            <>
              <div className="fixed inset-0" style={{ zIndex: 29 }} onClick={() => setMenuOpen(false)} aria-hidden />
              <div
                className="fixed flex flex-col right-5 bottom-[156px] lg:right-8 lg:bottom-[80px]"
                style={{
                  background: 'var(--t-surface)', border: '1px solid var(--t-line)',
                  borderRadius: 'var(--t-radius-lg)', boxShadow: 'var(--t-shadow-pop)',
                  padding: 6, gap: 2, minWidth: 180, zIndex: 31,
                }}
                role="menu"
              >
                {fabMenu.map((item) => (
                  <button
                    key={item.label}
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); item.onClick() }}
                    className="flex items-center gap-3 text-left rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-(--t-shell)"
                    style={{ color: 'var(--t-text)' }}
                  >
                    <Icon name={item.icon} size={17} style={{ color: 'var(--t-brand)' }} />
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            onClick={() => (fabMenu ? setMenuOpen((o) => !o) : onFabClick?.())}
            className="fixed flex items-center justify-center transition-transform hover:-translate-y-1 hover:-rotate-6 right-5 bottom-[88px] lg:right-8 lg:bottom-8"
            style={{
              width: 60, height: 60,
              borderRadius: '50% 50% 50% 18px',
              background: 'var(--t-accent)', color: 'var(--t-on-accent)',
              boxShadow: '0 10px 26px rgba(210,152,46,.4)', zIndex: 30,
              transform: menuOpen ? 'rotate(45deg)' : undefined,
            }}
            aria-label={t('common.add')}
            aria-haspopup={fabMenu ? 'menu' : undefined}
            aria-expanded={fabMenu ? menuOpen : undefined}
          >
            <Icon name="plus" size={26} strokeWidth={2.4} />
          </button>
        </>
      )}
    </div>
  )
}
