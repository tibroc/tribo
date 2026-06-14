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
	ID                string   `json:"id"`
	Title             string   `json:"title"`
	Description       *string  `json:"description,omitempty"`
	RecurrenceRule    string   `json:"recurrenceRule"` // daily | weekly | monthly
	AssignmentMode    string   `json:"assignmentMode"` // fixed | rotation
	AssignedMemberID  *string  `json:"assignedMemberId,omitempty"`
	RotationMemberIDs []string `json:"rotationMemberIds,omitempty"`
	Color             *string  `json:"color,omitempty"`
	Icon              *string  `json:"icon,omitempty"`
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
	Title             string   `json:"title"`
	RecurrenceRule    string   `json:"recurrenceRule"`
	AssignmentMode    string   `json:"assignmentMode"`
	AssignedMemberID  *string  `json:"assignedMemberId"`
	RotationMemberIDs []string `json:"rotationMemberIds"`
	Color             *string  `json:"color"`
	Icon              *string  `json:"icon"`
}

type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service { return &Service{db: db} }

// ===== Period math =====

// periodOf returns the [start, end) window of the recurrence period that
// contains day (midnight, in day's location).
func periodOf(rule string, day time.Time) (time.Time, time.Time) {
	y, m, d := day.Date()
	loc := day.Location()
	start := time.Date(y, m, d, 0, 0, 0, 0, loc)
	switch rule {
	case "weekly":
		start = start.AddDate(0, 0, -((int(start.Weekday()) + 6) % 7)) // back to Monday
		return start, start.AddDate(0, 0, 7)
	case "monthly":
		start = time.Date(y, m, 1, 0, 0, 0, 0, loc)
		return start, start.AddDate(0, 1, 0)
	default: // daily
		return start, start.AddDate(0, 0, 1)
	}
}

// nextPeriod advances a [start,end) window to the following one.
func nextPeriod(rule string, start time.Time) time.Time {
	switch rule {
	case "weekly":
		return start.AddDate(0, 0, 7)
	case "monthly":
		return start.AddDate(0, 1, 0)
	default:
		return start.AddDate(0, 0, 1)
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
		start, _ := periodOf(c.RecurrenceRule, from)
		periodIdx := 0
		for !start.After(to) {
			end := nextPeriod(c.RecurrenceRule, start)
			assignee := resolveAssignee(c, periodIdx)
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
			periodIdx++
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
		`SELECT id, title, description, recurrence_rule, assignment_mode,
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
		if err := rows.Scan(&c.ID, &c.Title, &c.Description, &c.RecurrenceRule, &c.AssignmentMode,
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
	if in.RecurrenceRule == "" {
		in.RecurrenceRule = "weekly"
	}
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
		`INSERT INTO chore (id, title, recurrence_rule, assignment_mode, assigned_member_id, rotation_member_ids, color, icon)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.Title, in.RecurrenceRule, in.AssignmentMode, in.AssignedMemberID, rotation, in.Color, in.Icon); err != nil {
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

// ListInstances returns instances whose period overlaps [from, to).
func (s *Service) ListInstances(from, to time.Time) ([]Instance, error) {
	rows, err := s.db.Query(
		`SELECT ci.id, ci.chore_id, c.title, COALESCE(c.color, ''), ci.period_start, ci.period_end,
		        ci.assigned_member_id, ci.status, ci.completed_by, ci.completed_at
		 FROM chore_instance ci JOIN chore c ON c.id = ci.chore_id
		 WHERE ci.period_start < ? AND ci.period_end > ?
		 ORDER BY ci.period_start, c.title`,
		to.Format(dateFmt), from.Format(dateFmt))
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
