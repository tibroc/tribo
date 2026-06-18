import { useMemo } from 'react'
import { Cake } from 'lucide-react'
import {
  buildMonthCells, colorForEvent, groupByDay, membersById, sameDay, dayKey,
  type ViewProps,
} from '../lib/calendar'
import { fmtMonthDay, monthLabels } from '../lib/datetime'
import { useLocale } from '../lib/i18n'
import type { FamilyMember, TriboEvent } from '../lib/api'
import AppShell from '../components/AppShell'
import { CalendarHeader } from '../components/chrome'
import Card from '../components/Card'

export default function YearView({ members, events, cursor, today, header, onNavigate, onAddEvent }: ViewProps) {
  const year = cursor.getFullYear()
  const byId = useMemo(() => membersById(members), [members])
  const byDay = useMemo(() => groupByDay(events), [events])
  const locale = useLocale()
  const monthsShort = useMemo(() => monthLabels(locale, 'short'), [locale])

  // Year progress (only meaningful when viewing the current year).
  const startOfYear = new Date(year, 0, 1)
  const dayOfYear = Math.floor((+today - +startOfYear) / 86400000) + 1
  const inThisYear = today.getFullYear() === year
  const progress = inThisYear ? Math.max(0, Math.min(100, Math.round((dayOfYear / 365) * 100))) : 0

  const highlights = useMemo(() => events
    .filter((e) => e.visibilityTag === 'milestone' && new Date(e.startAt).getFullYear() === year)
    .map((e) => ({ e, d: new Date(e.startAt) }))
    .sort((a, b) => +a.d - +b.d), [events, year])

  return (
    <AppShell active="calendar" onNavigate={onNavigate} onFabClick={onAddEvent} header={<CalendarHeader controls={header} />}>
      <div className="p-4 lg:p-6">
      {/* Year progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <div className="font-display text-lg font-bold">{year}</div>
          {inThisYear && <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>Day {dayOfYear} of 365 · {progress}%</div>}
        </div>
        <div className="h-1.5 rounded-full" style={{ backgroundColor: 'var(--t-track)' }}>
          <div className="h-1.5 rounded-full" style={{ width: `${progress}%`, backgroundColor: 'var(--t-brand)' }} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 lg:gap-3">
        {Array.from({ length: 12 }, (_, m) => <YearMonth key={m} monthName={monthsShort[m]} year={year} month={m} byDay={byDay} byId={byId} today={today} />)}
      </div>

      <div className="mt-6">
        <div className="font-display text-lg font-bold mb-3">This year</div>
        {highlights.length === 0 ? (
          <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>Nothing notable</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1.5">
            {highlights.map(({ e, d }) => {
              const color = colorForEvent(e, byId)
              return (
                <div key={e.id} className="flex items-center gap-2 text-sm">
                  {e.icon === 'cake'
                    ? <Cake size={14} style={{ color, flexShrink: 0 }} />
                    : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
                  <span className="flex-1 truncate">{e.title}</span>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--t-text-soft)' }}>{fmtMonthDay(d, locale)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      </div>
    </AppShell>
  )
}

function YearMonth({ year, month, monthName, byDay, byId, today }: {
  year: number
  month: number
  monthName: string
  byDay: Map<string, TriboEvent[]>
  byId: Map<string, FamilyMember>
  today: Date
}) {
  const cells = buildMonthCells(year, month, 42)
  const line = '1px solid var(--t-line)'
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="font-display text-sm font-bold px-2 py-1.5" style={{ borderBottom: line }}>{monthName}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((cell, i) => {
          // Year view: dots ONLY for milestones.
          const milestone = cell.inMonth ? (byDay.get(dayKey(cell.dateObj)) ?? []).find((e) => e.visibilityTag === 'milestone') : undefined
          const isToday = sameDay(cell.dateObj, today) && cell.inMonth
          return (
            <div key={i} className="flex flex-col items-center justify-center" style={{ minHeight: 22, opacity: cell.inMonth ? 1 : 0.25 }}>
              <div className="font-display font-semibold inline-flex items-center justify-center" style={{ width: 16, height: 16, fontSize: '9px', borderRadius: '50%', ...(isToday ? { background: 'var(--t-brand)', color: 'var(--t-on-brand)' } : { color: 'var(--t-text)' }) }}>{cell.date}</div>
              <span className="rounded-full flex-shrink-0 mt-0.5" style={{ width: 3, height: 3, backgroundColor: milestone ? colorForEvent(milestone, byId) : 'transparent' }} />
            </div>
          )
        })}
      </div>
    </Card>
  )
}
