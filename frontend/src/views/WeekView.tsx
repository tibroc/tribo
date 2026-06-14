import { useMemo } from 'react'
import { Users } from 'lucide-react'
import { palette, SHARED_COLOR } from '../lib/tokens'
import {
  addDays, mondayOf, sameDay, fmtTime, groupByDay, WEEKDAY_LABELS, type ViewProps,
} from '../lib/calendar'
import type { FamilyMember, TriboEvent } from '../lib/api'
import { useChoresTodos } from '../lib/hooks'
import AppShell from '../components/AppShell'
import { CalendarHeader } from '../components/chrome'
import Card from '../components/Card'
import EventChip from '../components/EventChip'
import PersonAvatar from '../components/PersonAvatar'
import { ChoresPanel, TodosPanel } from '../components/panels'

interface Placed { ev: TriboEvent; time?: string }

function useWeekData(events: TriboEvent[], members: FamilyMember[], monday: Date) {
  return useMemo(() => {
    const byDay = groupByDay(events)
    const perMember = new Map<string, Placed[][]>()
    members.forEach((m) => perMember.set(m.id, Array.from({ length: 7 }, () => [])))
    const shared: Placed[][] = Array.from({ length: 7 }, () => [])

    for (let di = 0; di < 7; di++) {
      const day = addDays(monday, di)
      const dayEvents = byDay.get(`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`) ?? []
      for (const ev of dayEvents) {
        const placed: Placed = { ev, time: ev.allDay ? undefined : fmtTime(new Date(ev.startAt)) }
        if (ev.isShared || ev.attendeeIds.length === 0) shared[di].push(placed)
        else ev.attendeeIds.forEach((mid) => perMember.get(mid)?.[di].push(placed))
      }
    }
    return { perMember, shared }
  }, [events, members, monday])
}

export default function WeekView({ members, events, cursor, today, header, onNavigate, onAddEvent, onEditEvent }: ViewProps) {
  const monday = useMemo(() => mondayOf(cursor), [cursor])
  const { perMember, shared } = useWeekData(events, members, monday)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  return (
    <AppShell active="calendar" onNavigate={onNavigate} onFabClick={onAddEvent} header={<CalendarHeader controls={header} />} aside={<ThisWeekPanel members={members} />}>
      {/* Tablet/desktop grid */}
      <Card className="hidden lg:block overflow-hidden">
        <WeekGrid days={days} members={members} perMember={perMember} shared={shared} today={today} onEditEvent={onEditEvent} />
      </Card>

      {/* Phone agenda */}
      <div className="lg:hidden space-y-2">
        {days.map((d, di) => (
          <AgendaDay key={di} day={d} di={di} members={members} perMember={perMember} shared={shared} today={today} onEditEvent={onEditEvent} />
        ))}
      </div>
    </AppShell>
  )
}

function WeekGrid({ days, members, perMember, shared, today, onEditEvent }: {
  days: Date[]
  members: FamilyMember[]
  perMember: Map<string, Placed[][]>
  shared: Placed[][]
  today: Date
  onEditEvent: (e: TriboEvent) => void
}) {
  const cellBase = { padding: '8px' }
  const line = `1px solid ${palette.line}`

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(7, 1fr)' }}>
      <div style={{ ...cellBase, borderBottom: line, borderRight: line }} />
      {days.map((d, i) => {
        const isToday = sameDay(d, today)
        return (
          <div key={i} className="text-center" style={{ ...cellBase, borderBottom: line, borderRight: i < 6 ? line : 'none', backgroundColor: isToday ? palette.brandSoft : 'transparent' }}>
            <div className="text-xs font-semibold uppercase" style={{ color: palette.inkSoft }}>{WEEKDAY_LABELS[i]}</div>
            <div className="font-display text-lg font-bold mt-1 inline-flex items-center justify-center" style={isToday ? { backgroundColor: palette.brand, color: '#fff', width: 28, height: 28, borderRadius: '50%' } : { width: 28, height: 28 }}>{d.getDate()}</div>
          </div>
        )
      })}

      {members.map((person) => {
        const grid = perMember.get(person.id) ?? []
        return (
          <div key={person.id} style={{ display: 'contents' }}>
            <div className="flex items-center gap-2" style={{ ...cellBase, borderBottom: line, borderRight: line }}>
              <PersonAvatar name={person.name} color={person.color} />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{person.name}</div>
                <div className="text-xs truncate capitalize" style={{ color: palette.inkSoft }}>{person.role}</div>
              </div>
            </div>
            {days.map((d, di) => (
              <div key={di} style={{ ...cellBase, borderBottom: line, borderRight: di < 6 ? line : 'none', backgroundColor: sameDay(d, today) ? palette.brandSoft : 'transparent', minHeight: 64 }}>
                {(grid[di] ?? []).map((p) => <EventChip key={p.ev.id} title={p.ev.title} color={person.color} time={p.time} icon={p.ev.icon} conflict={p.ev.conflictStatus === 'needs_guardian'} onClick={() => onEditEvent(p.ev)} />)}
              </div>
            ))}
          </div>
        )
      })}

      {/* shared row */}
      <div className="flex items-center gap-2" style={{ ...cellBase, borderTop: line, borderRight: line }}>
        <PersonAvatar color={SHARED_COLOR} icon={Users} />
        <div className="text-sm font-semibold">Family</div>
      </div>
      {days.map((d, di) => (
        <div key={di} style={{ ...cellBase, borderTop: line, borderRight: di < 6 ? line : 'none', backgroundColor: sameDay(d, today) ? palette.brandSoft : 'transparent', minHeight: 56 }}>
          {(shared[di] ?? []).map((p) => <EventChip key={p.ev.id} title={p.ev.title} color={SHARED_COLOR} time={p.time} icon={p.ev.icon} onClick={() => onEditEvent(p.ev)} />)}
        </div>
      ))}
    </div>
  )
}

function AgendaDay({ day, di, members, perMember, shared, today, onEditEvent }: {
  day: Date
  di: number
  members: FamilyMember[]
  perMember: Map<string, Placed[][]>
  shared: Placed[][]
  today: Date
  onEditEvent: (e: TriboEvent) => void
}) {
  const isToday = sameDay(day, today)
  const items: { ev: TriboEvent; time?: string; color: string; who: string }[] = []
  members.forEach((p) => (perMember.get(p.id)?.[di] ?? []).forEach((pl) => items.push({ ...pl, color: p.color, who: p.name })))
  ;(shared[di] ?? []).forEach((pl) => items.push({ ...pl, color: SHARED_COLOR, who: 'Family' }))
  items.sort((a, b) => +new Date(a.ev.startAt) - +new Date(b.ev.startAt))

  return (
    <Card className="p-3" tint={isToday ? palette.brandSoft : undefined}>
      <div className="flex items-center gap-2 mb-2">
        <div className="font-display text-sm font-bold inline-flex items-center justify-center flex-shrink-0" style={isToday ? { backgroundColor: palette.brand, color: '#fff', width: 26, height: 26, borderRadius: '50%' } : { width: 26, height: 26 }}>{day.getDate()}</div>
        <div className="text-sm font-semibold uppercase" style={{ color: palette.inkSoft }}>{WEEKDAY_LABELS[di]}{isToday ? ' · Today' : ''}</div>
      </div>
      {items.length === 0 ? (
        <div className="text-sm pl-1" style={{ color: palette.inkSoft }}>Nothing scheduled</div>
      ) : (
        <div className="space-y-1.5">
          {items.map(({ ev, time, color, who }) => (
            <div key={ev.id} className="flex items-center gap-2 cursor-pointer" onClick={() => onEditEvent(ev)}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              {time && <span className="text-xs w-16 flex-shrink-0" style={{ color: palette.inkSoft }}>{time}</span>}
              <span className="text-sm truncate flex-1">{ev.title}</span>
              <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{who}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// This-week panel: live chores + to-dos with a completion progress bar.
function ThisWeekPanel({ members }: { members: FamilyMember[] }) {
  const { instances, todos, toggleChore, toggleTodo, addTodo } = useChoresTodos()
  const done = instances.filter((i) => i.status === 'done').length
  const pct = instances.length ? Math.round((done / instances.length) * 100) : 0
  return (
    <div className="space-y-5">
      <div>
        <div className="font-display text-lg font-bold mb-1">This week</div>
        <div className="text-sm" style={{ color: palette.inkSoft }}>{done}/{instances.length} chores done</div>
        <div className="h-1.5 rounded-full mt-2" style={{ backgroundColor: palette.line }}>
          <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: palette.brand }} />
        </div>
      </div>
      <ChoresPanel instances={instances} members={members} onToggle={toggleChore} />
      <TodosPanel todos={todos} onToggle={toggleTodo} onAdd={addTodo} />
    </div>
  )
}
