// A native <input type="time"> time picker. Chosen for the mobile-native
// experience (iOS scroll wheel / Android clock+keypad) and single-tap entry —
// far less fiddly than separate hour/minute/AM-PM selects on a phone.
//
// TRADE-OFF: the native control renders its 12h/24h display from the browser/OS
// locale and ignores Tribo's own time-format preference. We accept that for the
// better touch UX. value/onChange use 24h "HH:MM" (the input's canonical value,
// independent of display locale), so callers are unchanged.
export default function TimePicker({ value, onChange }: {
  value: string
  onChange: (v: string) => void
}) {
  // Normalize any incoming "H:MM" / "HH:MM:SS" to the "HH:MM" the input wants.
  const norm = (() => {
    const mt = /^(\d{1,2}):(\d{2})/.exec(value || '')
    return mt ? `${mt[1].padStart(2, '0')}:${mt[2]}` : ''
  })()

  return (
    <input
      type="time"
      className="text-sm px-2 py-1 outline-hidden"
      style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)', borderRadius: 8, color: 'var(--t-text)' }}
      value={norm}
      // The native picker can be cleared to ""; keep the last valid time rather
      // than propagate an empty value the event/schedule forms can't parse.
      onChange={(e) => { if (e.target.value) onChange(e.target.value) }}
    />
  )
}
