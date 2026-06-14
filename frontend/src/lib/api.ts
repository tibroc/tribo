// API client + shared types. Mirrors the Go JSON shapes in internal/calendar
// and internal/family.

export interface FamilyMember {
  id: string
  name: string
  color: string
  role: 'guardian' | 'child'
  defaultGuardianId?: string
}

export interface TriboEvent {
  id: string
  calendarSourceId: string
  title: string
  description?: string
  location?: string
  startAt: string // RFC3339
  endAt: string
  allDay: boolean
  icon?: string
  colorOverride?: string
  visibilityTag: 'routine' | 'standard' | 'milestone'
  requiresGuardian: boolean
  conflictStatus: 'none' | 'needs_guardian'
  externalAttendees?: string
  isShared: boolean
  attendeeIds: string[]
}

export interface NewEvent {
  calendarSourceId: string
  title: string
  startAt: string
  endAt: string
  allDay?: boolean
  visibilityTag?: TriboEvent['visibilityTag']
  attendeeIds?: string[]
  icon?: string
  externalAttendees?: string
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function getFamilyMembers(): Promise<FamilyMember[]> {
  return fetch('/api/family-members').then((r) => json<FamilyMember[]>(r))
}

export function getEvents(from: Date, to: Date): Promise<TriboEvent[]> {
  const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
  return fetch(`/api/events?${qs}`).then((r) => json<TriboEvent[]>(r))
}

export function createEvent(ev: NewEvent): Promise<TriboEvent> {
  return fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ev),
  }).then((r) => json<TriboEvent>(r))
}

// ===== Chores =====
export interface Chore {
  id: string
  title: string
  recurrenceRule: 'daily' | 'weekly' | 'monthly'
  assignmentMode: 'fixed' | 'rotation'
  assignedMemberId?: string
  rotationMemberIds?: string[]
  color?: string
  icon?: string
}

export interface ChoreInstance {
  id: string
  choreId: string
  title: string
  color?: string
  periodStart: string
  periodEnd: string
  assignedMemberId?: string
  status: 'pending' | 'done' | 'skipped'
  completedBy?: string
  completedAt?: string
}

export function getChores(): Promise<Chore[]> {
  return fetch('/api/chores').then((r) => json<Chore[]>(r))
}

export function getChoreInstances(from: Date, to: Date): Promise<ChoreInstance[]> {
  const qs = new URLSearchParams({ from: isoDate(from), to: isoDate(to) })
  return fetch(`/api/chore-instances?${qs}`).then((r) => json<ChoreInstance[]>(r))
}

export function completeChore(instanceId: string, memberId?: string): Promise<void> {
  return fetch(`/api/chores/${instanceId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId: memberId ?? '' }),
  }).then((r) => json<void>(r))
}

export function skipChore(instanceId: string): Promise<void> {
  return fetch(`/api/chores/${instanceId}/skip`, { method: 'POST' }).then((r) => json<void>(r))
}

export function setChoreStatus(instanceId: string, status: 'pending' | 'done' | 'skipped', memberId?: string): Promise<void> {
  return fetch(`/api/chore-instances/${instanceId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, memberId: memberId ?? '' }),
  }).then((r) => json<void>(r))
}

// ===== Todos =====
export interface Todo {
  id: string
  title: string
  assignedMemberId?: string
  dueDate?: string
  status: 'open' | 'done'
  completedAt?: string
}

export function getTodos(): Promise<Todo[]> {
  return fetch('/api/todos').then((r) => json<Todo[]>(r))
}

export function createTodo(t: { title: string; assignedMemberId?: string }): Promise<Todo> {
  return fetch('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(t),
  }).then((r) => json<Todo>(r))
}

export function setTodoStatus(id: string, status: 'open' | 'done'): Promise<Todo> {
  return fetch(`/api/todos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }).then((r) => json<Todo>(r))
}

// ===== Work schedules =====
export interface WorkSchedule {
  id: string
  memberId: string
  daysOfWeek: string // 7 chars Mon..Sun
  startTime: string
  endTime: string
  label: string
  showOnCalendar: boolean
}

export function getWorkSchedules(): Promise<WorkSchedule[]> {
  return fetch('/api/work-schedules').then((r) => json<WorkSchedule[]>(r))
}

// ===== Briefing (Home) =====
export interface Briefing {
  rangeLabel: string
  countdown?: { days: number; title: string }
  today: { time: string; title: string; color: string; person: string }[]
  personWeeks: {
    memberId: string
    name: string
    color: string
    highlights: { label: string; days: string; special: boolean }[]
    chores: string[]
  }[]
  familyHighlights: { title: string; day: string; color: string; icon?: string }[]
  lastWeek: { choresDone: number; choresTotal: number; todosDone: number; todosTotal: number }
}

export function getBriefing(): Promise<Briefing> {
  return fetch('/api/briefing').then((r) => json<Briefing>(r))
}

// ===== Review =====
export interface Review {
  period: 'week' | 'month' | 'year'
  rangeLabel: string
  chores: { done: number; total: number; pct: number }
  todos: { done: number; total: number; pct: number }
  events: number
  perPerson: {
    memberId: string
    name: string
    color: string
    choresDone: number
    choresTotal: number
    todosDone: number
    todosTotal: number
    streak: number
  }[]
  consistency: { choreId: string; title: string; color: string; who: string; history: boolean[] }[]
  ytd: { chores: number; todos: number; birthdays: number }
}

export function getReview(period: 'week' | 'month' | 'year'): Promise<Review> {
  return fetch(`/api/review?period=${period}`).then((r) => json<Review>(r))
}

// Local date as YYYY-MM-DD (chore-instance endpoint accepts date-only).
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
