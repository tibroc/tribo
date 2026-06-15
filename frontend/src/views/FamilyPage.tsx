import { useEffect, useState } from 'react'
import {
  Users, CalendarDays, CheckSquare, Globe, Repeat, Shuffle, ChevronRight, MapPin, Palette, LogIn,
  RefreshCw, Trash2, Plus,
} from 'lucide-react'
import { palette } from '../lib/tokens'
import type { Section } from '../lib/calendar'
import {
  getFamilyMembers, getWorkSchedules, getChores, getCalendarSources,
  addCalendarSource, syncCalendarSource, deleteCalendarSource, setWorkScheduleVisibility,
  type FamilyMember, type WorkSchedule, type Chore, type CalendarSource,
} from '../lib/api'
import AppShell from '../components/AppShell'
import { SimpleHeader } from '../components/chrome'
import Card from '../components/Card'
import PersonAvatar from '../components/PersonAvatar'
import OnboardingWizard from './OnboardingWizard'
import { MemberForm, ChoreForm, WorkScheduleForm } from '../components/SettingsForms'
import { useSession } from '../lib/session'

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export default function FamilyPage({ go }: { go: (s: Section) => void }) {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [schedules, setSchedules] = useState<WorkSchedule[]>([])
  const [chores, setChores] = useState<Chore[]>([])
  const [sources, setSources] = useState<CalendarSource[]>([])
  const reloadSources = () => getCalendarSources().then(setSources).catch(() => {})
  const reloadSchedules = () => getWorkSchedules().then(setSchedules).catch(() => {})
  const reloadMembers = () => getFamilyMembers().then(setMembers).catch(() => {})
  const reloadChores = () => getChores().then(setChores).catch(() => {})

  // Edit modals: undefined = closed; null = add; item = edit.
  const [memberModal, setMemberModal] = useState<FamilyMember | null | undefined>(undefined)
  const [choreModal, setChoreModal] = useState<Chore | null | undefined>(undefined)
  const [wsModal, setWsModal] = useState<WorkSchedule | null | undefined>(undefined)
  const guardians = members.filter((m) => m.role === 'guardian')
  useEffect(() => {
    getFamilyMembers().then(setMembers).catch(() => {})
    getWorkSchedules().then(setSchedules).catch(() => {})
    getChores().then(setChores).catch(() => {})
    reloadSources()
  }, [])

  const [showConnect, setShowConnect] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const { refresh: refreshSession } = useSession()
  const nameOf = (id?: string) => members.find((m) => m.id === id)?.name ?? ''

  if (showWizard) {
    const reloadAll = () => {
      getFamilyMembers().then(setMembers).catch(() => {})
      getChores().then(setChores).catch(() => {})
      reloadSources()
      refreshSession()
    }
    return <OnboardingWizard onDone={() => { setShowWizard(false); reloadAll() }} onCancel={() => setShowWizard(false)} />
  }
  const choreWho = (c: Chore) =>
    c.assignmentMode === 'rotation'
      ? (c.rotationMemberIds ?? []).map(nameOf).filter(Boolean).join(', ')
      : nameOf(c.assignedMemberId)

  return (
    <AppShell active="family" onNavigate={go} showFab={false} header={<SimpleHeader title="Family" />}>
      <div className="space-y-4">
        {/* Family members */}
        <Section title="Family members" icon={Users}>
          <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-4">
            {members.map((p) => (
              <button key={p.id} onClick={() => setMemberModal(p)} className="flex items-center gap-3 py-2 text-left">
                <PersonAvatar name={p.name} color={p.color} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{p.name}</div>
                  <div className="text-xs truncate" style={{ color: palette.inkSoft }}>
                    {p.role === 'guardian' ? 'Guardian' : `Child · Default guardian: ${nameOf(p.defaultGuardianId) || '—'}`}
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
              </button>
            ))}
          </div>
          <AddRow label="Add family member" onClick={() => setMemberModal(null)} />
        </Section>

        {/* Work schedules */}
        <Section title="Work schedules" icon={CalendarDays}>
          <div className="space-y-4">
            {schedules.map((s) => {
              const m = members.find((x) => x.id === s.memberId)
              const color = m?.color ?? palette.brand
              return (
                <div key={s.id}>
                  <button onClick={() => setWsModal(s)} className="flex items-center gap-2 mb-2 w-full text-left">
                    <PersonAvatar name={m?.name} color={color} size={28} />
                    <div className="text-sm font-semibold">{m?.name}</div>
                    <div className="text-xs ml-auto" style={{ color: palette.inkSoft }}>{s.label} · {s.startTime} – {s.endTime}</div>
                    <ChevronRight size={14} style={{ color: palette.inkSoft }} />
                  </button>
                  <div className="flex gap-1 mb-2">
                    {DAY_LABELS.map((d, i) => {
                      const on = s.daysOfWeek[i] === '1'
                      return (
                        <div key={i} className="flex-1 rounded-md text-center text-xs font-semibold py-1.5"
                          style={on ? { backgroundColor: color + '20', color: palette.ink } : { backgroundColor: palette.mist, color: palette.inkSoft }}>
                          {d}
                        </div>
                      )
                    })}
                  </div>
                  <label className="flex items-center gap-2 text-xs" style={{ color: palette.inkSoft }}>
                    <input
                      type="checkbox" checked={s.showOnCalendar} className="w-3.5 h-3.5 rounded"
                      onChange={(e) => setWorkScheduleVisibility(s.id, e.target.checked).then(reloadSchedules)}
                    />
                    Show as "busy" on calendar
                  </label>
                </div>
              )
            })}
          </div>
          {guardians.length > 0 && <AddRow label="Add work schedule" onClick={() => setWsModal(null)} />}
        </Section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chores */}
          <Section title="Chores" icon={CheckSquare}>
            <div className="space-y-2">
              {chores.map((c) => (
                <button key={c.id} onClick={() => setChoreModal(c)} className="flex items-center gap-2 py-1 w-full text-left">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color ?? palette.brand }} />
                  <span className="text-sm flex-1 truncate">{c.title}</span>
                  <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{cap(c.recurrenceRule)} · {choreWho(c)}</span>
                  {c.assignmentMode === 'rotation'
                    ? <Shuffle size={14} style={{ color: palette.inkSoft, flexShrink: 0 }} />
                    : <Repeat size={14} style={{ color: palette.inkSoft, flexShrink: 0 }} />}
                </button>
              ))}
            </div>
            <AddRow label="Add chore" onClick={() => setChoreModal(null)} />
          </Section>

          {/* Calendars — internal + connected external (CalDAV) sources. */}
          <Section title="Calendars" icon={Globe}>
            <div className="space-y-2">
              {sources.map((c) => (
                <div key={c.id} className="flex items-center gap-2 py-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.isShared ? '#D99A2B' : palette.brand }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.displayName}</div>
                    <div className="text-xs truncate capitalize" style={{ color: palette.inkSoft }}>
                      {c.type === 'internal' ? 'Built-in' : `${c.type}${c.readOnly ? ' · read-only' : ''}`}
                    </div>
                  </div>
                  {c.type !== 'internal' && (
                    <>
                      <button aria-label="Sync now" onClick={() => syncCalendarSource(c.id).then(reloadSources)}>
                        <RefreshCw size={14} style={{ color: palette.inkSoft }} />
                      </button>
                      <button aria-label="Remove" onClick={() => deleteCalendarSource(c.id).then(reloadSources)}>
                        <Trash2 size={14} style={{ color: palette.inkSoft }} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowConnect(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 mt-2 text-sm font-semibold"
              style={{ border: `1px dashed ${palette.line}`, color: palette.inkSoft }}
            >
              <Plus size={16} /> Add calendar
            </button>
          </Section>
        </div>

        {showConnect && (
          <ConnectCalendarModal
            onClose={() => setShowConnect(false)}
            onConnected={() => { setShowConnect(false); reloadSources() }}
          />
        )}
        {memberModal !== undefined && (
          <MemberForm member={memberModal ?? undefined} members={members}
            onClose={() => setMemberModal(undefined)}
            onSaved={() => { setMemberModal(undefined); reloadMembers(); reloadSchedules() }} />
        )}
        {choreModal !== undefined && (
          <ChoreForm chore={choreModal ?? undefined} members={members}
            onClose={() => setChoreModal(undefined)}
            onSaved={() => { setChoreModal(undefined); reloadChores() }} />
        )}
        {wsModal !== undefined && (
          <WorkScheduleForm schedule={wsModal ?? undefined} guardians={guardians}
            onClose={() => setWsModal(undefined)}
            onSaved={() => { setWsModal(undefined); reloadSchedules() }} />
        )}

        {/* App settings (static) */}
        <Section title="App settings">
          <div className="space-y-3">
            <SettingRow icon={MapPin} title="Location" sub="Lisbon, Portugal — used for weather" />
            <SettingRow icon={Palette} title="Appearance" sub="Default color theme" />
            <SettingRow icon={LogIn} title="Account" sub="Sign-in via Authentik arrives in a later update" />
            <button onClick={() => setShowWizard(true)} className="w-full flex items-center gap-3 text-left">
              <Plus size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Run setup wizard</div>
                <div className="text-xs" style={{ color: palette.inkSoft }}>Add members, chores, or a typical week</div>
              </div>
              <ChevronRight size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
            </button>
          </div>
        </Section>
      </div>
    </AppShell>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon?: typeof Users; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="font-display text-base font-bold mb-3 flex items-center gap-2">{Icon && <Icon size={16} />} {title}</div>
      {children}
    </Card>
  )
}

function SettingRow({ icon: Icon, title, sub }: { icon: typeof MapPin; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs truncate" style={{ color: palette.inkSoft }}>{sub}</div>
      </div>
      <ChevronRight size={16} style={{ color: palette.inkSoft, flexShrink: 0 }} />
    </div>
  )
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 mt-2 text-sm font-semibold" style={{ border: `1px dashed ${palette.line}`, color: palette.inkSoft }}>
      <Plus size={16} /> {label}
    </button>
  )
}

// CalDAV connect flow (designed just-in-time per the build brief).
function ConnectCalendarModal({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const [displayName, setDisplayName] = useState('')
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [readOnly, setReadOnly] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = async () => {
    if (!url.trim()) { setError('CalDAV URL is required'); return }
    setBusy(true); setError(null)
    try {
      await addCalendarSource({ type: 'caldav', displayName: displayName || 'Calendar', url: url.trim(), username, password, readOnly })
      onConnected()
    } catch (e) { setError(String(e)); setBusy(false) }
  }

  const field = { border: `1px solid ${palette.line}` }
  return (
    <div className="fixed inset-0 z-50 flex lg:items-center lg:justify-center" style={{ backgroundColor: palette.ink + '66' }}>
      <div className="flex flex-col w-full h-full lg:h-auto lg:w-[440px] lg:rounded-2xl lg:shadow-xl overflow-hidden" style={{ backgroundColor: palette.surface }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${palette.line}` }}>
          <button onClick={onClose} className="text-sm" style={{ color: palette.inkSoft }}>Cancel</button>
          <div className="font-display text-lg font-bold">Add CalDAV calendar</div>
          <button onClick={connect} disabled={busy} className="text-sm font-semibold disabled:opacity-50" style={{ color: palette.brand }}>Connect</button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="rounded-xl p-2 text-sm" style={{ backgroundColor: '#fde8e8', color: '#9b1c1c' }}>{error}</div>}
          <input className="w-full text-sm rounded-xl px-3 py-2 outline-none" style={field} placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <input className="w-full text-sm rounded-xl px-3 py-2 outline-none" style={field} placeholder="CalDAV URL (e.g. https://host/dav/user/calendar/)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input className="w-full text-sm rounded-xl px-3 py-2 outline-none" style={field} placeholder="Username (optional)" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input type="password" className="w-full text-sm rounded-xl px-3 py-2 outline-none" style={field} placeholder="Password (optional)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <label className="flex items-center gap-2 text-sm" style={{ color: palette.inkSoft }}>
            <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} className="w-4 h-4 rounded" />
            Read-only (don't push Tribo events to this calendar)
          </label>
        </div>
      </div>
    </div>
  )
}
