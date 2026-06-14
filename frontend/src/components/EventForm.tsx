import { useMemo, useState } from 'react'
import { X, Calendar, Clock, MapPin, AlignLeft, Star, ShieldCheck, AlertTriangle, Check, Trash2, Layers } from 'lucide-react'
import { palette } from '../lib/tokens'
import {
  createEvent, updateEvent, deleteEvent,
  type TriboEvent, type NewEvent, type FamilyMember, type CalendarSource,
} from '../lib/api'
import PersonAvatar from './PersonAvatar'

const danger = '#C0506B'
const pad = (n: number) => String(n).padStart(2, '0')

// Build an RFC3339 timestamp with the browser's local offset, so the server's
// wall-clock comparisons (work-schedule overlap) match the family's timezone.
function localRFC3339(d: Date): string {
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const oh = pad(Math.floor(Math.abs(off) / 60))
  const om = pad(Math.abs(off) % 60)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${oh}:${om}`
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="rounded-full flex-shrink-0" aria-label="toggle"
      style={{ width: 40, height: 24, backgroundColor: checked ? palette.brand : palette.line, position: 'relative' }}>
      <span className="absolute rounded-full" style={{ width: 18, height: 18, top: 3, left: checked ? 19 : 3, backgroundColor: '#fff', transition: 'left 0.15s ease' }} />
    </button>
  )
}

export default function EventForm({ event, members, sources, defaultDate, onClose, onSaved }: {
  event: TriboEvent | null
  members: FamilyMember[]
  sources: CalendarSource[]
  defaultDate: Date
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!event
  const initialStart = event ? new Date(event.startAt) : defaultDate
  const initialEnd = event ? new Date(event.endAt) : new Date(defaultDate.getTime() + 60 * 60 * 1000)

  const [title, setTitle] = useState(event?.title ?? '')
  const [dateStr, setDateStr] = useState(`${initialStart.getFullYear()}-${pad(initialStart.getMonth() + 1)}-${pad(initialStart.getDate())}`)
  const [allDay, setAllDay] = useState(event?.allDay ?? false)
  const [startTime, setStartTime] = useState(`${pad(initialStart.getHours())}:${pad(initialStart.getMinutes())}`)
  const [endTime, setEndTime] = useState(`${pad(initialEnd.getHours())}:${pad(initialEnd.getMinutes())}`)
  const [attendees, setAttendees] = useState<string[]>(event?.attendeeIds ?? [])
  const [requiresGuardian, setRequiresGuardian] = useState(event?.requiresGuardian ?? false)
  const [important, setImportant] = useState(event?.visibilityTag === 'milestone')
  const [location, setLocation] = useState(event?.location ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const hasChild = attendees.some((id) => byId.get(id)?.role === 'child')

  const toggleAttendee = (id: string) =>
    setAttendees((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const save = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    const [y, m, d] = dateStr.split('-').map(Number)
    let startAt: string, endAt: string
    if (allDay) {
      startAt = localRFC3339(new Date(y, m - 1, d, 0, 0))
      endAt = localRFC3339(new Date(y, m - 1, d + 1, 0, 0))
    } else {
      const [sh, sm] = startTime.split(':').map(Number)
      const [eh, em] = endTime.split(':').map(Number)
      startAt = localRFC3339(new Date(y, m - 1, d, sh, sm))
      endAt = localRFC3339(new Date(y, m - 1, d, eh, em))
    }

    // Personal calendar when someone's involved; shared/family calendar otherwise.
    const personal = sources.find((s) => !s.isShared)
    const shared = sources.find((s) => s.isShared)
    const sourceId = event?.calendarSourceId ?? (attendees.length > 0 ? personal?.id : shared?.id) ?? personal?.id ?? sources[0]?.id

    const payload: NewEvent = {
      calendarSourceId: sourceId ?? '',
      title: title.trim(),
      description: description || null,
      location: location || null,
      startAt,
      endAt,
      allDay,
      visibilityTag: important ? 'milestone' : 'standard',
      requiresGuardian: requiresGuardian && hasChild,
      attendeeIds: attendees,
    }
    setBusy(true)
    setError(null)
    try {
      if (editing) await updateEvent(event!.id, payload)
      else await createEvent(payload)
      onSaved()
    } catch (e) {
      setError(String(e))
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!editing) return
    setBusy(true)
    try { await deleteEvent(event!.id); onSaved() } catch (e) { setError(String(e)); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex lg:items-center lg:justify-center" style={{ backgroundColor: palette.ink + '66' }}>
      <div className="flex flex-col w-full h-full lg:h-auto lg:w-[560px] lg:max-h-[85vh] lg:rounded-2xl lg:shadow-xl overflow-hidden" style={{ backgroundColor: palette.surface }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${palette.line}` }}>
          <button aria-label="Close" onClick={onClose}><X size={20} style={{ color: palette.inkSoft }} /></button>
          <div className="font-display text-lg font-bold">{editing ? 'Edit event' : 'New event'}</div>
          <button className="text-sm font-semibold disabled:opacity-50" style={{ color: palette.brand }} onClick={save} disabled={busy}>Save</button>
        </div>

        <div className="p-5 overflow-y-auto">
          {error && <div className="rounded-xl p-2 mb-3 text-sm" style={{ backgroundColor: '#fde8e8', color: '#9b1c1c' }}>{error}</div>}

          <input
            className="w-full font-display text-2xl font-bold bg-transparent outline-none mb-3"
            style={{ color: palette.ink }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" autoFocus
          />

          {/* Date & time */}
          <div className="rounded-2xl px-3" style={{ border: `1px solid ${palette.line}` }}>
            <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: `1px solid ${palette.line}` }}>
              <Calendar size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
              <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className="flex-1 bg-transparent outline-none text-sm font-medium" />
            </div>
            <div className="flex items-center gap-3 py-2.5">
              <Clock size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
              <div className="flex-1 flex items-center justify-between">
                {allDay ? (
                  <span className="text-sm" style={{ color: palette.inkSoft }}>All day</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="text-sm rounded-lg px-2 py-1 outline-none" style={{ backgroundColor: palette.mist }} />
                    <span style={{ color: palette.inkSoft }}>–</span>
                    <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="text-sm rounded-lg px-2 py-1 outline-none" style={{ backgroundColor: palette.mist }} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: palette.inkSoft }}>All day</span>
                  <Switch checked={allDay} onChange={setAllDay} />
                </div>
              </div>
            </div>
          </div>

          {/* Attendees */}
          <div className="mt-3">
            <div className="text-xs font-semibold uppercase mb-2" style={{ color: palette.inkSoft }}>Who's involved</div>
            <div className="flex gap-3 flex-wrap">
              {members.map((p) => {
                const sel = attendees.includes(p.id)
                return (
                  <button key={p.id} onClick={() => toggleAttendee(p.id)} className="flex flex-col items-center gap-1">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={sel ? { backgroundColor: p.color, color: '#fff' } : { color: palette.inkSoft, border: `2px solid ${palette.line}` }}>
                      {p.name[0]}
                    </div>
                    <span className="text-xs" style={{ color: sel ? palette.ink : palette.inkSoft }}>{p.name}</span>
                  </button>
                )
              })}
            </div>

            {hasChild && (
              <GuardianCard
                enabled={requiresGuardian}
                onToggle={setRequiresGuardian}
                event={event}
                members={members}
                editing={editing}
              />
            )}
          </div>

          {/* Details */}
          <div className="rounded-2xl px-3 mt-3" style={{ border: `1px solid ${palette.line}` }}>
            <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: `1px solid ${palette.line}` }}>
              <MapPin size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
              <input className="w-full bg-transparent outline-none text-sm" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Add location" />
            </div>
            <div className="flex items-center gap-3 py-2.5">
              <AlignLeft size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
              <textarea className="w-full bg-transparent outline-none text-sm resize-none" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes" />
            </div>
          </div>

          {/* Important + calendar */}
          <div className="rounded-2xl px-3 mt-3" style={{ border: `1px solid ${palette.line}` }}>
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
            <div className="flex items-center gap-3 py-2.5">
              <Layers size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
              <span className="text-sm">{attendees.length > 0 ? 'Personal' : 'Family'} calendar</span>
            </div>
          </div>

          {editing && (
            <button onClick={remove} disabled={busy} className="w-full flex items-center justify-center gap-2 text-sm font-semibold py-3 mt-4" style={{ color: danger }}>
              <Trash2 size={16} /> Delete event
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Shows the computed guardian state for the saved event (assigned / unclaimed /
// conflict). For a brand-new event the state is computed on save.
function GuardianCard({ enabled, onToggle, event, members, editing }: {
  enabled: boolean
  onToggle: (v: boolean) => void
  event: TriboEvent | null
  members: FamilyMember[]
  editing: boolean
}) {
  const assigned = event?.assignedGuardianId ? members.find((m) => m.id === event.assignedGuardianId) : undefined
  const conflict = event?.conflictStatus === 'needs_guardian'

  return (
    <div className="rounded-2xl p-3 mt-3" style={{ border: `1px solid ${palette.line}` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck size={16} style={{ color: palette.inkSoft }} /> Guardian needed
        </div>
        <Switch checked={enabled} onChange={onToggle} />
      </div>

      {enabled && (
        <div className="mt-3">
          {!editing ? (
            <div className="text-sm rounded-xl p-2.5" style={{ backgroundColor: palette.mist, color: palette.inkSoft }}>
              A guardian will be assigned automatically when you save.
            </div>
          ) : assigned ? (
            <div className="flex items-center gap-2.5 rounded-xl p-2.5" style={{ backgroundColor: palette.brandSoft }}>
              <PersonAvatar name={assigned.name} color={assigned.color} size={32} />
              <div className="text-sm flex-1"><span className="font-semibold">{assigned.name}</span> is free and assigned</div>
              <Check size={16} style={{ color: palette.brand, flexShrink: 0 }} />
            </div>
          ) : conflict ? (
            <div className="rounded-xl p-2.5" style={{ backgroundColor: palette.amber + '1A', border: `1px solid ${palette.amber}66` }}>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#9A6B1F' }}>
                <AlertTriangle size={14} /> No guardian is free
              </div>
              <div className="text-xs mt-1" style={{ color: palette.inkSoft }}>Everyone is busy or working during this time.</div>
            </div>
          ) : (
            <div className="text-sm rounded-xl p-2.5" style={{ backgroundColor: palette.mist }}>
              More than one guardian is free — whoever opens this first can take it.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
