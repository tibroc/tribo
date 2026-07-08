import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cake } from 'lucide-react'
import {
  buildMonthCells, colorForEvent, groupByDay, membersById, sameDay,
  dayKey, eventDate, eventDisplayTitle, type ViewProps, type MonthCell,
} from '../lib/calendar'
import { fmtTime, fmtMonthDay, fmtWeekdayLongDay, weekdayLabels } from '../lib/datetime'
import { useLocale } from '../lib/i18n'
import type { FamilyMember, TriboEvent } from '../lib/api'
import AppShell from '../components/AppShell'
import { CalendarHeader } from '../components/chrome'
import Card from '../components/Card'
import EventChip, { ConflictGlyph } from '../components/EventChip'

// Shared-first, then personal — matches the prototype's ordering in cells/agenda.
function ordered(events: TriboEvent[]): TriboEvent[] {
  return [...events.filter((e) => e.isShared || e.attendeeIds.length === 0), ...events.filter((e) => !(e.isShared || e.attendeeIds.length === 0))]
}

export default function MonthView({ members, events, cursor, today, header, onNavigate, onAddEvent, onEditEvent }: ViewProps) {
  const locale = useLocale()
  const weekdays = useMemo(() => weekdayLabels(locale, 'short'), [locale])
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
        <>
          <SelectedDayPanel date={selected} byDay={byDay} byId={byId} today={today} onEditEvent={onEditEvent} locale={locale} />
          <MonthHighlights events={events} byId={byId} locale={locale} />
        </>
      }
    >
      <div className="hidden lg:flex flex-col h-full">
        <div className="shrink-0" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {weekdays.map((d, i) => (
            <div key={i} className="text-xs font-bold uppercase tracking-wider px-3.5 py-3"
              style={{ color: 'var(--t-text-soft)', borderBottom: '2px solid color-mix(in oklab, var(--t-text-soft) 22%, var(--t-line))', borderLeft: i === 0 ? 'none' : '1px solid var(--t-line)', backgroundColor: i >= 5 ? 'color-mix(in oklab, var(--t-text-soft) 4%, transparent)' : 'transparent' }}>{d}</div>
          ))}
        </div>
        <div className="flex-1 min-h-0" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: 'minmax(0, 1fr)' }}>
          {cells.map((cell, i) => {
            const isLastCol = i % 7 === 6
            const isLastRow = i >= cells.length - 7
            return (
              <div key={i} className="flex" style={{ borderRight: isLastCol ? 'none' : '1px solid var(--t-line)', borderBottom: isLastRow ? 'none' : '1px solid var(--t-line)' }}>
                <DayCell
                  cell={cell}
                  events={cell.inMonth ? ordered(byDay.get(dayKey(cell.dateObj)) ?? []) : []}
                  isToday={sameDay(cell.dateObj, today)}
                  isSelected={cell.inMonth && sameDay(cell.dateObj, selected)}
                  isWeekend={i % 7 >= 5}
                  byId={byId}
                  onClick={() => cell.inMonth && setSelected(cell.dateObj)}
                  onEditEvent={onEditEvent}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Phone: simple month grid */}
      <div className="lg:hidden grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((cell, i) => {
          const isLastCol = i % 7 === 6
          const isLastRow = i >= cells.length - 7
          return (
            <div key={i} style={{ borderRight: isLastCol ? 'none' : '1px solid var(--t-line)', borderBottom: isLastRow ? 'none' : '1px solid var(--t-line)' }}>
              <DayCell
                cell={cell}
                events={cell.inMonth ? ordered(byDay.get(dayKey(cell.dateObj)) ?? []) : []}
                isToday={sameDay(cell.dateObj, today)}
                isSelected={cell.inMonth && sameDay(cell.dateObj, selected)}
                isWeekend={i % 7 >= 5}
                byId={byId}
                onClick={() => cell.inMonth && setSelected(cell.dateObj)}
                onEditEvent={onEditEvent}
              />
            </div>
          )
        })}
      </div>
    </AppShell>
  )
}

function DayCell({ cell, events, isToday, isSelected, isWeekend, byId, onClick, onEditEvent }: {
  cell: MonthCell
  events: TriboEvent[]
  isToday: boolean
  isSelected: boolean
  isWeekend?: boolean
  byId: Map<string, FamilyMember>
  onClick: () => void
  onEditEvent: (e: TriboEvent) => void
}) {
  const { t } = useTranslation()
  const extra = events.length - 2
  const uniqueColors: string[] = []
  events.forEach((ev) => {
    const c = colorForEvent(ev, byId)
    if (!uniqueColors.includes(c)) uniqueColors.push(c)
  })

  return (
    <button
      onClick={onClick}
      className="w-full h-full text-left p-2 flex flex-col gap-1 border-0 outline-hidden min-h-[56px] lg:min-h-[96px]"
      style={{
        backgroundColor: isToday ? 'var(--t-today-wash)' : (isWeekend ? 'color-mix(in oklab, var(--t-text-soft) 4%, transparent)' : 'transparent'),
        boxShadow: isSelected ? 'inset 0 0 0 2px var(--t-accent)' : 'none',
        opacity: cell.inMonth ? 1 : 0.35,
        cursor: cell.inMonth ? 'pointer' : 'default',
      }}
    >
      <div className="font-display inline-flex items-center justify-center" style={{ fontSize: 16, width: 28, height: 28, borderRadius: '50%', ...(isToday ? { background: 'var(--t-brand)', color: 'var(--t-on-brand)' } : { color: 'var(--t-text)' }) }}>{cell.date}</div>

      {/* Tablet: up to 2 chips + "+N more" */}
      <div className="hidden lg:block space-y-1">
        {events.slice(0, 2).map((ev) => <EventChip key={ev.id} dense title={eventDisplayTitle(ev, t)} color={colorForEvent(ev, byId)} icon={ev.icon} conflict={ev.conflictStatus === 'needs_guardian'} onClick={() => onEditEvent(ev)} />)}
        {extra > 0 && <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--t-text-soft)', paddingLeft: 3 }}>{t('calendar.moreCount', { count: extra })}</div>}
      </div>

      {/* Phone: color dots */}
      <div className="lg:hidden mt-1 flex gap-0.5 flex-wrap">
        {uniqueColors.map((c, i) => <span key={i} className="rounded-full shrink-0" style={{ width: 5, height: 5, backgroundColor: c }} />)}
      </div>
    </button>
  )
}

function SelectedDayPanel({ date, byDay, byId, today, onEditEvent, locale }: {
  date: Date
  byDay: Map<string, TriboEvent[]>
  byId: Map<string, FamilyMember>
  today: Date
  onEditEvent: (e: TriboEvent) => void
  locale: string
}) {
  const { t } = useTranslation()
  const events = ordered(byDay.get(dayKey(date)) ?? [])
  const isToday = sameDay(date, today)

  return (
    <Card padded={false} className="p-3" style={isToday ? { backgroundColor: 'var(--t-today-wash)' } : undefined}>
      <div className="flex items-center gap-2 mb-2">
        <div className="font-display text-sm font-bold inline-flex items-center justify-center shrink-0" style={{ width: 26, height: 26, borderRadius: '50%', ...(isToday ? { backgroundColor: 'var(--t-brand)', color: 'var(--t-on-brand)' } : null) }}>{date.getDate()}</div>
        <div className="text-sm font-semibold uppercase" style={{ color: isToday ? 'var(--t-brand)' : 'var(--t-text-soft)' }}>{fmtWeekdayLongDay(date, locale)}{isToday ? ` · ${t('common.today')}` : ''}</div>
      </div>
      {events.length === 0 ? (
        <div className="text-sm pl-1" style={{ color: 'var(--t-text-soft)' }}>{t('calendar.nothingScheduled')}</div>
      ) : (
        <div className="space-y-1.5">
          {events.map((ev) => {
            const color = colorForEvent(ev, byId)
            const who = ev.isShared || ev.attendeeIds.length === 0 ? t('common.family') : (byId.get(ev.attendeeIds[0])?.name ?? '')
            return (
              <div key={ev.id} className="flex items-center gap-2 cursor-pointer" onClick={() => onEditEvent(ev)}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {!ev.allDay && <span className="text-xs w-20 shrink-0" style={{ color: 'var(--t-text-soft)' }}>{fmtTime(new Date(ev.startAt), locale)}</span>}
                <span className="text-sm truncate flex-1 flex items-center gap-1">{ev.conflictStatus === 'needs_guardian' && <ConflictGlyph />}{ev.icon === 'cake' && <Cake size={12} />}{eventDisplayTitle(ev, t)}</span>
                <span className="text-xs shrink-0" style={{ color: 'var(--t-text-soft)' }}>{who}</span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function MonthHighlights({ events, byId, locale }: { events: TriboEvent[]; byId: Map<string, FamilyMember>; locale: string }) {
  const { t } = useTranslation()
  const highlights = events
    .filter((e) => e.visibilityTag === 'milestone')
    .sort((a, b) => +eventDate(a) - +eventDate(b))
  return (
    <Card>
      <div style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 20, marginBottom: 10 }} className="flex items-center gap-2"><Cake size={16} /> {t('calendar.thisMonth')}</div>
      {highlights.length === 0 ? (
        <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('calendar.nothingNotable')}</div>
      ) : (
        <div className="space-y-2">
          {highlights.map((h) => {
            const d = eventDate(h)
            return (
              <div key={h.id} className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorForEvent(h, byId) }} />
                <span className="flex-1 truncate">{eventDisplayTitle(h, t)}</span>
                <span className="text-xs shrink-0" style={{ color: 'var(--t-text-soft)' }}>{fmtMonthDay(d, locale)}</span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
