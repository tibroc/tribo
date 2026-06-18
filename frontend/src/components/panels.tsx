import { useState } from 'react'
import { CheckSquare, ListTodo, Plus } from 'lucide-react'
import { palette } from '../lib/tokens'
import type { ChoreInstance, Todo, FamilyMember } from '../lib/api'

// A checkbox row: checked state, optional color dot, label, optional right meta.
function CheckRow({ done, color, label, meta, onToggle }: {
  done: boolean
  color?: string
  label: string
  meta?: string
  onToggle: () => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={done} onChange={onToggle} className="w-4 h-4 rounded" />
      {color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
      <span className={`flex-1 truncate ${done ? 'line-through' : ''}`} style={{ color: done ? palette.inkSoft : palette.ink }}>{label}</span>
      {meta && <span className="text-xs flex-shrink-0" style={{ color: palette.inkSoft }}>{meta}</span>}
    </label>
  )
}

export function ChoresPanel({ instances, members, onToggle, title = 'Chores' }: {
  instances: ChoreInstance[]
  members: FamilyMember[]
  onToggle: (i: ChoreInstance) => void
  title?: string
}) {
  const nameOf = (id?: string) => members.find((m) => m.id === id)?.name
  return (
    <div>
      <div className="font-display text-base font-bold mb-2 flex items-center gap-2"><CheckSquare size={16} /> {title}</div>
      <div className="space-y-2">
        {instances.length === 0 && <div className="text-sm" style={{ color: palette.inkSoft }}>No chores this week</div>}
        {instances.map((i) => (
          <CheckRow key={i.id} done={i.status === 'done'} color={i.color} label={i.title} meta={nameOf(i.assignedMemberId)} onToggle={() => onToggle(i)} />
        ))}
      </div>
    </div>
  )
}

export function TodosPanel({ todos, onToggle, onAdd, title = 'To-dos' }: {
  todos: Todo[]
  onToggle: (t: Todo) => void
  onAdd?: (title: string) => void
  title?: string
}) {
  const [draft, setDraft] = useState('')
  return (
    <div>
      <div className="font-display text-base font-bold mb-2 flex items-center gap-2"><ListTodo size={16} /> {title}</div>
      <div className="space-y-2">
        {todos.length === 0 && <div className="text-sm" style={{ color: palette.inkSoft }}>Nothing to do</div>}
        {todos.map((t) => (
          <CheckRow key={t.id} done={t.status === 'done'} label={t.title} onToggle={() => onToggle(t)} />
        ))}
      </div>
      {onAdd && (
        <form
          className="flex items-center gap-2 mt-3"
          onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { onAdd(draft.trim()); setDraft('') } }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a to-do…"
            className="flex-1 text-sm rounded-xl px-3 py-2 outline-none"
            style={{ border: `1px solid ${palette.line}`, backgroundColor: palette.surface }}
          />
          <button type="submit" className="rounded-xl px-3 py-2 flex items-center" style={{ backgroundColor: palette.brand, color: '#fff' }} aria-label="Add to-do">
            <Plus size={16} />
          </button>
        </form>
      )}
    </div>
  )
}
