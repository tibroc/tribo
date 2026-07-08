import { useTranslation } from 'react-i18next'

// Marker-pen event block: tinted fill + colored left edge.
// `dense` is the compact month-grid variant; default is the week/agenda chip.
export default function EventChip({ title, color = 'var(--t-brand)', time, icon, dense, allday, conflict, onClick }: {
  title: string
  color?: string
  time?: string
  icon?: string
  dense?: boolean
  allday?: boolean
  conflict?: boolean
  onClick?: () => void
}) {
  const { t } = useTranslation()
  const hasWarn = conflict
  // Stop propagation so a clickable chip nested in a clickable day cell (Month
  // grid) edits the event rather than also selecting the day.
  const handleClick = onClick ? (e: React.MouseEvent) => { e.stopPropagation(); onClick() } : undefined
  const wrap: React.CSSProperties = {
    borderLeft: `${dense ? 3 : 4}px solid ${color}`,
    borderRadius: dense ? '3px 7px 7px 3px' : 'var(--t-squircle-chip, 4px 11px 11px 4px)',
    background: `color-mix(in oklab, ${color} var(--t-tint, 12%), var(--t-surface, #FBF7EF))`,
    padding: dense ? '3px 7px' : '8px 10px',
    cursor: onClick ? 'pointer' : undefined,
    transition: 'transform .16s, box-shadow .16s',
    color: 'var(--t-text)',
    fontFamily: 'var(--t-font-body)',
    overflow: 'hidden',
  }
  if (dense) {
    return (
      <div onClick={handleClick} style={wrap} className={onClick ? 'sv-lift' : undefined}>
        <div style={{
          fontSize: 11, fontWeight: 600, lineHeight: 1.25,
          display: 'flex', alignItems: 'center', gap: 3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {hasWarn && <ConflictGlyph />}
          {icon === 'cake' && <CakeGlyph />}
          {title}
        </div>
      </div>
    )
  }
  return (
    <div onClick={handleClick} style={wrap} className={`mb-1 ${onClick ? 'sv-lift' : ''}`}>
      {time && (
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--t-text-soft)', letterSpacing: '.02em' }}>{time}</div>
      )}
      {allday && (
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--t-text-soft)', textTransform: 'uppercase' }}>{t('event.allDay')}</div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25, display: 'flex', alignItems: 'center', marginTop: 2 }}>
        {hasWarn && <ConflictGlyph />}
        {icon === 'cake' && <CakeGlyph />}
        {title}
      </div>
    </div>
  )
}

// Exported so non-EventChip event rows (Day timeline, Month/Week agenda lists)
// can render the same needs-guardian cue for a consistent conflict signal.
export function ConflictGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--t-danger)"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
      style={{ marginRight: 4, flexShrink: 0 }} aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" /><path d="M12 17h.01" />
    </svg>
  )
}

function CakeGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ marginRight: 4, flexShrink: 0 }} aria-hidden="true">
      <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" />
      <path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1" />
      <path d="M2 21h20" />
      <path d="M7 8v2" />
      <path d="M12 8v2" />
      <path d="M17 8v2" />
      <path d="M7 4h.01" />
      <path d="M12 4h.01" />
      <path d="M17 4h.01" />
    </svg>
  )
}
