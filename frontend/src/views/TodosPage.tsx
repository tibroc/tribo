import type { Section } from '../lib/calendar'
import { useChoresTodos } from '../lib/hooks'
import AppShell from '../components/AppShell'
import { SimpleHeader } from '../components/chrome'
import Card from '../components/Card'
import { TodosPanel } from '../components/panels'

export default function TodosPage({ go }: { go: (s: Section) => void }) {
  const { todos, toggleTodo, addTodo } = useChoresTodos()
  return (
    <AppShell active="todos" onNavigate={go} header={<SimpleHeader title="To-dos" />}>
      <Card className="p-4 max-w-2xl">
        <TodosPanel todos={todos} onToggle={toggleTodo} onAdd={addTodo} title="All to-dos" />
      </Card>
    </AppShell>
  )
}
