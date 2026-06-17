import { useMemo } from 'react'
import { Cake } from 'lucide-react'
import {
  buildMonthCells, colorForEvent, groupByDay, membersById, sameDay, dayKey,
  MONTHS_FULL, MONTHS_SHORT, WEEKDAY_INITIALS, type ViewProps,
} from '../lib/calendar'
import type { FamilyMember, TriboEvent } from '../lib/api'
import AppShell from '../components/AppShell'
import { CalendarHeader } from '../components/chrome'
import Card from '../components/Card'

function uniqueColors(events: TriboEvent[], byId: Map<string, FamilyMember>, cap: number): string[] {
  const out: string[] = []
  for (const ev of events) {
    const c = colorForEvent(ev, byId)
    if (!out.includes(c)) out.push(c)
    if (out.length >= cap) break
  }
  return out
}

export default function QuarterView({ members, events, cursor, today, header, onNavigate, onAddEvent }: ViewProps) {
  const year = cursor.getFullYear()
  const qStart = Math.floor(cursor.getMonth() / 3) * 3
  const months = [qStart, qStart + 1, qStart + 2]
  const byId = useMemo(() => membersById(members), [members])
  const byDay = useMemo(() => groupByDay(events), [events])

  return (
    <AppShell active="calendar" onNavigate={onNavigate} onFabClick={onAddEvent} header={<CalendarHeader controls={header} />}>
      <div className="p-4 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4">
          {months.map((m) => <MiniMonth key={m} year={year} month={m} byDay={byDay} byId={byId} today={today} />)}
        </div>

        <div className="mt-4 lg:mt-6">
          <div className="font-display text-lg font-bold mb-3">This quarter</div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            {months.map((m) => <MonthHighlightList key={m} year={year} month={m} events={events} byId={byId} />)}
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function MiniMonth({ year, month, byDay, byId, today }: {
  year: number
  month: number
  byDay: Map<string, TriboEvent[]>
  byId: Map<string, FamilyMember>
  today: Date
}) {
  const cells = buildMonthCells(year, month, 42)
  const line = '1px solid var(--t-line)'
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="font-display text-base font-bold px-3 py-2" style={{ borderBottom: line }}>{MONTHS_FULL[month]}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {WEEKDAY_INITIALS.map((d, i) => (
          <div key={i} className="text-center text-xs font-semibold uppercase py-1" style={{ color: 'var(--t-text-soft)' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((cell, i) => {
          const dayEvents = cell.inMonth ? (byDay.get(dayKey(cell.dateObj)) ?? []) : []
          const milestones = dayEvents.filter((e) => e.visibilityTag === 'milestone')
          const dots = milestones.length ? uniqueColors(milestones, byId, 3) : uniqueColors(dayEvents, byId, 2)
          const isToday = sameDay(cell.dateObj, today) && cell.inMonth
          return (
            <div key={i} className="flex flex-col items-center justify-center" style={{ minHeight: 36, opacity: cell.inMonth ? 1 : 0.3 }}>
              <div className="font-display font-semibold inline-flex items-center justify-center" style={{ width: 20, height: 20, fontSize: '11px', borderRadius: '50%', ...(isToday ? { background: 'var(--t-brand)', color: 'var(--t-on-brand)' } : { color: 'var(--t-text)' }) }}>{cell.date}</div>
              <div className="flex gap-0.5 mt-0.5" style={{ height: 4 }}>
                {dots.map((c, j) => <span key={j} className="rounded-full flex-shrink-0" style={{ width: 4, height: 4, backgroundColor: c }} />)}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function MonthHighlightList({ year, month, events, byId }: {
  year: number
  month: number
  events: TriboEvent[]
  byId: Map<string, FamilyMember>
}) {
  const items = events
    .filter((e) => e.visibilityTag === 'milestone')
    .map((e) => ({ e, d: new Date(e.startAt) }))
    .filter(({ d }) => d.getFullYear() === year && d.getMonth() === month)
    .sort((a, b) => +a.d - +b.d)
  return (
    <div>
      <div className="text-xs font-semibold uppercase mb-1.5" style={{ color: 'var(--t-text-soft)' }}>{MONTHS_FULL[month]}</div>
      {items.length === 0 ? (
        <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>Nothing notable</div>
      ) : (
        <div className="space-y-1.5">
          {items.map(({ e, d }) => {
            const color = colorForEvent(e, byId)
            return (
              <div key={e.id} className="flex items-center gap-2 text-sm">
                {e.icon === 'cake'
                  ? <Cake size={14} style={{ color, flexShrink: 0 }} />
                  : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
                <span className="flex-1 truncate">{e.title}</span>
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--t-text-soft)' }}>{MONTHS_SHORT[month]} {d.getDate()}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
