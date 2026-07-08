# Tribo — Architecture

> Historical note: the app was renamed **roost → tribo**. The Go module is
> `tribo`, the binary is `cmd/tribo`, the DB defaults to `tribo.db`. This doc
> keeps its original `roost-` filename (see CLAUDE.md).

## Overview

One Go binary handles the REST API, the MCP server, and the embedded React
frontend — Caddy just terminates TLS and proxies to it. **Radicale (CalDAV) is
the system of record for all calendar events;** SQLite is the source of truth for
everything else (family members, chores, todos, work schedules, sessions,
calendar-source configs). Authentik is assumed to exist already (or be set up
alongside) as the OIDC identity provider; Tribo is a standard OIDC relying party
against it.

The always-on footprint is **three containers**: Caddy, Tribo, and Radicale.
Radicale is bundled and turnkey (auth generated from env, only reachable on the
internal compose network) but you can point `RADICALE_URL` at your own CalDAV
server instead.

---

## Data-flow model (read this first)

- **Calendars require Radicale.** Tribo provisions a set of *managed* CalDAV
  collections (one per person, plus family / birthdays / chores) and treats them
  as the canonical store. Without a reachable Radicale, calendar features are
  disabled and the app surfaces a banner; the rest of Tribo still runs.
- **Events are written CalDAV-first.** Create/edit/delete does a `PUT`/`DELETE`
  to the owning collection first (15s write timeout), then upserts the SQLite
  `event` row. The `event` table is a **disposable cache**, rebuilt wholesale
  from sync — never the source of truth.
- **Tribo-only fields ride along as `X-TRIBO-*` iCal properties** (visibility
  tag, icon, color override, guardian assignment, etc.), so a round-trip through
  CalDAV preserves them and any standards-compliant client can still read the
  event.
- **Stable identity is the CalDAV UID.** Pull parses ICS, rebuilds the cache
  keyed by UID, and recomputes guardian assignment/conflict for the affected
  window.
- **Floating (zoneless) iCal times are interpreted in the family timezone**
  (`family.timezone`) so wall-clock and guardian math are independent of the
  server's TZ.
- **Birthdays and chore instances are projected** into the cache as discrete
  all-day events (no RRULE): birthdays from `family_member.date_of_birth`, chores
  from `chore_instance`. All-day events never count toward a guardian being
  "busy".

---

## Components

### Caddy
- Reverse proxy + automatic HTTPS. Single `reverse_proxy` to the Tribo container.
- Radicale is **not** proxied through Caddy — it stays on the internal network.

### Tribo (Go binary)
- **API layer** (`internal/api`) — REST endpoints per the data-model doc.
- **MCP server** (`internal/mcp`) — same process, mounted at `/mcp`, calls the
  same internal service packages as the REST layer.
- **Sync engine** (`internal/calsync`) — CalDAV pull/push + Google pull, managed-
  calendar provisioning, cache rebuild.
- **Scheduler** — in-process jobs (per-source sync ticker, nightly chore-instance
  generation).
- **Embedded frontend** — the React production build is embedded via `go:embed`
  and served for all non-API routes (SPA fallback to `index.html`).

### SQLite
- One file, mounted as a volume. Canonical store for family members, chores,
  chore instances, todos, work schedules, calendar-source configs, and sessions.
  The `event` table is a rebuildable cache of what lives in Radicale.

### Radicale (required for calendars)
- Lightweight Python CalDAV server, bundled in docker-compose (owner-only rights,
  htpasswd auth generated at startup from `RADICALE_USER`/`RADICALE_PASSWORD`).
- Tribo provisions and owns its managed collections here and writes events to it
  first. Any device's native calendar app can subscribe to these collections.
- Configured via `RADICALE_URL`/`RADICALE_USER`/`RADICALE_PASSWORD` (env only,
  never the UI).

### Authentik (external)
- Not part of this docker-compose by default — assumed to be an existing or
  separately-deployed instance, since self-hosters often share one IdP.
- Tribo is registered as an OAuth2/OIDC application; standard authorization-code
  flow.

---

## Go backend package layout

```
/cmd/tribo/main.go          — entrypoint, wiring, migration + scheduler startup

/internal/api/               — HTTP handlers (events, chores, todos, family, briefing, review, calendar-status)
/internal/mcp/                — MCP tool definitions, wrappers over the service layer
/internal/calendar/           — event CRUD (CalDAV-first via calsync), guardian/conflict logic, visibility tags
/internal/chores/             — chore definitions, instance generation, completion tracking
/internal/todos/
/internal/family/              — family members, work schedules, OIDC subject mapping
/internal/calsync/              — CalDAV/Google clients, ICS parse/generate, managed-calendar provisioning, per-source workers
/internal/auth/                  — OIDC client, sessions, group-based provisioning
/internal/weather/                — open-meteo lookup for the header widget
/internal/store/                   — SQLite access (migrations + queries), seed

/web/                               — embedded React production build (go:embed)
```

REST handlers and MCP tools both call into `internal/{calendar,chores,todos,
family}` — business logic lives once, in the service layer. (Known drift: MCP's
`check_availability` currently reimplements free/busy rather than calling the
guardian logic — see the review notes; converging them is a tracked follow-up.)

## Frontend structure

```
/src
  /components   — shared UI: Card, NavIcon, EventChip, ViewSwitcher, PersonAvatar, AppShell, ProfileSwitcher...
  /views         — Home, Calendar (Day/Week/Month/Quarter/Year), Chores, To-dos, Family/Settings, Review, onboarding
  /lib            — API client, design tokens (tokens.ts), calendar math, i18n, theme, session, time-format
  /App.tsx         — gate (loading → login → onboarding → profile-mapping → app) + top-level section router
```

Design tokens live in `lib/tokens.ts` as a thin compatibility layer over the
canonical `--t-*` CSS variables in `index.css`, so every view stays visually
consistent. The UI is localized (i18next) with `en` / `de` / `ptBR` locales and a
12h/24h time-format preference.

---

## Progressive Web App (PWA)

The frontend ships as an installable PWA so the family can add Tribo to a phone/
tablet home screen and have it open offline.

- **Tooling:** `vite-plugin-pwa` (Workbox, `generateSW` mode). It emits
  `manifest.webmanifest`, `sw.js`, and the Workbox runtime into `web/dist`, which
  the Go binary serves via the same `go:embed` + SPA handler as the rest of the
  build.
- **Manifest:** standalone display, salvia theme (`#3E6259`), sand background
  (`#F1EBDE`), and icons (192 / 512 / 512-maskable). Source SVG kept at
  `frontend/icon-source.svg`; `frontend/public/` holds the rasterized output.
- **App-shell offline:** hashed JS/CSS/HTML and self-hosted fonts (Spectral +
  Figtree via `@fontsource`, no CDN) are precached; SPA deep links fall back to
  `index.html`.
- **Read-API offline:** a `NetworkFirst` runtime route (cache `tribo-api`, 3s
  timeout, 64 entries / 24h) serves last-known data for read-only `GET /api/*`
  when offline. `/api/session` is **excluded** (auth/profile state must never be
  stale); mutations are never cached.
- **Updates:** `registerType: 'prompt'` — the `ReloadPrompt` component surfaces a
  "new version / reload" toast rather than reloading out from under the user.
- **Server support (`internal/api/spa.go`):** registers
  `application/manifest+json` for `.webmanifest`, and serves `sw.js` /
  `registerSW.js` / `manifest.webmanifest` with `Cache-Control: no-cache`.

---

## Auth: Tribo as an OIDC client

- Standard OAuth2/OIDC authorization-code flow against Authentik (`coreos/go-oidc`
  + a signed session cookie).
- **Dev/disabled mode:** when `OIDC_ISSUER_URL` is unset (or discovery fails),
  auth is disabled — no login, and the session only tracks the active profile.
- On first login the Authentik `sub` maps to a `FamilyMember.oidc_subject`.
  **Group-based provisioning** can auto-create the member with a role derived from
  the user's OIDC group claims (`OIDC_GROUPS_CLAIM` / `OIDC_GUARDIAN_GROUPS` /
  `OIDC_CHILD_GROUPS`, optional `OIDC_GROUPS_SCOPE`). On a fresh DB (zero members)
  the onboarding wizard runs instead and links the caller via `selfMemberIndex`.
- After login, an **in-app profile switcher** lets whoever's holding the device
  pick which family member's view they're using (separate from authentication, so
  kids don't need their own Authentik accounts). Switching to/from a profile can
  be gated by an optional PIN (`FamilyMember.pin`).
- `Protect` middleware guards `/api/*`; `/auth/*` and `/api/session*` stay open.
  **`/mcp` is currently unauthenticated** — gate it behind a token/proxy in
  production.

## Sync engine (`internal/calsync`)

- Radicale is canonical for events; the engine keeps the SQLite `event` cache and
  the managed collections consistent, and pulls from any external CalDAV/Google
  sources.
- **Provisioning:** `EnsureManagedCalendars` (re)creates the per-person / family /
  birthdays / chores collections via a raw `MKCALENDAR` helper.
- **Pull:** fetch remote events (CalDAV `REPORT` / Google Events API), parse ICS,
  rebuild the cache keyed by CalDAV UID, recompute guardians.
- **Push:** events created/edited in Tribo are written CalDAV-first via `PUT` /
  `DELETE` to the owning managed collection (Tribo fields as `X-TRIBO-*` props).
- **Window:** the sync window covers a rolling ±1 year and **grows on demand** as
  the user navigates further out (`Engine.EnsureWindow`, called from
  `GET /api/events`). Birthdays are materialized for every year in the window;
  projected chores are only generated for the near term (≈ −1mo..+3mo), so distant
  years show events/birthdays but not chores.
- **Google** is optional, **read-only, and per-person** (the member is added as an
  attendee so the overlay picks up their color). Never pushed. Configured via
  `GOOGLE_*` and connected per-person through the OAuth flow.
- Credentials for external sources are **AES-GCM-encrypted at rest**
  (`CREDENTIALS_KEY`, falling back to `SESSION_SECRET`).
- ICS parse/generate via `emersion/go-ical` + `emersion/go-webdav`.

## MCP server (`internal/mcp`)

- Same binary, mounted at `/mcp`, using `modelcontextprotocol/go-sdk` over HTTP.
- Tool set, each a wrapper over the service layer:
  - `get_today`, `get_briefing`
  - `add_event`, `add_todo`, `complete_todo`
  - `complete_chore`
  - `check_availability` (powers "who's free at 3pm Wednesday?")
- **Auth:** unauthenticated in dev — see the auth section. In production put it
  behind a token/proxy.

## Background jobs (in-process scheduler)

- **Calendar sync** — per source, ~10-min ticker (one goroutine per source).
- **Chore-instance generation** — nightly job creates the next period's
  `ChoreInstance` rows from each `Chore`'s recurrence rule.
- **Guardian conflict recompute** — on every event create/edit/delete and on
  sync, over the affected window. (Note: work-schedule and member changes do
  *not* yet trigger a recompute — tracked follow-up.)
- **One-time internal→Radicale migration** — `MigrateInternalToRadicale` runs at
  startup and is idempotent (a no-op once no legacy `type='internal'` sources
  remain). It exists for instances created before the calendar refactor.

---

## Docker-compose

The shipped `docker-compose.yml` runs three services — `caddy`, `tribo`,
`radicale` — with `tribo` gated on a Radicale healthcheck. Tribo runs from the
GHCR image (`ghcr.io/tibroc/tribo`, pin via `TRIBO_TAG`) or a local `build: .`.
Radicale generates its bcrypt htpasswd from `RADICALE_USER`/`RADICALE_PASSWORD`
at startup and is never published to the host. See the file's inline comments for
the full env surface (DB path, seed toggle, OIDC, Radicale, credentials key,
Google). Volumes: `caddy_data`, `caddy_config`, `tribo_data`, `radicale_data`.

## Build & deploy

- Multi-stage `Dockerfile`:
  1. Node stage builds the React app.
  2. Go stage embeds the built frontend (`go:embed`) and compiles a single static
     binary (`cmd/tribo`).
  3. Minimal runtime stage containing just that binary.
- Result: one image, one volume for SQLite (+ Radicale's volume). Updates are a
  single image pull + restart.
