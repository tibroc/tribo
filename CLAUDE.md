# Roost

Self-hosted, family-centered organizer. Go backend + SQLite, React frontend, Caddy reverse proxy, optional bundled Radicale (CalDAV), Authentik for OIDC login, MCP server for AI assistant integration. Single-family instance — keep the architecture simple.

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
- SQLite only — no additional database services.
- Radicale is treated as just another `CalendarSource`; nothing in the sync engine should special-case it.

## Commands

- Backend (API + embedded SPA): `go run ./cmd/tribo` (serves on `:8080`, SQLite at `./tribo.db`)
- Frontend dev server: `cd frontend && npm run dev` (proxies `/api` → `:8080`)
- Frontend build (emits to `web/dist` for `go:embed`): `cd frontend && npm run build`
- Full stack: `docker-compose up` → http://localhost:8080
- Tests: `go test ./...`

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
  re-runnable from Family → Settings. `TRIBO_SEED=false` leaves a fresh instance
  empty so the wizard runs.

**Post-roadmap follow-ups (done):** unclaimed-event claim action
(`/api/events/{id}/claim` + free-guardian buttons); work-schedule busy stripes
(Day/Week) with a persisting toggle; Family/Settings CRUD for members, work
schedules, and chores (`SettingsForms.tsx`); Google Calendar sync (OAuth connect
flow `/api/calendar-sources/google/connect` → `/auth/google/callback`, pull +
push via `google.golang.org/api/calendar/v3`, configured via `GOOGLE_*` env).

**Caveats:** OIDC login and Google Calendar sync aren't exercised in-repo (no
Authentik / Google OAuth client here) — the configured/unconfigured and
state-rejection paths are tested, but the live token round-trips need real
providers. `/mcp` is unauthenticated in dev — gate it behind a token/proxy in
production.
