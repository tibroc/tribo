import { useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { palette, PEOPLE } from '../lib/tokens'
import {
  createMember, updateMember, deleteMember,
  createChore, updateChore, deleteChore,
  createWorkSchedule, updateWorkSchedule, deleteWorkSchedule,
  type FamilyMember, type Chore, type WorkSchedule,
} from '../lib/api'

const COLORS = [PEOPLE.alberto, PEOPLE.hilda, PEOPLE.marie, PEOPLE.guilherme, '#D99A2B', '#3E6259', '#C0506B', '#7A8B5A']
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const field = { border: `1px solid ${palette.line}`, backgroundColor: palette.surface }

// Shared centered/full-screen modal shell with header actions + optional delete.
function Modal({ title, onClose, onSave, onDelete, busy, error, children }: {
  title: string
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
  busy: boolean
  error: string | null
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex lg:items-center lg:justify-center" style={{ backgroundColor: palette.ink + '66' }}>
      <div className="flex flex-col w-full h-full lg:h-auto lg:w-[440px] lg:max-h-[85vh] lg:rounded-2xl lg:shadow-xl overflow-hidden" style={{ backgroundColor: palette.surface }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${palette.line}` }}>
          <button onClick={onClose} className="text-sm" style={{ color: palette.inkSoft }}>Cancel</button>
          <div className="font-display text-lg font-bold">{title}</div>
          <button onClick={onSave} disabled={busy} className="text-sm font-semibold disabled:opacity-50" style={{ color: palette.brand }}>Save</button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          {error && <div className="rounded-xl p-2 text-sm" style={{ backgroundColor: '#fde8e8', color: '#9b1c1c' }}>{error}</div>}
          {children}
          {onDelete && (
            <button onClick={onDelete} disabled={busy} className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-2 mt-2" style={{ color: '#C0506B' }}>
              <Trash2 size={16} /> Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return <div><div className="text-xs font-semibold uppercase mb-1" style={{ color: palette.inkSoft }}>{label}</div>{children}</div>
}

// useSaver wraps a save/delete async call with busy + error state.
function useSaver(onSaved: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null)
    try { await fn(); onSaved() } catch (e) { setError(String(e)); setBusy(false) }
  }
  return { busy, error, run }
}

// ===== Member =====
export function MemberForm({ member, members, onClose, onSaved }: {
  member?: FamilyMember
  members: FamilyMember[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(member?.name ?? '')
  const [color, setColor] = useState(member?.color ?? COLORS[0])
  const [role, setRole] = useState<'guardian' | 'child'>(member?.role ?? 'guardian')
  const [defaultGuardianId, setDefaultGuardianId] = useState(member?.defaultGuardianId ?? '')
  const [pin, setPin] = useState('')
  const { busy, error, run } = useSaver(onSaved)
  const guardians = members.filter((m) => m.role === 'guardian' && m.id !== member?.id)

  const save = () => run(() => {
    const payload = { name, color, role, defaultGuardianId: role === 'child' && defaultGuardianId ? defaultGuardianId : null, pin: pin ? pin : undefined }
    return member ? updateMember(member.id, payload) : createMember(payload)
  })

  return (
    <Modal title={member ? 'Edit member' : 'Add member'} onClose={onClose} onSave={save} busy={busy} error={error}
      onDelete={member ? () => run(() => deleteMember(member.id)) : undefined}>
      <Labeled label="Name"><input className="w-full text-sm rounded-xl px-3 py-2 outline-none" style={field} value={name} onChange={(e) => setName(e.target.value)} /></Labeled>
      <Labeled label="Color">
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} className="w-7 h-7 rounded-full" style={{ backgroundColor: c, outline: color === c ? `2px solid ${palette.ink}` : 'none', outlineOffset: 2 }} />)}
        </div>
      </Labeled>
      <Labeled label="Role">
        <select className="w-full text-sm rounded-xl px-3 py-2 outline-none" style={field} value={role} onChange={(e) => setRole(e.target.value as 'guardian' | 'child')}>
          <option value="guardian">Guardian</option>
          <option value="child">Child</option>
        </select>
      </Labeled>
      {role === 'child' && (
        <Labeled label="Default guardian">
          <select className="w-full text-sm rounded-xl px-3 py-2 outline-none" style={field} value={defaultGuardianId} onChange={(e) => setDefaultGuardianId(e.target.value)}>
            <option value="">None</option>
            {guardians.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Labeled>
      )}
      <Labeled label={member ? 'PIN (leave blank to keep current)' : 'PIN (optional)'}>
        <input type="password" className="w-full text-sm rounded-xl px-3 py-2 outline-none" style={field} value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Profile-switch PIN" />
      </Labeled>
    </Modal>
  )
}

// ===== Chore =====
export function ChoreForm({ chore, members, onClose, onSaved }: {
  chore?: Chore
  members: FamilyMember[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(chore?.title ?? '')
  const [recurrence, setRecurrence] = useState<'daily' | 'weekly' | 'monthly'>(chore?.recurrenceRule ?? 'weekly')
  const [mode, setMode] = useState<'fixed' | 'rotation'>(chore?.assignmentMode ?? 'fixed')
  const [assignee, setAssignee] = useState(chore?.assignedMemberId ?? '')
  const [rotation, setRotation] = useState<string[]>(chore?.rotationMemberIds ?? [])
  const { busy, error, run } = useSaver(onSaved)

  const colorFor = () => members.find((m) => m.id === (mode === 'fixed' ? assignee : rotation[0]))?.color ?? palette.brand
  const save = () => run(() => {
    const payload = {
      title, recurrenceRule: recurrence, assignmentMode: mode,
      assignedMemberId: mode === 'fixed' && assignee ? assignee : null,
      rotationMemberIds: mode === 'rotation' ? rotation : [],
      color: colorFor(),
    }
    return chore ? updateChore(chore.id, payload) : createChore(payload)
  })

  return (
    <Modal title={chore ? 'Edit chore' : 'Add chore'} onClose={onClose} onSave={save} busy={busy} error={error}
      onDelete={chore ? () => run(() => deleteChore(chore.id)) : undefined}>
      <Labeled label="Title"><input className="w-full text-sm rounded-xl px-3 py-2 outline-none" style={field} value={title} onChange={(e) => setTitle(e.target.value)} /></Labeled>
      <Labeled label="Repeats">
        <select className="w-full text-sm rounded-xl px-3 py-2 outline-none" style={field} value={recurrence} onChange={(e) => setRecurrence(e.target.value as typeof recurrence)}>
          <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
        </select>
      </Labeled>
      <Labeled label="Assignment">
        <select className="w-full text-sm rounded-xl px-3 py-2 outline-none" style={field} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="fixed">Fixed — one person</option>
          <option value="rotation">Rotation — takes turns</option>
        </select>
      </Labeled>
      {mode === 'fixed' ? (
        <Labeled label="Assigned to">
          <select className="w-full text-sm rounded-xl px-3 py-2 outline-none" style={field} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Choose…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Labeled>
      ) : (
        <Labeled label="Rotation (in order)">
          <div className="space-y-1">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={rotation.includes(m.id)} className="w-4 h-4 rounded"
                  onChange={(e) => setRotation((cur) => e.target.checked ? [...cur, m.id] : cur.filter((x) => x !== m.id))} />
                {m.name}
              </label>
            ))}
          </div>
        </Labeled>
      )}
    </Modal>
  )
}

// ===== Work schedule =====
export function WorkScheduleForm({ schedule, guardians, onClose, onSaved }: {
  schedule?: WorkSchedule
  guardians: FamilyMember[]
  onClose: () => void
  onSaved: () => void
}) {
  const [memberId, setMemberId] = useState(schedule?.memberId ?? guardians[0]?.id ?? '')
  const [days, setDays] = useState(schedule?.daysOfWeek ?? '1111100')
  const [start, setStart] = useState(schedule?.startTime ?? '09:00')
  const [end, setEnd] = useState(schedule?.endTime ?? '17:00')
  const [label, setLabel] = useState(schedule?.label ?? 'Work')
  const [show, setShow] = useState(schedule?.showOnCalendar ?? false)
  const { busy, error, run } = useSaver(onSaved)

  const toggleDay = (i: number) => setDays((cur) => cur.substring(0, i) + (cur[i] === '1' ? '0' : '1') + cur.substring(i + 1))
  const save = () => run(() => {
    const payload = { memberId, daysOfWeek: days, startTime: start, endTime: end, label, showOnCalendar: show }
    return schedule ? updateWorkSchedule(schedule.id, payload) : createWorkSchedule(payload)
  })

  return (
    <Modal title={schedule ? 'Edit work schedule' : 'Add work schedule'} onClose={onClose} onSave={save} busy={busy} error={error}
      onDelete={schedule ? () => run(() => deleteWorkSchedule(schedule.id)) : undefined}>
      <Labeled label="Guardian">
        <select className="w-full text-sm rounded-xl px-3 py-2 outline-none" style={field} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {guardians.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </Labeled>
      <Labeled label="Days">
        <div className="flex gap-1">
          {DAY_LABELS.map((d, i) => (
            <button key={i} onClick={() => toggleDay(i)} className="flex-1 rounded-md text-center text-xs font-semibold py-1.5"
              style={days[i] === '1' ? { backgroundColor: palette.brand, color: '#fff' } : { backgroundColor: palette.mist, color: palette.inkSoft }}>{d}</button>
          ))}
        </div>
      </Labeled>
      <div className="flex gap-3">
        <Labeled label="Start"><input type="time" className="text-sm rounded-xl px-3 py-2 outline-none" style={field} value={start} onChange={(e) => setStart(e.target.value)} /></Labeled>
        <Labeled label="End"><input type="time" className="text-sm rounded-xl px-3 py-2 outline-none" style={field} value={end} onChange={(e) => setEnd(e.target.value)} /></Labeled>
      </div>
      <Labeled label="Label"><input className="w-full text-sm rounded-xl px-3 py-2 outline-none" style={field} value={label} onChange={(e) => setLabel(e.target.value)} /></Labeled>
      <label className="flex items-center gap-2 text-sm" style={{ color: palette.inkSoft }}>
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="w-4 h-4 rounded" />
        Show as "busy" on calendar
      </label>
    </Modal>
  )
}
