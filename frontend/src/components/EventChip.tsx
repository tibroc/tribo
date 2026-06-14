import { Cake } from 'lucide-react'
import { palette, chipStyle } from '../lib/tokens'

// Tinted, left-bordered event chip — the "marker-pen on a whiteboard" metaphor.
// `dense` is the tiny single-line variant used in the Month grid; the default is
// the Week/agenda chip with an optional time line above the title.
export default function EventChip({ title, color, time, icon, dense }: {
  title: string
  color: string
  time?: string
  icon?: string
  dense?: boolean
}) {
  if (dense) {
    return (
      <div
        className="rounded px-1 truncate flex items-center gap-0.5"
        style={{ ...chipStyle(color), color: palette.ink, fontSize: '10px', lineHeight: '14px' }}
      >
        {icon === 'cake' && <Cake size={9} />}
        {title}
      </div>
    )
  }
  return (
    <div className="rounded-md px-1.5 py-1 mb-1 leading-tight" style={chipStyle(color)}>
      {time && <div style={{ color: palette.inkSoft, fontSize: '10px', fontWeight: 600 }}>{time}</div>}
      <div className="font-medium truncate flex items-center gap-1 text-xs" style={{ color: palette.ink }}>
        {icon === 'cake' && <Cake size={12} />}
        {title}
      </div>
    </div>
  )
}
