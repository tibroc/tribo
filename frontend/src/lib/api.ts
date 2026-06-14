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
