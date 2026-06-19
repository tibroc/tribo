# Roost — Architecture (Draft v1)

## Overview

One Go binary handles the REST API, the MCP server, and the embedded React frontend — Caddy just terminates TLS and proxies to it. SQLite is the single source of truth for everything (events, chores, todos, family data). Radicale is an optional, bundled CalDAV server that Roost treats like any other external calendar source — its only special role is being a zero-config "you now have a calendar server" option for people who don't already have one. Authentik is assumed to exist already (or be set up alongside) as the OIDC identity provider; Roost is a standard OIDC client (relying party) against it.

This keeps the always-on footprint to **two containers** (Caddy + Roost), with Radicale as a third, optional one.

---

## Components

### Caddy
- Reverse proxy + automatic HTTPS.
- Single `reverse_proxy` to the Roost container; a second route to Radicale only if it's enabled.

### Roost (Go binary)
- **API layer** — REST endpoints per the data model doc.
- **MCP server** — same process, separate route (e.g. `/mcp`), calls the same internal services as the REST layer.
- **Sync engine** — background workers syncing SQLite with external CalDAV/Google sources.
- **Scheduler** — in-process jobs (sync, chore-instance generation, conflict sweeps).
- **Embedded frontend** — the React production build is embedded into the binary via `go:embed` and served for all non-API routes (SPA fallback to `index.html`). No separate static file server needed.

### SQLite
- One file, mounted as a volume. Canonical store for events, family members, chores, todos, work schedules, calendar source configs.

### Radicale (optional)
- Lightweight Python CalDAV server, included in docker-compose behind a profile flag.
- From Roost's point of view it's just another `CalendarSource` of type `caldav` — nothing in the sync engine treats it specially.
- Useful because: (a) it gives non-technical users a working CalDAV endpoint to point their phones at, and (b) Roost can sync its own events *to* it, so "subscribe to the family calendar" works from any device's native calendar app.

### Authentik (external)
- Not part of this docker-compose by default — assumed to be an existing or separately-deployed instance, since self-hosters often share one IdP across many apps.
- Roost is registered as an OAuth2/OIDC application; standard authorization-code flow.

---

## Go backend package layout

```
/cmd/roost/main.go          — entrypoint, wiring, scheduler startup

/internal/api/               — HTTP handlers (events, chores, todos, family, briefing, review)
/internal/mcp/                — MCP tool definitions, thin wrappers over internal services
/internal/calendar/           — event CRUD, recurrence expansion, guardian/conflict logic, visibility tags
/internal/chores/             — chore definitions, instance generation, completion tracking
/internal/todos/
/internal/family/              — family members, work schedules, OIDC subject mapping
/internal/sync/                 — CalDAV/Google clients, ICS parsing, per-source sync workers
/internal/auth/                  — OIDC client, session handling
/internal/store/                  — SQLite access (migrations + queries)

/web/                              — embedded React production build (go:embed)
```

REST handlers and MCP tools both call into `internal/calendar`, `internal/chores`, `internal/todos` — business logic lives once, in the service layer.

## Frontend structure

```
/src
  /components   — shared UI: Card, NavIcon, EventChip, ViewSwitcher, PersonAvatar...
  /views         — Home, Day, Week, Month, Quarter, Year, Review, FamilySettings
  /lib            — API client, design tokens (palette, type scale)
  /App.tsx         — routing (5 calendar views share one route + tab state; Home, Review, Settings are separate routes)
```

The design tokens (`palette`, font stacks) used across the prototypes become a single shared module so every view stays visually consistent.

---

## Progressive Web App (PWA)

The frontend ships as an installable PWA so the family can add Tribo to a phone/tablet home screen and have it open offline.

- **Tooling:** `vite-plugin-pwa` (Workbox under the hood, `generateSW` mode). It emits `manifest.webmanifest`, `sw.js`, and the Workbox runtime into `web/dist`, which the Go binary serves via the same `go:embed` + SPA handler as the rest of the build — no separate static host.
- **Manifest:** standalone display, salvia theme (`#3E6259`), sand background (`#F1EBDE`), and icons (192 / 512 / 512-maskable) generated from the app's own leaf brand mark. Source SVG kept at `frontend/icon-source.svg` for regeneration; `frontend/public/` holds the rasterized output.
- **App-shell offline:** the hashed JS/CSS/HTML and the self-hosted fonts (Spectral + Figtree via `@fontsource`, no CDN) are precached, so the shell renders identically with no network. SPA deep links fall back to `index.html`, mirroring the server's own fallback.
- **Read-API offline:** a `NetworkFirst` runtime route (cache `tribo-api`, 3s timeout, 64 entries / 24h) serves last-known data for read-only `GET /api/*` when offline or slow, while always preferring the network when online. `/api/session` is **excluded** — auth/profile state must never be served stale; mutations (non-GET) are never cached.
- **Updates:** `registerType: 'prompt'` — a new build doesn't reload the page out from under the user. The `ReloadPrompt` component surfaces a "new version / reload" toast (and an offline-ready confirmation) via Workbox's `useRegisterSW`.
- **Server support (`internal/api/spa.go`):** registers `application/manifest+json` for `.webmanifest`, and serves `sw.js` / `registerSW.js` / `manifest.webmanifest` with `Cache-Control: no-cache` so clients detect new builds promptly (hashed assets still cache long-term).

---

## Auth: Roost as an OIDC client

- Standard OAuth2/OIDC authorization-code flow against Authentik (e.g. via `coreos/go-oidc` + a signed session cookie).
- On first login, an onboarding step maps the Authentik `sub` claim to a `FamilyMember.oidc_subject`.
- After login, an **in-app profile switcher** lets whoever's holding the device pick which family member's view they're using — this is separate from authentication, so kids don't need their own Authentik accounts. An optional PIN can gate switching to/from a given profile if desired.
- *(Alternative considered: Caddy `forward_auth` against an Authentik outpost, which would remove all OIDC code from Roost. Worth revisiting if you're already running outposts for other self-hosted apps — otherwise the OIDC-client approach above avoids that extra infrastructure.)*

## Sync engine

- SQLite is canonical. The sync engine's job is to keep it consistent with zero or more external `CalendarSource` rows (CalDAV, Google, or the bundled Radicale).
- One goroutine per source, on a configurable interval (default ~10 minutes):
  - **Pull**: fetch remote events (CalDAV `REPORT` / Google Events API), parse ICS, upsert into `Event` by `external_id`.
  - **Push**: events created/edited in Roost that belong to a two-way source are written back via CalDAV `PUT` / Google API.
- ICS parsing/generation via an existing Go library (e.g. `emersion/go-ical`) rather than hand-rolled.
- Conflict between a local edit and a remote edit: last-write-wins by timestamp for v1, with the losing version kept in `recurrence_exceptions`/a simple audit log for manual recovery — full merge UI is a later refinement.

## MCP server

- Same binary, separate route, using a Go MCP server library over HTTP (verify current recommended SDK at implementation time — this is a fast-moving spec).
- Initial tool set, each a thin wrapper over the service layer:
  - `get_today`, `get_briefing`
  - `add_event`, `add_todo`, `complete_todo`
  - `complete_chore`, `skip_chore`
  - `check_availability` (powers "who's free at 3pm Wednesday?")
- Auth: MCP clients authenticate the same way as the web frontend (OIDC token / session), scoped to one family member.

## Background jobs (in-process scheduler)

- **Calendar sync** — per source, ~10 min interval (configurable).
- **Chore instance generation** — nightly job creates the next period's `ChoreInstance` rows from each `Chore`'s recurrence rule.
- **Guardian conflict sweep** — periodic safety-net recompute, in addition to on-write recomputation when an event or work schedule changes.

---

## Docker-compose (v1)

```yaml
services:
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on: [roost]

  roost:
    build: .
    volumes:
      - roost_data:/data        # SQLite file lives here
    environment:
      - DATABASE_PATH=/data/roost.db
      - OIDC_ISSUER_URL=...
      - OIDC_CLIENT_ID=...
      - OIDC_CLIENT_SECRET=...

  radicale:                       # optional — enable via `--profile with-radicale`
    image: tomsquest/docker-radicale
    profiles: ["with-radicale"]
    volumes:
      - radicale_data:/data

volumes:
  caddy_data:
  roost_data:
  radicale_data:
```

## Build & deploy

- Multi-stage `Dockerfile`:
  1. Node stage builds the React app.
  2. Go stage embeds the built frontend (`go:embed`) and compiles a single static binary.
  3. Minimal runtime stage (distroless or alpine) containing just that binary.
- Result: one image, one volume for SQLite (+ Radicale's volume if enabled). Updates are a single image pull + restart.
