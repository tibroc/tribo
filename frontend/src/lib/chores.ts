import type { TFunction } from 'i18next'

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

// recurrenceLabel renders a human label: "Weekly" / "Every 2 weeks" / "Yearly" /
// "Every 5 years". interval 1 uses the adjective; otherwise "Every N units".
export function recurrenceLabel(rule: RecurrenceRule, interval: number, t: TFunction): string {
  const { unit, count } = toUnitInterval(rule, interval)
  if (count === 1) return t(`recurrence.adjective.${unit}`)
  return t('recurrence.every', { count, unit: t(`recurrence.unit.${unit}`, { count }) })
}
