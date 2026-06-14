# Roost — Data Model (Draft v1)

## Design principles

- Single-family instance — no multi-tenancy needed.
- SQLite-friendly: flat relational tables, simple types, no exotic features. Keeps the production stack to "Roost backend + Caddy (+ optional Radicale)".
- `assigned_guardian_id` and `conflict_status` on `Event` are **computed and cached**, recalculated when the event or an overlapping guardian commitment changes — not derived live on every page load.
- `visibility_tag` on `Event` is the per-item "show at this zoom level?" control discussed for Quarter/Year decluttering.

---

## Family

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | e.g. "The Silva Family" |
| timezone | text | IANA tz, e.g. `Europe/Lisbon` |

## FamilyMember

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| family_id | fk | |
| name | text | Alberto, Hilda, Marie, Guilherme |
| color | hex | drives chip/dot/avatar colors everywhere |
| role | enum | `guardian` \| `child` |
| oidc_subject | text, nullable | maps to Authentik login |
| pin | text, nullable | optional profile-switch PIN for kids |
| default_guardian_id | fk → FamilyMember, nullable | **only set on `child` rows** — used as tiebreaker when multiple guardians are free |

## WorkSchedule

Recurring availability blocks for guardians. Used only for conflict-checking — not rendered as events by default.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| member_id | fk → FamilyMember (`guardian`) | |
| days_of_week | set | Mon–Sun |
| start_time / end_time | time | |
| label | text | "Work", "Commute" |
| show_on_calendar | bool, default `false` | opt-in to show as a faint "busy" stripe |

## CalendarSource

Represents the internal calendar plus any synced external calendars.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| type | enum | `internal` \| `caldav` \| `google` |
| display_name | text | |
| url / credentials | text, encrypted | for caldav/google |
| read_only | bool | |
| last_synced_at | timestamp | |

## Event

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| calendar_source_id | fk | |
| title / description / location | text | |
| start_at / end_at | timestamp | |
| all_day | bool | |
| recurrence_rule | text, nullable | RRULE |
| recurrence_exceptions | text[], nullable | for edited/cancelled single instances |
| external_id | text, nullable | maps back to CalDAV/Google for sync |
| icon | text, nullable | e.g. `cake` |
| color_override | hex, nullable | else derived from the attendee(s) |
| visibility_tag | enum | `routine` \| `standard` \| `milestone` |
| requires_guardian | bool, default `false` | only meaningful if a `child` is an attendee |
| assigned_guardian_id | fk → FamilyMember, nullable | **computed** |
| conflict_status | enum | `none` \| `needs_guardian` — **computed** |
| external_attendees | text[], nullable | people outside the family, e.g. "Grandma" |

## EventAttendee (join table)

`event_id`, `member_id` — many-to-many between Event and FamilyMember.

## Chore

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| title / description | text | |
| recurrence_rule | text | RRULE, e.g. weekly |
| assignment_mode | enum | `fixed` \| `rotation` |
| assigned_member_id | fk, nullable | if `fixed` |
| rotation_member_ids | uuid[], nullable | ordered, if `rotation` |
| color / icon | | usually derived from assignee |

## ChoreInstance

One row per occurrence — this is what the Review heatmap and streaks read from.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| chore_id | fk | |
| period_start / period_end | date | the day/week this instance covers |
| assigned_member_id | fk | resolved (handles rotation) |
| status | enum | `pending` \| `done` \| `skipped` |
| completed_by / completed_at | fk / timestamp, nullable | |

## Todo

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| title / description | text | |
| assigned_member_id | fk, nullable | `null` = family-wide |
| due_date | date, nullable | |
| status | enum | `open` \| `done` |
| completed_at | timestamp, nullable | |

---

## Guardian assignment & conflict logic

For an `Event` with `requires_guardian = true` and at least one `child` attendee, recompute whenever the event itself changes, or any Event/WorkSchedule overlapping its time window changes for a guardian:

1. **Free guardians** = all `guardian` members with no overlapping Event (as attendee) and no overlapping WorkSchedule block.
2. **Exactly one free** → assign them, `conflict_status = none`.
3. **Multiple free**:
   - If the child's `default_guardian_id` is set and that guardian is free → assign them.
   - Otherwise → `assigned_guardian_id = null`, `conflict_status = none` (first guardian to open the event can claim it).
4. **Zero free** → `assigned_guardian_id = null`, `conflict_status = needs_guardian` — shown as a warning badge on the event chip and surfaced on Home ("2 events need a guardian").

## Visibility tags

| Tag | Day / Week | Month | Quarter / Year |
|---|---|---|---|
| `routine` | shown | shown | hidden |
| `standard` | shown | shown | hidden |
| `milestone` | shown | shown | shown |

Defaults: recurring patterns (school, work, gym, lessons) → `routine`; one-off events → `standard`; birthdays, holidays, major family events → `milestone`. Editable per event or per recurring series — this is the "users can control what disappears when zoomed out" tag from earlier.

## Birthdays & people outside the family

Birthdays are just `Event` rows: `recurrence_rule` = yearly, `all_day = true`, `icon = cake`, `visibility_tag = milestone`. For people who aren't login-enabled family members (grandparents, etc.), `external_attendees` holds their name; they get the shared/gold color unless a future "relatives" list adds per-person colors.

## API surface (stable — for MCP + integrations)

- `GET/POST /api/events`, `PATCH /api/events/{id}`
- `GET /api/availability?member_id=&from=&to=` — free/busy including work schedules
- `POST /api/chores/{instance_id}/complete`, `/skip`
- `GET/POST /api/todos`, `PATCH /api/todos/{id}` (toggle done)
- `GET /api/briefing` — powers the Home screen
- `GET /api/review?period=week|month|year`

MCP tools wrap these directly: `add_todo`, `complete_chore`, `get_today`, `check_availability`, etc.

## Storage & services

- **SQLite** is plenty for a single-family instance — avoids a separate DB container and keeps docker-compose minimal.
- **Radicale** (small Python CalDAV server) as the bundled "set up your own calendar" option — Roost just treats it as another `CalendarSource`.
- **Authentik** (OIDC) — Go backend validates tokens and maps `oidc_subject` → `FamilyMember`. An in-app profile switcher (optional PIN) lets someone choose which family member's view they're using without a separate login per person.
