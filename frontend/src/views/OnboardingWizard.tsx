import { useState } from 'react'
import { Plus, Trash2, CalendarDays } from 'lucide-react'
import { markerColor } from '../lib/tokens'
import { onboard, type OnboardRequest } from '../lib/api'
import { useSession } from '../lib/session'
import Icon from '../components/Icon'
import Button from '../components/Button'
import DatePicker from '../components/DatePicker'
import { weekdayLabels } from '../lib/datetime'
import { useLocale } from '../lib/i18n'
import { recurrenceLabel } from '../lib/chores'
import { useTranslation, Trans } from 'react-i18next'

interface MemberDraft { name: string; role: 'guardian' | 'child'; defaultGuardianIndex: number | null; dob: string }
// `title` is the stable English value persisted to the backend; `labelKey` is its i18n key for display.
interface ChoreTemplate { title: string; labelKey: string; recurrence: 'daily' | 'weekly' | 'monthly'; enabled: boolean; assignee: number | null }
interface PatternTemplate { title: string; labelKey: string; startTime: string; durationMin: number; weekdays: number[]; enabled: boolean; member: number | null }

const CHORE_TEMPLATES: Omit<ChoreTemplate, 'enabled' | 'assignee'>[] = [
  { title: 'Take out recycling', labelKey: 'recycling', recurrence: 'weekly' },
  { title: 'Clean the bathroom', labelKey: 'bathroom', recurrence: 'weekly' },
  { title: 'Water the plants', labelKey: 'plants', recurrence: 'weekly' },
  { title: 'Set the table', labelKey: 'table', recurrence: 'daily' },
  { title: 'Mow the lawn', labelKey: 'lawn', recurrence: 'weekly' },
]
const PATTERN_TEMPLATES: Omit<PatternTemplate, 'enabled' | 'member'>[] = [
  { title: 'School', labelKey: 'school', startTime: '08:00', durationMin: 420, weekdays: [0, 1, 2, 3, 4] },
  { title: 'Work', labelKey: 'work', startTime: '09:00', durationMin: 480, weekdays: [0, 1, 2, 3, 4] },
  { title: 'Gym', labelKey: 'gym', startTime: '06:00', durationMin: 60, weekdays: [0, 2, 4] },
  { title: 'Soccer', labelKey: 'soccer', startTime: '16:00', durationMin: 90, weekdays: [1, 3] },
]

// Steps: 0 = welcome (full-bleed), 1..6 = split-screen. Labels are i18n keys under onboarding.steps.*
const STEPS = ['welcome', 'family', 'members', 'calendar', 'chores', 'typicalWeek', 'done']

export default function OnboardingWizard({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const weekdays = weekdayLabels(locale, 'short')
  const [step, setStep] = useState(0)
  const [familyName, setFamilyName] = useState('')
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Lisbon' } catch { return 'Europe/Lisbon' }
  })
  const [members, setMembers] = useState<MemberDraft[]>([{ name: '', role: 'guardian', defaultGuardianIndex: null, dob: '' }])
  const [chores, setChores] = useState<ChoreTemplate[]>(CHORE_TEMPLATES.map((c) => ({ ...c, enabled: false, assignee: null })))
  const [patterns, setPatterns] = useState<PatternTemplate[]>(PATTERN_TEMPLATES.map((p) => ({ ...p, enabled: false, member: null })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // When auth is on, the logged-in user identifies which member is them so we
  // can link their OIDC subject during onboarding. selfIdx is a draft index.
  const { session } = useSession()
  const authEnabled = !!session?.authEnabled
  const [selfIdx, setSelfIdx] = useState<number | null>(null)

  const guardians = members.map((m, i) => ({ m, i })).filter((x) => x.m.role === 'guardian')
  const validMembers = members.filter((m) => m.name.trim())
  const canFinish = validMembers.length > 0

  const finish = async () => {
    setBusy(true); setError(null)
    // Translate the chosen draft index into the filtered-list index the backend
    // sees (it only receives named members). -1 → omit, backend falls back to
    // the first guardian.
    const namedDraftIdxs = members.map((m, i) => ({ m, i })).filter((x) => x.m.name.trim()).map((x) => x.i)
    const selfFiltered = selfIdx != null ? namedDraftIdxs.indexOf(selfIdx) : -1
    const req: OnboardRequest = {
      familyName, timezone,
      selfMemberIndex: authEnabled && selfFiltered >= 0 ? selfFiltered : null,
      members: members.filter((m) => m.name.trim()).map((m, i) => ({
        name: m.name.trim(), color: markerColor(i), role: m.role,
        defaultGuardianIndex: m.role === 'child' ? m.defaultGuardianIndex : null,
        dateOfBirth: m.dob.trim() || null,
      })),
      // Persist the localized title so wizard-created items appear in the
      // language they were created in (the English `title` is only a stable key
      // for the i18n lookup, not what we store).
      chores: chores.filter((c) => c.enabled && c.assignee != null).map((c) => ({
        title: t(`onboarding.choreTemplates.${c.labelKey}`), recurrence: c.recurrence, mode: 'fixed',
        assignedMemberIndex: c.assignee!, color: markerColor(c.assignee!),
      })),
      typicalWeek: patterns.filter((p) => p.enabled && p.member != null).map((p) => ({
        memberIndex: p.member!, title: t(`onboarding.patternTemplates.${p.labelKey}`), startTime: p.startTime, durationMin: p.durationMin, weekdays: p.weekdays,
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
          <div>{t('onboarding.welcome.headline1')}</div>
          <div style={{ fontStyle: 'italic', color: 'var(--t-accent)' }}>{t('onboarding.welcome.headline2')}</div>
        </div>
        <div className="relative z-10 mt-5" style={{ fontSize: 18, lineHeight: 1.55, maxWidth: 440, opacity: 0.85 }}>
          {t('onboarding.welcome.subtitle')}
        </div>
        <div className="flex items-center gap-4 mt-10 relative z-10">
          <Button onClick={next} variant="accent" style={{ padding: '16px 34px', fontSize: 16, borderRadius: 'var(--t-radius-md)' }}>{t('onboarding.welcome.cta')}</Button>
          {onCancel && (
            <button onClick={onCancel} className="font-semibold" style={{ fontSize: 15, color: 'inherit', opacity: 0.85, background: 'none', border: 'none', cursor: 'pointer' }}>
              {t('common.cancel')}
            </button>
          )}
        </div>
      </div>
    )
  }

  const accent: React.CSSProperties = { fontStyle: 'italic', color: 'var(--t-accent)' }
  const TAGLINES: Record<number, { h: React.ReactNode; s: string }> = {
    1: { h: <>{t('onboarding.taglines.1.lead')}<br />{t('onboarding.taglines.1.before')} <em style={accent}>{t('onboarding.taglines.1.accent')}</em></>, s: t('onboarding.taglines.1.sub') },
    2: { h: <>{t('onboarding.taglines.2.before')} <em style={accent}>{t('onboarding.taglines.2.accent')}</em></>, s: t('onboarding.taglines.2.sub') },
    3: { h: <>{t('onboarding.taglines.3.before')} <em style={accent}>{t('onboarding.taglines.3.accent')}</em></>, s: t('onboarding.taglines.3.sub') },
    4: { h: <>{t('onboarding.taglines.4.before')} <em style={accent}>{t('onboarding.taglines.4.accent')}</em></>, s: t('onboarding.taglines.4.sub') },
    5: { h: <>{t('onboarding.taglines.5.before')} <em style={accent}>{t('onboarding.taglines.5.accent')}</em></>, s: t('onboarding.taglines.5.sub') },
    6: { h: <>{t('onboarding.taglines.6.before')} <em style={accent}>{t('onboarding.taglines.6.accent')}</em></>, s: t('onboarding.taglines.6.sub') },
  }
  const tg = TAGLINES[step]
  const isLast = step === STEPS.length - 1

  return (
    <div className="min-h-screen w-full font-body flex" style={{ background: 'var(--t-surface)', color: 'var(--t-text)' }}>
      {/* Brand panel */}
      <div className="relative overflow-hidden hidden lg:flex flex-col shrink-0 p-10"
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
        <div className="text-xs font-bold uppercase" style={{ color: 'var(--t-brand)', letterSpacing: '.1em' }}>{t('onboarding.stepCounter', { step, total: STEPS.length - 1 })}</div>
        <div className="mt-2.5" style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 32, lineHeight: 1.1 }}>
          {{ 1: t('onboarding.titles.1'), 2: t('onboarding.titles.2'), 3: t('onboarding.titles.3'), 4: t('onboarding.titles.4'), 5: t('onboarding.titles.5'), 6: t('onboarding.titles.6') }[step]}
        </div>
        <div className="mt-2.5" style={{ fontSize: 14.5, lineHeight: 1.55, maxWidth: 440, color: 'var(--t-text-soft)' }}>
          {{
            1: t('onboarding.descriptions.1'),
            2: t('onboarding.descriptions.2'),
            3: t('onboarding.descriptions.3'),
            4: t('onboarding.descriptions.4'),
            5: t('onboarding.descriptions.5'),
            6: t('onboarding.descriptions.6'),
          }[step]}
        </div>

        <div className="mt-8 flex-1 min-h-0 overflow-y-auto">
          {error && <div className="rounded-xl p-2 mb-3 text-sm" style={{ backgroundColor: '#fde8e8', color: '#9b1c1c' }}>{error}</div>}

          {step === 1 && (
            <div className="space-y-4" style={{ maxWidth: 440 }}>
              <Labeled label={t('onboarding.familyStep.nameLabel')}>
                <div className="flex items-center gap-3" style={inputBox(true)}>
                  <Icon name="family" size={20} style={{ color: 'var(--t-brand)', flexShrink: 0 }} />
                  <input className="w-full bg-transparent outline-hidden" style={{ fontSize: 16 }} value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder={t('onboarding.familyStep.namePlaceholder')} />
                </div>
              </Labeled>
              <Labeled label={t('onboarding.familyStep.timezoneLabel')}>
                <div style={inputBox(false)}>
                  <input className="w-full bg-transparent outline-hidden" style={{ fontSize: 16 }} value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder={t('onboarding.familyStep.tzPlaceholder')} />
                </div>
              </Labeled>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2.5" style={{ maxWidth: 460 }}>
              {members.map((m, i) => (
                <div key={i} className="flex flex-col gap-2 p-2.5"
                  style={{ border: '1px solid var(--t-line)', borderRadius: 'var(--t-radius-md)', background: 'var(--t-surface)' }}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center shrink-0" style={{ width: 42, height: 42, borderRadius: '50% 50% 50% 30%', background: markerColor(i), color: '#fff', fontWeight: 700 }}>
                      {m.name.trim() ? m.name.trim()[0].toUpperCase() : i + 1}
                    </div>
                    <input className="flex-1 bg-transparent outline-hidden text-sm font-semibold min-w-0" value={m.name} placeholder={t('onboarding.members.namePlaceholder')}
                      onChange={(e) => updateMember(setMembers, i, { name: e.target.value })} />
                    <Segmented value={m.role} guardianLabel={t('onboarding.members.guardian')} childLabel={t('onboarding.members.child')} onChange={(role) => updateMember(setMembers, i, { role })} />
                    {members.length > 1 && (
                      <button aria-label={t('common.delete')} onClick={() => setMembers((cur) => cur.filter((_, j) => j !== i))}><Trash2 size={16} style={{ color: 'var(--t-text-soft)' }} /></button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap" style={{ paddingLeft: 54 }}>
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--t-text-soft)' }}>
                      {t('onboarding.members.dob')}
                      <div className="rounded-lg px-2 py-1" style={field}>
                        <DatePicker value={m.dob} onChange={(v) => updateMember(setMembers, i, { dob: v })} locale={locale} placeholder={t('onboarding.members.dob')} />
                      </div>
                    </div>
                    {m.role === 'child' && guardians.length > 0 && (
                      <select className="text-sm rounded-lg px-2 py-1.5 outline-hidden" style={field} value={m.defaultGuardianIndex ?? ''}
                        onChange={(e) => updateMember(setMembers, i, { defaultGuardianIndex: e.target.value === '' ? null : Number(e.target.value) })}>
                        <option value="">{t('onboarding.members.guardianPlaceholder')}</option>
                        {guardians.map((g) => <option key={g.i} value={g.i}>{g.m.name || t('onboarding.members.memberN', { n: g.i + 1 })}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              ))}
              <button onClick={() => setMembers((cur) => [...cur, { name: '', role: 'guardian', defaultGuardianIndex: null, dob: '' }])}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold"
                style={{ border: '1px dashed var(--t-line)', borderRadius: 'var(--t-radius-md)', color: 'var(--t-text-soft)' }}>
                <Plus size={16} /> {t('onboarding.members.addMember')}
              </button>
              <div className="flex items-center gap-3 mt-3 p-3" style={{ border: '1px dashed var(--t-line)', borderRadius: 'var(--t-radius-md)' }}>
                <span className="shrink-0" style={{ width: 30, height: 30, borderRadius: '50% 50% 50% 30%', background: markerColor(members.length) }} />
                <div className="text-xs" style={{ color: 'var(--t-text-soft)', lineHeight: 1.4 }}>
                  <Trans i18nKey="onboarding.members.paletteHint"><b style={{ color: 'var(--t-text)' }}>The next member</b> is automatically given this colour — every family keeps a balanced, harmonious palette.</Trans>
                </div>
              </div>
              {authEnabled && validMembers.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-3 p-3" style={{ border: '1px solid var(--t-line)', borderRadius: 'var(--t-radius-md)', background: 'var(--t-surface)' }}>
                  <label className="text-sm font-semibold">{t('onboarding.members.whoAmILabel')}</label>
                  <select className="text-sm rounded-lg px-2 py-1.5 outline-hidden" style={field}
                    value={selfIdx ?? ''}
                    onChange={(e) => setSelfIdx(e.target.value === '' ? null : Number(e.target.value))}>
                    {members.map((m, i) => m.name.trim() ? (
                      <option key={i} value={i}>{m.name.trim()}</option>
                    ) : null)}
                  </select>
                  <span className="text-xs" style={{ color: 'var(--t-text-soft)' }}>{t('onboarding.members.whoAmIHint')}</span>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3" style={{ maxWidth: 470 }}>
              <div className="flex items-start gap-3 p-3" style={{ background: 'var(--t-today-wash)', borderRadius: 'var(--t-radius-md)', border: '1px solid var(--t-line)' }}>
                <CalendarDays size={18} style={{ color: 'var(--t-brand)', flexShrink: 0, marginTop: 2 }} />
                <div className="text-sm"><Trans i18nKey="onboarding.calendar.note">Tribo sets up a calendar for <b>each person</b>, plus shared <b>family</b> and <b>birthdays</b> calendars automatically. You can connect a read-only Google calendar to any person later from <b>Family → Calendars</b>.</Trans></div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2.5" style={{ maxWidth: 470 }}>
              {chores.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="checkbox" checked={c.enabled} onChange={(e) => updateChore(setChores, i, { enabled: e.target.checked })} className="w-4 h-4 rounded-sm" />
                  <span className="text-sm flex-1">{t(`onboarding.choreTemplates.${c.labelKey}`)} <span style={{ color: 'var(--t-text-soft)' }}>· {recurrenceLabel(c.recurrence, 1, t)}</span></span>
                  {c.enabled && (
                    <select className="text-sm rounded-lg px-2 py-1 outline-hidden" style={field} value={c.assignee ?? ''}
                      onChange={(e) => updateChore(setChores, i, { assignee: e.target.value === '' ? null : Number(e.target.value) })}>
                      <option value="">{t('onboarding.chores.assignPlaceholder')}</option>
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
                  <input type="checkbox" checked={p.enabled} onChange={(e) => updatePattern(setPatterns, i, { enabled: e.target.checked })} className="w-4 h-4 rounded-sm" />
                  <span className="text-sm flex-1">{t(`onboarding.patternTemplates.${p.labelKey}`)} <span style={{ color: 'var(--t-text-soft)' }}>· {p.weekdays.map((d) => weekdays[d]).join('/')} {p.startTime}</span></span>
                  {p.enabled && (
                    <select className="text-sm rounded-lg px-2 py-1 outline-hidden" style={field} value={p.member ?? ''}
                      onChange={(e) => updatePattern(setPatterns, i, { member: e.target.value === '' ? null : Number(e.target.value) })}>
                      <option value="">{t('onboarding.typicalWeek.forPlaceholder')}</option>
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
                  <div style={{ fontFamily: 'var(--t-font-display)', fontSize: 19 }}>{familyName || t('onboarding.done.familyFallback')}</div>
                  <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>
                    {t('onboarding.done.membersCount', { count: validMembers.length })} · {t('onboarding.done.guardiansCount', { count: guardians.length })}
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                {[
                  ['1', t('onboarding.done.sharedCalendar')],
                  [String(chores.filter((c) => c.enabled && c.assignee != null).length), t('onboarding.done.choresSet')],
                  [String(patterns.filter((p) => p.enabled && p.member != null).length), t('onboarding.done.weeklyPlans')],
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
            <Icon name="left" size={16} /> {t('onboarding.nav.back')}
          </button>
          {(step === 4 || step === 5) && (
            <button onClick={next} className="font-semibold text-sm" style={{ color: 'var(--t-text-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>{t('onboarding.nav.skip')}</button>
          )}
          <div className="ml-auto">
            {!isLast ? (
              <Button onClick={next} disabled={step === 2 && !canFinish} variant="primary">
                {t('onboarding.nav.continue')} <Icon name="right" size={17} />
              </Button>
            ) : (
              <Button onClick={finish} disabled={busy || !canFinish} variant="accent">
                {busy ? t('onboarding.nav.settingUp') : t('onboarding.nav.enter')} <Icon name="right" size={17} />
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

function Segmented({ value, onChange, guardianLabel, childLabel }: { value: 'guardian' | 'child'; onChange: (v: 'guardian' | 'child') => void; guardianLabel: string; childLabel: string }) {
  return (
    <div className="inline-flex p-1 gap-0.5" style={{ background: 'var(--t-bg)', borderRadius: 'var(--t-radius-sm)' }}>
      {(['guardian', 'child'] as const).map((r) => {
        const on = value === r
        return (
          <button key={r} onClick={() => onChange(r)} className="px-3 py-1.5 text-xs font-semibold"
            style={{ borderRadius: 6, border: 'none', cursor: 'pointer', background: on ? 'var(--t-brand)' : 'transparent', color: on ? 'var(--t-on-brand)' : 'var(--t-text-soft)' }}>
            {r === 'guardian' ? guardianLabel : childLabel}
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
