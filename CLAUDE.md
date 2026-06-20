# Roost

Self-hosted, family-centered organizer. Go backend + SQLite, React frontend, Caddy reverse proxy, Radicale (CalDAV) as the calendar backend, Authentik for OIDC login, MCP server for AI assistant integration. Single-family instance — keep the architecture simple.

## Start here

- `docs/roadmap.md` — build order. Work through milestones in sequence; update "Current status" below as you complete each one.
- `docs/build-brief.md` — design system (colors, type, shared UI patterns), screen inventory, and pointers into the data model and architecture.
- `docs/data-model.md` — entity definitions, especially the guardian-assignment/conflict logic and `visibility_tag` rules.
- `docs/architecture.md` + `docs/architecture.mermaid` — service layout, Go package structure, sync engine, MCP server.
- `docs/design/*.jsx` — UI prototypes. Port these faithfully: replace hardcoded sample data with real API calls, and replace the prototypes' Phone/Tablet toggle + scroll-wrapper with real responsive breakpoints.

## Conventions

- Design tokens (palette, fonts) live in `frontend/src/lib/tokens.ts` — single source of truth, don't redefine colors per-component.
- Shared UI components (Card, NavIcon, EventChip, ViewSwitcher, PersonAvatar) live in `frontend/src/components/`.
- Go packages per `docs/architecture.md`: business logic lives in `internal/{calendar,chores,todos,family}`; both REST handlers (`internal/api`) and MCP tools (`internal/mcp`) call into these — no duplicated logic.
- **Radicale (CalDAV) is the calendar system of record.** All calendars
  (per-person, family, birthdays, chores) are collections Tribo provisions on a
  Radicale server configured via `RADICALE_URL`/`RADICALE_USER`/`RADICALE_PASSWORD`
  (env, never the UI). Events are written CalDAV-first; the SQLite `event` table
  is a disposable cache rebuilt from sync, with Tribo-only fields carried as
  `X-TRIBO-*` iCal props. Calendars hard-require Radicale; without it they're
  disabled (the rest of the app still runs). See the calendar-refactor plan/commits.
- SQLite is the source of truth for everything *except* calendar events (members,
  chores, todos, work schedules, sessions). No additional database services.
- Google Calendar is an optional, read-only, per-person overlay (pulled, never pushed).

## Commands

- Backend (API + embedded SPA): `go run ./cmd/tribo` (serves on `:8080`, SQLite at `./tribo.db`)
- Frontend dev server: `cd frontend && npm run dev` (proxies `/api` → `:8080`)
- Frontend build (emits to `web/dist` for `go:embed`): `cd frontend && npm run build`
- Full stack: `docker-compose up` → http://localhost:8080
- Tests: `go test ./...`

## Browser testing

The chrome-devtools-mcp / playwright MCP servers launch the "chrome" channel,
which resolves to `/opt/google/chrome/chrome` — not installed by default on this
Fedora box. A working Chromium lives at `/usr/bin/chromium-browser`, so symlink
it to the expected path (one-time, needs sudo):

```bash
sudo mkdir -p /opt/google/chrome
sudo ln -sf /usr/bin/chromium-browser /opt/google/chrome/chrome
```

After that, the `verify`/`run` skills and the browser MCP tools can drive the
live app. Smoke test: run the backend + `npm run dev`, then the seeded instance
shows a "1" notification-bell badge (Soccer needs a guardian) and a Lisbon
weather pill.

> Note: the app was renamed **roost → tribo**. Go module is `tribo`, binary is
> `cmd/tribo`, DB defaults to `tribo.db`. The `docs/roost-*.md` design files keep
> their original filenames.

## Current status

**All 7 roadmap milestones complete.**

- **M1** — Go backend (layout per `docs/roost-architecture.md`), SQLite schema +
  migration + seed (Silva family, a week of events, plus year-spanning milestone
  birthdays/holidays), REST `GET/POST /api/events` + `GET /api/family-members`,
  embedded SPA.
- **M2** — Shared components in `frontend/src/components/` (`AppShell`, `Card`,
  `NavIcon`, `EventChip`, `ViewSwitcher`, `PersonAvatar`) and shared
  `lib/calendar.ts` (date math, grouping, `colorForEvent`). All five views
  (`Day`, `Week`, `Month`, `Quarter`, `Year`) render real API data through one
  `CalendarPage` orchestrator that owns view + cursor state; the `ViewSwitcher`
  navigates between them and the header's prev/next/Today step by the active
  period. No palette/Card/shell duplication across views.

- **M3** — `Chore`, `ChoreInstance`, `Todo`, `WorkSchedule` tables (migration
  `0002`) + services. APIs: `GET/POST /api/chores`, `GET /api/chore-instances`,
  `POST /api/chores/{id}/complete|skip`, `PATCH /api/chore-instances/{id}`,
  `GET/POST /api/todos` + `PATCH /api/todos/{id}`, `GET /api/work-schedules`,
  and the aggregation endpoints `GET /api/briefing` (Home) + `GET /api/review`
  (hero stats, per-person streaks, 8-week consistency heatmap, YTD). In-process
  nightly scheduler generates the upcoming period's chore instances; seed
  includes 8 weeks of history. Frontend: top-level section routing
  (Home/Calendar/Chores/To-dos/Family/Review) via a refactored `AppShell` +
  `chrome.tsx` headers; Home, Family/Settings, Review screens; Day/Week panels
  and dedicated Chores/To-dos screens wired to real data — checking off a chore
  or to-do persists and shows in Review's heatmap and Home's recap.

- **M4** — Guardian assignment/conflict logic in `internal/calendar/guardian.go`
  (free = no overlapping event-as-attendee and no overlapping work-schedule;
  one free → assign; many free → child's default guardian if free else
  first-claim; zero free → `needs_guardian`). Cached `assigned_guardian_id`/
  `conflict_status` recompute over the affected window on every event
  create/edit/delete. New endpoints: `PATCH/DELETE /api/events/{id}`,
  `GET /api/calendar-sources`. Frontend: `EventForm` modal (create/edit/delete,
  attendee toggles, all-day, Important→milestone, live guardian card) opened by
  the calendar FAB and by tapping an event; conflict events show a warning badge
  on their chip. Seed flags Soccer (→assigned) and Piano (→conflict) to demo.

- **M5** — `internal/auth`: OIDC relying-party (coreos/go-oidc + oauth2,
  authorization-code flow) with an HMAC-signed session cookie. First login maps
  the Authentik `sub` to a `FamilyMember.oidc_subject`; an in-app profile
  switcher (PIN-gated via `FamilyMember.pin`) changes the active profile without
  re-auth. `Protect` middleware guards `/api/*`; `/auth/*` + `/api/session*` stay
  open. Config via `OIDC_ISSUER_URL`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`/
  `OIDC_REDIRECT_URL`/`SESSION_SECRET`. **When `OIDC_ISSUER_URL` is unset (or
  discovery fails) auth runs in dev/disabled mode** — no login, session tracks
  only the active profile. Frontend: `SessionProvider` + gate (login →
  first-login mapping → app), `ProfileSwitcher` in the rail/bottom bar. Seed sets
  Marie's PIN to `1234` to demo the gate.
  - **Group-based provisioning** (`internal/auth/provision.go`): when OIDC is
    enabled, first login auto-creates a `FamilyMember` whose role is derived from
    the user's OIDC group claims — no onboarding wizard. Config:
    `OIDC_GROUPS_CLAIM` (default `groups`), `OIDC_GUARDIAN_GROUPS` (default
    `guardian`), `OIDC_CHILD_GROUPS` (default `children,child`), and optional
    `OIDC_GROUPS_SCOPE` (extra scope to request the claim). Users in no
    configured group are not auto-created — they fall through to the manual
    map-profile screen. The wizard still runs in dev/disabled mode (no OIDC).

- **M6** — `internal/calsync`: CalDAV sync (pull via REPORT + push via PUT,
  emersion/go-webdav + go-ical), credentials AES-GCM-encrypted at rest
  (`CREDENTIALS_KEY`/`SESSION_SECRET`). Per-source goroutine on a 10-min ticker;
  source CRUD `POST/DELETE /api/calendar-sources` + `/{id}/sync`; push triggered
  on event create/edit for writable sources. Google sync is scaffolded (returns
  "not implemented"). `internal/mcp`: MCP server (modelcontextprotocol/go-sdk) at
  `/mcp` exposing `get_today`, `get_briefing`, `add_event`, `add_todo`,
  `complete_todo`, `complete_chore`, `check_availability`. Frontend: Family/
  Settings Calendars section lists real sources with add (CalDAV connect modal),
  sync-now, and remove. **Verified end-to-end against a real Radicale (podman):**
  pull (external event appears in Tribo) and push (Tribo event appears in
  Radicale); MCP tools tested via an in-process client.

- **M7** — Onboarding wizard (`OnboardingWizard.tsx`): 7 steps (welcome →
  family basics → members → calendar → starter chores → typical week → done),
  one-shot `POST /api/onboarding` creating family, members (+ default guardians),
  internal calendar sources, starter chores (+ instances), and a typical week of
  recurring events. Shown automatically when no members exist (gated in `App`);
  re-runnable from Family → Settings. A fresh instance starts empty so the
  wizard runs; set `TRIBO_SEED=true` to load the Silva family example data.

**Post-roadmap follow-ups (done):** unclaimed-event claim action
(`/api/events/{id}/claim` + free-guardian buttons); work-schedule busy stripes
(Day/Week) with a persisting toggle; Family/Settings CRUD for members, work
schedules, and chores (`SettingsForms.tsx`); Google Calendar sync (OAuth connect
flow `/api/calendar-sources/google/connect` → `/auth/google/callback`, pull +
push via `google.golang.org/api/calendar/v3`, configured via `GOOGLE_*` env).

**Calendar backend refactor (done — Radicale is now the system of record):**
6 phases on `feature/radicale-backend`. (1) `RADICALE_*` env + a raw MKCALENDAR
helper + `EnsureManagedCalendars` provisioning per-person/family/birthdays/chores
collections + require-Radicale gating + `GET /api/calendar-status`. (2) CalDAV-first
event CRUD (`calendar.EventBackend` → `calsync`): PUT/DELETE to the owning
collection first, then upsert the disposable cache; Tribo fields ride as
`X-TRIBO-*` props; pull rebuilds the cache (stable id = CalDAV UID) and recomputes
guardians; 15s write timeout. (3) birthdays from `family_member.date_of_birth` +
chore-instance projection, as discrete all-day events (no RRULE). (4) Google forced
read-only + per-person (member as attendee for color). (5) frontend: EventForm
**calendar picker** (the "modal does nothing" fix), member DOB field, Family
calendars UI (managed read-only + Google connect-for-person), no-Radicale banner.
(6) one-time migration of legacy `internal`-source events onto Radicale + seed/
onboarding updates + docs. Notes: floating iCal times are parsed in the **family
timezone** (`family.timezone`) so wall-clock/guardian math is server-TZ-independent;
all-day events don't count toward guardian "busy". Verified end-to-end vs a live
Radicale (podman) incl. create/edit/delete round-trip, cache rebuild, birthdays,
and the Soccer→Hilda / Piano→conflict guardian demo.

**Caveats:** OIDC login and Google Calendar sync aren't exercised in-repo (no
Authentik / Google OAuth client here) — the configured/unconfigured and
state-rejection paths are tested, but the live token round-trips need real
providers. The
CalDAV sync window covers a rolling ±1 year and **grows on demand** as the user
navigates further out (`Engine.EnsureWindow`, called from `GET /api/events`);
birthdays are materialized for every year in the window. Projected chores are
still only generated for the near term (≈-1mo..+3mo), so distant years show
events/birthdays but not chores. `/mcp` is unauthenticated in dev — gate it
behind a token/proxy in production.
