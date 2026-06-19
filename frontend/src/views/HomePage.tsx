import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Star, Cake, CheckSquare } from 'lucide-react'
import type { Section, Intent } from '../lib/calendar'
import { getBriefing, type Briefing } from '../lib/api'
import { fmtTime, fmtRange, fmtWeekdayLong, daysLabel } from '../lib/datetime'
import { useLocale } from '../lib/i18n'
import AppShell from '../components/AppShell'
import { SimpleHeader } from '../components/chrome'
import Card from '../components/Card'
import PersonAvatar from '../components/PersonAvatar'

export default function HomePage({ go }: { go: (s: Section, intent?: Intent) => void }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [b, setB] = useState<Briefing | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { getBriefing().then(setB).catch((e) => setError(String(e))) }, [])

  // Home is a cross-section briefing, so its FAB offers a quick-add chooser that
  // routes to the relevant screen and opens that screen's add form on arrival.
  const fabMenu = [
    { label: t('home.newEvent'), icon: 'calendar', onClick: () => go('calendar', 'new-event') },
    { label: t('home.newChore'), icon: 'chores', onClick: () => go('chores', 'new-chore') },
    { label: t('home.newTodo'), icon: 'todos', onClick: () => go('todos', 'new-todo') },
  ]

  return (
    <AppShell active="home" onNavigate={go} header={<SimpleHeader />} fabMenu={fabMenu}>
      <div style={{ padding: '22px 26px' }}>
      {error && <div className="rounded-xl p-3 mb-3 text-sm" style={{ background: 'color-mix(in oklab, var(--t-danger) 16%, var(--t-shell))', color: 'var(--t-danger)' }}>{error}</div>}
      {!b ? (
        <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('common.loading')}</div>
      ) : (
        <>
          {/* Greeting hero */}
          <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: 'var(--t-today-wash)', border: '1px solid var(--t-line)' }}>
            <div className="font-display text-xl font-bold mb-1">{t('home.greeting')}</div>
            <div className="text-sm mb-3" style={{ color: 'var(--t-text-soft)' }}>{t('home.weekAhead', { range: fmtRange(b.rangeStart, b.rangeEnd, locale) })}</div>
            {b.countdown && (
              <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5" style={{ backgroundColor: 'var(--t-surface)' }}>
                <Sparkles size={14} style={{ color: 'var(--t-accent)' }} />
                <span className="text-sm font-semibold">{t('home.countdown', { count: b.countdown.days, title: b.countdown.title })}</span>
              </div>
            )}
          </div>

          {/* Today strip */}
          <Card className="p-4 mb-4">
            <div className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--t-text-soft)' }}>{t('home.today')}</div>
            {b.today.length === 0 ? (
              <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('home.nothingToday')}</div>
            ) : (
              <div className="space-y-1.5">
                {b.today.map((ev, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                    <span className="text-xs w-16 shrink-0" style={{ color: 'var(--t-text-soft)' }}>{fmtTime(new Date(ev.startAt), locale)}</span>
                    <span className="flex-1 truncate">{ev.title}</span>
                    <span className="text-xs shrink-0" style={{ color: 'var(--t-text-soft)' }}>{ev.person || t('common.family')}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Per-person week cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {b.personWeeks.map((p) => (
              <Card key={p.memberId} className="p-4">
                <div className="-m-4 mb-3 rounded-t-2xl" style={{ height: 4, backgroundColor: p.color }} />
                <div className="flex items-center gap-2 mb-3">
                  <PersonAvatar name={p.name} color={p.color} size={36} />
                  <div className="font-display text-base font-bold">{t('home.personWeek', { name: p.name })}</div>
                </div>
                <div className="space-y-2 mb-3">
                  {p.highlights.length === 0 && <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('home.nothingScheduled')}</div>}
                  {p.highlights.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {h.special
                        ? <Star size={14} style={{ color: 'var(--t-accent)', flexShrink: 0 }} />
                        : <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />}
                      <span className="flex-1">{h.label}</span>
                      <span className="text-xs shrink-0" style={{ color: 'var(--t-text-soft)' }}>{daysLabel(h.weekdays, h.time, locale)}</span>
                    </div>
                  ))}
                </div>
                {p.chores.length > 0 && (
                  <div className="pt-2" style={{ borderTop: '1px solid var(--t-line)' }}>
                    <div className="text-xs font-semibold uppercase mb-1.5" style={{ color: 'var(--t-text-soft)' }}>{t('home.choresThisWeek')}</div>
                    {p.chores.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <CheckSquare size={13} style={{ color: 'var(--t-text-soft)', flexShrink: 0 }} /> {c}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* Family highlights + last week */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="font-display text-base font-bold mb-2 flex items-center gap-2"><Cake size={16} /> {t('home.thisWeek')}</div>
              {b.familyHighlights.length === 0 ? (
                <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('home.nothingNotable')}</div>
              ) : (
                <div className="space-y-2">
                  {b.familyHighlights.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {h.icon === 'cake'
                        ? <Cake size={14} style={{ color: h.color, flexShrink: 0 }} />
                        : <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: h.color }} />}
                      <span className="flex-1 truncate">{h.title}</span>
                      <span className="text-xs shrink-0" style={{ color: 'var(--t-text-soft)' }}>{fmtWeekdayLong(new Date(h.date), locale)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="font-display text-base font-bold mb-2">{t('home.lastWeek')}</div>
              <div className="text-sm mb-1.5" style={{ color: 'var(--t-text-soft)' }}>
                {t('home.lastWeekStats', { choresDone: b.lastWeek.choresDone, choresTotal: b.lastWeek.choresTotal, todosDone: b.lastWeek.todosDone, todosTotal: b.lastWeek.todosTotal })}
              </div>
              <div className="h-1.5 rounded-full mb-3" style={{ backgroundColor: 'var(--t-track)' }}>
                <div className="h-1.5 rounded-full" style={{ width: `${pct(b.lastWeek.choresDone, b.lastWeek.choresTotal)}%`, backgroundColor: 'var(--t-brand)' }} />
              </div>
              <button className="text-sm font-semibold" style={{ color: 'var(--t-brand)' }} onClick={() => go('review')}>{t('home.viewReview')}</button>
            </Card>
          </div>
        </>
      )}
      </div>
    </AppShell>
  )
}

function pct(done: number, total: number) {
  return total ? Math.round((done / total) * 100) : 0
}
