import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Sparkles, RefreshCw, Clock } from 'lucide-react'
import {
  getFocus, deferFocusItem, claimEvent, setChoreStatus, setTodoStatus,
  getAssistantBrief, refreshAssistantBrief,
  type FocusQueue, type FocusItem, type FamilyMember, type AssistantBrief, type Energy,
} from '../lib/api'
import { fmtTime } from '../lib/datetime'
import { useLocale } from '../lib/i18n'
import { useSession } from '../lib/session'
import type { Section, Intent, EventFocus } from '../lib/calendar'
import { NOTIFICATIONS_CHANGED_EVENT } from './NotificationBell'
import Card from './Card'
import PersonAvatar from './PersonAvatar'
import Portal from './Portal'

// Today's energy level — a private, per-device signal (localStorage, never
// sent as stored state to the server). Day-scoped: a new day resets to "ok".
const ENERGY_KEY = 'tribo-energy'

function loadEnergy(): Energy {
  try {
    const raw = localStorage.getItem(ENERGY_KEY)
    if (raw) {
      const { v, d } = JSON.parse(raw) as { v: Energy; d: string }
      if (d === new Date().toDateString() && (v === 'low' || v === 'ok' || v === 'high')) return v
    }
  } catch { /* fall through */ }
  return 'ok'
}

function saveEnergy(v: Energy) {
  try { localStorage.setItem(ENERGY_KEY, JSON.stringify({ v, d: new Date().toDateString() })) } catch { /* best effort */ }
}

// The Home focus card (docs/focus-plan.md F1, mockup A): one NOW, two NEXT,
// the rest hidden on purpose, with guilt-free defer and a countdown to the
// day's next fixed point. Deterministic — works without the AI assistant;
// when the assistant is configured, a "This week" tab shows the week brief
// and the day brief contributes its watch-out/praise callouts.
export default function FocusCard({ members, go, assistantOn }: {
  members: FamilyMember[]
  go: (s: Section, intent?: Intent, focus?: EventFocus) => void
  assistantOn: boolean
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { activeMember } = useSession()
  const [queue, setQueue] = useState<FocusQueue | null>(null)
  const [showLater, setShowLater] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'today' | 'week'>('today')
  const [dayBrief, setDayBrief] = useState<AssistantBrief | null>(null)
  const [energy, setEnergyState] = useState<Energy>(loadEnergy)
  const setEnergy = (v: Energy) => { setEnergyState(v); saveEnergy(v) }
  // Tick every 30s so countdowns stay honest.
  const [nowTs, setNowTs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const reload = useCallback((all: boolean) => {
    getFocus(all, energy).then(setQueue).catch((e) => setError(String(e)))
  }, [energy])
  useEffect(() => { reload(showLater) }, [reload, showLater])
  useEffect(() => {
    if (assistantOn) getAssistantBrief('day').then(setDayBrief).catch(() => {})
  }, [assistantOn])

  const memberOf = (id?: string) => members.find((m) => m.id === id)

  // Primary action: complete chores/todos; claim events when a guardian holds
  // the device, otherwise open the event so its claim buttons take over.
  const act = (item: FocusItem) => {
    if (item.kind === 'event') {
      if (activeMember && activeMember.role === 'guardian') {
        claimEvent(item.id, activeMember.id)
          .then(() => { window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT)); reload(showLater) })
          .catch(() => go('calendar', 'open-event', { eventId: item.id, date: item.at ?? '' }))
      } else {
        go('calendar', 'open-event', { eventId: item.id, date: item.at ?? '' })
      }
      return
    }
    const done = item.kind === 'chore'
      ? setChoreStatus(item.id, 'done', activeMember?.id ?? item.memberId)
      : setTodoStatus(item.id, 'done')
    done.then(() => reload(showLater)).catch((e) => setError(String(e)))
  }

  const defer = (item: FocusItem) => {
    deferFocusItem(item.kind, item.id).then(() => reload(showLater)).catch((e) => setError(String(e)))
  }

  const reasonText = (item: FocusItem) => {
    const parts = [t(`focus.reason.${item.reason.code}`, { count: item.reason.n ?? 0 })]
    if (item.at) parts.push(fmtTime(new Date(item.at), locale))
    if (item.effort && item.effort !== 'standard') parts.push(t(`effort.${item.effort}`))
    return parts.join(' · ')
  }

  const countdown = (target?: string) => {
    if (!target) return null
    const diff = new Date(target).getTime() - nowTs
    if (diff <= 0) return t('focus.nowDue')
    const min = Math.round(diff / 60000)
    if (min < 60) return t('focus.inMinutes', { count: min })
    return t('focus.inHours', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') })
  }

  const row = (item: FocusItem, last: boolean) => {
    const member = memberOf(item.memberId)
    const isEvent = item.kind === 'event'
    return (
      <div key={`${item.kind}-${item.id}`} className="flex items-center gap-2.5 py-2" style={{ borderBottom: last ? 'none' : '1px solid var(--t-line)' }}>
        {isEvent
          ? <span className="shrink-0 rounded-full" style={{ width: 18, height: 18, border: '2px dashed var(--t-line)' }} />
          : <button onClick={() => act(item)} aria-label={t('focus.markDone', { title: item.title })}
              className="shrink-0 rounded-full" style={{ width: 18, height: 18, border: '2px solid var(--t-line)' }} />}
        <button className="flex-1 min-w-0 text-left" style={{ cursor: isEvent ? 'pointer' : 'default' }}
          onClick={() => { if (isEvent) go('calendar', 'open-event', { eventId: item.id, date: item.at ?? '' }) }}>
          <span className="block text-[15px] lg:text-sm font-medium truncate">{isEvent && '⚠ '}{item.title}</span>
          <span className="block text-[13px] lg:text-xs truncate" style={{ color: 'var(--t-text-soft)' }}>{reasonText(item)}</span>
        </button>
        {member && <PersonAvatar name={member.name} color={member.color} size={22} />}
      </div>
    )
  }

  const anchor = queue?.anchor
  const anchorCountdown = anchor ? countdown(anchor.leaveAt) : null

  return (
    <>
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold uppercase flex items-center gap-1.5" style={{ color: 'var(--t-text-soft)' }}>
            <Sparkles size={13} style={{ color: 'var(--t-accent)' }} /> {t('focus.title')}
          </div>
          {assistantOn && (
            <div className="flex gap-1 rounded-full p-0.5" style={{ background: 'var(--t-shell)', border: '1px solid var(--t-line)' }}>
              {(['today', 'week'] as const).map((k) => (
                <button key={k} onClick={() => setTab(k)} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={k === tab ? { backgroundColor: 'var(--t-brand)', color: 'var(--t-on-brand)' } : { color: 'var(--t-text-soft)' }}>
                  {t(`focus.tab.${k}`)}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <div className="text-xs mb-2" style={{ color: 'var(--t-danger)' }}>{error}</div>}

        {tab === 'week'
          ? <WeekBrief members={members} />
          : !queue ? (
            <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('common.loading')}</div>
          ) : (
            <>
              {/* Today's energy — meets the day where it is. */}
              <div className="flex gap-1.5 mb-2">
                {(['low', 'ok', 'high'] as Energy[]).map((e) => (
                  <button key={e} onClick={() => setEnergy(e)}
                    className="flex-1 rounded-xl py-1.5 text-xs font-bold"
                    style={e === energy
                      ? { background: 'var(--t-brand)', color: 'var(--t-on-brand)', border: '1px solid var(--t-brand)' }
                      : { background: 'var(--t-shell)', color: 'var(--t-text-soft)', border: '1px solid var(--t-line)' }}>
                    {t(`focus.energy.${e}`)}
                  </button>
                ))}
              </div>
              {energy === 'low' && (
                <div className="text-xs mb-2" style={{ color: 'var(--t-text-soft)' }}>{t('focus.lowHint')}</div>
              )}

              {!queue.now ? (
                <div className="text-sm py-2" style={{ color: 'var(--t-text-soft)' }}>
                  {energy === 'low' && (queue.parked?.length ?? 0) > 0 ? t('focus.allClearLow') : t('focus.allClear')}
                </div>
              ) : (
                <>
              {/* NOW — just this one */}
              <div className="rounded-2xl p-4 mb-2" style={{ border: '2px solid var(--t-brand)' }}>
                <div className="text-[11px] font-extrabold tracking-widest mb-1.5" style={{ color: 'var(--t-brand)' }}>{t('focus.nowLabel')}</div>
                <div className="font-display text-2xl lg:text-xl mb-0.5" style={{ fontWeight: 600 }}>
                  {queue.now.kind === 'event' && '⚠ '}{queue.now.title}
                </div>
                <div className="text-sm mb-1" style={{ color: 'var(--t-text-soft)' }}>{reasonText(queue.now)}</div>
                {queue.now.at && (
                  <div className="text-xs font-bold mb-3" style={{ color: 'var(--t-accent)' }}>{countdown(queue.now.at)}</div>
                )}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => act(queue.now!)}
                    className="flex-1 rounded-xl py-2.5 text-sm font-bold"
                    style={{ background: 'var(--t-brand)', color: 'var(--t-on-brand)', border: 'none' }}>
                    {queue.now.kind === 'event' ? t('focus.gotIt') : t('common.done')}
                  </button>
                  <button onClick={() => defer(queue.now!)}
                    className="flex-1 rounded-xl py-2.5 text-sm font-bold"
                    style={{ background: 'transparent', color: 'var(--t-text-soft)', border: '1px solid var(--t-line)' }}>
                    {t('focus.notNow')}
                  </button>
                </div>
              </div>

              {queue.next.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider mt-3 mb-1" style={{ color: 'var(--t-text-soft)' }}>{t('focus.nextLabel')}</div>
                  {queue.next.map((it, i) => row(it, i === queue.next.length - 1))}
                </div>
              )}

              {(queue.laterCount > 0 || showLater) && (
                <div className="text-center text-xs pt-2" style={{ color: 'var(--t-text-soft)' }}>
                  {showLater ? (
                    <>
                      {(queue.later ?? []).map((it, i) => row(it, i === (queue.later?.length ?? 0) - 1))}
                      <button className="font-bold mt-1" style={{ color: 'var(--t-brand)' }} onClick={() => setShowLater(false)}>{t('focus.hide')}</button>
                    </>
                  ) : (
                    <span>
                      {t('focus.moreToday', { count: queue.laterCount })}{' '}
                      <button className="font-bold" style={{ color: 'var(--t-brand)' }} onClick={() => setShowLater(true)}>{t('focus.show')}</button>
                    </span>
                  )}
                </div>
              )}
                </>
              )}

              {/* Low energy: the big stuff waits visibly, without penalty. */}
              {(queue.parked?.length ?? 0) > 0 && (
                <div className="mt-3" style={{ opacity: 0.65 }}>
                  <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--t-text-soft)' }}>{t('focus.parked')}</div>
                  {queue.parked!.map((it, i) => row(it, i === queue.parked!.length - 1))}
                </div>
              )}

              {queue.winsToday > 0 && (
                <div className="flex items-start gap-2 rounded-xl px-3 py-2 mt-3 text-sm"
                  style={{ background: 'color-mix(in oklab, var(--t-brand) 12%, var(--t-surface))', color: 'var(--t-brand)' }}>
                  <Sparkles size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{t('focus.momentum', { count: queue.winsToday })}</span>
                </div>
              )}

              {dayBrief?.watchOut && (
                <div className="flex items-start gap-2 rounded-xl px-3 py-2 mt-3 text-sm"
                  style={{ background: 'color-mix(in oklab, var(--t-danger) 12%, var(--t-surface))', color: 'var(--t-danger)' }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{dayBrief.watchOut}</span>
                </div>
              )}
            </>
          )}
      </Card>

      {/* Countdown to the day's next fixed point — pinned above the nav. */}
      {anchor && anchorCountdown && tab === 'today' && (
        <Portal singleton="anchor-pill">
          <div
            className="fixed left-4 right-4 lg:left-auto lg:right-8 lg:w-[380px] flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold bottom-[76px] lg:bottom-6"
            style={{
              zIndex: 25,
              background: 'color-mix(in oklab, var(--t-accent) 16%, var(--t-surface))',
              border: '1px solid color-mix(in oklab, var(--t-accent) 40%, var(--t-line))',
              color: 'var(--t-text)', boxShadow: 'var(--t-shadow)',
            }}
          >
            <Clock size={15} style={{ color: 'var(--t-accent)', flexShrink: 0 }} />
            <span className="flex-1 truncate">{t('focus.leaveFor', { title: anchor.title })}</span>
            <span style={{ color: 'var(--t-accent)', fontVariantNumeric: 'tabular-nums' }}>
              {fmtTime(new Date(anchor.leaveAt), locale)} · {anchorCountdown}
            </span>
          </div>
        </Portal>
      )}
    </>
  )
}

// The assistant's week brief, unchanged from phase 1, now living in the
// "This week" tab (only reachable when the assistant is configured).
function WeekBrief({ members }: { members: FamilyMember[] }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [brief, setBrief] = useState<AssistantBrief | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => { getAssistantBrief('week').then(setBrief).catch(() => setBrief(null)) }, [])
  const refresh = () => {
    setBusy(true)
    refreshAssistantBrief('week').then(setBrief).catch(() => {}).finally(() => setBusy(false))
  }
  const memberOf = (id?: string) => members.find((m) => m.id === id)

  if (brief === undefined) return <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('common.loading')}</div>
  if (brief === null) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('assistant.noBrief')}</div>
        <button onClick={refresh} disabled={busy} className="text-sm font-semibold shrink-0 disabled:opacity-50" style={{ color: 'var(--t-brand)' }}>
          {busy ? t('assistant.generating') : t('assistant.generate')}
        </button>
      </div>
    )
  }
  return (
    <>
      {brief.priorities.map((p, i) => {
        const member = memberOf(p.memberId)
        return (
          <div key={i} className="flex items-center gap-2.5 py-2" style={{ borderBottom: i === brief.priorities.length - 1 ? 'none' : '1px solid var(--t-line)' }}>
            <span className="shrink-0 rounded-full" style={{ width: 18, height: 18, border: '2px dashed var(--t-line)' }} />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium truncate">{p.title}</span>
              {p.why && <span className="block text-xs truncate" style={{ color: 'var(--t-text-soft)' }}>{p.why}</span>}
            </span>
            {member && <PersonAvatar name={member.name} color={member.color} size={22} />}
          </div>
        )
      })}
      {brief.watchOut && (
        <div className="flex items-start gap-2 rounded-xl px-3 py-2 mt-2 text-sm"
          style={{ background: 'color-mix(in oklab, var(--t-danger) 12%, var(--t-surface))', color: 'var(--t-danger)' }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{brief.watchOut}</span>
        </div>
      )}
      <div className="flex items-center justify-between mt-2.5 text-xs" style={{ color: 'var(--t-text-soft)' }}>
        <span>{t('assistant.generatedAt', { time: fmtTime(new Date(brief.generatedAt), locale), model: brief.model })}</span>
        <button onClick={refresh} disabled={busy} className="flex items-center gap-1 font-semibold disabled:opacity-50" style={{ color: 'var(--t-brand)' }}>
          <RefreshCw size={12} className={busy ? 'animate-spin' : undefined} /> {t('assistant.refresh')}
        </button>
      </div>
    </>
  )
}
