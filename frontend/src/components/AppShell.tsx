import type { ReactNode } from 'react'
import {
  Home, CalendarDays, CheckSquare, ListTodo, Users,
  ChevronLeft, ChevronRight, Plus, Sun,
} from 'lucide-react'
import { palette } from '../lib/tokens'
import type { HeaderControls } from '../lib/calendar'
import ViewSwitcher from './ViewSwitcher'
import NavIcon from './NavIcon'

// The chrome every calendar view shares: header (wordmark, period nav, view
// switcher, weather), side rail (≥lg), bottom nav (<lg), and FAB. `children` is
// the main content; the optional `aside` renders in the right column on ≥lg and
// stacks beneath the main content on phone.
export default function AppShell({ header, aside, children }: {
  header: HeaderControls
  aside?: ReactNode
  children: ReactNode
}) {
  const { view, onViewChange, periodLabel, onPrev, onNext, onToday } = header

  return (
    <div className="min-h-screen w-full font-body" style={{ backgroundColor: palette.mist, color: palette.ink }}>
      {/* Top bar */}
      <header style={{ borderBottom: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
        {/* Desktop / tablet row (≥ lg) */}
        <div className="hidden lg:flex items-center gap-6 px-6 py-3">
          <Wordmark size="lg" />
          <div className="flex items-center gap-3">
            <NavButton aria="Previous" onClick={onPrev} size={18} dir="prev" />
            <div className="font-display text-lg font-semibold">{periodLabel}</div>
            <NavButton aria="Next" onClick={onNext} size={18} dir="next" />
            <button className="text-sm font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: palette.mist, color: palette.brand }} onClick={onToday}>Today</button>
          </div>
          <div className="flex-1" />
          <ViewSwitcher active={view} onChange={onViewChange} />
          <Weather size={18} />
        </div>

        {/* Mobile rows (< lg) */}
        <div className="lg:hidden px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <Wordmark size="sm" />
            <Weather size={16} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <NavButton aria="Previous" onClick={onPrev} size={16} dir="prev" />
              <div className="font-display text-base font-semibold">{periodLabel}</div>
              <NavButton aria="Next" onClick={onNext} size={16} dir="next" />
            </div>
            <button className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: palette.brand, color: '#fff' }} onClick={onToday}>Today</button>
          </div>
          <ViewSwitcher active={view} onChange={onViewChange} />
        </div>
      </header>

      <div className="flex">
        {/* Side rail (≥ lg) */}
        <nav className="hidden lg:flex flex-col items-center gap-1 py-4 px-2" style={{ borderRight: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
          <NavIcon icon={Home} label="Today" />
          <NavIcon icon={CalendarDays} label="Calendar" active />
          <NavIcon icon={CheckSquare} label="Chores" />
          <NavIcon icon={ListTodo} label="To-dos" />
          <NavIcon icon={Users} label="Family" />
        </nav>

        {/* Main content */}
        <main className="flex-1 p-3 pb-24 lg:p-6 lg:pb-6">
          {children}
          {aside && <div className="lg:hidden mt-6">{aside}</div>}
        </main>

        {/* Right panel (≥ lg) */}
        {aside && (
          <aside className="hidden lg:block w-80 p-5" style={{ borderLeft: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
            {aside}
          </aside>
        )}
      </div>

      {/* Bottom nav (mobile) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around py-2" style={{ borderTop: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
        <NavIcon icon={Home} label="Today" mobile />
        <NavIcon icon={CalendarDays} label="Calendar" active mobile />
        <NavIcon icon={CheckSquare} label="Chores" mobile />
        <NavIcon icon={ListTodo} label="To-dos" mobile />
        <NavIcon icon={Users} label="Family" mobile />
      </nav>

      {/* FAB */}
      <button
        className="fixed right-4 bottom-20 w-14 h-14 rounded-full flex items-center justify-center shadow-lg lg:right-6 lg:bottom-6"
        style={{ backgroundColor: palette.amber, color: palette.ink }}
        aria-label="Add"
      >
        <Plus size={26} />
      </button>
    </div>
  )
}

function Wordmark({ size }: { size: 'sm' | 'lg' }) {
  const dot = size === 'lg' ? 'w-2.5 h-2.5' : 'w-2 h-2'
  const text = size === 'lg' ? 'text-2xl' : 'text-xl'
  return (
    <div className={`font-display ${text} font-bold flex items-center gap-2`} style={{ color: palette.brand }}>
      <span className={`${dot} rounded-full`} style={{ backgroundColor: palette.amber }} />
      Tribo
    </div>
  )
}

function NavButton({ aria, onClick, size, dir }: { aria: string; onClick: () => void; size: number; dir: 'prev' | 'next' }) {
  return (
    <button className="p-1.5 rounded-full" aria-label={aria} onClick={onClick}>
      {dir === 'prev' ? <ChevronLeft size={size} /> : <ChevronRight size={size} />}
    </button>
  )
}

function Weather({ size }: { size: number }) {
  return (
    <div className="flex items-center gap-1.5 text-sm" style={{ color: palette.inkSoft }}>
      <Sun size={size} style={{ color: palette.amber }} />72°
    </div>
  )
}
