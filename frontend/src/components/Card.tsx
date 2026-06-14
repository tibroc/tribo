import type { CSSProperties, ReactNode } from 'react'
import { palette } from '../lib/tokens'

// Rounded surface panel with the standard border. `tint` swaps the background
// (e.g. brandSoft for the "today" panel).
export default function Card({ children, className = '', style, tint }: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  tint?: string
}) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{ backgroundColor: tint ?? palette.surface, border: `1px solid ${palette.line}`, ...style }}
    >
      {children}
    </div>
  )
}
