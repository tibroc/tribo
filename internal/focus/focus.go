// Package focus builds the Now/Next/Later queue for the Home focus card
// (docs/focus-plan.md, phase F1). Ranking is deterministic — guardian
// conflicts first, then anchored/overdue/due/important items, then today's
// chores, smaller effort first — so the feature works without an LLM; a
// configured assistant can later re-rank and write richer "why" lines.
//
// Reasons are structured codes (not prose) so the client localizes them.
package focus

import (
	"database/sql"
	"errors"
	"sort"
	"time"

	"github.com/google/uuid"

	"tribo/internal/calendar"
	"tribo/internal/chores"
	"tribo/internal/family"
	"tribo/internal/todos"
)

// Item is one actionable entry in the queue.
type Item struct {
	Kind     string `json:"kind"` // event | todo | chore
	ID       string `json:"id"`   // event id / todo id / chore-instance id
	Title    string `json:"title"`
	Reason   Reason `json:"reason"`
	MemberID string `json:"memberId,omitempty"`
	Effort   string `json:"effort,omitempty"`
	At       string `json:"at,omitempty"` // RFC3339 — when this becomes due/starts

	rank   int
	sortAt string
}

// Reason is a localizable "why this ranks here" code with an optional count
// (days overdue, days until due).
type Reason struct {
	Code string `json:"code"`
	N    int    `json:"n,omitempty"`
}

// Anchor is the next fixed point of the day — the thing the countdown pill
// makes visible ("Leave for Soccer pickup · in 2h 05m").
type Anchor struct {
	EventID string `json:"eventId"`
	Title   string `json:"title"`
	At      string `json:"at"`      // event start, RFC3339
	LeaveAt string `json:"leaveAt"` // start − buffer, RFC3339
}

// Queue is the focus card payload: one NOW, two NEXT, the rest counted (and
// included only on request — hidden on purpose). In low-energy mode, standard
// and heavy items move to Parked ("waiting for a better day") instead of
// competing for attention. WinsToday counts today's completions (any size) —
// the momentum line.
type Queue struct {
	Date       string  `json:"date"`
	Now        *Item   `json:"now,omitempty"`
	Next       []Item  `json:"next"`
	LaterCount int     `json:"laterCount"`
	Later      []Item  `json:"later,omitempty"`
	Parked     []Item  `json:"parked,omitempty"`
	Anchor     *Anchor `json:"anchor,omitempty"`
	WinsToday  int     `json:"winsToday"`
}

// Energy levels: "low" narrows the queue to 2min/5min small wins (guardian
// conflicts always stay — they're time-critical), "high" boosts heavy tasks,
// "ok" (default) leaves the ranking alone. Never stored server-side: the
// client sends it per request as a private, per-device signal.
const (
	EnergyLow  = "low"
	EnergyOK   = "ok"
	EnergyHigh = "high"
)

// LeaveBuffer is the fixed leaving-time buffer before an event (a per-event
// or per-family override is a later refinement — see the plan's open
// questions). Shared with the push scheduler's transition warnings.
const LeaveBuffer = 20 * time.Minute

// Ranks: lower comes first. Ties break on sortAt, then smaller effort.
const (
	rankConflict = iota // needs_guardian / unclaimed events
	rankAnchored        // todo anchored to a today-event
	rankOverdue
	rankDueToday
	rankImportant
	rankChore
	rankDueSoon
	rankOpen
)

type Service struct {
	db     *sql.DB
	events *calendar.Service
	chores *chores.Service
	todos  *todos.Service
	family *family.Service
}

func NewService(db *sql.DB) *Service {
	return &Service{
		db:     db,
		events: calendar.NewService(db, nil), // read-only cache access
		chores: chores.NewService(db),
		todos:  todos.NewService(db),
		family: family.NewService(db),
	}
}

func (s *Service) familyLocation() *time.Location {
	var tz string
	_ = s.db.QueryRow(`SELECT COALESCE(timezone, '') FROM family LIMIT 1`).Scan(&tz)
	if tz != "" {
		if loc, err := time.LoadLocation(tz); err == nil {
			return loc
		}
	}
	return time.Local
}

// BuildQueue assembles the ranked queue for the acting member ("" = no active
// profile: everything is in scope). includeLater additionally returns the
// hidden tail; energy is one of the Energy* levels ("" = ok).
func (s *Service) BuildQueue(memberID string, includeLater bool, energy string) (*Queue, error) {
	loc := s.familyLocation()
	now := time.Now().In(loc)
	return s.buildQueueAt(now, memberID, includeLater, energy)
}

// buildQueueAt is the testable core, anchored at an explicit "now".
func (s *Service) buildQueueAt(now time.Time, memberID string, includeLater bool, energy string) (*Queue, error) {
	if energy != EnergyLow && energy != EnergyHigh {
		energy = EnergyOK
	}
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	today := dayStart.Format("2006-01-02")

	deferred, err := s.deferredOn(today)
	if err != nil {
		return nil, err
	}

	// Events today + tomorrow: conflict candidates and anchor targets.
	events, err := s.events.ListEvents(dayStart, dayStart.AddDate(0, 0, 2))
	if err != nil {
		return nil, err
	}
	eventStart := map[string]calendar.Event{}
	for _, ev := range events {
		eventStart[ev.ID] = ev
	}

	var items []Item

	// 1) Guardian conflicts: unresolved pickups always lead the queue.
	for _, ev := range events {
		if ev.AllDay {
			continue
		}
		unresolved := ev.ConflictStatus == "needs_guardian" ||
			(ev.RequiresGuardian && ev.AssignedGuardianID == nil)
		if !unresolved || deferred["event:"+ev.ID] {
			continue
		}
		if end, e := time.Parse(time.RFC3339, ev.EndAt); e == nil && end.Before(now) {
			continue // already over
		}
		code := "needs_guardian"
		if ev.ConflictStatus != "needs_guardian" {
			code = "unclaimed"
		}
		items = append(items, Item{
			Kind: "event", ID: ev.ID, Title: ev.Title,
			Reason: Reason{Code: code}, At: ev.StartAt,
			rank: rankConflict, sortAt: ev.StartAt,
		})
	}

	// 2) Open to-dos: anchored → overdue → due today → important → due soon → open.
	allTodos, err := s.todos.List()
	if err != nil {
		return nil, err
	}
	anchors, err := s.todoAnchors()
	if err != nil {
		return nil, err
	}
	for _, t := range allTodos {
		if t.Status != "open" || deferred["todo:"+t.ID] {
			continue
		}
		if !relevantTo(memberID, t.AssignedMemberID) {
			continue
		}
		it := Item{Kind: "todo", ID: t.ID, Title: t.Title, Effort: t.Effort}
		if t.AssignedMemberID != nil {
			it.MemberID = *t.AssignedMemberID
		}
		switch {
		case anchors[t.ID] != "" && eventStart[anchors[t.ID]].ID != "":
			ev := eventStart[anchors[t.ID]]
			it.Reason = Reason{Code: "before_event"}
			it.At = ev.StartAt
			it.rank, it.sortAt = rankAnchored, ev.StartAt
		case t.DueDate != nil && *t.DueDate < today:
			days := daysBetween(*t.DueDate, today)
			it.Reason = Reason{Code: "overdue", N: days}
			it.rank, it.sortAt = rankOverdue, *t.DueDate
		case t.DueDate != nil && *t.DueDate == today:
			it.Reason = Reason{Code: "due_today"}
			it.rank, it.sortAt = rankDueToday, today
		case t.Important:
			it.Reason = Reason{Code: "important"}
			it.rank, it.sortAt = rankImportant, today
		case t.DueDate != nil && daysBetween(today, *t.DueDate) <= 7:
			it.Reason = Reason{Code: "due_soon", N: daysBetween(today, *t.DueDate)}
			it.rank, it.sortAt = rankDueSoon, *t.DueDate
		default:
			it.Reason = Reason{Code: "open_todo"}
			it.rank, it.sortAt = rankOpen, today
		}
		items = append(items, it)
	}

	// 3) Chores whose period covers today (weekly chores start on Monday, so
	// scan from a week back) and are still pending.
	instances, err := s.chores.ListInstances(dayStart.AddDate(0, 0, -7), dayStart.AddDate(0, 0, 1))
	if err != nil {
		return nil, err
	}
	for _, ci := range instances {
		if ci.Status != "pending" || ci.PeriodEnd < today || deferred["chore:"+ci.ID] {
			continue
		}
		if !relevantTo(memberID, ci.AssignedMemberID) {
			continue
		}
		it := Item{Kind: "chore", ID: ci.ID, Title: ci.Title, Effort: ci.Effort,
			Reason: Reason{Code: "chore_due", N: daysBetween(today, ci.PeriodEnd)},
			rank:   rankChore, sortAt: ci.PeriodEnd}
		if ci.AssignedMemberID != nil {
			it.MemberID = *ci.AssignedMemberID
		}
		items = append(items, it)
	}

	// Plenty in the tank: heavy tasks get a rank boost (never above conflicts)
	// and win ties — the day for the big stuff.
	if energy == EnergyHigh {
		for i := range items {
			if items[i].Effort == "heavy" && items[i].rank > rankAnchored {
				items[i].rank--
			}
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].rank != items[j].rank {
			return items[i].rank < items[j].rank
		}
		if items[i].sortAt != items[j].sortAt {
			return items[i].sortAt < items[j].sortAt
		}
		if energy == EnergyHigh {
			return effortKey(items[i].Effort) > effortKey(items[j].Effort)
		}
		return effortKey(items[i].Effort) < effortKey(items[j].Effort)
	})

	q := &Queue{Date: today, Next: []Item{}}

	// Running low: only small wins (2min/5min) compete for attention; the big
	// stuff waits visibly, without penalty. Conflicts always stay — a child
	// still needs the ride.
	if energy == EnergyLow {
		kept := items[:0]
		for _, it := range items {
			small := it.Effort == "2min" || it.Effort == "5min"
			if it.rank == rankConflict || small {
				kept = append(kept, it)
			} else {
				q.Parked = append(q.Parked, it)
			}
		}
		items = kept
	}

	if len(items) > 0 {
		q.Now = &items[0]
	}
	if len(items) > 1 {
		end := min(3, len(items))
		q.Next = items[1:end]
	}
	if len(items) > 3 {
		q.LaterCount = len(items) - 3
		if includeLater {
			q.Later = items[3:]
		}
	}
	q.Anchor = anchorFor(events, now)
	q.WinsToday = s.winsToday(today, memberID)
	return q, nil
}

// winsToday counts completions today — chores completed by the acting member
// (any member when unscoped) plus to-dos checked off (unattributed, so they
// count family-wide). Momentum counts; size doesn't.
func (s *Service) winsToday(today, memberID string) int {
	var chores, todos int
	if memberID != "" {
		_ = s.db.QueryRow(
			`SELECT COUNT(*) FROM chore_instance WHERE status = 'done' AND substr(COALESCE(completed_at,''),1,10) = ? AND completed_by = ?`,
			today, memberID).Scan(&chores)
	} else {
		_ = s.db.QueryRow(
			`SELECT COUNT(*) FROM chore_instance WHERE status = 'done' AND substr(COALESCE(completed_at,''),1,10) = ?`,
			today).Scan(&chores)
	}
	_ = s.db.QueryRow(
		`SELECT COUNT(*) FROM todo WHERE status = 'done' AND substr(COALESCE(completed_at,''),1,10) = ?`,
		today).Scan(&todos)
	return chores + todos
}

// Defer hides an item from the queue for the rest of the day (family-wide, so
// every device shows the same queue) and logs who deferred it for Review.
func (s *Service) Defer(kind, itemID, memberID string) error {
	switch kind {
	case "todo", "chore", "event":
	default:
		return errors.New("kind must be todo, chore, or event")
	}
	if itemID == "" {
		return errors.New("id is required")
	}
	loc := s.familyLocation()
	now := time.Now().In(loc)
	var member any
	if memberID != "" {
		member = memberID
	}
	_, err := s.db.Exec(
		`INSERT INTO focus_defer (id, item_kind, item_id, member_id, deferred_on, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		uuid.NewString(), kind, itemID, member, now.Format("2006-01-02"), now.Format(time.RFC3339))
	return err
}

func (s *Service) deferredOn(day string) (map[string]bool, error) {
	rows, err := s.db.Query(`SELECT item_kind, item_id FROM focus_defer WHERE deferred_on = ?`, day)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var kind, id string
		if err := rows.Scan(&kind, &id); err != nil {
			return nil, err
		}
		out[kind+":"+id] = true
	}
	return out, rows.Err()
}

func (s *Service) todoAnchors() (map[string]string, error) {
	rows, err := s.db.Query(`SELECT id, anchor_event_id FROM todo WHERE anchor_event_id IS NOT NULL AND status = 'open'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var id, anchor string
		if err := rows.Scan(&id, &anchor); err != nil {
			return nil, err
		}
		out[id] = anchor
	}
	return out, rows.Err()
}

// anchorFor picks the next timed event today starting after now — the day's
// next fixed point.
func anchorFor(events []calendar.Event, now time.Time) *Anchor {
	dayEnd := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).AddDate(0, 0, 1)
	var best *calendar.Event
	var bestStart time.Time
	for i := range events {
		ev := events[i]
		if ev.AllDay {
			continue
		}
		start, err := time.Parse(time.RFC3339, ev.StartAt)
		if err != nil || !start.After(now) || !start.Before(dayEnd) {
			continue
		}
		if best == nil || start.Before(bestStart) {
			best, bestStart = &events[i], start
		}
	}
	if best == nil {
		return nil
	}
	return &Anchor{
		EventID: best.ID, Title: best.Title, At: best.StartAt,
		LeaveAt: bestStart.Add(-LeaveBuffer).Format(time.RFC3339),
	}
}

// relevantTo keeps items that are unassigned (family-wide) or assigned to the
// acting member; with no active profile everything is in scope.
func relevantTo(memberID string, assigned *string) bool {
	if memberID == "" || assigned == nil {
		return true
	}
	return *assigned == memberID
}

func effortKey(e string) int {
	switch e {
	case "2min":
		return 0
	case "5min":
		return 1
	case "heavy":
		return 3
	default:
		return 2
	}
}

func daysBetween(from, to string) int {
	a, err1 := time.Parse("2006-01-02", from)
	b, err2 := time.Parse("2006-01-02", to)
	if err1 != nil || err2 != nil {
		return 0
	}
	return int(b.Sub(a).Hours() / 24)
}
