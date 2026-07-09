import { useEffect, useState } from 'react'
import {
  Users, CalendarDays, CheckSquare, Globe, ChevronRight, MapPin, Palette, LogIn,
  RefreshCw, Trash2, Plus, Sun, Moon, Monitor, LogOut, Check, Languages, Lock, AlertTriangle, Clock, Sparkles,
} from 'lucide-react'
import { calendarLabel, type Section } from '../lib/calendar'
import {
  getFamilyMembers, getWorkSchedules, getChores, getCalendarSources,
  addCalendarSource, syncCalendarSource, deleteCalendarSource, setWorkScheduleVisibility, googleConnectUrl,
  getCalendarStatus,
  getWeatherSettings, updateWeatherSettings, geocodeLocation, getAssistantStatus,
  type FamilyMember, type WorkSchedule, type Chore, type CalendarSource, type CalendarStatus,
  type WeatherSettings, type WeatherUnits, type GeoResult, type AssistantStatus,
} from '../lib/api'
import AppShell from '../components/AppShell'
import { SimpleHeader, WEATHER_CHANGED_EVENT } from '../components/chrome'
import Card from '../components/Card'
import Button from '../components/Button'
import ErrorBanner from '../components/ErrorBanner'
import ConfirmDialog from '../components/ConfirmDialog'
import Portal from '../components/Portal'
import PersonAvatar from '../components/PersonAvatar'
import OnboardingWizard from './OnboardingWizard'
import { MemberForm, ChoreForm, WorkScheduleForm } from '../components/SettingsForms'
import { RecurrencePill } from '../components/panels'
import { recurrenceLabel } from '../lib/chores'
import { useSession } from '../lib/session'
import { useTheme, type ThemePreference } from '../lib/theme'
import { useTimeFormat, type TimeFormatPreference } from '../lib/timeformat'
import { weekdayLabels, fmtClock } from '../lib/datetime'
import { useLocale, LANGUAGES } from '../lib/i18n'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

export default function FamilyPage({ go }: { go: (s: Section) => void }) {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [schedules, setSchedules] = useState<WorkSchedule[]>([])
  const [chores, setChores] = useState<Chore[]>([])
  const [sources, setSources] = useState<CalendarSource[]>([])
  const [weather, setWeather] = useState<WeatherSettings | null>(null)
  const [showLocation, setShowLocation] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const [showAssistant, setShowAssistant] = useState(false)
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus | null>(null)
  const [showLanguage, setShowLanguage] = useState(false)
  const [showTimeFormat, setShowTimeFormat] = useState(false)
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getFamilyMembers().then(setMembers).catch((e) => setLoadError(String(e))).finally(() => setLoading(false))
    getWorkSchedules().then(setSchedules).catch(() => {})
    getChores().then(setChores).catch(() => {})
    reloadSources()
    reloadWeather()
  }, [])

  const [showConnect, setShowConnect] = useState(false)
  const [calError, setCalError] = useState<string | null>(null)
  const [calStatus, setCalStatus] = useState<CalendarStatus | null>(null)
  const [googleMember, setGoogleMember] = useState('') // member picked for a new Google overlay
  const [pendingSource, setPendingSource] = useState<CalendarSource | null>(null)
  useEffect(() => { getCalendarStatus().then(setCalStatus).catch(() => {}) }, [])
  useEffect(() => { getAssistantStatus().then(setAssistantStatus).catch(() => {}) }, [])
  const [showWizard, setShowWizard] = useState(false)
  const { session, refresh: refreshSession } = useSession()
  const theme = useTheme()
  const timeFormat = useTimeFormat()
  const { t, i18n } = useTranslation()
  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES.find((l) => i18n.language.startsWith(l.code.slice(0, 2))) ?? LANGUAGES[0]
  const locale = useLocale()
  const dayInitials = weekdayLabels(locale, 'narrow')
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
    <AppShell active="family" onNavigate={go} showFab={false} header={<SimpleHeader title={t('nav.family')} />}>
      <div style={{ padding: '22px 26px' }} className="space-y-4">
        {loadError && <ErrorBanner>{loadError}</ErrorBanner>}
        {loading && members.length === 0 && !loadError && (
          <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('common.loading')}</div>
        )}
        {/* Banner */}
        <FamilyBanner members={members} guardians={guardians} sources={sources} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Family members */}
        <Section title={t('family.membersTitle')} icon={Users} flush
          action={<Button variant="ghost" size="sm" style={{ color: 'var(--t-brand)' }} onClick={() => setMemberModal(null)}><Plus size={14} /> {t('family.addMember')}</Button>}>
          {members.map((p, i) => (
            <button key={p.id} onClick={() => setMemberModal(p)} className="flex items-center gap-3 w-full text-left" style={{ padding: '12px 22px', borderBottom: i === members.length - 1 ? 'none' : '1px solid var(--t-line)' }}>
              <PersonAvatar name={p.name} color={p.color} index={i} size={40} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ fontFamily: 'var(--t-font-display)', fontWeight: 600 }}>{p.name}</div>
                <div className="text-xs truncate" style={{ color: 'var(--t-text-soft)' }}>
                  {p.role === 'guardian' ? t('family.roleGuardian') : t('family.roleChild', { name: nameOf(p.defaultGuardianId) || '—' })}
                </div>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--t-text-soft)', flexShrink: 0 }} />
            </button>
          ))}
        </Section>

        {/* Work schedules */}
        <Section title={t('family.workSchedulesTitle')} icon={CalendarDays}
          action={guardians.length > 0 ? <Button variant="ghost" size="sm" style={{ color: 'var(--t-brand)' }} onClick={() => setWsModal(null)}><Plus size={14} /> {t('common.add')}</Button> : undefined}>
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
                    <div className="text-xs ml-auto" style={{ color: 'var(--t-text-soft)' }}>{scheduleLabel(s.label, t)} · {fmtClock(s.startTime, locale)} – {fmtClock(s.endTime, locale)}</div>
                    <ChevronRight size={14} style={{ color: 'var(--t-text-soft)' }} />
                  </button>
                  <div className="flex gap-1 mb-2">
                    {dayInitials.map((d, i) => {
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
                      type="checkbox" checked={s.showOnCalendar} className="w-3.5 h-3.5 rounded-sm"
                      onChange={(e) => setWorkScheduleVisibility(s.id, e.target.checked).then(reloadSchedules)}
                    />
                    {t('family.showBusy')}
                  </label>
                </div>
              )
            })}
          </div>
        </Section>

          {/* Chores */}
          <Section title={t('nav.chores')} icon={CheckSquare} flush
            action={<Button variant="ghost" size="sm" style={{ color: 'var(--t-brand)' }} onClick={() => setChoreModal(null)}><Plus size={14} /> {t('family.addChore')}</Button>}>
            {chores.map((c, i) => (
              <button key={c.id} onClick={() => setChoreModal(c)} className="flex items-center gap-3 w-full text-left" style={{ padding: '12px 22px', borderBottom: i === chores.length - 1 ? 'none' : '1px solid var(--t-line)' }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color ?? '#3E6259' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate font-medium">{c.title}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--t-text-soft)' }}>{choreWho(c)}</div>
                </div>
                <RecurrencePill label={c.assignmentMode === 'rotation' ? t('chores.rotation') : recurrenceLabel(c.recurrenceRule, c.recurrenceInterval, t, c.recurrenceWeekdays, locale)} rotation={c.assignmentMode === 'rotation'} />
              </button>
            ))}
          </Section>

          {/* Calendars — managed Radicale calendars (read-only here) + Google overlays. */}
          <Section title={t('family.calendars.title')} icon={Globe}
            action={<Button variant="ghost" size="sm" style={{ color: 'var(--t-brand)' }} onClick={() => setShowConnect(true)}><Plus size={14} /> {t('common.connect')}</Button>}>
            {calStatus && !calStatus.enabled && (
              <div className="text-xs rounded-lg p-2.5 mb-2 flex items-start gap-2" style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)', color: 'var(--t-text-soft)' }}>
                <Globe size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{t('family.calendars.disabled')}</span>
              </div>
            )}
            {calStatus && calStatus.enabled && !calStatus.reachable && (
              <div className="text-xs rounded-lg p-2.5 mb-2 flex items-start gap-2" style={{ background: 'color-mix(in srgb, var(--t-danger) 12%, transparent)', color: 'var(--t-danger)' }}>
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{t('family.calendars.unreachable')}</span>
              </div>
            )}
            <div className="space-y-2">
              {sources.map((c) => {
                const member = c.memberId ? members.find((m) => m.id === c.memberId) : undefined
                const dot = member?.color ?? (c.isShared ? 'var(--t-accent)' : 'var(--t-brand)')
                const sub = c.managed
                  ? t('family.calendars.managed')
                  : `${c.type === 'internal' ? t('family.calendars.builtin') : c.type}${member ? ' · ' + member.name : ''}${c.readOnly ? ' · ' + t('family.calendars.readOnly') : ''}`
                return (
                  <div key={c.id} className="flex items-center gap-2 py-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-1.5">
                        {calendarLabel(c, t)}
                        {c.managed && <Lock size={11} style={{ color: 'var(--t-text-soft)', flexShrink: 0 }} aria-label={t('family.calendars.managed')} />}
                      </div>
                      <div className="text-xs truncate capitalize" style={{ color: 'var(--t-text-soft)' }}>{sub}</div>
                    </div>
                    {/* Managed calendars are auto-provisioned — no manual sync/remove. */}
                    {!c.managed && c.type !== 'internal' && (
                      <>
                        <button aria-label={t('family.calendars.syncNow')} onClick={() => syncCalendarSource(c.id).then(reloadSources)}>
                          <RefreshCw size={14} style={{ color: 'var(--t-text-soft)' }} />
                        </button>
                        <button aria-label={t('family.calendars.remove')} onClick={() => setPendingSource(c)}>
                          <Trash2 size={14} style={{ color: 'var(--t-text-soft)' }} />
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Google overlay: pick the person it belongs to, then connect (read-only). */}
            <div className="flex items-center gap-2 mt-3">
              <select className="text-sm rounded-lg px-2 py-1.5 outline-hidden flex-1" style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)' }}
                value={googleMember} onChange={(e) => setGoogleMember(e.target.value)}>
                <option value="">{t('family.calendars.googleForWhom')}</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <Button variant="outline" size="sm" disabled={!googleMember} onClick={() => {
                googleConnectUrl(googleMember).then((r) => { window.location.href = r.authUrl }).catch((e) => setCalError(String(e)))
              }}>{t('family.calendars.connectGoogle')}</Button>
            </div>
            {calError && <div className="text-xs mt-2" style={{ color: 'var(--t-danger)' }}>{calError}</div>}
          </Section>
        </div>

        {showConnect && (
          <Portal><ConnectCalendarModal
            members={members}
            onClose={() => setShowConnect(false)}
            onConnected={() => { setShowConnect(false); reloadSources() }}
          /></Portal>
        )}
        {pendingSource && (
          <ConfirmDialog
            message={t('family.calendars.removeConfirm', { name: calendarLabel(pendingSource, t) })}
            confirmLabel={t('family.calendars.remove')}
            onCancel={() => setPendingSource(null)}
            onConfirm={() => { const id = pendingSource.id; setPendingSource(null); deleteCalendarSource(id).then(reloadSources).catch((e) => setCalError(String(e))) }}
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
          <Portal><LocationModal settings={weather}
            onClose={() => setShowLocation(false)}
            onSaved={() => { setShowLocation(false); reloadWeather(); window.dispatchEvent(new Event(WEATHER_CHANGED_EVENT)) }} /></Portal>
        )}
        {showAppearance && <Portal><AppearanceModal onClose={() => setShowAppearance(false)} /></Portal>}
        {showAccount && <Portal><AccountModal onClose={() => setShowAccount(false)} /></Portal>}
        {showAssistant && <Portal><AssistantModal status={assistantStatus} onClose={() => setShowAssistant(false)} /></Portal>}
        {showLanguage && <Portal><LanguageModal onClose={() => setShowLanguage(false)} /></Portal>}
        {showTimeFormat && <Portal><TimeFormatModal onClose={() => setShowTimeFormat(false)} /></Portal>}

        {/* App settings */}
        <Section title={t('settings.appSettings')}>
          <div className="space-y-3">
            <SettingRow icon={MapPin} title={t('settings.location')}
              sub={weather?.locationName ? t('settings.locationSet', { name: weather.locationName }) : t('settings.locationUnset')}
              onClick={() => setShowLocation(true)} />
            <SettingRow icon={Languages} title={t('language.title')} sub={currentLang.label} onClick={() => setShowLanguage(true)} />
            <SettingRow icon={Clock} title={t('settings.timeFormat')} sub={timeFormatSub(timeFormat.preference, t)} onClick={() => setShowTimeFormat(true)} />
            <SettingRow icon={Palette} title={t('settings.appearance')} sub={appearanceSub(theme.preference, t)} onClick={() => setShowAppearance(true)} />
            <SettingRow icon={Sparkles} title={t('assistant.title')}
              sub={assistantStatus?.enabled ? t('assistant.settingsOn', { model: assistantStatus.model }) : t('assistant.settingsOff')}
              onClick={() => setShowAssistant(true)} />
            <SettingRow icon={LogIn} title={t('settings.account')} sub={accountSub(session, t)} onClick={() => setShowAccount(true)} />
            <button onClick={() => setShowWizard(true)} className="w-full flex items-center gap-3 text-left">
              <Plus size={16} style={{ color: 'var(--t-text-soft)', flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{t('settings.runWizard')}</div>
                <div className="text-xs" style={{ color: 'var(--t-text-soft)' }}>{t('settings.runWizardSub')}</div>
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
  const { t } = useTranslation()
  const sharedSources = sources.filter((s) => s.isShared).length
  const summary = [
    t('family.banner.members', { count: members.length }),
    t('family.banner.guardians', { count: guardians.length }),
    t('family.banner.calendars', { count: sharedSources }),
  ].join(' · ')
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
          <div style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 28, lineHeight: 1.1, color: 'var(--t-text)' }}>{t('family.banner.title')}</div>
          <div className="text-sm" style={{ color: 'var(--t-text-soft)', marginTop: 2 }}>
            {summary}
          </div>
        </div>
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


// CalDAV connect flow (designed just-in-time per the build brief).
function ConnectCalendarModal({ members, onClose, onConnected }: { members: FamilyMember[]; onClose: () => void; onConnected: () => void }) {
  const { t } = useTranslation()
  const [displayName, setDisplayName] = useState('')
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [memberId, setMemberId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = async () => {
    if (!memberId) { setError(t('family.calendars.memberRequired')); return }
    if (!url.trim()) { setError(t('family.calendars.urlRequired')); return }
    setBusy(true); setError(null)
    try {
      // A user-added CalDAV calendar is a read-only overlay for one person,
      // mirroring the Google overlay model.
      await addCalendarSource({ type: 'caldav', displayName: displayName || 'Calendar', url: url.trim(), username, password, readOnly: true, memberId })
      onConnected()
    } catch (e) { setError(String(e)); setBusy(false) }
  }

  const field = { border: '1px solid var(--t-line)', background: 'var(--t-surface)', borderRadius: 'var(--t-radius-md)' }
  return (
    <div className="fixed inset-0 z-50 flex lg:items-center lg:justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="flex flex-col w-full h-full lg:h-auto lg:w-[440px] overflow-hidden lg:rounded-(--t-radius-lg)"
        style={{ background: 'var(--t-surface)', color: 'var(--t-text)', boxShadow: 'var(--t-shadow-pop)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--t-line)' }}>
          <button onClick={onClose} className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('common.cancel')}</button>
          <div className="font-display text-lg" style={{ fontWeight: 500 }}>{t('family.calendars.addCaldav')}</div>
          <button onClick={connect} disabled={busy} className="text-sm font-semibold disabled:opacity-50" style={{ color: 'var(--t-brand)' }}>{t('common.connect')}</button>
        </div>
        <div className="p-5 space-y-3">
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <select className="w-full text-sm px-3 py-2 outline-hidden" style={field} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">{t('family.calendars.forWhom')}</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input className="w-full text-sm px-3 py-2 outline-hidden" style={field} placeholder={t('family.calendars.displayName')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <input className="w-full text-sm px-3 py-2 outline-hidden" style={field} placeholder={t('family.calendars.urlPlaceholder')} value={url} onChange={(e) => setUrl(e.target.value)} />
          <input className="w-full text-sm px-3 py-2 outline-hidden" style={field} placeholder={t('family.calendars.usernamePlaceholder')} value={username} onChange={(e) => setUsername(e.target.value)} />
          <input type="password" className="w-full text-sm px-3 py-2 outline-hidden" style={field} placeholder={t('family.calendars.passwordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="text-xs" style={{ color: 'var(--t-text-soft)' }}>{t('family.calendars.overlayHint')}</div>
        </div>
      </div>
    </div>
  )
}

function appearanceSub(p: ThemePreference, t: TFunction): string {
  if (p === 'system') return t('settings.appearanceSystem')
  return p === 'dark' ? t('settings.appearanceDark') : t('settings.appearanceLight')
}

// The default "Work" label is stored in English by seed/onboarding; localize it.
// A custom label the user typed is shown verbatim.
function scheduleLabel(label: string, t: TFunction): string {
  return label === 'Work' ? t('family.workLabel') : label
}


function timeFormatSub(p: TimeFormatPreference, t: TFunction): string {
  if (p === '24h') return t('settings.timeFormat24')
  if (p === '12h') return t('settings.timeFormat12')
  return t('settings.timeFormatSystem')
}

function accountSub(session: { authEnabled: boolean; authenticated: boolean } | null, t: TFunction): string {
  if (!session) return t('settings.accountLoading')
  if (!session.authEnabled) return t('settings.accountLocal')
  return session.authenticated ? t('settings.accountSignedIn') : t('settings.accountNotSignedIn')
}

// Lightweight settings sheet matching the other modals (full-screen on mobile,
// centered card on desktop) with a single Done action.
function SettingsSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex lg:items-center lg:justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="flex flex-col w-full h-full lg:h-auto lg:w-[440px] lg:max-h-[85vh] overflow-hidden lg:rounded-(--t-radius-lg)"
        style={{ background: 'var(--t-surface)', color: 'var(--t-text)', boxShadow: 'var(--t-shadow-pop)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--t-line)' }}>
          <span className="w-12" />
          <div className="font-display text-lg" style={{ fontWeight: 500 }}>{title}</div>
          <button onClick={onClose} className="text-sm font-semibold w-12 text-right" style={{ color: 'var(--t-brand)' }}>{t('common.done')}</button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// Theme picker — Light / Dark / System, applied live.
function AppearanceModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { preference, setPreference } = useTheme()
  const options: { key: ThemePreference; label: string; icon: typeof Sun }[] = [
    { key: 'light', label: t('settings.themeLight'), icon: Sun },
    { key: 'dark', label: t('settings.themeDark'), icon: Moon },
    { key: 'system', label: t('settings.themeSystem'), icon: Monitor },
  ]
  return (
    <SettingsSheet title={t('settings.appearance')} onClose={onClose}>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--t-line)' }}>
        {options.map((o, i) => {
          const active = preference === o.key
          return (
            <button key={o.key} onClick={() => setPreference(o.key)}
              className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm"
              style={{ borderBottom: i === options.length - 1 ? 'none' : '1px solid var(--t-line)', background: active ? 'var(--t-shell)' : 'transparent' }}>
              <o.icon size={16} style={{ color: active ? 'var(--t-brand)' : 'var(--t-text-soft)', flexShrink: 0 }} />
              <span className="flex-1 font-medium">{o.label}</span>
              {active && <Check size={16} style={{ color: 'var(--t-brand)' }} />}
            </button>
          )
        })}
      </div>
      <div className="text-xs" style={{ color: 'var(--t-text-soft)' }}>{t('settings.themeHint')}</div>
    </SettingsSheet>
  )
}

// Clock-format picker — System / 24-hour / 12-hour, applied live.
function TimeFormatModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { preference, setPreference } = useTimeFormat()
  const options: { key: TimeFormatPreference; label: string }[] = [
    { key: 'system', label: t('settings.timeFormatSystem') },
    { key: '24h', label: t('settings.timeFormat24') },
    { key: '12h', label: t('settings.timeFormat12') },
  ]
  return (
    <SettingsSheet title={t('settings.timeFormat')} onClose={onClose}>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--t-line)' }}>
        {options.map((o, i) => {
          const active = preference === o.key
          return (
            <button key={o.key} onClick={() => setPreference(o.key)}
              className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm"
              style={{ borderBottom: i === options.length - 1 ? 'none' : '1px solid var(--t-line)', background: active ? 'var(--t-shell)' : 'transparent' }}>
              <span className="flex-1 font-medium">{o.label}</span>
              {active && <Check size={16} style={{ color: 'var(--t-brand)' }} />}
            </button>
          )
        })}
      </div>
      <div className="text-xs" style={{ color: 'var(--t-text-soft)' }}>{t('settings.timeFormatHint')}</div>
    </SettingsSheet>
  )
}

// Language picker — applied live, persisted per-device.
function LanguageModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const change = (code: string) => {
    i18n.changeLanguage(code)
    document.documentElement.lang = code
  }
  return (
    <SettingsSheet title={t('language.title')} onClose={onClose}>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--t-line)' }}>
        {LANGUAGES.map((l, i) => {
          const active = i18n.language === l.code || i18n.language.startsWith(l.code.slice(0, 2))
          return (
            <button key={l.code} onClick={() => change(l.code)}
              className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm"
              style={{ borderBottom: i === LANGUAGES.length - 1 ? 'none' : '1px solid var(--t-line)', background: active ? 'var(--t-shell)' : 'transparent' }}>
              <span className="flex-1 font-medium">{l.label}</span>
              {active && <Check size={16} style={{ color: 'var(--t-brand)' }} />}
            </button>
          )
        })}
      </div>
      <div className="text-xs" style={{ color: 'var(--t-text-soft)' }}>{t('language.hint')}</div>
    </SettingsSheet>
  )
}

// AI assistant status + privacy note. Configuration is env-only (server side),
// so this sheet informs rather than edits.
function AssistantModal({ status, onClose }: { status: AssistantStatus | null; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <SettingsSheet title={t('assistant.title')} onClose={onClose}>
      {status?.enabled ? (
        <>
          <div className="flex items-center gap-3">
            <Sparkles size={18} style={{ color: 'var(--t-accent)', flexShrink: 0 }} />
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t('assistant.settingsOn', { model: status.model })}</div>
              <div className="text-xs" style={{ color: 'var(--t-text-soft)' }}>{t('assistant.settingsOnSub')}</div>
            </div>
          </div>
          <div className="rounded-xl p-3 text-sm" style={{ background: 'var(--t-shell)', color: 'var(--t-text-soft)' }}>
            {t('assistant.privacyNote')}
          </div>
        </>
      ) : (
        <div className="rounded-xl p-3 text-sm" style={{ background: 'var(--t-shell)', color: 'var(--t-text-soft)' }}>
          {t('assistant.settingsOffBody')}
          <div className="mt-1.5 font-mono text-xs" style={{ color: 'var(--t-text)' }}>ASSISTANT_BASE_URL · ASSISTANT_MODEL · ASSISTANT_API_KEY</div>
        </div>
      )}
    </SettingsSheet>
  )
}

// Account / session info + sign-out (when OIDC auth is enabled).
function AccountModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { session, activeMember, logout } = useSession()
  const [busy, setBusy] = useState(false)
  const signOut = async () => { setBusy(true); try { await logout() } finally { onClose() } }
  return (
    <SettingsSheet title={t('settings.account')} onClose={onClose}>
      {activeMember && (
        <div className="flex items-center gap-3">
          <PersonAvatar name={activeMember.name} color={activeMember.color} size={40} />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{activeMember.name}</div>
            <div className="text-xs" style={{ color: 'var(--t-text-soft)' }}>{t('settings.accountActiveProfile')}</div>
          </div>
        </div>
      )}
      {!session?.authEnabled ? (
        <div className="rounded-xl p-3 text-sm" style={{ background: 'var(--t-shell)', color: 'var(--t-text-soft)' }}>
          {t('settings.accountLocalBody')}
          <div className="mt-1.5 font-mono text-xs" style={{ color: 'var(--t-text)' }}>OIDC_ISSUER_URL · OIDC_CLIENT_ID · OIDC_CLIENT_SECRET</div>
        </div>
      ) : session.authenticated ? (
        <>
          <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('settings.accountSignedInBody')}</div>
          <Button variant="danger" onClick={signOut} disabled={busy} style={{ width: '100%' }}><LogOut size={16} /> {t('settings.signOut')}</Button>
        </>
      ) : (
        <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('settings.accountNotSignedInBody')}</div>
      )}
    </SettingsSheet>
  )
}

// Weather location picker: city search via Open-Meteo geocoding + a units toggle.
function LocationModal({ settings, onClose, onSaved }: { settings: WeatherSettings | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
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
    const handle = setTimeout(() => {
      setSearching(true)
      geocodeLocation(q)
        .then((r) => setResults(r))
        .catch((e) => setError(String(e)))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(handle)
  }, [query])

  const label = (g: GeoResult) => [g.name, g.admin1, g.country].filter(Boolean).join(', ')
  const save = async () => {
    if (!picked) { setError(t('family.location.pickResult')); return }
    setBusy(true); setError(null)
    try {
      await updateWeatherSettings({ latitude: picked.latitude, longitude: picked.longitude, locationName: label(picked), units })
      onSaved()
    } catch (e) { setError(String(e)); setBusy(false) }
  }

  const field = { border: '1px solid var(--t-line)', background: 'var(--t-surface)', borderRadius: 'var(--t-radius-md)' }
  return (
    <div className="fixed inset-0 z-50 flex lg:items-center lg:justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="flex flex-col w-full h-full lg:h-auto lg:w-[440px] lg:max-h-[85vh] overflow-hidden lg:rounded-(--t-radius-lg)"
        style={{ background: 'var(--t-surface)', color: 'var(--t-text)', boxShadow: 'var(--t-shadow-pop)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--t-line)' }}>
          <button onClick={onClose} className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('common.cancel')}</button>
          <div className="font-display text-lg" style={{ fontWeight: 500 }}>{t('family.location.title')}</div>
          <button onClick={save} disabled={busy || !picked} className="text-sm font-semibold disabled:opacity-50" style={{ color: 'var(--t-brand)' }}>{t('common.save')}</button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          {error && <ErrorBanner>{error}</ErrorBanner>}
          {settings?.locationName && !picked && (
            <div className="text-xs" style={{ color: 'var(--t-text-soft)' }}>{t('family.location.current', { name: settings.locationName })}</div>
          )}
          <input autoFocus className="w-full text-sm px-3 py-2 outline-hidden" style={field} placeholder={t('family.location.searchPlaceholder')} value={query} onChange={(e) => { setQuery(e.target.value); setPicked(null) }} />
          {searching && <div className="text-xs" style={{ color: 'var(--t-text-soft)' }}>{t('family.location.searching')}</div>}
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
            <div className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--t-text-soft)', letterSpacing: '.06em' }}>{t('family.location.units')}</div>
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
