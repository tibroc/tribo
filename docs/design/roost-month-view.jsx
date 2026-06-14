import React, { useState } from 'react';
import {
  Home, CalendarDays, CheckSquare, ListTodo, Users,
  ChevronLeft, ChevronRight, Plus, Sun, Cake,
} from 'lucide-react';

// ===== Design tokens (shared with week view) =====
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

const PEOPLE = {
  alberto: { name: 'Alberto', color: '#4C7EA8' },
  hilda: { name: 'Hilda', color: '#D1577A' },
  marie: { name: 'Marie', color: '#5C9460' },
  guilherme: { name: 'Guilherme', color: '#8A6BB8' },
};
const SHARED_COLOR = '#D99A2B';

// June 2026 — June 1 is a Monday, 30 days, "today" = June 14 (Sunday)
const TODAY_DATE = 14;
const DAYS_IN_MONTH = 30;
const TOTAL_CELLS = 35;
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FULL_WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function dayName(date) {
  return FULL_WEEKDAY[(date - 1) % 7];
}

const EVENT_TIMES = {
  School: '8:00 AM',
  Soccer: '4:00 PM',
  Piano: '3:00 PM',
  Gym: '6:00 AM',
  'Team meeting': '9:00 AM',
  'Date night': '7:00 PM',
  'Family BBQ': '12:00 PM',
  'Family dinner': '5:00 PM',
  'Long run': '7:00 AM',
  Dentist: '3:30 PM',
  Recital: '2:00 PM',
  'Doctor checkup': '10:00 AM',
};

// ===== Sample month data =====
const monthEvents = {
  1: [{ p: 'marie', title: 'School' }, { p: 'guilherme', title: 'School' }, { p: 'alberto', title: 'Gym' }, { p: 'hilda', title: 'Team meeting' }],
  2: [{ p: 'marie', title: 'School' }, { p: 'marie', title: 'Soccer' }, { p: 'guilherme', title: 'School' }],
  3: [{ p: 'marie', title: 'School' }, { p: 'guilherme', title: 'School' }, { p: 'guilherme', title: 'Piano' }, { p: 'alberto', title: 'Gym' }],
  4: [{ p: 'marie', title: 'School' }, { p: 'marie', title: 'Soccer' }, { p: 'guilherme', title: 'School' }],
  5: [{ p: 'marie', title: 'School' }, { p: 'guilherme', title: 'School' }, { p: 'alberto', title: 'Gym' }],
  6: [{ shared: true, title: 'Family BBQ' }],
  7: [{ shared: true, title: 'Family dinner' }, { p: 'alberto', title: 'Long run' }],
  8: [{ p: 'marie', title: 'School' }, { p: 'guilherme', title: 'School' }, { p: 'alberto', title: 'Gym' }, { p: 'hilda', title: 'Team meeting' }],
  9: [{ p: 'marie', title: 'School' }, { p: 'marie', title: 'Soccer' }, { p: 'guilherme', title: 'School' }],
  10: [{ p: 'marie', title: 'School' }, { p: 'guilherme', title: 'School' }, { p: 'guilherme', title: 'Piano' }, { p: 'alberto', title: 'Gym' }],
  11: [{ p: 'marie', title: 'School' }, { p: 'marie', title: 'Soccer' }, { p: 'guilherme', title: 'School' }],
  12: [{ p: 'marie', title: 'School' }, { p: 'guilherme', title: 'School' }, { p: 'alberto', title: 'Gym' }],
  13: [{ p: 'alberto', title: 'Date night' }, { p: 'hilda', title: 'Date night' }],
  14: [{ shared: true, title: 'Family dinner' }, { p: 'alberto', title: 'Long run' }],
  15: [{ p: 'marie', title: 'School' }, { p: 'guilherme', title: 'School' }, { p: 'alberto', title: 'Gym' }, { p: 'hilda', title: 'Team meeting' }],
  16: [{ p: 'marie', title: 'School' }, { p: 'marie', title: 'Soccer' }, { p: 'guilherme', title: 'School' }],
  17: [{ p: 'marie', title: 'School' }, { p: 'guilherme', title: 'School' }, { p: 'guilherme', title: 'Piano' }, { p: 'alberto', title: 'Gym' }],
  18: [{ p: 'marie', title: 'School' }, { p: 'marie', title: 'Soccer' }, { p: 'guilherme', title: 'School' }, { shared: true, title: "Grandma's birthday", icon: 'cake' }],
  19: [{ p: 'marie', title: 'School' }, { p: 'guilherme', title: 'School' }, { p: 'alberto', title: 'Gym' }],
  20: [{ p: 'marie', title: 'Recital' }],
  21: [],
  22: [{ p: 'marie', title: 'School' }, { p: 'guilherme', title: 'School' }, { p: 'alberto', title: 'Gym' }, { p: 'hilda', title: 'Team meeting' }],
  23: [{ p: 'marie', title: 'School' }, { p: 'marie', title: 'Soccer' }, { p: 'guilherme', title: 'School' }],
  24: [{ p: 'marie', title: 'School' }, { p: 'guilherme', title: 'School' }, { p: 'guilherme', title: 'Piano' }, { p: 'alberto', title: 'Gym' }],
  25: [{ p: 'marie', title: 'School' }, { p: 'marie', title: 'Soccer' }, { p: 'guilherme', title: 'School' }, { p: 'hilda', title: 'Dentist' }],
  26: [{ p: 'marie', title: 'School' }, { p: 'guilherme', title: 'School' }, { shared: true, title: 'School holiday begins' }],
  27: [],
  28: [],
  29: [{ p: 'alberto', title: 'Gym' }, { p: 'guilherme', title: 'Doctor checkup' }],
  30: [{ p: 'marie', title: 'Soccer' }],
};

const monthHighlights = [
  { date: 18, title: "Grandma's birthday" },
  { date: 26, title: 'School holiday begins' },
];

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

function MiniChip({ ev }) {
  const color = ev.shared ? SHARED_COLOR : PEOPLE[ev.p].color;
  return (
    <div
      className="rounded px-1 truncate flex items-center gap-0.5"
      style={{ backgroundColor: color + '20', borderLeft: `2px solid ${color}`, color: palette.ink, fontSize: '10px', lineHeight: '14px' }}
    >
      {ev.icon === 'cake' && <Cake size={9} />}
      {ev.title}
    </div>
  );
}

// ===== Month grid =====
function DayCell({ cell, events, isSelected, isTablet, onClick }) {
  const { date, inMonth, isToday } = cell;
  const shared = events.filter((e) => e.shared);
  const personal = events.filter((e) => !e.shared);
  const ordered = [...shared, ...personal];
  const extra = ordered.length - 2;

  const uniqueColors = [];
  ordered.forEach((ev) => {
    const c = ev.shared ? SHARED_COLOR : PEOPLE[ev.p].color;
    if (!uniqueColors.includes(c)) uniqueColors.push(c);
  });

  return (
    <button
      onClick={onClick}
      className="w-full h-full text-left p-1.5 flex flex-col border-0 outline-none"
      style={{
        backgroundColor: isToday ? palette.brandSoft : 'transparent',
        boxShadow: isSelected ? `inset 0 0 0 2px ${palette.amber}` : 'none',
        opacity: inMonth ? 1 : 0.4,
        minHeight: isTablet ? 96 : 56,
        cursor: inMonth ? 'pointer' : 'default',
      }}
    >
      <div
        className="font-display text-sm font-semibold inline-flex items-center justify-center"
        style={isToday
          ? { backgroundColor: palette.brand, color: '#fff', width: 22, height: 22, borderRadius: '50%' }
          : { width: 22, height: 22, color: palette.ink }}
      >
        {date}
      </div>

      {isTablet ? (
        <div className="mt-1 space-y-1">
          {ordered.slice(0, 2).map((ev, i) => <MiniChip key={i} ev={ev} />)}
          {extra > 0 && (
            <div style={{ fontSize: '10px', color: palette.inkSoft }}>+{extra} more</div>
          )}
        </div>
      ) : (
        <div className="mt-1 flex gap-0.5 flex-wrap">
          {uniqueColors.map((c, i) => (
            <span key={i} className="rounded-full flex-shrink-0" style={{ width: 5, height: 5, backgroundColor: c }} />
          ))}
        </div>
      )}
    </button>
  );
}

function MonthGrid({ selectedDate, onSelect, isTablet }) {
  const cells = [];
  for (let i = 0; i < TOTAL_CELLS; i++) {
    if (i < DAYS_IN_MONTH) {
      cells.push({ date: i + 1, inMonth: true, isToday: (i + 1) === TODAY_DATE });
    } else {
      cells.push({ date: i - DAYS_IN_MONTH + 1, inMonth: false, isToday: false });
    }
  }
  const borderLine = `1px solid ${palette.line}`;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: borderLine, backgroundColor: palette.surface }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="text-center text-xs font-semibold uppercase py-2" style={{ color: palette.inkSoft, borderBottom: borderLine }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((cell, i) => {
          const events = cell.inMonth ? (monthEvents[cell.date] || []) : [];
          const isLastCol = (i % 7) === 6;
          const isLastRow = i >= TOTAL_CELLS - 7;
          return (
            <div key={i} style={{ borderRight: isLastCol ? 'none' : borderLine, borderBottom: isLastRow ? 'none' : borderLine }}>
              <DayCell
                cell={cell}
                events={events}
                isSelected={cell.inMonth && cell.date === selectedDate}
                isTablet={isTablet}
                onClick={() => cell.inMonth && onSelect(cell.date)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== Selected day agenda =====
function SelectedDayPanel({ date }) {
  const events = monthEvents[date] || [];
  const shared = events.filter((e) => e.shared);
  const personal = events.filter((e) => !e.shared);
  const ordered = [...shared, ...personal];
  const isToday = date === TODAY_DATE;

  return (
    <div className="rounded-2xl p-3" style={{ backgroundColor: isToday ? palette.brandSoft : palette.surface, border: `1px solid ${palette.line}` }}>
      <div className="flex items-center gap-2 mb-2">
        <div
          className="font-display text-sm font-bold inline-flex items-center justify-center flex-shrink-0"
          style={isToday
            ? { backgroundColor: palette.brand, color: '#fff', width: 26, height: 26, borderRadius: '50%' }
            : { width: 26, height: 26 }}
        >
          {date}
        </div>
        <div className="text-sm font-semibold uppercase" style={{ color: palette.inkSoft }}>
          {dayName(date)}, June {date}{isToday ? ' · Today' : ''}
        </div>
      </div>

      {ordered.length === 0 ? (
        <div className="text-sm pl-1" style={{ color: palette.inkSoft }}>Nothing scheduled</div>
      ) : (
        <div className="space-y-1.5">
          {ordered.map((ev, i) => {
            const person = ev.shared ? { name: 'Family', color: SHARED_COLOR } : PEOPLE[ev.p];
            const time = EVENT_TIMES[ev.title];
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: person.color }} />
                {time && <span className="text-xs w-20 flex-shrink-0" style={{ color: palette.inkSoft }}>{time}</span>}
                <span className="text-sm truncate flex-1 flex items-center gap-1">
                  {ev.icon === 'cake' && <Cake size={12} />}
                  {ev.title}
                </span>
                <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{person.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MonthHighlights() {
  return (
    <div>
      <div className="font-display text-base font-bold mb-2 flex items-center gap-2">
        <Cake size={16} /> This month
      </div>
      <div className="space-y-2">
        {monthHighlights.map((h, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SHARED_COLOR }} />
            <span className="flex-1 truncate">{h.title}</span>
            <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>Jun {h.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== App shell =====
export default function RoostMonthView() {
  const [isTablet, setIsTablet] = useState(false);
  const [selectedDate, setSelectedDate] = useState(TODAY_DATE);

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
            <button className="p-1.5 rounded-full" aria-label="Previous month"><ChevronLeft size={18} /></button>
            <div className="font-display text-lg font-semibold">June 2026</div>
            <button className="p-1.5 rounded-full" aria-label="Next month"><ChevronRight size={18} /></button>
            <button className="text-sm font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: palette.mist, color: palette.brand }}>
              Today
            </button>
          </div>
          <div className="flex-1" />
          <ViewSwitcher active="Month" />
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
              <button className="p-1 rounded-full" aria-label="Previous month"><ChevronLeft size={16} /></button>
              <div className="font-display text-base font-semibold">June 2026</div>
              <button className="p-1 rounded-full" aria-label="Next month"><ChevronRight size={16} /></button>
            </div>
            <button className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: palette.brand, color: '#fff' }}>
              Today
            </button>
          </div>
          <ViewSwitcher active="Month" />
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
          <MonthGrid selectedDate={selectedDate} onSelect={setSelectedDate} isTablet={isTablet} />

          <div className={!isTablet ? 'mt-3 space-y-4' : 'hidden'}>
            <SelectedDayPanel date={selectedDate} />
            <MonthHighlights />
          </div>
        </main>

        {/* Right panel (tablet) */}
        <aside className={isTablet ? 'block w-80 p-5 space-y-5' : 'hidden'} style={{ borderLeft: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
          <SelectedDayPanel date={selectedDate} />
          <MonthHighlights />
        </aside>
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
