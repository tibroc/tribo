import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, AlertTriangle, UserPlus, Check } from 'lucide-react'
import { getNotifications, type Notification } from '../lib/api'
import { fmtWeekdayDay } from '../lib/datetime'
import { useLocale } from '../lib/i18n'

// Fired after an action that may resolve a notification (e.g. assigning a
// guardian) so the bell refetches without a full reload.
export const NOTIFICATIONS_CHANGED_EVENT = 'tribo:notifications-changed'

// Header action-center bell: a live count of outstanding items (currently
// guardian-needed events), with a dropdown that deep-links to each one.
export default function NotificationBell({ onOpenEvent, size = 17 }: {
  onOpenEvent: (eventId: string, date: string) => void
  size?: number
}) {
  const { t } = useTranslation()
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const locale = useLocale()

  useEffect(() => {
    const load = () => getNotifications().then(setItems).catch(() => setItems([]))
    load()
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, load)
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, load)
  }, [])

  const count = items.length
  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) getNotifications().then(setItems).catch(() => {})
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="hidden sm:flex items-center justify-center rounded-full"
        style={{ width: 38, height: 38, border: '1px solid var(--t-line)', background: 'var(--t-shell)', color: 'var(--t-text-soft)' }}
        aria-label={count > 0 ? t('notifications.titleCount', { count }) : t('notifications.title')}
        aria-expanded={open}
      >
        <Bell size={size} />
        {count > 0 && (
          <span
            className="absolute flex items-center justify-center font-bold"
            style={{
              top: -2, right: -2, minWidth: 18, height: 18, padding: '0 4px',
              borderRadius: 999, fontSize: 11,
              background: 'var(--t-accent)', color: 'var(--t-on-accent)',
              border: '2px solid var(--t-bg)',
            }}
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0" style={{ zIndex: 40 }} onClick={() => setOpen(false)} aria-hidden />
          <div
            className="fixed sm:absolute right-4 sm:right-0 top-16 sm:top-[46px]"
            style={{
              width: 320, maxWidth: 'calc(100vw - 2rem)',
              background: 'var(--t-surface)', border: '1px solid var(--t-line)',
              borderRadius: 'var(--t-radius-lg)', boxShadow: 'var(--t-shadow-pop)',
              zIndex: 41, overflow: 'hidden',
            }}
            role="menu"
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--t-line)' }}>
              <span className="font-display text-base" style={{ fontWeight: 500 }}>{t('notifications.heading')}</span>
              <span className="text-xs" style={{ color: 'var(--t-text-soft)' }}>{count > 0 ? t('notifications.itemCount', { count }) : ''}</span>
            </div>

            {count === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Check size={22} style={{ color: 'var(--t-brand)' }} />
                <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('notifications.allCaught')}</div>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                {items.map((n, i) => {
                  const warn = n.severity === 'warning'
                  const NIcon = warn ? AlertTriangle : UserPlus
                  const color = warn ? 'var(--t-danger)' : 'var(--t-brand)'
                  return (
                    <button
                      key={n.id}
                      role="menuitem"
                      onClick={() => { setOpen(false); onOpenEvent(n.eventId, n.startAt) }}
                      className="flex items-start gap-3 w-full text-left px-4 py-3"
                      style={{ borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--t-line)' }}
                    >
                      <span className="flex items-center justify-center flex-shrink-0 rounded-full" style={{ width: 28, height: 28, background: `color-mix(in oklab, ${color} 16%, var(--t-surface))` }}>
                        <NIcon size={15} style={{ color }} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold truncate" style={{ color: 'var(--t-text)' }}>{n.title}</span>
                        <span className="block text-xs" style={{ color: 'var(--t-text-soft)' }}>{t(`notifications.${n.type}`)}</span>
                      </span>
                      <span className="text-xs flex-shrink-0 whitespace-nowrap" style={{ color: 'var(--t-text-soft)' }}>{formatDay(n.startAt, locale)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function formatDay(iso: string, locale: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return fmtWeekdayDay(d, locale)
}
