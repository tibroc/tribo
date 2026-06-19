import { useCallback, useEffect, useState } from 'react'
import {
  getChoreInstances, getTodos, setChoreStatus, setTodoStatus, setTodoAssignee, createTodo,
  type ChoreInstance, type Todo,
} from './api'
import { addDays, mondayOf } from './calendar'

// Chore instances scheduled within a date range + all todos, with optimistic
// toggle handlers. Shared by the Week/Day panels and the dedicated Chores/To-dos
// screens so checking off persists everywhere through the same code path. The
// range defaults to the current week; the Chores page passes a month/year range
// to scope chores to the period being viewed.
export function useChoresTodos(range?: { from: Date; to: Date }) {
  const [instances, setInstances] = useState<ChoreInstance[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [error, setError] = useState<string | null>(null)

  // Depend on the numeric timestamps so reload stays stable across renders that
  // pass a fresh-but-equal range object.
  const fromMs = range?.from.getTime()
  const toMs = range?.to.getTime()
  const reload = useCallback(() => {
    const from = fromMs != null ? new Date(fromMs) : mondayOf(new Date())
    const to = toMs != null ? new Date(toMs) : addDays(mondayOf(new Date()), 7)
    getChoreInstances(from, to).then(setInstances).catch((e) => setError(String(e)))
    getTodos().then(setTodos).catch((e) => setError(String(e)))
  }, [fromMs, toMs])

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
