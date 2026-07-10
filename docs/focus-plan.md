# Tribo Focus & Priorities — Plan

A major release improving how guardians structure and prioritize tasks,
events, chores, and to-dos — designed first for neurodivergent (ADHD/autistic)
users. UI exploration: see the "Tribo focus & priorities — UI options" Claude
artifact (concepts A–D).

**Decided scope:** **A (Focus flow) + C (energy-aware picking) + D (transitions
& push)**. B (AI-pre-sorted Eisenhower planning board) is deferred to a
follow-up release — it plugs into the same queue once A exists. The Focus flow
**evolves the Home brief card** (no new nav section), and the queue **works
without an LLM** — deterministic ranking always; a configured assistant
upgrades ordering and writes the "why" lines.

## Design principles (the ND lens)

- **Outsource the sorting.** Deciding what's first is the impaired function —
  the app ranks, the human does.
- **One thing at a time.** One NOW card, two NEXT rows, everything else hidden
  on purpose behind a count.
- **Make time visible.** Countdowns to hard anchors (leaving times), not
  abstract due dates.
- **Predictable transitions.** Same pings at the same relative times; warnings
  before context switches; never during quiet hours.
- **Defer without guilt.** "Not now" reshuffles silently, logs for the weekly
  review instead of nagging.
- **Meet the day's energy.** Low-energy mode surfaces small wins; heavy tasks
  wait visibly without shame.

## Phase F1 — Priority model + deterministic focus queue + Home UI (concept A)

### Data (migration 0008)

- `todo`: `importance INTEGER DEFAULT 0` (0 normal / 1 important),
  `effort TEXT CHECK (effort IN ('2min','5min','standard','heavy')) DEFAULT 'standard'`,
  start actually using `due_date`; `anchor_event_id TEXT NULL` (task tied to an
  event — "before Soccer pickup").
- `chore`: `effort` (same enum).
- `focus_defer(id, item_kind 'todo'|'chore'|'event', item_id, member_id,
  deferred_at)` — the guilt-free "not now" log; feeds Review later.

### Queue engine (`internal/focus`)

- Candidates for the acting guardian's day: unclaimed `needs_guardian` events
  (always rank first), anchored tasks (by anchor time), due-dated to-dos
  (overdue → today → soon), today's pending chores, important to-dos.
- **Deterministic ranking**: conflicts → anchors → due → importance → smaller
  effort first. Deferred items drop out until the next period.
- **Next hard anchor**: the next event needing this guardian (attendee, claimed
  pickup, or family event), with a leaving-time buffer (fixed default, e.g.
  20 min; per-event override later).
- API:
  - `GET /api/focus?energy=low|ok|high` →
    `{ now, next[2], laterCount, later[]?, anchor {label, at, leaveAt} }` —
    each item `{kind, id, title, why, memberId?, effort, at?}`.
  - `POST /api/focus/defer {kind, id}` — hide for the rest of the period + log.
- **LLM upgrade** (when the assistant is configured): the deterministic queue
  is handed to the assistant to re-rank within guardrail bounds (conflicts stay
  first) and to write the one-line "why" per item, cached like briefs and
  regenerated on data changes. Unconfigured ⇒ template "why" strings
  ("due tomorrow · 5 min").

### Home UI

- `BriefCard` evolves into the **Focus card**: NOW hero (title, why, countdown,
  big "I've got it" / "Not now"), NEXT (2 rows), "＋N more today — hidden on
  purpose · show". Watch-out callout stays (from the brief); praise becomes the
  momentum line (see F2).
- **Anchor countdown pill** pinned above the bottom nav on Home: "Leave for
  Soccer pickup · 3:40 PM · in 2h 05m". Ticks client-side.
- Effort/importance/due editable in the to-do row editor and chore form
  (compact pills, not more form fields than necessary).

## Phase F2 — Energy-aware picking (concept C)

- Energy selector (Running low / Okay / Plenty) on the Focus card; per-device,
  session-scoped (localStorage), never stored server-side — it's a private
  signal.
- `low` filters the queue to `2min`/`5min` items ("three small wins"), `plenty`
  boosts heavy tasks. Heavy items collapse into a "waiting for a better day"
  group instead of disappearing.
- Momentum line: "N wins today — size doesn't count" (counts completions today
  for the acting member, any size).
- Effort defaults: the assistant estimates effort for existing items once
  (optional backfill); one-tap correction in the row editor.

## Phase F3 — Transitions & push (concept D)

- **Self-hosted Web Push** (VAPID): keys from `VAPID_PUBLIC_KEY` /
  `VAPID_PRIVATE_KEY` env, or auto-generated on first boot and stored in the
  DB. Go library: `webpush-go` (new dependency). The PWA service worker gains a
  `push` handler; subscription happens from the notification settings sheet
  (per member, per device).
- Data: `push_subscription(id, member_id, endpoint, p256dh, auth, created_at)`,
  `notification_pref(member_id, morning_brief, brief_hour, transitions,
  second_nudge, quiet_start, quiet_end)`. Defaults: brief + transitions on,
  chores never ping.
- **Send scheduler** (in-process, 1-min tick): morning brief at the member's
  hour; transition warnings at leaving-time − 15 min (and − 5 min for pickups
  when second-nudge is on); quiet hours suppress everything; dedupe per
  (event, member, offset).
- **Wording is part of the design**: what's next and when to move, never
  "you're late"; includes what comes after ("After that, nothing until dinner
  at 6") for predictability. Localized (en/de/ptBR).
- Caveat: iOS requires the PWA installed to the Home Screen for push — document
  in settings.

## Out of scope (this release)

- **B — Eisenhower planning board** (weekly ritual, AI pre-sorted, drag to
  correct, "deferred 3× — drop it?"): follow-up; consumes the same
  importance/effort/defer data.
- Focus data in Review (defer patterns, momentum history) beyond the raw log.
- Per-child focus views; visual timers/body-doubling; travel-time via maps.

## Open questions

1. Leaving-time buffer: fixed 20-min default with a per-event override field,
   or a family-level setting first?
2. Should completing the NOW card auto-advance ("next up: …") with a beat of
   celebration, or return to the queue?
3. Does the anchor pill show on all screens or Home only (start: Home only)?
4. Morning-brief push content: reuse the day brief's priorities verbatim?
