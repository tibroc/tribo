# UI review — running app (seeded, live Radicale)

Full UI walk-through of every screen in the running app (seeded Silva family,
against a live Radicale; desktop + mobile; light + dark; English + German).
Findings are **not fixed yet** — this is triage + a fix plan.

Severity: **P1** (broken / data clipped / visibly wrong), **P2** (confusing,
inconsistent, or locale-incorrect), **P3** (polish). Evidence marked _[live]_ was
confirmed in the running app; root causes cite `file:line`.

---

## P1 — broken / data-losing

### 1. Day view only spans 6 AM – 9 PM (clips early/late events)
- _[live]_ Day view's hour axis runs 6 AM → 8 PM; "Date night" (8–10 PM) is drawn
  past the grid bottom and visually cut off. Any event before 06:00 or after 21:00
  is clipped or invisible on the timeline (all-day events are fine — separate strip).
- **Root:** `frontend/src/views/DayView.tsx:16-17` — `HOUR_START = 6`, `HOUR_END = 21`.
  The whole grid (`SPAN`, `HOURS`, `pct`, `clamp`) is derived from these.
- **Fix:** cover the full day. Set `HOUR_START = 0`, `HOUR_END = 24` and let the
  timeline scroll (it already lives in a scroll container) with an initial
  scroll-to-now (or scroll-to-first-event). Optionally keep a denser default
  viewport (e.g. 7–22) but ensure out-of-range events are reachable by scroll
  rather than clamped. Verify `clamp`/`pct` no longer compress out-of-window
  events onto the edges. Est: ~M.

### 2. A daily chore's entire week is dumped under "Today"
- _[live]_ Chores page shows **7** identical "Set the table / Rotation" rows under
  the **TODAY** heading, with no per-day label — indistinguishable and looking like
  duplicates. Only the avatar (M/G rotation) differs.
- **Root:** `frontend/src/components/panels.tsx:162` — grouping is
  `choreOf(i.choreId)?.recurrenceRule === 'daily' ? today : later`. It buckets by
  *whether the chore recurs daily*, not by the instance's actual `periodStart`. A
  daily chore yields 7 instances for the week, all of which match → all land in
  "Today".
- **Fix:** group by the instance date, not the recurrence rule:
  `periodStart === todayKey → Today, else → Later this week`. Either (a) show only
  today's instance under "Today" and the rest under their day, or (b) add a small
  day label (`Mon`, `Tue`…) to each non-today instance so the week reads clearly.
  Est: ~S.

---

## P2 — locale-incorrect / inconsistent

### 3. Time format is hard-coupled to UI language (no 12h/24h preference)
- _[live]_ English UI → 12h "7:00 AM / 8:00 PM"; switching language to German →
  24h "7:00 / 20:00". There is **no way to get English UI with 24h time** (the
  common preference for many EU users).
- **Root:** `frontend/src/lib/datetime.ts:16-23` — `fmtTime`/`fmtHour` build
  `Intl.DateTimeFormat(locale, …)` and let the locale decide the hour cycle.
- **Fix:** add a **time-format preference** (System / 24-hour / 12-hour) in
  App settings (mirrors the existing Language/Appearance rows), persisted to
  localStorage like language/theme. Thread it into the `fmt*` helpers as an
  explicit `hourCycle: 'h23' | 'h12'` (or `hour12`) override; "System" keeps the
  current locale-derived behavior. This is the direct answer to the reported
  "should be 24h" ask without forcing a language change. Est: ~M.

### 4. Native date/time pickers ignore the app language
- _[live]_ The EventForm uses native `<input type="date">` / `<input type="time">`,
  which follow the **browser** locale, not the app's. In an en-US browser the date
  reads **MM/DD/YYYY** and time shows **AM/PM** even after switching the app to
  German.
- **Root:** `frontend/src/components/EventForm.tsx` — native inputs, no `lang`/
  format control.
- **Fix:** set the input `lang` to the active app locale (nudges browsers toward
  the right order/clock), and have the all-day/time UX driven by the same
  time-format preference from #3. If native inputs remain inconsistent across
  browsers, consider lightweight custom date/time controls. Est: ~M (S if just
  `lang`).

### 5. "Guardian"/"Child" role labels untranslated in Week/Day views
- _[live]_ In German, the Family page localizes roles ("Erziehungsberechtigt" /
  "Kind"), but the Week and Day per-person rows still print raw English
  "Guardian" / "Child".
- **Root:** `frontend/src/views/WeekView.tsx:118` renders `{person.role}`
  directly (DayView column header is the same pattern). The translated keys already
  exist (used by FamilyPage).
- **Fix:** render `t(\`role.${person.role}\`)` in both views (reuse the existing
  role keys). Est: ~S.

---

## P3 — polish

### 6. Work-schedule label "Work" is a hard-coded English default
- _[live]_ In German UI the schedule still reads "Work · 09:00 – 17:00".
- **Root:** `frontend/src/components/SettingsForms.tsx:220` defaults the label to
  the literal `'Work'`, stored and displayed verbatim. (Also noted in the code
  review as the untranslated default.)
- **Fix:** default/display via `t('schedule.workLabel')`; treat a stored "Work"
  as the localizable default. Est: ~S.

### 7. Managed calendar names ("Birthdays", "Chores", "Family") untranslated
- _[live]_ Family → Calendar sources lists "Birthdays/Chores/Family" in English
  under a German UI (the per-person ones show member names, which is fine).
- **Root:** managed calendar `display_name`s are provisioned as English strings;
  the UI prints them raw.
- **Fix:** for managed sources, render by `kind` through a translated label
  (`t(\`calendar.kind.${kind}\`)`) instead of the stored display name. Est: ~S.

### 8. Year view day cells aren't clickable
- _[live]_ Month view day cells are buttons (drill into the day); Year view day
  numbers are static text — no way to jump from a year cell into that day/month.
- **Root:** `frontend/src/views/YearView.tsx` renders day cells as text, not
  buttons; no `onNavigate` to switch view + cursor.
- **Fix:** make Year cells clickable → switch to Month (or Day) at that date.
  Est: ~S.

### 9. FAB overlaps content on mobile
- _[live]_ At phone width the floating "+" sits on top of the last day-card's
  events in the Week agenda.
- **Fix:** add bottom padding (≈ FAB height + safe-area) to the mobile scroll
  container. Est: ~S.

### 10. "Ready to work offline" toast lingers and overlaps the bottom nav
- _[live]_ The PWA offline toast (bottom-left) stayed visible the entire session
  and overlaps the mobile bottom nav / content.
- **Root:** `frontend/src/components/ReloadPrompt.tsx` (offline-ready notice has no
  auto-dismiss).
- **Fix:** auto-dismiss the offline-ready toast after a few seconds (keep the
  "new version available" prompt sticky). Est: ~S.

### 11. To-do per-row "+" (assign) is an unclear affordance
- _[live]_ Each open to-do shows a "+" that opens the assignee picker; the icon
  reads as "add", not "assign". (Snapshot exposes it as button "Assign", so the
  intent is right; the glyph is ambiguous.)
- **Fix:** use an avatar/person glyph (or show the assignee avatar when set), not a
  plus. Est: ~S.

---

## Suggested ordering

1. **#1 Day view full-day** + **#2 chore grouping** — the two P1s; both are
   self-contained and the most visible "this looks broken".
2. **#3 time-format preference** — directly answers the reported 24h ask; do this
   before #4 since #4 reuses the same preference.
3. **#5 role labels** + **#4 native-input lang** — finish the i18n correctness pass.
4. **#6–#11 polish** — batch the remaining small fixes (mostly ~S each).

## Notes / verified-OK
- Week, Month, Year, Home, Chores hero/by-person/rotation, To-dos columns, Family
  members/work-schedules/calendar-sources, light & dark themes, and mobile agenda
  layouts all render correctly with seeded data; **0 console errors** across the
  walk-through.
- Language switching, theme toggle, all-day toggle, calendar picker, and the
  to-do/chore toggles all function.
- Time format _does_ become 24h under German/Portuguese — the issue is only the
  lack of an independent preference (#3), not a broken formatter.
