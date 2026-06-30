import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Section } from '../lib/calendar'
import { getFamilyMembers, type FamilyMember } from '../lib/api'
import { useChoresTodos } from '../lib/hooks'
import AppShell from '../components/AppShell'
import { SimpleHeader } from '../components/chrome'
import Card from '../components/Card'
import { TodosPanel } from '../components/panels'

export default function TodosPage({ go, openNew }: { go: (s: Section) => void; openNew?: boolean }) {
  const { t } = useTranslation()
  const [members, setMembers] = useState<FamilyMember[]>([])
  const { todos, toggleTodo, addTodo, assignTodo } = useChoresTodos()
  const addRef = useRef<HTMLInputElement>(null)
  useEffect(() => { getFamilyMembers().then(setMembers).catch(() => {}) }, [])
  // Arriving via Home's quick-add chooser drops the cursor in the add field.
  useEffect(() => { if (openNew) addRef.current?.focus() }, [openNew])

  const openItems = todos.filter((t) => t.status !== 'done')
  const doneItems = todos.filter((t) => t.status === 'done')

  return (
    <AppShell active="todos" onNavigate={go} header={<SimpleHeader title={t('nav.todos')} />} showFab={false}>
      <div style={{ padding: '22px 26px' }}>
        {/* Hero */}
        <Card padded={false} className="mb-4" style={{ padding: '18px 26px' }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div style={{ fontFamily: 'var(--t-font-display)', fontWeight: 500, fontSize: 24, color: 'var(--t-text)' }}>{t('todos.shared')}</div>
              <div style={{ fontFamily: 'var(--t-font-body)', fontSize: 13, color: 'var(--t-text-soft)', marginTop: 2 }}>
                {t('todos.itemsSummary', { count: todos.length, open: openItems.length })}
              </div>
            </div>
          </div>
        </Card>

        {/* Board: open + done fill the island width */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <Card
            title={t('todos.toDo')}
            action={<span style={{ fontFamily: 'var(--t-font-body)', fontSize: 12, color: 'var(--t-text-soft)' }}>{t('todos.openCount', { count: openItems.length })}</span>}
            padded={false}
          >
            <TodosPanel todos={openItems} members={members} onToggle={toggleTodo} onAdd={addTodo} onAssign={assignTodo} inputRef={addRef} flush />
          </Card>

          <Card
            title={t('common.done')}
            action={<span style={{ fontFamily: 'var(--t-font-body)', fontSize: 12, color: 'var(--t-text-soft)' }}>{t('todos.completedCount', { count: doneItems.length })}</span>}
            padded={false}
          >
            {doneItems.length === 0
              ? <div style={{ fontFamily: 'var(--t-font-body)', fontSize: 14, color: 'var(--t-text-soft)', padding: '16px 22px' }}>{t('todos.nothingCompleted')}</div>
              : <TodosPanel todos={doneItems} members={members} onToggle={toggleTodo} flush />}
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
