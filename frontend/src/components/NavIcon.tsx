import type { LucideIcon } from 'lucide-react'
import { palette } from '../lib/tokens'

// A single navigation destination, used in both the tablet side rail and the
// mobile bottom bar (mobile = stacked icon + label).
export default function NavIcon({ icon: Icon, label, active, mobile, onClick }: {
  icon: LucideIcon
  label: string
  active?: boolean
  mobile?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={mobile
        ? 'flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-1'
        : 'flex items-center justify-center rounded-xl w-12 h-12 mb-1'}
      style={active ? { backgroundColor: palette.brand, color: '#fff' } : { color: palette.inkSoft }}
      aria-label={label}
    >
      <Icon size={20} />
      {mobile && <span className="text-xs font-medium">{label}</span>}
    </button>
  )
}
