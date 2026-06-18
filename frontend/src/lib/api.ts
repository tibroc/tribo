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
  assignedGuardianId?: string
  conflictStatus: 'none' | 'needs_guardian'
  externalAttendees?: string
  isShared: boolean
  attendeeIds: string[]
}

export interface NewEvent {
  calendarSourceId: string
  title: string
  description?: string | null
  location?: string | null
  startAt: string
  endAt: string
  allDay?: boolean
  visibilityTag?: TriboEvent['visibilityTag']
  requiresGuardian?: boolean
  attendeeIds?: string[]
  icon?: string | null
  externalAttendees?: string | null
}

export interface CalendarSource {
  id: string
  type: 'internal' | 'caldav' | 'google'
  displayName: string
  isShared: boolean
  readOnly: boolean
}

export function getCalendarSources(): Promise<CalendarSource[]> {
  return fetch('/api/calendar-sources').then((r) => json<CalendarSource[]>(r))
}

export interface NewCalendarSource {
  type: 'caldav' | 'google'
  displayName: string
  url: string
  username?: string
  password?: string
  readOnly?: boolean
}

export function addCalendarSource(src: NewCalendarSource): Promise<{ id: string }> {
  return fetch('/api/calendar-sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(src),
  }).then((r) => json<{ id: string }>(r))
}

export function syncCalendarSource(id: string): Promise<void> {
  return fetch(`/api/calendar-sources/${id}/sync`, { method: 'POST' }).then((r) => json<void>(r))
}

export function deleteCalendarSource(id: string): Promise<void> {
  return fetch(`/api/calendar-sources/${id}`, { method: 'DELETE' }).then((r) => json<void>(r))
}

// Returns the Google consent URL to redirect the browser to.
export function googleConnectUrl(): Promise<{ authUrl: string }> {
  return fetch('/api/calendar-sources/google/connect').then((r) => json<{ authUrl: string }>(r))
}

// ── Weather ──
export type WeatherUnits = 'celsius' | 'fahrenheit'

export interface Weather {
  configured: boolean
  temperature: number
  units: WeatherUnits
  code: number
  condition: string
  icon: string // 'sun' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm'
  locationName: string
}

export interface WeatherSettings {
  latitude: number | null
  longitude: number | null
  locationName: string
  units: WeatherUnits
}

export interface GeoResult {
  name: string
  country: string
  admin1: string
  latitude: number
  longitude: number
}

export function getWeather(): Promise<Weather> {
  return fetch('/api/weather').then((r) => json<Weather>(r))
}

export function getWeatherSettings(): Promise<WeatherSettings> {
  return fetch('/api/weather/settings').then((r) => json<WeatherSettings>(r))
}

export function updateWeatherSettings(s: { latitude: number; longitude: number; locationName: string; units: WeatherUnits }): Promise<WeatherSettings> {
  return fetch('/api/weather/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  }).then((r) => json<WeatherSettings>(r))
}

export function geocodeLocation(q: string): Promise<GeoResult[]> {
  return fetch(`/api/weather/geocode?${new URLSearchParams({ q })}`).then((r) => json<GeoResult[]>(r))
}

// ── Notifications (derived action-center items) ──
export interface Notification {
  id: string
  type: 'needs_guardian' | 'unclaimed'
  severity: 'warning' | 'info'
  title: string
  message: string
  eventId: string
  startAt: string
  section: string
}

export function getNotifications(): Promise<Notification[]> {
  return fetch('/api/notifications').then((r) => json<Notification[]>(r))
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

export interface MemberInput {
  name: string
  color: string
  role: 'guardian' | 'child'
  defaultGuardianId?: string | null
  pin?: string | null
}

export function createMember(in_: MemberInput): Promise<FamilyMember> {
  return fetch('/api/family-members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(in_) }).then((r) => json<FamilyMember>(r))
}
export function updateMember(id: string, in_: MemberInput): Promise<FamilyMember> {
  return fetch(`/api/family-members/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(in_) }).then((r) => json<FamilyMember>(r))
}
export function deleteMember(id: string): Promise<void> {
  return fetch(`/api/family-members/${id}`, { method: 'DELETE' }).then((r) => json<void>(r))
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

export function updateEvent(id: string, ev: NewEvent): Promise<TriboEvent> {
  return fetch(`/api/events/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ev),
  }).then((r) => json<TriboEvent>(r))
}

export function deleteEvent(id: string): Promise<void> {
  return fetch(`/api/events/${id}`, { method: 'DELETE' }).then((r) => json<void>(r))
}

export function getEventGuardians(id: string): Promise<{ free: string[] }> {
  return fetch(`/api/events/${id}/guardians`).then((r) => json<{ free: string[] }>(r))
}

export function claimEvent(id: string, memberId: string, force = false): Promise<{ assignedGuardianId: string }> {
  return fetch(`/api/events/${id}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId, force }),
  }).then((r) => json<{ assignedGuardianId: string }>(r))
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

export interface ChoreInput {
  title: string
  recurrenceRule: 'daily' | 'weekly' | 'monthly'
  assignmentMode: 'fixed' | 'rotation'
  assignedMemberId?: string | null
  rotationMemberIds?: string[]
  color?: string
}
export function createChore(in_: ChoreInput): Promise<Chore> {
  return fetch('/api/chores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(in_) }).then((r) => json<Chore>(r))
}
export function updateChore(id: string, in_: ChoreInput): Promise<Chore> {
  return fetch(`/api/chores/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(in_) }).then((r) => json<Chore>(r))
}
export function deleteChore(id: string): Promise<void> {
  return fetch(`/api/chores/${id}`, { method: 'DELETE' }).then((r) => json<void>(r))
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

export function setWorkScheduleVisibility(id: string, showOnCalendar: boolean): Promise<void> {
  return fetch(`/api/work-schedules/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ showOnCalendar }),
  }).then((r) => json<void>(r))
}

export interface WorkScheduleInput {
  memberId: string
  daysOfWeek: string // 7 chars Mon..Sun
  startTime: string
  endTime: string
  label: string
  showOnCalendar: boolean
}
export function createWorkSchedule(in_: WorkScheduleInput): Promise<WorkSchedule> {
  return fetch('/api/work-schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(in_) }).then((r) => json<WorkSchedule>(r))
}
export function updateWorkSchedule(id: string, in_: WorkScheduleInput): Promise<WorkSchedule> {
  return fetch(`/api/work-schedules/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(in_) }).then((r) => json<WorkSchedule>(r))
}
export function deleteWorkSchedule(id: string): Promise<void> {
  return fetch(`/api/work-schedules/${id}`, { method: 'DELETE' }).then((r) => json<void>(r))
}

// ===== Briefing (Home) =====
export interface Briefing {
  rangeStart: string // RFC3339; formatted client-side per locale
  rangeEnd: string
  countdown?: { days: number; title: string }
  today: { startAt: string; title: string; color: string; person: string }[]
  personWeeks: {
    memberId: string
    name: string
    color: string
    highlights: { label: string; weekdays: number[]; time?: string; special: boolean }[]
    chores: string[]
  }[]
  familyHighlights: { title: string; date: string; color: string; icon?: string }[]
  lastWeek: { choresDone: number; choresTotal: number; todosDone: number; todosTotal: number }
}

export function getBriefing(): Promise<Briefing> {
  return fetch('/api/briefing').then((r) => json<Briefing>(r))
}

// ===== Review =====
export interface Review {
  period: 'week' | 'month' | 'year'
  rangeStart: string // RFC3339; formatted client-side per locale
  rangeEnd: string
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
  consistency: { choreId: string; title: string; color: string; who: string; rotation: boolean; history: boolean[] }[]
  ytd: { chores: number; todos: number; birthdays: number }
}

export function getReview(period: 'week' | 'month' | 'year'): Promise<Review> {
  return fetch(`/api/review?period=${period}`).then((r) => json<Review>(r))
}

// ===== Session / auth =====
export interface SessionMember {
  id: string
  name: string
  color: string
  role: 'guardian' | 'child'
  hasPin: boolean
  mapped: boolean
}

export interface SessionInfo {
  authEnabled: boolean
  authenticated: boolean
  needsMapping: boolean
  subject?: string
  activeMemberId?: string
  members: SessionMember[]
}

export function getSession(): Promise<SessionInfo> {
  return fetch('/api/session').then((r) => json<SessionInfo>(r))
}

export function switchProfile(memberId: string, pin?: string): Promise<{ activeMemberId: string }> {
  return fetch('/api/session/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId, pin: pin ?? '' }),
  }).then((r) => json<{ activeMemberId: string }>(r))
}

export function mapProfile(memberId: string): Promise<{ activeMemberId: string }> {
  return fetch('/api/session/map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId }),
  }).then((r) => json<{ activeMemberId: string }>(r))
}

export function logout(): Promise<void> {
  return fetch('/auth/logout', { method: 'POST' }).then((r) => json<void>(r))
}

// ===== Onboarding =====
export interface OnboardMember {
  name: string
  color: string
  role: 'guardian' | 'child'
  defaultGuardianIndex?: number | null
}
export interface OnboardChore {
  title: string
  recurrence: 'daily' | 'weekly' | 'monthly'
  mode: 'fixed' | 'rotation'
  color: string
  assignedMemberIndex?: number | null
  rotationMemberIndices?: number[]
}
export interface OnboardPattern {
  memberIndex: number
  title: string
  startTime: string
  durationMin: number
  weekdays: number[]
}
export interface OnboardRequest {
  familyName: string
  timezone: string
  members: OnboardMember[]
  chores: OnboardChore[]
  typicalWeek: OnboardPattern[]
}

export function onboard(req: OnboardRequest): Promise<{ status: string }> {
  return fetch('/api/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  }).then((r) => json<{ status: string }>(r))
}

// Local date as YYYY-MM-DD (chore-instance endpoint accepts date-only).
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
