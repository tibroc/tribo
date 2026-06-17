import { useEffect, useState } from 'react'
import {
  Users, CalendarDays, CheckSquare, Globe, ChevronRight, MapPin, Palette, LogIn,
  RefreshCw, Trash2, Plus,
} from 'lucide-react'
import type { Section } from '../lib/calendar'
import {
  getFamilyMembers, getWorkSchedules, getChores, getCalendarSources,
  addCalendarSource, syncCalendarSource, deleteCalendarSource, setWorkScheduleVisibility, googleConnectUrl,
  getWeatherSettings, updateWeatherSettings, geocodeLocation,
  type FamilyMember, type WorkSchedule, type Chore, type CalendarSource,
  type WeatherSettings, type WeatherUnits, type GeoResult,
} from '../lib/api'
import AppShell from '../components/AppShell'
import { SimpleHeader, WEATHER_CHANGED_EVENT } from '../components/chrome'
import Card from '../components/Card'
import Button from '../components/Button'
import PersonAvatar from '../components/PersonAvatar'
import OnboardingWizard from './OnboardingWizard'
import { MemberForm, ChoreForm, WorkScheduleForm } from '../components/SettingsForms'
import { RecurrencePill } from '../components/panels'
import { useSession } from '../lib/session'

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export default function FamilyPage({ go }: { go: (s: Section) => void }) {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [schedules, setSchedules] = useState<WorkSchedule[]>([])
  const [chores, setChores] = useState<Chore[]>([])
  const [sources, setSources] = useState<CalendarSource[]>([])
  const [weather, setWeather] = useState<WeatherSettings | null>(null)
  const [showLocation, setShowLocation] = useState(false)
  const reloadWeather = () => getWeatherSettings().then(setWeather).catch(() => {})
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
    reloadWeather()
  }, [])

  const [showConnect, setShowConnect] = useState(false)
  const [calError, setCalError] = useState<string | null>(null)
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
      <div style={{ padding: '22px 26px' }} className="space-y-4">
        {/* Banner */}
        <FamilyBanner members={members} guardians={guardians} sources={sources} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Family members */}
        <Section title="Family members" icon={Users} flush
          action={<Button variant="ghost" size="sm" style={{ color: 'var(--t-brand)' }} onClick={() => setMemberModal(null)}><Plus size={14} /> Add member</Button>}>
          {members.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3" style={{ padding: '12px 22px', borderBottom: i === members.length - 1 ? 'none' : '1px solid var(--t-line)' }}>
              <PersonAvatar name={p.name} color={p.color} index={i} size={40} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ fontFamily: 'var(--t-font-display)', fontWeight: 600 }}>{p.name}</div>
                <div className="text-xs truncate" style={{ color: 'var(--t-text-soft)' }}>
                  {p.role === 'guardian' ? 'Guardian' : `Child · Default guardian: ${nameOf(p.defaultGuardianId) || '—'}`}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setMemberModal(p)}>Edit</Button>
            </div>
          ))}
        </Section>

        {/* Work schedules */}
        <Section title="Work schedules" icon={CalendarDays}
          action={guardians.length > 0 ? <Button variant="ghost" size="sm" style={{ color: 'var(--t-brand)' }} onClick={() => setWsModal(null)}><Plus size={14} /> Add</Button> : undefined}>
          <div className="space-y-4">
            {schedules.map((s) => {
              const mi = members.findIndex((x) => x.id === s.memberId)
              const m = members[mi]
              const color = m?.color ?? '#3E6259'
              return (
                <div key={s.id}>
                  <button onClick={() => setWsModal(s)} className="flex items-center gap-2 mb-2 w-full text-left">
                    <PersonAvatar name={m?.name} color={m?.color} index={mi >= 0 ? mi : undefined} size={28} />
                    <div className="text-sm font-semibold">{m?.name}</div>
                    <div className="text-xs ml-auto" style={{ color: 'var(--t-text-soft)' }}>{s.label} · {s.startTime} – {s.endTime}</div>
                    <ChevronRight size={14} style={{ color: 'var(--t-text-soft)' }} />
                  </button>
                  <div className="flex gap-1 mb-2">
                    {DAY_LABELS.map((d, i) => {
                      const on = s.daysOfWeek[i] === '1'
                      return (
                        <div key={i} className="flex-1 rounded-md text-center text-xs font-semibold py-1.5"
                          style={on ? { backgroundColor: color + '22', color } : { background: 'var(--t-bg)', color: 'var(--t-text-soft)' }}>
                          {d}
                        </div>
                      )
                    })}
                  </div>
                  <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--t-text-soft)' }}>
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
        </Section>

          {/* Chores */}
          <Section title="Chores" icon={CheckSquare} flush
            action={<Button variant="ghost" size="sm" style={{ color: 'var(--t-brand)' }} onClick={() => setChoreModal(null)}><Plus size={14} /> Add chore</Button>}>
            {chores.map((c, i) => (
              <button key={c.id} onClick={() => setChoreModal(c)} className="flex items-center gap-3 w-full text-left" style={{ padding: '12px 22px', borderBottom: i === chores.length - 1 ? 'none' : '1px solid var(--t-line)' }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color ?? '#3E6259' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate font-medium">{c.title}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--t-text-soft)' }}>{choreWho(c)}</div>
                </div>
                <RecurrencePill label={c.assignmentMode === 'rotation' ? 'Rotation' : cap(c.recurrenceRule)} rotation={c.assignmentMode === 'rotation'} />
              </button>
            ))}
          </Section>

          {/* Calendars — internal + connected external (CalDAV) sources. */}
          <Section title="Calendar sources" icon={Globe}
            action={<Button variant="ghost" size="sm" style={{ color: 'var(--t-brand)' }} onClick={() => setShowConnect(true)}><Plus size={14} /> Connect</Button>}>
            <div className="space-y-2">
              {sources.map((c) => (
                <div key={c.id} className="flex items-center gap-2 py-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.isShared ? 'var(--t-accent)' : 'var(--t-brand)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.displayName}</div>
                    <div className="text-xs truncate capitalize" style={{ color: 'var(--t-text-soft)' }}>
                      {c.type === 'internal' ? 'Built-in' : `${c.type}${c.readOnly ? ' · read-only' : ''}`}
                    </div>
                  </div>
                  {c.type !== 'internal' && (
                    <>
                      <button aria-label="Sync now" onClick={() => syncCalendarSource(c.id).then(reloadSources)}>
                        <RefreshCw size={14} style={{ color: 'var(--t-text-soft)' }} />
                      </button>
                      <button aria-label="Remove" onClick={() => deleteCalendarSource(c.id).then(reloadSources)}>
                        <Trash2 size={14} style={{ color: 'var(--t-text-soft)' }} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <AddRow label="Connect Google Calendar" onClick={() => {
              googleConnectUrl()
                .then((r) => { window.location.href = r.authUrl })
                .catch((e) => setCalError(String(e)))
            }} />
            {calError && <div className="text-xs mt-2" style={{ color: '#9b1c1c' }}>{calError}</div>}
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
        {showLocation && (
          <LocationModal settings={weather}
            onClose={() => setShowLocation(false)}
            onSaved={() => { setShowLocation(false); reloadWeather(); window.dispatchEvent(new Event(WEATHER_CHANGED_EVENT)) }} />
        )}

        {/* App settings (static) */}
        <Section title="App settings">
          <div className="space-y-3">
            <SettingRow icon={MapPin} title="Location"
              sub={weather?.locationName ? `${weather.locationName} — used for weather` : 'Set a location for the weather widget'}
              onClick={() => setShowLocation(true)} />
            <SettingRow icon={Palette} title="Appearance" sub="Default color theme" />
            <SettingRow icon={LogIn} title="Account" sub="Sign-in via Authentik arrives in a later update" />
            <button onClick={() => setShowWizard(true)} className="w-full flex items-center gap-3 text-left">
              <Plus size={16} style={{ color: 'var(--t-text-soft)', flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Run setup wizard</div>
                <div className="text-xs" style={{ color: 'var(--t-text-soft)' }}>Add members, chores, or a typical week</div>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--t-text-soft)', flexShrink: 0 }} />
            </button>
          </div>
        </Section>
      </div>
    </AppShell>
  )
}

function Section({ title, icon: Icon, action, children, flush }: { title: string; icon?: typeof Users; action?: React.ReactNode; children: React.ReactNode; flush?: boolean }) {
  return (
    <Card
      title={<span className="flex items-center gap-2">{Icon && <Icon size={16} style={{ color: 'var(--t-brand)' }} />}{title}</span>}
      action={action}
      padded={!flush}
    >
      {children}
    </Card>
  )
}

// Family banner: overlapping avatar stack + title + member/guardian summary + Invite.
function FamilyBanner({ members, guardians, sources }: { members: FamilyMember[]; guardians: FamilyMember[]; sources: CalendarSource[] }) {
  const sharedSources = sources.filter((s) => s.isShared).length
  return (
    <Card>
      <div className="flex items-center gap-4">
        <div className="flex items-center">
          {members.map((m, i) => (
            <div key={m.id} style={{ marginLeft: i === 0 ? 0 : -10 }}>
              <PersonAvatar name={m.name} color={m.color} index={i} size={44} ring />
            </div>
          ))}
          <div style={{ marginLeft: -10 }}>
            <PersonAvatar family size={44} ring />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 28, lineHeight: 1.1, color: 'var(--t-text)' }}>Your family</div>
          <div className="text-sm" style={{ color: 'var(--t-text-soft)', marginTop: 2 }}>
            {members.length} member{members.length === 1 ? '' : 's'} · {guardians.length} guardian{guardians.length === 1 ? '' : 's'} · {sharedSources} shared calendar{sharedSources === 1 ? '' : 's'}
          </div>
        </div>
        <Button variant="outline" size="sm">Invite</Button>
      </div>
    </Card>
  )
}

function SettingRow({ icon: Icon, title, sub, onClick }: { icon: typeof MapPin; title: string; sub: string; onClick?: () => void }) {
  const inner = (
    <>
      <Icon size={16} style={{ color: 'var(--t-text-soft)', flexShrink: 0 }} />
      <div className="flex-1 min-w-0 text-left">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs truncate" style={{ color: 'var(--t-text-soft)' }}>{sub}</div>
      </div>
      <ChevronRight size={16} style={{ color: 'var(--t-text-soft)', flexShrink: 0 }} />
    </>
  )
  if (onClick) {
    return <button onClick={onClick} className="flex items-center gap-3 w-full">{inner}</button>
  }
  return <div className="flex items-center gap-3">{inner}</div>
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-center gap-2 py-2.5 mt-2 text-sm font-semibold"
      style={{ border: '1px dashed var(--t-line)', borderRadius: 'var(--t-radius-md)', color: 'var(--t-text-soft)' }}>
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

  const field = { border: '1px solid var(--t-line)', background: 'var(--t-surface)', borderRadius: 'var(--t-radius-md)' }
  return (
    <div className="fixed inset-0 z-50 flex lg:items-center lg:justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="flex flex-col w-full h-full lg:h-auto lg:w-[440px] overflow-hidden lg:rounded-[var(--t-radius-lg)]"
        style={{ background: 'var(--t-surface)', color: 'var(--t-text)', boxShadow: 'var(--t-shadow-pop)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--t-line)' }}>
          <button onClick={onClose} className="text-sm" style={{ color: 'var(--t-text-soft)' }}>Cancel</button>
          <div className="font-display text-lg" style={{ fontWeight: 500 }}>Add CalDAV calendar</div>
          <button onClick={connect} disabled={busy} className="text-sm font-semibold disabled:opacity-50" style={{ color: 'var(--t-brand)' }}>Connect</button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="rounded-xl p-2 text-sm" style={{ backgroundColor: '#fde8e8', color: '#9b1c1c' }}>{error}</div>}
          <input className="w-full text-sm px-3 py-2 outline-none" style={field} placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <input className="w-full text-sm px-3 py-2 outline-none" style={field} placeholder="CalDAV URL (e.g. https://host/dav/user/calendar/)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input className="w-full text-sm px-3 py-2 outline-none" style={field} placeholder="Username (optional)" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input type="password" className="w-full text-sm px-3 py-2 outline-none" style={field} placeholder="Password (optional)" value={password} onChange={(e) => setPassword(e.target.value)} />
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--t-text-soft)' }}>
            <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} className="w-4 h-4 rounded" />
            Read-only (don't push Tribo events to this calendar)
          </label>
        </div>
      </div>
    </div>
  )
}

// Weather location picker: city search via Open-Meteo geocoding + a units toggle.
function LocationModal({ settings, onClose, onSaved }: { settings: WeatherSettings | null; onClose: () => void; onSaved: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [picked, setPicked] = useState<GeoResult | null>(null)
  const [units, setUnits] = useState<WeatherUnits>(settings?.units ?? 'celsius')
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounced city search.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      setSearching(true)
      geocodeLocation(q)
        .then((r) => setResults(r))
        .catch((e) => setError(String(e)))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const label = (g: GeoResult) => [g.name, g.admin1, g.country].filter(Boolean).join(', ')
  const save = async () => {
    if (!picked) { setError('Pick a location from the search results'); return }
    setBusy(true); setError(null)
    try {
      await updateWeatherSettings({ latitude: picked.latitude, longitude: picked.longitude, locationName: label(picked), units })
      onSaved()
    } catch (e) { setError(String(e)); setBusy(false) }
  }

  const field = { border: '1px solid var(--t-line)', background: 'var(--t-surface)', borderRadius: 'var(--t-radius-md)' }
  return (
    <div className="fixed inset-0 z-50 flex lg:items-center lg:justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="flex flex-col w-full h-full lg:h-auto lg:w-[440px] lg:max-h-[85vh] overflow-hidden lg:rounded-[var(--t-radius-lg)]"
        style={{ background: 'var(--t-surface)', color: 'var(--t-text)', boxShadow: 'var(--t-shadow-pop)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--t-line)' }}>
          <button onClick={onClose} className="text-sm" style={{ color: 'var(--t-text-soft)' }}>Cancel</button>
          <div className="font-display text-lg" style={{ fontWeight: 500 }}>Weather location</div>
          <button onClick={save} disabled={busy || !picked} className="text-sm font-semibold disabled:opacity-50" style={{ color: 'var(--t-brand)' }}>Save</button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          {error && <div className="rounded-xl p-2 text-sm" style={{ backgroundColor: '#fde8e8', color: '#9b1c1c' }}>{error}</div>}
          {settings?.locationName && !picked && (
            <div className="text-xs" style={{ color: 'var(--t-text-soft)' }}>Current: {settings.locationName}</div>
          )}
          <input autoFocus className="w-full text-sm px-3 py-2 outline-none" style={field} placeholder="Search for a city…" value={query} onChange={(e) => { setQuery(e.target.value); setPicked(null) }} />
          {searching && <div className="text-xs" style={{ color: 'var(--t-text-soft)' }}>Searching…</div>}
          {results.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--t-line)' }}>
              {results.map((g, i) => (
                <button key={`${g.latitude},${g.longitude}`} onClick={() => { setPicked(g); setResults([]); setQuery(label(g)) }}
                  className="flex items-center gap-2 w-full text-left text-sm px-3 py-2"
                  style={{ borderBottom: i === results.length - 1 ? 'none' : '1px solid var(--t-line)' }}>
                  <MapPin size={14} style={{ color: 'var(--t-text-soft)', flexShrink: 0 }} />
                  <span className="truncate">{label(g)}</span>
                </button>
              ))}
            </div>
          )}
          {picked && <div className="text-sm font-medium flex items-center gap-2"><MapPin size={14} style={{ color: 'var(--t-brand)' }} /> {label(picked)}</div>}
          <div>
            <div className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--t-text-soft)', letterSpacing: '.06em' }}>Units</div>
            <div className="flex gap-1 rounded-full p-1 w-fit" style={{ background: 'var(--t-shell)', border: '1px solid var(--t-line)' }}>
              {(['celsius', 'fahrenheit'] as WeatherUnits[]).map((u) => (
                <button key={u} onClick={() => setUnits(u)} className="text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={u === units ? { backgroundColor: 'var(--t-brand)', color: 'var(--t-on-brand)' } : { color: 'var(--t-text-soft)' }}>
                  {u === 'celsius' ? '°C' : '°F'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
