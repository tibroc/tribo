import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addDays, addMonths, mondayOf, startOfDay, startOfMonth, weekRangeLabel,
  FULL_WEEKDAY, MONTHS_FULL, MONTHS_SHORT, type ViewName, type HeaderControls, type ViewProps, type NavKey,
} from '../lib/calendar'
import { getCalendarSources, getEvents, getFamilyMembers, getWorkSchedules, type CalendarSource, type FamilyMember, type TriboEvent, type WorkSchedule } from '../lib/api'
import DayView from './DayView'
import WeekView from './WeekView'
import MonthView from './MonthView'
import QuarterView from './QuarterView'
import YearView from './YearView'
import EventForm from '../components/EventForm'

const VIEW_COMPONENTS: Record<ViewName, (p: ViewProps) => JSX.Element> = {
  Day: DayView,
  Week: WeekView,
  Month: MonthView,
  Quarter: QuarterView,
  Year: YearView,
}

// The fetch window + header label + nav step for the active view, given the cursor.
function periodFor(view: ViewName, cursor: Date): { start: Date; end: Date; label: string; step: (dir: -1 | 1) => Date } {
  const year = cursor.getFullYear()
  switch (view) {
    case 'Day': {
      const start = startOfDay(cursor)
      return {
        start,
        end: addDays(start, 1),
        label: `${FULL_WEEKDAY[(start.getDay() + 6) % 7]}, ${MONTHS_FULL[start.getMonth()]} ${start.getDate()}`,
        step: (dir) => addDays(cursor, dir),
      }
    }
    case 'Week': {
      const start = mondayOf(cursor)
      return { start, end: addDays(start, 7), label: weekRangeLabel(start), step: (dir) => addDays(cursor, 7 * dir) }
    }
    case 'Month': {
      const start = startOfMonth(cursor)
      return { start, end: addMonths(start, 1), label: `${MONTHS_FULL[start.getMonth()]} ${year}`, step: (dir) => addMonths(cursor, dir) }
    }
    case 'Quarter': {
      const qStart = Math.floor(cursor.getMonth() / 3) * 3
      const start = new Date(year, qStart, 1)
      const end = new Date(year, qStart + 3, 1)
      return { start, end, label: `${MONTHS_SHORT[qStart]} – ${MONTHS_SHORT[qStart + 2]} ${year}`, step: (dir) => addMonths(cursor, 3 * dir) }
    }
    case 'Year': {
      const start = new Date(year, 0, 1)
      return { start, end: new Date(year + 1, 0, 1), label: `${year}`, step: (dir) => new Date(year + dir, cursor.getMonth(), 1) }
    }
  }
}

export default function CalendarPage({ onNavigate }: { onNavigate: (k: NavKey) => void }) {
  const today = useMemo(() => new Date(), [])
  const [view, setView] = useState<ViewName>('Week')
  const [cursor, setCursor] = useState<Date>(() => new Date())

  const [members, setMembers] = useState<FamilyMember[]>([])
  const [events, setEvents] = useState<TriboEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sources, setSources] = useState<CalendarSource[]>([])
  const [workSchedules, setWorkSchedules] = useState<WorkSchedule[]>([])
  // Event form modal: undefined = closed; null = new event; event = edit.
  const [formEvent, setFormEvent] = useState<TriboEvent | null | undefined>(undefined)

  const period = useMemo(() => periodFor(view, cursor), [view, cursor])

  useEffect(() => {
    getFamilyMembers().then(setMembers).catch((e) => setError(String(e)))
    getCalendarSources().then(setSources).catch((e) => setError(String(e)))
    getWorkSchedules().then(setWorkSchedules).catch(() => {})
  }, [])

  const reloadEvents = useCallback(() => {
    getEvents(period.start, period.end).then(setEvents).catch((e) => setError(String(e)))
  }, [period.start, period.end])

  useEffect(reloadEvents, [reloadEvents])

  const header: HeaderControls = {
    view,
    onViewChange: setView,
    periodLabel: period.label,
    onPrev: () => setCursor((c) => periodFor(view, c).step(-1)),
    onNext: () => setCursor((c) => periodFor(view, c).step(1)),
    onToday: () => setCursor(new Date()),
  }

  const ActiveView = VIEW_COMPONENTS[view]

  // New events default to noon on the focused day (or today for zoomed-out views).
  const defaultDate = useMemo(() => {
    const base = view === 'Day' ? cursor : today
    const d = new Date(base)
    d.setHours(12, 0, 0, 0)
    return d
  }, [view, cursor, today])

  return (
    <>
      {error && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 rounded-xl px-3 py-2 text-sm shadow" style={{ backgroundColor: '#fde8e8', color: '#9b1c1c' }}>{error}</div>
      )}
      <ActiveView
        members={members} events={events} cursor={cursor} today={today} header={header}
        workSchedules={workSchedules}
        onNavigate={onNavigate}
        onAddEvent={() => setFormEvent(null)}
        onEditEvent={(e) => setFormEvent(e)}
      />
      {formEvent !== undefined && (
        <EventForm
          event={formEvent}
          members={members}
          sources={sources}
          defaultDate={defaultDate}
          onClose={() => setFormEvent(undefined)}
          onSaved={() => { setFormEvent(undefined); reloadEvents() }}
        />
      )}
    </>
  )
}
