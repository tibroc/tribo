// Shared calendar primitives: date math, labels, and event grouping/coloring
// used across all five calendar views.
import { SHARED_COLOR } from './tokens'
import type { FamilyMember, TriboEvent } from './api'

export type ViewName = 'Day' | 'Week' | 'Month' | 'Quarter' | 'Year'
export const VIEWS: ViewName[] = ['Day', 'Week', 'Month', 'Quarter', 'Year']

// Top-level navigation destinations. 'review' is reached from Home (not the rail);
// it highlights the Home nav item, matching the prototype.
export type Section = 'home' | 'calendar' | 'chores' | 'todos' | 'family' | 'review'
export type NavKey = 'home' | 'calendar' | 'chores' | 'todos' | 'family'

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
export const FULL_WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

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
  onNavigate: (k: NavKey) => void
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

export function fmtTime(d: Date): string {
  let h = d.getHours()
  const m = d.getMinutes()
  const ampm = h < 12 ? 'AM' : 'PM'
  h = h % 12 || 12
  return m === 0 ? `${h}:00 ${ampm}` : `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

export function weekRangeLabel(monday: Date): string {
  const sunday = addDays(monday, 6)
  if (monday.getMonth() === sunday.getMonth()) {
    return `${MONTHS_SHORT[monday.getMonth()]} ${monday.getDate()} – ${sunday.getDate()}`
  }
  return `${MONTHS_SHORT[monday.getMonth()]} ${monday.getDate()} – ${MONTHS_SHORT[sunday.getMonth()]} ${sunday.getDate()}`
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
