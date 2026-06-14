import React, { useState } from 'react';
import {
  Home, CalendarDays, CheckSquare, ListTodo, Users,
  ChevronLeft, ChevronRight, Plus, Sun, Cake,
} from 'lucide-react';

// ===== Design tokens =====
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

const SHARED_COLOR = '#D99A2B';

const VIEWS = ['Day', 'Week', 'Month', 'Quarter', 'Year'];

// ===== Sample family + data =====
const family = [
  { name: 'Alberto', role: 'Dad', color: '#4C7EA8' },
  { name: 'Hilda', role: 'Mum', color: '#D1577A' },
  { name: 'Marie', role: 'Kid', color: '#5C9460' },
  { name: 'Guilherme', role: 'Kid', color: '#8A6BB8' },
];

const days = [
  { label: 'Mon', num: 9 },
  { label: 'Tue', num: 10 },
  { label: 'Wed', num: 11 },
  { label: 'Thu', num: 12 },
  { label: 'Fri', num: 13 },
  { label: 'Sat', num: 14 },
  { label: 'Sun', num: 15 },
];
const TODAY_IDX = 2;

const eventsByPerson = [
  // Alex
  [
    [{ t: '6:00 AM', title: 'Gym' }],
    [],
    [{ t: '6:00 AM', title: 'Gym' }],
    [],
    [{ t: '6:00 AM', title: 'Gym' }, { t: '7:00 PM', title: 'Date night' }],
    [],
    [],
  ],
  // Priya
  [
    [{ t: '9:00 AM', title: 'Team meeting' }],
    [],
    [],
    [{ t: '3:30 PM', title: 'Dentist' }],
    [{ t: '7:00 PM', title: 'Date night' }],
    [],
    [],
  ],
  // Maya
  [
    [{ t: '8:00 AM', title: 'School' }],
    [{ t: '8:00 AM', title: 'School' }, { t: '4:00 PM', title: 'Soccer' }],
    [{ t: '8:00 AM', title: 'School' }],
    [{ t: '8:00 AM', title: 'School' }, { t: '4:00 PM', title: 'Soccer' }],
    [{ t: '8:00 AM', title: 'School' }],
    [],
    [],
  ],
  // Theo
  [
    [{ t: '8:00 AM', title: 'School' }],
    [{ t: '8:00 AM', title: 'School' }],
    [{ t: '8:00 AM', title: 'School' }, { t: '3:00 PM', title: 'Piano' }],
    [{ t: '8:00 AM', title: 'School' }],
    [{ t: '8:00 AM', title: 'School' }],
    [],
    [],
  ],
];

const sharedEvents = [
  [], [], [], [{ title: "Grandma's birthday", icon: true }], [], [],
  [{ t: '5:00 PM', title: 'Family dinner' }],
];

const chores = [
  { title: 'Mow the lawn', color: '#4C7EA8', done: false },
  { title: 'Clean the bathroom', color: '#D1577A', done: true },
  { title: 'Take out recycling', color: '#8A6BB8', done: false },
  { title: 'Water the plants', color: '#5C9460', done: true },
];

const todos = [
  { title: 'Book dentist for Theo', done: false },
  { title: 'Renew car registration', done: false },
  { title: 'Order birthday gift', done: true },
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

function EventChip({ ev, color, icon }) {
  return (
    <div
      className="rounded-md px-1.5 py-1 mb-1 leading-tight"
      style={{ backgroundColor: color + '20', borderLeft: `3px solid ${color}` }}
    >
      {ev.t && (
        <div style={{ color: palette.inkSoft, fontSize: '10px', fontWeight: 600 }}>{ev.t}</div>
      )}
      <div className="font-medium truncate flex items-center gap-1 text-xs" style={{ color: palette.ink }}>
        {icon && <Cake size={12} />}
        {ev.title}
      </div>
    </div>
  );
}

// ===== Tablet / wall-display grid =====
function WeekGrid() {
  const cellBase = { padding: '8px' };
  const borderLine = `1px solid ${palette.line}`;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(7, 1fr)' }}>
      {/* header row */}
      <div style={{ ...cellBase, borderBottom: borderLine, borderRight: borderLine }} />
      {days.map((d, i) => (
        <div
          key={d.label}
          className="text-center"
          style={{
            ...cellBase,
            borderBottom: borderLine,
            borderRight: i < 6 ? borderLine : 'none',
            backgroundColor: i === TODAY_IDX ? palette.brandSoft : 'transparent',
          }}
        >
          <div className="text-xs font-semibold uppercase" style={{ color: palette.inkSoft }}>{d.label}</div>
          <div
            className="font-display text-lg font-bold mt-1 inline-flex items-center justify-center"
            style={i === TODAY_IDX
              ? { backgroundColor: palette.brand, color: '#fff', width: 28, height: 28, borderRadius: '50%' }
              : { width: 28, height: 28 }}
          >
            {d.num}
          </div>
        </div>
      ))}

      {/* person rows */}
      {family.map((person, pi) => (
        <React.Fragment key={person.name}>
          <div
            className="flex items-center gap-2"
            style={{ ...cellBase, borderBottom: borderLine, borderRight: borderLine }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: person.color }}
            >
              {person.name[0]}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{person.name}</div>
              <div className="text-xs truncate" style={{ color: palette.inkSoft }}>{person.role}</div>
            </div>
          </div>
          {days.map((d, di) => (
            <div
              key={di}
              style={{
                ...cellBase,
                borderBottom: borderLine,
                borderRight: di < 6 ? borderLine : 'none',
                backgroundColor: di === TODAY_IDX ? palette.brandSoft : 'transparent',
                minHeight: 64,
              }}
            >
              {eventsByPerson[pi][di].map((ev, ei) => (
                <EventChip key={ei} ev={ev} color={person.color} />
              ))}
            </div>
          ))}
        </React.Fragment>
      ))}

      {/* shared row */}
      <div className="flex items-center gap-2" style={{ ...cellBase, borderTop: borderLine, borderRight: borderLine }}>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0"
          style={{ backgroundColor: SHARED_COLOR }}
        >
          <Users size={16} />
        </div>
        <div className="text-sm font-semibold">Family</div>
      </div>
      {days.map((d, di) => (
        <div
          key={di}
          style={{
            ...cellBase,
            borderTop: borderLine,
            borderRight: di < 6 ? borderLine : 'none',
            backgroundColor: di === TODAY_IDX ? palette.brandSoft : 'transparent',
            minHeight: 56,
          }}
        >
          {sharedEvents[di].map((ev, ei) => (
            <EventChip key={ei} ev={ev} color={SHARED_COLOR} icon={ev.icon} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ===== Mobile agenda =====
function WeekAgenda() {
  return (
    <div className="space-y-2">
      {days.map((d, di) => {
        const dayEvents = [];
        family.forEach((p, pi) => {
          eventsByPerson[pi][di].forEach((ev) => dayEvents.push({ ...ev, person: p }));
        });
        sharedEvents[di].forEach((ev) =>
          dayEvents.push({ ...ev, person: { name: 'Family', color: SHARED_COLOR } })
        );
        const isToday = di === TODAY_IDX;

        return (
          <div
            key={di}
            className="rounded-2xl p-3"
            style={{
              backgroundColor: isToday ? palette.brandSoft : palette.surface,
              border: `1px solid ${palette.line}`,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="font-display text-sm font-bold inline-flex items-center justify-center flex-shrink-0"
                style={isToday
                  ? { backgroundColor: palette.brand, color: '#fff', width: 26, height: 26, borderRadius: '50%' }
                  : { width: 26, height: 26 }}
              >
                {d.num}
              </div>
              <div className="text-sm font-semibold uppercase" style={{ color: palette.inkSoft }}>
                {d.label}{isToday ? ' · Today' : ''}
              </div>
            </div>

            {dayEvents.length === 0 ? (
              <div className="text-sm pl-1" style={{ color: palette.inkSoft }}>Nothing scheduled</div>
            ) : (
              <div className="space-y-1.5">
                {dayEvents.map((ev, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ev.person.color }} />
                    {ev.t && <span className="text-xs w-16 flex-shrink-0" style={{ color: palette.inkSoft }}>{ev.t}</span>}
                    <span className="text-sm truncate flex-1 flex items-center gap-1">
                      {ev.icon && <Cake size={12} />}
                      {ev.title}
                    </span>
                    <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{ev.person.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ===== Side panel: chores / to-dos / review teaser =====
function ThisWeekPanel() {
  return (
    <div className="space-y-5">
      <div>
        <div className="font-display text-lg font-bold mb-1">This week</div>
        <div className="text-sm" style={{ color: palette.inkSoft }}>Last week: 11/14 chores · 3 to-dos done</div>
        <div className="h-1.5 rounded-full mt-2" style={{ backgroundColor: palette.line }}>
          <div className="h-1.5 rounded-full" style={{ width: '78%', backgroundColor: palette.brand }} />
        </div>
      </div>

      <div>
        <div className="font-display text-base font-bold mb-2 flex items-center gap-2">
          <CheckSquare size={16} /> Chores
        </div>
        <div className="space-y-2">
          {chores.map((c, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked={c.done} className="w-4 h-4 rounded" readOnly />
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
              <span className={c.done ? 'line-through' : ''} style={{ color: c.done ? palette.inkSoft : palette.ink }}>
                {c.title}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="font-display text-base font-bold mb-2 flex items-center gap-2">
          <ListTodo size={16} /> To-dos
        </div>
        <div className="space-y-2">
          {todos.map((t, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked={t.done} className="w-4 h-4 rounded" readOnly />
              <span className={t.done ? 'line-through' : ''} style={{ color: t.done ? palette.inkSoft : palette.ink }}>
                {t.title}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===== App shell =====
export default function RoostWeekView() {
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

      {/* Preview toggle — for testing layouts only, not part of the real app */}
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
        {/* Desktop / tablet row */}
        <div className={isTablet ? 'flex items-center gap-6 px-6 py-3' : 'hidden'}>
          <div className="font-display text-2xl font-bold flex items-center gap-2" style={{ color: palette.brand }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: palette.amber }} />
            Roost
          </div>
          <div className="flex items-center gap-3">
            <button className="p-1.5 rounded-full" aria-label="Previous week"><ChevronLeft size={18} /></button>
            <div className="font-display text-lg font-semibold">Jun 9 – 15</div>
            <button className="p-1.5 rounded-full" aria-label="Next week"><ChevronRight size={18} /></button>
            <button
              className="text-sm font-semibold px-3 py-1 rounded-full"
              style={{ backgroundColor: palette.mist, color: palette.brand }}
            >
              Today
            </button>
          </div>
          <div className="flex-1" />
          <ViewSwitcher active="Week" />
          <div className="flex items-center gap-1.5 text-sm" style={{ color: palette.inkSoft }}>
            <Sun size={18} style={{ color: palette.amber }} />
            72°
          </div>
        </div>

        {/* Mobile rows */}
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
              <button className="p-1 rounded-full" aria-label="Previous week"><ChevronLeft size={16} /></button>
              <div className="font-display text-base font-semibold">Jun 9 – 15</div>
              <button className="p-1 rounded-full" aria-label="Next week"><ChevronRight size={16} /></button>
            </div>
            <button
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: palette.brand, color: '#fff' }}
            >
              Today
            </button>
          </div>
          <ViewSwitcher active="Week" />
        </div>
      </header>

      <div className="flex">
        {/* Side rail (lg) */}
        <nav
          className={isTablet ? 'flex flex-col items-center gap-1 py-4 px-2' : 'hidden'}
          style={{ borderRight: `1px solid ${palette.line}`, backgroundColor: palette.surface }}
        >
          <NavIcon icon={Home} label="Today" />
          <NavIcon icon={CalendarDays} label="Calendar" active />
          <NavIcon icon={CheckSquare} label="Chores" />
          <NavIcon icon={ListTodo} label="To-dos" />
          <NavIcon icon={Users} label="Family" />
        </nav>

        {/* Main content */}
        <main className={isTablet ? 'flex-1 p-6' : 'flex-1 p-3 pb-24'}>
          <div
            className={isTablet ? 'rounded-2xl overflow-hidden' : 'hidden'}
            style={{ border: `1px solid ${palette.line}`, backgroundColor: palette.surface }}
          >
            <WeekGrid />
          </div>

          <div className={!isTablet ? 'block' : 'hidden'}>
            <WeekAgenda />
          </div>

          <div className={!isTablet ? 'mt-6' : 'hidden'}>
            <ThisWeekPanel />
          </div>
        </main>

        {/* Right panel (lg) */}
        <aside
          className={isTablet ? 'block w-80 p-5' : 'hidden'}
          style={{ borderLeft: `1px solid ${palette.line}`, backgroundColor: palette.surface }}
        >
          <ThisWeekPanel />
        </aside>
      </div>
      </div>
      </div>

      {/* Bottom nav (mobile) */}
      <nav
        className={!isTablet ? 'fixed bottom-0 left-0 right-0 flex items-center justify-around py-2' : 'hidden'}
        style={{ borderTop: `1px solid ${palette.line}`, backgroundColor: palette.surface }}
      >
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
