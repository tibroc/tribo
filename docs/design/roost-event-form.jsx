import React, { useState } from 'react';
import {
  X, Calendar, Clock, Repeat, ChevronDown, MapPin, AlignLeft,
  Star, ShieldCheck, AlertTriangle, Trash2, Check, Layers,
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
const danger = '#C0506B';

const PEOPLE = [
  { id: 'alberto', name: 'Alberto', color: '#4C7EA8', role: 'guardian' },
  { id: 'hilda', name: 'Hilda', color: '#D1577A', role: 'guardian' },
  { id: 'marie', name: 'Marie', color: '#5C9460', role: 'child' },
  { id: 'guilherme', name: 'Guilherme', color: '#8A6BB8', role: 'child' },
];

// ===== Small building blocks =====
function Switch({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="rounded-full flex-shrink-0"
      style={{ width: 40, height: 24, backgroundColor: checked ? palette.brand : palette.line, position: 'relative' }}
      aria-label="toggle"
    >
      <span
        className="absolute rounded-full"
        style={{ width: 18, height: 18, top: 3, left: checked ? 19 : 3, backgroundColor: '#fff', transition: 'left 0.15s ease' }}
      />
    </button>
  );
}

function FieldRow({ icon: Icon, children, border = true }) {
  return (
    <div className="flex items-center gap-3 py-2.5" style={border ? { borderBottom: `1px solid ${palette.line}` } : {}}>
      <Icon size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// ===== Guardian section =====
function GuardianCard({ enabled, onToggle, state, onStateChange }) {
  return (
    <div className="rounded-2xl p-3 mt-3" style={{ border: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck size={16} style={{ color: palette.inkSoft }} />
          Guardian needed
        </div>
        <Switch checked={enabled} onChange={onToggle} />
      </div>

      {enabled && (
        <div className="mt-3">
          {state === 'assigned' && (
            <div className="flex items-center gap-2.5 rounded-xl p-2.5" style={{ backgroundColor: palette.brandSoft }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: '#D1577A' }}>H</div>
              <div className="text-sm flex-1">
                <span className="font-semibold">Hilda</span> is free and assigned
              </div>
              <Check size={16} style={{ color: palette.brand, flexShrink: 0 }} />
            </div>
          )}

          {state === 'unclaimed' && (
            <div className="rounded-xl p-2.5" style={{ backgroundColor: palette.mist }}>
              <div className="text-sm mb-2">Alberto and Hilda are both free — whoever opens this first can take it.</div>
              <div className="flex gap-2 flex-wrap">
                {['alberto', 'hilda'].map((id) => {
                  const p = PEOPLE.find((x) => x.id === id);
                  return (
                    <button key={id} className="flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: palette.surface, border: `1px solid ${palette.line}` }}>
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: p.color }}>{p.name[0]}</span>
                      Assign {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {state === 'conflict' && (
            <div className="rounded-xl p-2.5" style={{ backgroundColor: palette.amber + '1A', border: `1px solid ${palette.amber}66` }}>
              <div className="flex items-center gap-2 text-sm font-semibold mb-1.5" style={{ color: '#9A6B1F' }}>
                <AlertTriangle size={14} /> No guardian is free
              </div>
              <div className="text-xs space-y-1" style={{ color: palette.inkSoft }}>
                <div>Alberto — Gym until 7:00 AM</div>
                <div>Hilda — Team meeting 2:00–3:00 PM</div>
              </div>
              <button className="text-xs font-semibold mt-2" style={{ color: palette.brand }}>Assign anyway →</button>
            </div>
          )}

          {/* Preview toggle — for design review only */}
          <div className="flex items-center gap-1 mt-3 pt-2" style={{ borderTop: `1px solid ${palette.line}` }}>
            <span className="text-xs mr-1" style={{ color: palette.inkSoft }}>Preview:</span>
            {['assigned', 'unclaimed', 'conflict'].map((s) => (
              <button
                key={s}
                onClick={() => onStateChange(s)}
                className="text-xs font-semibold px-2 py-1 rounded-full capitalize"
                style={s === state ? { backgroundColor: palette.brand, color: '#fff' } : { backgroundColor: palette.mist, color: palette.inkSoft }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== App shell =====
export default function RoostEventForm() {
  const [isTablet, setIsTablet] = useState(false);
  const [selected, setSelected] = useState(['marie']);
  const [guardianNeeded, setGuardianNeeded] = useState(true);
  const [guardianState, setGuardianState] = useState('assigned');
  const [important, setImportant] = useState(false);
  const [allDay, setAllDay] = useState(false);

  const hasChild = selected.some((id) => PEOPLE.find((p) => p.id === id)?.role === 'child');

  const toggleAttendee = (id) => {
    setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };

  const formContent = (
    <>
      <input
        className="w-full font-display text-2xl font-bold bg-transparent outline-none mb-3"
        style={{ color: palette.ink }}
        defaultValue="Dentist appointment"
        placeholder="Event title"
      />

      {/* Date & time */}
      <div className="rounded-2xl px-3" style={{ border: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
        <FieldRow icon={Calendar}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Thursday, June 18</span>
            <ChevronDown size={14} style={{ color: palette.inkSoft }} />
          </div>
        </FieldRow>
        <FieldRow icon={Clock} border={!allDay}>
          <div className="flex items-center justify-between">
            {allDay ? (
              <span className="text-sm" style={{ color: palette.inkSoft }}>All day</span>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium rounded-lg px-2 py-1" style={{ backgroundColor: palette.mist }}>3:30 PM</span>
                <span style={{ color: palette.inkSoft }}>–</span>
                <span className="text-sm font-medium rounded-lg px-2 py-1" style={{ backgroundColor: palette.mist }}>4:15 PM</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: palette.inkSoft }}>All day</span>
              <Switch checked={allDay} onChange={setAllDay} />
            </div>
          </div>
        </FieldRow>
        <FieldRow icon={Repeat} border={false}>
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: palette.inkSoft }}>Doesn't repeat</span>
            <ChevronDown size={14} style={{ color: palette.inkSoft }} />
          </div>
        </FieldRow>
      </div>

      {/* Attendees */}
      <div className="mt-3">
        <div className="text-xs font-semibold uppercase mb-2" style={{ color: palette.inkSoft }}>Who's involved</div>
        <div className="flex gap-3">
          {PEOPLE.map((p) => {
            const isSelected = selected.includes(p.id);
            return (
              <button key={p.id} onClick={() => toggleAttendee(p.id)} className="flex flex-col items-center gap-1">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={isSelected
                    ? { backgroundColor: p.color, color: '#fff' }
                    : { backgroundColor: 'transparent', color: palette.inkSoft, border: `2px solid ${palette.line}` }}
                >
                  {p.name[0]}
                </div>
                <span className="text-xs" style={{ color: isSelected ? palette.ink : palette.inkSoft }}>{p.name}</span>
              </button>
            );
          })}
        </div>

        {hasChild && (
          <GuardianCard enabled={guardianNeeded} onToggle={setGuardianNeeded} state={guardianState} onStateChange={setGuardianState} />
        )}
      </div>

      {/* Details */}
      <div className="rounded-2xl px-3 mt-3" style={{ border: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
        <FieldRow icon={MapPin}>
          <input className="w-full bg-transparent outline-none text-sm" defaultValue="Dr. Costa's Office, Rua das Flores 12" placeholder="Add location" />
        </FieldRow>
        <FieldRow icon={AlignLeft} border={false}>
          <textarea className="w-full bg-transparent outline-none text-sm resize-none" rows={2} defaultValue="Bring insurance card" placeholder="Notes" />
        </FieldRow>
      </div>

      {/* Visibility + calendar */}
      <div className="rounded-2xl px-3 mt-3" style={{ border: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
        <div className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${palette.line}` }}>
          <div className="flex items-center gap-3">
            <Star size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
            <div>
              <div className="text-sm font-medium">Important</div>
              <div className="text-xs" style={{ color: palette.inkSoft }}>Always show, even in Quarter and Year views</div>
            </div>
          </div>
          <Switch checked={important} onChange={setImportant} />
        </div>
        <FieldRow icon={Layers} border={false}>
          <span className="text-sm">Family Calendar</span>
        </FieldRow>
      </div>

      <button className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-3 mt-4" style={{ color: danger }}>
        <Trash2 size={16} /> Delete event
      </button>
    </>
  );

  return (
    <div className="min-h-screen w-full font-body" style={{ backgroundColor: palette.mist, color: palette.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        .font-display { font-family: 'Bricolage Grotesque', sans-serif; }
        .font-body { font-family: 'Plus Jakarta Sans', sans-serif; }
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

      {isTablet ? (
        <div style={{ overflow: 'auto', minHeight: '100vh' }}>
          <div className="flex items-center justify-center" style={{ minWidth: 680, minHeight: '100vh', backgroundColor: palette.ink + '66', padding: 32 }}>
            <div className="rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ width: 560, maxHeight: '85vh', backgroundColor: palette.surface }}>
              <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${palette.line}` }}>
                <button aria-label="Close"><X size={20} style={{ color: palette.inkSoft }} /></button>
                <div className="font-display text-lg font-bold">Edit Event</div>
                <button className="text-sm font-semibold" style={{ color: palette.brand }}>Save</button>
              </div>
              <div className="p-5 overflow-y-auto">{formContent}</div>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${palette.line}`, backgroundColor: palette.surface }}>
            <button aria-label="Close"><X size={20} style={{ color: palette.inkSoft }} /></button>
            <div className="font-display text-lg font-bold">Edit Event</div>
            <button className="text-sm font-semibold" style={{ color: palette.brand }}>Save</button>
          </div>
          <div className="p-4">{formContent}</div>
        </div>
      )}
    </div>
  );
}
