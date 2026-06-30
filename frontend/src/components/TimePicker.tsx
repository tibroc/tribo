import { useMemo } from 'react'

// A locale-aware time picker. Native <input type="time"> renders 12h/24h from
// the browser/OS locale, ignoring the app's time-format preference — this uses
// hour/minute selects (plus AM/PM in 12h locales) driven by `locale`, which
// already carries the preference's hour-cycle extension (see useLocale).
// value/onChange use 24h "HH:MM" (same as the native input), so it's a drop-in.
const pad2 = (n: number) => String(n).padStart(2, '0')

export default function TimePicker({ value, onChange, locale }: {
  value: string
  onChange: (v: string) => void
  locale: string
}) {
  const hour12 = useMemo(
    () => !!new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hour12,
    [locale],
  )
  const [h, m] = (() => {
    const mt = /^(\d{1,2}):(\d{2})/.exec(value || '')
    return mt ? [Number(mt[1]), Number(mt[2])] : [9, 0]
  })()

  // Minute options in 5-min steps, plus the current value if it's off-grid.
  const minutes = useMemo(() => {
    const s = new Set<number>()
    for (let i = 0; i < 60; i += 5) s.add(i)
    s.add(m)
    return [...s].sort((a, b) => a - b)
  }, [m])

  const emit = (nh: number, nm: number) => onChange(`${pad2(nh)}:${pad2(nm)}`)

  const selStyle = { background: 'var(--t-bg)', border: '1px solid var(--t-line)', borderRadius: 8 }

  if (hour12) {
    const pm = h >= 12
    const h12 = h % 12 === 0 ? 12 : h % 12
    const setH12 = (v: number) => emit((v % 12) + (pm ? 12 : 0), m)
    const setMeridiem = (toPM: boolean) => emit((h % 12) + (toPM ? 12 : 0), m)
    return (
      <span className="inline-flex items-center gap-1">
        <select className="text-sm px-1.5 py-1 outline-hidden" style={selStyle} value={h12} onChange={(e) => setH12(Number(e.target.value))}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((hh) => <option key={hh} value={hh}>{hh}</option>)}
        </select>
        <span style={{ color: 'var(--t-text-soft)' }}>:</span>
        <select className="text-sm px-1.5 py-1 outline-hidden" style={selStyle} value={m} onChange={(e) => emit(h, Number(e.target.value))}>
          {minutes.map((mm) => <option key={mm} value={mm}>{pad2(mm)}</option>)}
        </select>
        <select className="text-sm px-1.5 py-1 outline-hidden" style={selStyle} value={pm ? 'pm' : 'am'} onChange={(e) => setMeridiem(e.target.value === 'pm')}>
          <option value="am">AM</option>
          <option value="pm">PM</option>
        </select>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <select className="text-sm px-1.5 py-1 outline-hidden" style={selStyle} value={h} onChange={(e) => emit(Number(e.target.value), m)}>
        {Array.from({ length: 24 }, (_, i) => i).map((hh) => <option key={hh} value={hh}>{pad2(hh)}</option>)}
      </select>
      <span style={{ color: 'var(--t-text-soft)' }}>:</span>
      <select className="text-sm px-1.5 py-1 outline-hidden" style={selStyle} value={m} onChange={(e) => emit(h, Number(e.target.value))}>
        {minutes.map((mm) => <option key={mm} value={mm}>{pad2(mm)}</option>)}
      </select>
    </span>
  )
}
