import { useEffect, useState } from 'react'
import { ChevronLeft, Flame } from 'lucide-react'
import { palette } from '../lib/tokens'
import type { Section } from '../lib/calendar'
import { getReview, type Review } from '../lib/api'
import AppShell from '../components/AppShell'
import { Weather } from '../components/chrome'
import Card from '../components/Card'
import PersonAvatar from '../components/PersonAvatar'

type Period = 'week' | 'month' | 'year'
const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
]

export default function ReviewPage({ go }: { go: (s: Section) => void }) {
  const [period, setPeriod] = useState<Period>('week')
  const [r, setR] = useState<Review | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { getReview(period).then(setR).catch((e) => setError(String(e))) }, [period])

  const header = (
    <div className="flex items-center gap-4 px-4 py-3 lg:px-6">
      <button className="flex items-center gap-1 text-sm font-semibold" style={{ color: palette.inkSoft }} onClick={() => go('home')}>
        <ChevronLeft size={16} /> Home
      </button>
      <div className="font-display text-xl lg:text-2xl font-bold" style={{ color: palette.brand }}>Review</div>
      <div className="flex-1" />
      <div className="flex gap-1 rounded-full p-1" style={{ backgroundColor: palette.mist }}>
        {PERIODS.map((p) => (
          <button key={p.key} onClick={() => setPeriod(p.key)} className="text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap"
            style={p.key === period ? { backgroundColor: palette.brand, color: '#fff' } : { color: palette.inkSoft }}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="hidden lg:block"><Weather /></div>
    </div>
  )

  return (
    <AppShell active="home" onNavigate={go} header={header}>
      {error && <div className="rounded-xl p-3 mb-3 text-sm" style={{ backgroundColor: '#fde8e8', color: '#9b1c1c' }}>{error}</div>}
      {!r ? (
        <div className="text-sm" style={{ color: palette.inkSoft }}>Loading…</div>
      ) : (
        <>
          {/* Hero stats */}
          <div className="mb-4">
            <div className="text-sm mb-2" style={{ color: palette.inkSoft }}>{r.rangeLabel}</div>
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="Chores" value={`${r.chores.pct}%`} sub={`${r.chores.done}/${r.chores.total}`} />
              <StatTile label="To-dos" value={`${r.todos.pct}%`} sub={`${r.todos.done}/${r.todos.total}`} />
              <StatTile label="Events" value={`${r.events}`} sub="happened" />
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
                      <div className="ml-auto flex items-center gap-1 text-xs font-semibold" style={{ color: palette.amber }}>
                        <Flame size={14} /> {p.streak}-week streak
                      </div>
                    )}
                  </div>
                  <div className="text-sm mb-1" style={{ color: palette.inkSoft }}>Chores: {p.choresDone}/{p.choresTotal}</div>
                  <div className="h-1.5 rounded-full mb-3" style={{ backgroundColor: palette.line }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${chorePct}%`, backgroundColor: p.color }} />
                  </div>
                  {p.todosTotal > 0 && <div className="text-sm" style={{ color: palette.inkSoft }}>To-dos: {p.todosDone}/{p.todosTotal} done</div>}
                </Card>
              )
            })}
          </div>

          {/* Chore consistency heatmap */}
          <Card className="p-4 mb-4">
            <div className="font-display text-base font-bold mb-3">Chore consistency</div>
            <div className="space-y-2.5">
              {r.consistency.map((c) => (
                <div key={c.choreId} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="text-sm flex-1 truncate">{c.title}</span>
                  <span className="hidden lg:block text-xs flex-shrink-0 w-20 truncate" style={{ color: palette.inkSoft }}>{c.who}</span>
                  <div className="flex flex-shrink-0 gap-[3px] lg:gap-1">
                    {c.history.map((done, j) => (
                      <span key={j} className="rounded-sm flex-shrink-0 w-2 h-2 lg:w-2.5 lg:h-2.5" style={{ backgroundColor: done ? c.color : palette.line }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs mt-3" style={{ color: palette.inkSoft }}>Last 8 weeks</div>
          </Card>

          {/* Year to date */}
          <Card className="p-4">
            <div className="font-display text-base font-bold mb-3">Year to date</div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <YtdStat value={r.ytd.chores} label="chores done" />
              <YtdStat value={r.ytd.todos} label="to-dos done" />
              <YtdStat value={r.ytd.birthdays} label="birthdays" />
            </div>
          </Card>
        </>
      )}
    </AppShell>
  )
}

function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="p-4 text-center">
      <div className="font-display text-2xl font-bold" style={{ color: palette.brand }}>{value}</div>
      <div className="text-xs font-semibold uppercase mt-1" style={{ color: palette.inkSoft }}>{label}</div>
      <div className="text-xs mt-0.5" style={{ color: palette.inkSoft }}>{sub}</div>
    </Card>
  )
}

function YtdStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="font-display text-xl font-bold">{value}</div>
      <div className="text-xs" style={{ color: palette.inkSoft }}>{label}</div>
    </div>
  )
}
