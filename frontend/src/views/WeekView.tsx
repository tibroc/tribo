import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SHARED_COLOR } from '../lib/tokens'
import {
  addDays, mondayOf, sameDay, groupByDay, type ViewProps,
} from '../lib/calendar'
import { fmtTime, weekdayLabels } from '../lib/datetime'
import { useLocale } from '../lib/i18n'
import type { FamilyMember, TriboEvent } from '../lib/api'
import { useChoresTodos } from '../lib/hooks'
import AppShell from '../components/AppShell'
import { CalendarHeader } from '../components/chrome'
import Card from '../components/Card'
import EventChip from '../components/EventChip'
import PersonAvatar from '../components/PersonAvatar'
import { ChoresPanel, TodosPanel } from '../components/panels'

interface Placed { ev: TriboEvent; time?: string }

function useWeekData(events: TriboEvent[], members: FamilyMember[], monday: Date, locale: string) {
  return useMemo(() => {
    const byDay = groupByDay(events)
    const perMember = new Map<string, Placed[][]>()
    members.forEach((m) => perMember.set(m.id, Array.from({ length: 7 }, () => [])))
    const shared: Placed[][] = Array.from({ length: 7 }, () => [])

    for (let di = 0; di < 7; di++) {
      const day = addDays(monday, di)
      const dayEvents = byDay.get(`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`) ?? []
      for (const ev of dayEvents) {
        const placed: Placed = { ev, time: ev.allDay ? undefined : fmtTime(new Date(ev.startAt), locale) }
        if (ev.isShared || ev.attendeeIds.length === 0) shared[di].push(placed)
        else ev.attendeeIds.forEach((mid) => perMember.get(mid)?.[di].push(placed))
      }
    }
    return { perMember, shared }
  }, [events, members, monday, locale])
}

export default function WeekView({ members, events, cursor, today, header, workSchedules, onNavigate, onAddEvent, onEditEvent }: ViewProps) {
  const locale = useLocale()
  const weekdays = useMemo(() => weekdayLabels(locale, 'short'), [locale])
  const monday = useMemo(() => mondayOf(cursor), [cursor])
  const { perMember, shared } = useWeekData(events, members, monday, locale)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  // (memberId, weekdayIndex) → true if a visible work schedule is active.
  const busyAt = (memberID: string, di: number) =>
    workSchedules.some((ws) => ws.memberId === memberID && ws.showOnCalendar && ws.daysOfWeek[di] === '1')
  const sharedCount = shared.reduce((n, day) => n + day.length, 0)

  return (
    <AppShell active="calendar" onNavigate={onNavigate} onFabClick={onAddEvent} header={<CalendarHeader controls={header} />} aside={<ThisWeekPanel members={members} />}>
      {/* Tablet/desktop grid — fills the main island */}
      <div className="hidden lg:flex lg:flex-col lg:flex-1 lg:min-h-0">
        <WeekGrid days={days} weekdays={weekdays} members={members} perMember={perMember} shared={shared} today={today} busyAt={busyAt} sharedCount={sharedCount} onEditEvent={onEditEvent} />
      </div>

      {/* Phone agenda */}
      <div className="lg:hidden space-y-2">
        {days.map((d, di) => (
          <AgendaDay key={di} day={d} di={di} weekday={weekdays[di]} members={members} perMember={perMember} shared={shared} today={today} onEditEvent={onEditEvent} />
        ))}
      </div>
    </AppShell>
  )
}

function WeekGrid({ days, weekdays, members, perMember, shared, today, busyAt, sharedCount, onEditEvent }: {
  days: Date[]
  weekdays: string[]
  members: FamilyMember[]
  perMember: Map<string, Placed[][]>
  shared: Placed[][]
  today: Date
  busyAt: (memberID: string, di: number) => boolean
  sharedCount: number
  onEditEvent: (e: TriboEvent) => void
}) {
  const { t } = useTranslation()
  const line = '1px solid var(--t-line)'
  // Subtle table polish: a stronger divider under the header row, a faint wash
  // on the label column, and a faint wash on weekend columns.
  const headLine = '2px solid color-mix(in oklab, var(--t-text-soft) 22%, var(--t-line))'
  const labelWash = 'color-mix(in oklab, var(--t-text-soft) 4%, transparent)'
  const weekendWash = 'color-mix(in oklab, var(--t-text-soft) 4%, transparent)'
  const cellBg = (d: Date, di: number) =>
    sameDay(d, today) ? 'var(--t-today-wash)' : (di >= 5 ? weekendWash : 'transparent')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '158px repeat(7, 1fr)', gridTemplateRows: 'auto', gridAutoRows: 'minmax(104px, 1fr)', height: '100%' }}>
      {/* corner */}
      <div style={{ padding: '18px 18px 14px', borderBottom: headLine, backgroundColor: labelWash }}>
        <div className="t-eyebrow">{t('calendar.thisWeek')}</div>
        <div style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 21, marginTop: 3 }}>{t('calendar.sharedPlans', { count: sharedCount })}</div>
      </div>
      {days.map((d, i) => {
        const isToday = sameDay(d, today)
        return (
          <div key={i} className="text-center" style={{ padding: '16px 6px 12px', borderBottom: headLine, borderLeft: line, backgroundColor: cellBg(d, i) }}>
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: isToday ? 'var(--t-brand)' : 'var(--t-text-soft)' }}>{weekdays[i]}</div>
            <div className="font-display mt-1.5 mx-auto inline-flex items-center justify-center"
              style={{ fontSize: 24, width: 42, height: 42, borderRadius: '50%', ...(isToday ? { background: 'var(--t-brand)', color: 'var(--t-on-brand)' } : null) }}>{d.getDate()}</div>
          </div>
        )
      })}

      {members.map((person) => {
        const grid = perMember.get(person.id) ?? []
        return (
          <div key={person.id} style={{ display: 'contents' }}>
            <div className="flex items-center gap-3" style={{ padding: '16px 18px', borderBottom: line, backgroundColor: labelWash }}>
              <PersonAvatar name={person.name} color={person.color} size={38} />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{person.name}</div>
                <div className="text-xs truncate capitalize" style={{ color: 'var(--t-text-soft)' }}>{person.role}</div>
              </div>
            </div>
            {days.map((d, di) => (
              <div key={di} className="flex flex-col gap-1.5" style={{ padding: '10px 8px', borderBottom: line, borderLeft: line, backgroundColor: cellBg(d, di), minHeight: 104 }}>
                {(grid[di] ?? []).map((p) => <EventChip key={p.ev.id} title={p.ev.title} color={person.color} time={p.time} icon={p.ev.icon} conflict={p.ev.conflictStatus === 'needs_guardian'} onClick={() => onEditEvent(p.ev)} />)}
                {busyAt(person.id, di) && <div style={{ fontSize: '10.5px', fontWeight: 600, fontStyle: 'italic', color: 'var(--t-text-soft)', opacity: 0.55 }}>{t('calendar.busy')}</div>}
              </div>
            ))}
          </div>
        )
      })}

      {/* shared row */}
      <div className="flex items-center gap-3" style={{ padding: '16px 18px', backgroundColor: labelWash }}>
        <PersonAvatar color={SHARED_COLOR} family size={38} />
        <div className="text-sm font-semibold">{t('common.family')}</div>
      </div>
      {days.map((d, di) => (
        <div key={di} className="flex flex-col gap-1.5" style={{ padding: '10px 8px', borderLeft: line, backgroundColor: cellBg(d, di), minHeight: 104 }}>
          {(shared[di] ?? []).map((p) => <EventChip key={p.ev.id} title={p.ev.title} color={SHARED_COLOR} time={p.time} icon={p.ev.icon} allday={p.ev.allDay} onClick={() => onEditEvent(p.ev)} />)}
        </div>
      ))}
    </div>
  )
}

function AgendaDay({ day, di, weekday, members, perMember, shared, today, onEditEvent }: {
  day: Date
  di: number
  weekday: string
  members: FamilyMember[]
  perMember: Map<string, Placed[][]>
  shared: Placed[][]
  today: Date
  onEditEvent: (e: TriboEvent) => void
}) {
  const { t } = useTranslation()
  const isToday = sameDay(day, today)
  const items: { ev: TriboEvent; time?: string; color: string; who: string }[] = []
  members.forEach((p) => (perMember.get(p.id)?.[di] ?? []).forEach((pl) => items.push({ ...pl, color: p.color, who: p.name })))
  ;(shared[di] ?? []).forEach((pl) => items.push({ ...pl, color: SHARED_COLOR, who: t('common.family') }))
  items.sort((a, b) => +new Date(a.ev.startAt) - +new Date(b.ev.startAt))

  return (
    <Card padded={false} className="p-3" style={isToday ? { backgroundColor: 'var(--t-today-wash)' } : undefined}>
      <div className="flex items-center gap-2 mb-2">
        <div className="font-display text-sm font-bold inline-flex items-center justify-center shrink-0" style={{ width: 26, height: 26, borderRadius: '50%', ...(isToday ? { backgroundColor: 'var(--t-brand)', color: 'var(--t-on-brand)' } : null) }}>{day.getDate()}</div>
        <div className="text-sm font-semibold uppercase" style={{ color: isToday ? 'var(--t-brand)' : 'var(--t-text-soft)' }}>{weekday}{isToday ? ` · ${t('common.today')}` : ''}</div>
      </div>
      {items.length === 0 ? (
        <div className="text-sm pl-1" style={{ color: 'var(--t-text-soft)' }}>{t('calendar.nothingScheduled')}</div>
      ) : (
        <div className="space-y-1.5">
          {items.map(({ ev, time, color, who }) => (
            <div key={ev.id} className="flex items-center gap-2 cursor-pointer" onClick={() => onEditEvent(ev)}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
              {time && <span className="text-xs w-16 shrink-0" style={{ color: 'var(--t-text-soft)' }}>{time}</span>}
              <span className="text-sm truncate flex-1">{ev.title}</span>
              <span className="text-xs shrink-0" style={{ color: 'var(--t-text-soft)' }}>{who}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// This-week aside: live chores + to-dos as two free-floating Salvia cards.
function ThisWeekPanel({ members }: { members: FamilyMember[] }) {
  const { t } = useTranslation()
  const { instances, todos, toggleChore, toggleTodo, addTodo } = useChoresTodos()
  const done = instances.filter((i) => i.status === 'done').length
  const pct = instances.length ? Math.round((done / instances.length) * 100) : 0
  return (
    <>
      <Card>
        <div style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 23, marginBottom: 2 }}>{t('calendar.thisWeek')}</div>
        <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('calendar.choresDone', { done, total: instances.length })}</div>
        <div className="h-2 rounded-full mt-3 mb-4" style={{ backgroundColor: 'var(--t-track)' }}>
          <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: 'var(--t-brand)' }} />
        </div>
        <ChoresPanel instances={instances} members={members} onToggle={toggleChore} />
      </Card>
      <Card>
        <div style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 23, marginBottom: 12 }}>{t('nav.todos')}</div>
        <TodosPanel todos={todos} onToggle={toggleTodo} onAdd={addTodo} />
      </Card>
    </>
  )
}
