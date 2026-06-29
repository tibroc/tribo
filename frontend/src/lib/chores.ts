import type { TFunction } from 'i18next'
import { weekdayLabels } from './datetime'

// Chore recurrence is stored as a unit (daily/weekly/monthly) × an interval.
// The "year" unit is a UI convenience: years are stored as monthly × 12, and a
// whole-year month multiple is shown back as years.
export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year'
export type RecurrenceRule = 'daily' | 'weekly' | 'monthly'

const RULE_TO_UNIT: Record<RecurrenceRule, Exclude<RecurrenceUnit, 'year'>> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
}
const UNIT_TO_RULE: Record<Exclude<RecurrenceUnit, 'year'>, RecurrenceRule> = {
  day: 'daily',
  week: 'weekly',
  month: 'monthly',
}

// toUnitInterval turns stored (rule, interval) into the editable {unit, count}
// shown in the form — collapsing whole-year month multiples into years.
export function toUnitInterval(rule: RecurrenceRule, interval: number): { unit: RecurrenceUnit; count: number } {
  const n = Math.max(1, Math.round(interval || 1))
  if (rule === 'monthly' && n % 12 === 0) return { unit: 'year', count: n / 12 }
  return { unit: RULE_TO_UNIT[rule], count: n }
}

// fromUnitInterval converts the form's {unit, count} back to stored (rule, interval).
export function fromUnitInterval(unit: RecurrenceUnit, count: number): { rule: RecurrenceRule; interval: number } {
  const n = Math.max(1, Math.round(count || 1))
  if (unit === 'year') return { rule: 'monthly', interval: n * 12 }
  return { rule: UNIT_TO_RULE[unit], interval: n }
}

// weekdayOffsets parses a 7-char Mon..Sun bitstring into day offsets (0=Mon..6=Sun).
export function weekdayOffsets(mask?: string | null): number[] {
  if (!mask) return []
  const out: number[] = []
  for (let i = 0; i < 7 && i < mask.length; i++) if (mask[i] === '1') out.push(i)
  return out
}

// weekdaysToLabel renders a weekday mask as short day names, e.g. "Sun" or
// "Mon, Wed, Fri". Returns '' when no day is set.
export function weekdaysToLabel(mask: string | null | undefined, locale: string): string {
  const offsets = weekdayOffsets(mask)
  if (offsets.length === 0) return ''
  const wd = weekdayLabels(locale, 'short')
  return offsets.map((o) => wd[o]).join(', ')
}

// recurrenceLabel renders a human label: "Weekly" / "Every 2 weeks" / "Yearly" /
// "Every 5 years". interval 1 uses the adjective; otherwise "Every N units". When
// a weekly chore is pinned to weekdays, it shows those days instead (e.g. "Sun").
export function recurrenceLabel(
  rule: RecurrenceRule,
  interval: number,
  t: TFunction,
  weekdays?: string | null,
  locale?: string,
): string {
  const days = weekdaysToLabel(weekdays, locale ?? 'en')
  if (days) {
    const n = Math.max(1, Math.round(interval || 1))
    return n === 1 ? days : t('recurrence.everyNWeeksOn', { count: n, days })
  }
  const { unit, count } = toUnitInterval(rule, interval)
  if (count === 1) return t(`recurrence.adjective.${unit}`)
  return t('recurrence.every', { count, unit: t(`recurrence.unit.${unit}`, { count }) })
}

// Bare-URL autolinker for chore descriptions (no markdown). Splits text on http(s)
// URLs and returns segments tagged so the caller can render anchors. Keeping this
// data-only (not JSX) lets it live in a .ts module.
export type DescSegment = { text: string; href?: string }
const URL_RE = /(https?:\/\/[^\s]+)/g
export function linkifyDescription(text: string): DescSegment[] {
  const out: DescSegment[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0
    if (start > last) out.push({ text: text.slice(last, start) })
    // Trim trailing punctuation that's unlikely to be part of the URL.
    let url = m[0]
    let trailing = ''
    while (url.length > 0 && ').,;!?'.includes(url[url.length - 1])) {
      trailing = url[url.length - 1] + trailing
      url = url.slice(0, -1)
    }
    out.push({ text: url, href: url })
    if (trailing) out.push({ text: trailing })
    last = start + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}
