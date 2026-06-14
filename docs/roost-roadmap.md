# Roost — Implementation Roadmap

## How to use this

A suggested build order for Claude Code, broken into milestones that each end with something runnable via `docker-compose up`. Reference `roost-build-brief.md`, `roost-data-model.md`, `roost-architecture.md`, and the `*.jsx` design files throughout — they're the spec. Each milestone is a reasonable place to pause, review, and start a fresh session if needed.

---

## Milestone 1 — Scaffolding & vertical slice

**Goal:** prove the whole stack works end-to-end with one real screen.

- Go module structure per `roost-architecture.md` (`cmd/roost`, `internal/...`)
- React app (Vite + Tailwind) with the design tokens from `roost-build-brief.md` ported into a shared module
- SQLite schema: `Family`, `FamilyMember`, `CalendarSource`, `Event`, `EventAttendee` (minimal columns for now)
- Seed data: the four family members (Alberto/Hilda/Marie/Guilherme) + a week of sample events matching the prototypes
- REST: `GET/POST /api/events`, `GET /api/family-members`
- Port the Week view (`roost-week-view.jsx`) to consume the real API — both tablet grid and phone agenda layouts, using actual responsive breakpoints instead of the prototype's Phone/Tablet toggle
- `docker-compose.yml`: Caddy + Roost only

**Done when:** `docker-compose up` serves the Week view in a browser, showing seeded events from SQLite, correctly laid out on both a phone-width and tablet-width viewport.

---

## Milestone 2 — Remaining calendar views

- Extract shared components (`Card`, `NavIcon`, `EventChip`, `ViewSwitcher`, `PersonAvatar`, palette/fonts) into `frontend/src/components` and `frontend/src/lib`
- Day, Month, Quarter, Year views wired to the same Events API
- `ViewSwitcher` actually navigates between all five (Day–Year), with shared header/nav shell

**Done when:** all five calendar scales render real data with consistent navigation and shared components (no duplicated palette/Card/etc. across view files).

---

## Milestone 3 — Chores, To-dos, Family/Settings, Review

- `Chore`, `ChoreInstance`, `Todo` tables + API per `roost-data-model.md`
- Nightly job generating the next period's `ChoreInstance` rows
- Family/Settings screen (`roost-family-settings.jsx`) wired to real family members, chores, work schedules
- Home and Review screens wired to real chores/todos/events via briefing/review aggregation endpoints

**Done when:** checking off a chore or to-do in the UI persists, and shows up correctly in Review's consistency heatmap and Home's "last week" recap.

---

## Milestone 4 — Event form + guardian logic

- `WorkSchedule` table + API
- Guardian-assignment/conflict computation per the logic in `roost-data-model.md`
- Event form (`roost-event-form.jsx`) wired for create and edit; FAB opens it for new events, tapping an event chip opens it for editing
- Guardian card shows real assigned / unclaimed / conflict states based on actual work schedules and overlapping events

**Done when:** creating a "guardian needed" event for a child correctly auto-assigns a guardian, leaves it unclaimed, or flags a conflict — matching the three states designed in the prototype.

---

## Milestone 5 — Auth

- OIDC client against Authentik (authorization-code flow, session cookie)
- First-login step maps the Authentik `sub` claim to a `FamilyMember.oidc_subject`
- In-app profile switcher (+ optional PIN)

**Done when:** logging in via Authentik works, and switching the active profile changes the app's view without re-authenticating.

---

## Milestone 6 — Calendar sync + MCP

- CalDAV/Google sync workers (pull + push), ICS parsing
- Optional Radicale service in `docker-compose.yml` (profile-gated)
- Calendar source connect flow — new screen, design just-in-time
- MCP server exposing `get_today`, `get_briefing`, `add_event`, `add_todo`, `complete_todo`, `complete_chore`, `check_availability`

**Done when:** an external CalDAV calendar's events appear in Roost, and an MCP client can complete a chore or check availability.

---

## Milestone 7 — Onboarding wizard

- The 7-step wizard from `roost-build-brief.md`, re-runnable later from Family/Settings
- Starter chore / typical-week templates

**Done when:** a fresh instance with zero family members walks through setup to a populated Home screen.
