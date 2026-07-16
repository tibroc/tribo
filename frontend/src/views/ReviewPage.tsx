import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Flame } from 'lucide-react'
import type { Section } from '../lib/calendar'
import { getReview, type Review } from '../lib/api'
import { fmtRange } from '../lib/datetime'
import { useLocale } from '../lib/i18n'
import AppShell from '../components/AppShell'
import Card from '../components/Card'
import PersonAvatar from '../components/PersonAvatar'

type Period = 'week' | 'month' | 'year'

export default function ReviewPage({ go }: { go: (s: Section) => void }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [period, setPeriod] = useState<Period>('week')
  const [r, setR] = useState<Review | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { getReview(period).then(setR).catch((e) => setError(String(e))) }, [period])

  const periods: { key: Period; label: string }[] = [
    { key: 'week', label: t('review.periodWeek') },
    { key: 'month', label: t('review.periodMonth') },
    { key: 'year', label: t('review.periodYear') },
  ]

  const header = (
    <div className="flex items-center gap-4">
      <button className="flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--t-text-soft)' }} onClick={() => go('home')}>
        <ChevronLeft size={16} /> {t('nav.home')}
      </button>
      <div style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 24, color: 'var(--t-text)' }}>{t('nav.review')}</div>
      <div className="flex gap-1 rounded-full p-1" style={{ background: 'var(--t-shell)', border: '1px solid var(--t-line)' }}>
        {periods.map((p) => (
          <button key={p.key} onClick={() => setPeriod(p.key)} className="text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap"
            style={p.key === period ? { backgroundColor: 'var(--t-brand)', color: 'var(--t-on-brand)' } : { color: 'var(--t-text-soft)' }}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <AppShell active="home" onNavigate={go} header={header} showFab={false}>
      <div className="px-3.5 py-[22px] lg:px-[26px]">
      {error && <div className="rounded-xl p-3 mb-3 text-sm" style={{ background: 'color-mix(in oklab, var(--t-danger) 16%, var(--t-shell))', color: 'var(--t-danger)' }}>{error}</div>}
      {!r ? (
        <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('common.loading')}</div>
      ) : (
        <>
          {/* Hero stats */}
          <div className="mb-4">
            <div className="text-sm mb-2" style={{ color: 'var(--t-text-soft)' }}>{fmtRange(r.rangeStart, r.rangeEnd, locale)}</div>
            <div className="grid grid-cols-3 gap-3">
              <StatTile label={t('review.statChores')} value={`${r.chores.pct}%`} sub={`${r.chores.done}/${r.chores.total}`} />
              <StatTile label={t('review.statTodos')} value={`${r.todos.pct}%`} sub={`${r.todos.done}/${r.todos.total}`} />
              <StatTile label={t('review.statEvents')} value={`${r.events}`} sub={t('review.happened')} />
            </div>
          </div>

          {/* Per-person */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {r.perPerson.map((p) => {
              const chorePct = p.choresTotal > 0 ? Math.round((p.choresDone / p.choresTotal) * 100) : 100
              return (
                <Card key={p.memberId} className="p-4">
                  <div className="-m-4 mb-3 rounded-t-2xl" style={{ height: 4, backgroundColor: p.color }} />
                  <div className="flex items-center gap-2 mb-3">
                    <PersonAvatar name={p.name} color={p.color} size={36} />
                    <div className="font-display text-base font-bold">{p.name}</div>
                    {p.streak > 0 && (
                      <div className="ml-auto flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--t-accent)' }}>
                        <Flame size={14} /> {t('review.streak', { count: p.streak })}
                      </div>
                    )}
                  </div>
                  <div className="text-sm mb-1" style={{ color: 'var(--t-text-soft)' }}>{t('review.choresLine', { done: p.choresDone, total: p.choresTotal })}</div>
                  <div className="h-1.5 rounded-full mb-3" style={{ backgroundColor: 'var(--t-track)' }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${chorePct}%`, backgroundColor: p.color }} />
                  </div>
                  {p.todosTotal > 0 && <div className="text-sm" style={{ color: 'var(--t-text-soft)' }}>{t('review.todosLine', { done: p.todosDone, total: p.todosTotal })}</div>}
                </Card>
              )
            })}
          </div>

          {/* Chore consistency heatmap */}
          <Card className="p-4 mb-4">
            <div className="font-display text-base font-bold mb-3">{t('review.consistency')}</div>
            <div className="space-y-2.5">
              {r.consistency.map((c) => (
                <div key={c.choreId} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="text-sm flex-1 truncate">{c.title}</span>
                  <span className="hidden lg:block text-xs shrink-0 w-20 truncate" style={{ color: 'var(--t-text-soft)' }}>{c.rotation ? t('review.rotation') : c.who}</span>
                  <div className="flex shrink-0 gap-[3px] lg:gap-1">
                    {c.history.map((done, j) => (
                      <span key={j} className="rounded-xs shrink-0 w-2 h-2 lg:w-2.5 lg:h-2.5" style={{ backgroundColor: done ? c.color : 'var(--t-track)' }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs mt-3" style={{ color: 'var(--t-text-soft)' }}>{t('review.last8')}</div>
          </Card>

          {/* Year to date */}
          <Card className="p-4">
            <div className="font-display text-base font-bold mb-3">{t('review.ytd')}</div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <YtdStat value={r.ytd.chores} label={t('review.ytdChores')} />
              <YtdStat value={r.ytd.todos} label={t('review.ytdTodos')} />
              <YtdStat value={r.ytd.birthdays} label={t('review.ytdBirthdays')} />
            </div>
          </Card>
        </>
      )}
      </div>
    </AppShell>
  )
}

function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="p-4 text-center">
      <div className="font-display text-2xl font-bold" style={{ color: 'var(--t-brand)' }}>{value}</div>
      <div className="text-xs font-semibold uppercase mt-1" style={{ color: 'var(--t-text-soft)' }}>{label}</div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--t-text-soft)' }}>{sub}</div>
    </Card>
  )
}

function YtdStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="font-display text-xl font-bold">{value}</div>
      <div className="text-xs" style={{ color: 'var(--t-text-soft)' }}>{label}</div>
    </div>
  )
}
