import { markerColor, FAMILY_COLOR } from '../lib/tokens'

const familyGlyph = (s: number) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

export default function PersonAvatar({ name, initial, color, index, size = 40, family = false, photo, ring = false }: {
  name?: string
  initial?: string
  color?: string
  index?: number
  size?: number
  family?: boolean
  photo?: string
  ring?: boolean
}) {
  const resolved = family ? FAMILY_COLOR : (color || markerColor(index ?? null))
  const letter = initial || (name ? name.trim()[0].toUpperCase() : '')
  return (
    <div
      className="tribo-avatar flex items-center justify-center shrink-0"
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--t-squircle, 50% 50% 50% 30%)',
        background: photo ? `center/cover no-repeat url(${photo})` : resolved,
        color: '#fff',
        fontFamily: 'var(--t-font-body)',
        fontWeight: 700,
        fontSize: Math.round(size * 0.4),
        boxShadow: ring
          ? `0 0 0 2px var(--t-shell, #fff), 0 0 0 4px ${resolved}`
          : '0 2px 8px rgba(0,0,0,.14)',
      }}
    >
      {!photo && (family ? familyGlyph(Math.round(size * 0.46)) : letter)}
    </div>
  )
}
