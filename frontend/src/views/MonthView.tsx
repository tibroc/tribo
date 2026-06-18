import { useEffect, useMemo, useState } from 'react'
import { Cake } from 'lucide-react'
import { palette } from '../lib/tokens'
import {
  buildMonthCells, colorForEvent, fmtTime, groupByDay, membersById, sameDay,
  dayKey, MONTHS_SHORT, WEEKDAY_LABELS, FULL_WEEKDAY, type ViewProps, type MonthCell,
} from '../lib/calendar'
import type { FamilyMember, TriboEvent } from '../lib/api'
import AppShell from '../components/AppShell'
import { CalendarHeader } from '../components/chrome'
import Card from '../components/Card'
import EventChip from '../components/EventChip'

// Shared-first, then personal — matches the prototype's ordering in cells/agenda.
function ordered(events: TriboEvent[]): TriboEvent[] {
  return [...events.filter((e) => e.isShared || e.attendeeIds.length === 0), ...events.filter((e) => !(e.isShared || e.attendeeIds.length === 0))]
}

export default function MonthView({ members, events, cursor, today, header, onNavigate, onAddEvent, onEditEvent }: ViewProps) {
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const byId = useMemo(() => membersById(members), [members])
  const byDay = useMemo(() => groupByDay(events), [events])

  const cells = useMemo(() => {
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const total = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
    return buildMonthCells(year, month, total)
  }, [year, month])

  // Selected day defaults to today (if in this month) else the 1st; resets on month change.
  const [selected, setSelected] = useState<Date>(() => (today.getMonth() === month && today.getFullYear() === year ? today : new Date(year, month, 1)))
  useEffect(() => {
    setSelected(today.getMonth() === month && today.getFullYear() === year ? today : new Date(year, month, 1))
  }, [year, month, today])

  return (
    <AppShell
      active="calendar"
      onNavigate={onNavigate}
      onFabClick={onAddEvent}
      header={<CalendarHeader controls={header} />}
      aside={
        <div className="space-y-5">
          <SelectedDayPanel date={selected} byDay={byDay} byId={byId} today={today} onEditEvent={onEditEvent} />
          <MonthHighlights events={events} byId={byId} />
        </div>
      }
    >
      <Card className="overflow-hidden">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="text-center text-xs font-semibold uppercase py-2" style={{ color: palette.inkSoft, borderBottom: `1px solid ${palette.line}` }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((cell, i) => {
            const isLastCol = i % 7 === 6
            const isLastRow = i >= cells.length - 7
            return (
              <div key={i} style={{ borderRight: isLastCol ? 'none' : `1px solid ${palette.line}`, borderBottom: isLastRow ? 'none' : `1px solid ${palette.line}` }}>
                <DayCell
                  cell={cell}
                  events={cell.inMonth ? ordered(byDay.get(dayKey(cell.dateObj)) ?? []) : []}
                  isToday={sameDay(cell.dateObj, today)}
                  isSelected={cell.inMonth && sameDay(cell.dateObj, selected)}
                  byId={byId}
                  onClick={() => cell.inMonth && setSelected(cell.dateObj)}
                />
              </div>
            )
          })}
        </div>
      </Card>
    </AppShell>
  )
}

function DayCell({ cell, events, isToday, isSelected, byId, onClick }: {
  cell: MonthCell
  events: TriboEvent[]
  isToday: boolean
  isSelected: boolean
  byId: Map<string, FamilyMember>
  onClick: () => void
}) {
  const extra = events.length - 2
  const uniqueColors: string[] = []
  events.forEach((ev) => {
    const c = colorForEvent(ev, byId)
    if (!uniqueColors.includes(c)) uniqueColors.push(c)
  })

  return (
    <button
      onClick={onClick}
      className="w-full h-full text-left p-1.5 flex flex-col border-0 outline-none min-h-[56px] lg:min-h-[96px]"
      style={{
        backgroundColor: isToday ? palette.brandSoft : 'transparent',
        boxShadow: isSelected ? `inset 0 0 0 2px ${palette.amber}` : 'none',
        opacity: cell.inMonth ? 1 : 0.4,
        cursor: cell.inMonth ? 'pointer' : 'default',
      }}
    >
      <div className="font-display text-sm font-semibold inline-flex items-center justify-center" style={isToday ? { backgroundColor: palette.brand, color: '#fff', width: 22, height: 22, borderRadius: '50%' } : { width: 22, height: 22, color: palette.ink }}>{cell.date}</div>

      {/* Tablet: up to 2 chips + "+N more" */}
      <div className="hidden lg:block mt-1 space-y-1">
        {events.slice(0, 2).map((ev) => <EventChip key={ev.id} dense title={ev.title} color={colorForEvent(ev, byId)} icon={ev.icon} />)}
        {extra > 0 && <div style={{ fontSize: '10px', color: palette.inkSoft }}>+{extra} more</div>}
      </div>

      {/* Phone: color dots */}
      <div className="lg:hidden mt-1 flex gap-0.5 flex-wrap">
        {uniqueColors.map((c, i) => <span key={i} className="rounded-full flex-shrink-0" style={{ width: 5, height: 5, backgroundColor: c }} />)}
      </div>
    </button>
  )
}

function SelectedDayPanel({ date, byDay, byId, today, onEditEvent }: {
  date: Date
  byDay: Map<string, TriboEvent[]>
  byId: Map<string, FamilyMember>
  today: Date
  onEditEvent: (e: TriboEvent) => void
}) {
  const events = ordered(byDay.get(dayKey(date)) ?? [])
  const isToday = sameDay(date, today)
  const weekday = FULL_WEEKDAY[(date.getDay() + 6) % 7]

  return (
    <Card className="p-3" tint={isToday ? palette.brandSoft : undefined}>
      <div className="flex items-center gap-2 mb-2">
        <div className="font-display text-sm font-bold inline-flex items-center justify-center flex-shrink-0" style={isToday ? { backgroundColor: palette.brand, color: '#fff', width: 26, height: 26, borderRadius: '50%' } : { width: 26, height: 26 }}>{date.getDate()}</div>
        <div className="text-sm font-semibold uppercase" style={{ color: palette.inkSoft }}>{weekday}, {MONTHS_SHORT[date.getMonth()]} {date.getDate()}{isToday ? ' · Today' : ''}</div>
      </div>
      {events.length === 0 ? (
        <div className="text-sm pl-1" style={{ color: palette.inkSoft }}>Nothing scheduled</div>
      ) : (
        <div className="space-y-1.5">
          {events.map((ev) => {
            const color = colorForEvent(ev, byId)
            const who = ev.isShared || ev.attendeeIds.length === 0 ? 'Family' : (byId.get(ev.attendeeIds[0])?.name ?? '')
            return (
              <div key={ev.id} className="flex items-center gap-2 cursor-pointer" onClick={() => onEditEvent(ev)}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                {!ev.allDay && <span className="text-xs w-20 flex-shrink-0" style={{ color: palette.inkSoft }}>{fmtTime(new Date(ev.startAt))}</span>}
                <span className="text-sm truncate flex-1 flex items-center gap-1">{ev.icon === 'cake' && <Cake size={12} />}{ev.title}</span>
                <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{who}</span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function MonthHighlights({ events, byId }: { events: TriboEvent[]; byId: Map<string, FamilyMember> }) {
  const highlights = events
    .filter((e) => e.visibilityTag === 'milestone')
    .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt))
  return (
    <div>
      <div className="font-display text-base font-bold mb-2 flex items-center gap-2"><Cake size={16} /> This month</div>
      {highlights.length === 0 ? (
        <div className="text-sm" style={{ color: palette.inkSoft }}>Nothing notable</div>
      ) : (
        <div className="space-y-2">
          {highlights.map((h) => {
            const d = new Date(h.startAt)
            return (
              <div key={h.id} className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colorForEvent(h, byId) }} />
                <span className="flex-1 truncate">{h.title}</span>
                <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{MONTHS_SHORT[d.getMonth()]} {d.getDate()}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
