import { useEffect, useRef, useState } from 'react'
import type { Section } from '../lib/calendar'
import { getFamilyMembers, type FamilyMember } from '../lib/api'
import { useChoresTodos } from '../lib/hooks'
import AppShell from '../components/AppShell'
import { SimpleHeader } from '../components/chrome'
import Card from '../components/Card'
import { TodosPanel } from '../components/panels'

export default function TodosPage({ go, openNew }: { go: (s: Section) => void; openNew?: boolean }) {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const { todos, toggleTodo, addTodo } = useChoresTodos()
  const addRef = useRef<HTMLInputElement>(null)
  const focusAdd = () => addRef.current?.focus()
  useEffect(() => { getFamilyMembers().then(setMembers).catch(() => {}) }, [])
  // Arriving via Home's quick-add chooser drops the cursor in the add field.
  useEffect(() => { if (openNew) addRef.current?.focus() }, [openNew])

  const openItems = todos.filter((t) => t.status !== 'done')
  const doneItems = todos.filter((t) => t.status === 'done')

  return (
    <AppShell active="todos" onNavigate={go} header={<SimpleHeader title="To-dos" />} onFabClick={focusAdd}>
      <div style={{ padding: '22px 26px' }}>
        {/* Hero */}
        <Card padded={false} className="mb-4" style={{ padding: '18px 26px' }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 24, color: 'var(--t-text)' }}>Shared to-dos</div>
              <div style={{ fontFamily: 'var(--t-font-body)', fontSize: 13, color: 'var(--t-text-soft)', marginTop: 2 }}>
                {todos.length} item{todos.length === 1 ? '' : 's'} · {openItems.length} open
              </div>
            </div>
          </div>
        </Card>

        {/* Board: open + done fill the island width */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <Card
            title="To do"
            action={<span style={{ fontFamily: 'var(--t-font-body)', fontSize: 12, color: 'var(--t-text-soft)' }}>{openItems.length} open</span>}
            padded={false}
          >
            <TodosPanel todos={openItems} members={members} onToggle={toggleTodo} onAdd={addTodo} inputRef={addRef} flush />
          </Card>

          <Card
            title="Done"
            action={<span style={{ fontFamily: 'var(--t-font-body)', fontSize: 12, color: 'var(--t-text-soft)' }}>{doneItems.length} completed</span>}
            padded={false}
          >
            {doneItems.length === 0
              ? <div style={{ fontFamily: 'var(--t-font-body)', fontSize: 14, color: 'var(--t-text-soft)', padding: '16px 22px' }}>Nothing completed yet.</div>
              : <TodosPanel todos={doneItems} members={members} onToggle={toggleTodo} flush />}
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
