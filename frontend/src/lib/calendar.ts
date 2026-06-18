// Shared calendar primitives: date math, labels, and event grouping/coloring
// used across all five calendar views.
import { SHARED_COLOR } from './tokens'
import type { FamilyMember, TriboEvent, WorkSchedule } from './api'

export type ViewName = 'Day' | 'Week' | 'Month' | 'Quarter' | 'Year'
export const VIEWS: ViewName[] = ['Day', 'Week', 'Month', 'Quarter', 'Year']

// Top-level navigation destinations. 'review' is reached from Home (not the rail);
// it highlights the Home nav item, matching the prototype.
export type Section = 'home' | 'calendar' | 'chores' | 'todos' | 'family' | 'review'
export type NavKey = 'home' | 'calendar' | 'chores' | 'todos' | 'family'

// Optional add-intent carried alongside a navigation: opens the target
// screen's add form on arrival (used by Home's quick-add chooser).
export type Intent = 'new-event' | 'new-chore' | 'new-todo' | 'open-event'

// A specific event to focus + open on arrival at the Calendar (used by the
// notification bell's deep-links). `date` is the event's start (RFC3339) so the
// calendar can jump to the right week before opening the event form.
export type EventFocus = { eventId: string; date: string }

// Locale-aware month/weekday labels + time/range formatting now live in
// ./datetime.ts (Intl-based, keyed off the active locale).

// Props the AppShell header needs; produced by CalendarPage, consumed by every view.
export interface HeaderControls {
  view: ViewName
  onViewChange: (v: ViewName) => void
  periodLabel: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

// Shared shape every calendar view receives from CalendarPage.
export interface ViewProps {
  members: FamilyMember[]
  events: TriboEvent[]
  cursor: Date // anchor date for the focused period
  today: Date
  header: HeaderControls
  workSchedules: WorkSchedule[]
  onNavigate: (k: NavKey) => void
  onAddEvent: () => void
  onEditEvent: (e: TriboEvent) => void
}

// ===== Date helpers =====
export function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}
export function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}
export function addMonths(d: Date, n: number): Date {
  const out = new Date(d)
  out.setMonth(out.getMonth() + n)
  return out
}
export function mondayOf(d: Date): Date {
  const out = startOfDay(d)
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7))
  return out
}
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

// ===== Color =====
export function membersById(members: FamilyMember[]): Map<string, FamilyMember> {
  return new Map(members.map((m) => [m.id, m]))
}

// The marker color for an event: explicit override, else first attendee's color,
// else the shared/gold color (family-wide or external).
export function colorForEvent(ev: TriboEvent, byId: Map<string, FamilyMember>): string {
  if (ev.colorOverride) return ev.colorOverride
  if (!ev.isShared && ev.attendeeIds.length > 0) {
    const m = byId.get(ev.attendeeIds[0])
    if (m) return m.color
  }
  return SHARED_COLOR
}

// ===== Grouping =====
// Map of dayKey → events starting that day, in start order.
export function groupByDay(events: TriboEvent[]): Map<string, TriboEvent[]> {
  const map = new Map<string, TriboEvent[]>()
  for (const ev of events) {
    const k = dayKey(new Date(ev.startAt))
    const arr = map.get(k)
    if (arr) arr.push(ev)
    else map.set(k, [ev])
  }
  return map
}

export interface MonthCell {
  date: number
  dateObj: Date
  inMonth: boolean
}

// Build a month grid of `total` cells (35 = 5 rows, 42 = 6 rows), Monday-first,
// padded with faded leading/trailing days from adjacent months.
export function buildMonthCells(year: number, month: number, total: number): MonthCell[] {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7 // Mon=0
  const cells: MonthCell[] = []
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const dateObj = new Date(year, month, -i)
    cells.push({ date: dateObj.getDate(), dateObj, inMonth: false })
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: d, dateObj: new Date(year, month, d), inMonth: true })
  }
  let next = 1
  while (cells.length < total) {
    const dateObj = new Date(year, month + 1, next++)
    cells.push({ date: dateObj.getDate(), dateObj, inMonth: false })
  }
  return cells
}
