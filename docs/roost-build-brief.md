# Roost — Build Brief

This is the master reference for moving from design into code. It indexes everything produced so far: the design system extracted from the nine prototype screens, the data model, the architecture, the onboarding flow, and a list of what's still undesigned. See `roost-roadmap.md` for the suggested build order.

---

## 1. Project overview

Roost is a self-hosted, family-centered organizer: shared calendar (day/week/month/quarter/year), perpetual chores, loose to-dos, birthdays, a Monday-style briefing, and a review/reflection screen — designed mobile-first but equally for a wall-mounted tablet. Single-family instance. Go backend + SQLite, React frontend, Caddy reverse proxy, optional bundled Radicale (CalDAV), Authentik (OIDC) for login, and an MCP server exposing the same data to AI assistants.

---

## 2. Design system

### Color tokens
```js
const palette = {
  mist: '#EEF1EE',       // page background
  surface: '#FFFFFF',    // cards/panels
  ink: '#28342F',        // primary text
  inkSoft: '#5C6B65',    // secondary text
  line: '#DCE2DD',       // borders/dividers
  brand: '#3E6259',      // nav active state, "today" marker, primary accents
  brandSoft: '#3E62590F',// brand at ~6% — "today" column/row wash
  amber: '#F6B042',      // FAB, CTAs, "selected day" outline, highlight chip
};
```

### Person / marker colors
```js
const PEOPLE = {
  alberto:   '#4C7EA8', // denim
  hilda:     '#D1577A', // raspberry
  marie:     '#5C9460', // moss
  guilherme: '#8A6BB8', // violet
};
const SHARED_COLOR = '#D99A2B'; // gold — family-wide / external people (e.g. "Grandma")
```
Event chips: background = `color + '20'` (≈12% tint), `borderLeft: 3px solid color`, text in `ink`. Avatars/dots use the full color.

### Typography
- **Display** (headings, dates, wordmark): `Bricolage Grotesque`
- **Body / UI** (events, labels, nav): `Plus Jakarta Sans`
- Loaded via Google Fonts `@import`; applied via `.font-display` / `.font-body` utility classes.

### Signature elements
- **"Today"**: filled `brand`-colored circle around the date number, plus a `brandSoft` background wash on that column/row/section.
- **"Selected day"** (Month view): 2px inset `amber` outline on the cell — can co-occur with "today".
- **Marker-pen metaphor**: tinted, left-bordered event chips read like highlighter strokes on a whiteboard; person avatars are solid-color circles with an initial.

---

## 3. Shared UI patterns

- **Header**: wordmark + amber dot (left) → date/period navigation + "Today" button (center) → Day/Week/Month/Quarter/Year `ViewSwitcher` + weather (right), on tablet. Mobile stacks this into 2–3 rows.
- **Navigation**: 5 destinations — Home, Calendar (Day–Year), Chores, To-dos, Family. Left icon rail on tablet, bottom bar on mobile.
- **FAB**: amber circle, bottom-right, `+` icon — present on calendar/chores/todos screens. Deliberately **absent** on the Family/Settings hub (adds are scoped per-section there). Confirm this distinction holds as more screens are added.
- **Review** is reached via a "View full review →" link from Home, not a nav icon — back-navigation via a "← Home" link in its header.
- **Prototype-only aids** (remove when porting): the Phone/Tablet toggle and the `overflowX:auto` / `minWidth:1024px` scroll wrapper exist purely so tablet layouts could be previewed on a phone. The real app should use actual responsive breakpoints instead of this toggle.

---

## 4. Screen inventory

| File | Screen | Key patterns demonstrated |
|---|---|---|
| `roost-home-briefing.jsx` | Home | Greeting + countdown chip, today strip, 2×2 per-person "week ahead" cards (color top-bar, star for special items), family highlights, last-week recap teaser |
| `roost-day-view.jsx` | Day | Hourly timeline 6am–9pm; tablet = one column per person + "Family" column; phone = combined color-coded column; "now" line; today's chores/todos below |
| `roost-week-view.jsx` | Week | Tablet grid (people × days); phone agenda (day cards); right panel = chores/todos + last-week teaser |
| `roost-month-view.jsx` | Month | Grid with up to 2 chips + "+N more" (tablet) or dots (phone); tap a day → selected-day agenda panel; "This month" birthdays/holidays |
| `roost-quarter-view.jsx` | Quarter | 3 mini-months (current quarter); dots only for highlights + routine weekday dots; "This quarter" highlights in 3 columns aligned under the months |
| `roost-year-view.jsx` | Year | 12 mini-months, 3×4/2×6; dots **only** for milestones (no routine dots); year-progress bar; chronological "This year" highlights, family birthdays color-coded per person |
| `roost-review-view.jsx` | Review | "This Week/Month/Year" switcher (drives 3 hero stats only); per-person cards with streaks; 8-week chore-consistency heatmap; year-to-date card |
| `roost-family-settings.jsx` | Family/Settings | Section cards: family members (+ default guardian shown inline), work schedules (weekly M–S strip + "show on calendar" toggle), chores (fixed vs. rotation), calendar sources, app settings |
| `roost-event-form.jsx` | Event create/edit | Phone = full-screen; tablet = centered dialog over dimmed backdrop. Guardian-needed toggle with assigned/unclaimed/conflict preview states. "Important" toggle = first UI for `visibility_tag` |

---

## 5. Data model (summary)

Full detail in `roost-data-model.md`. Core entities: `Family`, `FamilyMember` (role guardian/child, color, `default_guardian_id`), `WorkSchedule` (per-guardian recurring availability, hidden by default), `CalendarSource` (internal/caldav/google), `Event` (with `requires_guardian`, `assigned_guardian_id`, `conflict_status`, `visibility_tag`), `Chore` + `ChoreInstance` (feeds Review heatmap), `Todo`.

Guardian-assignment logic (confirmed): if no guardian is free → leave unassigned, flag `needs_guardian`. If multiple are free → use the child's `default_guardian_id` if set, else leave unassigned for first-claim.

`visibility_tag` (`routine`/`standard`/`milestone`) controls Quarter/Year decluttering — Day/Week/Month always show everything; Quarter/Year show `milestone` only.

---

## 6. Architecture (summary)

Full detail in `roost-architecture.md` and `roost-architecture.mermaid`. One Go binary (REST API + MCP server + embedded React build via `go:embed`) behind Caddy; SQLite is the canonical store; sync workers keep it consistent with external CalDAV/Google sources, one of which may be the optional bundled Radicale. Roost is an OIDC relying party against an existing Authentik instance; an in-app profile switcher (optional PIN) picks the active family member after login.

---

## 7. Onboarding flow (confirmed)

1. **Welcome**
2. **Family basics** — name, timezone
3. **Add family members** — name, color, role, default guardian *(required — reuses Family Members section design)*
4. **Calendar** — bundled Radicale (default) / connect existing / skip
5. **Starter chores** — toggleable template list, quick-assign *(skippable)*
6. **Typical week** — toggleable recurring-pattern templates per person *(skippable)*
7. **Done**

Steps 4–6 skippable with sensible empty defaults; everything configurable later from Family/Settings. The wizard should be re-runnable later (e.g. from Family/Settings) for adding members or re-doing calendar setup.

---

## 8. Open items / refinements to revisit during implementation

- Color palette: liked as a first pass, but flagged for possible refinement later.
- `visibility_tag`: the event form now has an "Important" toggle (→ `milestone`); `routine` vs. `standard` is still inferred automatically from whether the event repeats. Confirm this is sufficient, or whether a series-level override is needed later.
- `WorkSchedule.show_on_calendar`: toggle exists in Family/Settings, but the "busy stripe" rendering in Day/Week isn't designed.
- Default-guardian editing: currently shown read-only on each child's row in Family/Settings; needs an edit interaction.
- Review's period switcher only drives the 3 hero tiles; other sections use fixed timeframes (labeled). Decide if this should be unified later.
- `external_attendees` (e.g. "Grandma") is a plain text field for now; a "relatives" list with custom colors is a possible future addition.

---

## 9. Screens still to design (interaction-heavy, not yet covered)

- Chore create/edit (fixed vs. rotation assignment).
- Calendar source connection flow (CalDAV/Google/Radicale setup).
- Onboarding wizard screens (steps 1, 2, 4–7; step 3 reuses existing Family Members design).
- Work-schedule detail editor (beyond the read-only weekly strip).
