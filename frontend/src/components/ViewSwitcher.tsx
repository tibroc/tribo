import { palette } from '../lib/tokens'
import { VIEWS, type ViewName } from '../lib/calendar'

// The Day/Week/Month/Quarter/Year segmented control. Controlled.
export default function ViewSwitcher({ active, onChange }: {
  active: ViewName
  onChange: (v: ViewName) => void
}) {
  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar rounded-full p-1" style={{ backgroundColor: palette.mist }}>
      {VIEWS.map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className="text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap"
          style={v === active ? { backgroundColor: palette.brand, color: '#fff' } : { color: palette.inkSoft }}
        >
          {v}
        </button>
      ))}
    </div>
  )
}
