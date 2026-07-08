# Tribo — Data Model

> This reflects the SQLite schema after the calendar refactor. Migrations live in
> `internal/store/migrations/` (0001–0006); this doc is the human-readable
> summary. The app was renamed roost → tribo; this doc keeps its `roost-`
> filename.

## Design principles

- Single-family instance — no multi-tenancy needed.
- SQLite-friendly: flat relational tables, simple types, no exotic features.
- **Radicale (CalDAV) is the system of record for events.** The `event` table is
  a **disposable cache** rebuilt from sync (stable id = CalDAV UID); Tribo-only
  fields ride on the iCal as `X-TRIBO-*` props. SQLite is the source of truth for
  everything else.
- `assigned_guardian_id` and `conflict_status` on `Event` are **computed and
  cached**, recalculated when the event or an overlapping guardian commitment
  changes — not derived live on every page load.
- `visibility_tag` on `Event` is the per-item "show at this zoom level?" control
  for Quarter/Year decluttering.
- Times are RFC3339; `days_of_week`/`recurrence_weekdays` are 7-char Mon..Sun
  bitstrings; comma-separated lists (attendees, rotation members) are stored as
  plain `TEXT`, not arrays.

---

## Family

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | e.g. "The Silva Family" |
| timezone | text | IANA tz, e.g. `Europe/Lisbon`; used to interpret floating iCal times |
| weather_latitude / weather_longitude | real, nullable | drives the header weather widget |
| weather_location_name | text, nullable | e.g. "Lisbon, Portugal" |
| weather_units | text | `celsius` (default) \| `fahrenheit` |

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
| date_of_birth | text (`YYYY-MM-DD`), nullable | drives the auto-generated Birthdays calendar |
| sort_order | int | display order |

## WorkSchedule

Recurring availability blocks for guardians. Used only for conflict-checking — not rendered as events by default.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| member_id | fk → FamilyMember (`guardian`) | |
| days_of_week | text | 7-char Mon..Sun bitstring, e.g. `1111100` |
| start_time / end_time | text (`HH:MM`) | |
| label | text | "Work", "Commute" |
| show_on_calendar | bool, default `false` | opt-in to show as a faint "busy" stripe |

## CalendarSource

One row per managed Radicale collection plus any synced external calendars.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| type | enum | `caldav` \| `google` (\| legacy `internal`, migrated away at startup) |
| kind | enum | `person` \| `family` \| `birthdays` \| `chores` \| `external` — classifies managed collections |
| member_id | fk → FamilyMember, nullable | binds `person`/Google calendars to a member |
| managed | bool | 1 = auto-provisioned; the UI must not let users add/remove it |
| is_shared | bool | 1 = family/shared (no per-member attendees) |
| display_name | text | |
| url / credentials | text, credentials AES-GCM-encrypted | for caldav/google |
| read_only | bool | Google is always read-only |
| last_synced_at | timestamp | |

## Event  *(disposable cache — Radicale is the source of truth)*

The stable id is the CalDAV UID; the row is rebuilt from sync. Non-standard
fields below travel on the iCal as `X-TRIBO-*` props so they survive a round-trip.

| Field | Type | Notes |
|---|---|---|
| id | text (CalDAV UID) | |
| calendar_source_id | fk | owning collection |
| title / description / location | text | |
| start_at / end_at | text (RFC3339) | |
| all_day | bool | all-day events never count toward guardian "busy" |
| recurrence_rule | text, nullable | RRULE (stored/round-tripped; occurrence expansion is **not** yet implemented — a recurring event shows as one cache row) |
| external_id | text, nullable | maps back to CalDAV/Google for sync |
| icon | text, nullable | e.g. `cake` |
| color_override | hex, nullable | else derived from the attendee(s) |
| visibility_tag | enum | `routine` \| `standard` \| `milestone` (coerced to `standard` on sync if out-of-set) |
| requires_guardian | bool, default `false` | only meaningful if a `child` is an attendee |
| assigned_guardian_id | fk → FamilyMember, nullable | **computed** |
| conflict_status | enum | `none` \| `needs_guardian` — **computed** |
| external_attendees | text, nullable | comma-separated names outside the family, e.g. "Grandma" |

## EventAttendee (join table)

`event_id`, `member_id` — many-to-many between Event and FamilyMember.

## Chore

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| title / description | text | |
| recurrence_rule | enum | `daily` \| `weekly` \| `monthly` |
| recurrence_interval | int, default 1 | multiplier on the unit (2 = every 2 weeks; 12 monthly = yearly) |
| recurrence_weekdays | text, nullable | 7-char Mon..Sun bitstring; only honored for `weekly` (empty = one instance per week bucket) |
| assignment_mode | enum | `fixed` \| `rotation` |
| assigned_member_id | fk, nullable | if `fixed` |
| rotation_member_ids | text, nullable | comma-separated member ids, ordered, if `rotation` |
| color / icon | text, nullable | usually derived from assignee |
| sort_order | int | display order |

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
| due_date | date, nullable | present in schema; not currently set by the UI |
| status | enum | `open` \| `done` |
| completed_at | timestamp, nullable | |
| sort_order | int | display order |

> Note: `todo.description` exists in the schema but is not written by the API or
> surfaced in the UI (dead field, kept to avoid a migration).

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

Birthdays are **projected into the event cache as discrete all-day events** (one
per year in the sync window, no RRULE) from `family_member.date_of_birth`, with
`icon = cake`, `visibility_tag = milestone`, living on the managed `birthdays`
collection. Chore instances are projected the same way onto the `chores`
collection. For people who aren't login-enabled family members (grandparents,
etc.), `external_attendees` holds their name; they get the shared/gold color.

## API surface (stable — for MCP + integrations)

- `GET/POST /api/events`, `PATCH/DELETE /api/events/{id}`, `GET /api/events/{id}/guardians`, `POST /api/events/{id}/claim`
- `GET /api/calendar-status`, `GET/POST /api/calendar-sources`, `DELETE /api/calendar-sources/{id}`, `POST /api/calendar-sources/{id}/sync`, `GET /api/calendar-sources/google/connect`
- `GET/POST /api/chores`, `GET /api/chore-instances`, `POST /api/chores/{id}/complete`, `/skip`, `PATCH /api/chore-instances/{id}`
- `GET/POST /api/todos`, `PATCH /api/todos/{id}`
- `GET /api/work-schedules`
- `GET /api/briefing` — powers the Home screen
- `GET /api/review?period=week|month|year`
- `POST /api/onboarding` — one-shot wizard submit

MCP tools (`/mcp`) wrap the service layer: `get_today`, `get_briefing`,
`add_event`, `add_todo`, `complete_todo`, `complete_chore`, `check_availability`.

## Storage & services

- **SQLite** — source of truth for all non-event data; the `event` table is a
  rebuildable cache of what lives in Radicale.
- **Radicale** (CalDAV) — the system of record for calendars. Tribo provisions
  managed collections (person/family/birthdays/chores) and writes events
  CalDAV-first. Required for calendar features.
- **Authentik** (OIDC) — Go backend validates tokens and maps `oidc_subject` →
  `FamilyMember` (or auto-provisions from group claims). An in-app profile
  switcher (optional PIN) lets someone choose which member's view they're using
  without a separate login per person.
