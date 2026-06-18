import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import type { ChoreInstance, Chore, Todo, FamilyMember } from '../lib/api'
import Icon from './Icon'
import PersonAvatar from './PersonAvatar'

// Salvia checkbox: rounded square, filled salvia + checkmark when done.
export function CheckBox({ done, onToggle, size = 23, label }: {
  done: boolean
  onToggle: () => void
  size?: number
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={done}
      className="flex items-center justify-center flex-shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        border: done ? '2px solid var(--t-brand)' : '2px solid var(--t-line)',
        background: done ? 'var(--t-brand)' : 'transparent',
        color: '#fff',
        cursor: 'pointer',
        transition: '.15s',
      }}
    >
      {done && (
        <svg width={Math.round(size * 0.56)} height={Math.round(size * 0.56)} viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  )
}

// Recurrence / rotation tag — uppercase pill, salvia for fixed schedules,
// terra for rotations (matching the reference `.svt-pill`).
export function RecurrencePill({ label, rotation }: { label: string; rotation?: boolean }) {
  return (
    <span
      className="inline-flex items-center"
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
        padding: '3px 9px',
        borderRadius: 999,
        flexShrink: 0,
        background: rotation
          ? 'color-mix(in oklab, var(--t-danger) 18%, var(--t-surface))'
          : 'color-mix(in oklab, var(--t-brand) 16%, var(--t-surface))',
        color: rotation ? 'var(--t-danger)' : 'var(--t-brand)',
      }}
    >
      {label}
    </span>
  )
}

// Tiny uppercase group label (TODAY / LATER THIS WEEK).
function GroupLabel({ children, flush }: { children: React.ReactNode; flush?: boolean }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
      color: 'var(--t-text-soft)', padding: flush ? '14px 22px 6px' : '12px 0 4px',
    }}>
      {children}
    </div>
  )
}

// A single chore row. `flush` = full-bleed dedicated-card row (11px 22px, edge
// dividers); otherwise an inset aside row (11px 0).
export function ChoreRow({ inst, chore, member, memberIndex, onToggle, flush, last }: {
  inst: ChoreInstance
  chore?: Chore
  member?: FamilyMember
  memberIndex?: number
  onToggle: () => void
  flush?: boolean
  last?: boolean
}) {
  const { t } = useTranslation()
  const done = inst.status === 'done'
  const rotation = chore?.assignmentMode === 'rotation'
  const recur = chore ? t(`chores.recurrence.${chore.recurrenceRule}`) : null
  return (
    <div
      className="flex items-center gap-3"
      style={{
        padding: flush ? '11px 22px' : '11px 0',
        borderBottom: last ? 'none' : '1px solid var(--t-line)',
      }}
    >
      <CheckBox done={done} onToggle={onToggle} label={inst.title} />
      <div className="flex-1 min-w-0">
        <div style={{
          fontFamily: 'var(--t-font-body)', fontSize: 14, fontWeight: 600,
          color: done ? 'var(--t-text-soft)' : 'var(--t-text)',
          textDecoration: done ? 'line-through' : 'none',
          textDecorationColor: 'var(--t-line)',
        }} className="truncate">
          {inst.title}
        </div>
        {recur && (
          <div style={{ fontFamily: 'var(--t-font-body)', fontSize: 12, color: 'var(--t-text-soft)', marginTop: 1 }} className="truncate">
            {rotation ? t('chores.rotation') : recur}
          </div>
        )}
      </div>
      {chore && <RecurrencePill label={rotation ? t('chores.rotation') : (recur ?? '')} rotation={rotation} />}
      {member && <PersonAvatar name={member.name} color={member.color} index={memberIndex} size={26} />}
    </div>
  )
}

export function ChoresPanel({ instances, members, chores, onToggle, title, flush, grouped }: {
  instances: ChoreInstance[]
  members: FamilyMember[]
  chores?: Chore[]
  onToggle: (i: ChoreInstance) => void
  title?: string
  flush?: boolean
  grouped?: boolean
}) {
  const { t } = useTranslation()
  const indexOf = (id?: string) => {
    const i = members.findIndex((m) => m.id === id)
    return i < 0 ? undefined : i
  }
  const memberOf = (id?: string) => members.find((m) => m.id === id)
  const choreOf = (instCid: string) => chores?.find((c) => c.id === instCid)

  const renderRow = (i: ChoreInstance, last: boolean) => (
    <ChoreRow
      key={i.id}
      inst={i}
      chore={choreOf(i.choreId)}
      member={memberOf(i.assignedMemberId)}
      memberIndex={indexOf(i.assignedMemberId)}
      onToggle={() => onToggle(i)}
      flush={flush}
      last={last}
    />
  )

  // Grouping: daily chores → "Today", everything else → "Later this week".
  const groups: { label: string; items: ChoreInstance[] }[] = (() => {
    if (!grouped || !chores) return [{ label: '', items: instances }]
    const today: ChoreInstance[] = []
    const later: ChoreInstance[] = []
    for (const i of instances) (choreOf(i.choreId)?.recurrenceRule === 'daily' ? today : later).push(i)
    return [
      { label: t('chores.groupToday'), items: today },
      { label: t('chores.groupLater'), items: later },
    ].filter((g) => g.items.length > 0)
  })()

  return (
    <div>
      {title && (
        <div
          className="flex items-center gap-2"
          style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 18, color: 'var(--t-text)', marginBottom: 4 }}
        >
          <Icon name="chores" size={16} /> {title}
        </div>
      )}
      {instances.length === 0 && (
        <div style={{ fontFamily: 'var(--t-font-body)', fontSize: 14, color: 'var(--t-text-soft)', padding: flush ? '12px 22px' : '8px 0' }}>
          {t('chores.noneThisWeek')}
        </div>
      )}
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.label && <GroupLabel flush={flush}>{g.label}</GroupLabel>}
          {g.items.map((i, idx) => renderRow(i, gi === groups.length - 1 && idx === g.items.length - 1))}
        </div>
      ))}
    </div>
  )
}

export function TodosPanel({ todos, members = [], onToggle, onAdd, onAssign, title, flush, inputRef }: {
  todos: Todo[]
  members?: FamilyMember[]
  onToggle: (t: Todo) => void
  onAdd?: (title: string) => void
  onAssign?: (t: Todo, memberId: string | null) => void
  title?: string
  flush?: boolean
  inputRef?: React.Ref<HTMLInputElement>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const indexOf = (id?: string) => {
    const i = members.findIndex((m) => m.id === id)
    return i < 0 ? undefined : i
  }
  const memberOf = (id?: string) => members.find((m) => m.id === id)
  const rowPad = flush ? '11px 22px' : '11px 0'

  return (
    <div>
      {title && (
        <div
          className="flex items-center gap-2"
          style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 18, color: 'var(--t-text)', marginBottom: 4 }}
        >
          <Icon name="todos" size={16} /> {title}
        </div>
      )}
      {todos.length === 0 && (
        <div style={{ fontFamily: 'var(--t-font-body)', fontSize: 14, color: 'var(--t-text-soft)', padding: flush ? '12px 22px' : '8px 0' }}>
          {t('todos.nothingToDo')}
        </div>
      )}
      {todos.map((t, idx) => {
        const done = t.status === 'done'
        const member = memberOf(t.assignedMemberId)
        return (
          <div
            key={t.id}
            className="flex items-center gap-3"
            style={{ padding: rowPad, borderBottom: idx === todos.length - 1 ? 'none' : '1px solid var(--t-line)' }}
          >
            <CheckBox done={done} onToggle={() => onToggle(t)} size={20} label={t.title} />
            <span
              className="flex-1 min-w-0 truncate"
              style={{
                fontFamily: 'var(--t-font-body)',
                fontSize: 13.5,
                fontWeight: 500,
                color: done ? 'var(--t-text-soft)' : 'var(--t-text)',
                textDecoration: done ? 'line-through' : 'none',
              }}
            >
              {t.title}
            </span>
            {onAssign && members.length > 0
              ? <TodoAssign todo={t} members={members} onAssign={onAssign} />
              : member && <PersonAvatar name={member.name} color={member.color} index={indexOf(t.assignedMemberId)} size={20} />}
          </div>
        )
      })}
      {onAdd && (
        <form
          className="flex items-center gap-2"
          style={{ padding: flush ? '13px 22px' : '12px 0 0' }}
          onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { onAdd(draft.trim()); setDraft('') } }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('todos.addPlaceholder')}
            className="flex-1 outline-none"
            style={{
              fontFamily: 'var(--t-font-body)',
              fontSize: 13.5,
              borderRadius: 'var(--t-radius-md)',
              padding: '8px 14px',
              border: '1px solid var(--t-line)',
              background: 'var(--t-surface)',
              color: 'var(--t-text)',
            }}
          />
          <button
            type="submit"
            className="flex items-center justify-center"
            aria-label={t('todos.addAria')}
            style={{
              background: 'var(--t-brand)',
              color: 'var(--t-on-brand)',
              borderRadius: 'var(--t-radius-md)',
              padding: '8px 12px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={16} strokeWidth={2.6} />
          </button>
        </form>
      )}
    </div>
  )
}

// Per-todo assignee control: avatar (or a dashed "+" when unassigned) that opens
// a small member picker. Lives in its own component to keep its open-state and
// the `t` translation fn out of the TodosPanel row map (which shadows `t`).
function TodoAssign({ todo, members, onAssign }: {
  todo: Todo
  members: FamilyMember[]
  onAssign: (t: Todo, memberId: string | null) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const idx = members.findIndex((m) => m.id === todo.assignedMemberId)
  const member = idx >= 0 ? members[idx] : undefined
  const item = 'flex items-center gap-2 w-full text-left rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-[var(--t-shell)]'
  return (
    <div className="relative flex-shrink-0">
      <button onClick={() => setOpen((o) => !o)} aria-label={t('todos.assign')} className="flex items-center justify-center">
        {member
          ? <PersonAvatar name={member.name} color={member.color} index={idx} size={20} />
          : <span className="flex items-center justify-center rounded-full" style={{ width: 20, height: 20, border: '1.5px dashed var(--t-line)', color: 'var(--t-text-soft)' }}><Icon name="plus" size={11} strokeWidth={2.4} /></span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0" style={{ zIndex: 40 }} onClick={() => setOpen(false)} aria-hidden />
          <div
            className="absolute right-0 flex flex-col"
            style={{ top: 26, minWidth: 156, background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 'var(--t-radius-md)', boxShadow: 'var(--t-shadow-pop)', padding: 4, gap: 1, zIndex: 41 }}
            role="menu"
          >
            {members.map((m, i) => (
              <button key={m.id} role="menuitem" onClick={() => { onAssign(todo, m.id); setOpen(false) }} className={item} style={{ color: 'var(--t-text)' }}>
                <PersonAvatar name={m.name} color={m.color} index={i} size={18} />
                <span className="flex-1 truncate">{m.name}</span>
                {m.id === todo.assignedMemberId && <Check size={14} style={{ color: 'var(--t-brand)' }} />}
              </button>
            ))}
            <button role="menuitem" onClick={() => { onAssign(todo, null); setOpen(false) }} className={item} style={{ color: 'var(--t-text-soft)' }}>
              <span className="flex-1">{t('todos.unassigned')}</span>
              {!todo.assignedMemberId && <Check size={14} style={{ color: 'var(--t-brand)' }} />}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
