import { VIEWS, type ViewName } from '../lib/calendar'

// The Day/Week/Month/Quarter/Year segmented control. Controlled.
export default function ViewSwitcher({ active, onChange }: {
  active: ViewName
  onChange: (v: ViewName) => void
}) {
  return (
    <div
      className="inline-flex gap-0.5 overflow-x-auto no-scrollbar rounded-full p-1"
      style={{ background: 'var(--t-shell)', border: '1px solid var(--t-line)' }}
    >
      {VIEWS.map((v) => {
        const on = v === active
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            className="text-xs font-semibold px-3.5 py-1.5 rounded-full whitespace-nowrap transition-colors"
            style={on
              ? { background: 'var(--t-brand)', color: 'var(--t-on-brand)', boxShadow: '0 2px 8px rgba(62,98,89,.28)' }
              : { color: 'var(--t-text-soft)' }}
          >
            {v}
          </button>
        )
      })}
    </div>
  )
}
