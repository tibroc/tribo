// Package todos owns loose to-do items. Both the REST API and MCP server call
// into here.
package todos

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Todo struct {
	ID               string  `json:"id"`
	Title            string  `json:"title"`
	Description      *string `json:"description,omitempty"`
	AssignedMemberID *string `json:"assignedMemberId,omitempty"` // null = family-wide
	DueDate          *string `json:"dueDate,omitempty"`          // YYYY-MM-DD
	Status           string  `json:"status"`                     // open | done
	CompletedAt      *string `json:"completedAt,omitempty"`
	Important        bool    `json:"important"`
	Effort           string  `json:"effort"` // 2min | 5min | standard | heavy
}

type NewTodo struct {
	Title            string  `json:"title"`
	AssignedMemberID *string `json:"assignedMemberId"`
	DueDate          *string `json:"dueDate"`
	Important        bool    `json:"important"`
	Effort           string  `json:"effort"`
}

// ValidEffort reports whether e is one of the effort levels (empty = default).
func ValidEffort(e string) bool {
	switch e {
	case "", "2min", "5min", "standard", "heavy":
		return true
	}
	return false
}

type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service { return &Service{db: db} }

func (s *Service) List() ([]Todo, error) {
	rows, err := s.db.Query(
		`SELECT id, title, description, assigned_member_id, due_date, status, completed_at, importance, effort
		 FROM todo ORDER BY status, sort_order, title`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Todo{}
	for rows.Next() {
		var t Todo
		var imp int
		if err := rows.Scan(&t.ID, &t.Title, &t.Description, &t.AssignedMemberID, &t.DueDate, &t.Status, &t.CompletedAt, &imp, &t.Effort); err != nil {
			return nil, err
		}
		t.Important = imp != 0
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Service) Create(in NewTodo) (*Todo, error) {
	if strings.TrimSpace(in.Title) == "" {
		return nil, errors.New("title is required")
	}
	if !ValidEffort(in.Effort) {
		return nil, errors.New("effort must be one of 2min, 5min, standard, heavy")
	}
	if in.Effort == "" {
		in.Effort = "standard"
	}
	id := uuid.NewString()
	if _, err := s.db.Exec(
		`INSERT INTO todo (id, title, assigned_member_id, due_date, status, importance, effort) VALUES (?, ?, ?, ?, 'open', ?, ?)`,
		id, in.Title, in.AssignedMemberID, in.DueDate, boolInt(in.Important), in.Effort); err != nil {
		return nil, err
	}
	return s.get(id)
}

// SetStatus toggles a todo between open and done, stamping completed_at.
func (s *Service) SetStatus(id, status string) (*Todo, error) {
	if status != "open" && status != "done" {
		return nil, errors.New("status must be open or done")
	}
	var completedAt any
	if status == "done" {
		completedAt = time.Now().Format(time.RFC3339)
	}
	res, err := s.db.Exec(`UPDATE todo SET status = ?, completed_at = ? WHERE id = ?`, status, completedAt, id)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, errors.New("todo not found")
	}
	return s.get(id)
}

// PatchTodo carries optional field changes; nil leaves a field unchanged.
// Empty-string AssignedMemberID clears the assignment; empty-string DueDate
// clears the due date.
type PatchTodo struct {
	Title            *string `json:"title"`
	Status           *string `json:"status"`
	AssignedMemberID *string `json:"assignedMemberId"`
	DueDate          *string `json:"dueDate"`
	Important        *bool   `json:"important"`
	Effort           *string `json:"effort"`
}

// Patch applies the given field changes in a single transaction. Validation
// runs before any write, so an invalid value can't leave a half-applied field
// behind.
func (s *Service) Patch(id string, p PatchTodo) (*Todo, error) {
	if p.Title == nil && p.Status == nil && p.AssignedMemberID == nil && p.DueDate == nil && p.Important == nil && p.Effort == nil {
		return nil, errors.New("nothing to update")
	}
	if p.Title != nil && strings.TrimSpace(*p.Title) == "" {
		return nil, errors.New("title is required")
	}
	if p.Status != nil && *p.Status != "open" && *p.Status != "done" {
		return nil, errors.New("status must be open or done")
	}
	if p.Effort != nil && (!ValidEffort(*p.Effort) || *p.Effort == "") {
		return nil, errors.New("effort must be one of 2min, 5min, standard, heavy")
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	set := func(query string, val any) error {
		res, err := tx.Exec(query, val, id)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return errors.New("todo not found")
		}
		return nil
	}

	if p.Title != nil {
		if err := set(`UPDATE todo SET title = ? WHERE id = ?`, strings.TrimSpace(*p.Title)); err != nil {
			return nil, err
		}
	}
	if p.AssignedMemberID != nil {
		var v any
		if strings.TrimSpace(*p.AssignedMemberID) != "" {
			v = *p.AssignedMemberID
		}
		if err := set(`UPDATE todo SET assigned_member_id = ? WHERE id = ?`, v); err != nil {
			return nil, err
		}
	}
	if p.DueDate != nil {
		var v any
		if strings.TrimSpace(*p.DueDate) != "" {
			v = *p.DueDate
		}
		if err := set(`UPDATE todo SET due_date = ? WHERE id = ?`, v); err != nil {
			return nil, err
		}
	}
	if p.Important != nil {
		if err := set(`UPDATE todo SET importance = ? WHERE id = ?`, boolInt(*p.Important)); err != nil {
			return nil, err
		}
	}
	if p.Effort != nil {
		if err := set(`UPDATE todo SET effort = ? WHERE id = ?`, *p.Effort); err != nil {
			return nil, err
		}
	}
	if p.Status != nil {
		var completedAt any
		if *p.Status == "done" {
			completedAt = time.Now().Format(time.RFC3339)
		}
		res, err := tx.Exec(`UPDATE todo SET status = ?, completed_at = ? WHERE id = ?`, *p.Status, completedAt, id)
		if err != nil {
			return nil, err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return nil, errors.New("todo not found")
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.get(id)
}

// Delete removes a todo outright.
func (s *Service) Delete(id string) error {
	res, err := s.db.Exec(`DELETE FROM todo WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errors.New("todo not found")
	}
	return nil
}

func (s *Service) get(id string) (*Todo, error) {
	var t Todo
	var imp int
	err := s.db.QueryRow(
		`SELECT id, title, description, assigned_member_id, due_date, status, completed_at, importance, effort FROM todo WHERE id = ?`, id).
		Scan(&t.ID, &t.Title, &t.Description, &t.AssignedMemberID, &t.DueDate, &t.Status, &t.CompletedAt, &imp, &t.Effort)
	if err != nil {
		return nil, err
	}
	t.Important = imp != 0
	return &t, nil
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
