import React, { useState } from 'react';
import {
  Home, CalendarDays, CheckSquare, ListTodo, Users,
  ChevronLeft, ChevronRight, Plus, Sun, Cake,
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

const VIEWS = ['Day', 'Week', 'Month', 'Quarter', 'Year'];
const SHARED_COLOR = '#D99A2B';
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 2026 — June 14 is "today" (monthIdx 5, date 14)
const TODAY_MONTH_IDX = 5;
const TODAY_DATE = 14;
const DAY_OF_YEAR = 165; // Jan(31)+Feb(28)+Mar(31)+Apr(30)+May(31)+14
const YEAR_PROGRESS = Math.round((DAY_OF_YEAR / 365) * 100);

// firstWeekday: Mon=0 ... Sun=6 — the weekday the 1st of the month falls on
const MONTHS_YEAR = [
  { monthIdx: 0, days: 31, firstWeekday: 3, prevDays: 31 },
  { monthIdx: 1, days: 28, firstWeekday: 6, prevDays: 31 },
  { monthIdx: 2, days: 31, firstWeekday: 6, prevDays: 28 },
  { monthIdx: 3, days: 30, firstWeekday: 2, prevDays: 31 },
  { monthIdx: 4, days: 31, firstWeekday: 4, prevDays: 30 },
  { monthIdx: 5, days: 30, firstWeekday: 0, prevDays: 31 },
  { monthIdx: 6, days: 31, firstWeekday: 2, prevDays: 30 },
  { monthIdx: 7, days: 31, firstWeekday: 5, prevDays: 31 },
  { monthIdx: 8, days: 30, firstWeekday: 1, prevDays: 31 },
  { monthIdx: 9, days: 31, firstWeekday: 3, prevDays: 30 },
  { monthIdx: 10, days: 30, firstWeekday: 6, prevDays: 31 },
  { monthIdx: 11, days: 31, firstWeekday: 1, prevDays: 30 },
];

const YEAR_HIGHLIGHTS = [
  { month: 0, date: 1, title: "New Year's Day", color: SHARED_COLOR },
  { month: 2, date: 10, title: "Hilda's birthday", color: '#D1577A', icon: 'cake' },
  { month: 3, date: 15, title: "Alberto's birthday", color: '#4C7EA8', icon: 'cake' },
  { month: 4, date: 3, title: "Guilherme's birthday", color: '#8A6BB8', icon: 'cake' },
  { month: 4, date: 25, title: 'School half-term break', color: SHARED_COLOR },
  { month: 5, date: 18, title: "Grandma's birthday", color: SHARED_COLOR, icon: 'cake' },
  { month: 5, date: 26, title: 'Summer holidays begin', color: SHARED_COLOR },
  { month: 5, date: 30, title: 'Soccer season ends', color: SHARED_COLOR },
  { month: 6, date: 20, title: 'Family vacation begins', color: SHARED_COLOR },
  { month: 7, date: 31, title: 'Soccer season starts', color: SHARED_COLOR },
  { month: 8, date: 1, title: 'School year begins', color: SHARED_COLOR },
  { month: 9, date: 31, title: 'Halloween', color: SHARED_COLOR },
  { month: 10, date: 8, title: "Marie's birthday", color: '#5C9460', icon: 'cake' },
  { month: 11, date: 25, title: 'Christmas Day', color: SHARED_COLOR },
  { month: 11, date: 31, title: "New Year's Eve", color: SHARED_COLOR },
];

const highlightMap = {};
YEAR_HIGHLIGHTS.forEach((h) => { highlightMap[`${h.month}-${h.date}`] = h; });

function buildYearCells(month) {
  const { days, firstWeekday, prevDays } = month;
  const TOTAL = 42; // 6 rows — keeps every mini-month the same height
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ date: prevDays - firstWeekday + 1 + i, inMonth: false });
  }
  for (let d = 1; d <= days; d++) {
    cells.push({ date: d, inMonth: true });
  }
  while (cells.length < TOTAL) {
    cells.push({ date: cells.length - firstWeekday - days + 1, inMonth: false });
  }
  return cells;
}

// ===== Small building blocks =====
function ViewSwitcher({ active }) {
  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar rounded-full p-1" style={{ backgroundColor: palette.mist }}>
      {VIEWS.map((v) => (
        <button
          key={v}
          className="text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap"
          style={v === active ? { backgroundColor: palette.brand, color: '#fff' } : { color: palette.inkSoft }}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

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

// ===== Mini month =====
function YearMonthCell({ cell, monthIdx, isToday }) {
  const highlight = cell.inMonth ? highlightMap[`${monthIdx}-${cell.date}`] : null;
  return (
    <div className="flex flex-col items-center justify-center" style={{ minHeight: 22, opacity: cell.inMonth ? 1 : 0.25 }}>
      <div
        className="font-display font-semibold inline-flex items-center justify-center"
        style={isToday
          ? { backgroundColor: palette.brand, color: '#fff', width: 16, height: 16, borderRadius: '50%', fontSize: '9px' }
          : { width: 16, height: 16, fontSize: '9px', color: palette.ink }}
      >
        {cell.date}
      </div>
      <span
        className="rounded-full flex-shrink-0 mt-0.5"
        style={{ width: 3, height: 3, backgroundColor: highlight ? highlight.color : 'transparent' }}
      />
    </div>
  );
}

function YearMonth({ month }) {
  const cells = buildYearCells(month);
  const borderLine = `1px solid ${palette.line}`;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: borderLine, backgroundColor: palette.surface }}>
      <div className="font-display text-sm font-bold px-2 py-1.5" style={{ borderBottom: borderLine }}>
        {MONTH_SHORT[month.monthIdx]}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((cell, i) => (
          <YearMonthCell
            key={i}
            cell={cell}
            monthIdx={month.monthIdx}
            isToday={month.monthIdx === TODAY_MONTH_IDX && cell.inMonth && cell.date === TODAY_DATE}
          />
        ))}
      </div>
    </div>
  );
}

// ===== Year highlights =====
function YearHighlights({ isTablet }) {
  return (
    <div>
      <div className="font-display text-lg font-bold mb-3">This year</div>
      <div className={isTablet ? 'grid grid-cols-2 gap-x-8 gap-y-1.5' : 'space-y-1.5'}>
        {YEAR_HIGHLIGHTS.map((h, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            {h.icon === 'cake'
              ? <Cake size={14} style={{ color: h.color, flexShrink: 0 }} />
              : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: h.color }} />}
            <span className="flex-1 truncate">{h.title}</span>
            <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{MONTH_SHORT[h.month]} {h.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== App shell =====
export default function RoostYearView() {
  const [isTablet, setIsTablet] = useState(false);

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
        <div className={isTablet ? 'flex items-center gap-6 px-6 py-3' : 'hidden'}>
          <div className="font-display text-2xl font-bold flex items-center gap-2" style={{ color: palette.brand }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: palette.amber }} />
            Roost
          </div>
          <div className="flex items-center gap-3">
            <button className="p-1.5 rounded-full" aria-label="Previous year"><ChevronLeft size={18} /></button>
            <div className="font-display text-lg font-semibold">2026</div>
            <button className="p-1.5 rounded-full" aria-label="Next year"><ChevronRight size={18} /></button>
            <button className="text-sm font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: palette.mist, color: palette.brand }}>
              Today
            </button>
          </div>
          <div className="flex-1" />
          <ViewSwitcher active="Year" />
          <div className="flex items-center gap-1.5 text-sm" style={{ color: palette.inkSoft }}>
            <Sun size={18} style={{ color: palette.amber }} />
            72°
          </div>
        </div>

        <div className={!isTablet ? 'px-4 py-3 space-y-2' : 'hidden'}>
          <div className="flex items-center justify-between">
            <div className="font-display text-xl font-bold flex items-center gap-2" style={{ color: palette.brand }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: palette.amber }} />
              Roost
            </div>
            <div className="flex items-center gap-1.5 text-sm" style={{ color: palette.inkSoft }}>
              <Sun size={16} style={{ color: palette.amber }} />
              72°
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button className="p-1 rounded-full" aria-label="Previous year"><ChevronLeft size={16} /></button>
              <div className="font-display text-base font-semibold">2026</div>
              <button className="p-1 rounded-full" aria-label="Next year"><ChevronRight size={16} /></button>
            </div>
            <button className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: palette.brand, color: '#fff' }}>
              Today
            </button>
          </div>
          <ViewSwitcher active="Year" />
        </div>
      </header>

      <div className="flex">
        {/* Side rail (tablet) */}
        <nav className={isTablet ? 'flex flex-col items-center gap-1 py-4 px-2' : 'hidden'} style={{ borderRight: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
          <NavIcon icon={Home} label="Today" />
          <NavIcon icon={CalendarDays} label="Calendar" active />
          <NavIcon icon={CheckSquare} label="Chores" />
          <NavIcon icon={ListTodo} label="To-dos" />
          <NavIcon icon={Users} label="Family" />
        </nav>

        {/* Main content */}
        <main className={isTablet ? 'flex-1 p-6' : 'flex-1 p-3 pb-24'}>
          {/* Year progress */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="font-display text-lg font-bold">2026</div>
              <div className="text-sm" style={{ color: palette.inkSoft }}>Day {DAY_OF_YEAR} of 365 · {YEAR_PROGRESS}%</div>
            </div>
            <div className="h-1.5 rounded-full" style={{ backgroundColor: palette.line }}>
              <div className="h-1.5 rounded-full" style={{ width: `${YEAR_PROGRESS}%`, backgroundColor: palette.brand }} />
            </div>
          </div>

          <div className={isTablet ? 'grid grid-cols-3 gap-3' : 'grid grid-cols-2 gap-2'}>
            {MONTHS_YEAR.map((m) => <YearMonth key={m.monthIdx} month={m} />)}
          </div>

          <div className="mt-6">
            <YearHighlights isTablet={isTablet} />
          </div>
        </main>
      </div>
      </div>
      </div>

      {/* Bottom nav (mobile) */}
      <nav className={!isTablet ? 'fixed bottom-0 left-0 right-0 flex items-center justify-around py-2' : 'hidden'} style={{ borderTop: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
        <NavIcon icon={Home} label="Today" mobile />
        <NavIcon icon={CalendarDays} label="Calendar" active mobile />
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
