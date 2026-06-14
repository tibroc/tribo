import type { ReactNode } from 'react'
import { Home, CalendarDays, CheckSquare, ListTodo, Users, Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { palette } from '../lib/tokens'
import type { NavKey } from '../lib/calendar'
import NavIcon from './NavIcon'

const NAV: { key: NavKey; icon: LucideIcon; label: string }[] = [
  { key: 'home', icon: Home, label: 'Home' },
  { key: 'calendar', icon: CalendarDays, label: 'Calendar' },
  { key: 'chores', icon: CheckSquare, label: 'Chores' },
  { key: 'todos', icon: ListTodo, label: 'To-dos' },
  { key: 'family', icon: Users, label: 'Family' },
]

// The chrome every screen shares: a header slot, the nav rail (≥lg) / bottom bar
// (<lg), and the FAB. `header` is page-specific content rendered inside the
// <header> bar. `aside` renders in the right column on ≥lg and stacks beneath
// main on phone. `active` highlights a nav destination; `onNavigate` switches.
export default function AppShell({ active, onNavigate, header, aside, showFab = true, onFabClick, children }: {
  active: NavKey
  onNavigate: (k: NavKey) => void
  header: ReactNode
  aside?: ReactNode
  showFab?: boolean
  onFabClick?: () => void
  children: ReactNode
}) {
  return (
    <div className="min-h-screen w-full font-body" style={{ backgroundColor: palette.mist, color: palette.ink }}>
      <header style={{ borderBottom: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>{header}</header>

      <div className="flex">
        <nav className="hidden lg:flex flex-col items-center gap-1 py-4 px-2" style={{ borderRight: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
          {NAV.map((n) => <NavIcon key={n.key} icon={n.icon} label={n.label} active={active === n.key} onClick={() => onNavigate(n.key)} />)}
        </nav>

        <main className="flex-1 p-3 pb-24 lg:p-6 lg:pb-6">
          {children}
          {aside && <div className="lg:hidden mt-6">{aside}</div>}
        </main>

        {aside && (
          <aside className="hidden lg:block w-80 p-5" style={{ borderLeft: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
            {aside}
          </aside>
        )}
      </div>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around py-2" style={{ borderTop: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
        {NAV.map((n) => <NavIcon key={n.key} icon={n.icon} label={n.label} active={active === n.key} mobile onClick={() => onNavigate(n.key)} />)}
      </nav>

      {showFab && (
        <button
          onClick={onFabClick}
          className="fixed right-4 bottom-20 w-14 h-14 rounded-full flex items-center justify-center shadow-lg lg:right-6 lg:bottom-6"
          style={{ backgroundColor: palette.amber, color: palette.ink }}
          aria-label="Add"
        >
          <Plus size={26} />
        </button>
      )}
    </div>
  )
}
