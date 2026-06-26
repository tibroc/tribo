// Locale-aware date/time formatting. Every helper takes an Intl `locale`
// (from useLocale()), so the same Date renders as "4:00 PM" (en-US, 12h) or
// "16:00" (de-DE / pt-BR, 24h) and month/weekday names localize automatically.
import { addDays } from './calendar'

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

// Hour-only axis label: "6 AM" in 12h locales, "06:00" in 24h ones. The minutes
// are shown only for 24h (decided from the resolved hour cycle, so it's correct
// regardless of language + the user's time-format preference).
export function fmtHour(hour: number, locale: string): string {
  const is12 = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hour12
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: is12 ? undefined : '2-digit' }).format(new Date(2024, 0, 1, hour))
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

// "Monday" — full weekday name on its own.
export function fmtWeekdayLong(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d)
}

// Arbitrary day span, e.g. "Jun 1 – 18" / "1.–18. Juni".
export function fmtRange(startISO: string, endISO: string, locale: string): string {
  return formatRange({ month: 'short', day: 'numeric' }, locale, new Date(startISO), new Date(endISO))
}

// Localized weekday summary for a recurring series: a contiguous run of ≥3 →
// "Mon – Fri"; a single timed day → "Mon, 9:00 AM"; otherwise "Tue, Thu".
export function daysLabel(weekdays: number[], timeISO: string | undefined, locale: string): string {
  if (weekdays.length === 0) return ''
  const wd = weekdayLabels(locale, 'short')
  if (weekdays.length === 1) {
    const day = wd[weekdays[0]]
    return timeISO ? `${day}, ${fmtTime(new Date(timeISO), locale)}` : day
  }
  let contiguous = true
  for (let i = 1; i < weekdays.length; i++) {
    if (weekdays[i] !== weekdays[i - 1] + 1) { contiguous = false; break }
  }
  if (contiguous && weekdays.length >= 3) return `${wd[weekdays[0]]} – ${wd[weekdays[weekdays.length - 1]]}`
  return weekdays.map((d) => wd[d]).join(', ')
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
