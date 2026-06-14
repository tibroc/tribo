import { useMemo } from 'react'
import { CheckSquare, ListTodo, Users } from 'lucide-react'
import { palette, SHARED_COLOR, chipStyle } from '../lib/tokens'
import { fmtTime, sameDay, startOfDay, type ViewProps } from '../lib/calendar'
import type { FamilyMember, TriboEvent } from '../lib/api'
import AppShell from '../components/AppShell'
import Card from '../components/Card'
import PersonAvatar from '../components/PersonAvatar'

const HOUR_START = 6
const HOUR_END = 21 // 6 AM – 9 PM
const HOUR_HEIGHT = 56
const TOTAL_HEIGHT = (HOUR_END - HOUR_START) * HOUR_HEIGHT
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)

const fracHour = (d: Date) => d.getHours() + d.getMinutes() / 60
const clamp = (t: number) => Math.max(HOUR_START, Math.min(HOUR_END, t))
const timeToY = (t: number) => (clamp(t) - HOUR_START) * HOUR_HEIGHT
const formatHour = (h: number) => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`

interface Block { ev: TriboEvent; start: number; end: number; color: string; who?: string }

export default function DayView({ members, events, cursor, today, header }: ViewProps) {
  const day = useMemo(() => startOfDay(cursor), [cursor])
  const isToday = sameDay(day, today)
  const nowFrac = fracHour(today)
  const showNow = isToday && nowFrac >= HOUR_START && nowFrac <= HOUR_END

  // Timed events on this day, split per person + shared.
  const { perMember, shared } = useMemo(() => {
    const pm = new Map<string, Block[]>()
    members.forEach((m) => pm.set(m.id, []))
    const sh: Block[] = []
    for (const ev of events) {
      const s = new Date(ev.startAt)
      if (ev.allDay || !sameDay(s, day)) continue
      const block: Omit<Block, 'color' | 'who'> = { ev, start: fracHour(s), end: fracHour(new Date(ev.endAt)) }
      if (ev.isShared || ev.attendeeIds.length === 0) sh.push({ ...block, color: SHARED_COLOR, who: 'Family' })
      else ev.attendeeIds.forEach((mid) => {
        const m = members.find((x) => x.id === mid)
        if (m) pm.get(mid)!.push({ ...block, color: m.color, who: m.name })
      })
    }
    return { perMember: pm, shared: sh }
  }, [events, members, day])

  const combined = useMemo(() => {
    const all: Block[] = [...members.flatMap((m) => perMember.get(m.id) ?? []), ...shared]
    return all.sort((a, b) => a.start - b.start)
  }, [perMember, shared, members])

  const columns = [
    ...members.map((m) => ({ key: m.id, name: m.name, color: m.color, icon: undefined as undefined | typeof Users, blocks: perMember.get(m.id) ?? [] })),
    { key: 'family', name: 'Family', color: SHARED_COLOR, icon: Users, blocks: shared },
  ]

  return (
    <AppShell header={header}>
      <Card className="overflow-hidden">
        {/* Tablet: per-person columns */}
        <div className="hidden lg:grid" style={{ gridTemplateColumns: `56px repeat(${columns.length}, 1fr)` }}>
          <div style={{ borderBottom: `1px solid ${palette.line}`, borderRight: `1px solid ${palette.line}` }} />
          {columns.map((c, i) => <ColumnHeader key={c.key} person={c} isLast={i === columns.length - 1} />)}

          <TimeAxis showNow={showNow} nowFrac={nowFrac} />
          {columns.map((c, i) => (
            <TimelineColumn key={c.key} blocks={c.blocks} isLast={i === columns.length - 1} showNow={showNow} nowFrac={nowFrac} withWho={false} />
          ))}
        </div>

        {/* Phone: single combined column */}
        <div className="lg:hidden grid" style={{ gridTemplateColumns: '48px 1fr' }}>
          <TimeAxis showNow={showNow} nowFrac={nowFrac} />
          <TimelineColumn blocks={combined} isLast showNow={showNow} nowFrac={nowFrac} withWho />
        </div>
      </Card>

      <div className="mt-4">
        <TodayPanel members={members} />
      </div>
    </AppShell>
  )
}

function ColumnHeader({ person, isLast }: { person: { name: string; color: string; icon?: typeof Users }; isLast: boolean }) {
  return (
    <div className="flex items-center gap-2 px-2 py-2" style={{ borderBottom: `1px solid ${palette.line}`, borderRight: isLast ? 'none' : `1px solid ${palette.line}` }}>
      <PersonAvatar name={person.name} color={person.color} icon={person.icon} size={28} />
      <div className="text-sm font-semibold truncate">{person.name}</div>
    </div>
  )
}

function TimeAxis({ showNow, nowFrac }: { showNow: boolean; nowFrac: number }) {
  return (
    <div className="relative" style={{ height: TOTAL_HEIGHT }}>
      {HOURS.map((h) => (
        <div key={h} className="absolute right-2 text-xs" style={{ top: timeToY(h) - 7, color: palette.inkSoft }}>{formatHour(h)}</div>
      ))}
      {showNow && <div className="absolute right-0 rounded-full" style={{ top: timeToY(nowFrac) - 3, width: 6, height: 6, backgroundColor: palette.amber }} />}
    </div>
  )
}

function TimelineColumn({ blocks, isLast, showNow, nowFrac, withWho }: {
  blocks: Block[]
  isLast: boolean
  showNow: boolean
  nowFrac: number
  withWho: boolean
}) {
  return (
    <div
      className="relative"
      style={{
        height: TOTAL_HEIGHT,
        borderRight: isLast ? 'none' : `1px solid ${palette.line}`,
        backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${HOUR_HEIGHT - 1}px, ${palette.line} ${HOUR_HEIGHT - 1}px, ${palette.line} ${HOUR_HEIGHT}px)`,
      }}
    >
      {blocks.map((b) => (
        <div
          key={b.ev.id}
          className="absolute left-1 right-1 rounded-md px-2 py-1 overflow-hidden"
          style={{ top: timeToY(b.start) + 2, height: Math.max(18, (clamp(b.end) - clamp(b.start)) * HOUR_HEIGHT - 4), ...chipStyle(b.color) }}
        >
          <div className="text-xs font-semibold truncate" style={{ color: palette.ink }}>{b.ev.title}</div>
          <div className="truncate" style={{ color: palette.inkSoft, fontSize: '10px' }}>
            {fmtTime(new Date(b.ev.startAt))} – {fmtTime(new Date(b.ev.endAt))}{withWho && b.who ? ` · ${b.who}` : ''}
          </div>
        </div>
      ))}
      {showNow && <div className="absolute left-0 right-0" style={{ top: timeToY(nowFrac), borderTop: `2px solid ${palette.amber}` }} />}
    </div>
  )
}

// Static placeholder — chores/todos are wired to the API in Milestone 3.
function TodayPanel({ members }: { members: FamilyMember[] }) {
  const chores = [
    { title: 'Water the plants', who: 'Marie', color: members.find((m) => m.name === 'Marie')?.color ?? '#5C9460', done: false },
    { title: 'Tidy the living room', who: 'Guilherme', color: members.find((m) => m.name === 'Guilherme')?.color ?? '#8A6BB8', done: true },
  ]
  const todos = [
    { title: 'Pack swim bag for tomorrow', done: false },
    { title: 'Reply to school email', done: false },
  ]
  return (
    <Card className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <div className="font-display text-base font-bold mb-2 flex items-center gap-2"><CheckSquare size={16} /> Today's chores</div>
        <div className="space-y-2">
          {chores.map((c, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked={c.done} className="w-4 h-4 rounded" readOnly />
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
              <span className={c.done ? 'line-through' : ''} style={{ color: c.done ? palette.inkSoft : palette.ink }}>{c.title}</span>
              <span className="text-xs ml-auto flex-shrink-0" style={{ color: palette.inkSoft }}>{c.who}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <div className="font-display text-base font-bold mb-2 flex items-center gap-2"><ListTodo size={16} /> To-dos</div>
        <div className="space-y-2">
          {todos.map((t, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input type="checkbox" defaultChecked={t.done} className="w-4 h-4 rounded" readOnly />
              <span className={t.done ? 'line-through' : ''} style={{ color: t.done ? palette.inkSoft : palette.ink }}>{t.title}</span>
            </label>
          ))}
        </div>
      </div>
    </Card>
  )
}
