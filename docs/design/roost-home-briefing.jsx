import React, { useState } from 'react';
import {
  Home, CalendarDays, CheckSquare, ListTodo, Users,
  Plus, Sun, Cake, Star, Sparkles,
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

const SHARED_COLOR = '#D99A2B';

const PEOPLE = [
  { id: 'alberto', name: 'Alberto', color: '#4C7EA8' },
  { id: 'hilda', name: 'Hilda', color: '#D1577A' },
  { id: 'marie', name: 'Marie', color: '#5C9460' },
  { id: 'guilherme', name: 'Guilherme', color: '#8A6BB8' },
];

// ===== Sample data — briefing for Monday, June 15 (week of Jun 15–21) =====
const todayAgenda = [
  { time: '6:00 AM', title: 'Gym', color: '#4C7EA8', person: 'Alberto' },
  { time: '8:00 AM', title: 'School', color: '#5C9460', person: 'Marie' },
  { time: '8:00 AM', title: 'School', color: '#8A6BB8', person: 'Guilherme' },
  { time: '9:00 AM', title: 'Team meeting', color: '#D1577A', person: 'Hilda' },
];

const personWeeks = {
  alberto: {
    highlights: [
      { label: 'Gym', days: 'Mon, Wed, Fri' },
    ],
    chores: ['Mow the lawn'],
  },
  hilda: {
    highlights: [
      { label: 'Team meeting', days: 'Mon, 9:00 AM' },
    ],
    chores: ['Clean the bathroom'],
  },
  marie: {
    highlights: [
      { label: 'School', days: 'Mon – Fri' },
      { label: 'Soccer practice', days: 'Tue, Thu' },
      { label: 'Recital', days: 'Sat, 2:00 PM', special: true },
    ],
    chores: ['Water the plants'],
  },
  guilherme: {
    highlights: [
      { label: 'School', days: 'Mon – Fri' },
      { label: 'Piano lesson', days: 'Wed' },
    ],
    chores: ['Take out recycling'],
  },
};

const familyHighlights = [
  { title: "Grandma's birthday", day: 'Thursday', color: SHARED_COLOR, icon: 'cake' },
  { title: 'Family movie night', day: 'Friday', color: SHARED_COLOR },
];

const lastWeek = { choresDone: 11, choresTotal: 14, todosDone: 3, todosTotal: 3 };
const countdown = { days: 11, title: 'Summer holidays begin' };

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

// ===== Sections =====
function GreetingHero() {
  return (
    <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: palette.brandSoft, border: `1px solid ${palette.line}` }}>
      <div className="font-display text-xl font-bold mb-1">Good morning!</div>
      <div className="text-sm mb-3" style={{ color: palette.inkSoft }}>Here's your week ahead — Monday, June 15 to Sunday, June 21</div>
      <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5" style={{ backgroundColor: palette.surface }}>
        <Sparkles size={14} style={{ color: palette.amber }} />
        <span className="text-sm font-semibold">{countdown.days} days until {countdown.title}</span>
      </div>
    </div>
  );
}

function TodayStrip() {
  return (
    <Card className="mb-4">
      <div className="text-xs font-semibold uppercase mb-2" style={{ color: palette.inkSoft }}>Today · Monday, June 15</div>
      <div className="space-y-1.5">
        {todayAgenda.map((ev, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
            <span className="text-xs w-16 flex-shrink-0" style={{ color: palette.inkSoft }}>{ev.time}</span>
            <span className="flex-1 truncate">{ev.title}</span>
            <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{ev.person}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PersonWeekCard({ person }) {
  const data = personWeeks[person.id];
  return (
    <Card>
      <div className="-m-4 mb-3 rounded-t-2xl" style={{ height: 4, backgroundColor: person.color }} />
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ backgroundColor: person.color }}>
          {person.name[0]}
        </div>
        <div className="font-display text-base font-bold">{person.name}'s week</div>
      </div>

      <div className="space-y-2 mb-3">
        {data.highlights.map((h, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            {h.special
              ? <Star size={14} style={{ color: palette.amber, flexShrink: 0 }} />
              : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: person.color }} />}
            <span className="flex-1">{h.label}</span>
            <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{h.days}</span>
          </div>
        ))}
      </div>

      {data.chores.length > 0 && (
        <div className="pt-2" style={{ borderTop: `1px solid ${palette.line}` }}>
          <div className="text-xs font-semibold uppercase mb-1.5" style={{ color: palette.inkSoft }}>Chores this week</div>
          {data.chores.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <CheckSquare size={13} style={{ color: palette.inkSoft, flexShrink: 0 }} />
              {c}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function FamilyHighlightsCard() {
  return (
    <Card>
      <div className="font-display text-base font-bold mb-2 flex items-center gap-2">
        <Cake size={16} /> This week
      </div>
      <div className="space-y-2">
        {familyHighlights.map((h, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            {h.icon === 'cake'
              ? <Cake size={14} style={{ color: h.color, flexShrink: 0 }} />
              : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: h.color }} />}
            <span className="flex-1 truncate">{h.title}</span>
            <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{h.day}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LastWeekCard() {
  const chorePct = Math.round((lastWeek.choresDone / lastWeek.choresTotal) * 100);
  return (
    <Card>
      <div className="font-display text-base font-bold mb-2">Last week</div>
      <div className="text-sm mb-1.5" style={{ color: palette.inkSoft }}>
        {lastWeek.choresDone}/{lastWeek.choresTotal} chores · {lastWeek.todosDone}/{lastWeek.todosTotal} to-dos done
      </div>
      <div className="h-1.5 rounded-full mb-3" style={{ backgroundColor: palette.line }}>
        <div className="h-1.5 rounded-full" style={{ width: `${chorePct}%`, backgroundColor: palette.brand }} />
      </div>
      <button className="text-sm font-semibold" style={{ color: palette.brand }}>View full review →</button>
    </Card>
  );
}

// ===== App shell =====
export default function RoostHomeView() {
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
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 text-sm" style={{ color: palette.inkSoft }}>
            <Sun size={18} style={{ color: palette.amber }} />
            72°
          </div>
        </div>

        <div className={!isTablet ? 'px-4 py-3' : 'hidden'}>
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
          <GreetingHero />
          <TodayStrip />

          <div className={isTablet ? 'grid grid-cols-2 gap-4 mb-4' : 'space-y-4 mb-4'}>
            {PEOPLE.map((p) => <PersonWeekCard key={p.id} person={p} />)}
          </div>

          <div className={isTablet ? 'grid grid-cols-2 gap-4' : 'space-y-4'}>
            <FamilyHighlightsCard />
            <LastWeekCard />
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
