// Package chores owns chore definitions, instance generation, and completion
// tracking. Both the REST API and MCP server call into here.
package chores

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

const dateFmt = "2006-01-02"

type Chore struct {
	ID                 string   `json:"id"`
	Title              string   `json:"title"`
	Description        *string  `json:"description,omitempty"`
	RecurrenceRule     string   `json:"recurrenceRule"`     // daily | weekly | monthly (the unit)
	RecurrenceInterval int      `json:"recurrenceInterval"` // multiplier: every N units (>= 1)
	AssignmentMode     string   `json:"assignmentMode"`     // fixed | rotation
	AssignedMemberID   *string  `json:"assignedMemberId,omitempty"`
	RotationMemberIDs  []string `json:"rotationMemberIds,omitempty"`
	Color              *string  `json:"color,omitempty"`
	Icon               *string  `json:"icon,omitempty"`
}

type Instance struct {
	ID               string  `json:"id"`
	ChoreID          string  `json:"choreId"`
	Title            string  `json:"title"`
	Color            *string `json:"color,omitempty"`
	PeriodStart      string  `json:"periodStart"` // YYYY-MM-DD
	PeriodEnd        string  `json:"periodEnd"`
	AssignedMemberID *string `json:"assignedMemberId,omitempty"`
	Status           string  `json:"status"` // pending | done | skipped
	CompletedBy      *string `json:"completedBy,omitempty"`
	CompletedAt      *string `json:"completedAt,omitempty"`
}

type NewChore struct {
	Title              string   `json:"title"`
	RecurrenceRule     string   `json:"recurrenceRule"`
	RecurrenceInterval int      `json:"recurrenceInterval"`
	AssignmentMode     string   `json:"assignmentMode"`
	AssignedMemberID   *string  `json:"assignedMemberId"`
	RotationMemberIDs  []string `json:"rotationMemberIds"`
	Color              *string  `json:"color"`
	Icon               *string  `json:"icon"`
}

const maxInterval = 120 // sanity cap (e.g. monthly × 120 = every 10 years)

// normalizeRecurrence clamps the unit + interval to valid values.
func normalizeRecurrence(rule string, interval int) (string, int) {
	switch rule {
	case "daily", "weekly", "monthly":
	default:
		rule = "weekly"
	}
	if interval < 1 {
		interval = 1
	}
	if interval > maxInterval {
		interval = maxInterval
	}
	return rule, interval
}

type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service { return &Service{db: db} }

// ===== Period math =====
//
// Recurrence periods are anchored to a fixed global calendar grid (not to each
// chore's creation date), so the same buckets are produced no matter what window
// Generate runs over — essential for idempotency. With interval N:
//   • daily:   N-day buckets from a fixed epoch.
//   • weekly:  N-week buckets aligned to Mondays.
//   • monthly: N-month buckets aligned to the 1st (interval 3 → Jan/Apr/Jul/Oct,
//              12 → yearly on Jan 1, 60 → every 5 years).

// epochYear/Month/Day is a fixed Monday used as the anchor for day/week buckets.
const epochYear, epochMonth, epochDay = 1970, time.January, 5 // 1970-01-05 is a Monday

// dayNumber is a proleptic-Gregorian day count for a calendar date, independent
// of timezone/DST — safe for integer day/week arithmetic.
func dayNumber(y int, m time.Month, d int) int {
	a := (14 - int(m)) / 12
	yy := y + 4800 - a
	mm := int(m) + 12*a - 3
	return d + (153*mm+2)/5 + 365*yy + yy/4 - yy/100 + yy/400 - 32045
}

// floorDiv divides rounding toward negative infinity (so buckets are stable for
// dates before the epoch too).
func floorDiv(a, b int) int {
	q := a / b
	if (a%b != 0) && ((a < 0) != (b < 0)) {
		q--
	}
	return q
}

// periodOf returns the [start, end) window of the recurrence period that
// contains day (midnight, in day's location).
func periodOf(rule string, interval int, day time.Time) (time.Time, time.Time) {
	rule, interval = normalizeRecurrence(rule, interval)
	y, m, d := day.Date()
	loc := day.Location()
	idx := periodIndexFor(rule, interval, y, m, d)
	return periodBounds(rule, interval, idx, loc)
}

// periodIndex returns the absolute bucket index of a period given its start day.
// Used to make rotation assignment deterministic across generation runs.
func periodIndex(rule string, interval int, start time.Time) int {
	rule, interval = normalizeRecurrence(rule, interval)
	y, m, d := start.Date()
	return periodIndexFor(rule, interval, y, m, d)
}

func periodIndexFor(rule string, interval int, y int, m time.Month, d int) int {
	switch rule {
	case "weekly":
		weeks := floorDiv(dayNumber(y, m, d)-dayNumber(epochYear, epochMonth, epochDay), 7)
		return floorDiv(weeks, interval)
	case "monthly":
		return floorDiv(y*12+int(m)-1, interval)
	default: // daily
		return floorDiv(dayNumber(y, m, d)-dayNumber(epochYear, epochMonth, epochDay), interval)
	}
}

func periodBounds(rule string, interval, idx int, loc *time.Location) (time.Time, time.Time) {
	switch rule {
	case "weekly":
		start := time.Date(epochYear, epochMonth, epochDay, 0, 0, 0, 0, loc).AddDate(0, 0, idx*interval*7)
		return start, start.AddDate(0, 0, interval*7)
	case "monthly":
		bm := idx * interval
		start := time.Date(bm/12, time.Month(bm%12+1), 1, 0, 0, 0, 0, loc)
		return start, start.AddDate(0, interval, 0)
	default: // daily
		start := time.Date(epochYear, epochMonth, epochDay, 0, 0, 0, 0, loc).AddDate(0, 0, idx*interval)
		return start, start.AddDate(0, 0, interval)
	}
}

// nextPeriod advances a [start,end) window to the following one.
func nextPeriod(rule string, interval int, start time.Time) time.Time {
	rule, interval = normalizeRecurrence(rule, interval)
	switch rule {
	case "weekly":
		return start.AddDate(0, 0, interval*7)
	case "monthly":
		return start.AddDate(0, interval, 0)
	default:
		return start.AddDate(0, 0, interval)
	}
}

// ===== Generation =====

// Generate ensures a chore_instance row exists for every period from `from`
// through `to` (inclusive of the period containing `to`). Idempotent via the
// UNIQUE(chore_id, period_start) constraint. Returns the number created.
func (s *Service) Generate(from, to time.Time) (int, error) {
	chores, err := s.ListChores()
	if err != nil {
		return 0, err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	created := 0
	for _, c := range chores {
		start, _ := periodOf(c.RecurrenceRule, c.RecurrenceInterval, from)
		for !start.After(to) {
			end := nextPeriod(c.RecurrenceRule, c.RecurrenceInterval, start)
			// Use the absolute bucket index so rotation assignment is the same
			// regardless of which window this period was first generated in.
			assignee := resolveAssignee(c, periodIndex(c.RecurrenceRule, c.RecurrenceInterval, start))
			res, err := tx.Exec(
				`INSERT OR IGNORE INTO chore_instance (id, chore_id, period_start, period_end, assigned_member_id, status)
				 VALUES (?, ?, ?, ?, ?, 'pending')`,
				uuid.NewString(), c.ID, start.Format(dateFmt), end.Format(dateFmt), assignee)
			if err != nil {
				return 0, err
			}
			if n, _ := res.RowsAffected(); n > 0 {
				created++
			}
			start = end
		}
	}
	return created, tx.Commit()
}

// resolveAssignee picks the member responsible for a given period: the fixed
// assignee, or the next person in the rotation.
func resolveAssignee(c Chore, periodIdx int) *string {
	if c.AssignmentMode == "rotation" && len(c.RotationMemberIDs) > 0 {
		id := c.RotationMemberIDs[periodIdx%len(c.RotationMemberIDs)]
		return &id
	}
	return c.AssignedMemberID
}

// ===== Queries =====

func (s *Service) ListChores() ([]Chore, error) {
	rows, err := s.db.Query(
		`SELECT id, title, description, recurrence_rule, recurrence_interval, assignment_mode,
		        assigned_member_id, rotation_member_ids, color, icon
		 FROM chore ORDER BY sort_order, title`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Chore{}
	for rows.Next() {
		var c Chore
		var rotation *string
		if err := rows.Scan(&c.ID, &c.Title, &c.Description, &c.RecurrenceRule, &c.RecurrenceInterval, &c.AssignmentMode,
			&c.AssignedMemberID, &rotation, &c.Color, &c.Icon); err != nil {
			return nil, err
		}
		if rotation != nil && *rotation != "" {
			c.RotationMemberIDs = strings.Split(*rotation, ",")
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Service) CreateChore(in NewChore) (*Chore, error) {
	if strings.TrimSpace(in.Title) == "" {
		return nil, errors.New("title is required")
	}
	rule, interval := normalizeRecurrence(in.RecurrenceRule, in.RecurrenceInterval)
	if in.AssignmentMode == "" {
		in.AssignmentMode = "fixed"
	}
	id := uuid.NewString()
	var rotation *string
	if len(in.RotationMemberIDs) > 0 {
		joined := strings.Join(in.RotationMemberIDs, ",")
		rotation = &joined
	}
	if _, err := s.db.Exec(
		`INSERT INTO chore (id, title, recurrence_rule, recurrence_interval, assignment_mode, assigned_member_id, rotation_member_ids, color, icon)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.Title, rule, interval, in.AssignmentMode, in.AssignedMemberID, rotation, in.Color, in.Icon); err != nil {
		return nil, err
	}
	// Generate this period's instance immediately so it appears right away.
	if _, err := s.Generate(time.Now(), time.Now()); err != nil {
		return nil, err
	}
	chores, err := s.ListChores()
	if err != nil {
		return nil, err
	}
	for i := range chores {
		if chores[i].ID == id {
			return &chores[i], nil
		}
	}
	return nil, errors.New("chore not found after insert")
}

// UpdateChore replaces a chore's definition.
func (s *Service) UpdateChore(id string, in NewChore) (*Chore, error) {
	if strings.TrimSpace(in.Title) == "" {
		return nil, errors.New("title is required")
	}
	rule, interval := normalizeRecurrence(in.RecurrenceRule, in.RecurrenceInterval)
	if in.AssignmentMode == "" {
		in.AssignmentMode = "fixed"
	}
	var rotation any
	if len(in.RotationMemberIDs) > 0 {
		rotation = strings.Join(in.RotationMemberIDs, ",")
	}
	res, err := s.db.Exec(
		`UPDATE chore SET title=?, recurrence_rule=?, recurrence_interval=?, assignment_mode=?, assigned_member_id=?, rotation_member_ids=?, color=?, icon=? WHERE id=?`,
		in.Title, rule, interval, in.AssignmentMode, in.AssignedMemberID, rotation, in.Color, in.Icon, id)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, errors.New("chore not found")
	}
	chores, err := s.ListChores()
	if err != nil {
		return nil, err
	}
	for i := range chores {
		if chores[i].ID == id {
			return &chores[i], nil
		}
	}
	return nil, errors.New("chore not found")
}

// DeleteChore removes a chore and its instances (cascade).
func (s *Service) DeleteChore(id string) error {
	_, err := s.db.Exec(`DELETE FROM chore WHERE id = ?`, id)
	return err
}

// ListInstances returns instances scheduled within [from, to) — i.e. whose
// period_start falls in the range. A chore belongs to exactly one period (the
// one it starts in), so it surfaces only in the week/month/year view that
// contains its scheduled date, not in every view its period happens to span.
func (s *Service) ListInstances(from, to time.Time) ([]Instance, error) {
	rows, err := s.db.Query(
		`SELECT ci.id, ci.chore_id, c.title, COALESCE(c.color, ''), ci.period_start, ci.period_end,
		        ci.assigned_member_id, ci.status, ci.completed_by, ci.completed_at
		 FROM chore_instance ci JOIN chore c ON c.id = ci.chore_id
		 WHERE ci.period_start >= ? AND ci.period_start < ?
		 ORDER BY ci.period_start, c.title`,
		from.Format(dateFmt), to.Format(dateFmt))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Instance{}
	for rows.Next() {
		var in Instance
		var color string
		if err := rows.Scan(&in.ID, &in.ChoreID, &in.Title, &color, &in.PeriodStart, &in.PeriodEnd,
			&in.AssignedMemberID, &in.Status, &in.CompletedBy, &in.CompletedAt); err != nil {
			return nil, err
		}
		if color != "" {
			in.Color = &color
		}
		out = append(out, in)
	}
	return out, rows.Err()
}

// SetStatus marks an instance done (with the completer) or skipped, or resets to
// pending. memberID may be empty for skip/pending.
func (s *Service) SetStatus(instanceID, status, memberID string) error {
	switch status {
	case "done":
		_, err := s.db.Exec(
			`UPDATE chore_instance SET status = 'done', completed_by = ?, completed_at = ? WHERE id = ?`,
			nullable(memberID), time.Now().Format(time.RFC3339), instanceID)
		return err
	case "skipped":
		_, err := s.db.Exec(
			`UPDATE chore_instance SET status = 'skipped', completed_by = NULL, completed_at = NULL WHERE id = ?`, instanceID)
		return err
	case "pending":
		_, err := s.db.Exec(
			`UPDATE chore_instance SET status = 'pending', completed_by = NULL, completed_at = NULL WHERE id = ?`, instanceID)
		return err
	default:
		return errors.New("invalid status")
	}
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}
