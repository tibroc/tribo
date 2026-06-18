import { useState } from 'react'
import { Check, Plus, Trash2, CalendarDays } from 'lucide-react'
import { palette, PEOPLE } from '../lib/tokens'
import { onboard, type OnboardRequest } from '../lib/api'
import { Wordmark } from '../components/chrome'

const COLORS = [PEOPLE.alberto, PEOPLE.hilda, PEOPLE.marie, PEOPLE.guilherme, '#D99A2B', '#3E6259', '#C0506B', '#7A8B5A']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface MemberDraft { name: string; color: string; role: 'guardian' | 'child'; defaultGuardianIndex: number | null }
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

const STEPS = ['Welcome', 'Family', 'Members', 'Calendar', 'Chores', 'Typical week', 'Done']

export default function OnboardingWizard({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [step, setStep] = useState(0)
  const [familyName, setFamilyName] = useState('')
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Lisbon' } catch { return 'Europe/Lisbon' }
  })
  const [members, setMembers] = useState<MemberDraft[]>([{ name: '', color: COLORS[0], role: 'guardian', defaultGuardianIndex: null }])
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
      members: members.filter((m) => m.name.trim()).map((m) => ({
        name: m.name.trim(), color: m.color, role: m.role,
        defaultGuardianIndex: m.role === 'child' ? m.defaultGuardianIndex : null,
      })),
      chores: chores.filter((c) => c.enabled && c.assignee != null).map((c) => ({
        title: c.title, recurrence: c.recurrence, mode: 'fixed',
        assignedMemberIndex: c.assignee!, color: members[c.assignee!]?.color ?? palette.brand,
      })),
      typicalWeek: patterns.filter((p) => p.enabled && p.member != null).map((p) => ({
        memberIndex: p.member!, title: p.title, startTime: p.startTime, durationMin: p.durationMin, weekdays: p.weekdays,
      })),
    }
    try { await onboard(req); onDone() } catch (e) { setError(String(e)); setBusy(false) }
  }

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  return (
    <div className="min-h-screen w-full font-body flex flex-col items-center p-4" style={{ backgroundColor: palette.mist, color: palette.ink }}>
      <div className="w-full max-w-lg flex flex-col" style={{ minHeight: '70vh' }}>
        <div className="flex items-center justify-between py-4">
          <Wordmark />
          <div className="text-xs" style={{ color: palette.inkSoft }}>Step {step + 1} of {STEPS.length}</div>
        </div>
        {/* progress */}
        <div className="h-1.5 rounded-full mb-5" style={{ backgroundColor: palette.line }}>
          <div className="h-1.5 rounded-full" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, backgroundColor: palette.brand }} />
        </div>

        <div className="flex-1 rounded-2xl p-5" style={{ backgroundColor: palette.surface, border: `1px solid ${palette.line}` }}>
          {error && <div className="rounded-xl p-2 mb-3 text-sm" style={{ backgroundColor: '#fde8e8', color: '#9b1c1c' }}>{error}</div>}

          {step === 0 && (
            <div className="text-center py-6">
              <div className="font-display text-2xl font-bold mb-2">Welcome to Tribo</div>
              <div className="text-sm" style={{ color: palette.inkSoft }}>Let's set up your family's shared calendar, chores, and to-dos. This takes about a minute.</div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="font-display text-lg font-bold">Family basics</div>
              <Labeled label="Family name">
                <input className="w-full text-sm rounded-xl px-3 py-2 outline-none" style={field} value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="The Silva Family" />
              </Labeled>
              <Labeled label="Timezone">
                <input className="w-full text-sm rounded-xl px-3 py-2 outline-none" style={field} value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Europe/Lisbon" />
              </Labeled>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="font-display text-lg font-bold">Family members</div>
              {members.map((m, i) => (
                <div key={i} className="rounded-xl p-3 space-y-2" style={{ border: `1px solid ${palette.line}` }}>
                  <div className="flex items-center gap-2">
                    <input className="flex-1 text-sm rounded-lg px-2 py-1.5 outline-none" style={field} value={m.name} placeholder="Name"
                      onChange={(e) => updateMember(setMembers, i, { name: e.target.value })} />
                    <select className="text-sm rounded-lg px-2 py-1.5 outline-none" style={field} value={m.role}
                      onChange={(e) => updateMember(setMembers, i, { role: e.target.value as 'guardian' | 'child' })}>
                      <option value="guardian">Guardian</option>
                      <option value="child">Child</option>
                    </select>
                    {members.length > 1 && (
                      <button aria-label="Remove" onClick={() => setMembers((cur) => cur.filter((_, j) => j !== i))}><Trash2 size={16} style={{ color: palette.inkSoft }} /></button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {COLORS.map((c) => (
                      <button key={c} onClick={() => updateMember(setMembers, i, { color: c })} className="w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: c }}>{m.color === c && <Check size={14} color="#fff" />}</button>
                    ))}
                  </div>
                  {m.role === 'child' && guardians.length > 0 && (
                    <select className="w-full text-sm rounded-lg px-2 py-1.5 outline-none" style={field} value={m.defaultGuardianIndex ?? ''}
                      onChange={(e) => updateMember(setMembers, i, { defaultGuardianIndex: e.target.value === '' ? null : Number(e.target.value) })}>
                      <option value="">Default guardian…</option>
                      {guardians.map((g) => <option key={g.i} value={g.i}>{g.m.name || `Member ${g.i + 1}`}</option>)}
                    </select>
                  )}
                </div>
              ))}
              <button onClick={() => setMembers((cur) => [...cur, { name: '', color: COLORS[cur.length % COLORS.length], role: 'guardian', defaultGuardianIndex: null }])}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold" style={{ border: `1px dashed ${palette.line}`, color: palette.inkSoft }}>
                <Plus size={16} /> Add member
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="font-display text-lg font-bold">Calendar</div>
              <div className="flex items-start gap-3 rounded-xl p-3" style={{ backgroundColor: palette.brandSoft }}>
                <CalendarDays size={18} style={{ color: palette.brand, flexShrink: 0, marginTop: 2 }} />
                <div className="text-sm">A built-in <b>family calendar</b> is created automatically. You can connect an external CalDAV/Google calendar anytime from <b>Family → Calendars</b>.</div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="font-display text-lg font-bold">Starter chores</div>
              <div className="text-sm" style={{ color: palette.inkSoft }}>Pick a few to start with — assign each to someone. (Optional.)</div>
              {chores.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="checkbox" checked={c.enabled} onChange={(e) => updateChore(setChores, i, { enabled: e.target.checked })} className="w-4 h-4 rounded" />
                  <span className="text-sm flex-1">{c.title} <span style={{ color: palette.inkSoft }}>· {c.recurrence}</span></span>
                  {c.enabled && (
                    <select className="text-sm rounded-lg px-2 py-1 outline-none" style={field} value={c.assignee ?? ''}
                      onChange={(e) => updateChore(setChores, i, { assignee: e.target.value === '' ? null : Number(e.target.value) })}>
                      <option value="">Assign…</option>
                      {validMembers.map((m, idx) => <option key={idx} value={members.indexOf(m)}>{m.name}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <div className="font-display text-lg font-bold">Typical week</div>
              <div className="text-sm" style={{ color: palette.inkSoft }}>Common recurring activities. Assign each to someone. (Optional.)</div>
              {patterns.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="checkbox" checked={p.enabled} onChange={(e) => updatePattern(setPatterns, i, { enabled: e.target.checked })} className="w-4 h-4 rounded" />
                  <span className="text-sm flex-1">{p.title} <span style={{ color: palette.inkSoft }}>· {p.weekdays.map((d) => WEEKDAYS[d]).join('/')} {p.startTime}</span></span>
                  {p.enabled && (
                    <select className="text-sm rounded-lg px-2 py-1 outline-none" style={field} value={p.member ?? ''}
                      onChange={(e) => updatePattern(setPatterns, i, { member: e.target.value === '' ? null : Number(e.target.value) })}>
                      <option value="">For…</option>
                      {validMembers.map((m, idx) => <option key={idx} value={members.indexOf(m)}>{m.name}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}

          {step === 6 && (
            <div className="text-center py-6">
              <div className="font-display text-2xl font-bold mb-2">All set!</div>
              <div className="text-sm" style={{ color: palette.inkSoft }}>
                {validMembers.length} member{validMembers.length === 1 ? '' : 's'} · {chores.filter((c) => c.enabled && c.assignee != null).length} chores · {patterns.filter((p) => p.enabled && p.member != null).length} weekly activities.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between py-4">
          <div>
            {step > 0 && <button onClick={back} className="text-sm font-semibold" style={{ color: palette.inkSoft }}>Back</button>}
            {step === 0 && onCancel && <button onClick={onCancel} className="text-sm font-semibold" style={{ color: palette.inkSoft }}>Cancel</button>}
          </div>
          {step < STEPS.length - 1 ? (
            <button onClick={next} disabled={step === 2 && !canFinish}
              className="text-sm font-semibold px-5 py-2 rounded-full disabled:opacity-40" style={{ backgroundColor: palette.brand, color: '#fff' }}>
              {step === 4 || step === 5 ? 'Skip / Continue' : 'Continue'}
            </button>
          ) : (
            <button onClick={finish} disabled={busy || !canFinish}
              className="text-sm font-semibold px-5 py-2 rounded-full disabled:opacity-40" style={{ backgroundColor: palette.amber, color: palette.ink }}>
              {busy ? 'Setting up…' : 'Finish'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const field = { border: `1px solid ${palette.line}`, backgroundColor: palette.surface }

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase mb-1" style={{ color: palette.inkSoft }}>{label}</div>
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
