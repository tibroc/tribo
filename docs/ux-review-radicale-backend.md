# UX/UX review — `feature/radicale-backend`

Triage of functionality that is buggy, confusing, or overly complicated after the
Radicale calendar-backend refactor. Findings are for **later rounds** — nothing
here is fixed yet. Severity: **P1** (broken/visibly wrong), **P2** (confusing or
incomplete), **P3** (polish). Evidence marked _[seen live]_ was confirmed in the
running app (seeded, against a live Radicale); the rest is from code review.

## Priority summary

> **Round 1 done:** A and A1 are fixed — chores no longer sync into the event
> cache (they stay on the Radicale chores collection for external clients), and
> WeekView routes events to a row per attendee (birthdays now show in the person's
> row/color, not the gold Family row). See the round-1 commit.

| # | Area | Sev | One-liner |
|---|------|-----|-----------|
| A | ~~Chores-as-calendar-events~~ ✅ | **P1** | ~~Projected chores flood the calendar and bury real events~~ done |
| A1 | ~~WeekView all-day rendering~~ ✅ | **P1** | ~~Chore chips title-less/gold in Family row~~ done (routing by attendee) |
| A2 | Chore status not projected | **P2** | Done/skipped chores look identical to pending on the calendar |
| A3 | Stale chore/birthday objects | **P2** | Deleted instances/cleared DOBs leave orphans on Radicale |
| A4 | Distant-year chores missing | **P2** | EnsureWindow grows events but never re-projects chores |
| B | EventForm gaps | **P2** | Edit-source not explained; no external-attendees UI; guardian gating hidden |
| C | Onboarding | **P2** | No DOB collected → birthdays never generate; stale calendar-step copy |
| D | Family → Calendars | **P2/P3** | Dual connect flows; weak banners; managed vs. manual not distinct |
| E | DayView all-day | **P2** | All-day events (birthdays, chores) invisible in the Day timeline |
| F | Timezone / timestamp correctness | **P2** | Browser-TZ vs family-TZ drift; mixed-offset string compares |
| G | Sync scaling | **P3** | Full-refresh re-pulls the whole growing window each tick |
| H | Migration drops RRULE | **P2** | Recurring internal events become one-offs when migrated |
| I | Misc polish | **P3** | Dead i18n keys, no-attendee color, MCP source selection, etc. |

---

## A. Chores as calendar events — the biggest problem _[seen live]_

The refactor projects every chore instance as an all-day VEVENT, which syncs back
into the event cache and renders on the calendar **in addition to** the dedicated
Chores page. The result actively degrades the calendar:

- **Month view**: every day shows "Set the table" (daily rotation chore) as its
  first chip, and Mondays show "Mow the lawn"/"Clean the bathroom" + "**+7 more**".
  Real events (Soccer, School, Dentist, birthdays) are pushed under the "+N more"
  fold. _[seen live: June 2026 month view]_
- **Week view**: weekly chores are 7-day all-day events; they render as a stack of
  bars in the "Family" row, and the week's "13 shared plans" counter is inflated
  by chores. _[seen live]_
- **Double representation**: the same chore appears on the calendar grid **and** in
  the right-rail / Chores-page checklist — unclear which is the source of truth or
  where to check it off.

**Decision needed (drives the fix):** should chores appear on the calendar at all?
Options: (a) don't sync the Chores collection into the event cache — keep chores
only on the Chores page (Radicale Chores collection still exists for external
clients); (b) render chores in a distinct, collapsible "chores" lane (like the
work-schedule busy stripes) rather than as EventChips; (c) keep them but make them
visually subordinate and exclude from "+N more" counts. Recommendation: **(a) or
(b)** — chores crowding out real events is the core regression.

Relevant code: `internal/calsync/autocontent.go` (`ProjectChores`), the chores
source flowing through `syncCalDAV`, `frontend/src/views/{Month,Week,Day}View.tsx`,
`lib/calendar.ts`.

### A1. WeekView all-day chips are title-less + mis-routed _[seen live]_ — **P1**
In Week view the projected chore events render as **blank "ALL DAY" bars with no
title**, colored gold, and grouped into the **Family** row — even though the events
carry the correct attendee (verified: "Mow the lawn" → `mem-alberto`, "Clean the
bathroom" → `mem-hilda`). So an Alberto chore shows up gold in the Family row with
no label. Two bugs: (1) all-day events ignore the attendee for color/row routing in
WeekView; (2) the all-day chip renders without its title. `frontend/src/views/WeekView.tsx`,
`components/EventChip.tsx`, `lib/calendar.ts colorForEvent`.

### A2. Projected chores never reflect completion status — **P2**
`ProjectChores` (`autocontent.go:~138`) selects title/dates/member/color but **not
`ci.status`**, so done/skipped/pending chores look identical on the calendar. Encode
status (e.g. `X-TRIBO-STATUS`) and reflect it, or don't show completed chores.

### A3. Stale projected objects are never pruned — **P2**
`ProjectChores`/`RefreshBirthdays` only PUT; nothing deletes objects for chore
instances that were removed or birthdays for a cleared DOB. `DeleteMemberBirthday`
only clears `currentYear±2`, but `RefreshBirthdays` now generates for the **entire
(growing) sync window** — so navigating far then clearing a DOB / deleting a member
leaves orphaned birthday + chore `.ics` objects on Radicale. Track written UIDs and
delete the diff, or prune by listing the collection. `autocontent.go`.

### A4. Distant-year chores missing — **P2**
`EnsureWindow` grows the events window and re-runs `RefreshBirthdays`, but **not**
`ProjectChores` (fixed ≈−1mo..+3mo). Navigating to a distant month shows events +
birthdays but no chores. Re-project on window growth (and prune — see A3).
`internal/calsync/sync.go EnsureWindow`, `autocontent.go ProjectChores`.

---

## B. EventForm _[partially seen live]_

- **B1 (P2)** Edit mode shows the calendar source as static text with no hint that
  it can't be changed — looks like a bug. Add a lock/“can’t move events between
  calendars” affordance. `EventForm.tsx` (the calendar `<select>` vs label branch).
- **B2 (P2)** **No external-attendees UI** though `externalAttendees` exists in the
  API/DB — silently unsettable from the UI.
- **B3 (P2)** Guardian toggle is gated behind "has a child attendee" but the
  rule is invisible: the card appears/vanishes as you toggle child attendees, and a
  `requiresGuardian=true` flag can be left orphaned if children are removed. Always
  show it (disabled + explained) or reset the flag on save.
- **B4 (P3)** Save isn't disabled when there are no targetable calendars; the
  "no calendar" error only appears on attempted save.
- **B5 (P3)** "Important" toggle → `visibilityTag=milestone`; the functional effect
  (shows in Month/Year highlights) isn't explained; consider renaming to "Milestone".

## C. Onboarding _[code]_ — **P2**
- **C1** The wizard never collects **date of birth**, so onboarded families get **no
  birthdays** (the seed sets DOBs, real users won't). Add DOB to the members step.
- **C2** Calendar-step copy is stale: it talks about a single built-in family
  calendar / connecting external ones, and doesn't mention that per-person +
  birthdays + chores calendars are auto-provisioned on Radicale.
- **C3** Onboarding still creates legacy `internal` sources/events that are migrated
  at startup — works, but it's a transitional indirection worth removing (create on
  the managed calendars directly).

## D. Family → Calendars _[seen live]_
- **D1 (P2)** **Two connect flows**: a per-person Google picker **and** a generic
  CalDAV "Connect" modal. The CalDAV modal makes a `kind=external`, member-less
  source that doesn't fit the new model. Unify, or clearly scope (Google overlay
  vs. raw CalDAV) and let CalDAV attach to a person.
- **D2 (P3)** No-Radicale / unreachable banners don't say what to do or whether the
  app still works; same styling for "disabled" vs "unreachable".
- **D3 (P3)** Managed vs. user-added calendars aren't visually distinct beyond the
  "Managed by Tribo" subtitle; a lock/section grouping would clarify why family/
  person calendars can't be removed.

## E. DayView all-day events _[code]_ — **P2**
DayView skips `allDay` events entirely (`if ev.allDay ... continue`). Birthdays,
holidays and chores are **invisible** in the Day timeline. Add an all-day row at the
top (the Week/Month grids do show them). `frontend/src/views/DayView.tsx`.

## F. Timezone & timestamp correctness _[code]_ — **P2**
- **F1** Events created in the UI carry the **browser's** offset; pulled events are
  reinterpreted in the **family** timezone (`icalToEvent(..., familyLocation())`).
  If a browser TZ ≠ family TZ, wall-clock can drift (esp. all-day → off-by-a-day).
  Decide a single authority (store in family TZ or UTC) and convert in the browser.
- **F2** Overlap/instance queries compare RFC3339 **strings** lexicographically
  (`chore.go ListInstances`, `guardian.go guardianFree`). The cache now mixes
  `…Z` (chores/all-day) and family-offset (`…+02:00`) timestamps; lexicographic
  comparison across offsets is not chronological. Currently masked (guardian
  excludes all-day; migrated timed events share one offset) but a latent
  correctness bug — normalize to UTC or compare as `time.Time`.

## G. Sync scaling _[code]_ — **P3**
Full-refresh (`DELETE … external_id IS NOT NULL` + re-insert) re-pulls the **entire
growing window** on every 10-min tick and on each out-of-range navigation. Fine for
a family today; revisit with incremental/`sync-token` pulls or per-segment windows
if event counts grow. `internal/calsync/sync.go`.

## H. Migration drops recurrence _[code]_ — **P2**
`MigrateInternalToRadicale` builds a `BackendEvent` with **no RRULE field**, so any
internal event with `recurrence_rule` (e.g. onboarding's `FREQ=WEEKLY` typical-week)
becomes a single dated event. Add `RecurrenceRule` to `BackendEvent`/`buildICS`, or
expand recurrences before migrating. `internal/calsync/migrate.go`, `backend.go`.

## I. Misc polish _[code]_ — **P3**
- Dead i18n keys `event.personalCalendar` / `event.familyCalendar` (unused after the
  picker landed) in en/de/ptBR.
- `colorForEvent`: a no-attendee event silently uses the shared/gold color, reading
  as a family event — consider an "unassigned" cue.
- MCP `add_event` has no explicit `calendarSourceId`; it infers from attendees
  (`sourceForAttendees`). Document or add an optional param.
- `recomputeWindow(start,end)` after create uses only the event's own span; a
  pre-existing guardian event just outside the span could be missed (rare).

---

## Suggested sequencing for fix rounds
1. **Round 1 (P1, highest impact):** Resolve the chores-on-calendar problem (A, A1)
   — pick the rendering/strategy decision; that alone removes most of the visible
   damage. Fix WeekView all-day title/color/routing.
2. **Round 2 (P2 calendar correctness):** A2/A3/A4 (status, pruning, distant-year),
   E (DayView all-day), H (RRULE in migration), F (timezone authority).
3. **Round 3 (P2 forms/flows):** B (EventForm), C (onboarding DOB + copy), D (calendars UI).
4. **Round 4 (P3 polish):** F2 timestamp normalization, G sync scaling, I.
