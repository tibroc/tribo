import React, { useState } from 'react';
import {
  Home, CalendarDays, CheckSquare, ListTodo, Users,
  Plus, Sun, ChevronLeft, Flame,
} from 'lucide-react';

// ===== Design tokens (shared across views) =====
const palette = {
  mist: '#EEF1EE',
  surface: '#FFFFFF',
  ink: '#28342F',
  inkSoft: '#5C6B65',
  line: '#DCE2DD',
  brand: '#3E6259',
  brandSoft: '#3E62590F',
  amber: '#F6B042',
};

const PERIODS = [
  { key: 'week', label: 'This Week', range: 'Jun 8 – 14' },
  { key: 'month', label: 'This Month', range: 'Jun 1 – 14' },
  { key: 'year', label: 'This Year', range: 'Jan 1 – Jun 14' },
];

const PEOPLE = [
  { id: 'alberto', name: 'Alberto', color: '#4C7EA8' },
  { id: 'hilda', name: 'Hilda', color: '#D1577A' },
  { id: 'marie', name: 'Marie', color: '#5C9460' },
  { id: 'guilherme', name: 'Guilherme', color: '#8A6BB8' },
];

// ===== Sample data =====
const heroStats = {
  week: { chores: '11/14', choresPct: 79, todos: '3/3', todosPct: 100, events: 18 },
  month: { chores: '42/52', choresPct: 81, todos: '14/16', todosPct: 88, events: 64 },
  year: { chores: '287/340', choresPct: 84, todos: '96/110', todosPct: 87, events: 412 },
};

// Per-person, for "this week" (Jun 8–14) — sums to the 11/14 + 3/3 above
const personStats = {
  alberto: { choresDone: 4, choresTotal: 4, todosDone: 0, todosTotal: 0, streak: 6 },
  hilda: { choresDone: 4, choresTotal: 4, todosDone: 2, todosTotal: 2, streak: 9 },
  marie: { choresDone: 2, choresTotal: 3, todosDone: 1, todosTotal: 1, streak: 4 },
  guilherme: { choresDone: 1, choresTotal: 3, todosDone: 0, todosTotal: 0, streak: 2 },
};

// Last 8 weeks, most recent (this week) last
const chores = [
  { title: 'Mow the lawn', who: 'Alberto', color: '#4C7EA8', history: [true, true, false, true, true, true, true, true] },
  { title: 'Clean the bathroom', who: 'Hilda', color: '#D1577A', history: [true, true, true, true, true, true, true, true] },
  { title: 'Take out recycling', who: 'Guilherme', color: '#8A6BB8', history: [true, false, true, true, false, true, false, false] },
  { title: 'Water the plants', who: 'Marie', color: '#5C9460', history: [true, true, false, true, true, true, false, true] },
  { title: 'Defrost the fridge', who: 'Hilda', color: '#D1577A', history: [false, false, false, true, false, false, false, true] },
];

const ytd = { chores: 287, todos: 96, birthdays: 3 };

// ===== Small building blocks =====
function NavIcon({ icon: Icon, label, active, mobile }) {
  return (
    <button
      className={mobile ? 'flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-1' : 'flex items-center justify-center rounded-xl w-12 h-12 mb-1'}
      style={active ? { backgroundColor: palette.brand, color: '#fff' } : { color: palette.inkSoft }}
      aria-label={label}
    >
      <Icon size={20} />
      {mobile && <span className="text-xs font-medium">{label}</span>}
    </button>
  );
}

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl p-4 ${className}`} style={{ border: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
      {children}
    </div>
  );
}

function PeriodSwitcher({ active, onChange }) {
  return (
    <div className="flex gap-1 rounded-full p-1" style={{ backgroundColor: palette.mist }}>
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className="text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap"
          style={p.key === active ? { backgroundColor: palette.brand, color: '#fff' } : { color: palette.inkSoft }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ===== Sections =====
function StatTile({ label, value, sub }) {
  return (
    <Card className="text-center">
      <div className="font-display text-2xl font-bold" style={{ color: palette.brand }}>{value}</div>
      <div className="text-xs font-semibold uppercase mt-1" style={{ color: palette.inkSoft }}>{label}</div>
      <div className="text-xs mt-0.5" style={{ color: palette.inkSoft }}>{sub}</div>
    </Card>
  );
}

function HeroStats({ period }) {
  const s = heroStats[period];
  const range = PERIODS.find((p) => p.key === period).range;
  return (
    <div className="mb-4">
      <div className="text-sm mb-2" style={{ color: palette.inkSoft }}>{range}</div>
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Chores" value={`${s.choresPct}%`} sub={s.chores} />
        <StatTile label="To-dos" value={`${s.todosPct}%`} sub={s.todos} />
        <StatTile label="Events" value={s.events} sub="happened" />
      </div>
    </div>
  );
}

function PersonReviewCard({ person }) {
  const s = personStats[person.id];
  const chorePct = s.choresTotal > 0 ? Math.round((s.choresDone / s.choresTotal) * 100) : 100;
  return (
    <Card>
      <div className="-m-4 mb-3 rounded-t-2xl" style={{ height: 4, backgroundColor: person.color }} />
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ backgroundColor: person.color }}>
          {person.name[0]}
        </div>
        <div className="font-display text-base font-bold">{person.name}</div>
        <div className="ml-auto flex items-center gap-1 text-xs font-semibold" style={{ color: palette.amber }}>
          <Flame size={14} />
          {s.streak}-week streak
        </div>
      </div>

      <div className="text-sm mb-1" style={{ color: palette.inkSoft }}>
        Chores this week: {s.choresDone}/{s.choresTotal}
      </div>
      <div className="h-1.5 rounded-full mb-3" style={{ backgroundColor: palette.line }}>
        <div className="h-1.5 rounded-full" style={{ width: `${chorePct}%`, backgroundColor: person.color }} />
      </div>

      {s.todosTotal > 0 && (
        <div className="text-sm" style={{ color: palette.inkSoft }}>
          To-dos: {s.todosDone}/{s.todosTotal} done
        </div>
      )}
    </Card>
  );
}

function ChoreConsistencyCard({ isTablet }) {
  const sq = isTablet ? 10 : 8;
  const gap = isTablet ? 4 : 3;
  return (
    <Card>
      <div className="font-display text-base font-bold mb-3">Chore consistency</div>
      <div className="space-y-2.5">
        {chores.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
            <span className="text-sm flex-1 truncate">{c.title}</span>
            {isTablet && <span className="text-xs flex-shrink-0 w-20 truncate" style={{ color: palette.inkSoft }}>{c.who}</span>}
            <div className="flex flex-shrink-0" style={{ gap }}>
              {c.history.map((done, j) => (
                <span
                  key={j}
                  className="rounded-sm flex-shrink-0"
                  style={{ width: sq, height: sq, backgroundColor: done ? c.color : palette.line }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="text-xs mt-3" style={{ color: palette.inkSoft }}>Last 8 weeks</div>
    </Card>
  );
}

function YearToDateCard() {
  return (
    <Card>
      <div className="flex items-center justify-between mb-1.5">
        <div className="font-display text-base font-bold">Year to date</div>
        <div className="text-xs" style={{ color: palette.inkSoft }}>Jan 1 – Jun 14 · 45% of 2026</div>
      </div>
      <div className="h-1.5 rounded-full mb-3" style={{ backgroundColor: palette.line }}>
        <div className="h-1.5 rounded-full" style={{ width: '45%', backgroundColor: palette.brand }} />
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="font-display text-xl font-bold">{ytd.chores}</div>
          <div className="text-xs" style={{ color: palette.inkSoft }}>chores done</div>
        </div>
        <div>
          <div className="font-display text-xl font-bold">{ytd.todos}</div>
          <div className="text-xs" style={{ color: palette.inkSoft }}>to-dos done</div>
        </div>
        <div>
          <div className="font-display text-xl font-bold">{ytd.birthdays}</div>
          <div className="text-xs" style={{ color: palette.inkSoft }}>birthdays celebrated</div>
        </div>
      </div>
    </Card>
  );
}

// ===== App shell =====
export default function RoostReviewView() {
  const [isTablet, setIsTablet] = useState(false);
  const [period, setPeriod] = useState('week');

  return (
    <div className="min-h-screen w-full font-body" style={{ backgroundColor: palette.mist, color: palette.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        .font-display { font-family: 'Bricolage Grotesque', sans-serif; }
        .font-body { font-family: 'Plus Jakarta Sans', sans-serif; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { scrollbar-width: none; }
      `}</style>

      {/* Preview toggle — for testing layouts only */}
      <div
        className="fixed top-2 right-2 z-50 flex gap-1 rounded-full p-1 shadow-md"
        style={{ backgroundColor: palette.surface, border: `1px solid ${palette.line}` }}
      >
        <button
          onClick={() => setIsTablet(false)}
          className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={!isTablet ? { backgroundColor: palette.brand, color: '#fff' } : { color: palette.inkSoft }}
        >
          Phone
        </button>
        <button
          onClick={() => setIsTablet(true)}
          className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={isTablet ? { backgroundColor: palette.brand, color: '#fff' } : { color: palette.inkSoft }}
        >
          Tablet
        </button>
      </div>

      <div style={{ overflowX: isTablet ? 'auto' : 'hidden' }}>
      <div style={{ minWidth: isTablet ? '1024px' : 'auto' }}>
      {/* Top bar */}
      <header style={{ borderBottom: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
        <div className={isTablet ? 'flex items-center gap-4 px-6 py-3' : 'hidden'}>
          <button className="flex items-center gap-1 text-sm font-semibold px-2 py-1 rounded-full" style={{ color: palette.inkSoft }}>
            <ChevronLeft size={16} /> Home
          </button>
          <div className="font-display text-2xl font-bold" style={{ color: palette.brand }}>Review</div>
          <div className="flex-1" />
          <PeriodSwitcher active={period} onChange={setPeriod} />
          <div className="flex items-center gap-1.5 text-sm" style={{ color: palette.inkSoft }}>
            <Sun size={18} style={{ color: palette.amber }} />
            72°
          </div>
        </div>

        <div className={!isTablet ? 'px-4 py-3 space-y-2' : 'hidden'}>
          <div className="flex items-center justify-between">
            <button className="flex items-center gap-1 text-sm font-semibold px-1 py-1 rounded-full" style={{ color: palette.inkSoft }}>
              <ChevronLeft size={16} /> Home
            </button>
            <div className="font-display text-xl font-bold" style={{ color: palette.brand }}>Review</div>
            <div className="flex items-center gap-1.5 text-sm" style={{ color: palette.inkSoft }}>
              <Sun size={16} style={{ color: palette.amber }} />
              72°
            </div>
          </div>
          <PeriodSwitcher active={period} onChange={setPeriod} />
        </div>
      </header>

      <div className="flex">
        {/* Side rail (tablet) */}
        <nav className={isTablet ? 'flex flex-col items-center gap-1 py-4 px-2' : 'hidden'} style={{ borderRight: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
          <NavIcon icon={Home} label="Home" active />
          <NavIcon icon={CalendarDays} label="Calendar" />
          <NavIcon icon={CheckSquare} label="Chores" />
          <NavIcon icon={ListTodo} label="To-dos" />
          <NavIcon icon={Users} label="Family" />
        </nav>

        {/* Main content */}
        <main className={isTablet ? 'flex-1 p-6' : 'flex-1 p-3 pb-24'}>
          <HeroStats period={period} />

          <div className={isTablet ? 'grid grid-cols-2 gap-4 mb-4' : 'space-y-4 mb-4'}>
            {PEOPLE.map((p) => <PersonReviewCard key={p.id} person={p} />)}
          </div>

          <div className="space-y-4">
            <ChoreConsistencyCard isTablet={isTablet} />
            <YearToDateCard />
          </div>
        </main>
      </div>
      </div>
      </div>

      {/* Bottom nav (mobile) */}
      <nav className={!isTablet ? 'fixed bottom-0 left-0 right-0 flex items-center justify-around py-2' : 'hidden'} style={{ borderTop: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
        <NavIcon icon={Home} label="Home" active mobile />
        <NavIcon icon={CalendarDays} label="Calendar" mobile />
        <NavIcon icon={CheckSquare} label="Chores" mobile />
        <NavIcon icon={ListTodo} label="To-dos" mobile />
        <NavIcon icon={Users} label="Family" mobile />
      </nav>

      {/* FAB */}
      <button
        className={isTablet
          ? 'fixed right-6 bottom-6 w-14 h-14 rounded-full flex items-center justify-center shadow-lg'
          : 'fixed right-4 bottom-20 w-14 h-14 rounded-full flex items-center justify-center shadow-lg'}
        style={{ backgroundColor: palette.amber, color: palette.ink }}
        aria-label="Add"
      >
        <Plus size={26} />
      </button>
    </div>
  );
}
