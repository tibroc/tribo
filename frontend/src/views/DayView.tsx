import { useLayoutEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SHARED_COLOR } from '../lib/tokens'
import { sameDay, startOfDay, colorForEvent, eventDate, eventDisplayTitle, type ViewProps } from '../lib/calendar'
import { fmtTime, fmtHour } from '../lib/datetime'
import { useLocale } from '../lib/i18n'
import type { FamilyMember, TriboEvent } from '../lib/api'
import { useChoresTodos } from '../lib/hooks'
import AppShell from '../components/AppShell'
import { CalendarHeader } from '../components/chrome'
import Card from '../components/Card'
import EventChip from '../components/EventChip'
import PersonAvatar from '../components/PersonAvatar'
import { ChoresPanel, TodosPanel } from '../components/panels'

const HOUR_START = 0
const HOUR_END = 24 // full day; the timeline scrolls and auto-scrolls to "now"
const HOUR_HEIGHT = 56
const SPAN = HOUR_END - HOUR_START
const TOTAL_HEIGHT = SPAN * HOUR_HEIGHT // minimum timeline height (scrolls below this)
const HOURS = Array.from({ length: SPAN }, (_, i) => HOUR_START + i)

const fracHour = (d: Date) => d.getHours() + d.getMinutes() / 60
const clockFrac = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) + (m || 0) / 60
}

interface BusyBlock { start: number; end: number; label: string }
const clamp = (t: number) => Math.max(HOUR_START, Math.min(HOUR_END, t))
// Vertical position as a percentage of the (fluid) timeline height.
const pct = (t: number) => ((clamp(t) - HOUR_START) / SPAN) * 100

// Tinted marker-pen fill matching EventChip's color-mix recipe.
const tint = (color: string) => `color-mix(in oklab, ${color} var(--t-tint, 12%), var(--t-surface))`

interface Block { ev: TriboEvent; start: number; end: number; color: string; who?: string }

export default function DayView({ members, events, cursor, today, header, workSchedules, onNavigate, onAddEvent, onEditEvent }: ViewProps) {
  const locale = useLocale()
  const { t } = useTranslation()
  const day = useMemo(() => startOfDay(cursor), [cursor])
  const weekday = (day.getDay() + 6) % 7 // Mon=0
  const busyFor = (memberID: string): BusyBlock[] =>
    workSchedules
      .filter((ws) => ws.memberId === memberID && ws.showOnCalendar && ws.daysOfWeek[weekday] === '1')
      .map((ws) => ({ start: clockFrac(ws.startTime), end: clockFrac(ws.endTime), label: ws.label }))
  const isToday = sameDay(day, today)
  const nowFrac = fracHour(today)
  const showNow = isToday && nowFrac >= HOUR_START && nowFrac <= HOUR_END

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  // Timed events on this day, split per person + shared.
  const { perMember, shared } = useMemo(() => {
    const pm = new Map<string, Block[]>()
    members.forEach((m) => pm.set(m.id, []))
    const sh: Block[] = []
    for (const ev of events) {
      const s = new Date(ev.startAt)
      if (ev.allDay || !sameDay(s, day)) continue
      const block: Omit<Block, 'color' | 'who'> = { ev, start: fracHour(s), end: fracHour(new Date(ev.endAt)) }
      if (ev.isShared || ev.attendeeIds.length === 0) sh.push({ ...block, color: colorForEvent(ev, byId), who: t('common.family') })
      else ev.attendeeIds.forEach((mid) => {
        const m = members.find((x) => x.id === mid)
        if (m) pm.get(mid)!.push({ ...block, color: ev.colorOverride || m.color, who: m.name })
      })
    }
    return { perMember: pm, shared: sh }
  }, [events, members, day, t, byId])

  const combined = useMemo(() => {
    const all: Block[] = [...members.flatMap((m) => perMember.get(m.id) ?? []), ...shared]
    return all.sort((a, b) => a.start - b.start)
  }, [perMember, shared, members])

  // Where to auto-scroll the (now full-day) timeline: the current time on today,
  // otherwise the earliest event, otherwise 8 AM. Anchored in the visible layout
  // and scrolled into view on mount / day change so 24h doesn't open at midnight.
  const focusFrac = useMemo(() => {
    if (showNow) return nowFrac
    return combined.length ? Math.min(...combined.map((b) => b.start)) : 8
  }, [showNow, nowFrac, combined])
  useLayoutEffect(() => {
    // Center the focus time in its scroll container by setting scrollTop directly
    // (scrollIntoView proved unreliable here). AppShell renders the view twice
    // (desktop + mobile), so query the DOM for the *visible* anchor rather than
    // relying on a ref. The flex/grid scroll height isn't final immediately after
    // mount, so retry until the scroller is taller than its viewport, then scroll.
    let cancelled = false
    let tries = 0
    const attempt = () => {
      if (cancelled) return
      const el = [...document.querySelectorAll<HTMLElement>('[data-day-anchor]')].find((a) => a.offsetParent !== null)
      let p: HTMLElement | null = el ? el.parentElement : null
      while (p) {
        const oy = getComputedStyle(p).overflowY
        if (oy === 'auto' || oy === 'scroll') break
        p = p.parentElement
      }
      if (el && p && p.scrollHeight > p.clientHeight) {
        const offset = el.getBoundingClientRect().top - p.getBoundingClientRect().top + p.scrollTop
        p.scrollTop = Math.max(0, offset - p.clientHeight / 2)
        return
      }
      if (tries++ < 40) setTimeout(attempt, 50)
    }
    attempt()
    return () => { cancelled = true }
  }, [day, focusFrac])

  // All-day events (birthdays, holidays) — shown in a strip above the timeline,
  // since they have no place on the hour grid.
  const allDayEvents = useMemo(
    () => events.filter((ev) => ev.allDay && sameDay(eventDate(ev), day)),
    [events, day],
  )

  const columns = [
    ...members.map((m) => ({ key: m.id, name: m.name, color: m.color, isFamily: false, blocks: perMember.get(m.id) ?? [], busy: busyFor(m.id) })),
    { key: 'family', name: t('common.family'), color: SHARED_COLOR, isFamily: true, blocks: shared, busy: [] as BusyBlock[] },
  ]

  return (
    <AppShell active="calendar" onNavigate={onNavigate} onFabClick={onAddEvent} header={<CalendarHeader controls={header} />} aside={<TodayPanel members={members} />}>
      {allDayEvents.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid var(--t-line)' }}>
          <span className="text-xs font-bold uppercase tracking-wider shrink-0" style={{ color: 'var(--t-text-soft)' }}>{t('event.allDay')}</span>
          {allDayEvents.map((ev) => (
            <div key={ev.id} className="min-w-[120px]">
              <EventChip dense title={eventDisplayTitle(ev, t)} color={colorForEvent(ev, byId)} icon={ev.icon} onClick={() => onEditEvent(ev)} />
            </div>
          ))}
        </div>
      )}
      {/* Tablet: per-person columns — fills the island height */}
      <div className="hidden lg:grid lg:flex-1 lg:min-h-0" style={{ gridTemplateColumns: `64px repeat(${columns.length}, 1fr)`, gridTemplateRows: `auto minmax(${TOTAL_HEIGHT}px, 1fr)` }}>
        <div style={{ borderBottom: '1px solid var(--t-line)' }} />
        {columns.map((c) => <ColumnHeader key={c.key} person={c} />)}

        <TimeAxis showNow={showNow} nowFrac={nowFrac} locale={locale} anchorFrac={focusFrac} />
        {columns.map((c) => (
          <TimelineColumn key={c.key} blocks={c.blocks} busy={c.busy} showNow={showNow} nowFrac={nowFrac} withWho={false} onEditEvent={onEditEvent} locale={locale} />
        ))}
      </div>

      {/* Phone: single combined column */}
      <div className="lg:hidden grid" style={{ gridTemplateColumns: '64px 1fr', height: TOTAL_HEIGHT }}>
        <TimeAxis showNow={showNow} nowFrac={nowFrac} locale={locale} anchorFrac={focusFrac} />
        <TimelineColumn blocks={combined} busy={[]} showNow={showNow} nowFrac={nowFrac} withWho onEditEvent={onEditEvent} locale={locale} />
      </div>
    </AppShell>
  )
}

function ColumnHeader({ person }: { person: { name: string; color: string; isFamily: boolean } }) {
  return (
    <div className="flex items-center gap-2 px-3 py-3 min-w-0" style={{ borderBottom: '1px solid var(--t-line)', borderLeft: '1px solid var(--t-line)' }}>
      <PersonAvatar name={person.name} color={person.color} family={person.isFamily} size={30} />
      <div className="text-sm font-semibold truncate">{person.name}</div>
    </div>
  )
}

function TimeAxis({ showNow, nowFrac, locale, anchorFrac }: { showNow: boolean; nowFrac: number; locale: string; anchorFrac?: number }) {
  return (
    <div className="relative h-full">
      {HOURS.map((h) => (
        <div key={h} className="absolute right-2.5 text-xs font-semibold" style={{ top: `${pct(h)}%`, transform: 'translateY(-2px)', color: 'var(--t-text-soft)' }}>{fmtHour(h, locale)}</div>
      ))}
      {anchorFrac !== undefined && <div data-day-anchor style={{ position: 'absolute', top: `${pct(anchorFrac)}%`, width: 1, height: 1 }} />}
      {showNow && <div className="absolute right-0 rounded-full" style={{ top: `${pct(nowFrac)}%`, marginTop: -4, width: 8, height: 8, backgroundColor: 'var(--t-danger)' }} />}
    </div>
  )
}

function TimelineColumn({ blocks, busy, showNow, nowFrac, withWho, onEditEvent, locale }: {
  blocks: Block[]
  busy: BusyBlock[]
  showNow: boolean
  nowFrac: number
  withWho: boolean
  onEditEvent: (e: TriboEvent) => void
  locale: string
}) {
  const { t } = useTranslation()
  return (
    <div
      className="relative h-full"
      style={{
        borderLeft: '1px solid var(--t-line)',
        backgroundImage: `repeating-linear-gradient(to bottom, var(--t-line) 0, var(--t-line) 1px, transparent 1px, transparent calc(100% / ${SPAN}))`,
      }}
    >
      {/* Faint "busy" stripes from work schedules (behind events). */}
      {busy.map((bl, i) => (
        <div key={`busy-${i}`} className="absolute left-0 right-0 overflow-hidden" style={{ top: `${pct(bl.start)}%`, height: `${pct(bl.end) - pct(bl.start)}%`, backgroundColor: 'color-mix(in oklab, var(--t-text-soft) 8%, transparent)' }}>
          <div className="px-1" style={{ fontSize: '9px', color: 'var(--t-text-soft)' }}>{bl.label}</div>
        </div>
      ))}
      {blocks.map((b) => (
        <div
          key={b.ev.id}
          onClick={() => onEditEvent(b.ev)}
          className="absolute overflow-hidden cursor-pointer"
          style={{
            top: `${pct(b.start)}%`,
            height: `${pct(b.end) - pct(b.start)}%`,
            left: 6, right: 6, minHeight: 18,
            borderLeft: `4px solid ${b.color}`,
            borderRadius: '4px 10px 10px 4px',
            background: tint(b.color),
            padding: '5px 9px',
            color: 'var(--t-text)',
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-soft)' }}>
            {fmtTime(new Date(b.ev.startAt), locale)} – {fmtTime(new Date(b.ev.endAt), locale)}{withWho && b.who ? ` · ${b.who}` : ''}
          </div>
          <div className="truncate" style={{ fontSize: 12.5, fontWeight: 600, marginTop: 1 }}>{eventDisplayTitle(b.ev, t)}</div>
        </div>
      ))}
      {showNow && (
        <div className="absolute left-0 right-0" style={{ top: `${pct(nowFrac)}%`, height: 2, background: 'var(--t-danger)', zIndex: 3 }}>
          <span className="absolute rounded-full" style={{ left: -4, top: -3, width: 8, height: 8, background: 'var(--t-danger)' }} />
        </div>
      )}
    </div>
  )
}

// Live chores + to-dos as two free-floating aside cards.
function TodayPanel({ members }: { members: FamilyMember[] }) {
  const { t } = useTranslation()
  const { instances, todos, toggleChore, toggleTodo, addTodo } = useChoresTodos()
  return (
    <>
      <Card>
        <ChoresPanel instances={instances} members={members} onToggle={toggleChore} title={t('calendar.choresThisWeek')} />
      </Card>
      <Card>
        <div style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 23, marginBottom: 12 }}>{t('nav.todos')}</div>
        <TodosPanel todos={todos} onToggle={toggleTodo} onAdd={addTodo} />
      </Card>
    </>
  )
}
