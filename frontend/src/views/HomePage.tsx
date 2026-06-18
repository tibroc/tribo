import { useEffect, useState } from 'react'
import { Sparkles, Star, Cake, CheckSquare } from 'lucide-react'
import { palette } from '../lib/tokens'
import type { Section } from '../lib/calendar'
import { getBriefing, type Briefing } from '../lib/api'
import AppShell from '../components/AppShell'
import { SimpleHeader } from '../components/chrome'
import Card from '../components/Card'
import PersonAvatar from '../components/PersonAvatar'

export default function HomePage({ go }: { go: (s: Section) => void }) {
  const [b, setB] = useState<Briefing | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { getBriefing().then(setB).catch((e) => setError(String(e))) }, [])

  return (
    <AppShell active="home" onNavigate={go} header={<SimpleHeader wordmark />}>
      {error && <div className="rounded-xl p-3 mb-3 text-sm" style={{ backgroundColor: '#fde8e8', color: '#9b1c1c' }}>{error}</div>}
      {!b ? (
        <div className="text-sm" style={{ color: palette.inkSoft }}>Loading…</div>
      ) : (
        <>
          {/* Greeting hero */}
          <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: palette.brandSoft, border: `1px solid ${palette.line}` }}>
            <div className="font-display text-xl font-bold mb-1">Good morning!</div>
            <div className="text-sm mb-3" style={{ color: palette.inkSoft }}>Here's your week ahead — {b.rangeLabel}</div>
            {b.countdown && (
              <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5" style={{ backgroundColor: palette.surface }}>
                <Sparkles size={14} style={{ color: palette.amber }} />
                <span className="text-sm font-semibold">{b.countdown.days} days until {b.countdown.title}</span>
              </div>
            )}
          </div>

          {/* Today strip */}
          <Card className="p-4 mb-4">
            <div className="text-xs font-semibold uppercase mb-2" style={{ color: palette.inkSoft }}>Today</div>
            {b.today.length === 0 ? (
              <div className="text-sm" style={{ color: palette.inkSoft }}>Nothing scheduled today</div>
            ) : (
              <div className="space-y-1.5">
                {b.today.map((ev, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                    <span className="text-xs w-16 flex-shrink-0" style={{ color: palette.inkSoft }}>{ev.time}</span>
                    <span className="flex-1 truncate">{ev.title}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{ev.person}</span>
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
                  <div className="font-display text-base font-bold">{p.name}'s week</div>
                </div>
                <div className="space-y-2 mb-3">
                  {p.highlights.length === 0 && <div className="text-sm" style={{ color: palette.inkSoft }}>Nothing scheduled</div>}
                  {p.highlights.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {h.special
                        ? <Star size={14} style={{ color: palette.amber, flexShrink: 0 }} />
                        : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />}
                      <span className="flex-1">{h.label}</span>
                      <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{h.days}</span>
                    </div>
                  ))}
                </div>
                {p.chores.length > 0 && (
                  <div className="pt-2" style={{ borderTop: `1px solid ${palette.line}` }}>
                    <div className="text-xs font-semibold uppercase mb-1.5" style={{ color: palette.inkSoft }}>Chores this week</div>
                    {p.chores.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <CheckSquare size={13} style={{ color: palette.inkSoft, flexShrink: 0 }} /> {c}
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
              <div className="font-display text-base font-bold mb-2 flex items-center gap-2"><Cake size={16} /> This week</div>
              {b.familyHighlights.length === 0 ? (
                <div className="text-sm" style={{ color: palette.inkSoft }}>Nothing notable</div>
              ) : (
                <div className="space-y-2">
                  {b.familyHighlights.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {h.icon === 'cake'
                        ? <Cake size={14} style={{ color: h.color, flexShrink: 0 }} />
                        : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: h.color }} />}
                      <span className="flex-1 truncate">{h.title}</span>
                      <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{h.day}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="font-display text-base font-bold mb-2">Last week</div>
              <div className="text-sm mb-1.5" style={{ color: palette.inkSoft }}>
                {b.lastWeek.choresDone}/{b.lastWeek.choresTotal} chores · {b.lastWeek.todosDone}/{b.lastWeek.todosTotal} to-dos done
              </div>
              <div className="h-1.5 rounded-full mb-3" style={{ backgroundColor: palette.line }}>
                <div className="h-1.5 rounded-full" style={{ width: `${pct(b.lastWeek.choresDone, b.lastWeek.choresTotal)}%`, backgroundColor: palette.brand }} />
              </div>
              <button className="text-sm font-semibold" style={{ color: palette.brand }} onClick={() => go('review')}>View full review →</button>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  )
}

function pct(done: number, total: number) {
  return total ? Math.round((done / total) * 100) : 0
}
