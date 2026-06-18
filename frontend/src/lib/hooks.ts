import { useCallback, useEffect, useState } from 'react'
import {
  getChoreInstances, getTodos, setChoreStatus, setTodoStatus, setTodoAssignee, createTodo,
  type ChoreInstance, type Todo,
} from './api'
import { addDays, mondayOf } from './calendar'

// Current-week chore instances + all todos, with optimistic toggle handlers.
// Shared by the Week/Day panels and the dedicated Chores/To-dos screens so
// checking off persists everywhere through the same code path.
export function useChoresTodos() {
  const [instances, setInstances] = useState<ChoreInstance[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    const monday = mondayOf(new Date())
    getChoreInstances(monday, addDays(monday, 7)).then(setInstances).catch((e) => setError(String(e)))
    getTodos().then(setTodos).catch((e) => setError(String(e)))
  }, [])

  useEffect(reload, [reload])

  const toggleChore = useCallback((inst: ChoreInstance) => {
    const next = inst.status === 'done' ? 'pending' : 'done'
    setInstances((cur) => cur.map((i) => (i.id === inst.id ? { ...i, status: next } : i)))
    setChoreStatus(inst.id, next, inst.assignedMemberId).catch(() => reload())
  }, [reload])

  const toggleTodo = useCallback((t: Todo) => {
    const next = t.status === 'done' ? 'open' : 'done'
    setTodos((cur) => cur.map((x) => (x.id === t.id ? { ...x, status: next } : x)))
    setTodoStatus(t.id, next).catch(() => reload())
  }, [reload])

  const addTodo = useCallback((title: string) => {
    createTodo({ title }).then(reload).catch((e) => setError(String(e)))
  }, [reload])

  const assignTodo = useCallback((t: Todo, memberId: string | null) => {
    setTodos((cur) => cur.map((x) => (x.id === t.id ? { ...x, assignedMemberId: memberId ?? undefined } : x)))
    setTodoAssignee(t.id, memberId).catch(() => reload())
  }, [reload])

  return { instances, todos, error, toggleChore, toggleTodo, addTodo, assignTodo, reload }
}
