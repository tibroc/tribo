import React, { useState } from 'react';
import {
  Home, CalendarDays, CheckSquare, ListTodo, Users,
  Sun, ChevronRight, Plus, Repeat, Shuffle, Globe, MapPin, Palette, LogIn,
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

// ===== Sample data =====
const PEOPLE = [
  { id: 'alberto', name: 'Alberto', color: '#4C7EA8', role: 'guardian' },
  { id: 'hilda', name: 'Hilda', color: '#D1577A', role: 'guardian' },
  { id: 'marie', name: 'Marie', color: '#5C9460', role: 'child', defaultGuardian: 'Hilda' },
  { id: 'guilherme', name: 'Guilherme', color: '#8A6BB8', role: 'child', defaultGuardian: 'Alberto' },
];

const workSchedules = {
  alberto: { days: [1, 1, 1, 1, 1, 0, 0], start: '9:00 AM', end: '5:00 PM', showOnCalendar: false },
  hilda: { days: [1, 1, 1, 1, 1, 0, 0], start: '8:00 AM', end: '4:00 PM', showOnCalendar: false },
};

const chores = [
  { title: 'Mow the lawn', color: '#4C7EA8', recurrence: 'Weekly', who: 'Alberto', mode: 'fixed' },
  { title: 'Clean the bathroom', color: '#D1577A', recurrence: 'Weekly', who: 'Hilda', mode: 'fixed' },
  { title: 'Take out recycling', color: '#8A6BB8', recurrence: 'Weekly', who: 'Guilherme', mode: 'fixed' },
  { title: 'Water the plants', color: '#5C9460', recurrence: 'Weekly', who: 'Marie', mode: 'fixed' },
  { title: 'Set the table', color: '#5C9460', recurrence: 'Daily', who: 'Marie, Guilherme', mode: 'rotation' },
  { title: 'Defrost the fridge', color: '#D1577A', recurrence: 'Monthly', who: 'Hilda', mode: 'fixed' },
];

const calendars = [
  { name: 'Family Calendar', type: 'Built-in', status: 'Synced', color: '#3E6259' },
  { name: "Hilda's Work Calendar", type: 'Google', status: 'Synced 5 min ago', color: '#D1577A' },
  { name: 'School Term Dates', type: 'CalDAV · Read-only', status: 'Synced yesterday', color: '#D99A2B' },
];

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

function SectionCard({ title, icon: Icon, children }) {
  return (
    <Card>
      <div className="font-display text-base font-bold mb-3 flex items-center gap-2">
        {Icon && <Icon size={16} />} {title}
      </div>
      {children}
    </Card>
  );
}

function AddRow({ label }) {
  return (
    <button
      className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 mt-2 text-sm font-semibold"
      style={{ border: `1px dashed ${palette.line}`, color: palette.inkSoft }}
    >
      <Plus size={16} /> {label}
    </button>
  );
}

// ===== Sections =====
function FamilyMembersSection({ isTablet }) {
  return (
    <SectionCard title="Family members" icon={Users}>
      <div className={isTablet ? 'grid grid-cols-2 gap-x-4' : 'grid grid-cols-1'}>
        {PEOPLE.map((p) => (
          <div key={p.id} className="flex items-center gap-3 py-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ backgroundColor: p.color }}>
              {p.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{p.name}</div>
              <div className="text-xs truncate" style={{ color: palette.inkSoft }}>
                {p.role === 'guardian' ? 'Guardian' : `Child · Default guardian: ${p.defaultGuardian}`}
              </div>
            </div>
            <ChevronRight size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
          </div>
        ))}
      </div>
      <AddRow label="Add family member" />
    </SectionCard>
  );
}

function WorkSchedulesSection() {
  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <SectionCard title="Work schedules" icon={CalendarDays}>
      <div className="space-y-4">
        {PEOPLE.filter((p) => p.role === 'guardian').map((p) => {
          const s = workSchedules[p.id];
          return (
            <div key={p.id}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: p.color }}>
                  {p.name[0]}
                </div>
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="text-xs ml-auto" style={{ color: palette.inkSoft }}>{s.start} – {s.end}</div>
              </div>
              <div className="flex gap-1 mb-2">
                {DAY_LABELS.map((d, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-md text-center text-xs font-semibold py-1.5"
                    style={s.days[i]
                      ? { backgroundColor: p.color + '20', color: palette.ink }
                      : { backgroundColor: palette.mist, color: palette.inkSoft }}
                  >
                    {d}
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs" style={{ color: palette.inkSoft }}>
                <input type="checkbox" defaultChecked={s.showOnCalendar} className="w-3.5 h-3.5 rounded" readOnly />
                Show as "busy" on calendar
              </label>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function ChoresSection() {
  return (
    <SectionCard title="Chores" icon={CheckSquare}>
      <div className="space-y-2">
        {chores.map((c, i) => (
          <div key={i} className="flex items-center gap-2 py-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
            <span className="text-sm flex-1 truncate">{c.title}</span>
            <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{c.recurrence} · {c.who}</span>
            {c.mode === 'rotation'
              ? <Shuffle size={14} style={{ color: palette.inkSoft, flexShrink: 0 }} />
              : <Repeat size={14} style={{ color: palette.inkSoft, flexShrink: 0 }} />}
          </div>
        ))}
      </div>
      <AddRow label="Add chore" />
    </SectionCard>
  );
}

function CalendarsSection() {
  return (
    <SectionCard title="Calendars" icon={Globe}>
      <div className="space-y-2">
        {calendars.map((c, i) => (
          <div key={i} className="flex items-center gap-2 py-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{c.name}</div>
              <div className="text-xs truncate" style={{ color: palette.inkSoft }}>{c.type} · {c.status}</div>
            </div>
          </div>
        ))}
      </div>
      <AddRow label="Add calendar" />
    </SectionCard>
  );
}

function AppSettingsSection() {
  return (
    <SectionCard title="App settings">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <MapPin size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Location</div>
            <div className="text-xs" style={{ color: palette.inkSoft }}>Lisbon, Portugal — used for weather</div>
          </div>
          <ChevronRight size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
        </div>
        <div className="flex items-center gap-3">
          <Palette size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Appearance</div>
            <div className="text-xs" style={{ color: palette.inkSoft }}>Default color theme</div>
          </div>
          <ChevronRight size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
        </div>
        <div className="flex items-center gap-3">
          <LogIn size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Account</div>
            <div className="text-xs truncate" style={{ color: palette.inkSoft }}>Signed in via Authentik · alberto@family.example</div>
          </div>
          <ChevronRight size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
        </div>
      </div>
    </SectionCard>
  );
}

// ===== App shell =====
export default function RoostFamilySettings() {
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
        <div className={isTablet ? 'flex items-center gap-4 px-6 py-3' : 'hidden'}>
          <div className="font-display text-2xl font-bold" style={{ color: palette.brand }}>Family</div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 text-sm" style={{ color: palette.inkSoft }}>
            <Sun size={18} style={{ color: palette.amber }} />
            72°
          </div>
        </div>

        <div className={!isTablet ? 'px-4 py-3' : 'hidden'}>
          <div className="flex items-center justify-between">
            <div className="font-display text-xl font-bold" style={{ color: palette.brand }}>Family</div>
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
          <NavIcon icon={Home} label="Home" />
          <NavIcon icon={CalendarDays} label="Calendar" />
          <NavIcon icon={CheckSquare} label="Chores" />
          <NavIcon icon={ListTodo} label="To-dos" />
          <NavIcon icon={Users} label="Family" active />
        </nav>

        {/* Main content */}
        <main className={isTablet ? 'flex-1 p-6' : 'flex-1 p-3 pb-24'}>
          <div className="space-y-4">
            <FamilyMembersSection isTablet={isTablet} />
            <WorkSchedulesSection />
            <div className={isTablet ? 'grid grid-cols-2 gap-4' : 'space-y-4'}>
              <ChoresSection />
              <CalendarsSection />
            </div>
            <AppSettingsSection />
          </div>
        </main>
      </div>
      </div>
      </div>

      {/* Bottom nav (mobile) */}
      <nav className={!isTablet ? 'fixed bottom-0 left-0 right-0 flex items-center justify-around py-2' : 'hidden'} style={{ borderTop: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
        <NavIcon icon={Home} label="Home" mobile />
        <NavIcon icon={CalendarDays} label="Calendar" mobile />
        <NavIcon icon={CheckSquare} label="Chores" mobile />
        <NavIcon icon={ListTodo} label="To-dos" mobile />
        <NavIcon icon={Users} label="Family" active mobile />
      </nav>
    </div>
  );
}
