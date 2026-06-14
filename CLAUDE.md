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

Milestone: **2 complete.**

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

Next: **Milestone 3** (Chores, To-dos, Family/Settings, Review + nightly chore
instance generation). The chores/todos panels in Day/Week are still static
placeholders until then.
