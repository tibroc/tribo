import { useMemo } from 'react'
import { SHARED_COLOR } from '../lib/tokens'
import { fmtTime, sameDay, startOfDay, type ViewProps } from '../lib/calendar'
import type { FamilyMember, TriboEvent } from '../lib/api'
import { useChoresTodos } from '../lib/hooks'
import AppShell from '../components/AppShell'
import { CalendarHeader } from '../components/chrome'
import Card from '../components/Card'
import PersonAvatar from '../components/PersonAvatar'
import { ChoresPanel, TodosPanel } from '../components/panels'

const HOUR_START = 6
const HOUR_END = 21 // 6 AM – 9 PM
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
const formatHour = (h: number) => (h === 12 ? 'Noon' : `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`)

// Tinted marker-pen fill matching EventChip's color-mix recipe.
const tint = (color: string) => `color-mix(in oklab, ${color} var(--t-tint, 12%), var(--t-surface))`

interface Block { ev: TriboEvent; start: number; end: number; color: string; who?: string }

export default function DayView({ members, events, cursor, today, header, workSchedules, onNavigate, onAddEvent, onEditEvent }: ViewProps) {
  const day = useMemo(() => startOfDay(cursor), [cursor])
  const weekday = (day.getDay() + 6) % 7 // Mon=0
  const busyFor = (memberID: string): BusyBlock[] =>
    workSchedules
      .filter((ws) => ws.memberId === memberID && ws.showOnCalendar && ws.daysOfWeek[weekday] === '1')
      .map((ws) => ({ start: clockFrac(ws.startTime), end: clockFrac(ws.endTime), label: ws.label }))
  const isToday = sameDay(day, today)
  const nowFrac = fracHour(today)
  const showNow = isToday && nowFrac >= HOUR_START && nowFrac <= HOUR_END

  // Timed events on this day, split per person + shared.
  const { perMember, shared } = useMemo(() => {
    const pm = new Map<string, Block[]>()
    members.forEach((m) => pm.set(m.id, []))
    const sh: Block[] = []
    for (const ev of events) {
      const s = new Date(ev.startAt)
      if (ev.allDay || !sameDay(s, day)) continue
      const block: Omit<Block, 'color' | 'who'> = { ev, start: fracHour(s), end: fracHour(new Date(ev.endAt)) }
      if (ev.isShared || ev.attendeeIds.length === 0) sh.push({ ...block, color: SHARED_COLOR, who: 'Family' })
      else ev.attendeeIds.forEach((mid) => {
        const m = members.find((x) => x.id === mid)
        if (m) pm.get(mid)!.push({ ...block, color: m.color, who: m.name })
      })
    }
    return { perMember: pm, shared: sh }
  }, [events, members, day])

  const combined = useMemo(() => {
    const all: Block[] = [...members.flatMap((m) => perMember.get(m.id) ?? []), ...shared]
    return all.sort((a, b) => a.start - b.start)
  }, [perMember, shared, members])

  const columns = [
    ...members.map((m) => ({ key: m.id, name: m.name, color: m.color, isFamily: false, blocks: perMember.get(m.id) ?? [], busy: busyFor(m.id) })),
    { key: 'family', name: 'Family', color: SHARED_COLOR, isFamily: true, blocks: shared, busy: [] as BusyBlock[] },
  ]

  return (
    <AppShell active="calendar" onNavigate={onNavigate} onFabClick={onAddEvent} header={<CalendarHeader controls={header} />} aside={<TodayPanel members={members} />}>
      {/* Tablet: per-person columns — fills the island height */}
      <div className="hidden lg:grid lg:flex-1 lg:min-h-0" style={{ gridTemplateColumns: `64px repeat(${columns.length}, 1fr)`, gridTemplateRows: `auto minmax(${TOTAL_HEIGHT}px, 1fr)` }}>
        <div style={{ borderBottom: '1px solid var(--t-line)' }} />
        {columns.map((c, i) => <ColumnHeader key={c.key} person={c} isLast={i === columns.length - 1} />)}

        <TimeAxis showNow={showNow} nowFrac={nowFrac} />
        {columns.map((c, i) => (
          <TimelineColumn key={c.key} blocks={c.blocks} busy={c.busy} isLast={i === columns.length - 1} showNow={showNow} nowFrac={nowFrac} withWho={false} onEditEvent={onEditEvent} />
        ))}
      </div>

      {/* Phone: single combined column */}
      <div className="lg:hidden grid" style={{ gridTemplateColumns: '64px 1fr', height: TOTAL_HEIGHT }}>
        <TimeAxis showNow={showNow} nowFrac={nowFrac} />
        <TimelineColumn blocks={combined} busy={[]} isLast showNow={showNow} nowFrac={nowFrac} withWho onEditEvent={onEditEvent} />
      </div>
    </AppShell>
  )
}

function ColumnHeader({ person }: { person: { name: string; color: string; isFamily: boolean }; isLast: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3 py-3 min-w-0" style={{ borderBottom: '1px solid var(--t-line)', borderLeft: '1px solid var(--t-line)' }}>
      <PersonAvatar name={person.name} color={person.color} family={person.isFamily} size={30} />
      <div className="text-sm font-semibold truncate">{person.name}</div>
    </div>
  )
}

function TimeAxis({ showNow, nowFrac }: { showNow: boolean; nowFrac: number }) {
  return (
    <div className="relative h-full">
      {HOURS.map((h) => (
        <div key={h} className="absolute right-2.5 text-xs font-semibold" style={{ top: `${pct(h)}%`, transform: 'translateY(-2px)', color: 'var(--t-text-soft)' }}>{formatHour(h)}</div>
      ))}
      {showNow && <div className="absolute right-0 rounded-full" style={{ top: `${pct(nowFrac)}%`, marginTop: -4, width: 8, height: 8, backgroundColor: 'var(--t-danger)' }} />}
    </div>
  )
}

function TimelineColumn({ blocks, busy, showNow, nowFrac, withWho, onEditEvent }: {
  blocks: Block[]
  busy: BusyBlock[]
  isLast?: boolean
  showNow: boolean
  nowFrac: number
  withWho: boolean
  onEditEvent: (e: TriboEvent) => void
}) {
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
            {fmtTime(new Date(b.ev.startAt))} – {fmtTime(new Date(b.ev.endAt))}{withWho && b.who ? ` · ${b.who}` : ''}
          </div>
          <div className="truncate" style={{ fontSize: 12.5, fontWeight: 600, marginTop: 1 }}>{b.ev.title}</div>
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
  const { instances, todos, toggleChore, toggleTodo, addTodo } = useChoresTodos()
  return (
    <>
      <Card>
        <ChoresPanel instances={instances} members={members} onToggle={toggleChore} title="This week's chores" />
      </Card>
      <Card>
        <div style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 23, marginBottom: 12 }}>To-dos</div>
        <TodosPanel todos={todos} onToggle={toggleTodo} onAdd={addTodo} />
      </Card>
    </>
  )
}
