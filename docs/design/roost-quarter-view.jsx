import React, { useState } from 'react';
import {
  Home, CalendarDays, CheckSquare, ListTodo, Users,
  ChevronLeft, ChevronRight, Plus, Sun, Cake,
} from 'lucide-react';

// ===== Design tokens (shared with week/month view) =====
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
const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Q2 2026 — April 1 = Wed, May 1 = Fri, June 1 = Mon. "Today" = June 14.
const TODAY_MONTH_IDX = 2;
const TODAY_DATE = 14;

const MONTHS = [
  { name: 'April', short: 'Apr', monthIdx: 0, days: 30, firstWeekday: 2, prevDays: 31 },
  { name: 'May', short: 'May', monthIdx: 1, days: 31, firstWeekday: 4, prevDays: 30 },
  { name: 'June', short: 'Jun', monthIdx: 2, days: 30, firstWeekday: 0, prevDays: 31 },
];

const HIGHLIGHTS = [
  { monthIdx: 0, date: 15, title: "Alberto's birthday", color: '#4C7EA8', icon: 'cake' },
  { monthIdx: 1, date: 3, title: "Guilherme's birthday", color: '#8A6BB8', icon: 'cake' },
  { monthIdx: 1, date: 25, title: 'School half-term break', color: SHARED_COLOR },
  { monthIdx: 2, date: 18, title: "Grandma's birthday", color: SHARED_COLOR, icon: 'cake' },
  { monthIdx: 2, date: 26, title: 'Summer holidays begin', color: SHARED_COLOR },
  { monthIdx: 2, date: 30, title: 'Soccer season ends', color: SHARED_COLOR },
];

const highlightMap = {};
HIGHLIGHTS.forEach((h) => { highlightMap[`${h.monthIdx}-${h.date}`] = h; });

function buildCells(month) {
  const { days, firstWeekday, prevDays } = month;
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ date: prevDays - firstWeekday + 1 + i, inMonth: false });
  }
  for (let d = 1; d <= days; d++) {
    cells.push({ date: d, inMonth: true });
  }
  while (cells.length < 35) {
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

// ===== Mini month calendar =====
function MiniDayCell({ cell, monthIdx, weekdayIdx, isToday, isTablet }) {
  const highlight = cell.inMonth ? highlightMap[`${monthIdx}-${cell.date}`] : null;
  const busy = cell.inMonth && weekdayIdx < 5;

  let dots = [];
  if (highlight) dots = [highlight.color];
  else if (busy) dots = ['#5C9460', '#8A6BB8'];

  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ minHeight: isTablet ? 36 : 44, opacity: cell.inMonth ? 1 : 0.3 }}
    >
      <div
        className="font-display font-semibold inline-flex items-center justify-center"
        style={isToday
          ? { backgroundColor: palette.brand, color: '#fff', width: 20, height: 20, borderRadius: '50%', fontSize: '11px' }
          : { width: 20, height: 20, fontSize: '11px', color: palette.ink }}
      >
        {cell.date}
      </div>
      <div className="flex gap-0.5 mt-0.5" style={{ height: 4 }}>
        {dots.map((c, i) => (
          <span key={i} className="rounded-full flex-shrink-0" style={{ width: 4, height: 4, backgroundColor: c }} />
        ))}
      </div>
    </div>
  );
}

function MiniMonth({ month, isTablet }) {
  const cells = buildCells(month);
  const borderLine = `1px solid ${palette.line}`;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: borderLine, backgroundColor: palette.surface }}>
      <div className="font-display text-base font-bold px-3 py-2" style={{ borderBottom: borderLine }}>
        {month.name}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={i} className="text-center text-xs font-semibold uppercase py-1" style={{ color: palette.inkSoft }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((cell, i) => (
          <MiniDayCell
            key={i}
            cell={cell}
            monthIdx={month.monthIdx}
            weekdayIdx={i % 7}
            isToday={month.monthIdx === TODAY_MONTH_IDX && cell.inMonth && cell.date === TODAY_DATE}
            isTablet={isTablet}
          />
        ))}
      </div>
    </div>
  );
}

// ===== Quarter highlights =====
function MonthHighlightList({ month }) {
  const items = HIGHLIGHTS.filter((h) => h.monthIdx === month.monthIdx);
  return (
    <div>
      <div className="text-xs font-semibold uppercase mb-1.5" style={{ color: palette.inkSoft }}>
        {month.name}
      </div>
      {items.length === 0 ? (
        <div className="text-sm" style={{ color: palette.inkSoft }}>Nothing notable</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((h, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {h.icon === 'cake'
                ? <Cake size={14} style={{ color: h.color, flexShrink: 0 }} />
                : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: h.color }} />}
              <span className="flex-1 truncate">{h.title}</span>
              <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{month.short} {h.date}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuarterHighlights({ isTablet }) {
  return (
    <div>
      <div className="font-display text-lg font-bold mb-3">This quarter</div>
      <div className={isTablet ? 'grid grid-cols-3 gap-6' : 'space-y-4'}>
        {MONTHS.map((m) => <MonthHighlightList key={m.monthIdx} month={m} />)}
      </div>
    </div>
  );
}

// ===== App shell =====
export default function RoostQuarterView() {
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
            <button className="p-1.5 rounded-full" aria-label="Previous quarter"><ChevronLeft size={18} /></button>
            <div className="font-display text-lg font-semibold">Apr – Jun 2026</div>
            <button className="p-1.5 rounded-full" aria-label="Next quarter"><ChevronRight size={18} /></button>
            <button className="text-sm font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: palette.mist, color: palette.brand }}>
              Today
            </button>
          </div>
          <div className="flex-1" />
          <ViewSwitcher active="Quarter" />
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
              <button className="p-1 rounded-full" aria-label="Previous quarter"><ChevronLeft size={16} /></button>
              <div className="font-display text-base font-semibold">Apr – Jun 2026</div>
              <button className="p-1 rounded-full" aria-label="Next quarter"><ChevronRight size={16} /></button>
            </div>
            <button className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: palette.brand, color: '#fff' }}>
              Today
            </button>
          </div>
          <ViewSwitcher active="Quarter" />
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
          <div className={isTablet ? 'grid grid-cols-3 gap-4' : 'space-y-3'}>
            {MONTHS.map((m) => <MiniMonth key={m.monthIdx} month={m} isTablet={isTablet} />)}
          </div>

          <div className={isTablet ? 'mt-6' : 'mt-4'}>
            <QuarterHighlights isTablet={isTablet} />
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
