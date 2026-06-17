import { useState } from 'react'
import { Plus, Trash2, CalendarDays } from 'lucide-react'
import { markerColor } from '../lib/tokens'
import { onboard, type OnboardRequest } from '../lib/api'
import Icon from '../components/Icon'
import Button from '../components/Button'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface MemberDraft { name: string; role: 'guardian' | 'child'; defaultGuardianIndex: number | null }
interface ChoreTemplate { title: string; recurrence: 'daily' | 'weekly' | 'monthly'; enabled: boolean; assignee: number | null }
interface PatternTemplate { title: string; startTime: string; durationMin: number; weekdays: number[]; enabled: boolean; member: number | null }

const CHORE_TEMPLATES: Omit<ChoreTemplate, 'enabled' | 'assignee'>[] = [
  { title: 'Take out recycling', recurrence: 'weekly' },
  { title: 'Clean the bathroom', recurrence: 'weekly' },
  { title: 'Water the plants', recurrence: 'weekly' },
  { title: 'Set the table', recurrence: 'daily' },
  { title: 'Mow the lawn', recurrence: 'weekly' },
]
const PATTERN_TEMPLATES: Omit<PatternTemplate, 'enabled' | 'member'>[] = [
  { title: 'School', startTime: '08:00', durationMin: 420, weekdays: [0, 1, 2, 3, 4] },
  { title: 'Work', startTime: '09:00', durationMin: 480, weekdays: [0, 1, 2, 3, 4] },
  { title: 'Gym', startTime: '06:00', durationMin: 60, weekdays: [0, 2, 4] },
  { title: 'Soccer', startTime: '16:00', durationMin: 90, weekdays: [1, 3] },
]

// Steps: 0 = welcome (full-bleed), 1..6 = split-screen.
const STEPS = ['Welcome', 'Family', 'Members', 'Calendar', 'Chores', 'Typical week', 'Done']
// Brand-panel taglines, keyed by split-step.
const TAGLINES: Record<number, { h: React.ReactNode; s: string }> = {
  1: { h: <>Every family<br />starts with a <em style={{ fontStyle: 'italic', color: 'var(--t-accent)' }}>name.</em></>, s: 'This is the home everyone shares — give it a name they’ll recognise.' },
  2: { h: <>Who’s in your <em style={{ fontStyle: 'italic', color: 'var(--t-accent)' }}>tribe?</em></>, s: 'Each person gets their own colour, so every plan is theirs at a glance.' },
  3: { h: <>Bring your calendars <em style={{ fontStyle: 'italic', color: 'var(--t-accent)' }}>together.</em></>, s: 'Tribo gathers what you already use into one shared view.' },
  4: { h: <>Share the load, <em style={{ fontStyle: 'italic', color: 'var(--t-accent)' }}>together.</em></>, s: 'A few starter chores get everyone pulling their weight.' },
  5: { h: <>Set the rhythm of <em style={{ fontStyle: 'italic', color: 'var(--t-accent)' }}>your week.</em></>, s: 'Recurring activities keep the shared calendar honest.' },
  6: { h: <>Your family, all in <em style={{ fontStyle: 'italic', color: 'var(--t-accent)' }}>one place.</em></>, s: 'That’s everything — your shared week is ready.' },
}

export default function OnboardingWizard({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [step, setStep] = useState(0)
  const [familyName, setFamilyName] = useState('')
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Lisbon' } catch { return 'Europe/Lisbon' }
  })
  const [members, setMembers] = useState<MemberDraft[]>([{ name: '', role: 'guardian', defaultGuardianIndex: null }])
  const [chores, setChores] = useState<ChoreTemplate[]>(CHORE_TEMPLATES.map((c) => ({ ...c, enabled: false, assignee: null })))
  const [patterns, setPatterns] = useState<PatternTemplate[]>(PATTERN_TEMPLATES.map((p) => ({ ...p, enabled: false, member: null })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guardians = members.map((m, i) => ({ m, i })).filter((x) => x.m.role === 'guardian')
  const validMembers = members.filter((m) => m.name.trim())
  const canFinish = validMembers.length > 0

  const finish = async () => {
    setBusy(true); setError(null)
    const req: OnboardRequest = {
      familyName, timezone,
      members: members.filter((m) => m.name.trim()).map((m, i) => ({
        name: m.name.trim(), color: markerColor(i), role: m.role,
        defaultGuardianIndex: m.role === 'child' ? m.defaultGuardianIndex : null,
      })),
      chores: chores.filter((c) => c.enabled && c.assignee != null).map((c) => ({
        title: c.title, recurrence: c.recurrence, mode: 'fixed',
        assignedMemberIndex: c.assignee!, color: markerColor(c.assignee!),
      })),
      typicalWeek: patterns.filter((p) => p.enabled && p.member != null).map((p) => ({
        memberIndex: p.member!, title: p.title, startTime: p.startTime, durationMin: p.durationMin, weekdays: p.weekdays,
      })),
    }
    try { await onboard(req); onDone() } catch (e) { setError(String(e)); setBusy(false) }
  }

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  // ── Step 0 · Welcome (full-bleed brand) ──
  if (step === 0) {
    return (
      <div className="min-h-screen w-full font-body relative overflow-hidden flex flex-col items-center justify-center text-center p-6"
        style={{ background: 'var(--tribo-pine)', color: '#F3EFE6' }}>
        <Blob fill="var(--t-brand)" style={{ width: 620, height: 620, top: -180, right: -160, opacity: 0.4 }} />
        <Blob fill="var(--t-danger)" style={{ width: 460, height: 460, bottom: -200, left: -150, opacity: 0.34 }} />
        <Blob fill="var(--t-accent)" style={{ width: 240, height: 240, top: 90, left: 120, opacity: 0.22 }} />
        <div className="flex items-center gap-3 relative z-10 mb-9">
          <div className="flex items-center justify-center" style={{ width: 46, height: 46, borderRadius: '50% 50% 50% 15px', background: 'var(--t-accent)', color: 'var(--tribo-pine)', transform: 'rotate(-8deg)' }}>
            <Icon name="leaf" size={24} />
          </div>
          <div style={{ fontFamily: 'var(--t-font-display)', fontSize: 34 }}>tr<span style={{ fontStyle: 'italic' }}>i</span>bo</div>
        </div>
        <div className="relative z-10" style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 'clamp(44px, 9vw, 74px)', lineHeight: 1.04, letterSpacing: '-1px' }}>
          <div>Plans,</div>
          <div style={{ fontStyle: 'italic', color: 'var(--t-accent)' }}>gathered.</div>
        </div>
        <div className="relative z-10 mt-5" style={{ fontSize: 18, lineHeight: 1.55, maxWidth: 440, opacity: 0.85 }}>
          One calm, shared calendar for the whole family — everyone’s days, chores and plans in one warm place.
        </div>
        <div className="flex items-center gap-4 mt-10 relative z-10">
          <Button onClick={next} variant="accent" style={{ padding: '16px 34px', fontSize: 16, borderRadius: 'var(--t-radius-md)' }}>Create your family</Button>
          {onCancel && (
            <button onClick={onCancel} className="font-semibold" style={{ fontSize: 15, color: 'inherit', opacity: 0.85, background: 'none', border: 'none', cursor: 'pointer' }}>
              Cancel
            </button>
          )}
        </div>
      </div>
    )
  }

  const tg = TAGLINES[step]
  const isLast = step === STEPS.length - 1

  return (
    <div className="min-h-screen w-full font-body flex" style={{ background: 'var(--t-surface)', color: 'var(--t-text)' }}>
      {/* Brand panel */}
      <div className="relative overflow-hidden hidden lg:flex flex-col flex-shrink-0 p-10"
        style={{ width: 420, background: 'var(--tribo-pine)', color: '#F3EFE6' }}>
        <Blob fill="var(--t-brand)" style={{ width: 420, height: 420, top: -120, right: -160, opacity: 0.42 }} />
        <Blob fill="var(--t-danger)" style={{ width: 320, height: 320, bottom: -120, left: -120, opacity: 0.32 }} />
        <div className="flex items-center gap-3 relative z-10">
          <div className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: '50% 50% 50% 13px', background: 'var(--t-accent)', color: 'var(--tribo-pine)', transform: 'rotate(-8deg)' }}>
            <Icon name="leaf" size={20} />
          </div>
          <div style={{ fontFamily: 'var(--t-font-display)', fontSize: 28 }}>tr<span style={{ fontStyle: 'italic' }}>i</span>bo</div>
        </div>
        <div className="mt-auto relative z-10">
          <div style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 38, lineHeight: 1.08 }}>{tg.h}</div>
          <div className="mt-3.5" style={{ fontSize: 14.5, lineHeight: 1.55, maxWidth: 300, opacity: 0.82 }}>{tg.s}</div>
          <div className="flex gap-2 mt-7">
            {[1, 2, 3, 4, 5, 6].map((d) => (
              <span key={d} style={{ height: 8, width: d === step ? 26 : 8, borderRadius: 99, transition: '.3s', background: d === step ? 'var(--t-accent)' : 'rgba(243,239,230,.32)' }} />
            ))}
          </div>
        </div>
      </div>

      {/* Content panel */}
      <div className="flex-1 flex flex-col p-6 lg:p-12 max-w-2xl">
        <div className="text-xs font-bold uppercase" style={{ color: 'var(--t-brand)', letterSpacing: '.1em' }}>Step {step} of {STEPS.length - 1}</div>
        <div className="mt-2.5" style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 32, lineHeight: 1.1 }}>
          {{ 1: 'Name your family', 2: 'Add your members', 3: 'Connect calendars', 4: 'Starter chores', 5: 'Your typical week', 6: "You're all set" }[step]}
        </div>
        <div className="mt-2.5" style={{ fontSize: 14.5, lineHeight: 1.55, maxWidth: 440, color: 'var(--t-text-soft)' }}>
          {{
            1: 'You can change this later in Family settings.',
            2: 'Add everyone who shares this calendar — each gets a harmonious colour automatically.',
            3: 'Link the calendars your family already uses — nothing is moved or changed.',
            4: 'Pick a few to start with — assign each to someone. (Optional.)',
            5: 'Common recurring activities. Assign each to someone. (Optional.)',
            6: 'Welcome to a calmer family week.',
          }[step]}
        </div>

        <div className="mt-8 flex-1 min-h-0 overflow-y-auto">
          {error && <div className="rounded-xl p-2 mb-3 text-sm" style={{ backgroundColor: '#fde8e8', color: '#9b1c1c' }}>{error}</div>}

          {step === 1 && (
            <div className="space-y-4" style={{ maxWidth: 440 }}>
              <Labeled label="Family name">
                <div className="flex items-center gap-3" style={inputBox(true)}>
                  <Icon name="family" size={20} style={{ color: 'var(--t-brand)', flexShrink: 0 }} />
                  <input className="w-full bg-transparent outline-none" style={{ fontSize: 16 }} value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="The Silva Family" />
                </div>
              </Labeled>
              <Labeled label="Timezone">
                <div style={inputBox(false)}>
                  <input className="w-full bg-transparent outline-none" style={{ fontSize: 16 }} value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Europe/Lisbon" />
                </div>
              </Labeled>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2.5" style={{ maxWidth: 460 }}>
              {members.map((m, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5"
                  style={{ border: '1px solid var(--t-line)', borderRadius: 'var(--t-radius-md)', background: 'var(--t-surface)' }}>
                  <div className="flex items-center justify-center flex-shrink-0" style={{ width: 42, height: 42, borderRadius: '50% 50% 50% 30%', background: markerColor(i), color: '#fff', fontWeight: 700 }}>
                    {m.name.trim() ? m.name.trim()[0].toUpperCase() : i + 1}
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <input className="flex-1 bg-transparent outline-none text-sm font-semibold" value={m.name} placeholder="Name"
                      onChange={(e) => updateMember(setMembers, i, { name: e.target.value })} />
                  </div>
                  <Segmented value={m.role} onChange={(role) => updateMember(setMembers, i, { role })} />
                  {m.role === 'child' && guardians.length > 0 && (
                    <select className="text-sm rounded-lg px-2 py-1.5 outline-none" style={field} value={m.defaultGuardianIndex ?? ''}
                      onChange={(e) => updateMember(setMembers, i, { defaultGuardianIndex: e.target.value === '' ? null : Number(e.target.value) })}>
                      <option value="">Guardian…</option>
                      {guardians.map((g) => <option key={g.i} value={g.i}>{g.m.name || `Member ${g.i + 1}`}</option>)}
                    </select>
                  )}
                  {members.length > 1 && (
                    <button aria-label="Remove" onClick={() => setMembers((cur) => cur.filter((_, j) => j !== i))}><Trash2 size={16} style={{ color: 'var(--t-text-soft)' }} /></button>
                  )}
                </div>
              ))}
              <button onClick={() => setMembers((cur) => [...cur, { name: '', role: 'guardian', defaultGuardianIndex: null }])}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold"
                style={{ border: '1px dashed var(--t-line)', borderRadius: 'var(--t-radius-md)', color: 'var(--t-text-soft)' }}>
                <Plus size={16} /> Add member
              </button>
              <div className="flex items-center gap-3 mt-3 p-3" style={{ border: '1px dashed var(--t-line)', borderRadius: 'var(--t-radius-md)' }}>
                <span className="flex-shrink-0" style={{ width: 30, height: 30, borderRadius: '50% 50% 50% 30%', background: markerColor(members.length) }} />
                <div className="text-xs" style={{ color: 'var(--t-text-soft)', lineHeight: 1.4 }}>
                  <b style={{ color: 'var(--t-text)' }}>The next member</b> is automatically given this colour — every family keeps a balanced, harmonious palette.
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3" style={{ maxWidth: 470 }}>
              <div className="flex items-start gap-3 p-3" style={{ background: 'var(--t-today-wash)', borderRadius: 'var(--t-radius-md)', border: '1px solid var(--t-line)' }}>
                <CalendarDays size={18} style={{ color: 'var(--t-brand)', flexShrink: 0, marginTop: 2 }} />
                <div className="text-sm">A built-in <b>family calendar</b> is created automatically. You can connect an external CalDAV/Google calendar anytime from <b>Family → Calendars</b>.</div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2.5" style={{ maxWidth: 470 }}>
              {chores.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="checkbox" checked={c.enabled} onChange={(e) => updateChore(setChores, i, { enabled: e.target.checked })} className="w-4 h-4 rounded" />
                  <span className="text-sm flex-1">{c.title} <span style={{ color: 'var(--t-text-soft)' }}>· {c.recurrence}</span></span>
                  {c.enabled && (
                    <select className="text-sm rounded-lg px-2 py-1 outline-none" style={field} value={c.assignee ?? ''}
                      onChange={(e) => updateChore(setChores, i, { assignee: e.target.value === '' ? null : Number(e.target.value) })}>
                      <option value="">Assign…</option>
                      {validMembers.map((m) => <option key={members.indexOf(m)} value={members.indexOf(m)}>{m.name}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-2.5" style={{ maxWidth: 470 }}>
              {patterns.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="checkbox" checked={p.enabled} onChange={(e) => updatePattern(setPatterns, i, { enabled: e.target.checked })} className="w-4 h-4 rounded" />
                  <span className="text-sm flex-1">{p.title} <span style={{ color: 'var(--t-text-soft)' }}>· {p.weekdays.map((d) => WEEKDAYS[d]).join('/')} {p.startTime}</span></span>
                  {p.enabled && (
                    <select className="text-sm rounded-lg px-2 py-1 outline-none" style={field} value={p.member ?? ''}
                      onChange={(e) => updatePattern(setPatterns, i, { member: e.target.value === '' ? null : Number(e.target.value) })}>
                      <option value="">For…</option>
                      {validMembers.map((m) => <option key={members.indexOf(m)} value={members.indexOf(m)}>{m.name}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}

          {step === 6 && (
            <div style={{ maxWidth: 470 }}>
              <div className="flex items-center gap-3.5 p-5 mb-4" style={{ borderRadius: 'var(--t-radius-lg)', border: '1px solid var(--t-line)', background: 'var(--t-surface)' }}>
                <div className="flex">
                  {validMembers.map((m, i) => (
                    <div key={i} style={{ marginLeft: i ? -10 : 0 }}>
                      <div className="flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: '50% 50% 50% 30%', background: markerColor(members.indexOf(m)), color: '#fff', fontWeight: 700, border: '2px solid var(--t-surface)' }}>
                        {m.name.trim()[0].toUpperCase()}
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--t-font-display)', fontSize: 19 }}>{familyName || 'Your family'}</div>
                  <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>
                    {validMembers.length} member{validMembers.length === 1 ? '' : 's'} · {guardians.length} guardian{guardians.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                {[
                  ['1', 'shared calendar'],
                  [String(chores.filter((c) => c.enabled && c.assignee != null).length), 'chores set'],
                  [String(patterns.filter((p) => p.enabled && p.member != null).length), 'weekly plans'],
                ].map(([n, l]) => (
                  <div key={l} className="flex-1 p-4" style={{ borderRadius: 'var(--t-radius-md)', border: '1px solid var(--t-line)', background: 'var(--t-surface)' }}>
                    <div style={{ fontFamily: 'var(--t-font-display)', fontSize: 26, color: 'var(--t-brand)' }}>{n}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--t-text-soft)', lineHeight: 1.3 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3.5 mt-6">
          <button onClick={back} className="flex items-center gap-1.5 font-semibold text-sm" style={{ color: 'var(--t-text-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <Icon name="left" size={16} /> Back
          </button>
          {(step === 4 || step === 5) && (
            <button onClick={next} className="font-semibold text-sm" style={{ color: 'var(--t-text-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>Skip</button>
          )}
          <div className="ml-auto">
            {!isLast ? (
              <Button onClick={next} disabled={step === 2 && !canFinish} variant="primary">
                Continue <Icon name="right" size={17} />
              </Button>
            ) : (
              <Button onClick={finish} disabled={busy || !canFinish} variant="accent">
                {busy ? 'Setting up…' : 'Enter Tribo'} <Icon name="right" size={17} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const field = { border: '1px solid var(--t-line)', background: 'var(--t-surface)', borderRadius: 'var(--t-radius-md)', color: 'var(--t-text)' }
const inputBox = (active: boolean) => ({
  display: 'flex', alignItems: 'center', gap: 12,
  borderRadius: 'var(--t-radius-md)', padding: '14px 16px',
  border: `1.5px solid ${active ? 'var(--t-brand)' : 'var(--t-line)'}`,
  background: 'var(--t-surface)',
})

function Blob({ fill, style }: { fill: string; style: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 200 200" preserveAspectRatio="none" aria-hidden="true"
      style={{ position: 'absolute', pointerEvents: 'none', ...style }}>
      <path fill={fill} d="M52 22c30-14 78-22 104 4 24 24 22 70 4 104-20 38-72 52-110 36C18 152 2 110 12 72 20 44 30 32 52 22Z" />
    </svg>
  )
}

function Segmented({ value, onChange }: { value: 'guardian' | 'child'; onChange: (v: 'guardian' | 'child') => void }) {
  return (
    <div className="inline-flex p-1 gap-0.5" style={{ background: 'var(--t-bg)', borderRadius: 'var(--t-radius-sm)' }}>
      {(['guardian', 'child'] as const).map((r) => {
        const on = value === r
        return (
          <button key={r} onClick={() => onChange(r)} className="px-3 py-1.5 text-xs font-semibold capitalize"
            style={{ borderRadius: 6, border: 'none', cursor: 'pointer', background: on ? 'var(--t-brand)' : 'transparent', color: on ? 'var(--t-on-brand)' : 'var(--t-text-soft)' }}>
            {r}
          </button>
        )
      })}
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--t-text-soft)', letterSpacing: '.06em' }}>{label}</div>
      {children}
    </div>
  )
}

function updateMember(set: React.Dispatch<React.SetStateAction<MemberDraft[]>>, i: number, patch: Partial<MemberDraft>) {
  set((cur) => cur.map((m, j) => (j === i ? { ...m, ...patch } : m)))
}
function updateChore(set: React.Dispatch<React.SetStateAction<ChoreTemplate[]>>, i: number, patch: Partial<ChoreTemplate>) {
  set((cur) => cur.map((c, j) => (j === i ? { ...c, ...patch } : c)))
}
function updatePattern(set: React.Dispatch<React.SetStateAction<PatternTemplate[]>>, i: number, patch: Partial<PatternTemplate>) {
  set((cur) => cur.map((p, j) => (j === i ? { ...p, ...patch } : p)))
}
