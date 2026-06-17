import type { CSSProperties, ReactNode } from 'react'
import { Sun } from 'lucide-react'
import type { HeaderControls } from '../lib/calendar'
import Icon from './Icon'
import ViewSwitcher from './ViewSwitcher'

// Shared header pieces. The AppShell owns the wordmark (left) and the right
// cluster (weather / bell / profile); these components render only the CENTERED
// header content that sits between them.

// Spectral display type at a given size — the Salvia system's heading face.
const disp = (fontSize: number, extra?: CSSProperties): CSSProperties => ({
  fontFamily: 'var(--t-font-display)',
  fontWeight: 500,
  fontSize,
  lineHeight: 1,
  color: 'var(--t-text)',
  ...extra,
})

// "tri·bo" wordmark: a leaf in a salvia squircle (rotated −8°), then the
// logotype in Spectral with the "i" set in italic.
export function Wordmark({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const mark = size === 'lg' ? 30 : 26
  const text = size === 'lg' ? 30 : 24
  return (
    <div className="flex items-center" style={{ gap: 9 }}>
      <div
        className="flex items-center justify-center"
        style={{
          width: mark,
          height: mark,
          borderRadius: '50% 50% 50% 14px',
          background: 'var(--t-brand)',
          color: 'var(--t-on-brand)',
          transform: 'rotate(-8deg)',
        }}
      >
        <Icon name="leaf" size={Math.round(mark * 0.53)} strokeWidth={2} />
      </div>
      <div style={disp(text, { letterSpacing: '.3px' })}>
        tr<span style={{ fontStyle: 'italic' }}>i</span>bo
      </div>
    </div>
  )
}

// Weather widget — sits in the header's right cluster (replaces the reference's
// search button). Styled as a soft pill to echo the .sv-iconbtn row.
export function Weather({ size = 17 }: { size?: number }) {
  return (
    <div
      className="hidden sm:flex items-center gap-1.5 text-sm rounded-full px-3"
      style={{ height: 38, border: '1px solid var(--t-line)', background: 'var(--t-shell)', color: 'var(--t-text-soft)', fontWeight: 600 }}
    >
      <Sun size={size} style={{ color: 'var(--t-accent)' }} />72°
    </div>
  )
}

// A plain centered title (Home/Family/Chores/To-dos). Wordmark + right cluster
// are supplied by AppShell, so this is just the Spectral title.
export function SimpleHeader({ title }: { title?: string; left?: ReactNode; right?: ReactNode; wordmark?: boolean }) {
  if (!title) return null
  return <div style={disp(24, { textAlign: 'center' })}>{title}</div>
}

// Italicize the date portion of a period label (everything from the first digit)
// so it reads terra-italic, matching the reference's `.sv-periodlabel em`.
function emphasize(label: string): ReactNode {
  const i = label.search(/\d/)
  if (i < 0) return label
  return <>{label.slice(0, i)}<em>{label.slice(i)}</em></>
}

// Round bordered nav arrow, matching the reference's .sv-arrow.
function NavArrow({ dir, onClick }: { dir: 'left' | 'right'; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === 'left' ? 'Previous' : 'Next'}
      className="flex items-center justify-center rounded-full transition-transform hover:-translate-y-px"
      style={{ width: 32, height: 32, border: '1px solid var(--t-line)', background: 'var(--t-shell)', color: 'var(--t-text-soft)' }}
    >
      <Icon name={dir} size={15} strokeWidth={2.4} />
    </button>
  )
}

// The calendar header's CENTERED content: period navigation + view switcher.
// Renders a horizontal row on desktop and a stacked block on mobile.
export function CalendarHeader({ controls }: { controls: HeaderControls }) {
  const { view, onViewChange, periodLabel, onPrev, onNext, onToday } = controls
  return (
    <>
      {/* Desktop / tablet — single centered row */}
      <div className="hidden lg:flex items-center gap-5">
        <div className="flex items-center gap-3">
          <NavArrow dir="left" onClick={onPrev} />
          <div className="sv-period-label" style={disp(27, { whiteSpace: 'nowrap' })}>{emphasize(periodLabel)}</div>
          <NavArrow dir="right" onClick={onNext} />
        </div>
        <button
          className="text-sm font-semibold px-3 py-1.5 rounded-full transition-transform hover:-translate-y-px"
          style={{ border: '1px solid var(--t-line)', background: 'var(--t-shell)', color: 'var(--t-brand)' }}
          onClick={onToday}
        >
          Today
        </button>
        <ViewSwitcher active={view} onChange={onViewChange} />
      </div>

      {/* Mobile — stacked */}
      <div className="lg:hidden w-full space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <NavArrow dir="left" onClick={onPrev} />
            <div className="sv-period-label" style={disp(19, { whiteSpace: 'nowrap' })}>{emphasize(periodLabel)}</div>
            <NavArrow dir="right" onClick={onNext} />
          </div>
          <button className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: 'var(--t-brand)', color: 'var(--t-on-brand)' }} onClick={onToday}>Today</button>
        </div>
        <ViewSwitcher active={view} onChange={onViewChange} />
      </div>
    </>
  )
}
