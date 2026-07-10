import { useCallback, useEffect, useState } from 'react'
import {
  getChoreInstances, getTodos, setChoreStatus, setTodoStatus, setTodoAssignee, createTodo,
  updateTodoTitle, deleteTodo as apiDeleteTodo, patchTodoPriority,
  type ChoreInstance, type Todo, type Effort,
} from './api'

const EFFORT_CYCLE: Effort[] = ['standard', '2min', '5min', 'heavy']
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
  const [loading, setLoading] = useState(true)

  // Depend on the numeric timestamps so reload stays stable across renders that
  // pass a fresh-but-equal range object.
  const fromMs = range?.from.getTime()
  const toMs = range?.to.getTime()
  const reload = useCallback(() => {
    const from = fromMs != null ? new Date(fromMs) : mondayOf(new Date())
    const to = toMs != null ? new Date(toMs) : addDays(mondayOf(new Date()), 7)
    setLoading(true)
    Promise.allSettled([
      getChoreInstances(from, to).then(setInstances),
      getTodos().then(setTodos),
    ]).then((results) => {
      const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
      setError(failed ? String(failed.reason) : null)
      setLoading(false)
    })
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

  const editTodo = useCallback((t: Todo, title: string) => {
    setTodos((cur) => cur.map((x) => (x.id === t.id ? { ...x, title } : x)))
    updateTodoTitle(t.id, title).catch(() => reload())
  }, [reload])

  const deleteTodo = useCallback((t: Todo) => {
    setTodos((cur) => cur.filter((x) => x.id !== t.id))
    apiDeleteTodo(t.id).catch(() => reload())
  }, [reload])

  const toggleImportant = useCallback((t: Todo) => {
    const next = !t.important
    setTodos((cur) => cur.map((x) => (x.id === t.id ? { ...x, important: next } : x)))
    patchTodoPriority(t.id, { important: next }).catch(() => reload())
  }, [reload])

  const cycleEffort = useCallback((t: Todo) => {
    const next = EFFORT_CYCLE[(EFFORT_CYCLE.indexOf(t.effort) + 1) % EFFORT_CYCLE.length]
    setTodos((cur) => cur.map((x) => (x.id === t.id ? { ...x, effort: next } : x)))
    patchTodoPriority(t.id, { effort: next }).catch(() => reload())
  }, [reload])

  return { instances, todos, error, loading, toggleChore, toggleTodo, addTodo, assignTodo, editTodo, deleteTodo, toggleImportant, cycleEffort, reload }
}
