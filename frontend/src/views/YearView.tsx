import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Cake } from 'lucide-react'
import {
  buildMonthCells, colorForEvent, groupByDay, membersById, sameDay, dayKey, eventDate,
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
  const { t } = useTranslation()
  const monthsLong = useMemo(() => monthLabels(locale, 'long'), [locale])

  // Year progress (only meaningful when viewing the current year).
  const startOfYear = new Date(year, 0, 1)
  const daysInYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365
  const dayOfYear = Math.floor((+today - +startOfYear) / 86400000) + 1
  const inThisYear = today.getFullYear() === year
  const progress = inThisYear ? Math.max(0, Math.min(100, Math.round((dayOfYear / daysInYear) * 100))) : 0

  const highlights = useMemo(() => events
    .filter((e) => e.visibilityTag === 'milestone' && eventDate(e).getFullYear() === year)
    .map((e) => ({ e, d: eventDate(e) }))
    .sort((a, b) => +a.d - +b.d), [events, year])

  // Overview widget (right column): this year's milestones.
  const aside = (
    <Card>
      <div style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 20, marginBottom: 10 }} className="flex items-center gap-2"><Cake size={16} /> {t('calendar.thisYear')}</div>
      {highlights.length === 0 ? (
        <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('calendar.nothingNotable')}</div>
      ) : (
        <div className="space-y-2">
          {highlights.map(({ e, d }) => (
            <div key={e.id} className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorForEvent(e, byId) }} />
              <span className="flex-1 truncate">{e.title}</span>
              <span className="text-xs shrink-0" style={{ color: 'var(--t-text-soft)' }}>{fmtMonthDay(d, locale)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )

  return (
    <AppShell active="calendar" onNavigate={onNavigate} onFabClick={onAddEvent} header={<CalendarHeader controls={header} />} aside={aside}>
      <div className="p-4 lg:p-6 flex flex-col lg:h-full">
        {/* Year progress (stays on top) */}
        <div className="mb-4 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="font-display text-lg font-bold">{year}</div>
            {inThisYear && <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('calendar.dayOfYear', { day: dayOfYear, total: daysInYear, pct: progress })}</div>}
          </div>
          <div className="h-1.5 rounded-full" style={{ backgroundColor: 'var(--t-track)' }}>
            <div className="h-1.5 rounded-full" style={{ width: `${progress}%`, backgroundColor: 'var(--t-brand)' }} />
          </div>
        </div>

        {/* 12 month panels — stretched to fill the island (3×4) on desktop. */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 lg:gap-3 lg:flex-1 lg:min-h-0 lg:grid-rows-4">
          {Array.from({ length: 12 }, (_, m) => <YearMonth key={m} monthName={monthsLong[m]} year={year} month={m} byDay={byDay} byId={byId} today={today} />)}
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
  // Bespoke card (not <Card>) so the day grid can flex-fill to the bottom.
  return (
    <div
      className="overflow-hidden flex flex-col lg:h-full"
      style={{ background: 'var(--t-shell)', border: line, borderRadius: 'var(--t-radius-lg)', boxShadow: 'var(--t-shadow)' }}
    >
      <div className="font-display text-sm font-bold px-2.5 py-2 shrink-0" style={{ borderBottom: line }}>{monthName}</div>
      <div
        className="grid flex-1 min-h-0"
        style={{ gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: 'minmax(0, 1fr)' }}
      >
        {cells.map((cell, i) => {
          // Year view: a corner dot ONLY for milestone days.
          const milestone = cell.inMonth ? (byDay.get(dayKey(cell.dateObj)) ?? []).find((e) => e.visibilityTag === 'milestone') : undefined
          const isToday = sameDay(cell.dateObj, today) && cell.inMonth
          return (
            <div key={i} className="relative flex items-center justify-center min-h-[22px]" style={{ opacity: cell.inMonth ? 1 : 0.25 }}>
              <div
                className="font-display font-semibold inline-flex items-center justify-center rounded-full w-4 h-4 text-[9px] lg:w-5 lg:h-5 lg:text-xs"
                style={isToday ? { background: 'var(--t-brand)', color: 'var(--t-on-brand)' } : { color: 'var(--t-text)' }}
              >{cell.date}</div>
              {milestone && (
                <span className="absolute rounded-full" style={{ bottom: 3, width: 4, height: 4, backgroundColor: colorForEvent(milestone, byId) }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
