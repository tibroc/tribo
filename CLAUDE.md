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

_(fill in as the project is scaffolded)_

- Backend: `go run ./cmd/roost`
- Frontend dev server: `cd frontend && npm run dev`
- Full stack: `docker-compose up`
- Tests: `go test ./...`

## Current status

Milestone: **not started — begin with Milestone 1 in `docs/roadmap.md`**
