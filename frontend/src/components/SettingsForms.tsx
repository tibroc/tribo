import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, Ban, X } from 'lucide-react'
import { markerColor } from '../lib/tokens'
import { ChoreIcon, CHORE_ICON_NAMES } from '../lib/choreIcons'
import DatePicker from './DatePicker'
import TimePicker from './TimePicker'
import ErrorBanner from './ErrorBanner'
import ConfirmDialog from './ConfirmDialog'
import Portal from './Portal'
import {
  createMember, updateMember, deleteMember,
  createChore, updateChore, deleteChore,
  createWorkSchedule, updateWorkSchedule, deleteWorkSchedule,
  type FamilyMember, type Chore, type WorkSchedule, type Effort,
} from '../lib/api'
import Button from './Button'
import { weekdayLabels } from '../lib/datetime'
import { useLocale } from '../lib/i18n'
import { toUnitInterval, fromUnitInterval, type RecurrenceUnit } from '../lib/chores'

// Harmonious generated marker palette (slots 0–7) for the member color picker.
const COLORS = Array.from({ length: 8 }, (_, i) => markerColor(i))
const field = { border: '1px solid var(--t-line)', background: 'var(--t-surface)', borderRadius: 'var(--t-radius-md)' }

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
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  return (
    <Portal singleton="settings-modal">
      <div className="fixed inset-0 z-50 flex lg:items-center lg:justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <div className="flex flex-col w-full h-full lg:h-auto lg:w-[440px] lg:max-h-[85vh] overflow-hidden lg:rounded-(--t-radius-lg)"
          style={{ background: 'var(--t-surface)', color: 'var(--t-text)', boxShadow: 'var(--t-shadow-pop)' }}>
          <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--t-line)' }}>
            <button aria-label={t('common.cancel')} onClick={onClose}><X size={20} style={{ color: 'var(--t-text-soft)' }} /></button>
            <div className="font-display text-lg" style={{ fontWeight: 500 }}>{title}</div>
            <button onClick={onSave} disabled={busy} className="text-sm font-semibold disabled:opacity-50" style={{ color: 'var(--t-brand)' }}>{t('common.save')}</button>
          </div>
          <div className="p-5 space-y-3 overflow-y-auto">
            {error && <ErrorBanner>{error}</ErrorBanner>}
            {children}
            {onDelete && (
              <div className="pt-1">
                <Button variant="danger" onClick={() => setConfirming(true)} disabled={busy} style={{ width: '100%' }}>
                  <Trash2 size={16} /> {t('common.delete')}
                </Button>
              </div>
            )}
          </div>
        </div>
        {confirming && onDelete && (
          <ConfirmDialog busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); onDelete() }} />
        )}
      </div>
    </Portal>
  )
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return <div><div className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--t-text-soft)', letterSpacing: '.06em' }}>{label}</div>{children}</div>
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
  const [dateOfBirth, setDateOfBirth] = useState(member?.dateOfBirth ?? '')
  const [pin, setPin] = useState('')
  const { t } = useTranslation()
  const { busy, error, run } = useSaver(onSaved)
  const guardians = members.filter((m) => m.role === 'guardian' && m.id !== member?.id)
  const locale = useLocale()

  const save = () => run(() => {
    const payload = {
      name, color, role,
      defaultGuardianId: role === 'child' && defaultGuardianId ? defaultGuardianId : null,
      dateOfBirth: dateOfBirth || null,
      pin: pin ? pin : undefined,
    }
    return member ? updateMember(member.id, payload) : createMember(payload)
  })

  return (
    <Modal title={member ? t('forms.editMember') : t('forms.addMember')} onClose={onClose} onSave={save} busy={busy} error={error}
      onDelete={member ? () => run(() => deleteMember(member.id)) : undefined}>
      <Labeled label={t('forms.name')}><input className="w-full text-sm rounded-xl px-3 py-2 outline-hidden" style={field} value={name} onChange={(e) => setName(e.target.value)} /></Labeled>
      <Labeled label={t('forms.color')}>
        <div className="flex items-center gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} className="w-8 h-8"
              style={{ background: c, borderRadius: 'var(--t-squircle, 50% 50% 50% 30%)', outline: color === c ? '2px solid var(--t-text)' : 'none', outlineOffset: 2 }} />
          ))}
        </div>
      </Labeled>
      <Labeled label={t('forms.role.label')}>
        <select className="w-full text-sm rounded-xl px-3 py-2 outline-hidden" style={field} value={role} onChange={(e) => setRole(e.target.value as 'guardian' | 'child')}>
          <option value="guardian">{t('forms.role.guardian')}</option>
          <option value="child">{t('forms.role.child')}</option>
        </select>
      </Labeled>
      {role === 'child' && (
        <Labeled label={t('forms.defaultGuardian')}>
          <select className="w-full text-sm rounded-xl px-3 py-2 outline-hidden" style={field} value={defaultGuardianId} onChange={(e) => setDefaultGuardianId(e.target.value)}>
            <option value="">{t('forms.none')}</option>
            {guardians.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Labeled>
      )}
      <Labeled label={t('forms.dateOfBirth')}>
        <div className="w-full text-sm rounded-xl px-3 py-2" style={field}>
          <DatePicker value={dateOfBirth} onChange={setDateOfBirth} locale={locale} placeholder={t('forms.dateOfBirth')} />
        </div>
      </Labeled>
      <Labeled label={member ? t('forms.pinEdit') : t('forms.pinNew')}>
        <input type="password" className="w-full text-sm rounded-xl px-3 py-2 outline-hidden" style={field} value={pin} onChange={(e) => setPin(e.target.value)} placeholder={t('forms.pinPlaceholder')} />
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
  const initialRecur = toUnitInterval(chore?.recurrenceRule ?? 'weekly', chore?.recurrenceInterval ?? 1)
  const [title, setTitle] = useState(chore?.title ?? '')
  const [description, setDescription] = useState(chore?.description ?? '')
  const [icon, setIcon] = useState(chore?.icon ?? '')
  const [unit, setUnit] = useState<RecurrenceUnit>(initialRecur.unit)
  const [count, setCount] = useState(initialRecur.count)
  const [weekdays, setWeekdays] = useState(chore?.recurrenceWeekdays ?? '')
  const [mode, setMode] = useState<'fixed' | 'rotation'>(chore?.assignmentMode ?? 'fixed')
  const [effort, setEffort] = useState<Effort>(chore?.effort ?? 'standard')
  const [assignee, setAssignee] = useState(chore?.assignedMemberId ?? '')
  const [rotation, setRotation] = useState<string[]>(chore?.rotationMemberIds ?? [])
  const { t } = useTranslation()
  const { busy, error, run } = useSaver(onSaved)
  const dayInitials = weekdayLabels(useLocale(), 'narrow')

  // weekdays is a 7-char Mon..Sun mask; default to all-off until a day is picked.
  const mask = weekdays.length === 7 ? weekdays : '0000000'
  const toggleDay = (i: number) => setWeekdays(mask.substring(0, i) + (mask[i] === '1' ? '0' : '1') + mask.substring(i + 1))

  const colorFor = () => members.find((m) => m.id === (mode === 'fixed' ? assignee : rotation[0]))?.color ?? '#3E6259'
  const save = () => run(() => {
    const { rule, interval } = fromUnitInterval(unit, count)
    // Weekday pinning only applies to weekly chores; send null otherwise / when none picked.
    const wd = unit === 'week' && mask.includes('1') ? mask : null
    const payload = {
      title, description: description.trim() || null, icon: icon || null,
      recurrenceRule: rule, recurrenceInterval: interval, recurrenceWeekdays: wd, assignmentMode: mode,
      assignedMemberId: mode === 'fixed' && assignee ? assignee : null,
      rotationMemberIds: mode === 'rotation' ? rotation : [],
      color: colorFor(),
      effort,
    }
    return chore ? updateChore(chore.id, payload) : createChore(payload)
  })

  return (
    <Modal title={chore ? t('forms.editChore') : t('forms.addChore')} onClose={onClose} onSave={save} busy={busy} error={error}
      onDelete={chore ? () => run(() => deleteChore(chore.id)) : undefined}>
      <Labeled label={t('forms.title')}><input className="w-full text-sm rounded-xl px-3 py-2 outline-hidden" style={field} value={title} onChange={(e) => setTitle(e.target.value)} /></Labeled>
      <Labeled label={t('forms.choreIcon')}>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setIcon('')} title={t('forms.iconNone')}
            className="flex items-center justify-center rounded-lg" style={{ width: 34, height: 34, ...(icon === '' ? { background: 'var(--t-brand)', color: 'var(--t-on-brand)' } : { ...field, color: 'var(--t-text-soft)' }) }}>
            <Ban size={16} />
          </button>
          {CHORE_ICON_NAMES.map((n) => (
            <button key={n} type="button" onClick={() => setIcon(n)}
              className="flex items-center justify-center rounded-lg" style={{ width: 34, height: 34, ...(icon === n ? { background: 'var(--t-brand)', color: 'var(--t-on-brand)' } : { ...field, color: 'var(--t-text)' }) }}>
              <ChoreIcon name={n} size={16} />
            </button>
          ))}
        </div>
      </Labeled>
      <Labeled label={t('forms.choreDescription')}>
        <textarea className="w-full text-sm rounded-xl px-3 py-2 outline-hidden" style={{ ...field, minHeight: 60, resize: 'vertical' }}
          value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('forms.choreDescriptionPlaceholder')} />
      </Labeled>
      <Labeled label={t('forms.repeats')}>
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('recurrence.everyPrefix')}</span>
          <input type="number" min={1} max={120} className="text-sm rounded-xl px-3 py-2 outline-hidden" style={{ ...field, width: 72 }}
            value={count} onChange={(e) => setCount(Math.max(1, Math.min(120, parseInt(e.target.value, 10) || 1)))} />
          <select className="flex-1 text-sm rounded-xl px-3 py-2 outline-hidden" style={field} value={unit} onChange={(e) => setUnit(e.target.value as RecurrenceUnit)}>
            {(['day', 'week', 'month', 'year'] as RecurrenceUnit[]).map((u) => (
              <option key={u} value={u}>{t(`recurrence.unit.${u}`, { count })}</option>
            ))}
          </select>
        </div>
      </Labeled>
      {unit === 'week' && (
        <Labeled label={t('forms.choreWeekdays')}>
          <div className="flex gap-1">
            {dayInitials.map((d, i) => (
              <button key={i} type="button" onClick={() => toggleDay(i)} className="flex-1 rounded-md text-center text-xs font-semibold py-1.5"
                style={mask[i] === '1' ? { background: 'var(--t-brand)', color: 'var(--t-on-brand)' } : { background: 'var(--t-bg)', color: 'var(--t-text-soft)' }}>{d}</button>
            ))}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--t-text-soft)' }}>{t('forms.choreWeekdaysHint')}</div>
        </Labeled>
      )}
      <Labeled label={t('forms.effort')}>
        <div className="flex gap-1.5">
          {(['2min', '5min', 'standard', 'heavy'] as Effort[]).map((e) => (
            <button key={e} type="button" onClick={() => setEffort(e)}
              className="flex-1 rounded-lg text-center text-xs font-semibold py-1.5"
              style={e === effort ? { background: 'var(--t-brand)', color: 'var(--t-on-brand)' } : { ...field, color: 'var(--t-text-soft)' }}>
              {t(`effort.${e}`)}
            </button>
          ))}
        </div>
      </Labeled>
      <Labeled label={t('forms.assignment')}>
        <select className="w-full text-sm rounded-xl px-3 py-2 outline-hidden" style={field} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="fixed">{t('forms.assignmentMode.fixed')}</option>
          <option value="rotation">{t('forms.assignmentMode.rotation')}</option>
        </select>
      </Labeled>
      {mode === 'fixed' ? (
        <Labeled label={t('forms.assignedTo')}>
          <select className="w-full text-sm rounded-xl px-3 py-2 outline-hidden" style={field} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">{t('forms.choose')}</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Labeled>
      ) : (
        <Labeled label={t('forms.rotationInOrder')}>
          <div className="space-y-1">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={rotation.includes(m.id)} className="w-4 h-4 rounded-sm"
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
  const { t } = useTranslation()
  const [memberId, setMemberId] = useState(schedule?.memberId ?? guardians[0]?.id ?? '')
  const [days, setDays] = useState(schedule?.daysOfWeek ?? '1111100')
  const [start, setStart] = useState(schedule?.startTime ?? '09:00')
  const [end, setEnd] = useState(schedule?.endTime ?? '17:00')
  const [label, setLabel] = useState(schedule?.label ?? t('family.workLabel'))
  const [show, setShow] = useState(schedule?.showOnCalendar ?? false)
  const { busy, error, run } = useSaver(onSaved)
  const locale = useLocale()
  const dayInitials = weekdayLabels(locale, 'narrow')

  const toggleDay = (i: number) => setDays((cur) => cur.substring(0, i) + (cur[i] === '1' ? '0' : '1') + cur.substring(i + 1))
  const save = () => run(() => {
    const payload = { memberId, daysOfWeek: days, startTime: start, endTime: end, label, showOnCalendar: show }
    return schedule ? updateWorkSchedule(schedule.id, payload) : createWorkSchedule(payload)
  })

  return (
    <Modal title={schedule ? t('forms.editWorkSchedule') : t('forms.addWorkSchedule')} onClose={onClose} onSave={save} busy={busy} error={error}
      onDelete={schedule ? () => run(() => deleteWorkSchedule(schedule.id)) : undefined}>
      <Labeled label={t('forms.guardian')}>
        <select className="w-full text-sm rounded-xl px-3 py-2 outline-hidden" style={field} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {guardians.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </Labeled>
      <Labeled label={t('forms.days')}>
        <div className="flex gap-1">
          {dayInitials.map((d, i) => (
            <button key={i} onClick={() => toggleDay(i)} className="flex-1 rounded-md text-center text-xs font-semibold py-1.5"
              style={days[i] === '1' ? { background: 'var(--t-brand)', color: 'var(--t-on-brand)' } : { background: 'var(--t-bg)', color: 'var(--t-text-soft)' }}>{d}</button>
          ))}
        </div>
      </Labeled>
      <div className="flex gap-3">
        <Labeled label={t('forms.start')}><div className="text-sm rounded-xl px-3 py-2" style={field}><TimePicker value={start} onChange={setStart} locale={locale} /></div></Labeled>
        <Labeled label={t('forms.end')}><div className="text-sm rounded-xl px-3 py-2" style={field}><TimePicker value={end} onChange={setEnd} locale={locale} /></div></Labeled>
      </div>
      <Labeled label={t('forms.label')}><input className="w-full text-sm rounded-xl px-3 py-2 outline-hidden" style={field} value={label} onChange={(e) => setLabel(e.target.value)} /></Labeled>
      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--t-text-soft)' }}>
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="w-4 h-4 rounded-sm" />
        {t('forms.showBusy')}
      </label>
    </Modal>
  )
}
