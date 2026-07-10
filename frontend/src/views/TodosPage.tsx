import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Section } from '../lib/calendar'
import { getFamilyMembers, type FamilyMember, type Todo } from '../lib/api'
import { useChoresTodos } from '../lib/hooks'
import AppShell from '../components/AppShell'
import { SimpleHeader } from '../components/chrome'
import Card from '../components/Card'
import ErrorBanner from '../components/ErrorBanner'
import ConfirmDialog from '../components/ConfirmDialog'
import { TodosPanel } from '../components/panels'

export default function TodosPage({ go }: { go: (s: Section) => void }) {
  const { t } = useTranslation()
  const [members, setMembers] = useState<FamilyMember[]>([])
  const { todos, error, loading, toggleTodo, addTodo, assignTodo, editTodo, deleteTodo, toggleImportant, cycleEffort } = useChoresTodos()
  const [pendingDelete, setPendingDelete] = useState<Todo | null>(null)
  useEffect(() => { getFamilyMembers().then(setMembers).catch(() => {}) }, [])

  const openItems = todos.filter((t) => t.status !== 'done')
  const doneItems = todos.filter((t) => t.status === 'done')

  return (
    <AppShell active="todos" onNavigate={go} header={<SimpleHeader title={t('nav.todos')} />} showFab={false}>
      <div style={{ padding: '22px 26px' }}>
        {error && <ErrorBanner className="mb-3">{error}</ErrorBanner>}
        {loading && todos.length === 0 && !error && (
          <div className="text-sm mb-3" style={{ color: 'var(--t-text-soft)' }}>{t('common.loading')}</div>
        )}
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
            <TodosPanel todos={openItems} members={members} onToggle={toggleTodo} onAdd={addTodo} onAssign={assignTodo} onEdit={editTodo} onDelete={setPendingDelete} onToggleImportant={toggleImportant} onCycleEffort={cycleEffort} flush />
          </Card>

          <Card
            title={t('common.done')}
            action={<span style={{ fontFamily: 'var(--t-font-body)', fontSize: 12, color: 'var(--t-text-soft)' }}>{t('todos.completedCount', { count: doneItems.length })}</span>}
            padded={false}
          >
            {doneItems.length === 0
              ? <div style={{ fontFamily: 'var(--t-font-body)', fontSize: 14, color: 'var(--t-text-soft)', padding: '16px 22px' }}>{t('todos.nothingCompleted')}</div>
              : <TodosPanel todos={doneItems} members={members} onToggle={toggleTodo} onDelete={setPendingDelete} flush />}
          </Card>
        </div>
      </div>
      {pendingDelete && (
        <ConfirmDialog
          message={t('common.confirmDeleteBody')}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => { deleteTodo(pendingDelete); setPendingDelete(null) }}
        />
      )}
    </AppShell>
  )
}
