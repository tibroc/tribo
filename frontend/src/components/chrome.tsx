import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Sun } from 'lucide-react'
import { palette } from '../lib/tokens'
import type { HeaderControls } from '../lib/calendar'
import ViewSwitcher from './ViewSwitcher'

// Shared header pieces so every screen's top bar stays visually consistent.

export function Wordmark({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const dot = size === 'lg' ? 'w-2.5 h-2.5' : 'w-2 h-2'
  const text = size === 'lg' ? 'text-2xl' : 'text-xl'
  return (
    <div className={`font-display ${text} font-bold flex items-center gap-2`} style={{ color: palette.brand }}>
      <span className={`${dot} rounded-full`} style={{ backgroundColor: palette.amber }} />
      Tribo
    </div>
  )
}

export function Weather({ size = 18 }: { size?: number }) {
  return (
    <div className="flex items-center gap-1.5 text-sm" style={{ color: palette.inkSoft }}>
      <Sun size={size} style={{ color: palette.amber }} />72°
    </div>
  )
}

// A plain title header (Home/Family/Chores/To-dos). `left` overrides the wordmark
// slot (e.g. a back button); `right` defaults to the weather widget.
export function SimpleHeader({ title, left, right, wordmark }: {
  title?: string
  left?: ReactNode
  right?: ReactNode
  wordmark?: boolean
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 lg:px-6">
      {wordmark ? <Wordmark /> : left}
      {title && <div className="font-display text-xl lg:text-2xl font-bold" style={{ color: palette.brand }}>{title}</div>}
      <div className="flex-1" />
      {right ?? <Weather />}
    </div>
  )
}

// The calendar header: period navigation + view switcher. Two responsive rows.
export function CalendarHeader({ controls }: { controls: HeaderControls }) {
  const { view, onViewChange, periodLabel, onPrev, onNext, onToday } = controls
  return (
    <>
      {/* Desktop / tablet */}
      <div className="hidden lg:flex items-center gap-6 px-6 py-3">
        <Wordmark />
        <div className="flex items-center gap-3">
          <button className="p-1.5 rounded-full" aria-label="Previous" onClick={onPrev}><ChevronLeft size={18} /></button>
          <div className="font-display text-lg font-semibold">{periodLabel}</div>
          <button className="p-1.5 rounded-full" aria-label="Next" onClick={onNext}><ChevronRight size={18} /></button>
          <button className="text-sm font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: palette.mist, color: palette.brand }} onClick={onToday}>Today</button>
        </div>
        <div className="flex-1" />
        <ViewSwitcher active={view} onChange={onViewChange} />
        <Weather />
      </div>

      {/* Mobile */}
      <div className="lg:hidden px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <Wordmark size="sm" />
          <Weather size={16} />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className="p-1 rounded-full" aria-label="Previous" onClick={onPrev}><ChevronLeft size={16} /></button>
            <div className="font-display text-base font-semibold">{periodLabel}</div>
            <button className="p-1 rounded-full" aria-label="Next" onClick={onNext}><ChevronRight size={16} /></button>
          </div>
          <button className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: palette.brand, color: '#fff' }} onClick={onToday}>Today</button>
        </div>
        <ViewSwitcher active={view} onChange={onViewChange} />
      </div>
    </>
  )
}
