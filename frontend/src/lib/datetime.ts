// Locale-aware date/time formatting. Every helper takes an Intl `locale`
// (from useLocale()), so the same Date renders as "4:00 PM" (en-US, 12h) or
// "16:00" (de-DE / pt-BR, 24h) and month/weekday names localize automatically.
import { addDays, addMonths } from './calendar'

// 2024-01-01 was a Monday — anchor for building Monday-first label arrays.
const REF_MONDAY = new Date(2024, 0, 1)

// Intl.DateTimeFormat.formatRange isn't in the ES2020 lib typings yet, so format
// a start/end span with a locally-typed accessor.
type RangeFormatter = { formatRange(start: Date, end: Date): string }
function formatRange(opts: Intl.DateTimeFormatOptions, locale: string, start: Date, end: Date): string {
  return (new Intl.DateTimeFormat(locale, opts) as unknown as RangeFormatter).formatRange(start, end)
}

export function fmtTime(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d)
}

// Hour-only axis label, e.g. "6 AM" (en) / "06:00" (de, pt-BR).
export function fmtHour(hour: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: locale.startsWith('en') ? undefined : '2-digit' }).format(new Date(2024, 0, 1, hour))
}

// "Monday, January 15" / "Montag, 15. Januar" / "segunda-feira, 15 de janeiro"
export function fmtDayLong(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric' }).format(d)
}

// "January 2026" / "Januar 2026" / "janeiro de 2026"
export function fmtMonthYear(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d)
}

// Week span, e.g. "Jun 15 – 21" / "15.–21. Juni" / "15 – 21 de jun."
export function fmtWeekRange(monday: Date, locale: string): string {
  const sunday = addDays(monday, 6)
  return formatRange({ month: 'short', day: 'numeric' }, locale, monday, sunday)
}

// Quarter span across three months, e.g. "Jan – Mar 2026".
export function fmtQuarterRange(start: Date, locale: string): string {
  const end = addMonths(start, 2)
  return formatRange({ month: 'short', year: 'numeric' }, locale, start, end)
}

// "Mon, Jun 18" — compact day used in lists (notification bell, etc.).
export function fmtWeekdayDay(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(d)
}

// "Jun 18" — month + day, no weekday (highlight/agenda side lists).
export function fmtMonthDay(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d)
}

// "Monday, Jun 18" — full weekday + month + day (selected-day panel header).
export function fmtWeekdayLongDay(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'short', day: 'numeric' }).format(d)
}

// Monday-first month/weekday label arrays for column headers and day toggles.
export function weekdayLabels(locale: string, style: 'short' | 'narrow' = 'short'): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: style })
  return Array.from({ length: 7 }, (_, i) => fmt.format(addDays(REF_MONDAY, i)))
}

export function monthLabels(locale: string, style: 'short' | 'long'): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { month: style })
  return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2024, i, 1)))
}
