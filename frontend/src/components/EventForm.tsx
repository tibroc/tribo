import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Calendar, Clock, MapPin, AlignLeft, Star, ShieldCheck, AlertTriangle, Check, Trash2, Layers, Users, Lock } from 'lucide-react'
import {
  createEvent, updateEvent, deleteEvent, getEventGuardians, claimEvent,
  type TriboEvent, type NewEvent, type FamilyMember, type CalendarSource,
} from '../lib/api'
import PersonAvatar from './PersonAvatar'
import Button from './Button'
import DatePicker from './DatePicker'
import TimePicker from './TimePicker'
import { calendarLabel } from '../lib/calendar'
import { useLocale } from '../lib/i18n'

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
  const { t } = useTranslation()
  return (
    <button onClick={() => onChange(!checked)} className="rounded-full shrink-0" aria-label={t('event.toggle')}
      style={{ width: 42, height: 24, background: checked ? 'var(--t-brand)' : 'var(--t-line)', position: 'relative' }}>
      <span className="absolute rounded-full" style={{ width: 18, height: 18, top: 3, left: checked ? 21 : 3, backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left 0.18s ease' }} />
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
  const { t } = useTranslation()
  const locale = useLocale() // carries the time-format preference (hour-cycle) for native pickers
  const editing = !!event
  const initialStart = event ? new Date(event.startAt) : defaultDate
  const initialEnd = event ? new Date(event.endAt) : new Date(defaultDate.getTime() + 60 * 60 * 1000)

  const [title, setTitle] = useState(event?.title ?? '')
  // An all-day event's date is the authoritative, offset-invariant prefix of its
  // timestamp; reading it via initialStart (new Date) would shift the day for a
  // browser whose timezone differs from the family's.
  const [dateStr, setDateStr] = useState(
    event?.allDay
      ? event.startAt.slice(0, 10)
      : `${initialStart.getFullYear()}-${pad(initialStart.getMonth() + 1)}-${pad(initialStart.getDate())}`,
  )
  const [allDay, setAllDay] = useState(event?.allDay ?? false)
  const [startTime, setStartTime] = useState(`${pad(initialStart.getHours())}:${pad(initialStart.getMinutes())}`)
  const [endTime, setEndTime] = useState(`${pad(initialEnd.getHours())}:${pad(initialEnd.getMinutes())}`)
  const [attendees, setAttendees] = useState<string[]>(event?.attendeeIds ?? [])
  const [requiresGuardian, setRequiresGuardian] = useState(event?.requiresGuardian ?? false)
  const [important, setImportant] = useState(event?.visibilityTag === 'milestone')
  const [location, setLocation] = useState(event?.location ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [externalAttendees, setExternalAttendees] = useState(event?.externalAttendees ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const hasChild = attendees.some((id) => byId.get(id)?.role === 'child')
  const familyHasChild = members.some((m) => m.role === 'child')

  // Calendars an event can be saved to: the per-person and family calendars
  // (not the managed birthdays/chores calendars, nor read-only Google overlays).
  const targetable = useMemo(
    () => sources.filter((s) => (s.kind === 'person' || s.kind === 'family') && !s.readOnly),
    [sources],
  )
  const familySource = sources.find((s) => s.kind === 'family')
  const personSourceFor = (mid?: string) => sources.find((s) => s.kind === 'person' && s.memberId === mid)
  const defaultSourceId = () => {
    if (attendees.length === 1) {
      const ps = personSourceFor(attendees[0])
      if (ps) return ps.id
    }
    return familySource?.id ?? targetable[0]?.id ?? ''
  }
  const [sourceId, setSourceId] = useState(event?.calendarSourceId ?? '')
  const [pickedSource, setPickedSource] = useState(false)
  // For a new event, follow the attendee-based default until the user overrides
  // it. Depends on sources too, since they load asynchronously after mount.
  useEffect(() => {
    if (!editing && !pickedSource) setSourceId(defaultSourceId())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendees, editing, pickedSource, sources])

  const toggleAttendee = (id: string) =>
    setAttendees((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const save = async () => {
    if (!title.trim()) { setError(t('event.titleRequired')); return }
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

    if (!sourceId) { setError(t('event.noCalendar')); return }
    const payload: NewEvent = {
      calendarSourceId: sourceId,
      title: title.trim(),
      description: description || null,
      location: location || null,
      startAt,
      endAt,
      allDay,
      visibilityTag: important ? 'milestone' : 'standard',
      requiresGuardian: requiresGuardian && hasChild,
      attendeeIds: attendees,
      externalAttendees: externalAttendees.trim() || null,
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
    <div className="fixed inset-0 z-50 flex lg:items-center lg:justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="flex flex-col w-full h-full lg:h-auto lg:w-[560px] lg:max-h-[85vh] overflow-hidden lg:rounded-(--t-radius-lg)"
        style={{ background: 'var(--t-surface)', color: 'var(--t-text)', boxShadow: 'var(--t-shadow-pop)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--t-line)' }}>
          <button aria-label={t('common.close')} onClick={onClose}><X size={20} style={{ color: 'var(--t-text-soft)' }} /></button>
          <div className="font-display text-lg" style={{ fontWeight: 500 }}>{editing ? t('event.editTitle') : t('event.newTitle')}</div>
          <button className="text-sm font-semibold disabled:opacity-50" style={{ color: 'var(--t-brand)' }} onClick={save} disabled={busy || (!editing && !sourceId)}>{t('common.save')}</button>
        </div>

        <div className="p-5 overflow-y-auto">
          {error && <div className="rounded-xl p-2 mb-3 text-sm" style={{ backgroundColor: '#fde8e8', color: '#9b1c1c' }}>{error}</div>}

          <input
            className="w-full font-display text-2xl bg-transparent outline-hidden mb-3"
            style={{ color: 'var(--t-text)', fontWeight: 500 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('event.titlePlaceholder')} autoFocus
          />

          {/* Date & time */}
          <div className="px-3" style={{ border: '1px solid var(--t-line)', borderRadius: 'var(--t-radius-md)' }}>
            <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid var(--t-line)' }}>
              <Calendar size={16} style={{ color: 'var(--t-text-soft)', flexShrink: 0 }} />
              <div className="flex-1"><DatePicker value={dateStr} onChange={setDateStr} locale={locale} /></div>
            </div>
            <div className="flex items-center gap-3 py-2.5">
              <Clock size={16} style={{ color: 'var(--t-text-soft)', flexShrink: 0 }} />
              <div className="flex-1 flex items-center justify-between">
                {allDay ? (
                  <span className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('event.allDay')}</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <TimePicker value={startTime} onChange={setStartTime} locale={locale} />
                    <span style={{ color: 'var(--t-text-soft)' }}>–</span>
                    <TimePicker value={endTime} onChange={setEndTime} locale={locale} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--t-text-soft)' }}>{t('event.allDay')}</span>
                  <Switch checked={allDay} onChange={setAllDay} />
                </div>
              </div>
            </div>
          </div>

          {/* Attendees */}
          <div className="mt-3">
            <div className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--t-text-soft)', letterSpacing: '.06em' }}>{t('event.whosComing')}</div>
            <div className="flex gap-3 flex-wrap">
              {members.map((p, i) => {
                const sel = attendees.includes(p.id)
                return (
                  <button key={p.id} onClick={() => toggleAttendee(p.id)} className="flex flex-col items-center gap-1">
                    <div style={{ opacity: sel ? 1 : 0.3, transition: 'opacity .15s' }}>
                      <PersonAvatar name={p.name} color={p.color} index={i} size={44} />
                    </div>
                    <span className="text-xs" style={{ color: sel ? 'var(--t-text)' : 'var(--t-text-soft)' }}>{p.name}</span>
                  </button>
                )
              })}
            </div>

            {hasChild ? (
              <GuardianCard
                enabled={requiresGuardian}
                onToggle={setRequiresGuardian}
                event={event}
                members={members}
                editing={editing}
                onClaimed={onSaved}
              />
            ) : familyHasChild && (
              <div className="text-xs mt-3" style={{ color: 'var(--t-text-soft)' }}>{t('event.guardianHint')}</div>
            )}
          </div>

          {/* Details */}
          <div className="px-3 mt-3" style={{ border: '1px solid var(--t-line)', borderRadius: 'var(--t-radius-md)' }}>
            <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid var(--t-line)' }}>
              <MapPin size={16} style={{ color: 'var(--t-text-soft)', flexShrink: 0 }} />
              <input className="w-full bg-transparent outline-hidden text-sm" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t('event.addLocation')} />
            </div>
            <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid var(--t-line)' }}>
              <AlignLeft size={16} style={{ color: 'var(--t-text-soft)', flexShrink: 0 }} />
              <textarea className="w-full bg-transparent outline-hidden text-sm resize-none" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('event.notes')} />
            </div>
            <div className="flex items-center gap-3 py-2.5">
              <Users size={16} style={{ color: 'var(--t-text-soft)', flexShrink: 0 }} />
              <input className="w-full bg-transparent outline-hidden text-sm" value={externalAttendees} onChange={(e) => setExternalAttendees(e.target.value)} placeholder={t('event.externalAttendees')} />
            </div>
          </div>

          {/* Important + calendar */}
          <div className="px-3 mt-3" style={{ border: '1px solid var(--t-line)', borderRadius: 'var(--t-radius-md)' }}>
            <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid var(--t-line)' }}>
              <div className="flex items-center gap-3">
                <Star size={16} style={{ color: 'var(--t-text-soft)', flexShrink: 0 }} />
                <div>
                  <div className="text-sm font-medium">{t('event.important')}</div>
                  <div className="text-xs" style={{ color: 'var(--t-text-soft)' }}>{t('event.importantHint')}</div>
                </div>
              </div>
              <Switch checked={important} onChange={setImportant} />
            </div>
            <div className="flex items-center gap-3 py-2.5">
              <Layers size={16} style={{ color: 'var(--t-text-soft)', flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{t('event.calendarLabel')}</div>
                <div className="text-xs" style={{ color: 'var(--t-text-soft)' }}>{t('event.calendarHint')}</div>
              </div>
              {editing ? (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--t-text-soft)' }}>
                  <Lock size={13} style={{ flexShrink: 0 }} />
                  <span>{(() => { const s = sources.find((s) => s.id === sourceId); return s ? calendarLabel(s, t) : '—' })()}</span>
                </div>
              ) : (
                <select
                  aria-label={t('event.calendarLabel')}
                  className="bg-transparent outline-hidden text-sm font-medium text-right"
                  value={sourceId}
                  onChange={(e) => { setSourceId(e.target.value); setPickedSource(true) }}
                >
                  {targetable.length === 0 && <option value="">{t('event.noCalendar')}</option>}
                  {targetable.map((s) => <option key={s.id} value={s.id}>{calendarLabel(s, t)}</option>)}
                </select>
              )}
            </div>
          </div>

          {editing && (
            <div className="mt-4">
              <Button variant="danger" onClick={remove} disabled={busy} style={{ width: '100%' }}>
                <Trash2 size={16} /> {t('event.deleteEvent')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Shows the computed guardian state for the saved event (assigned / unclaimed /
// conflict) and lets a guardian claim it. For a brand-new event the state is
// computed on save.
function GuardianCard({ enabled, onToggle, event, members, editing, onClaimed }: {
  enabled: boolean
  onToggle: (v: boolean) => void
  event: TriboEvent | null
  members: FamilyMember[]
  editing: boolean
  onClaimed: () => void
}) {
  const { t } = useTranslation()
  const assigned = event?.assignedGuardianId ? members.find((m) => m.id === event.assignedGuardianId) : undefined
  const conflict = event?.conflictStatus === 'needs_guardian'
  const guardians = members.filter((m) => m.role === 'guardian')
  const [freeIDs, setFreeIDs] = useState<string[]>([])

  // Fetch the free-guardian candidates for an unclaimed event.
  useEffect(() => {
    if (editing && enabled && event && !assigned && !conflict) {
      getEventGuardians(event.id).then((r) => setFreeIDs(r.free)).catch(() => setFreeIDs([]))
    }
  }, [editing, enabled, event, assigned, conflict])

  const claim = (memberId: string, force: boolean) => {
    if (!event) return
    claimEvent(event.id, memberId, force).then(onClaimed).catch(() => {})
  }

  const indexOf = (id: string) => members.findIndex((m) => m.id === id)

  return (
    <div className="p-3 mt-3" style={{ border: '1px solid var(--t-line)', borderRadius: 'var(--t-radius-md)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck size={16} style={{ color: 'var(--t-text-soft)' }} /> {t('event.requiresGuardian')}
        </div>
        <Switch checked={enabled} onChange={onToggle} />
      </div>

      {enabled && (
        <div className="mt-3">
          {!editing ? (
            <div className="text-sm rounded-xl p-2.5" style={{ background: 'var(--t-bg)', color: 'var(--t-text-soft)' }}>
              {t('event.guardianAutoAssign')}
            </div>
          ) : assigned ? (
            <div className="flex items-center gap-2.5 rounded-xl p-2.5"
              style={{ background: 'color-mix(in srgb, var(--t-brand) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--t-brand) 40%, transparent)' }}>
              <PersonAvatar name={assigned.name} color={assigned.color} index={indexOf(assigned.id)} size={32} />
              <div className="text-sm flex-1 font-semibold" style={{ color: 'var(--t-brand)' }}>{t('event.assignedTo', { name: assigned.name })}</div>
              <Check size={16} style={{ color: 'var(--t-brand)', flexShrink: 0 }} />
            </div>
          ) : conflict ? (
            <div className="rounded-xl p-2.5" style={{ background: 'color-mix(in srgb, var(--t-accent) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--t-accent) 40%, transparent)' }}>
              <div className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: 'var(--t-accent)' }}>
                <AlertTriangle size={14} /> {t('event.noGuardianAvailable')}
              </div>
              <div className="flex gap-2 flex-wrap">
                {guardians.map((g) => (
                  <ClaimButton key={g.id} member={g} index={indexOf(g.id)} onClick={() => claim(g.id, true)} label={t('event.claim', { name: g.name })} />
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl p-2.5" style={{ background: 'var(--t-bg)' }}>
              <div className="text-sm mb-2">{t('event.multipleFree')}</div>
              <div className="flex gap-2 flex-wrap">
                {guardians.filter((g) => freeIDs.includes(g.id)).map((g) => (
                  <ClaimButton key={g.id} member={g} index={indexOf(g.id)} onClick={() => claim(g.id, false)} label={t('event.claim', { name: g.name })} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ClaimButton({ member, index, label, onClick }: { member: FamilyMember; index: number; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 text-xs font-semibold" style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
      <PersonAvatar name={member.name} color={member.color} index={index} size={20} />
      {label}
    </button>
  )
}
