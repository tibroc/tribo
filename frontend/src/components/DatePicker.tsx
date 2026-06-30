import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { addDays, mondayOf, startOfDay, startOfMonth, sameDay } from '../lib/calendar'
import { weekdayLabels, monthLabels } from '../lib/datetime'

// Local-date → 'YYYY-MM-DD' (zero-padded). NB: calendar.dayKey is a 0-based,
// non-padded grouping key, not an ISO date, so we format here instead.
const pad2 = (n: number) => String(n).padStart(2, '0')
const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

// A locale-aware date picker. Native <input type="date"> renders its calendar
// popup in the browser/OS locale, ignoring the element's lang, so it can't follow
// the app language — this popover renders month/weekday names via the app locale.
// value/onChange use 'YYYY-MM-DD' (same as the native input), so it's a drop-in.
function parseISO(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export default function DatePicker({ value, onChange, locale, placeholder }: {
  value: string
  onChange: (v: string) => void
  locale: string
  placeholder?: string
}) {
  const selected = useMemo(() => parseISO(value), [value])
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => startOfMonth(selected ?? new Date()))
  const ref = useRef<HTMLDivElement>(null)

  // Re-sync the displayed month when the value changes while closed.
  useEffect(() => { if (!open && selected) setView(startOfMonth(selected)) }, [value, open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const dow = weekdayLabels(locale, 'narrow')
  const months = monthLabels(locale, 'long')
  const today = startOfDay(new Date())
  const gridStart = mondayOf(startOfMonth(view))
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const label = selected
    ? new Intl.DateTimeFormat(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(selected)
    : (placeholder ?? '')

  const step = (months: number, years: number) =>
    setView((v) => new Date(v.getFullYear() + years, v.getMonth() + months, 1))

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full text-left bg-transparent outline-hidden text-sm font-medium"
        style={{ color: selected ? 'var(--t-text)' : 'var(--t-text-soft)' }}>
        {label || '—'}
      </button>
      {open && (
        <div className="absolute z-50 mt-2 p-2"
          style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 'var(--t-radius-md)', boxShadow: '0 8px 28px rgba(0,0,0,0.18)', width: 268 }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-0.5">
              <NavBtn onClick={() => step(0, -1)}><ChevronsLeft size={16} /></NavBtn>
              <NavBtn onClick={() => step(-1, 0)}><ChevronLeft size={16} /></NavBtn>
            </div>
            <div className="text-sm font-semibold">{months[view.getMonth()]} {view.getFullYear()}</div>
            <div className="flex items-center gap-0.5">
              <NavBtn onClick={() => step(1, 0)}><ChevronRight size={16} /></NavBtn>
              <NavBtn onClick={() => step(0, 1)}><ChevronsRight size={16} /></NavBtn>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {dow.map((d, i) => (
              <div key={i} className="text-center text-xs font-semibold py-1" style={{ color: 'var(--t-text-soft)' }}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d) => {
              const inMonth = d.getMonth() === view.getMonth()
              const isSel = selected && sameDay(d, selected)
              const isToday = sameDay(d, today)
              return (
                <button key={toISO(d)} type="button"
                  onClick={() => { onChange(toISO(d)); setOpen(false) }}
                  className="text-center text-sm rounded-md py-1.5"
                  style={{
                    color: isSel ? 'var(--t-on-brand)' : inMonth ? 'var(--t-text)' : 'var(--t-text-soft)',
                    opacity: inMonth ? 1 : 0.4,
                    background: isSel ? 'var(--t-brand)' : 'transparent',
                    outline: isToday && !isSel ? '1px solid var(--t-line)' : 'none',
                    fontWeight: isSel || isToday ? 600 : 400,
                  }}>
                  {d.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function NavBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center justify-center rounded-md p-1"
      style={{ color: 'var(--t-text-soft)' }}>{children}</button>
  )
}
