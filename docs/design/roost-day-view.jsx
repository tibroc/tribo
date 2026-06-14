import React, { useState } from 'react';
import {
  Home, CalendarDays, CheckSquare, ListTodo, Users,
  ChevronLeft, ChevronRight, Plus, Sun,
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

const PEOPLE = [
  { id: 'alberto', name: 'Alberto', color: '#4C7EA8' },
  { id: 'hilda', name: 'Hilda', color: '#D1577A' },
  { id: 'marie', name: 'Marie', color: '#5C9460' },
  { id: 'guilherme', name: 'Guilherme', color: '#8A6BB8' },
];

// ===== Timeline config =====
const HOUR_START = 6;
const HOUR_END = 21; // 6 AM – 9 PM
const HOUR_HEIGHT = 56;
const NOW = 12.5; // placeholder "current time" for this mock — would be live in the real app
const HOURS = [];
for (let h = HOUR_START; h < HOUR_END; h++) HOURS.push(h);
const TOTAL_HEIGHT = (HOUR_END - HOUR_START) * HOUR_HEIGHT;

function timeToY(t) {
  return (t - HOUR_START) * HOUR_HEIGHT;
}
function formatTime(t) {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  const period = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return m === 0 ? `${h12}:00 ${period}` : `${h12}:${m} ${period}`;
}
function formatHour(h) {
  const period = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12} ${period}`;
}
function formatRange(start, end) {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

// ===== Sample data — Sunday, June 14 =====
const dayEvents = {
  alberto: [{ title: 'Long run', start: 7, end: 8 }],
  hilda: [{ title: 'Yoga', start: 8, end: 9 }],
  marie: [{ title: "At a friend's house", start: 14, end: 16 }],
  guilherme: [],
};
const sharedDayEvents = [
  { title: 'Family dinner', start: 17, end: 18.5 },
  { title: 'Movie night', start: 19.5, end: 21 },
];

const todayChores = [
  { title: 'Water the plants', who: 'Marie', color: '#5C9460', done: false },
  { title: 'Tidy the living room', who: 'Guilherme', color: '#8A6BB8', done: true },
];
const todayTodos = [
  { title: 'Pack swim bag for tomorrow', done: false },
  { title: 'Reply to school email', done: false },
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

// ===== Timeline =====
function TimeAxis() {
  return (
    <div className="relative" style={{ height: TOTAL_HEIGHT }}>
      {HOURS.map((h) => (
        <div key={h} className="absolute right-2 text-xs" style={{ top: timeToY(h) - 7, color: palette.inkSoft }}>
          {formatHour(h)}
        </div>
      ))}
      <div className="absolute right-0 rounded-full" style={{ top: timeToY(NOW) - 3, width: 6, height: 6, backgroundColor: palette.amber }} />
    </div>
  );
}

function TimelineColumn({ events, isLast }) {
  return (
    <div
      className="relative"
      style={{
        height: TOTAL_HEIGHT,
        borderRight: isLast ? 'none' : `1px solid ${palette.line}`,
        backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${HOUR_HEIGHT - 1}px, ${palette.line} ${HOUR_HEIGHT - 1}px, ${palette.line} ${HOUR_HEIGHT}px)`,
      }}
    >
      {events.map((ev, i) => (
        <div
          key={i}
          className="absolute left-1 right-1 rounded-md px-2 py-1 overflow-hidden"
          style={{
            top: timeToY(ev.start) + 2,
            height: (ev.end - ev.start) * HOUR_HEIGHT - 4,
            backgroundColor: ev.color + '20',
            borderLeft: `3px solid ${ev.color}`,
          }}
        >
          <div className="text-xs font-semibold truncate" style={{ color: palette.ink }}>{ev.title}</div>
          <div className="truncate" style={{ color: palette.inkSoft, fontSize: '10px' }}>
            {formatRange(ev.start, ev.end)}{ev.person ? ` · ${ev.person}` : ''}
          </div>
        </div>
      ))}

      <div className="absolute left-0 right-0" style={{ top: timeToY(NOW), height: 0, borderTop: `2px solid ${palette.amber}` }} />
    </div>
  );
}

function PersonHeader({ name, color, icon: Icon, isLast }) {
  return (
    <div className="flex items-center gap-2 px-2 py-2" style={{ borderBottom: `1px solid ${palette.line}`, borderRight: isLast ? 'none' : `1px solid ${palette.line}` }}>
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: color }}>
        {Icon ? <Icon size={14} /> : name[0]}
      </div>
      <div className="text-sm font-semibold truncate">{name}</div>
    </div>
  );
}

// ===== Today panel: chores + to-dos =====
function ChoresCard() {
  return (
    <div>
      <div className="font-display text-base font-bold mb-2 flex items-center gap-2">
        <CheckSquare size={16} /> Today's chores
      </div>
      <div className="space-y-2">
        {todayChores.map((c, i) => (
          <label key={i} className="flex items-center gap-2 text-sm">
            <input type="checkbox" defaultChecked={c.done} className="w-4 h-4 rounded" readOnly />
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
            <span className={c.done ? 'line-through' : ''} style={{ color: c.done ? palette.inkSoft : palette.ink }}>
              {c.title}
            </span>
            <span className="text-xs ml-auto flex-shrink-0" style={{ color: palette.inkSoft }}>{c.who}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function TodosCard() {
  return (
    <div>
      <div className="font-display text-base font-bold mb-2 flex items-center gap-2">
        <ListTodo size={16} /> To-dos
      </div>
      <div className="space-y-2">
        {todayTodos.map((t, i) => (
          <label key={i} className="flex items-center gap-2 text-sm">
            <input type="checkbox" defaultChecked={t.done} className="w-4 h-4 rounded" readOnly />
            <span className={t.done ? 'line-through' : ''} style={{ color: t.done ? palette.inkSoft : palette.ink }}>
              {t.title}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function TodayPanel({ isTablet }) {
  return (
    <div className={isTablet ? 'rounded-2xl p-4 grid grid-cols-2 gap-6' : 'rounded-2xl p-4 space-y-5'} style={{ border: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
      <ChoresCard />
      <TodosCard />
    </div>
  );
}

// ===== App shell =====
export default function RoostDayView() {
  const [isTablet, setIsTablet] = useState(false);

  // combined timeline for mobile
  const combinedEvents = [
    ...PEOPLE.flatMap((p) => dayEvents[p.id].map((ev) => ({ ...ev, color: p.color, person: p.name }))),
    ...sharedDayEvents.map((ev) => ({ ...ev, color: SHARED_COLOR, person: 'Family' })),
  ].sort((a, b) => a.start - b.start);

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
            <button className="p-1.5 rounded-full" aria-label="Previous day"><ChevronLeft size={18} /></button>
            <div className="font-display text-lg font-semibold">Sunday, June 14</div>
            <button className="p-1.5 rounded-full" aria-label="Next day"><ChevronRight size={18} /></button>
            <button className="text-sm font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: palette.mist, color: palette.brand }}>
              Today
            </button>
          </div>
          <div className="flex-1" />
          <ViewSwitcher active="Day" />
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
              <button className="p-1 rounded-full" aria-label="Previous day"><ChevronLeft size={16} /></button>
              <div className="font-display text-base font-semibold">Sunday, June 14</div>
              <button className="p-1 rounded-full" aria-label="Next day"><ChevronRight size={16} /></button>
            </div>
            <button className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: palette.brand, color: '#fff' }}>
              Today
            </button>
          </div>
          <ViewSwitcher active="Day" />
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
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
            {isTablet ? (
              <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(5, 1fr)' }}>
                <div style={{ borderBottom: `1px solid ${palette.line}`, borderRight: `1px solid ${palette.line}` }} />
                {PEOPLE.map((p) => <PersonHeader key={p.id} name={p.name} color={p.color} />)}
                <PersonHeader name="Family" color={SHARED_COLOR} icon={Users} isLast />

                <TimeAxis />
                {PEOPLE.map((p) => (
                  <TimelineColumn key={p.id} events={dayEvents[p.id].map((ev) => ({ ...ev, color: p.color }))} />
                ))}
                <TimelineColumn events={sharedDayEvents.map((ev) => ({ ...ev, color: SHARED_COLOR }))} isLast />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr' }}>
                <TimeAxis />
                <TimelineColumn events={combinedEvents} isLast />
              </div>
            )}
          </div>

          <div className="mt-4">
            <TodayPanel isTablet={isTablet} />
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
